// Details for the intrusion detection plate, part 2: signatures, rule language, anomaly, flow, encrypted traffic.
ATLAS.details("intrusion-detection", {
  "rule-store": {
    s: "The in-memory collection of parsed rules, indexed by protocol, port and pattern, which the detection engine consults for every packet and transaction.",
    d: "After loading, each rule is a structure holding its header, match options, metadata, action and a state for profiling. Rules are grouped by protocol and by the buffer they inspect, and by port or direction, so a packet is only tested against rules that could apply. Group membership is built at load time, not per packet. Large rule sets are tens of thousands of rules and hundreds of megabytes once compiled. The hard part is memory and lookup shape: the grouping must keep the per-packet candidate list short without duplicating rules across many groups.",
    k: ["Group by port versus by protocol and buffer: port groups are cheap but miss services on unusual ports, while protocol-aware groups need reliable identification.", "Shared immutable rule structures versus per-thread copies: sharing saves memory, while per-thread state avoids locks but multiplies footprint."],
    p: ["Rules left in a default group instead of a protocol group are checked against every packet and dominate CPU.", "Memory grows with every rule revision loaded and never released after reload."],
    v: "Load the production rule set and confirm the rule count, memory use and the number of rules in each group match expectations, and that a test packet is checked against only the expected few candidate rules.",
    dep: ["rule-compiler", "memory-pools"]
  },
  "rule-compiler": {
    s: "Parses rule text, checks it, and builds the optimized structures the engine runs: pattern sets, prefilter groups, dependency order of options and lookup tables.",
    d: "Compilation reads each rule, resolves variables and lists, validates keywords against the protocol they apply to, and picks one content pattern as the fast pattern, normally the longest or rarest. It orders the remaining options cheapest-first, so a rule fails quickly. It then builds the matcher tables for each group. This runs at load and reload, can take minutes on large sets and needs substantial memory. The challenge is correctness of optimization: reordering must not change the meaning of rules that depend on positions or earlier matches.",
    k: ["Choose the longest content as fast pattern versus the rarest: length is simple and usually works, while rarity avoids prefilter hits on common strings but needs traffic statistics.", "Compile at startup versus ahead of time: precompiling shortens restart, while startup compilation always matches the engine version."],
    p: ["A rule whose only content is very short becomes the fast pattern, matches in most packets and defeats the prefilter.", "Compilation that silently skips an invalid rule leaves the operator believing it is active."],
    v: "Compile the full rule set and confirm the report lists zero silently skipped rules, shows each rule's chosen fast pattern, and a rule with an intentionally invalid keyword is reported with its line.",
    dep: ["rule-header", "content-options", "multi-pattern-matcher"]
  },
  "fast-pattern-prefilter": {
    s: "A cheap first pass that scans a buffer once for the key strings of thousands of rules at the same time, so full checks run only for rules whose string was found.",
    d: "Each rule contributes one distinctive string. Strings are loaded into a single matcher per rule group, and the engine runs the buffer through it once. Each hit yields a list of candidate rules, which are then checked in full, including the other options, positions and regular expressions. Without this step the engine would test every rule on every packet, which is impossible at line rate. The difficulty is selectivity: if the chosen strings are common in normal traffic, the candidate list stays long and the saving disappears.",
    k: ["Prefilter then verify versus checking every rule: prefiltering turns per-packet cost from number of rules to roughly size of the buffer, at the cost of compile time and memory.", "One matcher per group versus one global matcher: groups keep matching fast and caches warm, while a global one is simpler but slower."],
    p: ["A rule with a common fast pattern fires the prefilter on nearly every web request and drags down the entire group.", "A rule with no usable content, such as one only matching with a regular expression, is checked on every packet."],
    v: "Run a typical traffic hour and confirm the share of packets passing the prefilter and the average number of candidate rules per packet are within the targets, with a profile showing no rule among the top by checks that lacks a good pattern.",
    dep: ["multi-pattern-matcher", "rule-store", "protocol-field-buffers"]
  },
  "multi-pattern-matcher": {
    s: "The algorithm and data structure that finds many fixed strings in one pass over a buffer, typically an automaton or a hashed set of short fragments.",
    d: "Strings from all rules in a group are merged into a state machine that consumes the input one byte at a time and reports every string seen, in time independent of how many strings there are. Variants trade memory for speed: full tables are fastest but huge, compressed forms are small but touch more memory. Some implementations use vector instructions to test many positions at once. Case folding and wildcards are handled in the tables. The hard part is cache behavior: tables for large sets exceed cache, and misses become the dominant cost.",
    k: ["Full state table versus compressed: full tables give one lookup per byte but may not fit in cache, while compression saves memory with extra work per byte.", "Software automaton versus vectorized or hardware matcher: specialized matchers scale much further, but depend on the CPU or an accelerator."],
    p: ["A rule set that grows past cache size slows the sensor sharply, and the cause is not obvious from CPU load alone.", "Case-insensitive patterns double the work if they are not folded consistently at compile time."],
    v: "Benchmark the matcher on a recorded buffer corpus with the production rule set, and confirm it reports every embedded string at the right offsets and sustains the required throughput per core.",
    dep: ["memory-pools", "os-tuning"]
  },
  "regex-engine": {
    s: "Matches regular expressions in rules, either as a verification step after a string prefilter or, in some engines, as part of the prefilter itself.",
    d: "Some attacks cannot be written as fixed strings, so rules include regular expressions. A backtracking engine is flexible but can take exponential time on crafted input. An automaton-based engine runs in linear time but cannot support some features and may need large tables. Engines run on the buffer region already narrowed by earlier options, with limits on match steps and recursion. The challenge is attacker control: payload can be chosen to make a vulnerable expression take seconds, which turns the sensor into the victim.",
    k: ["Backtracking versus linear-time automaton: backtracking supports more syntax and is quick on easy input, but is vulnerable to pathological input that automata avoid.", "Hard resource limits versus none: limits protect throughput and can cause missed matches when exceeded, while no limit lets one packet stall a core."],
    p: ["An expression with nested repetition makes a single crafted request consume a core for seconds.", "A match that stops at the limit is reported as no match with no counter, so evasion looks identical to clean traffic."],
    v: "Feed a known pathological string to each regular expression rule and confirm processing time stays within the limit, a limit-hit counter increments, and normal matches in ordinary traffic are unchanged.",
    dep: ["protocol-field-buffers"]
  },
  "protocol-field-buffers": {
    s: "Named views into decoded protocol data, such as the HTTP URI, DNS query name or TLS server name, that rules match against instead of raw packet bytes.",
    d: "A parser exposes each field as a buffer after decoding and normalization: percent-decoding on a URI, decompression of a body, lowercase on a host. A rule says which buffer to search, and the engine runs the prefilter against that buffer. Positions in a rule are relative to the buffer, not the packet. This removes the need for rules to handle every encoding, and it stops matches across unrelated fields. The difficulty is the contract: if the engine and rule authors disagree on what normalization was applied, rules miss or false-match.",
    k: ["Match decoded fields versus raw bytes: decoded fields defeat encoding tricks and keep rules short, while raw matching sees exactly what was on the wire, including malformed forms.", "A rule per buffer versus matching across buffers: per-buffer is precise and fast, but attacks spanning headers and bodies need multiple linked rules."],
    p: ["A rule written against the raw URI misses the same attack percent-encoded.", "A buffer silently truncated at a size limit misses a match located after the limit."],
    v: "Send the same attack in plain, percent-encoded and double-encoded forms and confirm a rule on the decoded URI buffer fires for the first two, and that the third produces a parser anomaly event.",
    dep: ["http-parser", "dns-parser", "tls-handshake-parser", "decompression-normalization"]
  },
  "file-hash-matching": {
    s: "Checks the hash of each file extracted from traffic against lists of known-bad or known-good files, alerting on a match without examining content again.",
    d: "As files are extracted from a stream, the sensor computes cryptographic hashes incrementally as bytes arrive and looks the final value up in a set loaded from threat intelligence or an internal list. A match triggers an alert with file name, size, type and hash, and the transfer's endpoints. Known-good lists can exclude common files. Lookups are cheap, but hashing consumes CPU per byte, so size limits and file-type filters are used. Hard part: any one-byte change produces a new hash, so only exactly known files are caught.",
    k: ["Hash matching versus content inspection: hashes are cheap, precise and need no rule logic, but are trivially evaded by changing a byte.", "Hash on the sensor versus submit the file for analysis: local hashing is immediate, while submission finds new malware but adds delay and exposes content."],
    p: ["Files split across a flow that dropped packets are hashed incompletely and never match.", "Files above the size limit are skipped without a counter, so large malware is silently ignored."],
    v: "Transfer a file whose hash is on the list over a clear-text protocol and confirm an alert with the right hash, and that the same file with one byte changed produces no alert but is recorded in the file log.",
    dep: ["file-extraction", "threat-intel-feeds"]
  },
  "reputation-lists": {
    s: "Lookup tables of addresses, networks and domains with a category and score, checked at flow start and in protocol logs without per-packet rule cost.",
    d: "Lists classify infrastructure as known scanners, anonymizing networks, command-and-control servers or categories the site wants to monitor. Addresses are held in a prefix tree so a lookup costs a few memory accesses; domains in a hash set with suffix matching. The check runs when a flow is created or when a name is seen in DNS, TLS or HTTP, and a rule can use the category as a condition. The difficulty is maintenance: lists change hourly, are large, and must be swapped without a pause.",
    k: ["Match at flow creation versus every packet: one lookup per flow is cheap, but misses a flow whose reputation changes mid-session.", "Large community lists versus small curated ones: community lists cover more, while curated lists produce alerts people trust."],
    p: ["A list including a cloud provider's range flags legitimate services and floods the queue.", "An update that replaces the table non-atomically leaves a window of missing lookups."],
    v: "Load a list with a test network, open flows to inside and outside it and confirm tagging only for the inside flow, and that a list swap during traffic causes no missed lookups.",
    dep: ["flow-table", "threat-intel-feeds"]
  },
  "rule-header": {
    s: "The first part of a rule: the action, protocol, source and destination addresses and ports, and direction, which select the traffic the rule applies to.",
    d: "The header is the cheap filter. It names an action such as alert, drop or pass; a protocol, which may be a transport or an identified application; address and port expressions that can use lists, ranges, negation and variables; and whether the rule applies one way or both. The compiler uses it to place the rule in a group, so a precise header means fewer candidates per packet. The challenge is expressiveness against cost: very general headers such as any-to-any put a rule in the biggest group and slow everything.",
    k: ["Match by port versus by detected protocol: port is cheap and fixed, while protocol-aware matching finds services on odd ports and needs identification to work first.", "Directional versus bidirectional: directional rules halve the work and avoid mismatched roles, but need correct definitions of internal and external."],
    p: ["Using any-to-any for convenience puts the rule in every group.", "Reversed direction for a server-sent pattern means the rule never matches and nobody notices."],
    v: "Load a rule with a specific header and send matching content to the right port and to a wrong port. Confirm it fires only on the right one and sits in the expected group.",
    dep: ["variables-and-lists"]
  },
  "content-options": {
    s: "Rule keywords that describe the bytes to find and where: the pattern, case handling, offset, depth, distance, length and negation relative to a buffer or a previous match.",
    d: "A content option holds a byte string, which can include hex escapes, and modifiers constraining position: an absolute offset and depth from the buffer start, or a distance and within window relative to the previous match. Several contents in order express a structure of an attack. Negation expresses absence. Options are verified only after the prefilter selects the rule. They are precise but rigid. The difficulty is writing positions correctly: a window too narrow misses variants, and one too wide matches benign content.",
    k: ["Many short contents with positions versus one regular expression: positional contents are faster and prefilterable, while a regular expression is compact but slower and harder to read.", "Exact byte matches versus normalized text matches: exact is unambiguous, but normalized matching handles encodings with fewer rules."],
    p: ["Case-sensitive content on a protocol that is case-insensitive misses trivial variants.", "Relative distance counted from the wrong earlier match makes a rule fire only on one example."],
    v: "Test a rule with three ordered contents against samples with the contents in order, out of order and outside the window. Confirm only the first sample alerts.",
    dep: ["protocol-field-buffers", "regex-engine"]
  },
  "flow-state-keywords": {
    s: "Rule keywords that constrain a match by connection state and direction, such as established sessions, client-to-server data and the protocol transaction being inspected.",
    d: "A rule can require that the TCP session is established, that data flows toward the server, or that the match occurs in a specific transaction of an application protocol. This avoids false matches on packets that merely contain the text, such as a scanner's probe on a closed port or a server response that quotes an attack string. The engine takes the values from the flow table and parser. Using state keywords correctly also lets rules run only on reassembled streams. The risk is that they depend on the sensor having accurate state: lost packets leave state wrong.",
    k: ["Require established state versus match any packet: state requirements cut false alerts and cost, but rules then miss attacks sent in the handshake or on connectionless transports.", "Stream-level matching versus per-packet matching: stream-level sees split patterns, while per-packet is faster and has no reassembly dependency."],
    p: ["A rule requiring an established flow never fires on a sensor that saw only one direction of a split path.", "A to-server rule written for a response pattern is never evaluated."],
    v: "Send the same attack string to a closed port and inside an established session and confirm the rule alerts only on the established session, and only in the client-to-server direction.",
    dep: ["flow-table", "tcp-state-tracking"]
  },
  "variables-and-lists": {
    s: "Named sets of addresses, ports and other values that rules refer to, so a site defines what its internal network, servers and trusted hosts are in one place.",
    d: "Rules use variables such as home network, external network, web servers and database ports instead of literal addresses. Values are defined in the sensor configuration, can be nested and negated, and may be loaded from files, so a big list of addresses is maintained outside the rules. The compiler expands them when building the groups. The correctness of many rules depends on them: if the home network is defined wrongly, directional rules are inverted and exploit rules for internal servers apply to nothing.",
    k: ["One shared definition versus per-rule values: shared variables make a site's rules consistent and easy to update, while per-rule values are flexible but drift.", "Inline lists versus external files: inline lists are visible in review, while files scale to large sets and update without editing rules."],
    p: ["A default home-network variable of any silently disables direction-based filtering and multiplies alerts.", "A variable defined after its first use is expanded as empty."],
    v: "Change the web-server variable to include one more address, reload, and confirm the rule set now alerts on exploits aimed at that address and the compile report lists the expanded value.",
    dep: ["sensor-configuration"]
  },
  "cross-packet-flags": {
    s: "Rule keywords that set and test named markers on a flow or host, allowing detections that need an earlier event to have happened before a later one counts.",
    d: "One rule sets a marker when it sees a step of an attack, such as a login to a service; another rule alerts only if the marker is present when a second step arrives. Markers are stored in the flow, or in a small host-level table with an expiry. This allows multi-step detections without a separate correlation engine, and keeps first-step rules from alerting by themselves. The hard part is state cost and lifetime: markers that never expire accumulate, and markers kept per flow are lost when the flow ends before the second step.",
    k: ["Per-flow markers versus per-host markers: per-flow is cheap and cleans up automatically, while per-host spans multiple connections and requires expiry and memory control.", "Detection in the sensor versus in the central correlation system: in the sensor it is fast and local, while central correlation can see multiple sensors and richer logic."],
    p: ["Markers set by a rule that is later disabled leave dependent rules that can never fire.", "Host-level markers without expiry grow with every address seen and consume memory under scans."],
    v: "Send step one and step two in order on one flow and confirm a single alert; send step two alone and confirm none; send step one, wait past the expiry, then step two and confirm none.",
    dep: ["flow-table", "flow-state-keywords"]
  },
  "rule-validation": {
    s: "Static checks that a rule file parses, uses valid keywords and references, and does not have obvious cost or logic problems, run before the rules reach a sensor.",
    d: "A linter and the engine's own test mode load the rule file without processing traffic. They detect syntax errors, unknown keywords for the given protocol, undefined variables, duplicate identifiers, rules missing a message or revision, and patterns likely to be slow, such as no fast pattern or very short contents. Validation runs in the update client, in continuous integration for local rules and before a reload. It is hard to make complete: it proves the rule is well formed, not that it detects what it was meant to detect.",
    k: ["Validate with the real engine versus a separate linter: the engine is authoritative for what will load, while a linter can run anywhere and add style and cost rules.", "Warnings block deployment versus only errors: blocking keeps quality high, but a strict gate delays urgent rules."],
    p: ["A rule passes validation and fails at load because of memory limits that only exist on the production sensor.", "A linter version older than the engine rejects rules that use newer keywords."],
    v: "Feed the validator a file with a syntax error, a duplicate identifier and a rule without a fast pattern and confirm each is reported with its line, and that a clean file exits successfully.",
    dep: ["rule-compiler"]
  },
  "baseline-learning": {
    s: "Builds a profile of normal behavior per host, service or segment from observed traffic, against which later traffic is compared.",
    d: "The system collects features over a learning window, such as per-host connection counts, peers contacted, ports used, bytes per direction and time-of-day patterns, and stores distributions or ranges. After learning, current behavior is compared with the profile, with seasonality, such as weekly cycles, taken into account. Baselines are updated slowly so legitimate change is absorbed. Difficulty is the training data: if an attack is present while learning, it becomes normal, and a network that changes constantly never has a stable baseline.",
    k: ["Learn from live traffic versus from a curated period: live traffic adapts but may learn the attack, while a curated period is clean but goes stale.", "Per-host baselines versus per-role baselines: per-host is precise but sparse for new hosts, while roles generalize and need an accurate inventory."],
    p: ["An attacker who moves slowly shifts the baseline until the activity is normal.", "A baseline learned over a holiday week flags every normal working day as anomalous."],
    v: "Train on four weeks of traffic, inject a new host contacting a hundred unseen peers, and confirm a deviation is reported, while the same host behaving normally for a day produces none.",
    dep: ["flow-aggregation", "flow-table"]
  },
  "statistical-detectors": {
    s: "Simple measured thresholds and deviations, such as sudden growth in connections, bytes or error rates, that flag volumetric attacks and misuse without needing content.",
    d: "Counters are kept over sliding windows per source, destination or service: new connections, failed connections, distinct destinations, response sizes. An alarm fires when a counter exceeds a fixed limit or deviates from its recent mean by several standard deviations. Techniques include exponentially weighted averages and change-point detection. They are cheap, explainable and cover denial of service, brute force and exfiltration by volume. Hard part: thresholds. A fixed number suits one network and not another, and adaptive ones can be walked upward by an attacker.",
    k: ["Fixed thresholds versus adaptive ones: fixed limits are predictable and easy to explain, but need per-site tuning, while adaptive limits follow traffic and can be slowly trained.", "Short windows versus long windows: short windows react quickly and are noisy, while long windows are stable and miss brief bursts."],
    p: ["A legitimate backup or software release looks like a volumetric attack every time it runs.", "Counters per source address in a large address space exhaust memory under spoofed traffic."],
    v: "Generate a controlled burst of connection attempts at a known rate and confirm the detector fires within its window at the configured limit and does not fire on a gradual, legitimate increase.",
    dep: ["flow-aggregation", "baseline-learning"]
  },
  "protocol-conformance": {
    s: "Checks that traffic follows the protocol's rules: valid lengths, field values, message order and port-protocol agreement, flagging deviations used by exploits and evasion.",
    d: "Parsers know what a legal message looks like and emit an event on violation: a header longer than the specification allows, an unknown option, a response without a request, or a protocol running on a port normally used for another. These events work without signatures because exploits often depend on malformed input. They also detect tunnels carrying other protocols over allowed ports. The difficulty is that real software is sloppy: legitimate clients violate specifications constantly, so strict checks are noisy and need tuning by protocol and implementation.",
    k: ["Strict checking versus tolerance matching real implementations: strictness catches more attacks, while tolerance avoids constant alerts from broken but harmless clients.", "Alert on violation versus record as a log field: alerting draws attention, while logging allows later hunting without fatigue."],
    p: ["Enabling every conformance check on day one generates thousands of alerts from one legacy application.", "Checks disabled to reduce noise remove the sensor's best signal for novel exploits."],
    v: "Send a request with a malformed length and a valid one on a standard port and confirm one anomaly event for the malformed request, naming the violated rule, and none for the valid one.",
    dep: ["parser-anomaly-events", "protocol-identification"]
  },
  "scan-detection": {
    s: "Detects reconnaissance by counting how many distinct ports or hosts one source probes, and how many probes fail, in a short time window.",
    d: "A scanner touches many addresses or ports; legitimate clients touch few. The detector tracks, per source, the number of distinct destinations and ports, connection attempts that were reset or never answered, and the speed of probing. Crossing a limit raises an alert classifying the scan as horizontal across hosts, vertical across ports or a block of both. Slow scans stretch across hours to stay under limits and are caught only with long-term state. The challenge is tell-apart: internal vulnerability scanners and monitoring tools look identical and must be allowlisted.",
    k: ["Short window with a low limit versus long window with a high limit: short windows catch fast scans quickly, while long windows catch slow, patient ones at the cost of memory.", "Count by source versus by source and destination pair: per source finds sweeps, while per pair finds persistent targeting."],
    p: ["Scanner traffic from a spoofed source causes the sensor, or a response system, to treat an innocent address as hostile.", "Per-source state under a wide spoofed scan exhausts memory unless it is capped."],
    v: "Run a port scan of one hundred ports and a host sweep from a test machine and confirm separate vertical and horizontal alerts at the configured limits, and no alert from a normal client.",
    dep: ["flow-table", "statistical-detectors"]
  },
  "beaconing-detection": {
    s: "Finds malware checking in with a controller by looking for regular, repeated connections to the same destination, even when the content is encrypted.",
    d: "An infected host contacts its controller at intervals, often with added randomness. The detector groups flows by source and destination, measures the spacing between connections and the sizes of requests and responses, and scores regularity: low variance in interval, near-constant sizes, long duration. It is run in batches over flow records or incrementally in the sensor. Good detectors tolerate jitter and missing samples. The challenge is that benign software polls too: update checks, mail clients, monitoring agents and chat applications all look like beacons.",
    k: ["Interval regularity versus destination reputation: regularity finds unknown controllers, while reputation is precise but only covers known ones.", "Real-time scoring versus daily batch: batch uses more data and is more accurate, while real-time shortens detection time and uses more memory."],
    p: ["Legitimate agents with fixed polling intervals dominate the top of the list and bury the genuine beacon.", "Jitter added by the attacker pushes the score below the threshold."],
    v: "Generate a test beacon every sixty seconds with ten percent jitter among normal traffic and confirm it ranks in the top results with the interval estimated within a few seconds, while a human browsing pattern does not.",
    dep: ["flow-aggregation", "connection-logs", "size-and-timing-features"]
  },
  "dns-anomaly-detection": {
    s: "Flags suspicious name lookups: algorithmically generated names, unusually long or high-entropy labels, rare domains, tunneling through queries and floods of failed lookups.",
    d: "DNS is allowed nearly everywhere, which makes it a channel for control and data theft. Detectors compute features per name and per host: label length, character entropy, ratio of digits, count of unique subdomains under one domain, query type mix, response size and rate of non-existent answers. Scores come from rules, statistics or a classifier. Because every host uses DNS, the data is rich. The difficulty is encrypted and cached lookups: queries sent to external resolvers over encryption are invisible, and internal resolver logs hide the real client.",
    k: ["Detect at the sensor versus in resolver logs: the sensor sees all traffic including direct queries, while resolver logs carry the true client and survive encryption.", "Entropy rules versus trained classifiers: entropy is simple and explainable, but fails on dictionary-based generated names that a classifier can learn."],
    p: ["Content delivery and security products use long random-looking names legitimately and trigger entropy rules.", "Clients behind a shared resolver all appear as the resolver, so the infected host is not identified."],
    v: "Run a tunneling tool and a generated-name sample through a lab resolver and confirm both are flagged with the client address, while a day of normal lookups produces few alerts.",
    dep: ["dns-parser", "statistical-detectors"]
  },
  "ml-classifiers": {
    s: "Trained models that score flows, transactions or files from many features at once, finding patterns too complex or numerous to write as rules.",
    d: "Models are trained on labeled examples of normal and malicious traffic using features such as ports, sizes, timing, protocol fields and handshake properties. At runtime the sensor extracts the same features and calls the model, locally or on a service, returning a score. Used for malicious domain detection, encrypted malware traffic, and ranking alerts. Operating them needs a pipeline for labeling, retraining and monitoring drift. The hard part is data: public datasets differ from any real network, labels are scarce and attackers adapt.",
    k: ["Supervised versus unsupervised learning: supervised models detect known classes accurately but need labels, while unsupervised ones need none and produce alerts hard to explain.", "Model on the sensor versus a central service: on the sensor adds latency and CPU to the data path, while central scoring delays results but uses more context."],
    p: ["A model that scores very well on a benchmark performs poorly on live traffic because the training mix differs.", "Alerts the model cannot explain are ignored by analysts, however accurate the score."],
    v: "Score a held-out capture from the deployment network with known labels and confirm the measured false-positive rate on the production traffic mix is within budget, and that retraining on new labels changes results as expected.",
    dep: ["size-and-timing-features", "flow-record-schema", "baseline-learning"]
  },
  "flow-exporter": {
    s: "Summarizes packets into flow records and sends them to a collector when a flow ends or at set intervals, from a router, switch or dedicated sensor.",
    d: "The exporter keeps a cache of active flows keyed by addresses, ports and protocol. Each packet updates counters and flags; a record is emitted when the flow terminates, when it is idle past a timeout, or when it has been active for too long, so long flows report periodically. Records are exported in a standard template-based format over UDP or a reliable transport. It is hard to scale: cache size and timeouts decide memory and accuracy, and an overloaded exporter drops or truncates records.",
    k: ["Active and idle timeouts short versus long: short timeouts give timely data and many records, while long ones reduce volume and delay detection.", "Export over UDP versus reliable transport: UDP is cheap and easy for hardware, while reliable transport avoids silent loss at the cost of state."],
    p: ["A cache sized for normal traffic overflows during a scan and evicts records early, so the scan itself is undercounted.", "Template changes not seen by a collector make records undecodable until the template is resent."],
    v: "Send a known number of packets and bytes in a test flow and confirm the collected record reports the same counts, correct start and end times and flags, and a second record for a long flow at the active timeout.",
    dep: ["flow-table", "packet-timestamping"]
  },
  "flow-record-schema": {
    s: "The defined set of fields in a flow record, such as endpoints, counters, flags and times, and the extension mechanism for adding application or detection data.",
    d: "A flow schema lists fields with types and meanings: addresses, ports, protocol, packet and byte counts per direction, first and last times, TCP flags, input and output interface, and optionally application, VLAN, DNS name or TLS server name. Templates let exporters send different field sets and collectors interpret them. Enriched schemas add what a packet sensor knows. The difficulty is that a flow is not a standard unit: whether a record is one direction or two, and how its end is defined, varies, and comparing sources requires care.",
    k: ["Unidirectional versus bidirectional records: unidirectional is simple and hardware-friendly, while bidirectional records are easier to analyze and need pairing state.", "Minimal fixed schema versus extensible templates: fixed is easy to store and query, while extensible carries enrichment at the cost of heterogeneous data."],
    p: ["Collectors that assume bidirectional records double-count traffic from sources exporting two records per conversation.", "Interface counters from different devices use different units and are compared directly."],
    v: "Export the same test conversation from two exporter types and confirm after normalization the endpoint, packet and byte totals agree within the stated tolerance and fields map to one schema.",
    dep: ["flow-exporter"]
  },
  "flow-aggregation": {
    s: "Combines flow records by time, host, service or segment into counts and profiles that detectors and analysts can use at scale.",
    d: "Raw records are too many for long retention. Aggregators roll them up into per-host, per-pair and per-service totals over minutes, hours and days, keeping distinct-peer counts, byte distributions and top talkers. Sketches and approximate counters track distinct values cheaply. Detections that need long history, such as slow scans or baselines, read these summaries. Aggregation loses detail by design: once individual connections are summarized, an investigation can no longer see which connection carried what.",
    k: ["Aggregate early versus keep raw records: early aggregation saves storage and speeds queries, while raw records permit new questions about the past.", "Exact counts versus approximate sketches: sketches use constant memory for very large cardinalities, but give results with error bounds."],
    p: ["Aggregating by address before address translation attributes the traffic of thousands of users to one host.", "Time buckets in different timezones misalign summaries from different collectors."],
    v: "Aggregate a known set of records and confirm the totals and distinct-peer counts match a direct count on the raw data, within the sketch's stated error, and that retention drops raw data on schedule.",
    dep: ["flow-collector", "flow-record-schema"]
  },
  "packet-sampling": {
    s: "Examines only one packet in N, or a random subset of flows, to bound the cost of flow export on very fast links at the price of exactness.",
    d: "On high-speed links, per-packet flow accounting is expensive, so the hardware samples packets at a configured rate and builds records from the samples. Counts are scaled by the rate to estimate totals. Large flows are captured well; small flows are often missed entirely. Smarter schemes sample by flow or adapt to load. The challenge is what sampling cannot see: a short attack of a few packets, such as one exploit request, is likely to vanish, so sampled data suits volume analysis but not detection of small events.",
    k: ["Random packet sampling versus flow sampling: packet sampling is simple and stateless in hardware, while flow sampling keeps every packet of chosen flows and needs a flow table.", "High versus low sampling rate: a high rate reduces load but loses small flows, while a low rate improves visibility and costs more at the exporter."],
    p: ["Scan and exploit traffic made of a few packets per flow is almost never sampled.", "Totals not rescaled by the sampling rate are reported as true counts."],
    v: "Replay traffic with a known mix at 1-in-1000 sampling and confirm the scaled byte totals agree with the true total within a few percent for large flows, and document that a ten-packet flow is usually missing.",
    dep: ["flow-exporter", "hardware-filtering"]
  },
  "flow-collector": {
    s: "Receives records from many exporters, decodes templates, deduplicates, timestamps and stores them for query, analysis and detection.",
    d: "The collector listens for exports, tracks templates per exporter, decodes records into the schema and writes them to storage organized by time. It corrects for clock offsets between exporters, removes duplicates when the same flow is exported by several devices along a path, and tags records with the exporter's identity and network location. Queries range over days or months. The challenge is scale and loss: UDP exports can be dropped silently when the collector's socket buffer overflows during bursts.",
    k: ["Store everything versus store aggregates: raw storage supports investigation, but retention at large networks costs more than most budgets allow.", "Deduplicate in the collector versus in queries: collector dedup keeps queries simple, while query-time dedup keeps all data and moves cost to analysis."],
    p: ["Socket buffer overflow drops records during traffic peaks, precisely when attacks happen.", "An exporter whose clock is minutes off places its records in the wrong period."],
    v: "Export a counted burst from several devices, including duplicates along one path, and confirm the stored record count equals the expected number after dedup, each tagged with its exporter and with consistent times.",
    dep: ["flow-record-schema", "local-storage", "time-synchronization"]
  },
  "connection-logs": {
    s: "Per-connection and per-transaction logs written by the sensor itself from parsed traffic, with application detail that standard flow records do not carry.",
    d: "As flows and protocol transactions complete, the sensor writes structured records: connection with duration, bytes, state and history; separate logs for each DNS query, HTTP request, TLS handshake, file transfer and certificate, linked by a shared connection identifier. They cost more than flow records, but turn a sensor into a searchable archive of what happened, useful when an alert needs context and for hunting without full capture. The difficulty is volume and privacy: these logs contain names, URLs and metadata for all users, not only for alerted traffic.",
    k: ["Log all transactions versus only for alerted flows: full logs support hunting for what no rule found, but cost storage and expose more user data.", "One log per protocol versus one combined record: separate logs keep fields clean and compact, while a combined record makes querying one conversation easier."],
    p: ["Logs of every URL requested keep users' browsing history for the full retention period.", "Connection identifiers reused after a restart link unrelated records."],
    v: "Perform a web request and confirm one connection record and one matching HTTP record, one DNS record and one TLS record all share the same connection identifier and consistent timestamps.",
    dep: ["http-parser", "dns-parser", "tls-handshake-parser", "flow-table"]
  },
  "tls-fingerprinting": {
    s: "Identifies the client or server software behind an encrypted session by hashing parameters in its unencrypted handshake, such as cipher list, extensions and curves.",
    d: "The first messages of a TLS connection are visible. Their offered versions, cipher suites, extension order and elliptic curve choices form a pattern characteristic of a library and configuration. The sensor hashes the pattern into a short fingerprint and logs it; rules and lookup tables then match known-bad or unexpected values, for example a fingerprint of malware tooling, or an old library on a server that should be modern. The difficulty is that many programs share one library, and attackers can copy a browser's handshake.",
    k: ["Fingerprint the client versus the server: client fingerprints identify software on your hosts, while server fingerprints identify infrastructure and are more stable per service.", "Exact hash match versus similarity: exact hashes are fast and unambiguous, while similarity tolerates small randomization, which some clients now apply to extension order."],
    p: ["Randomized extension order in current browsers breaks fingerprints that depend on order.", "A fingerprint shared by malware and a popular library blocks legitimate software."],
    v: "Capture handshakes from three known clients and confirm each yields a stable, distinct fingerprint across repeated connections, matching the lookup table, and that a rule on a test fingerprint alerts only for that client.",
    dep: ["tls-handshake-parser", "reputation-lists"]
  },
  "certificate-analysis": {
    s: "Examines the server certificates that appear in handshakes, flagging self-signed, expired, newly issued, mismatched or unusual ones that suggest malicious infrastructure.",
    d: "In older protocol versions and in many handshakes certificates cross the network in the clear. The sensor parses issuer, subject, validity period, names and key properties, and checks them against rules: certificate does not match the requested name, is self-signed, expires after an unusual period, or was issued hours ago for a domain that looks like another. Results are logged with the connection. It is limited by encryption: modern protocol versions encrypt the certificate, leaving only the server name and fingerprints.",
    k: ["Alert on any anomaly versus score several together: single checks are simple but noisy, while combining weak signals produces fewer, better alerts.", "Check certificates at the sensor versus against transparency logs: sensors see actual traffic and need no external data, while logs reveal new certificates before any traffic uses them."],
    p: ["Internal services with private issuers all appear self-signed and flood the alert queue.", "Newer protocol versions hide the certificate, and the check quietly stops producing results."],
    v: "Connect to servers with an expired, a self-signed and a name-mismatched certificate and confirm each is recorded with the right finding in the log, and that a valid certificate is not flagged.",
    dep: ["tls-handshake-parser"]
  },
  "size-and-timing-features": {
    s: "Features computed from packet sizes, directions and spacing that characterize traffic without reading its contents, and so remain usable on encrypted sessions.",
    d: "Even when content is hidden, the sequence of packet lengths, the order of directions, inter-arrival times, burst structure and total bytes reveal behavior: a file download, an interactive shell, a periodic check-in or a bulk upload. The sensor computes these for each flow, often over the first packets, and passes them to rules, statistical detectors or classifiers. Cheap and privacy-preserving, but weaker: many unrelated applications share similar patterns, and padding and traffic shaping can destroy them.",
    k: ["Features from the first N packets versus the entire flow: early features give a decision quickly and use little state, while whole-flow features are richer and arrive too late to block.", "Hand-chosen features versus learned: chosen features are explainable and cheap, while learned representations find subtler patterns and need data and compute."],
    p: ["Measuring timing at a point where traffic is buffered adds jitter that blurs regular patterns.", "Features computed on flows cut by timeouts describe partial sessions."],
    v: "Compute the features for a known interactive session and a bulk download and confirm the sequences and timing differ in the expected ways, are reproducible across runs, and match a reference computation.",
    dep: ["flow-table", "packet-timestamping"]
  },
  "server-name-inspection": {
    s: "Reads the requested server name from the handshake to log and filter encrypted connections by destination, as long as it is not itself encrypted.",
    d: "A client normally names the server it wants in a plain field of its first handshake message, so the sensor can log and match domain names without decrypting anything, and use reputation lists or rules on them. Newer extensions encrypt this field, in which case only the outer, generic name or none remains, and the sensor falls back to addresses, certificates and fingerprints. Hard part: the field is client-supplied, so it can be forged to look benign while the connection goes elsewhere, a technique called domain fronting.",
    k: ["Trust the name versus cross-check with address and certificate: trusting is simple, while cross-checking catches fronting at the cost of extra lookups.", "Block on the name versus alert only: blocking stops known-bad destinations, but a name shared by many tenants of one service can break legitimate use."],
    p: ["Encrypted name extensions make the field disappear, and name-based rules stop matching without warning.", "A client-supplied name that disagrees with the certificate goes unnoticed because only one is logged."],
    v: "Connect to a lab server using a plain name and then using an encrypted one and confirm the first logs the name and matches a name-based rule, and the second is recorded with the name missing flag.",
    dep: ["tls-handshake-parser", "reputation-lists"]
  },
  "tls-decryption": {
    s: "Decrypts traffic for inspection, either by acting as an authorized intermediary on the path or by using session keys supplied by the endpoint.",
    d: "Two approaches exist. A proxy terminates the client's connection, inspects the plaintext, and opens a second connection to the server, presenting certificates issued by an internal authority trusted by clients. Alternatively, endpoints export per-session keys to the sensor, which decrypts a passive copy. Either gives full content to the signature and parser layers. Decryption is expensive, breaks applications that pin certificates, and forward secrecy defeats the use of a server's long-term key. It also concentrates risk: plaintext of every user passes through one device.",
    k: ["Intercept on the path versus passive with exported keys: interception can also block and works for any client, while key export is invisible to the application but needs endpoint cooperation.", "Decrypt everything versus bypass categories: full decryption maximizes visibility, while bypassing banking and health traffic respects policy and law and reduces load."],
    p: ["Applications that pin certificates fail outright when the inspector substitutes its own.", "The internal issuing key, if stolen, lets an attacker impersonate any site to every client."],
    v: "Pass a test session through the decrypting path and confirm rules fire on the decrypted payload, that bypass-category traffic is untouched, and that the client's certificate chain shows the internal issuer.",
    dep: ["tls-handshake-parser", "privilege-separation"]
  },
  "encrypted-dns-handling": {
    s: "Deals with name lookups carried inside encrypted transports, which hide queries from the sensor, by controlling resolvers, blocking direct use or collecting logs elsewhere.",
    d: "When a device sends lookups to an outside resolver over an encrypted channel, the sensor sees only a connection to an address on a known port and sometimes a resolver name. Options are to provide an internal resolver and block or flag connections to known external resolvers, to detect resolver traffic by address and fingerprint lists, or to rely on logs from the resolver or endpoint. Without one of these, the lookups that most reveal malware are invisible. The tradeoff between privacy for users and visibility for defenders is a policy question.",
    k: ["Block outside resolvers versus monitor them: blocking restores visibility and can break roaming devices, while monitoring leaves the lookups invisible.", "Sensor-side detection versus endpoint logging: the sensor needs no software on hosts, while endpoint logs see names even over encryption and require agents."],
    p: ["A resolver address list falls behind, and traffic to new public resolvers is not noticed.", "Applications bundling their own resolver bypass the operating system's settings entirely."],
    v: "Configure a test device to use an outside encrypted resolver and confirm the sensor flags the connection as resolver traffic, and that lookups through the internal resolver appear in the DNS log.",
    dep: ["dns-parser", "reputation-lists", "tls-fingerprinting"]
  },
});
