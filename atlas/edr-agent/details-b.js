// Details for the endpoint detection and response plate, part B: behavioral detection, local prevention, cloud analytics.
ATLAS.details("edr-agent", {
  "local-rule-engine": {
    s: "Evaluates detection rules against the live event stream on the machine, so attacks are recognized and blocked in milliseconds without waiting for the cloud.",
    d: "Rules are data: conditions over event fields, process relationships and counts, with an action such as alert, block or tag. The engine compiles them into a form that dispatches by event type, so each event touches only relevant rules, and keeps per-process state for multi-step rules. Rules arrive through the content update channel and can be added without a code release. It is hard because rule count grows into the thousands while the budget per event stays at microseconds, and because a single bad rule can fire on every event of a common program.",
    k: ["Interpreted rule data vs compiled detections: data rules update in minutes and can be authored by analysts; compiled logic is faster and can do things rules cannot, but needs a release.", "Evaluate inline before the operation vs after: inline evaluation can block but adds latency to the action; after-the-fact evaluation is free of latency and can only react."],
    p: ["A rule matching a common command pattern floods the fleet with alerts within an hour of release.", "Rule evaluation order changes results when two rules both act on one event."],
    v: "Load a rule that matches a benign test command, run it, and confirm the alert carries the rule identifier and matched fields; then measure per-event evaluation time with ten thousand rules loaded against the budget.",
    dep: ["event-schema","process-entity-table","content-updates"]
  },
  "process-lineage-analysis": {
    s: "Uses the chain of parent and child processes, with command lines and users, to judge whether a program was started in a way that makes sense, such as a document viewer launching a shell.",
    d: "The agent keeps a table of live and recently ended processes with their parents, image, signer, command line and start time, and evaluates relationships: which parent-child pairs are unusual, how deep the chain from a network-facing service goes, and whether a process was started by a script. Lineage turns individually normal events into a sequence worth attention. The hard part is accuracy: parents exit before children, identifiers are reused, and some programs are launched by system brokers that hide the true originator.",
    k: ["Real parent vs logical originator: the real parent is the fact the OS reports; the logical originator (who asked a broker to launch it) explains intent but takes extra inference.", "Keep lineage for all processes vs only suspicious ones: complete lineage allows investigation back in time; selective lineage saves memory and loses early links."],
    p: ["An exited parent leaves the child orphaned, and the chain stops at the one link that mattered.", "Parent-spoofing techniques launch a process with a chosen false parent that makes malware look like a trusted launch."],
    v: "Launch a test document viewer that starts a shell which starts a network tool, and confirm the detection shows the complete chain with command lines and flags the viewer-to-shell edge.",
    dep: ["process-entity-table","process-creation-hooks","local-rule-engine"]
  },
  "correlation-windows": {
    s: "Holds recent events in time-bounded state so detections can match sequences, like a file download followed by execution followed by an outbound connection, within a defined period.",
    d: "A multi-step rule keeps partial matches keyed by process, user or host, each with a deadline. When the final event arrives inside the window the rule fires; when time runs out the state is discarded. Windows range from seconds to hours. The cost is memory proportional to partial matches, and the difficulty is correctness over out-of-order events, clock changes, processes that end mid-sequence and attackers who spread steps over a long time to slip outside the window.",
    k: ["Short windows vs long windows: short windows keep memory low and false positives few; long windows catch slow attacks but hold much more state.", "Local correlation vs cloud correlation: local correlation can block before the sequence finishes; cloud correlation sees more hosts and longer history but only after the fact."],
    p: ["An attacker waits ten minutes between steps and the five-minute window never closes on a match.", "State kept per process is never freed when processes end, and memory grows until the agent is restarted."],
    v: "Run a three-step benign sequence inside the window and again with a gap longer than the window, and confirm only the first fires, and state counters return to baseline after the deadline.",
    dep: ["local-rule-engine","process-entity-table","event-schema"]
  },
  "indicator-matching": {
    s: "Checks events against large lists of known-bad file hashes, domains, addresses, certificate signers and command patterns using compact structures that answer in constant time.",
    d: "Indicators arrive from the cloud, threat feeds and analysts. The agent loads them into hash sets, probabilistic filters and prefix tries sized to millions of entries, and checks them at relevant events: file written or executed, DNS lookup, connection opened. A match raises an alert or blocks. Memory use is the central cost, so lists are tiered by confidence and age. The difficulty is staleness and precision: old indicators for reassigned addresses cause false alarms, and filters that allow rare false matches need a confirmation step.",
    k: ["Probabilistic filter plus confirmation vs exact set: filters save memory and need a second check to avoid false blocks; exact sets are precise and larger.", "Push the whole list vs query on demand: full lists work offline; on-demand lookups keep the agent small and need connectivity."],
    p: ["A shared hosting address listed as malicious blocks legitimate sites for the whole fleet.", "Indicator lists grow without expiry until loading takes long enough to delay agent start."],
    v: "Add a test domain and a test hash to the list, resolve and execute them on a lab host, and confirm both match, then remove them and confirm no match; also record memory use with one million entries.",
    dep: ["content-updates","dns-and-tls-metadata","network-filter","event-schema"]
  },
  "technique-tagging": {
    s: "Labels each detection and event with the adversary technique from a shared taxonomy, so alerts speak a common language and coverage gaps can be seen as a map.",
    d: "Every rule carries one or more technique identifiers and a tactic stage such as persistence or credential access. Alerts inherit them, and the console aggregates by technique to show what has been seen and what the product can detect. Tagging supports prioritization, since several tactics from one host imply progress. The challenge is honesty: a rule tagged to a technique may detect only one way of doing it, so coverage maps look better than reality, and taxonomies are revised over time.",
    k: ["Tag every rule vs only high-confidence ones: complete tagging supports coverage views; selective tagging keeps the map meaningful but under-reports.", "Static tags vs context-derived tags: static tags are predictable; context-derived tags are more accurate but harder to explain."],
    p: ["A rule covering one variant is counted as full coverage of a technique, and teams skip additional controls.", "Taxonomy revisions rename identifiers, breaking saved searches and dashboards."],
    v: "Trigger three rules for different stages on a test host and confirm the incident view lists their techniques and stages in order, and the coverage report counts each rule against only its tagged technique.",
    dep: ["local-rule-engine","alert-and-incident-grouping"]
  },
  "behavior-baselines": {
    s: "Learns what is normal for a host, user or program and flags significant departures, such as an accounting tool suddenly reading browser credential files.",
    d: "The agent or cloud collects per-entity statistics: which programs run, what they launch, which hosts they contact, what time and what volume. A model scores how far a new event is from the entity's history and from its peer group. Baselines catch what no rule describes and need no signature. The difficulty is the learning period, drift as software and work habits change, and attackers who change slowly so that the new behavior becomes normal.",
    k: ["Per-host baselines vs peer-group baselines: per-host is precise but cold-starts on new machines; peer groups work immediately and miss individual oddities.", "Alert on any deviation vs on deviations combined with other signals: standalone alerts overwhelm analysts; combining signals reduces noise but delays detection."],
    p: ["A newly imaged machine has no history, so everything it does is flagged as unusual.", "A baseline learned during a compromised period treats the attacker's activity as the norm."],
    v: "Establish a baseline over a lab period, then have a known program contact an unseen destination and read an unusual file set, and confirm a deviation score above threshold is recorded with the contributing features.",
    dep: ["local-state-store","process-entity-table","cross-host-analytics"]
  },
  "on-agent-classifier": {
    s: "A small machine-learning model that runs on the endpoint to score files or behavior sequences without a network round trip, trading some accuracy for speed and privacy.",
    d: "The model, often a gradient-boosted ensemble or compact neural network, takes features extracted from a file's static structure or from a process's recent behavior and returns a score compared to thresholds. It ships as content with its own version and is retrained centrally. Inference must take well under a millisecond per decision and use a few megabytes. The difficulty is evasion by adversarial inputs, drift as software changes, explaining a score to an analyst and controlling the false-positive rate on rare internal software.",
    k: ["On-agent model vs cloud model: on-agent works offline and in line with execution; cloud models can be larger and are updated instantly but need connectivity.", "One global model vs per-customer tuning: a global model benefits from everyone's data; per-customer thresholds reduce false positives on unusual local software."],
    p: ["The model scores internally built tools as malicious because they resemble nothing in training data.", "Features computed differently in training and on the agent produce different scores for the same file."],
    v: "Score a labeled holdout of benign and malicious samples on the agent build itself, confirm detection and false-positive rates match the training report within tolerance, and measure inference time per file.",
    dep: ["pre-execution-verdict","content-updates","resource-governor"]
  },
  "script-and-memory-detection": {
    s: "Detects attacks that use no file on disk: scripts decoded at run time, code injected into other processes, and malicious code running only in memory.",
    d: "Script interpreters expose a hook that passes the final, decoded script text to the agent before running, so obfuscation is undone for it. Memory detection looks for executable regions that no file backs, remote thread creation, modified code pages and known shellcode shapes, using periodic scans and event-driven checks. Both hit performance limits: scanning memory is expensive. The hard part is distinguishing legitimate just-in-time compiled code and security tools that behave like injectors.",
    k: ["Event-driven memory checks vs periodic full scans: event-driven checks are cheap and miss quiet implants; periodic scans find them at a cost in CPU and latency.", "Scan scripts before execution vs after: before can block, and adds delay to every script run; after has no delay and can only report."],
    p: ["Code that a runtime compiles in memory looks like injected shellcode and is flagged in every managed application.", "Scripts split across many small commands avoid any single-script content rule."],
    v: "Run a base64-obfuscated benign test script and an in-memory code stub, and confirm the agent logs the decoded script text and flags the unbacked executable region with the owning process.",
    dep: ["script-content-interface","in-process-api-hooks","kernel-tracing-probes","local-rule-engine"]
  },
  "pre-execution-verdict": {
    s: "Decides whether a program may start, using its hash, signer, reputation, static features and local models, with a bounded wait so users are not blocked on a slow answer.",
    d: "When the file system or process-creation hook sees a new image, the agent computes or looks up its hash, checks local allow and block lists, signer trust, the on-agent classifier and the local verdict cache, and may ask the cloud for reputation under a short timeout. The result is allow, block or allow-and-monitor. The decision is on the path of every program launch, so latency matters. The difficulty is first-seen files: legitimate new builds have no reputation, and waiting for a verdict delays developers and installers.",
    k: ["Block unknown files until proven vs allow and monitor: blocking is safest and disrupts developers and new software; monitoring keeps work flowing and lets a first execution succeed.", "Synchronous cloud check vs cached verdict only: synchronous reputation is current and adds delay and an availability dependency; cache-only is fast and stale."],
    p: ["A lookup timeout in the build directory slows compilers that start thousands of short-lived tools.", "A signed installer from a compromised publisher is allowed because signer trust is treated as proof."],
    v: "Launch a known-bad test sample, an unknown benign file and a trusted signed file on a lab host, and confirm blocked, allowed with monitoring and allowed respectively, each within the stated latency limit.",
    dep: ["process-creation-hooks","local-verdict-cache","on-agent-classifier","indicator-matching"]
  },
  "ransomware-protection": {
    s: "Detects mass encryption or destruction of files by behavior, stops the responsible process, and preserves or restores affected files.",
    d: "Signals include a process rewriting many files in a short time, changing extensions, writing high-entropy content over low-entropy documents, touching decoy files placed in user folders, or deleting shadow copies and backups. On a trigger the agent suspends the process tree, and recovers files from a recent protected copy. Detection must be fast, because encryption of thousands of files completes in under a minute. The difficulty is separating it from legitimate bulk operations like archiving, backup agents and disk encryption tools.",
    k: ["Decoy files vs behavior thresholds: decoys give a nearly certain, early signal; thresholds catch more cases but need tuning against backup and compression software.", "Block on first signals vs wait for confidence: early block saves more files; waiting avoids interrupting a legitimate archiver at the cost of more damage."],
    p: ["An archive tool or backup run is stopped mid-operation and leaves partly written output.", "Encryption over a network share is done by a remote process, so the local sensor sees no process to stop."],
    v: "Run a harmless simulator that rewrites a few hundred test files with random data, and confirm the process is suspended after a small number of files, the affected files recover to original hashes, and a bulk archive of the same size does not trigger.",
    dep: ["file-system-filter","process-kill-and-suspend","remediation-rollback","behavior-baselines"]
  },
  "exploit-mitigation": {
    s: "Blocks the techniques exploits use, such as stack pivoting, return-oriented chains, heap spraying and unexpected code execution from data memory, inside common applications.",
    d: "The agent loads protection into targeted processes such as browsers, office suites and document readers, and checks critical API calls: whether the call came from legitimate code, whether the stack looks sane, whether memory permissions changed to executable. These checks stop exploitation regardless of the vulnerability. The difficulty is compatibility: applications use unusual but legitimate memory tricks, so checks break plug-ins and custom builds, and each mitigation targets a known technique that attackers then avoid.",
    k: ["Mitigate by technique vs detect specific exploits: technique mitigations stop whole bug classes including unknown flaws; exploit-specific detection is simpler and misses new ones.", "Apply to all processes vs a protected list: all processes close gaps and break more software; a list limits risk and leaves unlisted programs exposed."],
    p: ["A mitigation conflicts with an accessibility tool or plug-in and crashes the application at startup.", "A technique-specific check is bypassed by a variant that uses a different call sequence."],
    v: "Run a deliberately vulnerable test application with a known exploit proof, and confirm the mitigation blocks the final stage, logs the technique, and the same application runs normal workloads without crash.",
    dep: ["in-process-api-hooks","kernel-tracing-probes","process-creation-hooks"]
  },
  "credential-theft-guard": {
    s: "Prevents reading or dumping of stored credentials from the process, file or memory areas where the OS keeps them, and detects tools that attempt it.",
    d: "The agent watches for processes opening the credential-holding process with memory-read rights, reading credential databases or secret files, and requests for cached tickets and tokens. It blocks or strips the rights, using handle callbacks or the OS's own protection modes, and alerts on the attempt. Browser password stores and key material get the same watch. The difficulty is that backup tools, debuggers and other security software legitimately ask for similar access, and attackers use unusual paths such as reading a memory snapshot instead.",
    k: ["Strip rights on handle open vs block the process: stripping blocks the technique quietly and lets the program run; blocking is louder and stops the tool but risks disrupting legitimate software.", "Allowlist known-good tools vs treat all as hostile: allowlists reduce noise; they create a trusted path that attackers can impersonate."],
    p: ["Dumping from a crash dump file written by the OS bypasses the open-process check.", "A legitimate monitoring agent is blocked and loses data until it is added to the allowlist."],
    v: "Run a harmless test tool that opens the credential process for reading, and confirm the open is denied or stripped, an alert names the tool, and the OS's normal logon still functions.",
    dep: ["process-creation-hooks","kernel-tracing-probes","local-rule-engine"]
  },
  "application-control": {
    s: "Allows only approved programs to run, by path, signer, hash or reputation, so unknown code is blocked by default instead of detected after it starts.",
    d: "A policy lists what is trusted: signers, specific hashes, managed installer paths, or the existing installed baseline. The pre-execution hook checks each launch and library load. Modes include audit, which only logs, and enforce. It dramatically reduces attack surface on fixed-function machines such as servers and kiosks. The difficulty is operations: every new patch, tool and update changes hashes, so teams need a managed-installer trust model and an exception process, or the policy is eventually disabled.",
    k: ["Allowlist by signer vs by hash: signers survive updates and trust everything the publisher signs; hashes are exact and break at every patch.", "Audit first vs enforce immediately: audit reveals what would break and delays protection; immediate enforcement protects at once and can stop the business."],
    p: ["Allowing a general-purpose interpreter by signer lets any script run through it, defeating the policy.", "An enforce policy blocks a scheduled job that runs only monthly, and no one notices until it fails."],
    v: "Put a lab host in audit, run known and unknown programs and confirm the report lists exactly what would be blocked; then enforce and confirm the unknown program is denied while an updated allowed program still runs.",
    dep: ["pre-execution-verdict","policy-engine","exclusion-management"]
  },
  "device-control": {
    s: "Controls which removable and peripheral devices may connect, such as storage drives and radios, by class, vendor and serial number, with read-only options and logging.",
    d: "The agent hooks device arrival and mount events through the OS's device interface, matches the device descriptor against policy, and allows, blocks, mounts read-only or allows with logging. Policies are per group, so an engineering team and a kiosk differ. Events record device identity and file transfer activity. The hard parts are correct identification, since descriptors can be forged, and exceptions for legitimate devices like keyboards that must work, including ones that pretend to be keyboards.",
    k: ["Block by class vs by serial number: class blocks are simple and broad; serial allowlists are precise for approved drives but need inventory management.", "Block write only vs block entirely: read-only allows people to import files and stops exfiltration; full block is simpler and stops legitimate use."],
    p: ["A device that presents as both storage and keyboard types commands while the storage is blocked.", "Blocking a device class also blocks a phone charger that enumerates as storage."],
    v: "Plug an unapproved test drive into a policy-blocked host and confirm it does not mount and an event names its serial; plug an approved drive and confirm read-only mount when configured.",
    dep: ["policy-engine","kernel-tracing-probes","file-system-filter"]
  },
  "detect-vs-prevent-mode": {
    s: "A per-rule and per-policy switch between only reporting a detection and actively blocking it, used to roll out new protections safely.",
    d: "Each detection and prevention capability has a mode: off, detect (alert only), prevent (block and alert), and sometimes a learning mode that records without alerts. Policies set modes per group, and the agent reports what it would have blocked while in detect mode. This gives teams data on false positives before enforcement. The difficulty is that detect mode gives no protection, and many deployments never leave it, and that a would-have-blocked count needs the same evaluation work as blocking.",
    k: ["Start in detect and promote vs start in prevent: detect first avoids outages and leaves a protection gap; prevent first closes the gap with a risk of blocking business tools.", "Per-rule modes vs one global mode: per-rule modes allow promotion one at a time; one mode is simple and forces all-or-nothing decisions."],
    p: ["A fleet remains in detect mode for a year after a pilot because no one owns the promotion decision.", "Would-have-blocked data is ignored, so a rule promoted later breaks something the data had already predicted."],
    v: "Set a rule to detect on a test host, run the trigger and confirm an alert marked not blocked; switch to prevent and confirm the same trigger is denied and marked blocked.",
    dep: ["policy-engine","local-rule-engine","pre-execution-verdict"]
  },
  "event-ingest": {
    s: "The cloud front door that authenticates agents, receives their batches, validates and deduplicates them, and writes them into the processing pipeline at fleet scale.",
    d: "Agents send compressed batches over an authenticated connection. The ingest tier checks identity, enforces per-tenant rate limits, verifies batch sequence numbers, parses events against the schema version and writes them to a durable log, from which consumers read. It returns acknowledgments so the agent can delete what was received. At millions of agents the constraints are bursts after outages, when every offline machine reconnects at once, uneven tenants and schema versions that span many agent generations.",
    k: ["Acknowledge after durable write vs on receipt: durable acknowledgment prevents loss and increases latency; early acknowledgment is quicker and can drop data on a crash.", "Strict schema validation vs lenient parsing: strict validation protects consumers and rejects batches from newer agents; lenient parsing keeps data flowing and lets bad data in."],
    p: ["A regional outage ends and every agent uploads its backlog at once, overloading ingest and prolonging the outage.", "A new agent version adds a field that old consumers reject, and the whole batch is dropped."],
    v: "Send a batch with a duplicate sequence number, a bad signature and a valid one, and confirm only the valid one is stored once, the duplicate is acknowledged without a second write, and the bad one is rejected and counted.",
    dep: ["batch-and-upload","event-schema","secure-transport"]
  },
  "reputation-and-enrichment": {
    s: "Adds context to events in the cloud: file prevalence and age, signer and publisher reputation, address and domain intelligence, and geolocation, to help judge what is normal.",
    d: "Lookups join incoming events with stores keyed by hash, signer, domain and address. Prevalence (how many machines have seen this file, and how recently) is especially strong, since malware tends to be rare and new. The result is attached to events and returned to agents for verdicts. Freshness and latency are the hard constraints: a verdict must come back in milliseconds, and the data keeps changing as files get classified and addresses are reassigned.",
    k: ["Cross-customer prevalence vs per-customer prevalence: cross-customer data is much stronger and has privacy and tenancy implications; per-customer data is private and thinner.", "Precomputed verdict tables vs on-demand scoring: precomputed tables are fast and stale; on-demand scoring is current and costly and adds failure modes."],
    p: ["A new legitimate software release is rare on day one and scored as suspicious.", "A cache of reputation outlives a change in classification, so a file once cleared remains trusted after being found malicious."],
    v: "Query a known benign widely-deployed file, a one-machine custom build and a known-bad sample, and confirm distinct prevalence and verdict fields, each answering inside the latency target.",
    dep: ["event-ingest","threat-intel-feed"]
  },
  "cross-host-analytics": {
    s: "Detections that need more than one machine or a long history, such as lateral movement, a credential used in several places, or the same rare file appearing across a fleet.",
    d: "Stream and batch jobs join events from many hosts: authentication across machines, one binary seen first on a server then on workstations, beaconing patterns to one destination. They build graphs of hosts, users and processes and score paths. These catch the attack stages local logic cannot see. The cost is latency, since detection arrives seconds to minutes late, and the scale of joins and state, with entity resolution (the same user under several names) a constant source of errors.",
    k: ["Streaming analytics vs batch analytics: streaming is quick and limited in history and join depth; batch is thorough and delays detection by hours.", "Graph-based detection vs rule joins: graphs find unforeseen paths and are hard to explain; rule joins are explainable and only find what an author imagined."],
    p: ["Service accounts that legitimately touch every server produce lateral-movement alerts constantly.", "Hosts with unsynchronized clocks reorder events and break time-based joins."],
    v: "Simulate a credential used on three lab hosts in sequence with a staged binary, and confirm one incident links the three hosts, in correct order, with the shared account and file hash named.",
    dep: ["event-ingest","reputation-and-enrichment","process-entity-table"]
  },
  "threat-intel-feed": {
    s: "Curated and ingested external knowledge of attacker infrastructure, tools and techniques, normalized, scored and distributed to the cloud and agents as indicators and rules.",
    d: "Sources include vendor research, shared community feeds, government notices and the product's own investigations. Items are normalized, deduplicated, assigned confidence and expiry, and tagged with context such as the actor or campaign. High-confidence indicators go to agents for blocking; the rest enrich alerts. Quality varies enormously, and feed items with no expiry decay into noise. The difficulty is precision and timing: a stale indicator causes harm, and a late one gives no value.",
    k: ["Many feeds vs few curated ones: many feeds increase coverage and noise; few curated feeds are cleaner and miss early signals.", "Block on external indicators vs only alert: blocking gives protection immediately; alert-only avoids outages from bad third-party data."],
    p: ["A feed mistakenly lists a major cloud provider's address range, and agents block the provider.", "Items lack an expiry, so the active list grows indefinitely and slows every lookup."],
    v: "Ingest a feed item with a seven-day expiry and a confidence score, confirm it reaches agents with those fields, matches a test event, and disappears from the active set after expiry.",
    dep: ["reputation-and-enrichment","content-updates"]
  },
  "alert-and-incident-grouping": {
    s: "Combines many related detections across processes and hosts into one incident with a timeline and severity, so analysts review a story instead of hundreds of separate alerts.",
    d: "Alerts are linked when they share a process tree, user, host, file hash, destination or time window. The grouped incident accumulates techniques, affected entities and a score reflecting the seriousness of the combination. Suppression rules and deduplication cut repeats. The point is analyst time, which is the scarcest resource in operations. The difficulty is merging too much, which connects unrelated activity into one inflated incident, or too little, which scatters one attack across many.",
    k: ["Group by process lineage vs by entity and time: lineage groups are accurate for one attack chain; entity-and-time groups follow an attacker across hosts and risk linking unrelated work.", "Automatic suppression of repeats vs always show: suppression reduces fatigue and can hide an escalating attack; showing everything keeps fidelity and noise."],
    p: ["A shared jump server links every administrator session into one huge incident.", "Dedup merges two real attacks that use the same tool into a single record, and one is never worked."],
    v: "Generate alerts from one simulated attack chain on two hosts and one unrelated alert, and confirm the chain forms one incident with both hosts and ordered alerts while the unrelated alert stays separate.",
    dep: ["cross-host-analytics","technique-tagging","event-ingest"]
  },
  "model-training-loop": {
    s: "The cycle that collects labeled outcomes, retrains the detection models, evaluates them against held-out data and releases them to agents and the cloud.",
    d: "Training data comes from analyst verdicts, sandbox results, vendor intelligence and fleet telemetry. Pipelines extract features, train candidates, evaluate against recent holdout sets and replay of recent traffic for false positives, then release through the same staged rollout as other content. Feedback from false-positive reports and missed detections returns to training. Label quality, drift and adversaries who probe for model weaknesses are the central difficulty, along with keeping the agent's feature code identical to the trainer's.",
    k: ["Frequent retraining vs rare, heavily validated releases: frequent retraining follows attackers closely; rare releases are easier to validate and slower to adapt.", "Train on customer data vs only on vendor-collected data: customer data improves fit and brings privacy and contract limits; vendor data is safer and less representative."],
    p: ["Analyst labels reflect what was alerted on, so the model never learns about attacks that were never flagged.", "A model passes offline tests and has a high false-positive rate on a customer's custom software."],
    v: "Release a candidate model to a shadow ring, compare its scores to the incumbent on live traffic, and confirm false-positive rate and detection rate are inside gates before promotion, with the comparison recorded.",
    dep: ["event-ingest","on-agent-classifier","staged-rollout-rings"]
  },
  "threat-hunting-query": {
    s: "Lets analysts search historical telemetry across the fleet with a query language, to look for an attack no alert caught or to scope an incident that was.",
    d: "Events are stored in a searchable store partitioned by tenant and time and indexed by common fields such as hash, process name, command line, address and user. Analysts write queries, save them and schedule them as detections. Queries can be run against the agents' local history as well. The hard parts are cost and speed over trillions of events, retention limits that decide how far back one can look, and queries that accidentally scan everything.",
    k: ["Hot recent store plus cold archive vs one store: tiering keeps recent queries fast and cheap to run; an archive is slow and extends the reach of hunts.", "Full-text command-line search vs structured fields: full text finds the unexpected and is expensive; structured fields are fast and rely on the parser having extracted what you need."],
    p: ["Retention is thirty days and the intrusion started ninety days ago.", "A broad query without a time bound runs for hours and degrades search for other analysts."],
    v: "Run a query for a known test command line across the lab fleet, and confirm all matching hosts return with time and process, and a deliberately unbounded query is stopped by the cost limit with a clear message.",
    dep: ["event-ingest","reputation-and-enrichment","on-host-history-query"]
  },
});
