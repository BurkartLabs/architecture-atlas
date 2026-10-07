// Details for the SIEM plate, part 4: correlation and behavior analytics; detection rules.
ATLAS.details("siem", {
  "correlation-engine": {
    s: "The component that evaluates conditions across multiple events, sources and time, so that several weak signals can together produce one alert about a single incident.",
    d: "Normalized events flow into an engine that holds rule definitions and state: counters, sets of seen values and partial sequences per entity. When a condition completes, it emits an alert referencing the contributing events. It runs either as a stream processor on live data or as scheduled searches over stored data. Hard parts are state size, ordering and lateness of events from different sources, and explaining why an alert fired, since the evidence is spread across many records.",
    k: ["Streaming evaluation vs scheduled search: streaming alerts in seconds and holds state in memory, scheduled search is simpler, reuses storage and delays detection by its interval.", "Correlate by entity key vs by free-form query: keys scale and partition cleanly, queries are flexible and cost more per rule."],
    p: ["Events from two sources arrive minutes apart, so a sequence rule never sees both inside its window.", "Alerts carry only a summary, so analysts cannot see the events that made the condition true."],
    v: "Replay a recorded attack of four events across three sources with realistic delays and confirm one alert fires, listing all four events, within the target delay of the last one.",
    dep: ["stateful-windows", "common-schema", "streaming-rules", "ingest-buffer"]
  },
  "sequence-detection": {
    s: "Detecting an ordered series of events by the same entity within a time limit, such as a failed login series followed by a success, then a new privilege and a large transfer.",
    d: "A sequence rule defines steps, the key that ties them, and the maximum gap or total time. The engine keeps a partial match per key, advances it when the next step arrives and expires it on timeout. It captures attack stages that single events cannot. The difficulty is ordering and cardinality: out-of-order arrival breaks naive matching, keys with millions of values create millions of partial matches, and strict steps miss attackers who insert harmless events between them.",
    k: ["Strict consecutive steps vs allowing unrelated events between: strict gives precision and low state, allowing gaps matches real behavior and risks wider matches.", "Event-time ordering with a lateness allowance vs arrival order: event-time handles delay but waits to be sure; arrival order is immediate and wrong under skew."],
    p: ["A step defined on a field the second source never populates means the sequence can never complete.", "Long windows over a high-cardinality key exhaust memory and evict state for real attacks."],
    v: "Run three variants through the rule: correct order within the window, correct order outside it, and reversed order. Confirm only the first alerts, and that a delayed second step still matches under the lateness allowance.",
    dep: ["correlation-engine", "stateful-windows", "timestamp-handling"]
  },
  "threshold-and-aggregation": {
    s: "Alerting when a count, sum, rate or number of distinct values for an entity crosses a limit within a window, such as many failed logins, many targets contacted or unusual data volume.",
    d: "A rule groups events by keys like user or source address, computes a metric over a window, and compares it to a fixed value or a relative baseline. Distinct counts detect scanning and password spraying; sums detect bulk transfer. It is the workhorse of detection. The tuning problem is the threshold itself: too low floods analysts with legitimate bursts, too high lets slow attacks stay under it, and a fixed value cannot suit both a small office and a data center.",
    k: ["Fixed thresholds vs baseline-relative: fixed are transparent and predictable but poorly suited to varied entities; relative adapt and are harder to explain.", "Tumbling windows vs sliding windows: tumbling are cheap but split bursts at boundaries; sliding catch them and cost more state."],
    p: ["An attacker who stays one attempt below the threshold per window is never detected.", "A service account that legitimately fails thousands of times a day triggers the same rule on every run."],
    v: "Generate failures just below, at and above the threshold for one user and one source address, across a window boundary, and confirm alerts fire exactly where the rule says they should.",
    dep: ["stateful-windows", "correlation-engine"]
  },
  "stateful-windows": {
    s: "The state store and windowing machinery that remembers recent events per entity, such as counters, sets and partial sequences, and expires them as time passes.",
    d: "Streaming rules need memory: how many failures has this user had, which hosts has this account touched. State is kept in memory or an embedded store, partitioned by key, checkpointed to durable storage and discarded when windows close. Time is driven by event timestamps with watermarks that decide when a window is complete. Challenges include state growth, recovery after a restart, and skew when one key dominates a partition.",
    k: ["In-memory state with checkpoints vs durable state store: memory is fastest, but recovery replays from checkpoints; durable stores recover instantly and cost more per access.", "Wait for late events vs close windows quickly: waiting is more correct and delays alerts, closing early is fast and misses late data."],
    p: ["A restart without checkpoints loses all windows, and attacks in progress become invisible for the whole window length.", "State for departed entities is never evicted and grows without bound."],
    v: "Build up state with a partial sequence, kill and restart the engine, then send the final step. Confirm the alert fires, and that state for an idle entity is evicted after its window expires.",
    dep: ["ingest-buffer"]
  },
  "entity-resolution": {
    s: "Linking the many identifiers for one real user, host or device, such as accounts, addresses, names and cloud identifiers, into a single entity so activity can be tied together.",
    d: "Events name actors differently: a directory login uses one form, a cloud log another, a web proxy an address, and an application a numeric id. Resolution uses identity records, address leases and session mappings, with time validity, to attach a stable entity identifier. Behavioral models, risk scores and timelines all key on it. It is hard because identifiers change over time, mappings are incomplete, and a wrong merge of two people is worse than leaving them separate.",
    k: ["Deterministic matching on trusted keys vs probabilistic matching: deterministic is explainable and conservative, probabilistic links more and produces occasional merges nobody can justify.", "Resolve at ingest vs at query: ingest stamps the answer valid at that moment, query-time sees changes and costs more."],
    p: ["A shared account or a reused address merges activity of different people into one suspicious entity.", "A lease mapping applied without time bounds attributes yesterday's activity to today's holder of the address."],
    v: "For a user with accounts in three systems and a laptop whose address changed twice in a day, confirm the timeline shows one person and attributes each event to the right holder at the time.",
    dep: ["asset-context", "timestamp-handling"]
  },
  "behavior-baselines": {
    s: "Statistical profiles of normal activity for each user, host or peer group, such as usual hours, locations, volumes and accessed resources, against which current activity is compared.",
    d: "A baseline job summarizes each entity's history over weeks, as histograms, sets of usual values and rates per time of day, and compares with peer groups to deal with new entities. Current behavior is scored against it. It needs history, clean entity resolution and a plan for change, since people change roles, travel and work irregular hours. The difficulty is poisoning: if an intruder is present while learning, the baseline absorbs the attack as normal.",
    k: ["Individual baselines vs peer-group baselines: individual is more precise for stable people but needs history; peer groups work for new entities and miss individual drift.", "Long learning window vs short: long is stable and slow to adapt, short follows real change and learns attacker behavior faster."],
    p: ["A new employee has no history, so every first action looks anomalous until the baseline matures.", "A compromised account active during the learning period becomes part of its own normal."],
    v: "Build baselines from a month of history, then replay a known-normal day and a day with injected after-hours bulk access. Confirm the normal day scores low and the injected activity scores high.",
    dep: ["entity-resolution", "hot-tier", "warm-cold-tiers"]
  },
  "anomaly-models": {
    s: "Statistical or learned models that score how unusual an event or sequence is, to surface behavior that no written rule describes, such as rare process chains or odd access patterns.",
    d: "Models range from simple outlier tests on counts to clustering, sequence models and supervised classifiers trained on labeled incidents. Inputs are features computed from events and baselines; outputs are scores, which feed alerts or risk. They are retrained as data drifts. The hard parts are explanation, since an analyst needs to know why something was flagged, labeled data that is scarce, and a base rate problem: rare attacks in huge volumes yield many false alerts even from accurate models.",
    k: ["Unsupervised anomaly detection vs supervised classifiers: unsupervised finds novel behavior and flags much benign rarity; supervised is more precise and only finds what resembles its training labels.", "Alert on score vs feed score to risk accumulation: direct alerts are simple and noisy, accumulation waits for corroboration."],
    p: ["A model alerts on rare but harmless administrative work and analysts stop trusting its output.", "A model trained during an unusual quarter drifts and quietly stops detecting normal-looking attacks."],
    v: "Evaluate on labeled historical incidents and a held-out clean month, report detection and false alert counts per week, and confirm each alert lists the features that drove its score.",
    dep: ["behavior-baselines", "entity-resolution"]
  },
  "risk-accumulation": {
    s: "Adding small scored observations to an entity's running risk and alerting when the total crosses a limit, so many weak signals can add up to one strong one.",
    d: "Instead of every minor rule producing an alert, each contributes a score and a reason to the user or host involved. Scores decay over time and are weighted by confidence and asset importance. A single threshold alert fires when the total passes a limit, and carries the list of contributions. It reduces alert counts and finds slow campaigns. Difficulty is calibration: weights are arbitrary until tested, one noisy rule can dominate the total, and double counting related signals inflates scores.",
    k: ["Risk-based alerting vs alert per rule: accumulation cuts noise and finds slow attacks, but delays alerts and makes individual rule outcomes harder to explain.", "Decay with time vs reset per day: decay models lingering suspicion, resets are simpler and let patient attackers stay under the limit."],
    p: ["One chatty rule contributes most of the score for every entity, so alerts reflect rule volume, not risk.", "Correlated signals from one root cause, such as a single tool, are counted several times."],
    v: "Inject five low-severity observations for one test user across three days and confirm the total, with decay, crosses the limit once, and that the alert lists each contribution with its source rule.",
    dep: ["entity-resolution", "correlation-engine", "asset-context"]
  },
  "rule-language": {
    s: "The notation in which detections are written, from simple field matches to boolean logic, aggregations and sequences, ideally portable across backends and readable by auditors.",
    d: "Languages are query-like, such as pipelines over events, or declarative, such as selection and condition blocks in a portable format. A rule has metadata (title, severity, tags, references), a detection logic part, and output fields. Portable languages compile to each platform's query form. Expressive power is a trade-off: simple formats are easy to share and review, but cannot express stateful logic, and powerful ones tie content to one engine.",
    k: ["Portable declarative format vs native query language: portable lets content be shared and moved between backends, but cannot use every feature; native is powerful and locks content in.", "Rules as data with a schema vs free-form scripts: data is validated and analyzed for coverage, scripts can do anything and defeat analysis."],
    p: ["A rule written against raw field names works for one source and silently never matches another.", "Case-sensitive comparison on a field that varies in case misses attacker commands with different casing."],
    v: "Write one rule against schema fields, compile it for each supported backend, run each against the same labeled sample data, and confirm identical matches and no unsupported-feature warnings.",
    dep: ["common-schema", "query-language"]
  },
  "rule-compiler": {
    s: "Translates a rule into an executable form for the engine and checks it, rejecting unknown fields, malformed logic, unbounded cost and conflicting metadata before it goes live.",
    d: "The compiler parses the rule, resolves field names against the schema, checks types, rewrites it into a query or streaming operator graph and estimates cost, such as whether it scans all data or needs an unindexed field. It can reject or warn. It also assigns identifiers and extracts dependencies on sources, lookups and schema versions. The challenge is catching the failure that looks like success: a rule referencing a field no source fills compiles fine and never fires.",
    k: ["Strict validation against the live schema vs permissive compile: strict prevents dead rules, but blocks rules for sources not yet onboarded.", "Cost limits at compile time vs at run time: compile-time estimates reject obvious scans early, run-time limits catch what estimates miss."],
    p: ["A rule that compiles cleanly but references a field present in no data is accepted and never alerts.", "A schema change makes yesterday's valid rule invalid, and the failure appears only when it next runs."],
    v: "Submit rules with an unknown field, a wrong type, an unbounded wildcard and a valid body. Confirm the first three are rejected with specific messages and the valid one reports its data dependencies.",
    dep: ["rule-language", "common-schema", "schema-evolution"]
  },
  "scheduled-rules": {
    s: "Rules run as queries at regular intervals over stored data, producing an alert for each result, and well suited to rules that need history, joins or large aggregations.",
    d: "A scheduler runs the query every few minutes to hours with a lookback window, tracks the last run time and suppresses repeated results. It reuses the search engine, so it sees every field and tier. Latency is the interval plus indexing delay. The difficulties are gaps and overlap: a late event arriving after the window closed is missed, overlapping lookbacks alert twice, and many rules scheduled together overload search.",
    k: ["Short interval vs long: short lowers delay and raises load; long is cheap and gives attackers time.", "Lookback longer than the interval vs equal: overlap catches late-arriving events but needs deduplication of repeat alerts."],
    p: ["A rule whose run overran its interval skips the next, so a window of time is never checked.", "A rule evaluated against ingest time misses events whose timestamps are earlier than the lookback."],
    v: "Insert an event with a timestamp slightly in the past after a scheduled run. Confirm the next run catches it exactly once, and that jittered start times keep rules from all running at once.",
    dep: ["search-execution", "rule-compiler", "indexing"]
  },
  "streaming-rules": {
    s: "Rules evaluated on events as they flow through the pipeline, before or just after storage, giving alerts within seconds for conditions that need only recent state.",
    d: "A streaming rule is a compiled operator in the pipeline: filter, enrich, window and emit. It reads from the ingest buffer, holds state for windows and writes alerts. Delay is seconds. It cannot look at arbitrary history without storage queries, and every rule adds per-event cost to the entire stream. Limits of this approach are skew, state size, and the need for rule changes to take effect without restarting the pipeline or losing state.",
    k: ["Evaluate in the stream vs after storage: stream gives seconds of delay and no storage dependency, post-store can use any historical data and any field.", "Many rules in one shared graph vs one job per rule: shared graphs reuse parsing and filters, but one faulty rule can affect all."],
    p: ["Adding a costly rule slows the whole stream, so every other detection is delayed.", "A hot reload of rules drops window state, and a sequence in progress is never completed."],
    v: "Send a matching event and time the path to an alert, then add a rule while the stream is running and confirm throughput and the state of existing windows are unchanged.",
    dep: ["ingest-buffer", "stateful-windows", "rule-compiler"]
  },
  "rule-library": {
    s: "A curated body of detection content, organized by data source and attacker behavior, with severity, false-positive notes and references, which teams adopt, adapt and extend.",
    d: "Content comes from the platform vendor, community projects, threat research and the team's own incidents. Each rule carries documentation: what it detects, required data, known false positives, response guidance. Packs group rules by source or scenario. Enabling a rule assumes its data exists and its schema matches. Quality varies widely, and a large enabled library is a liability if nobody understands what each rule does.",
    k: ["Enable a large library at once vs adopt incrementally: wholesale gives apparent coverage quickly and floods analysts; incremental takes longer and keeps each rule understood and tuned.", "Vendor-managed content vs owned copies: managed content updates automatically but changes behavior under you; owned copies are stable and drift out of date."],
    p: ["Hundreds of default rules enabled without the data they need produce no alerts, giving a false sense of coverage.", "Updated vendor content overwrites local tuning and old false positives return."],
    v: "For every enabled rule, confirm its required source is flowing and its last firing or last test replay date. List rules that have never matched anything and decide whether each is rare or broken.",
    dep: ["rule-language", "technique-mapping", "content-sync"]
  },
  "rule-lifecycle": {
    s: "The path a detection follows from idea through development, testing, deployment, tuning and retirement, with owners, versions, and review so that every live rule is known and maintained.",
    d: "A rule begins as a hypothesis from an incident, report or hunt, is written and tested against sample data, deployed in a silent mode that records matches without alerting, promoted to alerting, and reviewed periodically for precision and relevance. Each has an owner, version history and metrics. It is hard because rules are abandoned: sources change, authors leave, and a rule left running without review decays into noise or silence.",
    k: ["Silent trial before alerting vs direct deployment: a trial period shows real false-positive rates before analysts feel them, and delays protection from a new threat.", "Per-rule owners vs a central detection team: owners know context, a central team keeps standards and may lack local knowledge."],
    p: ["A rule with no owner and no review date keeps firing 200 times a day, and everyone ignores it.", "A rule retired without checking dependents breaks a correlation that referenced its alerts."],
    v: "Choose ten live rules at random and confirm each has an owner, last review date, version history and a recent precision figure from analyst dispositions, and flag any that fail.",
    dep: ["rule-testing", "feedback-and-tuning", "content-sync"]
  },
  "rule-testing": {
    s: "Running a rule against recorded or generated events, with known expected results, before it goes live and every time its inputs change, to prove it fires when it should and not otherwise.",
    d: "Tests supply sample events, both malicious and benign, and assert whether the rule matches. Replay runs the rule over weeks of historical data to measure how many alerts it would have produced. Attack simulation executes real techniques in a lab and checks the full path from event to alert. Hard because good test data is scarce, parsers change what the rule sees, and a passing unit test says nothing about whether production sources actually deliver those events.",
    k: ["Synthetic sample events vs replay of real history: synthetic is precise and cheap, replay shows real volume and false positives but cannot prove detection of an attack not in the data.", "Simulate attacks end to end vs test rules in isolation: end to end finds collection and parsing gaps, and is slower and harder to automate."],
    p: ["Tests written with hand-made events pass while production events use a different field format.", "A rule is tested once, and nobody retests it after the parser changes underneath it."],
    v: "Run an attack technique in a lab host and confirm an alert appears with the expected rule, entities and evidence. Re-run the rule's test set after each parser or schema change and confirm results are unchanged.",
    dep: ["rule-compiler", "parser-library"]
  },
  "technique-mapping": {
    s: "Tagging each rule with the attacker techniques it detects, using a public taxonomy, and rolling the tags up into a coverage view that shows where detection is thin or absent.",
    d: "Rules carry technique identifiers. A coverage matrix counts rules per technique, ideally weighted by whether data sources exist and whether the rule has been tested. It guides what to write next and gives leadership a measure. It is a map of intent, not of capability: a technique is tagged covered by one rule that may be trivially evaded, and a heat map filled in by enabling a pack says nothing about real detection.",
    k: ["Coverage by rule count vs by tested detection: counts are easy to produce and flatter, tested coverage is honest and costs simulation effort.", "Fine-grained technique tags vs tactics only: fine tags show gaps precisely, tactics-level are easier to maintain and hide them."],
    p: ["Coverage reported from enabled rules includes rules whose source is not collected, overstating protection.", "One loose rule tagged to a dozen techniques turns most of the map green."],
    v: "For a sample of techniques marked covered, run the technique in a lab and confirm an alert fires. Report the share that detect as the tested coverage, beside the claimed coverage.",
    dep: ["rule-library", "rule-testing", "coverage-and-blind-spots"]
  },
  "suppression-and-allowlists": {
    s: "Controlled exceptions that stop known, accepted behavior from producing alerts, scoped to a rule, entity and time, with owner and expiry so they do not become blind spots.",
    d: "Analysts add suppressions when a rule fires on legitimate activity: a vulnerability scanner, a backup job, an administrator's script. A suppression names the rule, the exact matching condition and a reason, and ideally an expiry date. Implementation can exclude events before detection or drop alerts after. The danger is breadth: a suppression on a user or host silences every rule for it, and an attacker who knows or inherits the exception can hide within it.",
    k: ["Narrow suppression on exact conditions vs broad on entity: narrow keeps coverage and needs more entries; broad is quick and creates blind spots.", "Suppress before detection vs after: before saves cost and loses the events from analysis, after keeps data and still counts the noise."],
    p: ["A suppression for a scanner address stays after the scanner is decommissioned and the address is reassigned.", "Suppressions accumulate with no owner, and nobody can tell what is currently being ignored."],
    v: "List every active suppression with owner, reason, scope and expiry. Fire the suppressed behavior from a different host and confirm the rule still alerts, proving the exception is narrow.",
    dep: ["rule-lifecycle", "alert-model"]
  },
});
