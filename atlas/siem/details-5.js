// Details for the SIEM plate, part 5: alerts, triage and cases; investigation and search.
ATLAS.details("siem", {
  "alert-model": {
    s: "The data structure for an alert: which rule fired, which entities and events are involved, severity, status and links to evidence, so every consumer reads alerts the same way.",
    d: "An alert holds an identifier, rule reference, timestamps, severity, confidence, the entities it concerns (users, hosts, addresses), the event identifiers or a search that reproduces them, and a status. It is the unit that flows to triage, cases, automation and metrics. The design matters since every downstream feature keys on it. It is hard to keep alerts self-contained: referencing events by search breaks when data ages out, and copying events inflates storage and duplicates sensitive data.",
    k: ["Alert stores event copies vs references: copies survive retention and cost storage; references are light and break when events expire or tiers change.", "Fixed schema across all rules vs free-form per rule: fixed enables uniform triage and metrics, free-form carries rule-specific context but fragments tooling."],
    p: ["An alert linking to events by a search is empty by the time an analyst looks, because the events moved to an archive.", "Missing entity fields make alerts impossible to group or enrich."],
    v: "Take one alert from each rule type and confirm it names its entities, severity and reproducible evidence, and that the evidence is still viewable after the underlying events pass their hot-tier retention.",
    dep: ["common-schema", "entity-resolution"]
  },
  "alert-deduplication": {
    s: "Collapsing repeated alerts of the same condition into one, and grouping related alerts about one entity or incident, so analysts see one item per situation, not hundreds.",
    d: "Deduplication compares a key built from rule, entity and condition within a window and increments a count on the existing alert. Grouping goes further, merging different rules for the same entity or campaign into one incident. Keys must be chosen carefully: too specific and nothing merges, too broad and unrelated problems hide inside one item. It also interacts with status, so a closed alert that reoccurs must either reopen or create a new item.",
    k: ["Merge on exact key vs on related entities: exact is predictable and leaves volume, entity-based grouping reduces volume and can bundle unrelated activity.", "Reopen a closed alert vs open a new one: reopen preserves history, new items make each occurrence visible and countable."],
    p: ["Alerts for different users on the same rule merge because the key omitted the user.", "A dedup window longer than the incident hides a second, distinct attack under the first alert."],
    v: "Fire one rule 500 times for one host and once for another. Confirm one alert with count 500 and one separate alert, and that a recurrence after closure behaves as configured.",
    dep: ["alert-model", "entity-resolution"]
  },
  "alert-prioritization": {
    s: "Ordering alerts by how much they matter, combining rule severity, confidence, asset criticality, threat context and related activity into a score that drives the queue.",
    d: "A scoring function takes the rule's severity, the importance of affected assets and accounts, indicator confidence, number of corroborating alerts and exposure such as internet-facing. The result sorts the queue and decides paging. Poor scoring is costly: if everything is high, the queue is unordered, and if low-severity alerts sit untouched, chains of weak signals pass unnoticed. Scores need review against what analysts actually found to matter.",
    k: ["Transparent additive scoring vs learned ranking: additive is explainable and easy to adjust, learned ranking adapts to analyst behavior and is harder to audit.", "Prioritize by asset value vs by technique severity: asset value focuses on business impact and delays threats to unclassified systems."],
    p: ["Every rule marked high severity by its author makes severity useless for ordering.", "Asset criticality data is missing for new systems, so alerts on them rank lowest."],
    v: "Take last month's confirmed incidents and check the rank their alerts held when raised. Confirm most appeared in the top tenth of the queue, and identify those that did not.",
    dep: ["alert-model", "asset-context", "risk-accumulation"]
  },
  "triage-queue": {
    s: "The working list of open alerts that analysts claim, review and disposition, with filters, assignment, status transitions and bulk actions.",
    d: "Analysts see alerts sorted by priority, open one, view its context and linked events, then mark it a false positive, benign, true positive or escalate it to a case. Assignment can be manual, round-robin or by skill and shift. Every disposition is recorded and fed to tuning. The difficulty is throughput: analysts have minutes per alert, queues grow faster than they shrink, and context that takes five tabs to gather means alerts are dismissed unread.",
    k: ["Pull queue vs push assignment: pull lets analysts pick work and cherry-pick easy items; push ensures coverage and ignores skill and workload.", "Required disposition reason vs one-click close: reasons feed tuning and slow triage; one-click is quick and gives no learning signal."],
    p: ["Analysts bulk-close alerts to clear the queue, and real incidents are closed with the noise.", "An alert claimed by someone who goes off shift sits unseen until it breaches its deadline."],
    v: "Seed the queue with known true and false alerts, have analysts triage under normal conditions, and confirm time to first touch, disposition accuracy and the unclaimed-alert age report match targets.",
    dep: ["alert-prioritization", "entity-pages", "alert-deduplication"]
  },
  "case-management": {
    s: "A record of one incident or investigation that groups related alerts, evidence, tasks, communications and decisions from detection through closure.",
    d: "An analyst opens a case from an alert or hunt, attaches alerts, entities and events, assigns tasks, records findings and links responders. Cases have types, severity, status, owner and a timeline, and may follow a template for each incident class. They are the official record for review and sometimes for law enforcement. The challenge is keeping the case synchronized with fast-moving reality: evidence changes, additional alerts arrive, and different teams need different views of the same case.",
    k: ["Built-in case system vs external ticketing: built-in links tightly to alerts and evidence; external fits existing process and loses detail on synchronization.", "Templates per incident type vs free-form: templates ensure steps are not missed, free-form fits unusual incidents."],
    p: ["Related alerts attached to separate cases cause two teams to investigate the same intrusion.", "A case closed with no findings recorded leaves nothing for the next similar incident."],
    v: "Open a case from an alert, attach three related alerts and two events, assign tasks and close it. Confirm the timeline shows each action, the owner, and the final findings, and nothing is editable without a record.",
    dep: ["alert-model", "evidence-and-notes", "platform-audit"]
  },
  "evidence-and-notes": {
    s: "Capturing facts supporting a case: saved events, query results, screenshots, files and analyst notes, preserved as they were when collected with a record of who gathered them.",
    d: "Evidence is attached as a snapshot of event data with its hash, not as a live search that will change. Notes record reasoning and conclusions. Files collected from endpoints are stored with chain-of-custody metadata. For legal use, access is restricted and changes are logged. The hard part is volume and sensitivity: evidence includes personal data, must outlive hot retention, and is often needed by outside parties, which means export formats and redaction rules.",
    k: ["Snapshot of evidence vs link to live data: snapshots stay accurate and cost storage; links are small but change or vanish.", "Free-text notes vs structured findings: structured findings feed metrics and reports, free text captures reasoning without constraint."],
    p: ["Evidence saved as a search link is empty a year later when the case is reviewed.", "Case attachments with personal data are kept forever outside retention rules."],
    v: "Attach a query result to a case, let the source data expire, and open the case later. Confirm the result is intact and verifies against its stored hash, with its access history.",
    dep: ["audit-log-integrity", "raw-event-retrieval"]
  },
  "sla-and-escalation": {
    s: "Deadlines for acknowledging, investigating and resolving alerts and cases by severity, with automatic reminders and escalation to people with more authority when a deadline nears or passes.",
    d: "Each severity has targets such as acknowledgment in minutes and containment in hours, measured on a clock that may pause for waiting on third parties and respect shifts and holidays. At thresholds the system notifies the owner, then a lead, then management, and can reassign. It makes workload visible and creates accountability. Difficulty is realism: targets that cannot be met are ignored, and clocks that count after-hours time fail every alert raised overnight.",
    k: ["Business-hours clock vs continuous clock: business hours match staffing, continuous matches attacker timing and makes overnight alerts breach targets by design.", "Automatic escalation vs manual: automatic is dependable and noisy, manual relies on people noticing."],
    p: ["SLA clocks that never pause for a legitimate wait on another team inflate breach counts and are dismissed.", "Escalation contacts are out of date, and a critical page goes to someone who left."],
    v: "Raise a high-severity alert at night and leave it unacknowledged. Confirm the owner, then the lead, are notified at the configured times and that the breach is recorded in the metrics.",
    dep: ["triage-queue", "notification-routing"]
  },
  "feedback-and-tuning": {
    s: "The loop that turns analyst dispositions into detection improvements: tracking which rules produce false positives, why, and what exclusions, thresholds or logic changes fix them.",
    d: "Every closed alert carries a disposition and reason. Reports rank rules by volume and false-positive share, and show the top contributing entities. Engineers adjust the rule, add narrow suppression, fix an enrichment table or retire it, then measure the effect. Without this loop, noise only grows. The challenge is incentive: tuning is unglamorous, analysts' reasons are inconsistent, and tuning too aggressively trades missed attacks for a quiet queue.",
    k: ["Tune the rule logic vs add suppressions: logic fixes help everywhere and need engineering; suppressions are quick and local and accumulate.", "Measure precision only vs also test recall: precision falls out of dispositions, recall needs simulation and is rarely measured."],
    p: ["Rules with high false-positive rates are suppressed into silence rather than improved.", "Disposition reasons are free text, so no report can aggregate them."],
    v: "Pick the five noisiest rules, apply planned changes, and compare weekly alert volume and false-positive share before and after, while replaying known true positives to confirm they still fire.",
    dep: ["triage-queue", "suppression-and-allowlists", "rule-lifecycle"]
  },
  "query-language": {
    s: "The language analysts use to search and analyze stored events: filtering, extracting fields, aggregating, joining and visualizing, typically as a pipeline of commands.",
    d: "Queries specify a time range, source filters, then pipeline stages: parse, filter, group, join with lookups, sort and format. The planner translates them into index lookups and distributed scans. The language is the investigation's working tool, so it affects speed and error rate. Challenges include learning curve, joins that are expensive at scale, and consistency between interactive search and the language used for rules, which should behave the same.",
    k: ["Pipeline language vs SQL: pipelines suit stepwise exploration and text processing, SQL is widely known and strong at joins and aggregations.", "Powerful ad-hoc joins vs restricted operations: joins answer hard questions and can exhaust the cluster, restrictions keep searches safe and limit investigation."],
    p: ["A query with no time range scans all tiers and times out, or worse, succeeds and starves other users.", "Subtly different semantics for nulls or case between search and rules give different results for the same logic."],
    v: "Run a representative set of investigation questions, such as top talkers, rare processes and a join of logins to assets, and confirm correct results with timings within target on a day and a quarter of data.",
    dep: ["search-execution", "common-schema"]
  },
  "entity-pages": {
    s: "A consolidated view for one user, host, address or application showing its alerts, recent activity, risk and context on a single timeline, so analysts need not assemble it from searches.",
    d: "Opening an entity retrieves resolved identifiers, attributes from asset and identity context, risk score history, open alerts and cases, and an event timeline filtered to it. It reduces the time to answer who this is and what it has been doing. It is expensive to build: the page runs many queries across tiers, depends on correct entity resolution, and the timeline of a busy server can contain millions of events needing sampling or summarization.",
    k: ["Precomputed entity profiles vs on-demand queries: precomputed is instant and may be stale and costly to maintain; on-demand is current and slow for busy entities.", "Show everything vs curated highlights: everything allows full review and overwhelms, highlights hide the odd detail."],
    p: ["A shared service account's page merges the activity of many people and becomes unusable.", "The entity page omits the cold tier, so activity from two months ago is not shown and not noticed."],
    v: "Open pages for a typical user, a busy server and a shared account, and confirm each loads within target, shows alerts, context and a timeline correct for a known sample day, and notes any data not included.",
    dep: ["entity-resolution", "asset-context", "search-execution"]
  },
  "pivoting": {
    s: "Moving from one observed value to everything related to it with a click, such as from an address to all hosts that contacted it, then to the accounts on those hosts.",
    d: "Any field value in a result becomes a launching point: search for it across sources, group by another field, jump to an entity page, look it up in intelligence or open related alerts. Good pivots depend on a normalized schema and indexed fields, since the same address must be found whether it was a source or destination. Hard cases are high-cardinality values, common values such as internal gateways that match everything, and pivots that start expensive scans on cold data.",
    k: ["Predefined pivots per field type vs free-form search: predefined is fast and consistent, free-form is flexible and slower for novices.", "Pivot over all time vs a window around the event: all time finds old links and is costly, a window is quick and misses early compromise."],
    p: ["Pivoting on a shared gateway address returns millions of unrelated events and hides the real path.", "Pivots search only normalized fields, missing the same value embedded in raw message text."],
    v: "Start from one alert's address and pivot three times to a user, then a second host. Confirm each step returns correct, complete results from a seeded scenario within a few seconds.",
    dep: ["query-language", "common-schema", "indexing"]
  },
  "saved-searches-and-dashboards": {
    s: "Reusable queries and visual summaries that give teams a shared, consistent view of data quality, activity and trends, and become building blocks for reports and rules.",
    d: "A saved search stores a query with parameters, a time range and permissions; a dashboard arranges results as charts and tables that refresh on a schedule or on demand. They serve monitoring of source health, operations, threat trends and executive views. Their cost is hidden: dashboards that auto-refresh run searches constantly, shared ones may expose data beyond a viewer's rights, and stale ones show wrong numbers long after a schema change.",
    k: ["Precomputed summaries vs live queries: precomputed is fast and cheap per view and lags; live is current and expensive when many people watch.", "Shared dashboards with the owner's rights vs the viewer's: owner rights let all see it and can leak data; viewer rights are safe and show different people different numbers."],
    p: ["A dashboard refreshing every minute on forty screens runs a heavy search forty times a minute.", "A dashboard built on a renamed field shows zero and nobody notices for months."],
    v: "Open a key dashboard as restricted and as unrestricted users, and confirm each sees only permitted data. Measure the search load of a one-hour refresh cycle and compare with the cost budget.",
    dep: ["query-language", "access-control"]
  },
  "threat-hunting-workbench": {
    s: "Tools for proactively searching for attackers without an alert, with hypotheses, rare-value exploration, comparison to baselines, and a path from a finding to a new detection rule.",
    d: "Hunters start from a hypothesis, such as an attacker using remote execution tools, and explore with frequency analysis, rare processes and parents, long-tail connections and peer comparison. The workbench saves queries, records outcomes and lets a successful hunt be promoted into a scheduled or streaming rule. It depends on long retention and rich endpoint and network data. Difficulty is time and focus, since results are mostly negative, and data quality: unparsed fields hide exactly what a hunter wants.",
    k: ["Hypothesis-driven hunts vs open exploration: hypotheses are focused and repeatable, exploration finds the unknown and is hard to measure.", "Hunts on indexed hot data vs on the full lake: hot is fast and short, the lake is complete and slow."],
    p: ["Hunt findings stay in a hunter's notes and never become rules, so the same hunt is repeated forever.", "Hunts limited to the hot tier miss intrusions older than a few weeks."],
    v: "Run a hunt for a known technique over data containing a seeded instance, and confirm the workbench surfaces it, records the hunt outcome, and generates a draft rule that detects the same activity.",
    dep: ["query-language", "warm-cold-tiers", "rule-lifecycle"]
  },
  "investigation-notebooks": {
    s: "Documents that interleave queries, results, visualizations and written reasoning, so an investigation is reproducible, can be handed over and can be reused as a template.",
    d: "A notebook is a sequence of cells, each a query or note, with results stored or re-runnable. Analysts build one per case or per technique. Parameters let a template run on a new host or user. It records how a conclusion was reached, helps training and review, and can turn into a playbook. The challenge is reproducibility: queries rerun against changing data give different answers, and stored results can contain sensitive data that outlives the case.",
    k: ["Store results with the notebook vs rerun on open: stored results reproduce what the analyst saw, reruns are current and may differ or fail after retention.", "Free-form notebooks vs guided templates: guided ensure completeness, free-form fits novel intrusions."],
    p: ["A notebook that only holds queries is unreadable without the results that were visible at the time.", "Embedded results containing personal data are shared widely as a template."],
    v: "Complete an investigation in a notebook, hand it to a second analyst, and confirm they can follow the reasoning and rerun it on a different entity using parameters with correct results.",
    dep: ["query-language", "case-management", "evidence-and-notes"]
  },
  "raw-event-retrieval": {
    s: "Fetching the original, unparsed event text and its metadata for any normalized record, to verify parsing, see fields the schema dropped and present untouched evidence.",
    d: "Each normalized event keeps a pointer to or copy of its raw form and collection metadata: source, collector, receipt time and hash. Retrieval shows it beside the parsed fields. Analysts use it to check a parser, read unmapped fields, and for legal proof of what the source said. Keeping raw data roughly doubles storage, so some systems keep raw only in the archive and rehydrate on request.",
    k: ["Store raw with every event vs reference an archive: storing raw makes verification instant and costs storage; referencing is cheap and needs the archive intact and findable.", "Immutable raw store vs raw editable by masking: immutable is better evidence, while masking protects sensitive fields."],
    p: ["Raw text dropped after parsing prevents re-parsing history once a parser bug is found.", "Raw events carry credentials or personal data that bypass the field-level masking applied to parsed fields."],
    v: "Select ten events, open each raw record, and confirm its hash matches the stored hash, its text agrees with every parsed field, and that a masked field is also masked in the raw view for a restricted role.",
    dep: ["archive-and-rehydration", "parser-framework", "data-level-security"]
  },
});
