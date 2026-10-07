// Details for the chaos engineering plate, part 1: game days, reporting, experiment definition, targeting.
ATLAS.details("chaos-engineering", {
  "game-day-planning": {
    s: "Preparing a scheduled exercise in which a team watches planned failures hit a real system and practices detecting, diagnosing and recovering from them.",
    d: "A plan names the scenarios, the systems in scope, the people who take part, the start and end times, the abort criteria and the questions the exercise should answer. Teams hold a briefing, confirm that dashboards and runbooks are reachable, and tell dependent teams and support that the exercise is happening. The platform loads the scenarios as experiments with approvals in place. It is hard because the exercise must be realistic enough to teach something while being safe enough that nobody is surprised by customer impact.",
    k: ["Announced scenarios vs surprise scenarios: announcing finds missing tooling safely and builds confidence; surprising tests real detection but risks panic and needs strong abort rules.", "Production vs staging: production reveals real behavior and real gaps; staging is safer but often hides the exact interactions that cause outages."],
    p: ["Planning on a busy release week means a real incident overlaps the exercise and nobody can tell which failure is which.", "Skipping the briefing leaves support and neighboring teams treating planned symptoms as a genuine outage."],
    v: "Hold a dry run of a game day: every participant opens the right dashboards, the abort path is exercised once, and the plan lists a named owner for each scenario before the start time.",
    dep: ["scenario-library","experiment-spec","facilitator-roles"]
  },
  "scenario-library": {
    s: "A curated collection of reusable failure scenarios, each describing a realistic situation, the faults that produce it and what a healthy response looks like.",
    d: "Scenarios are written in terms of events people recognize, such as losing a data center, a slow database or an expired credential, and each maps to one or more experiments with default parameters. Entries record the expected symptoms, the runbook that should apply and any past results. Teams add scenarios from real incidents so the library tracks what actually breaks. The challenge is keeping scenarios current: a stale scenario tests an architecture that no longer exists and creates false confidence.",
    k: ["Scenarios from incidents vs scenarios from imagination: incident-based ones are credible and motivating; imagined ones cover gaps no incident has yet exposed.", "Generic scenarios vs service-specific ones: generic ones are reusable across teams; specific ones test the real dependencies and are costlier to maintain."],
    p: ["Scenarios never retired after an architecture change keep passing against a path that no longer exists.", "A library that only contains easy scenarios gives teams a comfortable score and no new knowledge."],
    v: "Pick a scenario written after a past incident and run it against the fixed system: the original symptom must not recur, and the entry must link the incident and the fix.",
    dep: ["experiment-templates","fault-parameters"]
  },
  "facilitator-roles": {
    s: "The defined jobs during an exercise: who runs the platform, who observes, who plays the responders, who can stop everything, and who records what happens.",
    d: "A facilitator drives the schedule and announces each injection. An operator holds the controls. Observers watch the system and the responders without helping. A scribe records times, decisions and surprises. A named safety officer has sole authority to call an abort. Responders act as they would in a real incident, using only their normal tools. The roles keep the exercise from turning into a group debugging session and keep a record that is good enough to reconstruct afterward.",
    k: ["Separate operator and observer vs one person doing both: separation gives a neutral record and faster abort; combining is cheaper but the person at the controls misses what the responders do.", "A single abort authority vs consensus: one authority acts in seconds; consensus is fairer but slow when customers are affected."],
    p: ["Observers who start coaching responders erase the evidence about how well the team really detects a problem.", "No designated abort authority leaves everyone waiting for someone else to call it while impact grows."],
    v: "During a rehearsal, the safety officer calls an abort and the operator stops all faults within the time stated in the plan, with the scribe's log showing both timestamps.",
    dep: ["game-day-planning","abort-controller"]
  },
  "incident-channel": {
    s: "A dedicated communication space where an exercise is run and logged, with the same paging and escalation paths as a real incident but clearly labeled as a test.",
    d: "The channel carries announcements, injection start and stop messages, observations and responder updates. The platform posts experiment events automatically so the channel becomes a time-ordered log. Labels and banners distinguish the exercise from an actual incident, and real paging may be routed to a test destination or marked. If a genuine incident starts, the channel states the stop rule and everyone moves to the real incident process. It is hard because the exercise must feel real without confusing external alerts and customers.",
    k: ["Real paging vs simulated paging: real paging tests the whole chain including phones and escalation; simulated paging avoids waking the wrong people but leaves a gap untested.", "One shared channel vs separate ones for responders and observers: one is simpler to log; separate ones keep observers from influencing responders."],
    p: ["An unlabeled test page that reaches an executive creates a false incident declaration.", "Automated platform messages drowning human messages make the log hard to use afterward."],
    v: "Start a test experiment and confirm that start, each fault change and stop appear in the channel with timestamps, and that a real alert during the exercise carries a visible exercise label.",
    dep: ["game-day-planning","audit-log"]
  },
  "oncall-drills": {
    s: "Short, repeated exercises that inject a failure to train an on-call engineer to find and fix it using the real alerts, dashboards and runbooks.",
    d: "A drill injects one known fault, often with a small blast radius, and measures how long the responder takes to notice, to find the cause and to restore service. The responder is usually a newer engineer with a mentor present. The platform can schedule drills in working hours and record the time taken for each stage. Drills expose runbooks that are outdated, alerts that never fire and dashboards that do not show the failing component, which are findings in their own right.",
    k: ["Frequent small drills vs rare large exercises: frequent drills build habit and expose tooling rot early; large exercises test coordination between teams but happen too rarely to maintain skill.", "Mentor present vs unassisted: a mentor makes learning safe; unassisted tests the real on-call experience."],
    p: ["Repeating the same drill until responders memorize it measures memory rather than diagnostic skill.", "Drills run only in working hours miss the slower detection and tired decisions of a night page."],
    v: "Run a drill with an unannounced single-instance fault: the alert fires, the responder reaches the right runbook, and time to detect and time to recover are recorded in the report.",
    dep: ["scenario-library","experiment-report","process-kill"]
  },
  "experiment-report": {
    s: "The record of one experiment: what was claimed, what was injected, what was measured, whether the hypothesis held and what should change.",
    d: "The report is assembled from the spec, the injection log, the abort events and the measurements. It shows the steady-state metrics before, during and after, marks when each fault began and ended, and states a verdict with its evidence. Humans add observations and an explanation when the result surprised them. It links to findings. The challenge is honesty: a report must show experiments that were aborted, inconclusive or invalid, not only the ones that passed.",
    k: ["Automatic verdict vs human verdict: automatic is consistent and fast; human judgment handles surprising results the metrics did not anticipate.", "Pass/fail vs graded outcome: pass/fail is easy to track; graded outcomes capture degraded-but-acceptable behavior that a binary hides."],
    p: ["Reports that omit aborted runs make the platform look safer and the system look more resilient than they are.", "A verdict written without the measurement window leaves readers unable to check it."],
    v: "Open the report of a completed experiment: the fault start and end times match the injection log, the charts cover the full window, and the verdict follows the stated criteria.",
    dep: ["steady-state-evaluator","audit-log","experiment-annotations","hypothesis-statement"]
  },
  "timeline-reconstruction": {
    s: "A merged, time-ordered view of injections, system events, alerts, deployments and human actions that explains what happened during an experiment.",
    d: "The platform gathers its own injection events, alert firings, traces, deploy events, scaling actions, log markers and chat messages, then aligns them on one timeline. Clock differences between sources are corrected as far as possible. Reviewers use it to see which defense reacted first, which action made things worse and how long each step took. It is hard because sources disagree about time, events have different granularity, and cause and effect are not always in time order.",
    k: ["Event-based timeline vs metric-based timeline: events are precise about what happened; metrics show gradual effects that no single event marks.", "Automatic correlation vs manual annotation: automatic is complete and fast; manual captures human reasoning that systems never log."],
    p: ["Unsynchronized clocks across sources put an alert before its cause and send the analysis in the wrong direction.", "Too many low-value events bury the three that matter."],
    v: "Inject a fault at a known time and confirm the timeline shows the injection, the first alert and the first recovery action in the correct order, with source clocks aligned within the stated tolerance.",
    dep: ["experiment-annotations","trace-correlation","audit-log"]
  },
  "finding-tracker": {
    s: "A queue of the weaknesses an experiment exposed, each with an owner, a severity, a planned fix and a re-test that proves the fix.",
    d: "Every confirmed weakness becomes a tracked item linked to the experiment that revealed it. The item carries the failing behavior, the expected behavior, the affected service and a deadline. When the fix ships, the platform reruns the experiment to confirm closure. The tracker reports aging items so findings do not decay into history. It is hard because owners have competing work, and resilience fixes rarely have a visible product benefit.",
    k: ["Integrated tracker vs the team's existing backlog: integrated keeps experiment context attached; the existing backlog gets read and prioritized with normal work.", "Closing on fix vs closing on re-test: closing on fix is quick; closing on re-test confirms the fix actually works under the original fault."],
    p: ["Findings closed without a re-test leave the original weakness live and the record claiming otherwise.", "A tracker with no severity ranking leads teams to fix the easy findings first."],
    v: "Open a finding, ship its fix, and rerun the linked experiment: the item closes only after the rerun shows the hypothesis holding, with the rerun linked in the item.",
    dep: ["experiment-report","experiment-spec"]
  },
  "resilience-scorecard": {
    s: "A summary per service or team of how many experiments exist, how recently they passed, which are open findings and how the trend is moving.",
    d: "The scorecard aggregates experiment results by owner and service: coverage of known failure modes, last passing run, number of open findings, and time from finding to fix. It is shown on a dashboard and reviewed in operations meetings. The data comes from reports and the tracker. It is hard because a single number invites gaming: a team can raise its score by running easy experiments, so the scorecard must show what was tested, not just how often.",
    k: ["A composite score vs separate measures: a composite is easy to compare; separate measures show where the weakness is and resist gaming.", "Ranking teams vs showing trends per team: ranking motivates but breeds defensiveness; trends encourage honest reporting."],
    p: ["Using the score as a performance target pushes teams to avoid experiments that might fail.", "A scorecard fed only by passing runs shows health that nobody earned."],
    v: "Add a failing experiment to one service and confirm its scorecard changes within one refresh cycle, naming the failing experiment rather than only lowering a number.",
    dep: ["experiment-report","finding-tracker","coverage-map"]
  },
  "coverage-map": {
    s: "A view of which services, dependencies and failure modes have been tested by an experiment, and which have never been.",
    d: "The map combines the dependency map with the experiment history. Rows are services and dependencies; columns are fault classes such as dependency down, slow dependency, node loss and resource exhaustion. Cells show the last result and its age. Gaps show up as blank cells. The platform can suggest experiments for the largest gaps. It is hard because the dependency map is never complete, so a blank area may mean untested or may mean unknown.",
    k: ["Coverage by fault class vs coverage by service: by fault class shows missing kinds of failure; by service shows missing owners; both views are needed.", "Count of experiments vs age of last pass: counts reward volume; age reflects that an old pass says little about a changed system."],
    p: ["A map built from an outdated dependency graph shows full coverage of services that have since changed.", "Counting a trivially small experiment as coverage of a big dependency overstates safety."],
    v: "Add a new service dependency and confirm the map shows an untested cell for it within the dependency-map refresh interval, then run an experiment and confirm the cell turns tested.",
    dep: ["dependency-map","experiment-report"]
  },

  "experiment-spec": {
    s: "The structured document describing one experiment: its hypothesis, targets, faults, schedule, guards and measurement, in a form the platform can validate and run.",
    d: "The spec is data, usually YAML or JSON, with sections for the hypothesis, steady-state checks, targets, a list of fault steps with timing, abort conditions, owner and approvals. The control plane reads it to validate, schedule, execute and report. Because it is stored in version control, changes are reviewed like code. It is hard because it must be expressive enough for real scenarios but strict enough that the safety systems can reason about it without running it.",
    k: ["Declarative spec vs imperative script: declarative lets the platform check safety before running and reconstruct intent; scripts are more flexible but opaque to guards.", "One spec per experiment vs composable fragments: one per experiment is easy to read; fragments avoid duplication but make the effective experiment harder to see."],
    p: ["A spec that references targets by name without checking they still exist silently runs against nothing and reports a pass.", "Fields with defaults hidden from reviewers allow an unexpectedly wide blast radius."],
    v: "Submit a spec and read back the resolved plan: concrete targets, fault steps with absolute times and guard thresholds all appear, with no default left unstated.",
    dep: ["hypothesis-statement","steady-state-definition","fault-parameters","abort-conditions","target-selector"]
  },
  "hypothesis-statement": {
    s: "A written, falsifiable prediction that a named steady-state measure will stay within bounds while a specific fault is present.",
    d: "A good hypothesis is concrete: for example that the success rate of a given request stays above a threshold while one of three replicas is unavailable. It names the measure, the bound, the fault and the duration. Writing it before the run prevents reading the result as support for whatever happened. The platform stores it with the spec and checks the result against it. The difficulty is precision: vague claims such as the system is resilient cannot fail, so they teach nothing.",
    k: ["Quantified bound vs qualitative claim: a bound can be checked automatically and argued about honestly; a qualitative claim is easy to write and impossible to refute.", "One hypothesis per experiment vs several: one gives a clear result; several save setup effort but blur which fault caused which effect."],
    p: ["Setting the bound after seeing the data produces hypotheses that always pass.", "A hypothesis about the average hides the tail latency users actually feel."],
    v: "Read a stored hypothesis and confirm it names a metric, a numeric bound, a fault and a duration, and that the evaluator can compute pass or fail from them with no human input.",
    dep: ["steady-state-definition"]
  },
  "steady-state-definition": {
    s: "The measurable description of normal behavior for the system under test, as metrics and acceptable ranges that define what it means for the system to be healthy.",
    d: "Steady state is chosen from outcomes users or business processes care about, such as successful requests per second, order completion or end-to-end latency, rather than internal signals like CPU use. The definition lists metrics, how they are queried and the allowed deviation from a baseline. It is evaluated before the fault to confirm the system is normal, during the fault to detect harm, and after it to confirm recovery. It is hard because normal varies by time of day, and noisy metrics make small effects invisible.",
    k: ["Outcome metrics vs internal metrics: outcome metrics reflect user harm directly; internal metrics are more sensitive but may move without anyone being affected.", "Fixed thresholds vs baseline-relative bounds: fixed thresholds are simple to explain; baseline-relative bounds follow daily and weekly cycles."],
    p: ["Starting an experiment when the system is already unhealthy lets the fault take the blame for existing problems.", "A metric that is aggregated across regions hides a total failure in one of them."],
    v: "Evaluate the definition on a quiet system with no fault: it must report healthy, and when the underlying metric is manually pushed out of range it must report unhealthy within one evaluation interval.",
    dep: ["metric-ingest","baseline-builder"]
  },
  "fault-parameters": {
    s: "The settings of a fault: its type, magnitude, duration, target scope, and how it starts, changes and ends.",
    d: "Parameters include the amount of latency, the percentage of requests failed, the memory to consume, the ports to block and the duration. Faults may be stepped, for example raising delay in stages. Each fault declares limits, such as a maximum magnitude the safety policy allows. The platform validates them against the target type and the policy. It is hard because the same number means different things in different places: 300 milliseconds of delay is harmless for a batch job and fatal for a tight timeout.",
    k: ["Absolute values vs values relative to the target's own behavior: absolute values are repeatable; relative values such as a multiple of normal latency stay meaningful as the system changes.", "Constant fault vs stepped fault: constant is easy to interpret; stepped finds the exact threshold where behavior breaks."],
    p: ["A duration with no upper limit leaves a fault in place long after anyone has stopped watching.", "Magnitudes copied between environments with different capacity turn a safe test into an outage."],
    v: "Create a fault with a magnitude above the policy maximum and confirm validation rejects it with the specific limit named, before any target is touched.",
    dep: ["spec-validation"]
  },
  "abort-conditions": {
    s: "The declared rules that stop an experiment early: guard metrics crossing limits, error budgets spent, a human request or a conflicting incident.",
    d: "Each experiment lists conditions such as the error rate exceeding a threshold for a given time, a customer-facing alert firing or the experiment running longer than allowed. These are copied into the guard watcher at start. They are distinct from the hypothesis: the hypothesis says what the team expects, and abort conditions say what harm is unacceptable even if the hypothesis fails. The difficulty is choosing thresholds that stop real harm without aborting on ordinary noise.",
    k: ["Tight thresholds vs loose thresholds: tight ones protect users but abort on noise and teach nothing; loose ones let experiments run but allow real damage.", "Duration-based vs instant triggers: requiring a sustained breach avoids false aborts; instant triggers react to a cliff before users notice."],
    p: ["Abort conditions that reuse the hypothesis bound mean a failed hypothesis always aborts, so the system never shows how it behaves in failure.", "Conditions that depend on the system's own monitoring fail exactly when that monitoring is impaired."],
    v: "Run an experiment in a test environment and push a guard metric over its limit: the experiment must stop and revert within the stated time, with the cause recorded as the named condition.",
    dep: ["guard-watcher","abort-controller"]
  },
  "experiment-templates": {
    s: "Pre-built experiment specs for common failures that teams copy and adjust, so they start from reviewed settings rather than a blank file.",
    d: "A template fixes the fault type, a sensible magnitude, duration, abort conditions and a typical steady-state check, leaving only the target and a few parameters to fill. Platform teams maintain templates for things like single-instance loss or a slow dependency. Templates carry defaults that already passed review, so approvals are faster. The challenge is that templates age: an assumption in a default, such as a timeout value, can become wrong as systems change.",
    k: ["Strict templates vs editable templates: strict ones keep safety settings consistent; editable ones fit more cases but let people weaken guards.", "Central ownership vs per-team ownership: central keeps quality uniform; per-team reflects local architecture and gets used more."],
    p: ["Teams use a template without reading the hidden defaults and run it against a service with different capacity.", "Templates never updated after incidents keep testing last year's risks."],
    v: "Create an experiment from a template and diff it against the template: only the target and listed parameters differ, and the guards still carry the template's thresholds.",
    dep: ["experiment-spec","fault-parameters"]
  },
  "experiment-versioning": {
    s: "Keeping each experiment definition in version control with history, so a result can always be traced to the exact spec, guards and templates that produced it.",
    d: "Specs live in a repository, and every run records the commit and the resolved plan. Changes go through code review, which doubles as a safety review. Comparing results across runs requires knowing whether the spec changed. The platform stores the exact spec with each result and warns when a rerun uses a different version. It is hard because resolved values, such as target lists, depend on live state that is not in the repository, so the version alone does not reproduce the run.",
    k: ["Specs in the application repository vs a central repository: in the application repository the owner keeps control and changes alongside code; central makes policy and review uniform.", "Pinned versions vs always-latest: pinning makes results reproducible; always-latest picks up fixes without effort."],
    p: ["Editing a spec in the platform's web form with no history leaves results that cannot be explained later.", "Recording the spec but not the resolved targets makes a rerun test different machines."],
    v: "Open an old report and confirm it links to a commit and a stored resolved plan, and that rerunning that commit shows a diff for any target that has since changed.",
    dep: ["experiment-spec","audit-log"]
  },
  "spec-validation": {
    s: "Automatic checks that a spec is well formed, within policy and likely to do what its author intends, before any fault is injected.",
    d: "Validation checks schema, required fields, target resolution, fault compatibility with the target type, parameter limits, the presence of abort conditions and a bounded duration. Policy rules can forbid fault types in some environments or on some services. A dry run resolves targets and prints the plan without acting. It is hard because many errors are semantic: a spec can be valid yet select the wrong things, so the most useful validation shows the resolved targets for a human to confirm.",
    k: ["Strict rejection vs warnings: rejecting stops unsafe specs reliably; warnings leave experienced engineers room but are often ignored.", "Static checks only vs a dry run against live state: static checks are fast and deterministic; a dry run catches stale targets and unreachable agents."],
    p: ["A validator that checks syntax only lets through a spec whose selector matches every instance.", "Policy rules kept in a different place from the validator drift apart and block valid work or allow invalid work."],
    v: "Submit a spec with a selector matching production, no abort conditions and an unbounded duration, and confirm validation rejects each problem separately with its rule named.",
    dep: ["target-selector","blast-radius-limit","environment-scoping"]
  },
  "approval-workflow": {
    s: "The rules for who must approve an experiment before it runs, depending on environment, fault severity and blast radius.",
    d: "Low-risk experiments in test environments may run on the owner's authority. Production experiments or those with a wide blast radius need approval from the service owner and sometimes a risk or operations lead. The workflow records who approved what, and approvals expire if the spec changes or too much time passes. Standing approvals can cover routine experiments within agreed bounds. It is hard because heavy approval discourages experiments, while light approval makes the platform dangerous.",
    k: ["Per-run approval vs standing approval within bounds: per-run is safe but slows continuous testing; standing approval allows automation but needs reliable bounds checking.", "Approval by owner vs by a central board: owners know the risks; a central board catches cross-team effects owners cannot see."],
    p: ["Approval granted to a spec that is then edited gives the author a stamp for something nobody reviewed.", "Slow approval pushes teams to run faults by hand outside the platform with no guards."],
    v: "Edit an approved spec to widen its target and confirm the approval is withdrawn and the experiment cannot start until re-approved, with both events in the audit log.",
    dep: ["access-control","audit-log","blast-radius-limit"]
  },

  "target-selector": {
    s: "Resolves a description such as tags, service name, zone or label into the concrete set of instances, hosts or routes an experiment will touch.",
    d: "Selectors combine attributes: service, environment, region, version, labels and role. The resolver queries the inventory, the cluster or the cloud API, applies exclusions, then fixes the list for the run so it does not change mid-experiment. It reports the count and identities for review. It is hard because inventories lag reality, so a selector may match an instance that has just been replaced, or miss one that has just started.",
    k: ["Resolve once at start vs re-resolve continuously: resolving once keeps the experiment stable and explainable; continuous resolution follows autoscaling but can widen the blast radius.", "Attribute selectors vs explicit lists: attributes track change automatically; explicit lists are predictable but go stale."],
    p: ["A label used by two teams for different things makes the selector hit a service the author never meant to touch.", "Resolving against a cached inventory selects instances that no longer exist, so the experiment tests nothing."],
    v: "Run a dry-run of a selector and compare its output to a direct query of the real fleet: the same instances must appear, and none from the exclusion list.",
    dep: ["dependency-map","exclusion-lists","environment-scoping"]
  },
  "dependency-map": {
    s: "A graph of which services call which, used to choose targets, predict who will be affected by a fault and spot untested dependencies.",
    d: "The map is built from tracing data, proxy metrics, configuration and declared dependencies. Nodes are services and external resources; edges are calls with volume and criticality. The platform uses it to estimate blast radius, to suggest experiments for a dependency and to warn when a target has many hidden callers. It is hard because dynamic and rarely used calls, such as fallbacks and batch jobs, do not appear in sampled traces.",
    k: ["Observed dependencies vs declared dependencies: observed ones reflect reality but miss rare paths; declared ones capture intent but drift from the code.", "Service-level graph vs instance-level graph: service-level is readable and stable; instance-level shows exact traffic but changes constantly."],
    p: ["An incomplete map makes a fault on a shared component look contained when it has many unseen callers.", "Edges inferred from a short window miss monthly jobs that fail only when the fault hits."],
    v: "Compare the map's callers of one service against a manual audit of its logs over a month: every caller found by the audit must appear, or the gap must be listed as unknown.",
    dep: ["trace-correlation","metric-ingest"]
  },
  "percentage-sampling": {
    s: "Applies a fault to a chosen fraction of requests, connections or instances rather than all of them.",
    d: "A sampler decides per request or per instance whether the fault applies, using a random draw or a stable hash of an identifier so that the same caller sees consistent behavior. Fractions start small, such as one percent, and grow as the guards stay quiet. It is used in proxies, agents and application hooks. It is hard because a small percentage can still be devastating if it hits critical requests, and because statistical measurement of a small fraction needs enough traffic to detect any effect.",
    k: ["Random per request vs stable hash per caller: random spreads impact thinly; stable hashing gives the same callers consistent failures, which tests retries less and tests user-visible degradation more.", "Instance sampling vs request sampling: instance sampling tests loss of capacity; request sampling tests error handling with finer control."],
    p: ["A one percent fault on a payment path still fails real payments at volume.", "Sampling inside a retrying client multiplies the effective failure rate beyond what the setting suggests."],
    v: "Apply a ten percent fault to a known stream of one thousand requests and confirm roughly one hundred are affected, and that the same caller identifier is either always or never affected when hashing is on.",
    dep: ["proxy-fault-filter","traffic-filter"]
  },
  "traffic-filter": {
    s: "Restricts a fault to matching traffic by route, method, tenant, user group or synthetic marker, so real customers are not hit unless intended.",
    d: "Filters examine request attributes available at the injection point: path, headers, caller identity, tenant, region or a marker set by test clients. A common pattern is to inject faults only into requests from internal or synthetic users first, then widen. The filter runs at the proxy, the application hook or the agent. It is hard because attributes must survive the call chain: a header on the first hop may be lost before the faulty dependency is reached.",
    k: ["Synthetic-only traffic vs real user traffic: synthetic is safe but may not exercise real behavior; real traffic reveals true impact but harms real users.", "Filter at the edge vs at the faulty hop: edge filters apply to the whole call chain consistently; hop filters work without propagation but cannot tell callers apart."],
    p: ["A marker header stripped by an intermediary makes the filter match nothing, and the experiment passes without a fault.", "A filter that matches by path alone catches health checks and takes instances out of rotation."],
    v: "Send tagged and untagged requests through the injection point during an experiment: only the tagged ones show the fault, confirmed by response codes or latency in both sets.",
    dep: ["header-targeting","proxy-fault-filter"]
  },
  "blast-radius-limit": {
    s: "Hard caps on how much an experiment may affect: the number or percentage of instances, traffic share, regions and total duration.",
    d: "The platform enforces limits independent of what the spec asks, based on the environment, the service tier and the experimenter's role. Examples are never more than one availability zone, never more than five percent of capacity, never during a freeze. Limits are checked at validation and again as the experiment ramps. They are measured against live capacity, not configuration. It is hard to set them: too low and an experiment cannot reveal capacity problems, too high and it harms users.",
    k: ["Absolute caps vs fraction of capacity: absolute caps are simple; fractions scale with the service but let a large service lose many instances.", "Static limits vs limits that tighten as health degrades: static are predictable; adaptive limits protect better when the system is already stressed."],
    p: ["A cap counted in instances ignores that the remaining instances may already be near capacity.", "Limits applied per experiment, not across all running experiments, allow several small tests to add up to an outage."],
    v: "Request an experiment above the cap in a test environment: it is rejected at validation, and a second experiment that would push the combined total over the cap is queued instead of started.",
    dep: ["concurrency-control","dependency-map","environment-scoping"]
  },
  "ramp-up-controller": {
    s: "Increases a fault in steps, checking guards between steps, so the experiment finds the point of harm without jumping past it.",
    d: "The controller starts with a minimal fault, such as one instance or one percent of requests, waits for a settling period, evaluates the steady-state and guards, and only then moves to the next step. If any check fails, it stops or holds. The step schedule is defined in the spec. It also supports ramping down gracefully. The difficulty is the settling time: some effects, like queue buildup, memory growth or autoscaler reactions, appear minutes after the change, so fast ramps skip them.",
    k: ["Fixed steps vs adaptive steps: fixed steps are predictable and easy to review; adaptive steps reach the threshold faster but are harder to reason about.", "Hold on warning vs continue on warning: holding gives time to look; continuing is faster but risks missing the sign of a breaking point."],
    p: ["A ramp faster than the metric refresh interval makes each step blind to the effect of the previous one.", "Steps that reset the fault completely on each increase hide behavior that only appears with sustained load."],
    v: "Run a three-step ramp against a test service with a known breaking point: the ramp holds at the first step where the guard trips, and the report shows the level at which behavior changed.",
    dep: ["guard-watcher","steady-state-evaluator","fault-parameters"]
  },
  "environment-scoping": {
    s: "Binds each experiment to specific environments and applies different rules to each, so test faults never wander into production unintentionally.",
    d: "Environments such as development, staging and production are labeled in the inventory, and the platform's credentials and agents are separated accordingly. Policy states which faults are allowed where, which approvals apply and which limits hold. Production access is often a separate, audited permission. It is hard because environments leak: shared databases, shared message queues or a staging service calling a production endpoint make a staging fault touch production.",
    k: ["Separate platform instances per environment vs one platform with policy: separate instances prevent cross-over by construction; one instance is simpler to operate and gives a single view.", "Production-first vs staging-first: staging-first lowers risk but hides real traffic effects; production-first with tight limits finds what staging cannot."],
    p: ["A staging service configured with a production endpoint turns a staging experiment into a production incident.", "An environment label set by hand on a new host is wrong or missing, so policy does not apply."],
    v: "Attempt to target a production host with a credential scoped to staging: the request must fail at the platform, not at the target, with the scope violation recorded.",
    dep: ["access-control","target-selector"]
  },
  "exclusion-lists": {
    s: "Named things that no experiment may touch, such as safety-critical systems, the platform's own control plane, systems under investigation or in a freeze.",
    d: "An exclusion list holds services, hosts, tenants or routes that are always excluded, and temporary entries added for a release or incident. The selector subtracts them from every target set, and the validator rejects specs that name an excluded item directly. The platform's own dependencies, such as the metric store and the paging system, belong on the list so a test cannot blind the safety checks. It is hard because the list is only as complete as people's memory of what is critical.",
    k: ["Permanent exclusions vs temporary exclusions: permanent ones encode lasting policy; temporary ones are easy to forget and must expire to avoid blocking tests indefinitely.", "Excluding whole services vs fault types: whole-service exclusion is simple; type-specific exclusion allows safe tests on the same service."],
    p: ["Forgetting to exclude the monitoring path lets one experiment remove the data the guards need.", "Exclusions held in a wiki rather than enforced by the selector are ignored."],
    v: "Add a host to the exclusion list and run a selector that would match it: the dry run omits it and names the exclusion as the reason.",
    dep: ["target-selector","incident-conflict-check"]
  },
});
