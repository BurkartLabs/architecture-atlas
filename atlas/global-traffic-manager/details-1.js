// Details for the global traffic manager plate, part 1: control plane and testing.
ATLAS.details("global-traffic-manager", {
  "endpoint-inventory": {
    s: "The authoritative list of sites, addresses, pools and their attributes such as region, capacity class, owner and lifecycle state, from which every policy and health check is generated.",
    d: "Each endpoint record holds an address or name, its site and region, a pool membership, a weight, a lifecycle state such as provisioning, live, draining or retired, and links to its load balancer and health check. Records are written by operators or synced from a cloud or service registry. Policies refer to pools, never raw addresses, so adding a site is one record. The difficulty is drift: when inventory disagrees with reality, the manager steers users to addresses that no longer exist or ignores capacity that does.",
    k: ["Synced from a registry vs hand-entered: sync removes drift and typos, but a registry bug can delete live endpoints from rotation in one pass.", "Pools referenced by name vs addresses listed in policies: renames and additions are cheap, but a wrong pool edit changes every policy that uses it."],
    p: ["A decommissioned address stays in a pool and receives a share of answers until someone notices the timeouts.", "Lifecycle states are advisory only, so a site marked draining keeps receiving new users."],
    v: "Add a test endpoint in provisioning state and confirm no answer ever contains it. Move it to live and watch it appear in answers within one distribution interval, then retire it and confirm it vanishes.",
    dep: ["config-distribution"]
  },
  "policy-definition": {
    s: "The declarative language or schema in which operators express steering behavior: matching conditions, ordered rules, pools, weights and fallbacks, stored as versioned data.",
    d: "A policy is a document that binds a hostname or service to an ordered set of rules, each with a match on client attributes, a list of candidate pools and a selection method. It is versioned, diffable and reviewed like code. The runtime compiles it into an evaluation plan. The challenge is expressiveness against safety: a language rich enough for real cases allows contradictory rules, unreachable branches and loops of fallbacks that no reviewer can see by reading it.",
    k: ["Declarative rules vs scripted logic: declarative policies can be validated and simulated exhaustively, but awkward cases need new rule types, while scripts handle anything and can hide any bug.", "One policy per hostname vs shared templates: templates keep fleets consistent, but one template edit changes many services at once."],
    p: ["A catch-all rule placed first makes every later rule unreachable, and nothing in production shows it.", "Fallback chains that reference each other produce no answer at all when every site is unhealthy."],
    v: "Load a policy with an unreachable rule and confirm validation flags it. Then evaluate a fixed table of client and health combinations and confirm each returns the expected ordered answer.",
    dep: ["endpoint-inventory"]
  },
  "config-validation": {
    s: "Static and semantic checks that reject unsafe policy changes before they ship, such as empty pools, unreachable rules, missing fallbacks and edits that would move too much traffic at once.",
    d: "Validation runs at submit time and again before each rollout stage. Static checks cover syntax, references and schema. Semantic checks evaluate the new policy against a corpus of recorded or synthetic clients and compare the answers to the current policy, flagging any change in the share of traffic per site above a limit. Some rules are hard blocks, such as never leaving a hostname with zero live answers. The difficulty is coverage: the corpus must reflect real client diversity, or a rule that breaks one network goes unseen.",
    k: ["Blocking rules vs warnings: hard blocks stop catastrophic edits but also stop legitimate emergency changes, so a reviewed override path is needed.", "Diff against recorded traffic vs synthetic clients: recorded traffic reflects reality but ages, while synthetic sets cover rare cases but invite blind spots."],
    p: ["Validation passes against a stale client sample, so a change that shifts a large network to one site looks small.", "An override flag meant for emergencies becomes routine and the checks stop mattering."],
    v: "Submit a change that sends eighty percent of traffic to a single site and confirm it is rejected with the computed shift. Submit a safe edit and confirm it passes with a small reported diff.",
    dep: ["policy-definition", "decision-simulator"]
  },
  "staged-config-rollout": {
    s: "Applies a validated configuration to the answering fleet in stages, such as one canary node, one region, then everywhere, with automatic halt and rollback on error signals.",
    d: "A rollout controller takes a configuration version and assigns it to progressively larger sets of answering nodes, waiting a bake time at each step. It watches signals such as answer error rates, share of traffic per site, query latency and health of the nodes themselves. A regression halts the rollout and restores the previous version. The difficulty is that a bad policy can look healthy at the node level, because the nodes answer fine; the damage is where the answers send users, which only the traffic-share signals show.",
    k: ["Node-by-node canary vs whole-fleet atomic switch: canaries limit blast radius but nodes briefly disagree, so one client may see different answers; atomic switches stay consistent but fail everywhere together.", "Automatic rollback vs human approval: automation reacts in seconds, but may reverse a correct change that coincided with an unrelated incident."],
    p: ["Canary nodes serve few clients from one region, so a policy that breaks another region passes every stage.", "Rollback restores the old policy but not the caches, which keep serving bad answers for a full TTL."],
    v: "Roll out a policy with a deliberate error to one canary node and confirm the controller halts, reverts that node and reports the diverging traffic share, all before the second stage begins.",
    dep: ["config-validation", "config-distribution", "slo-and-alerting"]
  },
  "config-distribution": {
    s: "Moves compiled configuration and endpoint state from the control plane to every answering node and keeps them consistent, versioned and verifiable.",
    d: "The control plane publishes immutable, versioned snapshots. Nodes pull or subscribe, verify a signature and checksum, load the snapshot beside the running one and switch atomically. Each node reports the version it serves, so the controller can see skew across the fleet. Small, frequent updates such as health state travel on a faster path than full policy. The difficulty is partial delivery: unreachable nodes keep an old version, and mixed versions during a change give users different answers.",
    k: ["Pull with polling vs push over a stream: polling is simple and tolerant of restarts, but adds delay; push is fast and needs reconnect and backfill logic.", "Full snapshots vs incremental deltas: snapshots are easy to verify and recover from, while deltas save bandwidth and make a missed update dangerous."],
    p: ["A node that silently stopped receiving updates keeps serving an old policy for days.", "Health updates and policy updates share one channel, so a large policy push delays a failure notice."],
    v: "Publish a new version and confirm every node reports it within the target interval. Block one node's network and confirm the controller flags its version as stale while that node keeps answering.",
    dep: ["config-pubsub", "secrets-and-keys"]
  },
  "operator-overrides": {
    s: "Manual controls that force a site in or out of rotation, pin a policy, or freeze automatic decisions, with scope, expiry and visibility so they cannot be forgotten.",
    d: "Operators need a fast, simple way to act during an incident: drain a site, force an answer, or stop automation from making things worse. Overrides are separate from normal configuration, take effect on the fast path, require a reason, name an owner and expire by default. The evaluation engine treats them as the highest-priority rule. The difficulty is that overrides outlive the incident: a site drained by hand during an outage is still drained months later, silently reducing capacity.",
    k: ["Overrides that expire automatically vs persist until removed: expiry prevents forgotten drains, but can undo a deliberate long-running action at a bad moment.", "Override beats health vs health beats override: manual always wins gives operators control, but forcing traffic to a dead site is possible."],
    p: ["A freeze meant for ten minutes stays on, so real failures are never acted on.", "An override applied at the wrong scope, a whole region instead of one pool, removes far more capacity than intended."],
    v: "Apply a drain override with a thirty minute expiry and confirm answers stop containing the site within one distribution interval. Wait for expiry and confirm the site returns, with both events in the audit log.",
    dep: ["config-distribution", "access-and-audit"]
  },
  "access-and-audit": {
    s: "Role-based permissions over who can change which hostnames, pools and overrides, and an append-only record of every change with author, reason and before-and-after state.",
    d: "Roles scope edit rights by service, environment and kind of change: a team may edit weights for its own hostname but not the root zone. High-risk actions need a second approver. Every change, including automated ones, is logged with identity, timestamp, diff and linked ticket. The log is the main tool for answering what changed before an incident. The difficulty is automation: scripts and pipelines also make changes, and if they all share one service identity the audit trail cannot say who actually asked.",
    k: ["Per-service ownership vs central operator control: ownership scales to many teams, but weaker teams can misconfigure shared infrastructure, while a central team becomes a bottleneck.", "Two-person approval for all vs for risky changes: universal approval slows routine work until it is rubber-stamped, while risk tiers need a good risk definition."],
    p: ["A shared automation credential makes every change appear to come from the same bot.", "Logs stored beside the control plane are lost or unreachable in exactly the outage that needs them."],
    v: "Change a weight as a user with no rights and confirm denial. Make a permitted change and confirm the log shows identity, reason, diff and the exact configuration version it produced.",
    dep: ["secrets-and-keys"]
  },
  "automation-api": {
    s: "A programmatic interface for registering endpoints, changing weights, draining sites and reading state, used by deploy pipelines, autoscalers and incident tooling.",
    d: "Deployment systems call the API to add a new region's addresses, shift weight during a release, or drain before maintenance. It exposes the same validated model as the human interface, so validation, approval and audit apply equally. Calls are idempotent and carry a desired state rather than a sequence of edits, with optimistic concurrency so two pipelines cannot overwrite each other. The difficulty is feedback loops: an autoscaler and a policy ramp that both adjust weights can oscillate without either noticing.",
    k: ["Desired-state declarations vs imperative commands: declarations reconcile after failures and are safe to retry, but make one-time actions such as a drill awkward to express.", "Rate limits per caller vs none: limits stop a runaway script flooding the control plane, but can block a legitimate emergency burst."],
    p: ["Two pipelines write the same pool weights and the last writer silently wins.", "A retry loop on a failed call applies a drain repeatedly after the first success was not acknowledged."],
    v: "Call the same drain request twice and confirm one effect and an unchanged version on the second call. Send two conflicting updates concurrently and confirm one is rejected with a version error.",
    dep: ["config-validation", "access-and-audit", "endpoint-inventory"]
  },
  "failover-drills": {
    s: "Scheduled, controlled exercises that fail a real site or region and check that traffic moves, capacity holds and operators know what to do, repeated often enough to be routine.",
    d: "A drill drains or blocks a site in production on a calendar, with a rollback ready, and records how long traffic took to leave, whether error rates stayed within limits, whether neighbors held the extra load and whether alerts fired. Tiers range from a single pool during off-peak hours to a full region at peak. The result is a measured failover time, not an assumed one. The difficulty is nerve: drills that are too gentle prove nothing, and drills that are too bold risk the outage they rehearse.",
    k: ["Production drills vs staging rehearsals: production shows real caches, resolvers and load, but risks users; staging is safe and cannot reproduce the internet.", "Announced vs surprise drills: announced drills are safer and teach the procedure, while surprise drills test detection and on-call response honestly."],
    p: ["Drills run only at quiet times, so peak-load failover, the case that matters, was never exercised.", "A drill passes because traffic left the drained site, but nobody checked the neighbor's saturation."],
    v: "Drain one region at normal load and read the time until ninety-five percent of requests stop arriving there, the neighbor's peak utilization and the request error rate across the window.",
    dep: ["operator-overrides", "propagation-measurement", "headroom-reserve"]
  },
  "policy-dry-run": {
    s: "Evaluates a proposed policy against live or recorded queries without serving it, and reports how the answers and the share of traffic per site would change.",
    d: "The shadow evaluator runs a candidate configuration alongside production on a sample of real queries, compares its answer with the live one, and aggregates the differences by site, region and network. Output is a table of traffic that would move, such as how many users would change site and by how much expected latency. It runs before any rollout stage. The difficulty is that shadowing sees the query, not the user's follow-on behavior, and cannot predict how caches will smear the change over the next TTL.",
    k: ["Live shadowing vs replay of recorded logs: live reflects the present state, but replay can test failure conditions that are not happening and be repeated.", "Compare answers vs compare modeled outcomes: answer diffs are exact and cheap, but latency or load predictions need a model that can be wrong."],
    p: ["The shadow evaluator uses a different geolocation data version from production, so its report does not match what ships.", "Sampling hides a small but important network, such as a large customer's resolver, entirely."],
    v: "Propose moving a pool's weight from ten to fifty percent and confirm the report predicts a traffic share near fifty percent, then compare with the measured share after the real rollout.",
    dep: ["query-evaluator", "region-score-tables", "dns-query-logging"]
  },
  "decision-simulator": {
    s: "Models a configuration against synthetic scenarios, such as a region failing at peak, to predict where traffic lands and which sites overload before anything is changed.",
    d: "The simulator holds the policies, a capacity model and a demand model by region, then replays failure scenarios: one site dark, a region lost, a resolver population cached for a full TTL. It outputs the traffic share and utilization per site over time, including the delay caused by caches. It is used to size headroom, to validate new policies and to explain results. The difficulty is fidelity: results depend on demand and cache models that are estimates, so output must be read as bounds, not forecasts.",
    k: ["Detailed per-resolver cache modeling vs aggregate decay curves: detailed models predict timing more closely but need data and compute, while aggregates are cheap and miss lumpy resolvers.", "Run the real evaluator vs a reimplementation: the real code guarantees matching decisions, but reimplementations run faster and drift."],
    p: ["The demand model reflects an average day, so the simulated failover at peak looks safe when it is not.", "A simulator built on a separate rule implementation silently disagrees with production after a policy feature is added."],
    v: "Simulate the loss of the largest region and compare predicted per-site utilization to the measurements from a real drill of the same scenario, accepting only small deviations.",
    dep: ["capacity-model", "query-evaluator", "resolver-behavior"]
  },
  "fault-injection": {
    s: "Deliberately breaks health endpoints, probes, links or data feeds in a controlled way to check that detection, damping and fallbacks behave as designed.",
    d: "Injection tools make a health endpoint return errors, add latency to a path, drop the prober's view of a site, corrupt a measurement feed or freeze the control plane, each scoped to a test pool or a small share of traffic. The expected reaction is written down beforehand: a site should drain after a stated number of failed probes, and a corrupt feed should be rejected, not applied. The difficulty is that the interesting faults are partial and slow, which are harder to inject than outages.",
    k: ["Injecting at the target vs at the prober: failing the target tests the whole path, but injecting at the prober isolates false-alarm behavior without affecting users.", "Continuous low-rate injection vs occasional large experiments: continuous injection catches regressions quickly, but adds steady noise to the signals."],
    p: ["Only clean outage faults are injected, so flapping, partial packet loss and slow responses are never tested.", "The experiment lacks a stop control, and a fault meant for one pool spreads to production pools."],
    v: "Inject a thirty percent error rate on one site's health endpoint and confirm the site is marked degraded and weighted down, not drained, matching the written expectation, then stop the fault and confirm recovery.",
    dep: ["probe-checks", "health-thresholds", "operator-overrides"]
  },
  "propagation-measurement": {
    s: "Measures how long a change takes to reach real clients: how fast traffic leaves a drained site and how long old answers keep arriving after the TTL has passed.",
    d: "After a change, the system watches the request rate at each site and plots it against time. The curve is not a step: most traffic moves within a TTL, a tail follows resolvers that ignore or extend the TTL, and long-lived connections linger. From the curve it derives practical numbers such as time to fifty, ninety-five and ninety-nine percent. These replace the configured TTL as the real failover time in planning. The difficulty is separating propagation from ordinary traffic changes and from retries.",
    k: ["Measuring at the sites vs at the clients: site rates are exact and always available, but client-side beacons show what users actually saw, including cache and connection effects.", "One headline number vs a distribution: a single figure is easy to set as a target, while a tail hides in it and drives the real outage length."],
    p: ["A target is written as the TTL value, while the long tail of non-compliant resolvers extends exposure for many multiples of it.", "Drained-site traffic includes persistent connections that never re-resolve, and the curve flattens above zero indefinitely."],
    v: "Drain a pool with a sixty second TTL and plot requests per second against time. Confirm the time to ninety-five percent and the residual after ten minutes are recorded in the drill report.",
    dep: ["ttl-selection", "dns-query-logging", "telemetry-pipeline"]
  },
  "decision-tracing": {
    s: "Records, for any sampled query, which rules matched, which candidates were filtered and why, and the final answer, so a surprising result can be explained afterward.",
    d: "The evaluator can emit a trace for a request: the client attributes it resolved, the policy version, each rule's match result, each pool's health and weight at that instant, and the chosen answer. Traces are sampled at a low rate and always kept for override and error cases. Operators also replay a query on demand against current or historical state. The difficulty is cost and privacy: traces carry client addresses, and detailed traces at full query rate are too large to store.",
    k: ["Always-on sampling vs on-demand tracing: sampling gives history for incidents that were not anticipated, but costs storage; on-demand costs nothing until needed and misses what already happened.", "Raw client addresses vs truncated prefixes in traces: raw addresses allow exact reproduction, while prefixes reduce exposure and blur debugging."],
    p: ["The trace records the policy version but not the health state at that moment, so the decision cannot be reproduced.", "Trace data is retained indefinitely and becomes a store of client addresses nobody governs."],
    v: "Pick a query from the logs, request its trace and confirm the recorded rule path reproduces the same answer when replayed against the stored policy and health snapshot from that moment.",
    dep: ["query-evaluator", "health-state-store", "telemetry-pipeline"]
  },
  "slo-and-alerting": {
    s: "Service objectives for answer availability, steering correctness and failover time, with alerts that fire on user impact such as traffic going to unhealthy sites, not just on component failure.",
    d: "Objectives cover the answering fleet's availability and latency, the share of answers sent to a site that was unhealthy at that moment, the age of health and measurement data, and measured failover time. Alerts trigger on symptoms: traffic to a drained site, a sudden shift in site shares, stale inputs, or configuration skew between nodes. Pages go to the on-call engineer with a link to the relevant trace and runbook. The difficulty is that a manager can be fully up and still steering wrongly, which component metrics never show.",
    k: ["Alert on traffic distribution vs on component health: distribution alerts catch wrong answers from healthy components, but need a baseline that moves with daily and seasonal patterns.", "Tight thresholds vs wide: tight alerts catch drift early and page at night for noise, while wide ones miss slow degradation."],
    p: ["Only the nameservers' uptime is measured, so a week of answers pointing at a degraded site never alerts.", "Alert thresholds for traffic shares are static and fire at every nightly traffic shift until ignored."],
    v: "Force a pool to send twenty percent of answers to a drained site and confirm an alert fires within the stated minutes, naming the pool, the share and the configuration version.",
    dep: ["telemetry-pipeline", "decision-tracing"]
  },
  "runbooks-and-postmortems": {
    s: "Written procedures for common failures and a habit of reviewing every incident, so knowledge about how steering behaves ends up in checked-in instructions and tests.",
    d: "Runbooks give an on-call engineer exact steps and commands for cases such as a region outage, a bad policy push, stale health data, a resolver population ignoring TTLs and a control plane partition, with the signals that confirm each. After each incident a blameless review records the timeline, which signals were seen late, and actions with owners. Findings feed new alerts, drills and validation rules. The difficulty is upkeep: runbooks rot as the system changes, and an out-of-date command is worse than none.",
    k: ["Runbooks as executable scripts vs prose: scripts are tested and fast to run, but need maintenance and hide judgment; prose carries reasoning and is easy to misread under stress.", "Review every incident vs only major ones: reviewing all builds knowledge and costs time, while major-only misses the near-misses that predict them."],
    p: ["A runbook step refers to a console or flag that was renamed months ago.", "Action items from reviews are recorded, never scheduled, and the same failure recurs."],
    v: "Have an engineer who has not seen the system follow a runbook during a drill and confirm every command works unchanged. Count review actions closed within the agreed period.",
    dep: ["failover-drills", "operator-overrides"]
  },
});
