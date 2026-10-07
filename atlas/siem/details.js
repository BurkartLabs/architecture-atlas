// Details for the SIEM plate, part 1: collection and transport, parsing and normalization.
ATLAS.details("siem", {
  "host-agents": {
    s: "Software installed on servers and workstations that reads local logs and event channels and forwards them, with buffering, filtering and enrichment close to the source.",
    d: "An agent runs as a service, subscribes to the operating system's event channels, tails log files and reads audit records, then batches and ships them over an authenticated channel. It remembers file positions across restarts, applies local filters and can add host metadata. It is hard because it runs on machines it does not control: it must stay within a small CPU and memory budget, survive rotation and truncation of files, and keep working while the host is being attacked and its logs are being cleared.",
    k: ["Agent on every host vs agentless pull: agents see local-only events and buffer through outages, but add a fleet to patch and a process an intruder can stop.", "Filter at the agent vs ship everything: filtering saves bandwidth and ingest cost, but a dropped event cannot be investigated later."],
    p: ["Log rotation that renames a file mid-read makes the agent re-send old lines or skip new ones.", "An agent silently stopped by an intruder looks identical to a quiet host unless a heartbeat is monitored."],
    v: "Stop the agent on a test host, generate events, restart it, and confirm every event arrives once with its original timestamp. Then confirm a missing heartbeat raises an alert within the configured interval.",
    dep: ["transport-reliability", "collector-management"]
  },
  "syslog-receivers": {
    s: "Network listeners that accept the standard line-oriented log protocol and its structured variants from devices that cannot run an agent, such as firewalls, switches and appliances.",
    d: "A receiver binds to a port over datagram or stream transport, optionally wrapped in TLS, and accepts messages whose format varies by sender. It identifies the source by address or certificate, assigns a source type, and passes raw lines to parsing. Datagram transport gives no delivery guarantee, so loss is silent. The difficulty is identity and trust: sender addresses are spoofable, devices behind translation share one address, message sizes and framing differ, and a flood from one noisy device can starve the rest.",
    k: ["Datagram vs stream transport: datagrams are cheap and simple for devices, but loss is invisible; streams add acknowledgment and TLS at the cost of connection state.", "Source identity by address vs by certificate: addresses need no device setup, but break behind translation and can be spoofed."],
    p: ["Devices behind address translation all appear as one source, merging unrelated hosts in every later search.", "An unauthenticated listener lets anyone on the network inject fake events to hide or frame activity."],
    v: "Send a message from a test device over each supported transport and confirm it arrives with the correct source identity and unaltered text. Send from a spoofed address and confirm it is rejected or flagged.",
    dep: ["transport-reliability", "ingest-buffer"]
  },
  "api-pollers": {
    s: "Scheduled jobs that call the management interfaces of cloud and software services to pull audit and activity logs, keeping a checkpoint so each event is fetched once.",
    d: "Many services expose events only through an authenticated HTTP interface, so a poller holds credentials, requests pages from a stored cursor, handles rate limits and token expiry, and converts responses to events. Delivery is delayed by whatever latency the service adds before events become queryable. The hard parts are credential management, rate limits that vary by customer tier, cursors that skip events written out of order, and interfaces that change without notice and silently return less data.",
    k: ["Cursor by time vs by sequence token: time is simple but misses late-arriving events; tokens are exact but expire or reset when the provider changes them.", "Poll frequently vs rarely: frequent polling lowers detection delay but exhausts rate limits and raises provider cost."],
    p: ["An expired credential makes the poller fail quietly, and the source appears to have no events at all.", "A fixed lookback window drops events that the provider publishes minutes late."],
    v: "Generate a known set of events in the service, wait for one polling cycle, and confirm all arrive exactly once. Revoke the credential and confirm a health alert fires rather than silence.",
    dep: ["collector-management", "transport-reliability"]
  },
  "cloud-event-streams": {
    s: "Subscriptions to cloud provider activity feeds delivered through message queues or storage buckets, giving near-real-time control-plane and data-plane events without polling.",
    d: "A cloud account is configured to write audit events, flow records and resource logs into a bucket or publish them to a topic. The SIEM reads notifications, fetches the objects, decompresses and splits them into events. Multiple accounts and regions each need their own configuration, usually through templates. Difficulty comes from scale and governance: new accounts must be onboarded automatically or they become blind spots, object formats are batch files with their own delays, and cross-account permissions are easy to make too broad.",
    k: ["Notification plus object fetch vs direct streaming: object-based delivery is cheap and durable but adds minutes of delay; streaming is faster but costs more and needs consumers to keep up.", "Central collection account vs per-account collectors: central is simpler to secure, per-account scales independently."],
    p: ["A newly created account is never wired up, so an attacker works in the one place nobody logs.", "Reprocessing the same bucket object after a retry duplicates every event inside it."],
    v: "Create a resource in a freshly provisioned account and confirm its creation event appears in the SIEM within the documented delay, without anyone configuring that account by hand.",
    dep: ["transport-reliability", "ingest-buffer"]
  },
  "network-telemetry": {
    s: "Flow records, packet-derived metadata and decoded protocol logs from network sensors, showing who talked to whom even when endpoints have no agent or logs.",
    d: "Routers and sensors export flow summaries, while passive sensors on mirror ports or taps decode protocols such as name resolution, web and file transfer into structured records, and sometimes extract files or certificates. These records are consumed like any log. Sampling and encryption limit what is visible. The challenge is volume and placement: full capture is rarely affordable, so sensors sit at chokepoints, and traffic that never crosses them, or is encrypted end to end, produces nothing.",
    k: ["Flow summaries vs decoded protocol metadata: flows are compact and cheap but show only endpoints and volume; decoded records show content context at higher storage cost.", "Sampled vs complete export: sampling bounds cost, but short, low-volume attacks fall through the gaps."],
    p: ["Sensors placed only at the perimeter miss all lateral movement inside the network.", "Mirror port oversubscription drops packets silently, so decoded logs under-report during peaks."],
    v: "Run a known connection and a known name lookup between two test hosts across a monitored link, and confirm both appear as records with correct addresses, ports and byte counts.",
    dep: ["forwarders", "ingest-buffer"]
  },
  "file-and-database-collection": {
    s: "Collectors that read application logs from files and audit tables from databases where no streaming interface exists, tracking position so rows and lines are read once.",
    d: "A file collector tails a path pattern and handles rotation, compression and multi-line records such as stack traces. A database collector runs queries against an audit table on a schedule using a monotonically increasing column as a cursor. Both turn rows or lines into events. The difficulty is correctness: multi-line records must be joined, cursor columns can have gaps or be updated after commit, and queries against production databases must not add load or take locks.",
    k: ["Tail files in place vs have the application ship them: tailing needs no code change, but depends on file layout and rotation behavior nobody guarantees.", "Cursor by id vs by timestamp: ids are cheap but not always gap-free; timestamps tie and can lag commit order."],
    p: ["Rows committed late with an earlier timestamp are skipped forever by a timestamp cursor.", "A heavy collection query on a production database slows the application it is meant to protect."],
    v: "Write a multi-line error and ten audit rows with one committed out of order, and confirm the SIEM holds exactly one joined error event and all ten rows without duplicates.",
    dep: ["host-agents", "transport-reliability"]
  },
  "agentless-collection": {
    s: "Remote collection over management protocols, where a central collector connects to each system with stored credentials to read its logs, used where agents are not allowed.",
    d: "The collector authenticates to a remote host or device with a service account, runs a read of its event store or a command, and returns the output. It works for appliances and locked-down systems, and needs only network reachability. It scales poorly because each target is a connection and a credential. Reading remote logs adds latency, and the service account is a powerful credential that must be rotated, scoped to read-only and protected, since stealing it exposes every system it can reach.",
    k: ["Agentless pull vs local agent: pull needs nothing installed, but adds delay, central load and a high-value credential.", "One shared collection account vs per-system accounts: shared is easy to rotate, per-system limits damage from theft but multiplies management."],
    p: ["A shared read account with broad rights becomes the best target on the network.", "Collection that falls behind on a large estate silently turns near-real-time detection into hourly detection."],
    v: "Point the collector at a test system, create an event, and confirm it is read within the stated delay using an account that cannot write or execute anything beyond log reads.",
    dep: ["collector-management", "transport-reliability"]
  },
  "forwarders": {
    s: "Intermediate relays that receive events from many sources, then filter, buffer, compress and route them onward, sparing sources a direct path to the SIEM across slow or restricted links.",
    d: "A forwarder sits in a site or network zone, accepts events from agents and receivers, and sends them upstream over one outbound connection. It can apply routing rules, mask fields, add site tags and hold data on disk during an outage. It reduces firewall exceptions and wide-area chatter. The difficulty is that it concentrates failure: one stuck forwarder silences a whole site, and a misconfigured routing rule can quietly send data to the wrong destination or drop it.",
    k: ["Tiered forwarders vs direct send: tiers cut connections and allow local buffering, but add hops, delay and a single point of failure per site.", "Mask sensitive fields at the relay vs at the destination: relay masking keeps data from leaving the zone, but makes later investigation of those fields impossible."],
    p: ["A full disk buffer on a forwarder ends in dropped events with no alert at the SIEM.", "A routing rule with a wrong match condition sends a source to nowhere while looking healthy."],
    v: "Cut the link between forwarder and SIEM for ten minutes while sources keep sending, restore it, and confirm every event arrives in order with no gap and a backlog metric that returns to zero.",
    dep: ["transport-reliability", "ingest-buffer"]
  },
  "collector-management": {
    s: "Central control of every collector, agent and relay: inventory, configuration push, version upgrades and health reporting, so the fleet behaves as one managed system.",
    d: "A management service keeps a registry of collectors, assigns each a configuration by group, delivers updates and software upgrades in stages, and receives heartbeats and throughput counters. It is the control path, so it needs its own authentication and signing of pushed configuration. The hard parts are scale and safety: a bad configuration can silence thousands of hosts at once, upgrades must not drop data, and a collector that stops reporting must be told apart from a source that is just quiet.",
    k: ["Central push vs local configuration files: central push gives consistency and fast change, but one bad push is fleet-wide, so staged rollout and rollback become mandatory.", "Heartbeat from every collector vs inferred from data: heartbeats detect silence directly, but add traffic and state to track."],
    p: ["An unsigned configuration channel lets anyone who reaches it tell agents to stop collecting.", "Upgrading all collectors at once creates a gap in coverage exactly when changes are riskiest."],
    v: "Push a deliberately invalid configuration to a canary group and confirm it is rejected or rolled back automatically while the rest of the fleet keeps sending. Stop one collector and confirm a silence alert.",
    dep: ["self-monitoring", "tenancy-and-isolation"]
  },
  "transport-reliability": {
    s: "The guarantees between source and SIEM: acknowledgment, retry, disk buffering, ordering, duplicate handling and measured loss, so that missing events are noticed rather than assumed absent.",
    d: "Each hop keeps events until the next hop acknowledges them, retries with backoff, and spills to disk when the downstream is slow. Delivery is usually at least once, so duplicates are possible and need an event identifier to remove. Sequence numbers or counters per source let the receiver compute loss. Hard questions are what to do when buffers fill, how to preserve order across retries, and how to encrypt and authenticate each hop without making recovery slow.",
    k: ["At-least-once with deduplication vs best-effort delivery: at-least-once never loses events silently but needs identifiers and storage to remove duplicates.", "Block the source when buffers fill vs drop oldest: blocking protects data but can stall production systems, dropping protects them but loses evidence."],
    p: ["Retries after a timeout that actually succeeded insert every event twice, doubling counts and alerts.", "Buffers sized for minutes meet outages measured in hours, and the oldest events are the ones lost."],
    v: "Kill the downstream for one hour at a steady event rate, restore it, and compare the per-source sequence numbers received with those sent. Confirm zero gaps and duplicates removed.",
    dep: []
  },
  "parser-framework": {
    s: "The engine that turns a raw log line or document into named fields, using declarative patterns or structured decoders, and reports what it could and could not extract.",
    d: "Incoming events are matched to a source type, then run through a chain: split envelope and payload, decode by format such as key-value, delimited, JSON or XML, apply pattern expressions for free text, and emit fields with types. Parsers are data, not code, so they can be shipped and tested separately. It is hard because logs are inconsistent: formats change between product versions, messages vary by event type, and a pattern that is too loose mis-parses while one that is too strict rejects valid events.",
    k: ["Declarative patterns vs custom code: patterns are easy to share and audit and run safely, but awkward for irregular formats that need logic.", "Parse at ingest vs at query time: ingest-time parsing makes search fast and enforces a schema, query-time parsing keeps raw data flexible but moves cost to every search."],
    p: ["A pattern with a greedy wildcard swallows the next field and produces confident but wrong values.", "A product upgrade adds one field and every strict parser for it starts failing at once."],
    v: "Feed a corpus of real sample lines for one source, including old and new versions, and confirm every line yields the expected fields. Confirm an unrecognized line is retained and counted rather than dropped.",
    dep: ["parse-failure-handling", "timestamp-handling"]
  },
  "parser-library": {
    s: "The maintained catalog of parsers and source definitions for common devices, services and applications, shipped as content and updated as sources change.",
    d: "A vendor, community or in-house team writes a parser per source type, with sample logs, field mappings and a version. Customers enable the ones they need and add custom ones for internal applications. Quality varies: coverage of event types inside one product is often partial, and a parser can map the same concept differently from its neighbor. Maintenance is the main cost, since sources change formats constantly and a library with no owner decays into a pile of silently wrong parsers.",
    k: ["Vendor-maintained library vs write your own: vendor parsers save effort and track format changes, but cover only common events and can lag new product versions.", "Strict versioning of parsers vs always latest: pinning keeps detections stable, but delays fixes for changed log formats."],
    p: ["Enabling a parser that covers only login events leaves other event types unparsed, and nobody notices because nothing fails.", "Custom parsers written once and never owned break at the next application release."],
    v: "For each enabled source, compare the count of distinct event types in a day of raw logs with those that produce normalized events, and review any type that does not map.",
    dep: ["parser-framework", "common-schema"]
  },
  "timestamp-handling": {
    s: "Extraction and correction of event time, including time zones, missing years, clock skew and the difference between when an event happened and when the SIEM received it.",
    d: "Every event carries at least two times: the one inside the message, in some format and often with no zone or year, and the arrival time. Parsers convert the first to a standard instant using the source's configured zone, and record both. Sources with wrong clocks produce events in the future or past. Everything downstream depends on this: windows, sequences and timelines are all wrong if time is wrong, and late arrivals force a choice about which time to search and alert on.",
    k: ["Use event time vs ingest time for detection: event time reflects reality but delays rules waiting for late data; ingest time is predictable but misorders delayed events.", "Trust the source clock vs correct it: correcting from the arrival time repairs drift, but can distort legitimately delayed batches."],
    p: ["Logs without a time zone are read as the server's zone, shifting every event by hours and breaking correlation across sources.", "A source with a clock set far ahead puts events in a time range no search normally covers."],
    v: "Send events with explicit zones, with no zone, and from a host with a clock skewed by an hour. Confirm each is stored with the correct instant and that skew is visible as a measured offset.",
    dep: []
  },
  "common-schema": {
    s: "A single, documented set of field names, types and meanings that every normalized event conforms to, so the same concept can be queried and detected the same way across all sources.",
    d: "The schema defines entities and their attributes, such as actor, target, action, outcome, source and destination endpoints, and file and process details, with required and optional fields and allowed values. Parsers map each source's own fields into it, often keeping the original alongside. Open schemas exist and many systems define their own. The tradeoff is breadth: too narrow and useful source fields are lost, too wide and most fields are empty, and every change affects every rule that uses the old names.",
    k: ["Adopt an open schema vs define your own: open schemas ease content sharing and integrations, but may lack fields you need and change on someone else's schedule.", "Normalize everything vs keep raw and map selectively: full normalization simplifies rules, but is expensive and loses nuance unique to one source."],
    p: ["Two parsers put the same value into different fields, so a rule written against one misses half the data.", "Dropping the original fields after normalization makes later investigation of unusual attributes impossible."],
    v: "Take one logical action, such as a failed login, from three different sources, and confirm the same query on the schema's fields returns all three with actor, target and outcome populated.",
    dep: ["field-mapping", "schema-evolution"]
  },
  "field-mapping": {
    s: "The rules and lookup tables that translate each source's field names and values into the common schema, including numeric codes, status words and identifier formats.",
    d: "A mapping states, for one source type, which source field feeds which schema field and how to convert it: renaming, splitting, joining, casing, translating a code to a standard action name and an outcome to success or failure. Value mappings are the harder half: sources use different words for the same result, and many reuse a single code for several meanings. Mappings are reviewed like code. Their risk is quiet wrongness, since a mis-mapped outcome inverts the meaning of every rule that depends on it.",
    k: ["Central mapping tables vs per-parser logic: central tables are reviewable and reusable, but make parsers depend on shared content that must be versioned together.", "Map unknown values to a default vs leave them unmapped: defaults keep rules running, but hide new values that matter."],
    p: ["Treating any non-zero return code as failure floods rules with false failures from codes that mean success with warnings.", "Unmapped values silently skipped mean a rule for failed logins never sees one source's failures."],
    v: "List the distinct raw outcome values seen in a week for one source and confirm each maps to a schema value, with unmapped values reported in a count that is zero or explained.",
    dep: ["common-schema", "parser-framework"]
  },
  "event-classification": {
    s: "Assigning every normalized event a category and action from a fixed taxonomy, such as authentication, process creation or configuration change, so rules can target behavior instead of source.",
    d: "After parsing, a classifier maps source-specific event identifiers and message patterns to a category, subcategory and action, and sets severity and outcome fields. This lets one rule for account creation cover directories, applications and cloud services alike. Classification tables are large and need upkeep as sources add event types. It is hard because the same raw event may mean different things in context, and because coarse categories lose detail while very fine ones multiply and no longer line up across sources.",
    k: ["Fixed taxonomy vs free-form tags: a fixed taxonomy makes rules portable and counts comparable, at the cost of forcing odd events into ill-fitting categories.", "Classify at ingest vs at query time: ingest is fast to search and consistent, but a taxonomy change requires reprocessing history."],
    p: ["Events that fall into an unclassified catch-all category are invisible to every behavior-based rule.", "A taxonomy revised without migrating old data makes this month's counts incomparable with last year's."],
    v: "Measure the share of events landing in the unclassified category per source and confirm it is below a set limit, then spot-check ten events from each major category against their raw text.",
    dep: ["common-schema", "field-mapping"]
  },
  "schema-evolution": {
    s: "How the common schema and parsers change over time without breaking stored data, running rules or saved searches, including versioning, deprecation and backfilling.",
    d: "Fields are added, renamed or retyped as sources and needs change. A versioned schema lets old and new events coexist, with aliases mapping old names to new, deprecation windows and migration of rules. Storage must tolerate fields appearing and disappearing. The difficulty is that data is kept for years while content changes weekly: renaming a field splits history in two, retyping can make old values unsearchable, and rewriting petabytes to fix it is rarely affordable.",
    k: ["Aliases for renamed fields vs rewriting old data: aliases are cheap and instant, but accumulate and complicate every query planner.", "Strict schema enforcement vs flexible fields: strictness catches mistakes early, flexibility lets new sources arrive without a release but permits drift."],
    p: ["Changing a field type from number to text breaks every saved search and rule that compares it numerically.", "A rename applied to new data only makes year-over-year searches return half the results."],
    v: "Rename a field in a test schema version, then run a rule and a saved search written against the old name over data from both periods and confirm identical results through the alias.",
    dep: ["common-schema", "indexing"]
  },
  "parse-failure-handling": {
    s: "What happens to events that fail to parse or validate: retention of the raw text, counting, alerting on rates and routing to a repair path instead of dropping them.",
    d: "Events that no parser matches, or that violate the schema, are marked, kept in raw form in a separate stream, and counted per source. Dashboards and alerts watch failure rate, since a spike usually means a source changed format. Operators fix the parser and reprocess the retained events. The hard part is volume and visibility: failed events can be a large share of data, they are often the first sign of a source change, and dropping them quietly removes exactly the events that no rule can see.",
    k: ["Keep failed events vs discard: keeping costs storage and needs a repair process, but preserves evidence and allows reprocessing after a fix.", "Alert on absolute count vs on failure rate per source: rate catches format changes in small sources, counts catch large volume shifts."],
    p: ["A parser failure rate that grows slowly from a rolling product upgrade is never noticed because each day looks like the last.", "Failed events kept without a time limit fill storage with data nobody will reprocess."],
    v: "Send a line in a format no parser accepts and confirm it is stored raw in the failure stream, counted against its source and surfaced in the parse failure alert within the interval.",
    dep: ["parser-framework", "ingest-buffer"]
  },
});
