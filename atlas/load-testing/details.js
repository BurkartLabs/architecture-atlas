// Details for the load testing plate, part 1: reporting, thresholds, authoring, workload models.
ATLAS.details("load-testing", {
  "live-dashboard": {
    s: "A continuously updating view of throughput, latency percentiles, error rate and active users while a test runs, so operators can stop a bad run early.",
    d: "The dashboard reads the metrics pipeline on a short refresh interval and plots rates, percentiles and error counts against the configured load profile. Its main job is to answer one question during the run: is the target behaving, and is the generator itself healthy? That makes generator CPU and lag first-class panels beside target latency. It is hard because the data arrives late and in pieces from many generators, so the newest few seconds are always incomplete.",
    k: ["Push streaming versus polled snapshots: streaming feels immediate but needs a connection per viewer; polling is simple and cacheable but adds seconds of delay.", "Showing planned load next to achieved load versus achieved only: the overlay exposes a saturated generator at once, at the cost of a busier chart."],
    p: ["The most recent bucket is partial, so percentiles dip or spike at the right edge and operators react to a phantom.", "Averages shown by default hide the tail, and a run looks healthy while one user in a hundred waits many seconds."],
    v: "Start a test with a known ramp and confirm the achieved-load line tracks the planned line, then inject a one-second server stall and confirm the high percentiles rise within a few refresh intervals.",
    dep: ["time-series-store","histogram-merging","percentile-charts"]
  },
  "run-report": {
    s: "The finished summary of one test run: configuration, load shape, latency distribution, errors, threshold results and the environment it ran against.",
    d: "At the end of a run the tool freezes the stored data and renders a document with the test definition, versions of the target and the tool, the achieved load profile, per-scenario and per-request latency distributions, error breakdowns and the verdict. A report that omits the conditions of the run cannot be compared later. It is hard because every number needs its context: what was excluded as warm-up, how many requests were dropped, and whether the generators were healthy.",
    k: ["Self-contained snapshot versus live link to stored data: a snapshot survives data expiry and can be attached to a release, but it is large and frozen.", "One summary number per request type versus full distributions: a single number is easy to read, but distributions show the bimodal behavior that averages erase."],
    p: ["A report lists a pass without recording the target's build or configuration, so nobody can tell later what was actually tested.", "Excluded warm-up or dropped samples are not stated, and a reader assumes every request was counted."],
    v: "Open a report from a month-old run and confirm it names the target build, test definition version, load profile, exclusions and generator health without consulting any other system.",
    dep: ["histogram-recorder","error-classification","pass-fail-evaluator","time-series-store"]
  },
  "percentile-charts": {
    s: "Charts that show latency as percentile curves or time-sliced percentile bands instead of averages, so the tail behavior of the target is visible.",
    d: "The tool renders p50, p90, p99 and higher percentiles over time, and often a full distribution curve on a logarithmic axis for a whole run. Percentiles come from merged histograms, never from averaging per-interval percentiles, which gives a wrong answer. The plot should state its bucket resolution. It is hard because high percentiles need many samples to be stable: p99.9 over a ten-second window with a hundred requests is one request, not a statistic.",
    k: ["Percentile lines over time versus a whole-run distribution curve: lines show when problems occurred, curves show how bad the worst cases were; most reports need both.", "Logarithmic versus linear axes: log axes reveal the tail but make small differences look large and mislead casual readers."],
    p: ["Per-interval percentiles are averaged to make a run-level number, which understates the tail and is not mathematically valid.", "A high percentile is plotted from too few samples, producing noisy spikes that trigger false alarms."],
    v: "Feed a known synthetic distribution, with one percent of requests at ten times the median, and confirm the p99 line sits at that slow value while the average barely moves.",
    dep: ["histogram-merging","histogram-recorder"]
  },
  "run-comparison": {
    s: "Side-by-side comparison of two or more runs, showing differences in latency, throughput and errors, and whether those differences exceed normal run-to-run variation.",
    d: "The tool aligns runs by scenario and request name, overlays their distributions, and reports deltas with context. A good comparison checks that the runs are comparable first: same load shape, same data, same environment class, same generator capacity. It then reports differences relative to observed variance, not just raw percentages. It is hard because two runs differ in many ways at once, and a regression in the target can be indistinguishable from a different generator host.",
    k: ["Strict comparability checks versus allowing any pair: refusing mismatched runs prevents false conclusions but frustrates people with legitimate reasons to compare.", "Raw deltas versus deltas scaled by variance: scaled deltas avoid chasing noise but need several baseline runs to compute."],
    p: ["Runs with different ramp profiles are compared at matching times, so one run is at full load while the other is still warming up.", "A ten percent latency change is declared a regression when the baseline itself varies by fifteen percent."],
    v: "Compare two runs of an unchanged build and confirm the report shows differences inside the noise band; then add a deliberate delay to the target and confirm the comparison flags exactly the affected requests.",
    dep: ["run-history","noise-and-variance","percentile-charts"]
  },
  "report-export": {
    s: "Exporting results in machine-readable and printable formats so other tools, tickets and dashboards can consume them without scraping the tool's own interface.",
    d: "Exports include summary files in common structured formats, raw or aggregated samples for external analysis, and rendered documents for people. A stable schema with versioning lets downstream tools keep working across releases. The export must carry units, percentile definitions and timestamps with a stated time zone. It is hard because raw samples from a long run are huge, so the tool must choose between full fidelity, histograms and summaries.",
    k: ["Raw samples versus histograms in the export: raw data allows any analysis later but costs gigabytes; histograms are compact but fix the questions you can ask.", "A versioned schema versus a format that evolves freely: versioning keeps consumers working but slows adding fields."],
    p: ["Latency is exported without a unit, and one consumer reads milliseconds as seconds.", "A field is renamed in a release and a pipeline that parses the output silently starts gating on empty values."],
    v: "Export a run, load the file with an independent tool, and confirm its totals, percentiles and error counts match the report to within the histogram resolution.",
    dep: ["run-report","raw-sample-archive","histogram-merging"]
  },
  "run-annotations": {
    s: "Timestamped notes and event markers on a run: deployments, configuration changes, injected faults and operator actions, shown on every chart.",
    d: "Annotations come from the test itself (stage boundaries, ramp steps), from the operator, and from external systems such as a deploy pipeline that posts an event to the timeline. They are stored beside the metrics with the same clock. They let a reader attribute a latency step to an event instead of guessing. It is hard because the timestamps from different systems disagree slightly, and an annotation placed a minute off blames the wrong change.",
    k: ["Automatic events only versus operator notes too: automatic markers are consistent but miss human context such as a manual restart of the target.", "Stored with the run versus overlaid from the monitoring system: storing keeps the run self-contained, overlaying avoids duplicating data."],
    p: ["A deploy marker uses the pipeline's clock, which is two minutes fast, so the chart blames the wrong stage.", "Annotations are not carried into exports, so the report loses the explanation for a visible spike."],
    v: "Trigger a labeled event at a known moment and confirm its marker appears on the charts at that moment in the generator's timeline, within the clock-sync tolerance.",
    dep: ["time-series-store","clock-sync","run-markers"]
  },
  "run-history": {
    s: "The stored record of past runs with their definitions, results and environments, kept long enough to establish baselines and trends.",
    d: "Every run is saved with its test version, parameters, target build, environment, generator configuration, summary and pointers to raw data. Retention policy keeps summaries long and raw samples short. The store answers queries like the last ten runs of this test on this branch. It is hard because metadata matters as much as numbers: without target build and environment recorded, a long history of results cannot be interpreted.",
    k: ["Indefinite summaries with short raw retention versus uniform retention: tiered retention bounds cost while keeping trends, but old runs cannot be reanalyzed.", "Free-form tags versus a fixed metadata schema: tags are flexible, but queries fail when people spell them differently."],
    p: ["Runs are saved without the target's build identifier, so a trend line cannot be tied to any change.", "Raw samples expire before an incident review needs them, leaving only summaries that hide the tail."],
    v: "Select a run from three months ago and confirm its definition, target build, environment and summary load, and that a comparison against today's run is allowed.",
    dep: ["time-series-store","tags-and-labels"]
  },
  "alerts-and-notifications": {
    s: "Messages sent to people or chat and ticket systems when a run starts, ends, fails a threshold or when the generators themselves misbehave.",
    d: "The tool emits events for lifecycle changes and for rule violations, delivering them through webhooks, email or chat integrations. Messages include a link to the run, the verdict and the first failing rule. Notices about a generator's own overload are separate from notices about the target, since they mean different things. It is hard because tests run unattended at night, so the notice must carry enough context to be acted on, without flooding a channel with every minor breach.",
    k: ["Notify on every threshold breach versus once per run: per-breach messages are timely but flood channels; per-run messages are quiet but late.", "Webhooks to any receiver versus built-in integrations: webhooks are universal, but each team writes its own formatting."],
    p: ["A flapping threshold sends hundreds of messages and the channel is muted, so the genuine failure is missed.", "The generator overload warning is worded like a target failure, and the team debugs a healthy service."],
    v: "Run a test that deliberately fails one threshold and confirm exactly one message arrives with the run link, the failing rule and its observed value.",
    dep: ["pass-fail-evaluator","generator-health-monitor"]
  },
  "threshold-rules": {
    s: "Declarative limits on measured values, such as p95 latency below a bound or error rate below a fraction, that define what a passing run means.",
    d: "A rule names a metric, an aggregation (a percentile, a rate, a count), optional filters by scenario or tag, and a limit. Rules are written in the test definition so they version with the test. They can apply to the whole run or to a time window. It is hard because the limit must come from somewhere: an invented round number is either so loose that real regressions pass or so tight that the test fails on noise.",
    k: ["Absolute limits versus limits relative to a baseline: absolute limits express requirements but go stale; relative limits track the system but hide slow drift.", "Rules over the whole run versus per stage: whole-run rules are simple but let a bad stage average away; per-stage rules catch it but multiply rules to maintain."],
    p: ["A rule on average latency passes while the p99 doubles, because the average was chosen for being easy to read.", "A threshold on error rate counts only HTTP status codes, so failures that return a successful status with an error body pass."],
    v: "Run the test against a build with a known added delay and confirm the rule fails; run it against the previous build and confirm it passes on repeated runs.",
    dep: ["histogram-recorder","error-classification","slo-mapping"]
  },
  "pass-fail-evaluator": {
    s: "The component that evaluates every threshold rule against final or rolling data and produces the verdict, exit code and a list of the rules that failed.",
    d: "It reads the aggregated metrics, applies each rule with its filters and window, and records observed value, limit and result. The overall verdict combines the rules, usually requiring all to pass. The tool turns the verdict into a process exit code and a report section so a pipeline can gate on it. It is hard because a verdict can also be invalid: a run where the generators were saturated or too few requests were sent should be marked inconclusive, not passed.",
    k: ["Two outcomes versus pass, fail and inconclusive: three outcomes stop an invalid run from passing silently, but pipelines must decide what to do with inconclusive.", "Evaluating at the end versus continuously: end-only is simple and uses complete data; continuous evaluation enables early abort but is sensitive to partial data."],
    p: ["A run in which the generator hit its CPU limit passes because the throttled traffic was easy for the target.", "A rule that matches no requests, because a name changed, evaluates to nothing and counts as pass."],
    v: "Run a test where a rule's filter matches no samples and confirm the evaluator reports it as an error or inconclusive, not as a pass; run one with a known failing rule and confirm a non-zero exit code.",
    dep: ["threshold-rules","histogram-merging","generator-resource-guard"]
  },
  "abort-on-fail": {
    s: "Stopping a test as soon as a threshold is clearly breached, to save time and avoid pushing a failing target into a worse state.",
    d: "Selected rules are marked to abort the run when violated, usually after a grace period so that a startup spike does not end the test. The coordinator then stops the generators in an orderly way, flushes remaining samples and writes the report with the reason. It is hard because deciding that a breach is real, not a transient blip, requires enough samples and a sustained window, and stopping too early loses the data that explains the failure.",
    k: ["Abort immediately versus after a sustained window: immediate abort saves the most time but triggers on blips; a window is steadier but lets damage continue.", "Abort the whole run versus stopping only the failing scenario: whole-run abort is simple, while partial abort keeps useful data from healthy scenarios."],
    p: ["An abort rule fires during warm-up, when the target is cold, and the team never gets a result.", "Generators stop but the final samples are not flushed, so the report omits the moments around the breach."],
    v: "Configure an abort rule and run against a target that begins failing at a known time; confirm the run stops within the sustained window, with a report that contains the failure period.",
    dep: ["pass-fail-evaluator","coordinator","warm-up-exclusion"]
  },
  "baseline-comparison": {
    s: "Judging a run against a stored reference run or a set of reference runs, instead of against fixed numbers.",
    d: "The tool selects a baseline, often the last accepted run on the main branch, and compares per-request percentiles and error rates with an allowed margin. A set of baseline runs gives an estimate of normal variation. The baseline is updated when a change is accepted. It is hard because baselines drift: if each run is compared only with the previous one, a ten percent slowdown per release passes every time and accumulates.",
    k: ["Comparing to the previous run versus a fixed accepted baseline: previous-run is current but allows creeping regressions; a fixed baseline catches drift but needs deliberate updates.", "One baseline run versus several: several quantify noise but cost more test time and storage."],
    p: ["The baseline run was itself degraded by a noisy neighbor, so every later run looks like an improvement.", "The baseline is never refreshed after an intended change, and every run fails until someone loosens the margin."],
    v: "Run the same build five times against the baseline and confirm all pass; then run a build with a known five percent slowdown and confirm it is flagged once the margin is below that.",
    dep: ["run-history","noise-and-variance","threshold-rules"]
  },
  "regression-detection": {
    s: "Statistical detection of changes in performance across many runs over time, so slow drift and small shifts are caught even when each run passes.",
    d: "The tool keeps a series of results per scenario and applies change-point detection or a statistical test between recent runs and an earlier window. It reports the run where the shift began, linking it to the changes between runs. It is hard because performance data is noisy and not normally distributed, and because many scenarios multiplied by many metrics produces false positives unless the tests are corrected for it.",
    k: ["Statistical tests versus fixed percentage margins: tests adapt to variance but are harder to explain; fixed margins are clear but too loose for stable tests and too tight for noisy ones.", "Detecting on every run versus on a schedule: every-run catches shifts sooner but at more cost and more false alarms."],
    p: ["Dozens of metrics are tested per run with no correction, so some alarm every night and the alerts are ignored.", "A shift is detected but runs lack the target build identifier, so no one can find the responsible change."],
    v: "Replay a stored series with a known five percent step inserted at run 40 and confirm the detector flags the step within a few runs and the unmodified series produces no alert.",
    dep: ["run-history","noise-and-variance","tags-and-labels"]
  },
  "slo-mapping": {
    s: "Tying thresholds to the service-level objectives the business cares about, so a pass means the objective holds under the tested load.",
    d: "An objective such as 99 percent of checkouts under a second for a stated load becomes a rule over a named scenario, a percentile and a load level. The mapping documents which objectives the test covers and which it does not. It is hard because production objectives are measured over weeks of real traffic, while a test lasts minutes with synthetic traffic, so the comparison is only meaningful if the test's workload and data resemble production.",
    k: ["Rules derived from objectives versus rules from past results: objective-derived rules express requirements but may be unreachable; past-result rules are achievable but encode current weakness.", "A margin below the objective versus the exact objective: a margin leaves headroom for test noise, at the cost of failing builds that would meet the objective."],
    p: ["The test measures the objective at one tenth of production load, so the passing result says nothing about peak.", "An objective's definition of good request differs from the test's check, and the two disagree about error rate."],
    v: "Pick one objective, compute its value from production data for a comparable load window, run the mapped test, and confirm the two agree within the noise band.",
    dep: ["threshold-rules","scenario-mix","checks-and-assertions"]
  },
  "noise-and-variance": {
    s: "Measuring and accounting for run-to-run variation so thresholds and comparisons do not fail on randomness that has nothing to do with the target.",
    d: "Sources of variation include noisy neighbors on shared hosts, cold caches, garbage collection and background jobs in the target, and network jitter. The tool can repeat runs, report the spread, discard outliers by rule, and require a minimum sample count. It is hard because eliminating noise is impossible, and the tool has to pick between averaging many runs, which is slow, and trusting one run, which is noisy.",
    k: ["Repeating runs and taking the median versus a single longer run: repeats expose variance directly but cost setup each time; a long run is cheaper but hides run-level effects.", "Trimming outliers versus keeping all samples: trimming stabilizes results but can hide a real intermittent stall."],
    p: ["Outliers are discarded automatically, and the occasional ten-second stall that real users hit never appears in any report.", "Variance is measured on a quiet night and applied to daytime runs where a shared environment is busier."],
    v: "Run an unchanged build ten times and confirm the reported spread of p95 matches the observed spread, and that a threshold margin set above it does not fail across all ten.",
    dep: ["run-history","histogram-recorder"]
  },
  "scenario-scripting": {
    s: "Writing a user journey as code or declarative steps: the requests, their order, branches, loops and checks that one virtual user performs.",
    d: "A scenario is a function or a sequence of steps describing one user session, calling protocol clients and using data and checks. Scripts are kept in version control with the application. A good scripting model is readable by developers, deterministic given its data and cheap to run in large numbers. It is hard because scripts accumulate state and branching logic until they become a second implementation of the client, which nobody maintains.",
    k: ["Code-based scripting versus a graphical or declarative format: code is flexible and reviewable but needs programmers; declarative formats are simpler but hit limits on conditional logic.", "Scenarios that mirror full user journeys versus focused single-endpoint scenarios: journeys are realistic but hard to diagnose; focused tests isolate a component but miss interaction effects."],
    p: ["A script silently swallows errors in a step and carries on, so a broken login still produces apparent throughput.", "A scenario grows long and branching, and a change to one branch breaks distribution of traffic across the others."],
    v: "Run the scenario with one virtual user and confirm in the target's access log that the requests arrive in the intended order with the intended parameters.",
    dep: ["script-runtime","http-client","checks-and-assertions","data-parameterization"]
  },
  "traffic-recorder": {
    s: "A proxy or capture tool that records real client sessions and converts them into a draft scenario to start from.",
    d: "The recorder sits between a browser or app and the target, capturing requests, headers, bodies and timing. It filters out static assets or third-party calls and writes a scenario with the requests in order. It is a starting point, not a result: recorded scripts contain hard-coded session identifiers, expiring tokens and values that must be turned into parameters. It is hard because encrypted and signed traffic needs the proxy to terminate TLS, and modern clients make many calls the user never sees.",
    k: ["Recording from a browser versus from server logs: browser recording captures the real call sequence, but logs capture production variety without modification of any client.", "Raw replay versus conversion into a clean scenario: raw replay is quick but brittle; conversion costs effort and produces tests that survive change."],
    p: ["A recorded script embeds a session token that expires in an hour, and every virtual user replays a dead login.", "Recordings capture personal data from a real session, which is then committed with the test."],
    v: "Record a short session, replay it with one virtual user against a fresh environment, and confirm the responses match the original, apart from the values that should vary.",
    dep: ["scenario-scripting","tls-handling","dynamic-value-extraction"]
  },
  "request-templates": {
    s: "Reusable definitions of requests, with headers, body structure and variable slots, shared by scenarios so common calls are written once.",
    d: "A template names a call, its method and path pattern, headers, and a body with placeholders filled from parameters or extracted values. Scenarios reference the template and supply the values. This keeps authentication headers and content types in one place and lets a change to an API be fixed once. It is hard because templates hide the actual wire format, so bugs where a placeholder is empty or double-encoded show up only in the target's error responses.",
    k: ["Templates generated from an API description versus hand-written ones: generated templates track the interface but may not reflect how real clients call it; hand-written ones do but drift.", "Strict validation of placeholders versus permissive filling: strict failures stop a bad run early; permissive filling sends malformed requests that distort results."],
    p: ["A placeholder that fails to expand sends the literal braces to the target, which responds quickly with errors, making latency look excellent.", "Headers shared through a template are altered for one scenario and affect all the others."],
    v: "Render every template with sample data and compare the output against the target's API contract, confirming that no placeholder remains and required headers are present.",
    dep: ["data-parameterization","http-client","checks-and-assertions"]
  },
  "checks-and-assertions": {
    s: "Conditions evaluated on each response, such as status, body content or size, that decide whether the request counts as a success.",
    d: "A check inspects a response and records pass or fail without necessarily stopping the user. Checks are cheap predicates over status, headers, body text or parsed fields. Results feed the error rate and thresholds. It is hard because the check must be strict enough to catch a degraded target that returns fast error pages, yet cheap enough that parsing every body does not consume the generator's CPU and distort timing.",
    k: ["Status-only checks versus body checks: status checks are nearly free but accept a fast error page; body checks catch wrong content but cost CPU and memory.", "Check failures that abort the user versus those that continue: aborting avoids pointless follow-on requests, continuing keeps the load constant."],
    p: ["Only HTTP status is checked, so a target that returns 200 with an empty error body appears fully healthy.", "A body check runs a heavy parse on every response, and the generator becomes the bottleneck."],
    v: "Point the test at a stub that returns 200 with a wrong body and confirm the check failures show up in the error rate and fail the related threshold.",
    dep: ["response-validation","error-classification"]
  },
  "shared-modules": {
    s: "Libraries of common steps, such as login or checkout, imported by many scenarios so a change to a flow is made in one place.",
    d: "Modules package repeated flows, helper functions and common data access, and are versioned along with the tests. Scenarios compose them. The module boundary is where the tool's runtime loads code, so it should support imports without large startup costs per virtual user. It is hard because shared code couples every test: a change to a login module alters the load profile of every scenario that uses it.",
    k: ["Many small shared modules versus copy-and-adapt per test: sharing removes duplication but couples tests; copying isolates changes but lets flows diverge from the real application.", "Loading modules once per generator versus per virtual user: once saves memory and startup but requires that modules hold no per-user state."],
    p: ["A shared helper holds mutable state, so virtual users overwrite each other's tokens.", "A change to a shared login flow silently adds a request to every scenario, raising load beyond what the plan states."],
    v: "Change a shared module's request count, run two dependent scenarios, and confirm the request totals in the report reflect the change, then check that no per-user state leaks between users.",
    dep: ["script-runtime","scenario-scripting"]
  },
  "config-as-code": {
    s: "Keeping the whole test definition, including load shape, thresholds and environment settings, in version-controlled files that tooling can validate.",
    d: "Options for load profile, duration, thresholds, tags and target addresses are declared in files beside the scripts. The tool validates them before starting and records the resolved configuration in the report. Environment-specific values come from variables rather than from edits. It is hard because the same definition must run on a laptop and in a pipeline, so defaults, overrides and secrets need a clear precedence.",
    k: ["Files in the repository versus a settings screen in a web interface: files give review, history and reproducibility; interface settings are quicker for exploration but unreviewable.", "Command-line overrides allowed versus fixed definitions: overrides help debugging, but a pipeline run that differs from the file is not reproducible from it."],
    p: ["An override on the command line changes the load, but the report shows only the file's values.", "Secrets are placed in the definition file and published with the repository."],
    v: "Run the same definition twice with the resolved configuration recorded, then rerun from only the recorded configuration and confirm the load shape and thresholds are identical.",
    dep: ["threshold-rules","ramp-profiles","run-history"]
  },
  "cli-and-ci-entry": {
    s: "The command-line interface that starts a test, streams its progress and returns an exit code, so a pipeline treats a load test like any other step.",
    d: "The entry point loads the definition, validates it, starts the run locally or on remote generators, prints a summary and exits with a code reflecting the verdict. It supports non-interactive mode, machine-readable output and clean handling of interrupts. It is hard because CI runners are small and shared, so a test that works on a developer machine may be limited by the runner's own resources, and the tool must say so.",
    k: ["Run generators on the CI host versus dispatch to separate generators: running locally is simple but limits scale and adds noise; dispatching scales and isolates but needs infrastructure.", "Exit code for verdict only versus distinct codes for failure types: distinct codes let pipelines react differently to a bad test and a failed threshold, but need documenting."],
    p: ["The CI runner is the bottleneck, and the test passes with fewer requests than planned.", "An interrupt kills the process without flushing samples or notifying remote generators, leaving them running."],
    v: "Run the command in a clean CI container, confirm a failing threshold yields a non-zero exit code, and that sending an interrupt mid-run stops all generators and still writes a partial report.",
    dep: ["config-as-code","coordinator","pass-fail-evaluator"]
  },
  "open-workload-model": {
    s: "A workload in which new users arrive at a set rate regardless of how fast the target responds, so a slow target accumulates concurrent users.",
    d: "Arrivals follow a rate, often with random spacing such as exponential intervals, and each arrival starts a fresh session. If the target slows down, the number of in-flight sessions grows, as with real users who do not know the service is struggling. This is the right model for public services. It is hard because under overload the generator must keep creating sessions, and unbounded growth exhausts the generator's sockets and memory before the target fails.",
    k: ["Open arrivals versus a fixed user count: open arrivals reveal queueing collapse, and a fixed count hides it because slow responses reduce the offered load.", "Random versus evenly spaced arrivals: random spacing matches real bursts but needs more samples to stabilize; even spacing is smooth and underestimates queueing."],
    p: ["The generator has no cap on in-flight sessions, runs out of memory during the target's failure and loses the result.", "Evenly spaced arrivals hide the bursts that cause real queueing, and the target looks better than it is."],
    v: "Slow the target on purpose and confirm the arrival rate stays at the planned value while the count of in-flight sessions rises, as shown in the generator's own metrics.",
    dep: ["arrival-rate-controller","vu-executor","generator-resource-guard"]
  },
  "closed-workload-model": {
    s: "A workload with a fixed population of users who each wait for a response, think, then send the next request, so offered load falls when the target slows.",
    d: "A set number of virtual users loop through a scenario. Each sends a request, waits for the reply, pauses for think time and repeats. Throughput is then determined by response time and population. This models a bounded user group such as staff of a company using an internal system. It is hard because the model is self-throttling: a degrading target receives fewer requests, so the test understates how the system fails under a flood.",
    k: ["Closed versus open model: closed is natural for finite populations and easy to reason about but conceals overload; open exposes overload but needs a rate and a cap.", "Large population with long think time versus small population with none: the two can give the same throughput but very different concurrency and queueing behavior."],
    p: ["A closed test of a public endpoint reports a stable latency because a slow target quietly reduced the load it received.", "Think time is set to zero so a small population produces extreme request rates per user that no human would."],
    v: "Make the target progressively slower and confirm the achieved request rate falls in proportion, which is the expected closed behavior, and that the report states the model used.",
    dep: ["virtual-users","think-time-and-pacing","vu-executor"]
  },
  "virtual-users": {
    s: "Lightweight simulated users, each with its own session state, data and position in a scenario, run many at a time on one generator.",
    d: "A virtual user is a unit of execution holding cookies, tokens, loop counters and local variables, and executing a scenario step by step. It is implemented as a thread, a coroutine or a callback state machine, depending on the runtime. The number that one host can sustain depends on memory per user and the cost of the protocol work. It is hard because a virtual user is cheaper than a real browser and does not behave like one: it does not render, execute page code or fetch resources unless it is told to.",
    k: ["Protocol-level users versus browser-driven users: protocol users are cheap and scale to thousands; browser users are faithful but cost orders of magnitude more per user.", "Fresh state per iteration versus persistent state across iterations: fresh state is predictable, persistent state models returning users but makes runs order-dependent."],
    p: ["A virtual user keeps connections and caches across iterations, so a hundred of them look unlike a hundred separate real clients.", "Memory per user is assumed rather than measured, and the generator swaps long before the planned user count."],
    v: "Ramp to the planned user count on one generator and confirm that memory, CPU and event-loop lag stay within the guard limits while the achieved rate matches the plan.",
    dep: ["vu-executor","script-runtime","concurrency-runtime"]
  },
  "scenario-mix": {
    s: "The proportions in which different user journeys run at the same time, set to match the traffic pattern of the real system.",
    d: "A mix assigns each scenario a weight or its own rate, for example browsing ninety times for each checkout. Mixes come from production traffic analysis, such as access logs or analytics. The tool runs scenarios concurrently, each with its own load profile. It is hard because the mix changes by hour and by campaign, and the most expensive paths, which are often rare, determine capacity limits while barely appearing in a simple average.",
    k: ["A single blended mix versus separate peaks per scenario: a blend is easy to specify but misses the day when one journey spikes; per-scenario control is flexible but needs more data.", "A mix from production logs versus from expected plans: logs reflect behavior today, plans cover features that do not yet have traffic."],
    p: ["The mix over-represents cheap read requests, so the test passes at a load the real mix would overwhelm.", "Weights are set per virtual user instead of per request, and a long scenario ends up with far more requests than intended."],
    v: "Count requests per scenario in the report and confirm their proportions match the configured mix within statistical tolerance, and compare to a sample of production traffic.",
    dep: ["scenario-scripting","arrival-rate-controller","virtual-users"]
  },
  "arrival-rate-controller": {
    s: "The component that decides, at each instant, how many new sessions or requests should start, following the configured rate and its changes over time.",
    d: "It turns a rate profile into start times, using timers and a small scheduler, and it compensates for jitter by tracking how many iterations should have started by now and catching up. When the generator falls behind it records the lag. It feeds the executor and exposes planned versus achieved rates. It is hard because at high rates the timer resolution, garbage collection pauses and CPU contention make arrivals bunch up, and a controller that does not detect this reports a rate it did not deliver.",
    k: ["Computing start times in advance versus reacting to a tick: precomputed times resist drift and expose lag, but tick-based control is simpler.", "Catching up after a delay versus skipping missed starts: catching up preserves total load but produces a burst; skipping keeps smoothness but lowers the delivered count."],
    p: ["After a pause, the controller releases all missed arrivals at once and the target sees a spike that was never in the plan.", "Planned rate is reported as achieved rate, so a lagging generator is invisible."],
    v: "Run at the planned rate and compare the count of iterations started per second against the plan, confirming a difference under a stated percent and that a deliberate generator stall is shown as lag.",
    dep: ["scheduler","rate-pacer","high-resolution-timer"]
  },
  "ramp-profiles": {
    s: "The time-varying shape of load: how quickly it grows, how long it holds and how it comes down, expressed as stages.",
    d: "A profile is a list of stages, each with a target load and a duration, and the controller interpolates between them. Typical shapes are a gradual ramp to find the knee, a plateau for steady-state measurement, a step pattern to find capacity per step, and a ramp-down. It is hard because the interesting measurement is taken at steady state, so the profile must be long enough after each change for queues and caches to settle, or the numbers describe a transient.",
    k: ["Linear ramp versus stepped plateaus: a linear ramp finds the breaking point quickly but never reaches steady state; plateaus give clean measurements at the cost of more time.", "Short stages versus long stages: short stages save time but measure transients; long stages are accurate and slow."],
    p: ["Stages are too short for caches or autoscaling to react, and results describe the transition instead of the capacity.", "Ramp-down is omitted, and the sudden stop leaves connections half-open and distorts the final samples."],
    v: "Plot achieved load against the configured profile for a staged run and confirm each plateau is flat within the tolerance, long enough to include at least several full measurement intervals.",
    dep: ["arrival-rate-controller","warm-up-exclusion"]
  },
  "think-time-and-pacing": {
    s: "The deliberate waits between a virtual user's steps and between iterations, which model human delay and control the request rate per user.",
    d: "Think time is a pause after a response, fixed or drawn from a distribution, representing the user reading or typing. Pacing sets the time between iteration starts regardless of how long the iteration took. The two serve different aims: think time models behavior, pacing controls rate. It is hard because real think times are broadly distributed, with a long tail, and a constant value synchronizes users into lockstep waves.",
    k: ["Fixed versus random think time: fixed is repeatable but synchronizes users into waves; a distribution matches humans and desynchronizes at the cost of repeatability.", "Think time versus pacing for rate control: pacing yields a predictable rate when responses are slow, while think time lets slow responses reduce the rate."],
    p: ["All users share one fixed think time and fire together, producing artificial periodic spikes.", "Think time is copied from a guess, set to ten seconds when real users act in two, and the load is one fifth of the plan."],
    v: "Plot the distribution of gaps between consecutive requests per user and confirm it matches the configured distribution, then check the aggregate request rate does not show periodic spikes.",
    dep: ["virtual-users","scheduler"]
  },
  "soak-and-spike-shapes": {
    s: "Long, steady runs that expose slow leaks and drift, and sudden bursts that expose how a target copes with an abrupt change in demand.",
    d: "A soak test holds moderate load for hours to find memory growth, connection leaks, log disk fill and slow degradation. A spike test jumps from low to high load almost instantly and then returns, to test autoscaling and queue behavior. Both are special ramp profiles with their own measurement concerns. It is hard because a soak test also tests the generator and the metrics pipeline over hours, and a spike must be sharp enough that the generator itself can produce it.",
    k: ["Long soaks at moderate load versus short runs at high load: soaks find slow leaks but cost hours and storage; short runs are cheap but never reveal time-dependent failures.", "A true instantaneous spike versus a steep ramp: instantaneous matches viral events but strains the generator; a steep ramp is easier to produce and gives autoscalers a head start."],
    p: ["The generator leaks memory over a ten-hour soak and the test ends with an error unrelated to the target.", "A spike is ramped over thirty seconds, and the autoscaler quietly keeps up, so the failure of a real flash crowd is never found."],
    v: "Run a multi-hour soak and confirm that generator memory and the metrics pipeline are flat, while the target's resource trend is the thing that changes; run a spike and confirm achieved load reaches the peak within the planned seconds.",
    dep: ["ramp-profiles","generator-resource-guard","sample-buffer"]
  },
});
