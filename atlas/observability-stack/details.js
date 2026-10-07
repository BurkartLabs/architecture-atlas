// Details for the observability stack plate, part 1: visualization, alerting, reliability management, query.
ATLAS.details("observability-stack", {
  "dashboards": {
    s: "Saved screens of panels, each backed by a query, arranged for a known question such as the health of one service, and parameterized by variables like environment or region.",
    d: "A dashboard is a document listing panels, each holding a query against one data source, a visualization type and display options. Variables expand into query text so one dashboard serves every service or cluster. The browser, or a rendering service, issues the queries when the page loads and on a refresh interval. It is hard because dashboards decay: queries outlive the metrics they read, panels multiply until the page is slow, and nobody remembers which panels matter during an incident.",
    k: ["Many panels per dashboard vs a few focused ones: broad pages answer more questions but issue dozens of queries on every refresh and bury the signal.", "Per-team dashboards vs shared standard ones: local freedom fits local needs, while standard layouts let an on-call engineer read a service they have never seen."],
    p: ["Panels that silently show empty graphs after a metric rename look like a quiet system rather than a broken query.", "Auto-refresh of heavy dashboards from many open browsers produces a steady query load that rivals real traffic."],
    v: "Open the dashboard for a service, change the environment variable, and confirm every panel re-queries with the new label value and the request rate matches a hand-run query for the same range.",
    dep: ["metrics-query-language","log-query-language","access-control"]
  },
  "ad-hoc-exploration": {
    s: "An interactive query workspace for questions nobody built a dashboard for: type or build a query, change the time range, split by a label, and pivot between signals.",
    d: "The explorer offers a query editor with completion based on known metric names, label values and log fields, plus a visual builder for people who do not know the language. Results render as a graph, table or log list, and links carry the query and time range into other signals. It reads the same stores as dashboards through the same query layer. Difficulty lies in preventing an unbounded query from hurting shared stores while still letting an engineer search broadly during an incident.",
    k: ["Free-form query text vs a guided builder: text is more powerful and exact, while builders prevent mistakes but hide what is actually being run.", "Interactive limits vs unlimited scans: tight limits protect the store but force engineers to narrow queries before they know what they are looking for."],
    p: ["A broad regex over a week of logs run during an incident competes with the very alerts that need the store.", "Completion suggestions built from stale metadata lead people to metrics that no longer receive data."],
    v: "Start from a latency spike on a graph, select the slow time window, pivot to logs with the same service filter, and confirm the log view opens with that exact window and label set.",
    dep: ["metrics-query-language","log-query-language","trace-query-language","query-frontend"]
  },
  "trace-viewer": {
    s: "Renders one trace as a timeline of nested spans, showing which service called which, how long each call took, where it failed, and the attributes and events on each span.",
    d: "The viewer fetches all spans for a trace identifier, rebuilds the tree from parent references, and draws bars on a shared time axis. Selecting a span shows attributes, events, resource data and links to logs or profiles for that interval. It also has to handle traces with missing spans, clock skew between hosts that makes a child appear to start before its parent, and traces with tens of thousands of spans that cannot all be drawn at once.",
    k: ["Rendering every span vs collapsing repeated calls: full detail is exact, but a thousand identical database spans hide the one slow request.", "Trusting reported timestamps vs adjusting for skew: raw times are honest, while adjustment makes the picture readable and can hide a real ordering fault."],
    p: ["A trace with a dropped middle span shows orphaned children that look like a broken service rather than lost data.", "Hosts with unsynchronized clocks draw children before their parents, so engineers distrust the whole viewer."],
    v: "Send a request through three services with a known delay in the second, open its trace, and confirm the span tree has three levels with the second service's bar matching the delay.",
    dep: ["trace-store","trace-id-lookup-index","trace-to-log-correlation","span-api"]
  },
  "log-viewer": {
    s: "A searchable, filterable stream of log lines with a time histogram, field extraction and live tail, used to read what a service said around the moment something went wrong.",
    d: "The viewer sends a log query and shows matching lines newest first, with a histogram of volume over time so bursts are visible. JSON or key-value lines are parsed into fields that can be filtered or added as columns, and context buttons show the lines immediately before and after a hit from the same source. Live tail streams new lines as they arrive. The difficulty is volume: the page must page and sample responsibly, and parsing must not break on lines that deviate from the expected format.",
    k: ["Parse at query time vs at ingest: query-time parsing lets old logs be reinterpreted, while ingest-time parsing makes queries faster and fixes the schema early.", "Live tail through the store vs directly from agents: store tail is consistent, while agent tail is lower latency but loses history on reconnect."],
    p: ["A histogram computed from sampled results shows a smooth shape that hides a short burst of errors.", "Multi-line stack traces split across entries make a single failure look like dozens of unrelated lines."],
    v: "Write a log line with a unique marker from a test service and confirm it appears in the viewer within the stated ingest delay, with its fields parsed and a context view showing neighboring lines.",
    dep: ["log-query-language","log-store","trace-to-log-correlation"]
  },
  "service-map": {
    s: "A graph of services and the calls between them, with request rate, error rate and latency on each edge, derived from trace data or span metrics rather than drawn by hand.",
    d: "Nodes and edges are computed by aggregating client and server spans that share a call, then counting requests, errors and durations per pair. The result is stored as metrics so the map loads without scanning traces. Clicking an edge leads to example traces. The difficulty is accuracy: sampling distorts counts unless corrected, calls through queues and gateways need special handling to avoid false direct edges, and uninstrumented services appear as missing nodes rather than as visible gaps.",
    k: ["Derive from sampled traces vs from pre-sampling span metrics: trace-derived maps are simple but undercount, while metrics before sampling are accurate and need a generator in the pipeline.", "Static declared topology vs observed topology: declared is clean and complete, observed shows what actually happens including surprising dependencies."],
    p: ["Heavy sampling makes rare but critical dependencies disappear from the map entirely.", "Calls through a shared proxy are drawn as many services calling the proxy, hiding the real upstream and downstream pairs."],
    v: "Make a known call from service A to service B at a steady rate and confirm the map shows one edge A to B with a rate within a few percent of the generator's rate.",
    dep: ["span-metrics-generation","metrics-store","semantic-conventions"]
  },
  "dashboards-as-code": {
    s: "Dashboards, alert rules and data source settings kept as reviewed files in version control and applied by automation, instead of edited by hand in the interface.",
    d: "Definitions are written in a data format or generated by a library, validated in continuous integration, and pushed to the platform through its API or by file provisioning. The running system treats provisioned items as read-only or reverts manual edits. Teams share libraries so every service gets the same standard panels. It is hard because interface edits are faster than review, so people drift back to them, and generated definitions need as much care as any other code to stay readable.",
    k: ["Provisioned read-only dashboards vs editable ones: code is reviewable and reproducible, while editing in the interface is faster for exploration and often never saved back.", "Generated definitions vs hand-written files: generators enforce consistency, but errors appear far from the source and diffs become unreadable."],
    p: ["Manual edits made during an incident are overwritten by the next apply, losing the panel that helped.", "Dashboards referencing data sources by display name break when the name changes in another environment."],
    v: "Change a threshold in the source file, merge it, and confirm the applied dashboard shows the new threshold within one deploy cycle, and that a manual edit made beforehand has been reverted.",
    dep: ["dashboards","alert-rules","access-control"]
  },
  "alert-rules": {
    s: "Declarations of a condition to watch, written as a query, a threshold and a duration, plus labels and annotations that say how serious it is and where the runbook lives.",
    d: "Each rule holds an expression over metrics or logs, a for-duration the condition must hold, a severity label that routing will use, and text with the affected labels and a link to a runbook. Rules are grouped and loaded by the evaluator from files or an API. Good rules describe a symptom users feel rather than a cause, and carry enough context that the person paged can start acting. The difficulty is volume and drift: every rule is a recurring cost, and thresholds set in one season fit poorly in the next.",
    k: ["Symptom-based rules vs cause-based rules: symptoms such as error rate page only when users are affected, while causes such as disk usage warn earlier but often fire without any impact.", "Static thresholds vs rules relative to a baseline: static is predictable and easy to explain, while baselines adapt to seasonality and produce alerts that are harder to reason about."],
    p: ["A rule with no runbook or owner pages at night and teaches the team to ignore that name.", "Thresholds copied from another service fire constantly or never, because traffic shapes differ."],
    v: "Inject the failure the rule describes in a staging environment and confirm the alert goes pending, then firing after its for-duration, with labels and runbook link filled in correctly.",
    dep: ["metrics-query-language","rule-evaluator","semantic-conventions"]
  },
  "rule-evaluator": {
    s: "The service that runs every alert and recording rule on a fixed interval against the query layer, and records the resulting alert states and precomputed series.",
    d: "At each tick the evaluator runs each rule's query, compares results with thresholds, updates per-series alert state and writes recorded series back to the store. Large deployments shard rules across evaluator instances and run them near the data or through the query frontend. It must tolerate a slow or failing query layer without flipping alerts to resolved. It is hard because evaluation delay adds directly to detection time, and a query timeout is ambiguous: no data can mean healthy or can mean the evaluator cannot see.",
    k: ["Evaluate inside the store vs through the shared query path: in-store is fast and consistent, while the shared path gives one set of limits and caching but competes with users.", "Replicated evaluators vs a single leader: replicas survive failure but send duplicate alerts that the router must merge, while a leader risks a gap during failover."],
    p: ["A query timeout treated as zero results resolves every active alert exactly when the store is in trouble.", "Evaluation interval longer than the shortest for-duration makes the duration unreliable and alerts flap."],
    v: "Stop the query layer for two evaluation intervals during an active alert and confirm the alert stays firing, an evaluation-failure metric increments, and no resolved notification is sent.",
    dep: ["query-frontend","metrics-query-language","metrics-store","recording-rules"]
  },
  "alert-state-machine": {
    s: "The per-alert lifecycle of inactive, pending and firing, with rules for how long a condition must hold before firing and how long it must clear before resolving.",
    d: "Each distinct label set produced by a rule has its own state. A new match moves to pending, then to firing once the for-duration has passed continuously. When the query stops matching the alert resolves, often after a hold period so a brief recovery does not close it. State is kept in memory and restored after restart, from stored series or a database, so a restart does not reset every timer. The difficulty is edge behavior: series that disappear, flapping values and label changes all create or end alerts unexpectedly.",
    k: ["Resolve immediately vs hold before resolving: immediate resolution is accurate to the data, while a hold period avoids repeated open and close notifications for a flapping condition.", "Persist alert state vs rebuild from queries: persisting preserves timers across restarts, while rebuilding is simpler but restarts the for-duration of every alert."],
    p: ["A label that changes with each deploy, such as a pod name, creates a new alert and resolves the old one every time.", "Restart of the evaluator loses pending timers, so a real problem is detected a full for-duration later."],
    v: "Drive a metric above the threshold, confirm the alert is pending, then firing after exactly its for-duration; restart the evaluator and confirm the alert remains firing without a new notification.",
    dep: ["rule-evaluator","alert-rules"]
  },
  "absent-data-alerts": {
    s: "Rules that fire when a signal that should exist stops arriving, catching dead services, broken scrapes and silent pipelines that a threshold on values can never see.",
    d: "A normal rule only evaluates series that exist, so a service that stops reporting produces no match and no alert. Absence rules check for the presence of a series, a recent sample, or a heartbeat, often by comparing against a recent window or an expected count of targets. They need care because absence has many causes: the service is down, its scrape fails, the pipeline drops data, or the service was intentionally removed. Each cause needs a different responder, so the alert should help distinguish them.",
    k: ["Alert on missing series vs on a target-up signal: missing-series is simple but cannot tell removal from failure, while an up signal from the scraper separates them at the cost of depending on discovery.", "Expected-count comparison vs presence of any series: counting catches partial loss, while presence checks are simpler and miss a fleet that lost half its instances."],
    p: ["A deliberately decommissioned service triggers absence alerts until someone edits the rule.", "An absence rule that reads the same failed store it monitors goes quiet at exactly the moment it is needed."],
    v: "Stop one instance of a service and confirm that within the configured window an absence alert fires naming that instance, while stopping the whole pipeline fires the separate pipeline alert instead.",
    dep: ["alert-rules","service-discovery","dead-mans-switch"]
  },
  "notification-router": {
    s: "The service that receives firing and resolved alerts from evaluators, applies grouping, inhibition and silencing, and delivers a small number of notifications to the right receiver.",
    d: "Evaluators post alerts to the router with their labels. A routing tree matches labels to receivers, such as a team's chat channel or a paging service, and each route sets its own grouping and timing. The router tracks what was already sent so it can repeat only after an interval, deduplicates alerts arriving from replicated evaluators, and gossips state between its own replicas. It is hard because it must never lose a page, yet must also avoid sending duplicates when its replicas partition.",
    k: ["Label-matching routing tree vs per-alert explicit receiver: the tree scales and keeps rules in one place, but a misordered route can send a page to the wrong team.", "Clustered replicas with shared state vs a single instance: clusters survive failures but may duplicate on partition, while a single instance is simple and a single point of failure."],
    p: ["An alert with a label no route matches falls to a default receiver nobody watches.", "Router replicas that cannot reach each other each send the same page, doubling notifications during network trouble."],
    v: "Fire a test alert from two evaluators at once and confirm exactly one notification reaches the receiver, then change a label so it matches a different route and confirm it goes to that route's receiver.",
    dep: ["alert-grouping","inhibition","silencing","escalation-policies","on-call-integration"]
  },
  "alert-grouping": {
    s: "Combining alerts that share chosen labels into one notification, so a failing cluster pages once with a list rather than once per instance.",
    d: "Each route names the labels to group by, such as service and region. Alerts with the same values collect in a group, and the router waits a short initial interval so related alerts arrive together, sends one message, then sends updates at a group interval when members change and repeats at a longer interval while still firing. The difficulty is choosing keys: grouping by too few labels buries a separate problem inside an existing page, and grouping by too many gives no reduction at all.",
    k: ["Group by service and region vs by alert name only: finer grouping keeps unrelated problems separate, while coarse grouping gives fewer pages and mixes causes.", "Long initial wait vs short: a long wait gathers a complete picture into one page, but delays the first notification of a severe outage."],
    p: ["A new alert joining an existing group does not re-page, so a second distinct failure goes unnoticed by someone already working the first.", "Grouping on a high-cardinality label such as instance defeats the purpose and sends a message per instance."],
    v: "Fail ten instances of one service at once and confirm one notification arrives listing all ten, then fail an instance of a different service and confirm a separate notification is sent.",
    dep: ["notification-router"]
  },
  "inhibition": {
    s: "Rules that suppress lower-level alerts while a related higher-level alert is firing, so a dead cluster does not also page for every service running on it.",
    d: "An inhibition rule names a source alert pattern, a target pattern and the labels that must be equal. While any matching source is firing, matching targets are muted rather than sent. Typical uses are a whole-site outage muting per-service alerts, or a down host muting its process alerts. The router evaluates this at send time against currently firing alerts. It is hard because suppression is invisible: if the source alert is wrong or never reaches a human, the muted alerts hide real, separate problems.",
    k: ["Suppress dependent alerts vs show them marked as caused: suppression reduces noise sharply, while marking keeps information but still floods an overloaded responder.", "Equal-label matching vs explicit dependency graph: label matching is easy to configure and approximate, while a graph is accurate and has to be maintained."],
    p: ["Inhibiting on a source alert that is itself silenced or undelivered hides everything with no one aware.", "Too-broad equality labels let one alert mute unrelated alerts in the same region."],
    v: "Fire a host-down alert and per-process alerts for that host and confirm only the host alert is delivered, while a process alert on a different host still pages.",
    dep: ["notification-router","alert-rules"]
  },
  "silencing": {
    s: "Temporary, labeled mutes created by a person, for planned maintenance or a known issue, that stop matching notifications until they expire while leaving the alerts themselves visible.",
    d: "A silence has label matchers, a start and end time, an author and a comment. The router checks each outgoing alert against active silences and drops matches from delivery, but alerts still show in the alert list as suppressed. Silences are stored in the router and replicated among its instances. The hard parts are discipline and expiry: open-ended silences hide real failures long after the work ends, and a matcher that is slightly too broad mutes more than intended.",
    k: ["Time-boxed silences only vs allowing indefinite ones: forced expiry prevents forgotten mutes, while indefinite silences suit long-known issues but need a review process.", "Silence by label match vs by alert identity: label match covers future instances automatically, while identity is precise and misses new members of the same problem."],
    p: ["A maintenance silence with a wide matcher stays active after the work ends and masks an unrelated outage.", "A silence stored on only one replica is lost on restart and the muted pages return at three in the morning."],
    v: "Create a one-hour silence for a service, fire its alert, and confirm no page is sent but the alert is visible as suppressed; after expiry confirm the notification is delivered.",
    dep: ["notification-router","access-control","audit-trail"]
  },
  "escalation-policies": {
    s: "Rules that decide who is notified first, how long to wait for acknowledgment, and who is notified next, so an unanswered page eventually reaches someone who will respond.",
    d: "A policy is an ordered list of steps: notify the primary on-call, wait a fixed time for acknowledgment, then notify the secondary, then a manager or team channel. Steps may be tied to severity, so a warning goes to chat while a critical alert pages by phone. Policies reference schedules, not named people. The difficulty is that they must keep working when someone is unreachable, overridden or in a different time zone, and the final step must be a person who can act, not a mailbox.",
    k: ["Time-based escalation vs requiring explicit acknowledgment: timers guarantee progress, while acknowledgment-gated escalation avoids waking people already working the issue.", "Severity-specific policies vs one policy per team: severity-specific policies protect sleep from minor issues, but need discipline in labeling severity correctly."],
    p: ["A schedule gap leaves a policy pointing at nobody, so critical pages are accepted by the system and never reach a human.", "Escalation wait shorter than a realistic response time pages the secondary on every incident."],
    v: "Page a test alert and leave it unacknowledged, and confirm the secondary is notified exactly at the configured delay, then acknowledge another test alert in time and confirm no escalation occurs.",
    dep: ["on-call-integration","notification-router"]
  },
  "on-call-integration": {
    s: "The link from the alert router to the system that holds on-call schedules, phone and push delivery, acknowledgment and incident records, so a firing alert reaches a specific person.",
    d: "The router sends events to an on-call service through a webhook or API, with a deduplication key so repeats update one incident rather than creating many. The service resolves the current on-call from a schedule with rotations and overrides, contacts them by push, SMS or voice, and records acknowledgment and resolution. Status can flow back to the router so resolved alerts close incidents. It is hard because it is the one dependency that must work during every other failure, including loss of network and of the primary chat system.",
    k: ["External hosted on-call service vs self-run: hosted survives your own outage, while self-run keeps data internal and fails together with your infrastructure.", "Chat-based paging vs phone and push: chat is convenient and often muted at night, while phone delivery is intrusive and reliable."],
    p: ["Deduplication keys derived from changing labels open a new incident for every flap.", "Routing keys that were never tested after an account change send pages to a service that nobody monitors."],
    v: "Send a test critical alert through the router and confirm the person on call receives a phone notification within the target time and that acknowledging it stops further notifications.",
    dep: ["notification-router","transport-security"]
  },
  "slo-definitions": {
    s: "A written target for what users experience, expressed as an indicator such as the share of successful requests, a threshold and a window, for example 99.9 percent over thirty days.",
    d: "An SLO has an indicator defined as good events divided by valid events, a target, and a rolling or calendar window. The indicator is computed from metrics measured as close to the user as practical, such as at the load balancer or in a client. Definitions are stored as files so tools can generate recording rules and alerts from them. The difficulty is choosing indicators that match real user pain: availability alone ignores slow responses, and averages hide the slowest requests that users notice.",
    k: ["Request-based indicators vs time-based: request-based weights by traffic and is easy to compute, while time-based windows are simpler to explain but treat quiet minutes as equal to busy ones.", "Measure at the edge vs inside the service: edge measurement sees what users see, while service-internal measurement misses failures before the request arrives."],
    p: ["An indicator that counts health checks or bot traffic as valid events makes the objective look better than user experience.", "A target set without data about current performance is either trivially met or constantly missed."],
    v: "Generate a known fraction of failing requests against a test service and confirm the computed indicator for the window matches the injected ratio within a small tolerance.",
    dep: ["metrics-query-language","recording-rules","histograms"]
  },
  "error-budgets": {
    s: "The amount of failure an SLO allows over its window, tracked as how much has been used, so teams can decide between shipping changes and spending time on reliability.",
    d: "The budget is one minus the target, applied to the number of events or minutes in the window. The platform computes consumption continuously from the indicator and displays remaining budget and its rate of use. Teams agree a policy for what happens when it runs low, such as freezing risky releases. It is hard because the number is only useful if the organization acts on it, and because small windows, low traffic and rare events make it jump around for reasons unrelated to real reliability.",
    k: ["Rolling window vs calendar window: rolling windows forgive and forget smoothly, while calendar windows give clear reset points that match reporting but allow a bad end of month to dominate.", "A single budget per service vs per user journey: per service is simple, while per journey matches what users care about and multiplies the number of budgets to maintain."],
    p: ["A budget that nobody has agreed how to spend becomes a dashboard with no consequences.", "Low-traffic services show wild budget swings from a handful of failures and get either ignored or over-reacted to."],
    v: "Inject enough failures to consume ten percent of a test service's budget and confirm the remaining budget display drops by ten percent and matches a manual calculation from the same data.",
    dep: ["slo-definitions","metrics-store"]
  },
  "burn-rate-alerts": {
    s: "Alerts that fire when the error budget is being consumed faster than sustainable, using paired long and short windows so they detect fast outages quickly and slow leaks reliably.",
    d: "Burn rate is the ratio of the current error rate to the rate that would exactly exhaust the budget at the window's end. A fast rule pages when the rate is very high over a short window, such as one hour and five minutes, while a slower rule creates a ticket for a modest rate over a day. Requiring both a long and a short window to agree avoids paging for a problem that has already ended. It is hard to tune: thresholds trade detection time against false pages, and low-traffic services produce noisy ratios.",
    k: ["Multiple windows and rates vs one threshold: several tiers catch both sudden and gradual loss, while a single rule is simple and either misses slow leaks or pages too often.", "Page on burn vs page on raw error rate: burn alerts scale with the target and ignore harmless blips, while raw rates are easier to reason about."],
    p: ["A long window without a short confirming window keeps paging for an hour after the problem is fixed.", "Applying the same burn thresholds to a service with very little traffic pages on single failed requests."],
    v: "Replay a recorded outage that burned five percent of the monthly budget in one hour and confirm the fast rule fires within its detection window and the slow rule does not.",
    dep: ["error-budgets","alert-rules","recording-rules"]
  },
  "synthetic-monitoring": {
    s: "Scripted probes run on a schedule from several locations that call public endpoints or walk a user flow, measuring availability and latency from outside the system.",
    d: "Probes are small checks, such as an HTTP request, a name lookup, a certificate check or a scripted browser session, run from locations that resemble where users are. Results become metrics with a success flag and timing, and failures can capture a trace or screenshot. Because they run continuously, they detect problems on quiet endpoints and at night when no real traffic exists. They are hard to keep honest: probes need test accounts and data, and a probe that only tests the happy path reports health during real partial failure.",
    k: ["Few probe locations vs many: few are cheap and simple, while many separate a local network fault from a service fault.", "Simple endpoint checks vs scripted user flows: endpoint checks are stable and cheap, while flows catch broken journeys at the cost of fragile scripts and test data upkeep."],
    p: ["A probe that hits a cached or special health path stays green while the real request path is broken.", "Test accounts that expire or hit rate limits generate failures that are really probe faults and erode trust in the signal."],
    v: "Block one dependency in a staging environment and confirm the scripted flow probe turns red from at least two locations within its interval, and that a trace for the failed run is attached.",
    dep: ["metrics-store","push-ingest","alert-rules"]
  },
  "real-user-monitoring": {
    s: "Telemetry collected from actual users' browsers and apps, covering page load, interaction latency, errors and network conditions, which backend telemetry cannot observe.",
    d: "A small client library records timings, errors and navigation events, batches them and sends them to a public ingest endpoint, often with a session identifier and a trace context so a slow page can be linked to backend traces. Data is aggregated by page, release, device class and region. Challenges are scale and trust: clients are numerous, unreliable and hostile, so ingest must be rate limited and validated, sampling is needed, and privacy rules limit what may be collected.",
    k: ["Sample sessions vs collect everything: sampling bounds cost and misses rare failures, while full collection is expensive and raises more privacy questions.", "Link to backend traces vs keep client data separate: linking explains slow pages end to end, while separation avoids exposing internal trace data to clients."],
    p: ["Ad blockers and flaky networks drop client beacons unevenly, so the data over-represents users with good connections.", "A public ingest endpoint with no validation accepts forged events that distort dashboards."],
    v: "Load a page from a test device on a throttled network and confirm a record with its load timings, release version and a trace link arrives within the ingest delay and reflects the throttling.",
    dep: ["push-ingest","context-propagation","redaction-and-scrubbing","ingest-rate-limits"]
  },
  "metrics-query-language": {
    s: "A language for selecting series by label, applying functions such as rates and aggregations, and combining series arithmetically, used for graphs, alerts and recording rules.",
    d: "A query selects series with label matchers, takes a range of samples, applies functions like per-second rate, sum by label and histogram quantile, and joins results by matching labels. The engine fetches the required blocks, evaluates the expression at each step of the requested range and returns aligned points. The subtle parts are semantics: rates must handle counter resets, aggregation of quantiles across instances needs histograms rather than summaries, and a mismatch in labels between two series silently produces an empty join.",
    k: ["A purpose-built series language vs SQL over time series: a purpose-built language is concise for rates and label joins, while SQL is familiar and integrates with other data at the cost of verbose syntax.", "Evaluate over fixed steps vs raw samples: fixed steps give predictable cost and aligned graphs, but can miss spikes that fall between steps."],
    p: ["Averaging pre-computed percentiles across instances yields a number that corresponds to no real latency.", "A rate window shorter than twice the scrape interval returns empty or erratic results."],
    v: "Run a rate query over a counter that increases by a known amount per second and confirm the result equals that amount, including across a deliberate counter reset.",
    dep: ["metrics-store","query-frontend","counters","histograms"]
  },
  "log-query-language": {
    s: "A language that first narrows logs by labels or time, then filters lines by text or parsed fields, and can aggregate matching lines into counts and rates.",
    d: "A query typically begins with a stream selector on indexed labels, which picks the chunks to read, followed by a pipeline of line filters, parsers that extract fields from text, field filters and finally aggregations such as count over time or top values. Because the label index is small, the pipeline scans the text of selected streams. Cost depends heavily on how much the selector narrows. The difficulty is that unstructured text parses unreliably, so queries over inconsistent formats produce silent undercounts.",
    k: ["Label-first selection then scan vs full-text lookup: label-first is cheap to store and scales with scanning bandwidth, while full-text lookup answers needle searches fast at much higher index cost.", "Query-time field extraction vs ingest-time: query-time is flexible for old data, while ingest-time extraction makes common queries faster."],
    p: ["A selector matching every stream turns a simple search into a scan of the entire retention period.", "A parse expression that fails on a minority of lines drops those lines from results without any error."],
    v: "Query for a unique marker string within one service's streams and confirm one hit is returned in seconds, then count lines per level over an hour and compare against a known generated mix.",
    dep: ["log-store","log-label-index","log-full-text-index","query-frontend"]
  },
  "trace-query-language": {
    s: "Ways of finding traces by what they contain: lookup by trace ID, search by service, duration or attribute, and structural queries over parent and child span relationships.",
    d: "Lookup by identifier is a direct index read. Search filters spans by attributes, status and duration and then returns whole traces that contain a matching span. Structural queries express relations such as a database span slower than a threshold under a specific route. The engine scans columnar blocks and may use bloom filters or attribute indexes to skip data. It is hard because a trace is spread across services and arrives late, so searches are costly and may miss traces still being assembled.",
    k: ["Index selected attributes vs scan with column pruning: indexes make common searches quick and cost storage on every span, while scanning stays flexible and relies on columnar layout.", "Return whole traces vs matching spans: whole traces give context and cost more to fetch, while spans only are cheap and need another call for the tree."],
    p: ["Searching for a rare attribute value across days of data without a time bound can scan terabytes.", "Traces still arriving at the store are not found, so a search right after an incident returns fewer results than appear later."],
    v: "Generate one trace with a slow database span and a distinct attribute value, then search by that attribute and by a duration threshold and confirm that exact trace is returned and no others.",
    dep: ["trace-store","trace-id-lookup-index","query-frontend"]
  },
  "query-frontend": {
    s: "A layer in front of the stores that splits long queries into time shards, caches results, queues and schedules work, and enforces per-tenant limits before queries reach storage.",
    d: "Incoming range queries are split by time interval, so a thirty-day query becomes many one-day queries that run in parallel on separate workers. Results are cached by query and step, and only the uncached tail is computed on repeat. A fair queue prevents one tenant's heavy query from starving others, and limits reject queries that would touch too many series or bytes. The challenge is correctness at the seams: splitting must not change results for functions that look backward, and caches must not serve stale data for the most recent minutes.",
    k: ["Split and cache by time vs run queries whole: splitting scales out and reuses results, but needs care with functions spanning the split boundary.", "Reject expensive queries vs let them run slowly: rejection protects shared capacity and frustrates users, while slow runs help one user and hurt every other."],
    p: ["Caching the most recent interval serves a dashboard stale values during the very incident people are watching.", "A global queue without per-tenant fairness lets one runaway dashboard delay everyone's queries."],
    v: "Run the same thirty-day query twice and confirm the second returns far faster from cache with identical values, then run a query exceeding the series limit and confirm a clear rejection naming the limit.",
    dep: ["metrics-store","log-store","trace-store","tenant-quotas"]
  },
  "recording-rules": {
    s: "Queries evaluated on a schedule whose results are stored as new series, so expensive aggregations are computed once and dashboards and alerts read the cheap precomputed result.",
    d: "A recording rule names a new series and an expression, such as request rate summed by service. The evaluator runs it each interval and writes the result back to the store with a naming convention that shows its level and operation. Dashboards, SLO calculations and alerts then query the recorded series. It is hard because rules are another thing to keep in sync: if the underlying labels change, the recorded series quietly stops matching, and recorded series add cardinality and storage of their own.",
    k: ["Precompute with rules vs compute at query time: rules make heavy queries cheap and fast to alert on, while ad hoc computation is flexible and slow at scale.", "Aggregate away labels in the rule vs keep them: aggregating shrinks the series, while keeping labels preserves drill-down at higher cost."],
    p: ["A rule that aggregates away a label other queries rely on breaks those queries without any visible error.", "Recording rules evaluated at a coarser interval than the dashboard step produce staircase graphs."],
    v: "Define a rule for request rate by service, wait one interval, and confirm the recorded series equals the raw query's result over the same range and returns in a fraction of the time.",
    dep: ["rule-evaluator","metrics-query-language","metrics-store"]
  },
  "query-federation": {
    s: "Querying across several stores, regions or clusters as if they were one, by sending sub-queries to each and merging the results, or by pulling selected series up into a global store.",
    d: "A global query layer fans a request out to regional stores, collects partial results and merges series, deduplicating where replicas hold the same data. An alternative is to forward a selected subset, such as aggregated recording-rule series, to a central store. Fan-out gives fresh, complete data but is as slow as the slowest region. Forwarding gives fast global views but only for what was chosen. The difficulty is partial failure: a missing region must be visible in the result rather than returning a total that is silently low.",
    k: ["Fan-out queries vs forwarded aggregates: fan-out is complete and slow and fragile to one region, while aggregates are fast and answer only pre-chosen questions.", "Deduplicate replicas at query time vs at write time: query-time is simple and costs compute, while write-time halves storage and needs coordination."],
    p: ["A region that times out is dropped from the merge and the global total looks like an outage.", "Different external labels or clock offsets between regions cause double counting or gaps after the merge."],
    v: "Query a global request-rate sum with all regions up, then block one region and confirm the response flags it as partial and the value differs from the full result by that region's share.",
    dep: ["metrics-store","query-frontend","multi-tenancy"]
  },
  "exemplar-links": {
    s: "Trace identifiers attached to individual metric samples, so a spike on a latency graph can be clicked to open an actual slow request that contributed to it.",
    d: "When a service records a histogram observation inside a traced request, the SDK can attach the current trace ID, timestamp and value as an exemplar. The exemplar travels with the metric through scraping or export and is stored beside the series. The graph panel shows exemplars as dots over the chart and links each to the trace viewer. It works only if the metric store keeps exemplars, if the trace was actually sampled so there is something to open, and if identifiers survive each hop of the pipeline.",
    k: ["Store exemplars with series vs derive links from time and labels: stored exemplars give exact links, while derivation needs no storage and finds only approximate matches.", "One exemplar per bucket per interval vs many: few keep storage small and cost, while more give a better choice of representative requests."],
    p: ["An exemplar that points to an unsampled trace opens an empty page and teaches people not to click.", "Aggregation in an intermediate stage drops exemplars silently, so the feature appears to work only in some dashboards."],
    v: "Send a slow traced request through an instrumented service and confirm an exemplar dot appears on the latency graph at that time and its link opens that exact trace.",
    dep: ["exemplar-capture","metrics-store","trace-viewer","histograms"]
  },
  "trace-to-log-correlation": {
    s: "Linking logs and traces through shared identifiers, so from a span one can see the log lines written during it, and from a log line one can open its trace.",
    d: "The logging layer reads the active trace and span IDs from the context and writes them as fields on every line. Log queries can then filter by trace ID, and the trace viewer builds a log query from the span's service, time range and ID. The log store must index or cheaply filter on those fields. It breaks when lines are written outside request context, such as in background threads, when IDs appear in a different format than the trace store uses, or when logs and traces are sampled independently.",
    k: ["Inject IDs into every log line vs only on error lines: every line gives complete context and slightly larger logs, while error-only keeps volume down and loses the lead-up.", "Index trace ID as a label vs filter on a field: indexing makes lookup instant and creates huge cardinality, while field filtering scans and stays cheap to store."],
    p: ["Asynchronous work that loses its context writes lines with an empty or stale trace ID, linking to the wrong request.", "Logs are kept but the trace was sampled out, so the link leads nowhere."],
    v: "Make one request that logs at three points, open its trace, follow the log link and confirm exactly those three lines appear and each carries the trace ID shown in the viewer.",
    dep: ["structured-logging","log-bridge","log-query-language","trace-viewer","context-propagation"]
  },
});
