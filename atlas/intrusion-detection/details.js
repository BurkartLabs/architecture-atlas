// Details for the intrusion detection plate, part 1: alerts, tuning, updates, integration.
ATLAS.details("intrusion-detection", {
  "detection-event": {
    s: "The structured record created when a detector fires: which rule or model matched, the packet and flow it matched on, a timestamp, severity and classification.",
    d: "When a signature, parser check or anomaly model triggers, the engine fills a record with the endpoints, ports, protocol, the identifier and revision of the detection, a human-readable message, a priority and a category. It also carries the flow identifier and, where available, the application-layer transaction. The record is passed to output threads rather than written inline. Difficulty comes from identity: one attack can trigger many events across packets and rules, and downstream consumers need a stable key to group them without losing the details that distinguish them.",
    k: ["One event per match versus one per flow per rule: per-match preserves every hit but multiplies volume during noisy attacks, while per-flow is compact but hides repeated attempts.", "Fixed severity from the rule versus severity computed from context: fixed values are predictable, but computed values reflect asset importance and need data the sensor may not have."],
    p: ["An event without the rule revision cannot be tied to the exact logic that fired, so analysts cannot tell whether an update changed behavior.", "Events stamped with processing time instead of packet time misorder when the sensor is behind."],
    v: "Replay a capture containing one known exploit and confirm exactly one event per intended rule, each with matching endpoints, rule identifier and revision, and a timestamp equal to the packet's capture time.",
    dep: ["packet-timestamping", "rule-store"]
  },
  "alert-enrichment": {
    s: "Adds context to an event before it leaves the sensor: the decoded protocol fields, flow state, file information, geographic data and asset or vulnerability tags.",
    d: "An alert that only names a rule forces the analyst to go find the packet. Enrichment copies the relevant transaction into the event: the HTTP host and URI, the DNS query, the TLS server name and fingerprint, file name and hash, and the direction of the flow. Lookups against local tables add the owner or role of each address. Enrichment runs in the output path, so it must be cheap, bounded and tolerant of missing data. What makes it hard is that heavy lookups slow the output queue, and stale tables put wrong labels on events.",
    k: ["Enrich at the sensor versus at the collector: sensor-side enrichment has the parsed fields and exact flow state, while collector-side enrichment can use richer, fresher data and keeps sensors fast.", "Embed the full transaction versus a reference: embedding makes the event self-contained, but inflates storage and exposes more sensitive content."],
    p: ["Embedding request headers and bodies copies credentials and session tokens into the alert pipeline.", "A stale address-to-owner table mislabels alerts after a network renumbering, sending triage to the wrong team."],
    v: "Trigger an alert on a known web request and confirm the event includes the host, URI, method, response code, flow direction and the expected asset tag, without the request body or cookies.",
    dep: ["detection-event", "http-parser", "dns-parser", "file-extraction"]
  },
  "alert-formats": {
    s: "The serialization of events for consumers: compact binary for local tools, line-oriented text for humans, and structured JSON for log pipelines.",
    d: "Output modules take events from the queue and write them to files, sockets, pipes or syslog. Binary unified formats are fast to write and keep the packet; JSON is verbose but is parsed by nearly every log pipeline and carries nested protocol fields. Fast one-line formats help humans watching a console. Each format needs a versioned schema, field names stable across releases and defined behavior for unknown fields. The hard part is compatibility: consumers parse by name, so a renamed field breaks dashboards quietly.",
    k: ["Structured JSON versus compact binary: JSON is self-describing and easy to ingest, but costs several times the space and CPU of a binary format at high alert rates.", "Many output formats at once versus one canonical stream: multiple outputs fit different tools, at the cost of divergent fields and extra write load."],
    p: ["A field renamed between releases silently empties dashboards and detections built on that field.", "Unrotated output files fill the disk and stop the sensor from logging, or from running."],
    v: "Generate an alert, then parse the output with a strict schema validator and confirm required fields are present, types are correct and the event round-trips into the downstream parser unchanged.",
    dep: ["detection-event", "local-storage"]
  },
  "payload-capture": {
    s: "Keeps the packets or stream bytes that triggered an alert, so an analyst can inspect the actual evidence rather than only the sensor's description of it.",
    d: "On a match the sensor can save the triggering packet, a window of bytes around the match, or the whole flow from that point forward. A ring of recent packets per flow allows saving data from before the match. Captured data is written as standard capture files, indexed by event. Capture is bounded by per-alert and total limits. Difficulty is volume and sensitivity: evidence is the most useful artifact for triage and the most privacy-laden, and storing it for every alert on a busy link is not affordable.",
    k: ["Matched packet only versus full flow after the match: one packet is cheap but often lacks the attack's context, while the flow captures the whole exploit and everything that follows.", "Capture on every alert versus on selected rules: universal capture is simple, but selective capture keeps storage within budget and out of low-value noise."],
    p: ["Capture of encrypted sessions produces large files that no analyst can read.", "Evidence stored beside the alert with the same permissions exposes user content to everyone who can read alerts."],
    v: "Trigger a rule on a staged exploit and confirm the saved capture opens in a standard analyzer, contains the matching bytes at the reported offset and is deleted by the retention job on schedule.",
    dep: ["detection-event", "local-storage", "ring-buffers"]
  },
  "alert-rate-limiting": {
    s: "Caps how many events a rule, address or whole sensor can emit in a time window, so a noisy source cannot flood storage or hide the alerts that matter.",
    d: "A scan or a misbehaving application can match one rule thousands of times a second. Limiters track counts per rule, per source or per pair in a small table keyed by time buckets, and either suppress further events or emit a single summary with the count. Limits can be applied before the output queue to save work. The challenge is what is lost: a hard cap hides the difference between ten and ten million attempts unless the summary keeps the true count, and attackers can trigger a cap on purpose to mask a second attack.",
    k: ["Drop beyond the limit versus summarize: dropping bounds cost most strictly, but summary events keep the count and the first and last time, which analysts need.", "Per-rule versus per-source limits: per-rule protects against noisy rules, while per-source keeps one scanner from consuming the budget of every rule."],
    p: ["A global cap lets an attacker fire a cheap decoy burst to push the real alert over the limit.", "Limiter state not tied to the flow table grows without bound under many unique sources."],
    v: "Send ten thousand packets matching one rule from one address and confirm the output has a bounded number of events plus a summary reporting the true count, while a second rule from another source still alerts.",
    dep: ["detection-event", "output-queue"]
  },
  "output-queue": {
    s: "The bounded buffer between detection threads and slow output writers, with a defined policy for what happens when the writers cannot keep up.",
    d: "Detection threads must not wait for a disk or a network. They place events into per-thread queues; one or more writer threads drain them in batches, to files, sockets or a remote collector. When a queue is full the system must choose: block detection, drop the newest events, drop the oldest, or drop by priority. Each choice has a cost. The difficulty is back-pressure under bursts: a slow remote collector can propagate delay into packet processing and cause drops far from where the problem started.",
    k: ["Block versus drop on a full queue: blocking never loses alerts but can stall packet processing and cause capture loss, while dropping keeps traffic flowing at the cost of missing evidence.", "Drop by priority versus drop newest: priority drops keep serious events, but the policy needs trustworthy severities and extra bookkeeping per event."],
    p: ["A remote collector outage fills local queues and backs up into packet capture, turning an output problem into blindness.", "Dropped events are not counted, so nobody learns that evidence was lost."],
    v: "Stop the downstream collector under load and confirm the sensor keeps processing packets, reports a nonzero dropped-event counter, and recovers its normal output when the collector returns.",
    dep: ["alert-formats", "drop-accounting"]
  },
  "false-positive-analysis": {
    s: "The process of deciding why a rule fired on benign traffic, using the saved packets and the surrounding context, and what change, if any, is appropriate.",
    d: "An analyst starts from the alert, the payload and the flow, and asks what the traffic actually is. Typical causes are a legitimate application whose bytes resemble an exploit, a rule that is too general, a vulnerability scanner the organization runs itself, or a parser misreading a protocol. The finding feeds a decision: tighten the rule, exclude a source, or accept the alert. Difficulty is that benign and malicious traffic can look identical in the narrow window a rule examines, and each exclusion permanently removes some visibility.",
    k: ["Fix the rule versus suppress locally: fixing the rule helps every user and needs coordination with its author, while a local suppression is fast but only hides the symptom here.", "Judge by payload versus by outcome: payload review is quick, but evidence that a target was actually compromised is the more reliable test for severity."],
    p: ["Tuning against a single day of traffic suppresses a rule that matters during the monthly batch job.", "Excluding a whole subnet because one host is noisy removes coverage for every host behind it."],
    v: "Take twenty alerts from one rule, classify each from saved evidence, and confirm the resulting exclusion removes the benign ones when replayed and still fires on a known malicious sample.",
    dep: ["payload-capture", "alert-enrichment"]
  },
  "suppression-and-thresholds": {
    s: "Rules for quieting repeated alerts: suppress a rule for chosen addresses, or alert only after a count is reached within a time window.",
    d: "Thresholds convert a pattern that is only suspicious in volume, such as repeated failed logins, into an alert after N events in T seconds, tracked by source, destination or both. Suppression removes alerts for specified rule and address combinations without editing the rule. Both are evaluated after a match but before output. They are stored in the sensor configuration so they survive rule updates. The risk is precision: a threshold counts per tracking key, and a wrong key either never accumulates or merges unrelated hosts.",
    k: ["Threshold in the rule versus in tuning configuration: in the rule it ships with the logic, while separate configuration survives updates and can be set per site.", "Track by source versus by destination: source tracking catches one attacker against many targets, destination tracking catches many attackers against one."],
    p: ["Tracking by destination behind address translation merges every client into one count and fires constantly.", "A suppression written by address silently expires its purpose when the address is reassigned."],
    v: "Send four failed-login attempts, then six, against a rule thresholded at five in sixty seconds and confirm no alert for the first four, one alert at the fifth, and no further alert in the same window.",
    dep: ["rule-store", "alert-rate-limiting", "flow-table"]
  },
  "rule-overrides": {
    s: "Site-specific changes to a distributed rule set: disabling rules, changing their action or priority, or editing options, applied automatically at every update.",
    d: "Vendors and communities publish rules for everyone. A site needs to disable rules that never apply to its software, raise priority for its crown-jewel servers, and switch some to drop on an inline sensor. Overrides are kept as a small set of declarative directives, matched by rule identifier, group or metadata, and reapplied each time the update client regenerates the active rule file. The difficulty is drift: when a rule is replaced under a new identifier, the override no longer matches and the original behavior silently returns.",
    k: ["Declarative overrides versus editing rule files: overrides survive updates and are reviewable, while direct edits are simpler but are overwritten at the next download.", "Disable by identifier versus by category: identifiers are precise, while categories scale to thousands of rules but remove entire classes of detection."],
    p: ["Disabling a rule for performance, then forgetting why, leaves a blind spot with no owner.", "An override targeting a retired identifier reports success while changing nothing."],
    v: "Apply an override disabling one rule and changing another to drop, run the update, and confirm the generated rule set shows both changes and that the disabled rule no longer fires on its test traffic.",
    dep: ["rule-store", "update-client"]
  },
  "rule-profiling": {
    s: "Measures how much time each rule spends being checked and how often it matches, to find rules that are slow, never match, or match constantly.",
    d: "The engine can record per-rule counters: times the rule was reached by the prefilter, times its options were checked, time spent, and matches. Sorting by time exposes a few rules, often with broad patterns or backtracking regular expressions, that consume most of the CPU. Rules with no matches over months may be obsolete. Rules with matches only from benign sources are candidates for tuning. Profiling itself costs time, so it runs on a sampled or test sensor. Hard part: cost depends on the traffic, so a rule cheap in a lab can dominate in production.",
    k: ["Always-on profiling versus on demand: always-on finds slow rules as traffic changes, but adds overhead on every packet check.", "Rank by time versus by hit count: time ranking finds rules that threaten line rate, while hit ranking finds rules that threaten analyst attention."],
    p: ["Profiling a synthetic capture points at the wrong rules, because the real mix of protocols differs.", "Removing the slowest rule without checking what it detects trades speed for an unrecorded gap."],
    v: "Run a representative hour of traffic with profiling on, list the ten rules by total time, then disable the top one and confirm CPU use and packet drops fall as predicted.",
    dep: ["rule-store", "runtime-metrics"]
  },
  "local-rules": {
    s: "Rules written by the site for its own software, assets and known threats, kept separate from the distributed rule set and maintained like code.",
    d: "Local rules cover what no vendor can: a proprietary protocol, a sensitive internal host that should never talk to the internet, a string from an incident. They live in their own file with a reserved identifier range so they never collide with external rules, are kept in version control and reviewed before deployment. A rule gets a message, reference and metadata like any other. The hard part is ownership: a local rule that is wrong costs performance and noise, nobody else will fix it, and the author may have left.",
    k: ["Narrow specific rules versus broad ones: specific rules are cheap and low-noise, but miss variants an attacker can trivially change.", "Local rules in the same repository as the sensor configuration versus separately: together they deploy atomically, separately they can be reviewed by a security team that does not manage the sensors."],
    p: ["A rule written from one incident string keeps firing on legitimate content for years.", "Reusing an identifier from the vendor range makes a later update overwrite the rule silently."],
    v: "Add a local rule for a unique test string, deploy it through the normal process, send the string and confirm one alert with the local identifier, then remove it and confirm it stops.",
    dep: ["rule-validation", "rule-versioning"]
  },
  "detection-replay-testing": {
    s: "Runs saved packet captures through a candidate rule set and configuration and compares the alerts with expected results before anything reaches production.",
    d: "A test corpus holds captures of known attacks, known-benign traffic and tricky edge cases such as fragmented or reordered exploits. A harness runs the sensor in read-from-file mode with the candidate configuration and compares alerts with a recorded expectation, flagging new, missing and changed alerts. It also measures time and memory. Replay must use packet time, not wall time, or time-based logic gives different answers. The difficulty is coverage: the corpus only tests attacks it already contains, so new evasions still pass.",
    k: ["Strict alert equality versus allowed differences: strict comparison catches every change but fails on harmless reordering and requires frequent baseline updates.", "Small curated corpus versus a large recorded sample: curated tests run in seconds and are explainable, while a large sample finds unexpected false positives."],
    p: ["Capture files rewritten by a tool lose original timestamps or checksums, so replay behaves differently from the wire.", "A passing replay is mistaken for proof the rule detects live variants of the attack."],
    v: "Replay the corpus against the production configuration and a candidate. Confirm identical alerts for unchanged rules, and that a deliberately broken rule is flagged as a missing alert in the diff.",
    dep: ["rule-store", "packet-timestamping", "tcp-reassembly"]
  },
  "rule-sources": {
    s: "The suppliers of detection content: commercial feeds, community sets, vendor advisories and the site's own research, each with a different update rate, license and quality.",
    d: "A sensor typically combines several sources. Commercial feeds offer fast coverage of new exploits and support, community sets are free and broad but uneven in quality, and internal research covers site-specific threats. Each source has a rule identifier range, a format, a license that may limit use and a release cadence. The update client merges them into one active set, resolving duplicates. The hard part is overlap and trust: two sources may detect the same attack with different precision, and an untrustworthy source can both add noise and disable detection.",
    k: ["Few trusted sources versus many: fewer sources are easier to evaluate and tune, while many raise coverage and duplicate alerts for the same event.", "Auto-enable all rules versus a curated subset: everything-on maximizes coverage but overwhelms small teams, while curation misses new categories."],
    p: ["Two sources with different identifiers for the same detection double every alert for that attack.", "A feed license restricting commercial use is ignored until an audit."],
    v: "List the active rules by source and confirm each is traced to a supplier and revision, no identifier appears twice, and the update from every source succeeded in the last interval.",
    dep: ["update-client", "rule-versioning"]
  },
  "update-client": {
    s: "The program that periodically fetches new rules and intelligence, verifies them, merges them with site overrides, tests them and installs them on the sensor.",
    d: "On a schedule, the client asks each source for a manifest, downloads changed packages over an authenticated channel, verifies signatures, unpacks them and merges the result with the local rules and overrides into one generated rule set. It runs the engine's own validator on the output and only then replaces the live set and signals a reload. It keeps recent copies for rollback. The hard part is failing safely: a partial download, a broken rule or a source outage must leave the previous good set running, not an empty or half-written one.",
    k: ["Pull on a schedule versus push from a manager: pull works from isolated sensors with outbound access, while push gives central control and a single point of rollout.", "Validate before install versus after: pre-validation prevents a bad set from ever going live, at the cost of needing a full parser on the update host."],
    p: ["An update that writes the rule file in place leaves a truncated file if the process dies, and the next reload loads half the rules.", "Updating all sensors at the same minute overloads the source and makes every sensor miss traffic during reload together."],
    v: "Interrupt a download midway, then inject a rule with a syntax error, and confirm the sensor keeps running the previous rule set both times and records the failure with a reason.",
    dep: ["rule-sources", "update-integrity", "rule-validation", "live-rule-reload"]
  },
  "update-integrity": {
    s: "Proves that downloaded rules and intelligence come from the claimed publisher and were not modified in transit, using signatures and authenticated transport.",
    d: "Rules are code for the sensor: they can disable detections, consume CPU or, on an inline sensor, drop legitimate traffic. The client fetches over an authenticated and encrypted channel, then verifies a detached signature or a signed manifest of file hashes against a pinned publisher key. Credentials for paid feeds are stored apart from the rules. The difficulty is key management: publisher keys rotate, are sometimes compromised, and the sensor needs a safe way to learn about it without trusting the channel being attacked.",
    k: ["Signed content versus trusted channel only: signatures protect against a compromised mirror or interception, while channel security alone trusts every server along the way.", "Pinned key versus a key fetched at update time: pinning resists a compromised download server but needs a protected key-rotation process."],
    p: ["Verification that logs a failure and installs the rules anyway provides no protection.", "A mirror serving stale but validly signed rules rolls detection back to a known-vulnerable state unless versions are checked."],
    v: "Alter one byte in a downloaded rule package and confirm verification fails, the package is rejected, the failure is alerted, and the sensor continues on its previous rule set.",
    dep: ["update-client"]
  },
  "live-rule-reload": {
    s: "Swaps in a new rule set while the sensor keeps processing packets, without restarting, without dropping traffic and without losing flow state.",
    d: "Loading a large rule set means parsing, compiling pattern matchers and building prefilter tables, which can take seconds to minutes and gigabytes of memory. The sensor builds the new set in the background beside the old one, then switches the pointer used by detection threads at a safe point, and releases the old structures once no thread still reads them. Flow and parser state are untouched. The difficulty is memory and consistency: peak memory briefly doubles, and flows in progress get matched under a mix of old and new logic.",
    k: ["Build beside and swap versus restart: swapping avoids any capture gap and keeps flow state, while restarting is simpler but misses traffic and loses all sessions.", "Swap per thread at a safe point versus all at once: per-thread swapping avoids a stall but allows a brief period where threads run different rule versions."],
    p: ["Peak memory during the swap exceeds the machine's limit and the kernel kills the sensor mid-reload.", "A reload triggered while a previous reload is still running stacks two builds and starves packet processing."],
    v: "Reload a full rule set under production-rate replay and confirm the packet-drop counter does not rise, the active rule count changes to the new value, and flow count stays continuous.",
    dep: ["rule-compiler", "multi-pattern-matcher", "memory-pools"]
  },
  "staged-rollout": {
    s: "Deploys new detection content to a small group of sensors first, compares their behavior with the rest, and widens only if alert volume and performance stay acceptable.",
    d: "A bad rule update can flood analysts or push an inline sensor over its time budget. A staged rollout puts the new version on a canary group, an out-of-band monitoring sensor or sensors in non-critical segments, watches alert volume per rule, CPU and drops for a set period and then promotes it. New rules often run in alert-only mode before being allowed to drop. The hard part is selecting canaries that see representative traffic: a lab sensor will not show what a busy data center does.",
    k: ["Canary group first versus everywhere at once: staging catches noisy or slow rules before they hurt, but delays protection against a fast-moving exploit.", "Alert-only first for new drop rules versus enforce immediately: observation avoids breaking traffic, but leaves the first days of a new rule unenforced."],
    p: ["A canary in a quiet segment shows nothing wrong, and the rule overwhelms the busy segment afterward.", "Promotion based on elapsed time only, not on measured behavior, ships rules nobody examined."],
    v: "Release a deliberately noisy rule to the canary group and confirm the rollout holds at that stage, the comparison report shows the alert spike, and no other sensor received the rule.",
    dep: ["central-management", "rule-versioning", "runtime-metrics"]
  },
  "threat-intel-feeds": {
    s: "Lists of known-bad addresses, domains, file hashes and fingerprints from outside sources, loaded into the sensor to match against live traffic.",
    d: "Indicator feeds supply observables with a type, confidence, expiry and source. The sensor loads them into fast lookup structures such as hash tables or prefix tries and checks addresses at the flow level, domain names at the DNS and TLS layers, and hashes on extracted files. A match produces an alert with the indicator's context. The difficulty is quality and age: indicators expire as infrastructure is reused, shared hosting makes one bad domain implicate thousands of harmless ones, and an unbounded list costs memory and false alerts.",
    k: ["Match on indicators versus behavior: indicator matches are precise about what was already seen and cheap, but cover only what is already known and quickly stale.", "Aggressive expiry versus long retention: short expiry limits false positives from reused infrastructure, but forgets slow campaigns."],
    p: ["A feed that includes a major shared service sends alerts for all traffic to it.", "Indicators loaded with no expiry date accumulate and are never removed."],
    v: "Load a feed with one test address and one test domain, generate traffic to each and confirm an alert naming the feed and indicator, then let the entry expire and confirm it stops matching.",
    dep: ["reputation-lists", "update-client"]
  },
  "rule-versioning": {
    s: "Records which version of every rule set and configuration is running on each sensor, and keeps previous versions so a bad update can be reverted quickly.",
    d: "Each rule carries a revision; each generated set has a version, a manifest of sources and a hash. The sensor stores the last several generated sets and reports the current identifier in its status. Rollback means loading a stored set through the normal live reload path. Central tools compare versions across the fleet to find sensors that missed an update. The difficulty is that a version identifies content, not behavior: rolling back removes new detections too, and flow state carried across the swap may not reflect either version fully.",
    k: ["Keep generated sets versus regenerate from sources: stored sets restore the exact prior state, while regeneration depends on sources still serving old versions.", "Version the whole set versus individual rules: whole-set versions are simple to roll back, while per-rule versions allow fine-grained reverts but need dependency tracking."],
    p: ["A rollback restores the rules but not the override configuration that changed with them.", "Sensors report the version of the downloaded set, not the version actually loaded."],
    v: "Install a new set, then roll back, and confirm the sensor reports the previous version identifier, its hash matches the stored copy, and a test that only the old set detects passes again.",
    dep: ["live-rule-reload", "local-storage"]
  },
  "log-shipping": {
    s: "Moves alerts, flow records and protocol logs from the sensor to a central store reliably, with buffering, retry, ordering and bandwidth limits.",
    d: "A forwarder tails output files or receives events over a local socket, batches and compresses them and sends them to a collector over an authenticated, encrypted channel. It tracks how far it has read, so it resumes after a restart without duplicates or gaps, and buffers to disk during an outage. Delivery is at least once, so receivers need to tolerate duplicates. The difficulty is volume: protocol logs for every connection can dwarf alerts, and the shipping path must not compete with packet processing for CPU or disk.",
    k: ["Forward everything versus alerts only: full logs support investigations after the fact, while alerts only cost far less to ship and store.", "At-least-once with duplicates versus at-most-once: duplicates are safe to remove downstream, while lost events can hide the one alert that mattered."],
    p: ["The forwarder's disk buffer is on the same volume as capture storage and fills it during a long outage.", "Log rotation moves a file between reads and the forwarder follows the old file and misses the new."],
    v: "Cut the link to the collector for ten minutes during traffic, restore it, and confirm the collector holds every event from the outage exactly once, in timestamp order after sorting.",
    dep: ["alert-formats", "local-storage", "event-schema-mapping"]
  },
  "event-schema-mapping": {
    s: "Maps sensor event fields to the common schema used by the central platform, so alerts from different sensors and vendors can be searched and correlated together.",
    d: "Sensor output names fields its own way. The mapping renames, retypes and normalizes them into the platform's schema: timestamps in one timezone and format, address fields with consistent direction, severity on a shared scale, rule identifiers kept as references. Unmapped fields are preserved under a raw namespace rather than discarded. Mapping is done by the forwarder or by an ingest pipeline. It is difficult because meaning differs: two products' severity numbers are not equivalent, and source and destination mean different things for alert and flow records.",
    k: ["Map at the sensor versus at ingest: sensor mapping reduces central load but must be updated on every sensor, while central mapping changes in one place.", "Strict schema versus keeping raw fields: strict schemas give clean queries, but dropping unknown fields loses detail needed in an investigation."],
    p: ["Timestamps interpreted in the wrong timezone place events hours from related logs and defeat correlation.", "Mapping severity by number alone makes one vendor's \"low\" rank above another's \"high\"."],
    v: "Ingest the same attack's alert from two sensor types and confirm one search by address and time returns both with matching time, endpoints, direction and a comparable severity.",
    dep: ["alert-formats"]
  },
  "case-and-ticket-hooks": {
    s: "Turns selected alerts into cases or tickets in the response workflow, with enough context attached that an analyst can start without returning to the sensor.",
    d: "Rules for escalation, usually in the central platform, decide which alerts open a case: by severity, by asset importance, by repetition or by a combination with other evidence. The hook posts through an API with the alert, flow, enrichment and a link to saved packets, and deduplicates by key so ongoing activity updates one case instead of opening hundreds. The closing status is written back as feedback to tuning. The difficulty is the feedback loop: without outcomes returned to the detection owner, noisy rules stay noisy.",
    k: ["Automatic case per alert versus per grouped incident: per-alert is simple and complete but buries analysts, while grouping depends on correct keys.", "Closing feedback required versus optional: required feedback improves rules over time, but adds a step analysts skip under load."],
    p: ["Cases opened from a flood of low-value alerts exhaust the ticket system's rate limit and block the important ones.", "A case links to evidence that has already been deleted by retention."],
    v: "Trigger a high-severity alert repeatedly and confirm exactly one case exists with every occurrence attached, and that closing it as a false positive appears in the rule's feedback count.",
    dep: ["event-schema-mapping", "payload-capture", "false-positive-analysis"]
  },
  "active-response": {
    s: "Automated actions taken after an alert, such as adding an address to a firewall blocklist or resetting a session, with limits so the response cannot be turned into an attack.",
    d: "When an alert meets a policy, a response service calls an API on a firewall, a switch or an access-control system to block a source for a limited time, or on the sensor itself to reset a connection. Actions are logged, time-limited, reversible and restricted by an allowlist of addresses never to be blocked. The hard part is trust: an attacker who can spoof source addresses can make the system block a legitimate server or resolver, so automatic response is usually limited to high-confidence detections.",
    k: ["Automatic block versus human approval: automation stops fast attacks, while approval avoids self-inflicted outages but is slow outside working hours.", "Blocking by address versus by session: address blocks stop an attacker's other activity, but shared or translated addresses make collateral damage likely."],
    p: ["Spoofed packets that trigger a rule cause the system to block the organization's own gateway or DNS resolver.", "Blocks without expiry accumulate until the firewall's table is full."],
    v: "Send an exploit from a test address and confirm the block appears with an expiry, the traffic stops, the allowlisted test host is never blocked, and the entry is removed at expiry.",
    dep: ["detection-event", "asset-context-lookup", "inline-drop-and-reset"]
  },
  "asset-context-lookup": {
    s: "Looks up what an address is: its owner, role, software and known vulnerabilities, so alerts can be prioritized by what is actually at risk.",
    d: "An asset service maps addresses and names to records from inventory, vulnerability scans, directory data and address-assignment logs. Given an alert, the lookup answers whether the destination runs the targeted software, whether it is exposed to the internet and who owns it. This turns an exploit alert against a patched or irrelevant host into low priority. The challenge is correctness: addresses are reassigned, cloud hosts are short-lived and inventories lag, so lookups must be time-aware and tolerate misses.",
    k: ["Time-aware lookups versus current state: lookup as of the alert time gives the right answer for old alerts, but needs history and costs more storage.", "Suppress alerts against non-vulnerable targets versus lower priority only: suppression reduces noise, while lowered priority keeps evidence of the attempt."],
    p: ["A lookup against current state attributes last week's alert to a different owner after an address was reassigned.", "An incomplete inventory marks unknown hosts as unimportant, hiding attacks on forgotten systems."],
    v: "Alert on an exploit for a service, once against a host running it and once against one that does not, and confirm the first ranks higher and both show correct owner and software tags.",
    dep: []
  },
  "inline-drop-and-reset": {
    s: "The sensor's own enforcement: dropping a malicious packet before it is forwarded, or injecting a connection reset to terminate the session.",
    d: "On an inline sensor, a rule with a drop action tells the data path not to forward the packet, and the rest of the flow can be dropped too. On a passive sensor, the same detection can send forged reset packets to both ends. Drop requires the sensor to decide before forwarding, so detection must complete within a latency budget; reset acts after the fact and can lose races against fast exploits. The hard part is blast radius: a false positive on a drop rule is an outage for that application.",
    k: ["Inline drop versus out-of-band reset: dropping is certain and immediate but puts the sensor in the failure path, while resets keep the sensor passive and are only best effort.", "Drop the packet versus the whole flow: whole-flow blocking stops the attack reliably, but a mistaken rule then breaks the entire session."],
    p: ["Enabling drop for a rule set tested only as alerts causes outages from false positives nobody had noticed.", "Resets sent from a passive sensor arrive after the exploit has already completed."],
    v: "Send a staged exploit through an inline sensor with a drop rule and confirm the target never receives it, the session ends, an alert records the drop, and benign traffic in the same flow window is unaffected.",
    dep: ["inline-bridge", "detection-event"]
  },
});
