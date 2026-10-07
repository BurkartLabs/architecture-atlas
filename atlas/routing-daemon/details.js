// Details for the routing daemon plate, part 1: management, monitoring, policy, protocol security.
ATLAS.details("routing-daemon", {
  "config-schema": {
    s: "The typed model of everything an operator can configure: protocols, neighbors, policies and interfaces, with defaults, ranges and relationships between fields.",
    d: "A schema describes each configuration node's type, range, default and whether it is mandatory, and which nodes reference others, such as a neighbor naming a policy. The daemon, the CLI and the programmatic API are all generated from or checked against it, so they cannot disagree. Configuration is held as a tree, and the running state is derived from it. Hard parts are evolving the schema across versions without breaking saved configurations, and expressing cross-references so a deleted policy cannot leave a dangling name.",
    k: ["One schema driving CLI, API and storage vs separate hand-written interfaces: no drift between them, but schema changes ripple everywhere at once.", "Strict typing with ranges vs free-form strings: errors are caught before commit, at the cost of a slower path for adding experimental features."],
    p: ["A renamed or removed field makes a configuration saved by the previous version fail to load after upgrade, at the worst moment.", "Defaults that change between releases silently alter behavior on untouched configurations."],
    v: "Load a configuration saved by the previous release on the new release in a lab and diff the running state against the old one; every difference must be an intended, documented default change.",
    dep: []
  },
  "config-validation": {
    s: "Checks a proposed configuration for syntax, type, reference and semantic errors before any of it is applied to running protocols.",
    d: "Validation runs in layers: syntax and types from the schema, then references (does the policy exist), then semantic rules such as two interfaces holding the same address or a protocol area with no backbone connection. It operates on the candidate tree, never on live state, and reports every error with a path rather than stopping at the first. Some checks need platform knowledge, such as whether a requested hardware feature exists. The difficulty is catching mistakes that are individually valid but dangerous together, such as a filter that drops every route.",
    k: ["Rejecting dangerous-but-legal configurations vs warning: rejection prevents outages but blocks rare valid designs; warnings preserve flexibility and get ignored.", "Validation inside the daemon vs in an external tool: the daemon knows what it supports, while an external check can run in review before deployment."],
    p: ["A filter referencing an empty list passes validation and quietly accepts or rejects every route.", "Validation that passes in a lab fails in production because the platform lacks a capability the lab had."],
    v: "Submit a configuration with a dangling policy reference and a duplicate address; confirm the commit is refused, both errors are listed with their paths, and running state is untouched.",
    dep: ["config-schema"]
  },
  "commit-and-rollback": {
    s: "Applies a candidate configuration atomically, and returns to a previous known-good configuration automatically or on request if the change goes wrong.",
    d: "Edits go into a candidate copy. A commit validates it, computes the difference from running configuration, and applies only what changed so unrelated sessions stay up. Each commit is stored with an identifier so any earlier version can be restored. A confirmed commit starts a timer and reverts unless the operator confirms from the new state, which protects against changes that cut off management access. The hard part is applying a difference to live protocols without resetting neighbors that did not need to change.",
    k: ["Applying a diff vs reloading everything: unaffected sessions never flap, but each setting needs code that can change it live.", "Automatic revert after a timeout vs trusting the operator: recovers from lockouts without a site visit, but can undo a change that was fine when connectivity was merely slow."],
    p: ["A setting that cannot be changed live is applied by tearing down sessions, so a small edit causes a full reconvergence.", "Rollback restores configuration but not the state that changed since, such as routes already withdrawn from neighbors."],
    v: "Commit a change to one neighbor's policy and confirm other neighbors' session uptime counters are unbroken. Commit a lockout-causing change with confirmation and confirm it reverts on its own.",
    dep: ["config-validation","config-schema"]
  },
  "interactive-cli": {
    s: "The text shell where operators enter configuration and run inspection commands, with completion, help and output formatted for people.",
    d: "The command grammar is derived from the configuration schema and a set of operational commands. It supplies completion, context help, and modes for editing versus viewing. Inspection commands query the same state the protocols use and format it into tables, with filters for large outputs such as a full routing table. Sessions are authenticated and authorized per command, and every command can be logged. It is hard to keep consistent: output meant for people gets scraped by scripts, which then break when a column changes.",
    k: ["Human-friendly output vs stable output: tables are readable, but any change breaks the scripts that parse them, so a structured API is the real contract.", "Command-level authorization vs role-level: fine-grained control meets audit needs but is laborious to maintain across releases."],
    p: ["Printing an entire routing table over a slow management link stalls the session and loads the daemon.", "Scripts parsing human text break silently after a release that reflowed a column."],
    v: "Connect as a read-only role, run a show command, then try a configuration command; confirm the second is denied and both attempts appear in the audit log with the user and time.",
    dep: ["config-schema","route-inspection"]
  },
  "programmatic-api": {
    s: "A structured interface for automation to read and change configuration and state, with the same schema and authorization as the command line.",
    d: "Clients send requests over a secured transport and receive structured data rather than text. Operations include reading configuration, editing a candidate, committing, and subscribing to state. Encoding is generated from the schema so field names and types match. Requests are authenticated, authorized and logged exactly like CLI sessions. The hard parts are concurrency, since two automation clients may edit one candidate, and versioning, since clients written against one schema must keep working as the daemon evolves.",
    k: ["Locking the candidate vs optimistic edits with conflict detection: locks are simple but one stuck client blocks everyone; optimistic is concurrent but makes clients handle conflicts.", "Schema-generated bindings vs hand-written: consistent and complete, but tied to generator quality and release timing."],
    p: ["A crashed client leaves a candidate lock held and blocks all other changes until it times out.", "A client written against old field names fails after a schema change with errors that look like device faults."],
    v: "From a test client, read a neighbor's configuration, change one field through the API and commit; confirm the CLI shows the identical value and the audit log names the API user.",
    dep: ["config-schema","commit-and-rollback"]
  },
  "templates-and-groups": {
    s: "Reusable configuration blocks, such as a peer group, that give many neighbors the same settings and policy, with per-neighbor overrides.",
    d: "A group holds settings applied to every member: policies, timers, authentication and capabilities. Members override only what differs. Groups cut configuration size and, in the protocol engine, let members with identical outbound policy share one computation of what to advertise. Templates for interfaces and areas work similarly. The difficulty is that editing a group changes every member at once, and a change may need a session reset for some members, so one line can disturb hundreds of sessions.",
    k: ["Group inheritance vs explicit per-neighbor config: concise and consistent, but a shared edit has a large blast radius and hides which neighbor deviates.", "Groups defined by operators vs derived from policy equivalence: operator groups are readable; derived groups optimize better but are invisible to the user."],
    p: ["Editing a shared group resets every member's session at once when the change cannot apply live.", "A per-neighbor override forgotten in review makes one neighbor silently diverge from the group's policy."],
    v: "Change one setting in a group of ten test neighbors and confirm that all ten show the new value, then confirm which of them restarted their session, matching the documented reset rules.",
    dep: ["config-schema","update-groups"]
  },
  "software-upgrade": {
    s: "Moves a router from one daemon version to another with minimal traffic loss, preserving configuration and, where supported, forwarding during the restart.",
    d: "The new binary starts, reads converted configuration, and reestablishes protocol state. With graceful restart or a redundant control plane, neighbors keep forwarding to the router while it relearns routes. Some designs run old and new in parallel and hand over sessions. Configuration and checkpoint formats are migrated between versions, and a failed start must fall back to the old version. It is hard because protocols rely on timers that expire if the daemon is silent too long, and because state formats change.",
    k: ["Restart with graceful forwarding vs drain traffic first: graceful is quicker and needs no operator action, but depends on every neighbor cooperating; draining is safe and slow.", "In-place upgrade vs standby takeover: in-place needs one control plane; takeover keeps protocol state but needs redundant hardware and compatible state formats."],
    p: ["Neighbors without graceful restart support drop the router's routes the moment the daemon stops, so an upgrade becomes an outage.", "A checkpoint format changed between versions leaves the new daemon unable to read saved state and cold-starting."],
    v: "Upgrade a router carrying a continuous traffic stream in a lab and measure packets lost during the restart; confirm it matches the documented figure and that all sessions return to established.",
    dep: ["graceful-restart","state-checkpointing","commit-and-rollback"]
  },
  "route-inspection": {
    s: "Queries that show routes in each table, why a route won, and what was received from and advertised to each neighbor.",
    d: "Inspection reads the per-protocol tables, the global RIB and the per-neighbor input and output tables, and prints prefixes with next hops, attributes, source and the reason a route lost or was filtered. Output can be filtered by prefix, attribute or neighbor. For a full table the daemon must page and bound the query so a command does not stall the event loop. The valuable part is explanation: knowing a route is absent is less useful than knowing which policy removed it and at which step.",
    k: ["Keeping rejected routes in memory to explain them vs discarding them: operators get answers, at the cost of memory proportional to the unfiltered table.", "Snapshot reads vs live iteration: snapshots give consistent output but cost memory; live iteration can show a table that changes mid-listing."],
    p: ["Without stored rejected routes, the question of why a prefix was not received cannot be answered after the fact.", "A broad query against a full table blocks protocol processing and delays keepalives."],
    v: "Announce a prefix from a test neighbor that a filter rejects; confirm inspection shows it as received but filtered, names the filter term, and shows no entry in the global RIB.",
    dep: ["adj-rib-in","global-rib"]
  },
  "protocol-counters": {
    s: "Per-neighbor and per-protocol counts of messages, errors, state changes and routes, giving a cheap, continuous view of session health.",
    d: "Counters are incremented on message paths and exposed through inspection and telemetry: messages sent and received by type, notifications and their error codes, session flaps, prefixes received, accepted and advertised, flooding retransmissions and spf runs. Each has a reset time so rates can be computed. They are cheap enough to keep always on. The difficulty is naming and units: counters meaning different things across protocols or versions make dashboards and alerts misleading.",
    k: ["Always-on counters vs enabled on demand: constant visibility for a tiny cost, versus saving cycles but missing the event that already happened.", "Cumulative counters vs rates computed in the daemon: cumulative are simple and monitors compute rates, but they depend on knowing when a reset occurred."],
    p: ["A counter reset by a restart reads as a huge negative rate in the monitor, triggering a false alert.", "Counting accepted prefixes after policy and received prefixes before it under the same name makes capacity alerts wrong."],
    v: "Induce a known number of session resets on a test neighbor and confirm the flap counter rises by exactly that number and the last-error code matches the cause injected.",
    dep: ["session-state-machine"]
  },
  "event-logging": {
    s: "A timestamped record of state changes and notable events, such as session transitions, errors and configuration commits, with severity and structured fields.",
    d: "Components emit events to a logging module, which filters by severity, formats, and sends them to a local buffer, storage and remote collectors. Events carry structured fields such as neighbor address and reason code, so they can be searched and correlated across devices. Rate limiting prevents a flapping session from flooding the log. It is hard because the most important logs occur during instability, exactly when the system is busiest, and because clocks must agree across devices to reconstruct a timeline.",
    k: ["Structured events vs free-form text: machines can correlate and alert, but producers must keep field sets stable.", "Rate-limiting repeated events vs logging each one: protects the daemon in a storm but can hide how often something really occurred."],
    p: ["Logging to a remote collector over a path that the daemon itself is routing creates a dependency that fails along with the network.", "Unsynchronized clocks make a cross-device incident timeline impossible to reconstruct."],
    v: "Reset one test session and confirm the log shows the state transitions in order with reason code and neighbor, timestamps agree with a reference clock within a second, and the remote collector received them.",
    dep: ["clock-source"]
  },
  "route-monitoring-feed": {
    s: "A one-way export of every route a router receives, before policy, to an external collector for analysis, auditing and history.",
    d: "The daemon opens a connection to a collector and sends an initial dump of each neighbor's input table, then incremental updates, session up and down events and periodic statistics. Because it mirrors pre-policy routes, the collector sees what neighbors really announced, not just what the router kept. Collectors build a history for security analysis, capacity planning and debugging. The cost is memory or bandwidth to copy updates, and ensuring the export cannot block the main protocol work if the collector is slow.",
    k: ["Mirroring pre-policy routes vs post-policy: pre-policy shows what neighbors did and supports auditing, at the price of seeing and exporting much more data.", "Dropping data when the collector is slow vs backpressure: dropping protects routing, but leaves gaps the collector must detect and resynchronize."],
    p: ["A slow collector applies backpressure that delays protocol processing if the exporter shares the main loop.", "Gaps after a collector reconnect make the history wrongly show routes still present that were withdrawn."],
    v: "Withdraw a test prefix from a neighbor and confirm the collector shows the announcement and the withdrawal with the neighbor's identity and timestamp, including a prefix that policy rejected.",
    dep: ["adj-rib-in","tcp-transport"]
  },
  "streaming-telemetry": {
    s: "Continuous publication of state and counters to subscribers, either on a timer or when values change, in a structured, schema-defined form.",
    d: "A subscriber names paths in the state model and a mode: sampled every interval, or notified on change. The daemon encodes values with the schema and sends them over a persistent connection. It replaces polling, which loads the device and misses short events. The daemon must bound the work per subscription and shed load when subscribers pile up. Hard parts are consistent snapshots, since values sampled at different moments can contradict each other, and keeping model paths stable for consumers.",
    k: ["Change-driven vs periodic sampling: change events are precise and cheap when quiet, but a storm produces a flood; sampling bounds load and can miss spikes.", "A single common data model vs vendor-specific paths: tools are portable, but the model lags new features."],
    p: ["Hundreds of subscriptions to large tables use more CPU than the protocols and delay convergence.", "A path renamed in a release breaks every dashboard silently by producing no data."],
    v: "Subscribe to a neighbor's state on change, bounce the session and confirm that notifications arrive within a second showing established, then idle, then established, in order.",
    dep: ["protocol-counters","config-schema","tcp-transport"]
  },
  "protocol-tracing": {
    s: "Selectable, detailed logging of protocol messages and decisions for one neighbor or prefix, turned on temporarily to diagnose a specific problem.",
    d: "Operators enable tracing by protocol, neighbor, message type or prefix, with output to a file or the log. Traces show the packets received and sent, the policy terms evaluated and the best-path comparison steps. Filtering is applied early so the cost of disabled tracing is a flag check. It is the last resort when counters and inspection do not explain behavior. The hazard is volume and sensitivity: traces on a busy session can slow the daemon and may contain authentication details or topology.",
    k: ["Per-neighbor and per-prefix filters vs global tracing: targeted traces are safe in production, but require knowing what to look for beforehand.", "Tracing in the daemon vs packet capture outside it: the daemon shows decisions as well as messages, while capture shows exactly what is on the wire."],
    p: ["Global tracing left on after a debugging session fills storage and slows the control plane.", "Trace files include authentication material that is then copied into a support ticket."],
    v: "Enable tracing for one prefix at one neighbor, announce and withdraw it, and confirm the trace shows the received message, the policy terms hit and the final decision, with no other prefixes present.",
    dep: ["event-logging","policy-evaluator"]
  },
  "convergence-measurement": {
    s: "Instruments that measure how long routing takes to settle after a change: detection, computation, installation, and propagation times.",
    d: "The daemon timestamps the stages: failure detected, update sent or received, route recomputed, forwarding table programmed and install acknowledged. Together they show where time goes. Injected test events and probes complement them by measuring actual traffic loss. Because the slowest stage varies, such as spf waiting on a throttle timer or a hardware table write queue, only per-stage timing can direct tuning. The difficulty is that end-to-end loss depends on every router on the path and on the forwarding hardware's actual behavior.",
    k: ["Internal stage timestamps vs end-to-end probes: stages tell where time goes; probes tell what users experienced, and only the two together give both.", "Measuring in production on real failures vs in a lab: real failures are representative and rare, labs are repeatable but miss scale effects."],
    p: ["Reporting the moment the route was computed as convergence ignores minutes spent waiting for the hardware to program.", "Tuning timers on a quiet lab network breaks stability at production scale."],
    v: "Shut a link in a lab with a traffic generator running and compare the stage timestamps to measured packet loss duration; the stages' sum must account for the observed outage within a small margin.",
    dep: ["fast-failure-detection","install-feedback","event-logging"]
  },
  "prefix-lists": {
    s: "Ordered lists that match destination prefixes by address and length range, the basic building block for deciding which routes to accept or advertise.",
    d: "Each entry names a prefix and a length range, such as any more-specific route inside an address block up to a maximum length, and permits or denies it. Lookup is by longest match in a trie, not a linear scan, so a list of hundreds of thousands of entries evaluates quickly. They are generated from registry data for customers. The difficulty is size and freshness: lists for large customers are huge, change often, and a stale list either blocks legitimate routes or lets in someone else's.",
    k: ["Trie-based matching vs ordered linear evaluation: constant-time lookups at scale, but ordering semantics must be emulated carefully so results match the configured order.", "Hand-written vs generated from registry data: generated lists track reality; hand-written lists are readable and rot."],
    p: ["A missing length limit lets a customer announce thousands of more-specific routes that pass the filter.", "A stale generated list silently drops a customer's newly assigned block."],
    v: "Load a list permitting a block up to length 24, announce a length 24 prefix and a length 25 prefix inside it, and confirm the first is accepted and the second rejected.",
    dep: ["config-schema"]
  },
  "as-path-filters": {
    s: "Matches routes by the sequence of networks their path traversed, using patterns on the path, to restrict routes to those expected from a neighbor.",
    d: "A path filter is a pattern over the list of network identifiers in a route's path, such as only paths beginning with the neighbor's own identifier, or paths with no private identifiers. Patterns are compiled to a matcher so evaluating a million routes is cheap. Typical uses are limiting a customer to its own and its customers' routes, and rejecting overly long paths. They are hard to maintain by hand because the set of legitimate paths changes as networks change providers.",
    k: ["Pattern matching on the path vs lists of allowed origins: patterns are compact and expressive; origin sets are exact and simpler to reason about.", "Compiled matchers vs interpreting each pattern: compilation costs more at load time but keeps per-route cost flat at full-table scale."],
    p: ["A too-permissive pattern accepts paths through a network the customer should never transit.", "Regex-like patterns with unexpected backtracking cost spike CPU when a pathological path arrives."],
    v: "Apply a filter that allows only paths starting with a test neighbor's identifier, send routes with a correct and an incorrect first hop, and confirm only the correct one enters the input table's accepted set.",
    dep: ["path-attributes"]
  },
  "community-matching": {
    s: "Matches and edits tags attached to routes, which let one network signal intent to another, such as do not export, prefer less or blackhole.",
    d: "Communities are small tags in a route's attributes. A network defines a vocabulary of them, published to customers, that triggers actions in its policy: set preference, prepend, suppress export to certain peers, or drop traffic. Matching can be exact, by wildcard, or by range. Large-format communities carry a three-part identifier for networks with big identifiers. The difficulty is that the vocabulary is a convention, not enforced, and routes cross networks that may strip, honor or misinterpret tags.",
    k: ["Action communities that customers can set vs operator-only policy: customers self-serve traffic engineering, but every tag is another surface for mistakes or abuse.", "Wildcard matching on tags vs exact: compact policy, with the risk of matching a tag nobody intended."],
    p: ["Accepting action tags from untrusted sources lets a neighbor trigger blackholing of other customers' prefixes.", "Failing to strip internal tags at the border leaks policy signals to other networks."],
    v: "Send a route carrying a no-export tag to a test router and confirm it is installed locally but absent from the output table of every external neighbor.",
    dep: ["path-attributes","route-maps"]
  },
  "route-maps": {
    s: "Ordered sequences of match conditions and actions that decide what happens to each route: accept, reject, or modify attributes before further processing.",
    d: "A route map is a list of terms evaluated top to bottom. Each term matches on prefix, path, tags or other attributes, then performs actions such as setting preference or tags, and either accepts, rejects or continues. A route matching no term gets a final default, which differs between implementations. Maps attach to neighbors, redistribution or aggregation points. They are the daemon's main extensibility point and its main source of surprise, because order matters and defaults differ.",
    k: ["Explicit default at the end vs implicit default: an explicit final term is clear in review, but implicit defaults vary and cause portability and review errors.", "Terms that fall through to the next vs terminate: fall-through composes small reusable pieces; termination makes each map easier to reason about alone."],
    p: ["A map with no explicit final term silently rejects every route that matched nothing, causing an outage after a small edit.", "A term inserted at the wrong position shadows later terms that were meant to apply."],
    v: "Run a test route set through a map containing three terms and a default, and confirm each route gets the action of the first matching term, and that an unmatched route gets the documented default.",
    dep: ["prefix-lists","as-path-filters","community-matching"]
  },
  "policy-evaluator": {
    s: "The engine that runs configured policy against each route, using compiled conditions and actions so evaluation stays fast at full-table scale.",
    d: "Policy is compiled from configuration into an internal program of condition checks and attribute modifications. Evaluation takes a route and a context such as the neighbor and direction, and returns accept or reject with a possibly modified route. For route sets processed repeatedly, such as after a policy change, it can reevaluate only the affected routes using stored pre-policy copies. The hard parts are speed, since it is on every update, and determinism, since the same inputs must always give the same result.",
    k: ["Compiling to a program vs interpreting configuration trees: compiled evaluation is much faster, but debugging requires mapping a result back to its source term.", "Storing pre-policy routes to reevaluate vs asking neighbors to resend: reevaluation is instant and costs memory; asking neighbors costs bandwidth and time."],
    p: ["A policy that depends on mutable external data, such as a changing list, yields different results on reevaluation than at first receipt.", "Evaluation that is not deterministic makes two routers disagree about the same input."],
    v: "Change a policy and trigger reevaluation with 500,000 stored routes; confirm the elapsed time against budget, that exactly the expected routes changed state, and that no neighbor was asked to resend.",
    dep: ["route-maps","adj-rib-in"]
  },
  "attribute-rewriting": {
    s: "Actions that change a route's properties, such as local preference, path prepending and metric, to steer traffic toward or away from a path.",
    d: "Policy actions modify attributes before best-path selection or advertisement. Setting local preference controls outbound path choice inside a network; prepending lengthens the path to discourage inbound traffic; setting a metric hints a neighbor about the preferred entry. Next-hop rewriting changes who traffic is sent to. Each lever has a different scope: some only affect your network, some influence others, and others are ignored. The difficulty is predicting the effect, since the rest of the network's policy decides whether your change works.",
    k: ["Local preference vs path prepending: preference is decisive but only affects your own choices; prepending can influence others but is a weak, easily overridden hint.", "Rewriting the next hop to self vs preserving it: self simplifies reachability but can force traffic through an extra router."],
    p: ["Very large prepending on an incorrect neighbor can make a path unreachable to networks that cap path length.", "Next-hop preserved across a boundary points to an address the receiver cannot resolve, so the route is unusable."],
    v: "Set higher local preference on a secondary path in a lab and confirm the best-path output changes to it, traffic follows it, and the original path returns when the setting is removed.",
    dep: ["route-maps","path-attributes"]
  },
  "import-export-filters": {
    s: "The points where policy attaches to each neighbor: what is accepted from it on the way in, and what is announced to it on the way out.",
    d: "Every neighbor has an inbound policy applied before routes enter the table, and an outbound one applied before advertisement. Inbound protects the router from bad data and sets preferences; outbound protects the neighbor and the network from leaks. Good practice is to default to reject and permit only expected routes. Sessions with no policy configured may accept everything, a historical default that has caused many leaks. The difficulty is keeping both directions consistent across hundreds of neighbors.",
    k: ["Default deny vs default permit when no policy is set: deny prevents leaks but breaks new sessions until policy is added; permit is convenient and dangerous.", "Filtering at the border vs on every router: one place is simpler, but defense in depth protects against a failure at the border."],
    p: ["A session with no outbound policy re-announces everything learned from one provider to another, creating a transit leak.", "An inbound filter that is too narrow rejects a customer's new prefix and nobody notices until traffic stops."],
    v: "Establish a session with no policy under default-deny and confirm it receives and sends nothing; add a permit for one prefix and confirm exactly that prefix flows in the permitted direction.",
    dep: ["policy-evaluator","prefix-lists"]
  },
  "max-prefix-limits": {
    s: "A cap on the number of routes accepted from a neighbor, with a warning threshold and a defined action when the limit is exceeded.",
    d: "The daemon counts routes accepted from each neighbor. At a warning threshold it logs; at the limit it either drops excess routes or shuts the session, optionally restarting after a delay. It protects memory and the forwarding table from a neighbor that suddenly leaks a full table. Limits are sized to the neighbor's normal count plus headroom. The difficulty is choosing numbers: too tight and a legitimate growth causes an outage, too loose and a leak is not stopped.",
    k: ["Tearing down the session vs discarding excess routes: teardown stops the leak completely but removes all of the neighbor's routes; discard keeps service with a partial table.", "Fixed limits vs limits learned from history: fixed values are predictable; learned values adapt but can drift to accept a slow leak."],
    p: ["A limit never revisited as a customer grows eventually shuts the session during ordinary growth.", "An automatic restart timer reestablishes the session and trips the limit repeatedly, causing a flapping loop."],
    v: "Set a limit of 100 on a test neighbor, announce 101 prefixes, and confirm the warning fires at the threshold, the configured action occurs at the limit, and the log names the neighbor and count.",
    dep: ["adj-rib-in","event-logging"]
  },
  "policy-testing": {
    s: "Checks that a policy does what the author intended, by running sample routes through it offline or comparing before and after results of a change.",
    d: "Tests supply routes and expected outcomes, or compare the routes accepted under the old and new configuration, showing which prefixes would change. Tools evaluate policy outside the live daemon using the same evaluator, so results match production. Checks also include invariants, such as never advertising private address space, or never accepting a default route from a customer. Hard because policy interacts with real route data that test sets lack, so the most valuable test replays a captured table.",
    k: ["Replaying a captured table vs hand-written cases: captured data covers real surprises; hand cases document intent and catch regression precisely.", "Using the production evaluator vs a separate model: same code means same results; a model can analyze all possible inputs but may diverge."],
    p: ["Testing on a small sample passes a policy that fails on the one odd route in a million-route table.", "A separate policy model drifts from the daemon's behavior and certifies something the router does not do."],
    v: "Replay a captured full table through the old and new policy offline and confirm the diff lists only the prefixes the change was meant to affect, then confirm a canary router shows the same.",
    dep: ["policy-evaluator","route-inspection"]
  },
  "neighbor-authentication": {
    s: "Cryptographic proof that protocol messages come from the configured neighbor and were not altered, using shared keys on each session or adjacency.",
    d: "Messages carry a digest computed from a shared secret and the message content, often with a sequence number to resist replay. The receiver recomputes and discards mismatches before parsing the rest. Different protocols attach authentication in different places: in the transport option, or in the protocol header. It protects against injection by an off-path attacker and against accidental misconnection to the wrong neighbor. The difficulty is key distribution at scale and algorithm choice, since old keyed digests are weak.",
    k: ["Authentication in the transport layer vs in the protocol messages: transport covers the whole session and resets cheaply; per-message works on links without a session but is protocol specific.", "Shared keys per neighbor vs one key for a group: per-neighbor limits the damage of leaks but multiplies operational burden."],
    p: ["A key mismatch after a change makes the session fail with an opaque error, and the log gives little hint.", "Keys stored in plain configuration appear in backups and tickets."],
    v: "Configure matching keys and confirm the session establishes; change one side's key and confirm the session is refused with an authentication failure counter rising, without the unauthenticated message being parsed.",
    dep: ["tcp-transport","session-key-rollover"]
  },
  "ttl-security": {
    s: "Accepts protocol packets only if they arrive with the maximum hop-limit value, which guarantees the sender is on a directly connected link.",
    d: "A directly connected neighbor sends packets with the maximum hop limit, and any packet that crossed a router has a lower value. The receiver drops packets below the threshold before reaching the session, and the check may run in the forwarding hardware. This stops remote attackers from sending forged packets to a session. It is a cheap, key-free defense that complements authentication. The limit is that it only works for neighbors that are adjacent, and multihop sessions need a smaller threshold with weaker guarantees.",
    k: ["Hop-limit check vs relying on authentication alone: the check drops garbage before any cryptographic work, but offers no protection against an attacker on the local link.", "Strict directly-connected vs allowing a few hops: strict is strongest; multihop designs for loopback sessions need a lower threshold."],
    p: ["Enabling it on a multihop session drops all packets and takes the session down.", "A tunnel or middlebox decrementing the hop limit makes a healthy adjacent neighbor appear remote."],
    v: "Send a crafted session packet with a lowered hop limit from a test host and confirm it is dropped and counted by the filter, while the real neighbor's packets continue to be accepted.",
    dep: ["control-plane-protection","raw-packet-io"]
  },
  "origin-validation": {
    s: "Checks whether the network originating a route is authorized to announce that prefix, using signed records published by address holders.",
    d: "Address holders publish signed authorizations naming which network may originate their prefixes and the longest length allowed. The daemon receives a validated set from a cache over a protocol, and classifies each route as valid, invalid or unknown. Policy then rejects, depreferences or flags invalid ones. It stops accidental hijacks and many deliberate ones, but not a forged path ending in the right origin. The difficulty is data freshness and coverage, since unknown is common and a cache outage must not break routing.",
    k: ["Rejecting invalid routes vs just depreferring them: rejection stops hijacks, but errors in published data drop legitimate routes.", "Fail open vs fail closed when the cache is unreachable: open keeps routing and loses protection; closed is safe in principle and can blackhole everything."],
    p: ["A stale or wrong authorization record causes a legitimate customer's routes to be classed invalid and dropped.", "A single cache is a dependency: if it is lost silently, validation freezes on old data."],
    v: "Feed a test route whose origin differs from the authorization and confirm it is classified invalid and rejected; stop the cache and confirm the daemon follows its configured fail-open or fail-closed behavior.",
    dep: ["import-export-filters","tcp-transport"]
  },
  "path-validation": {
    s: "Verifies that the sequence of networks in a route's path is plausible or signed, to detect forged or leaked paths beyond the originating network.",
    d: "Origin checks cannot detect a path that adds a bogus link. Path validation adds either cryptographic signatures from each hop or checks against published relationships, such as a customer network never being a transit between two providers. The daemon verifies attributes during update processing and tags routes. Because each signature check costs CPU and requires deployment by every network along the path, adoption is partial. It is hard to verify at full-table speed and to explain a rejection.",
    k: ["Signed paths vs relationship-based checks: signing proves the path cryptographically but needs universal deployment; relationship checks work partially deployed but rely on accurate data.", "Verify inline vs asynchronously: inline blocks bad routes immediately; asynchronous keeps the pipeline fast but admits a route briefly."],
    p: ["Partial deployment means most paths are unverifiable, so teams treat unknown as acceptable and gain little.", "Verification cost during a table reload slows convergence."],
    v: "Inject a test path with a link that violates a published relationship, such as a customer leaking provider routes, and confirm the route is flagged and the policy outcome matches the configured action.",
    dep: ["update-processing","path-attributes"]
  },
  "bogon-filtering": {
    s: "Rejects routes for address space that should never appear on the public network, such as private, reserved or documentation ranges, and overly long or short prefixes.",
    d: "A built-in or configured list of unallocated and special-use blocks is applied to inbound routes, along with sanity limits on prefix length and path length. These checks run early and are cheap. Lists include reserved ranges that change when blocks are allocated, so the list needs updating. The difficulty is that a bogon today may be allocated tomorrow, so a stale list will block a legitimate new network, a failure that is hard to diagnose.",
    k: ["Static built-in list vs automatically updated: static is predictable and rots; updated tracks allocations but adds a data feed that must itself be trusted.", "Filtering on every router vs only the border: border-only is simpler; every router limits damage from a leak inside the network."],
    p: ["A stale list rejects a newly allocated block, and its owner cannot reach the network.", "Filtering the default route accidentally, since it matches many bogon patterns, breaks internal reachability."],
    v: "Announce a private-range prefix and a documentation-range prefix from a test neighbor and confirm both are rejected with a counter increment, while an allocated public prefix is accepted.",
    dep: ["prefix-lists","import-export-filters"]
  },
  "control-plane-protection": {
    s: "Limits the rate of packets that reach the daemon, and permits only the protocols and sources that should, so floods cannot starve the control plane.",
    d: "Protocol and management packets are punted from the forwarding plane to the daemon's CPU. Filters admit only expected sources and protocols, and rate limiters per class cap the load, with higher priority for protocol keepalives than for management. Applied in hardware where possible. It protects against floods that would otherwise delay keepalives and drop sessions. The difficulty is calibration: too strict and legitimate bursts, such as a table reload, get dropped and cause session loss.",
    k: ["Per-class rate limits vs a single limit: classes keep keepalives alive during floods, but need sizing against realistic bursts.", "Allow-list of known neighbors vs open listening: allow-lists remove most attack surface, at the cost of updating them with every new neighbor."],
    p: ["A limit sized for steady state drops the burst during a full-table reload and the session resets in a loop.", "A forgotten allow-list entry blocks a newly added neighbor with no clear error."],
    v: "Flood the control plane with junk from an unlisted source at high rate and confirm established sessions stay up, keepalive counters keep rising and the drop counters show the filtered traffic.",
    dep: ["raw-packet-io","platform-abstraction"]
  },
  "session-key-rollover": {
    s: "Changes authentication keys and algorithms on a live session without resetting it, by accepting a new key before the old is retired.",
    d: "Each key has send and accept lifetimes. Before a switchover, both sides accept the new key; at the switchover time the sender starts using it; later the old key is retired. Because clocks need to agree within the overlap, time must be synchronized. Some protocols carry a key identifier in each message so the receiver can pick the right key. It makes regular rotation and algorithm migration possible without outages, and the main difficulty is coordination between independent operators of two sides.",
    k: ["Overlapping lifetimes vs a coordinated flag day: overlap avoids an outage but requires accurate time; a flag day needs no clocks and risks a reset.", "Short lifetimes vs long: short limits exposure, but multiplies the chance of a mismatch."],
    p: ["Clock skew beyond the overlap window causes the sender to use a key the peer does not yet accept, resetting the session.", "The old key's expiry passes without the peer having adopted the new one."],
    v: "Schedule a rollover on a test session with a two-minute overlap and confirm the session stays established, message counters show the key identifier changing, and no authentication errors are logged.",
    dep: ["neighbor-authentication","clock-source"]
  }
});
