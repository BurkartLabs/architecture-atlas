// Details for the observability stack plate, part 5: platform operations and cross-cutting concerns.
ATLAS.details("observability-stack", {
  "access-control": {
    s: "Deciding who may read, write and administer telemetry, by role, team and tenant, across dashboards, query endpoints, ingest endpoints and alert configuration.",
    d: "Users authenticate through the organization's identity provider and receive roles that grant read access to certain tenants or data sources, edit rights on dashboards and rules, and admin rights on configuration. Services authenticate with tokens scoped to a tenant and to write-only or read-only use. Enforcement sits in a gateway or in the stores, and sometimes at label level so a team sees only its own services. It is hard because telemetry is a rich source of sensitive information, and permissive defaults spread quickly while restrictions block incident response.",
    k: ["Broad read access by default vs least privilege: broad access speeds incident response and exposes sensitive data, while least privilege protects it and slows debugging across teams.", "Enforce at the gateway vs in each store: a gateway is a single place to manage and bypassable if stores are reachable, while per-store enforcement is thorough and duplicated."],
    p: ["Ingest tokens that also allow queries let a leaked agent credential read all data.", "Label-based restrictions are bypassed by a query that selects on a different label combination."],
    v: "Using accounts with different roles, confirm each can access only the permitted tenants and actions, a write-only token is refused on queries, and denied attempts appear in the audit trail.",
    dep: ["multi-tenancy","audit-trail","transport-security"]
  },
  "redaction-and-scrubbing": {
    s: "Removing or masking sensitive values such as personal data, tokens and card numbers from logs, spans and metric labels, before the data leaves the process or the collector.",
    d: "Rules match field names, patterns such as card numbers or email addresses, and known sensitive attributes, and then delete, hash or truncate the value. Redaction is applied at several layers: in the SDK before export, in processors in the agent and gateway, and in logging libraries that mask structured fields. Defense in depth is needed since no single stage sees everything. It is hard because sensitive data appears in free-text messages, query strings and exception text, which pattern matching finds imperfectly.",
    k: ["Redact at the source vs in the pipeline: source redaction means the data never leaves the process, while pipeline redaction is central, quick to change and sees data after it has crossed the network.", "Allowlist known-safe attributes vs denylist known-sensitive: an allowlist is safe by default and hides useful data until approved, while a denylist keeps everything and misses what nobody listed."],
    p: ["A pattern for card numbers misses values with unusual spacing and leaves them in stored logs.", "Redaction applied after the exporter's debug logging writes the raw value into the collector's own logs."],
    v: "Send test telemetry containing an email, a card number and a token in attributes, messages and URLs, and confirm none of the raw values appear in any store while hashed or masked forms do.",
    dep: ["processors","secrets-detection","structured-logging"]
  },
  "transport-security": {
    s: "Encrypting and authenticating every hop that carries telemetry, from application to agent, agent to gateway, gateway to store and store to query, with certificates or tokens.",
    d: "Connections between components use TLS, with mutual authentication where a collector or store must know which client is calling. Certificates are issued by an internal authority and rotated automatically, and tokens identify tenants on top of the channel. Local loopback hops may be left unencrypted by policy. Bandwidth and CPU costs rise with encryption. It is hard because certificate expiry is a classic silent failure of telemetry, and rotating credentials across thousands of agents requires automation that is itself monitored.",
    k: ["Mutual TLS vs bearer tokens only: mutual TLS authenticates machines strongly and needs certificate infrastructure, while tokens are simple to issue and easier to leak and replay.", "Encrypt loopback traffic vs allow plaintext locally: encryption protects against local snooping and adds overhead, while plaintext is simple and acceptable on a trusted host."],
    p: ["An expired certificate stops all telemetry from a fleet at once and the failure is visible only as missing data.", "Disabling certificate verification to get past a setup error remains in production."],
    v: "Connect a test agent with a valid certificate, an expired one, and none, and confirm only the valid one is accepted and the rejections are logged with the reason.",
    dep: []
  },
  "audit-trail": {
    s: "A tamper-resistant record of who queried what data, changed which rules and dashboards, created which silences and altered which access, kept separately from the telemetry itself.",
    d: "The platform emits an event for every administrative action and for sensitive reads, with the actor, time, target and result. Events go to an append-only store that operators of the monitored systems cannot edit. Reviewing the trail answers questions such as who silenced the alert before the outage and who read a tenant's logs. It is hard because volume grows with query traffic, and the trail must stay available when the main platform is failing, which argues for storing it somewhere independent.",
    k: ["Log every query vs only administrative changes: every query supports investigation of data access and is large, while changes only is small and silent about reads.", "Store in the platform vs in an independent system: in-platform is easy and fails with it, while an independent store survives and costs another system to run."],
    p: ["Audit events written to the same store that an administrator can edit are not evidence of anything.", "Silence and rule changes made through an unlogged API path leave no record of who muted the alerts."],
    v: "Create a silence, edit an alert rule and run a query as a test user, and confirm each appears in the trail with actor, time and target, and that an administrator cannot alter the entries.",
    dep: ["access-control"]
  },
  "secrets-detection": {
    s: "Scanning telemetry in flight and at rest for credentials, keys and tokens that were logged by mistake, and flagging, masking or alerting so they can be rotated.",
    d: "Detectors apply patterns for known credential formats and entropy checks for random-looking strings to log lines, span attributes and exception text. A match can trigger masking in the pipeline, a security alert and a record of which service leaked it. Scans also run over stored data to find what earlier rules missed. It is hard because the checks run on high-volume data and produce false positives, and because a secret in a log store has already been copied to backups and viewers.",
    k: ["Scan in the pipeline before storage vs scan stored data afterward: pipeline scanning prevents storage and adds latency and CPU, while stored scans catch more with the secret already written.", "Mask on match vs drop the whole record: masking keeps the useful record and risks leaving fragments, while dropping is safe and loses diagnostic context."],
    p: ["High-entropy identifiers match as secrets, and the false positives teach teams to ignore the alerts.", "A key found in logs is masked but never rotated, though it was readable for weeks."],
    v: "Log a test credential in each supported format from a test service, and confirm each is masked in the stored record and a security alert names the source service.",
    dep: ["processors","redaction-and-scrubbing","alert-rules"]
  },
  "pipeline-self-metrics": {
    s: "Metrics the platform emits about itself: items received, dropped, queued and exported at each stage, queue depth, export latency, ingest lag and query errors, so loss is measured rather than assumed.",
    d: "Every stage counts accepted, refused, dropped and failed items with a reason label, and exposes queue size, batch size, retry counts and the age of the oldest unexported item. Stores report ingest lag, series counts and rejected samples. Together these allow an end-to-end accounting: items sent equals items stored plus items dropped for named reasons. It is hard because the numbers must be trustworthy and cheap, and because the metrics travel through the same pipeline they describe unless routed separately.",
    k: ["Count drops by reason vs a single drop counter: reasons let operators act directly on the cause, while one counter is simple and forces a log hunt.", "Send self-metrics through the same pipeline vs a separate path: the same pipeline is simple and goes silent with the failure, while a separate path survives it and is more to run."],
    p: ["Drop counters that no alert watches let a pipeline lose data for weeks.", "Counting at one stage only hides loss that occurs between the other stages."],
    v: "Send a known number of items, force drops at two different stages, and confirm received equals exported plus dropped across stages, with each drop attributed to its stage and reason.",
    dep: ["exporters","backpressure","metrics-store"]
  },
  "dead-mans-switch": {
    s: "An alert that is always firing while the monitoring works, so that the absence of its notification at the receiving end proves the evaluation and notification path has failed.",
    d: "A rule with a condition that is always true sends a heartbeat notification through the whole alert path to an external service on a fixed interval. The external service pages someone if the heartbeat stops. Unlike a normal alert, it detects failure of the evaluator, the router and the network between them, which can never report themselves. It is hard because the receiver must be outside the failure domain, and the heartbeat must follow the same route as real pages to prove anything.",
    k: ["External receiver vs one inside the platform: external survives total platform loss, while an internal receiver is simple and dies with the thing it watches.", "Heartbeat through the real route vs a separate test route: the real route proves real pages can be delivered, while a separate route is stable and may succeed when the real one fails."],
    p: ["A heartbeat sent through a different path than real alerts keeps reporting health while real pages are undeliverable.", "The external heartbeat check pages a mailbox nobody reads."],
    v: "Stop the notification router and confirm that within the configured heartbeat interval the external service pages a person, and that restarting the router clears it.",
    dep: ["alert-rules","notification-router","on-call-integration"]
  },
  "independent-meta-monitoring": {
    s: "A small, separate monitoring setup that watches the main platform's health, using its own storage and alerting, so an outage of the main platform is still detected and reported.",
    d: "A minimal stack, run in a different failure domain and sometimes by different means, scrapes the main platform's health endpoints and key self-metrics and sends its own alerts. It checks that ingest is flowing, queries answer, rules are evaluated and notifications go out, often by running canary writes and reads. It is kept deliberately simple so it has few ways to fail. The difficulty is resisting growth: the meta system is only useful if it does not depend on the main one.",
    k: ["Separate small stack vs the main platform monitoring itself: separate survives a total outage, while self-monitoring is cheap and blind to the worst failures.", "Canary writes and reads vs health endpoints only: canaries prove the whole path works and need maintenance, while endpoints are cheap and report liveness without correctness."],
    p: ["A meta-monitor sharing storage or network with the main platform fails with it.", "A canary that writes and reads a fixed series passes when real tenants' data is being dropped."],
    v: "Take down the main platform's ingest path and confirm the independent monitor alerts within its window, using only its own storage and notification route.",
    dep: ["dead-mans-switch","pipeline-self-metrics","on-call-integration"]
  },
  "collector-fleet-management": {
    s: "Tracking and controlling the thousands of agents and collectors: their versions, health and configuration, and the ability to push changes or restart them in controlled waves.",
    d: "Each agent reports its identity, version, effective configuration and health to a management service, which can send a new configuration or request an upgrade. Rollouts proceed in stages by group, with health checks between waves. The inventory shows which hosts have no agent or an outdated one. It is hard because agents run on machines the platform team does not fully control, a bad configuration can silence an entire group, and the management channel must work when telemetry does not.",
    k: ["Central push of configuration vs agents pulling from a repository: push is fast and needs a live channel, while pull is simple and robust and slower to converge.", "Staged waves vs all at once: waves limit the blast radius of a bad change and take longer, while all at once is quick and makes mistakes fleet-wide."],
    p: ["A configuration pushed to all agents at once that rejects every input stops telemetry fleet-wide.", "Agents on forgotten hosts run old versions with known bugs because inventory lists only healthy ones."],
    v: "Roll a configuration change to a ten percent group with a deliberate error, and confirm health checks halt the rollout, the group reverts, and the inventory lists every agent's version and configuration hash.",
    dep: ["local-agent","gateway-collector","telemetry-config-rollout"]
  },
  "telemetry-config-rollout": {
    s: "The process of changing pipeline, sampling, alert and retention configuration safely: validated, reviewed, applied in stages and reversible, since a wrong change can blind or flood the platform.",
    d: "Configuration lives in version control, is checked by automated validation that parses it and runs it against sample data, and is applied through the same staged mechanism as software. Alert and recording rules can be unit tested against recorded series. Changes to sampling or filters show their predicted effect on volume before they apply. It is hard because the effects are delayed and indirect: a bad filter or an overly aggressive sampling rule shows up as missing data days later, when someone needs it.",
    k: ["Test against recorded data vs validate syntax only: recorded-data tests catch behavior changes and need good fixtures, while syntax checks are cheap and miss logic errors.", "Dry run showing predicted volume vs apply and observe: dry runs prevent surprise cost and data loss and need an engine that can simulate, while observing is simple and costly when wrong."],
    p: ["A syntactically valid filter that drops the wrong service is accepted and shows as a quiet fleet.", "Emergency edits made directly on the running system are never committed and revert at the next apply."],
    v: "Submit a change that drops half of a test service's logs, and confirm validation reports the predicted volume change before apply, and rollback restores the previous behavior within one cycle.",
    dep: ["dashboards-as-code","collector-fleet-management","processors"]
  },
  "cardinality-and-cost": {
    s: "The decision about how many distinct series, label values and stored bytes the platform will accept, and who pays, which constrains instrumentation, pipeline and storage together.",
    d: "Cost scales with the number of unique label combinations for metrics, the volume of text for logs and the number of spans for traces, not with the amount of information that is useful. The decision spans every layer: instrumentation chooses labels, the pipeline drops or aggregates, stores enforce limits, and finance sees attribution. Making it early means agreeing a budget per team, naming allowed labels and putting identifiers into traces and logs instead of metrics. Making it late means an invoice or an outage as the first warning.",
    k: ["Budgets and limits per team vs a shared pool: budgets create accountability and friction, while a shared pool is easy and lets one team consume everything.", "Allow labels freely and prune later vs approve labels first: free labels speed development and create expensive cleanup, while approval keeps cost bounded and slows instrumentation."],
    p: ["One new label with many values is deployed and the bill or memory use grows tenfold before anyone notices.", "Cost controls added only at the store reject data after the application has already paid to produce it."],
    v: "Deploy a change that adds a label with a thousand values in a test tenant, and confirm that limits, analysis and the cost report each flag it within one day, naming the metric and the owning team.",
    dep: ["cardinality-limits","cost-attribution","cardinality-analysis","tenant-quotas"]
  },
  "loss-tolerance": {
    s: "The decision about which telemetry may be lost, in what circumstances and how loss is reported, because every buffer, queue and sampling step is a choice between loss, delay and failure.",
    d: "Telemetry is rarely worth stopping a service for, so most paths drop rather than block, and the question is where and what. Alert-relevant metrics warrant durable queues and retries, debug logs may be dropped under load, and traces are sampled by design. Delivery semantics, at-least-once with duplicates or at-most-once with gaps, follow from that choice. Every stage must count what it loses. Without that accounting, a quiet dashboard cannot be told apart from a healthy system, which is the worst failure an observability platform has.",
    k: ["At-least-once with duplicates vs at-most-once with gaps: at-least-once needs idempotent stores and survives outages, while at-most-once is simple and loses data during every restart.", "Block the application vs drop telemetry: blocking keeps all data and risks outages caused by monitoring, while dropping protects the service and loses data."],
    p: ["Loss that is not counted looks like health, and teams learn about it during an incident review.", "Different loss policies at each stage make it impossible to state what fraction of data survives."],
    v: "Stop the backend under load and confirm that each stage's counters account for every item as delivered, queued or dropped by named reason, and the totals reconcile with what the senders reported.",
    dep: ["retry-and-persistent-queue","backpressure","pipeline-self-metrics","write-ahead-log"]
  },
  "fidelity-vs-volume": {
    s: "The decision about how much detail to keep for each signal: sampling rates, metric resolution, log levels and retention, trading the ability to explain rare events against the cost of storing everything.",
    d: "Detail is expensive, and its value is concentrated in rare, unpredictable moments. Policies decide the scrape interval, the share of traces kept, whether to keep debug logs and how long raw data lives before downsampling. Errors and slow requests deserve full fidelity and routine traffic does not, which pushes sampling decisions toward the end of the request. Whatever is dropped cannot be reconstructed, so the decision should be explicit and tied to the questions the organization expects to ask.",
    k: ["Keep everything briefly vs sample for longer: brief full retention answers recent incidents in detail, while longer sampled retention supports trends and loses rare events.", "Decide by outcome vs by volume: outcome-based sampling keeps what matters and needs stateful pipeline stages, while volume-based rules are simple and blind."],
    p: ["Rates chosen for cost alone leave too little data for the rare failure that actually needs explanation.", "Raw detail expires before a slow-developing problem is noticed, so there is nothing to compare."],
    v: "Recreate a past incident from sampled and downsampled data and confirm the retained data is enough to identify the cause, and record which questions could not be answered.",
    dep: ["tail-based-sampling","downsampling","retention-tiers","log-filtering-and-sampling"]
  },
  "naming-and-schema": {
    s: "The decision to agree names, units, label sets and attribute meanings across teams before building dashboards and alerts, since inconsistent names make cross-service queries and shared tooling impossible.",
    d: "Every signal carries names that someone later queries: metric names and units, label keys, attribute keys, log fields and service names. A convention fixes them, usually by adopting a shared standard and adding a short list of local rules, and enforces it with lint in the pipeline or in code review. The convention has to cover change: renames break queries, so versions and translations are part of it. Teams that skip this end up with several names for one thing and dashboards that quietly show part of the fleet.",
    k: ["Enforced convention vs documented guidance: enforcement keeps data consistent and creates friction for new teams, while guidance is easy and drifts.", "Central ownership of names vs team-owned: central ownership gives consistency and a bottleneck, while team ownership is fast and diverges."],
    p: ["Two spellings of a service name split its data in two and each half looks healthy.", "Units omitted from metric names lead to seconds being compared with milliseconds on one graph."],
    v: "Lint the pipeline's live telemetry against the convention and confirm the report lists every non-conforming name by owner, and a new test metric with a bad name is rejected or flagged.",
    dep: ["semantic-conventions","telemetry-schema-versions","target-relabeling","resource-attributes"]
  },
  "time-and-clocks": {
    s: "The decision about which timestamp to trust and how to handle skew, delay and ordering, since correlation across services, alert timing and trace layout all depend on clocks that are never exactly right.",
    d: "Each signal has several times: the event time on the source host, the time a scraper observed it, and the time a store received it. Alerts, rates and graphs depend on which is used and on how much late and out-of-order data is accepted. Traces compare timestamps from different machines, so skew makes children begin before parents. The decision sets clock synchronization requirements, ingestion windows for late data and rules for sources with clocks far in the past or future.",
    k: ["Event time from the source vs receipt time: event time is accurate for delayed data and trusts every host clock, while receipt time is consistent and shifts delayed events.", "Accept late samples within a window vs reject them: accepting preserves data from slow or reconnecting sources and complicates compaction and alerts, while rejecting is simple and loses data."],
    p: ["A host with a drifting clock writes samples that are rejected as too old or too new without any visible error.", "Alerts evaluated on data that arrives late fire after the fact or never."],
    v: "Skew a test host's clock by two minutes and confirm its samples are handled according to policy, its spans are displayed with the documented adjustment, and the skew itself appears in a monitored metric.",
    dep: ["metrics-store","trace-viewer","push-ingest","write-ahead-log"]
  },
  "failure-independence": {
    s: "The decision to keep monitoring alive through the failures it must report, so the platform does not share networks, accounts, clusters or credentials with the services it watches, or depend on them to alert.",
    d: "An observability platform that runs on the same cluster, behind the same network and with the same identity provider as the product it monitors goes dark during the failure it was built to catch. Independence is a spectrum: separate clusters, separate regions, a separate notification provider, and a small meta-monitor outside everything. Each step costs money and operational effort, and the decision is which failures must be survivable. It also applies to people: the way to read the dashboards during an outage must not depend on the broken system.",
    k: ["Shared infrastructure vs a separate failure domain: shared is cheap and fails together with the product, while separation survives the outage and doubles things to run.", "Hosted notification path vs self-run: a hosted path survives your own network failure and adds a third party, while self-run keeps control and fails with the infrastructure."],
    p: ["Dashboards served from the cluster that just failed cannot be opened during the incident.", "The alert router and the product share one authentication service, and an outage there locks out responders."],
    v: "Take down the monitored product's cluster and network in a drill, and confirm alerts still fire and arrive and dashboards still load for responders.",
    dep: ["independent-meta-monitoring","dead-mans-switch","on-call-integration","transport-security"]
  },
});
