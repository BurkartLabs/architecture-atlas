// Details for the matching engine plate, part 1: oversight, operations, gateway, pre-trade risk.
ATLAS.details("matching-engine", {
  "order-audit-trail": {
    s: "A complete, time-stamped record of every order event from receipt to final disposition, kept so any trade or rejection can be reconstructed and explained to a regulator or member.",
    d: "Each event (received, accepted, rejected, amended, canceled, matched, expired) is written with the member, session, instrument, sequence number and a synchronized timestamp. The trail is usually derived from the sequenced event log rather than written separately, so it cannot disagree with what the engine did. A separate copy is stored in a form regulators can query. It is hard because it must be complete including rejects and messages the engine never acted on, and because timestamps need a provable accuracy.",
    k: ["Derive the trail from the input log vs. write it as a second stream: derivation guarantees agreement but ties retention to the log format; a second stream can be reshaped but can drift.", "Record rejected and ignored messages vs. only accepted ones: the full record answers disputes about orders that never arrived, but multiplies volume during storms."],
    p: ["Messages rejected at the gateway before sequencing leave no trace, so a member's claim of having sent an order cannot be disproved.", "Timestamps taken at different points in the path make event order in the trail disagree with the true order."],
    v: "Pick a trade at random and rebuild its full history, including the counterparty's resting order and every amend, from the trail alone. Confirm each event carries a timestamp within the stated clock tolerance.",
    dep: ["event-log","clock-synchronization","sequencer"]
  },
  "clock-synchronization": {
    s: "Keeps every server that stamps events on the same time base, to a stated accuracy, so timestamps from different machines can be ordered and presented to regulators as evidence.",
    d: "Grandmaster clocks locked to satellite time distribute time over the network using a precision protocol, with hardware timestamping on the NICs. Servers discipline their local clocks and report their offset. Regulations set a maximum divergence from a standard time scale, often in microseconds for the fastest venues. It is hard because accuracy is limited by asymmetric network paths, leap-second handling and the loss of the satellite signal, and because each stamping point must be proven, not assumed.",
    k: ["Satellite-disciplined grandmasters with holdover oscillators vs. network time from the internet: far better accuracy and independence, at the cost of antennas, cabling and a second source to cross-check.", "Hardware timestamps at the NIC vs. software stamps: removes OS jitter from the measurement but ties the design to specific adapters."],
    p: ["A grandmaster silently drifting during a satellite outage leaves a whole day of timestamps outside tolerance.", "A leap second handled differently by two servers produces events apparently arriving before they were sent."],
    v: "Compare every stamping server against the reference clock continuously and confirm the worst offset stays inside the stated tolerance. Pull the antenna feed in a test and watch the alarm and the holdover bound.",
    dep: ["hardware-timestamping"]
  },
  "surveillance-feed": {
    s: "A stream of orders, cancels and trades delivered to market surveillance, so analysts and detection systems can look for manipulation and abuse as it happens or the next day.",
    d: "The feed carries the full order lifecycle with member identity, which the public feed deliberately omits. Detection systems look for patterns such as layering, spoofing, wash trades, quote stuffing and marking the close. Delivery is typically a copy of the sequenced log pushed to a separate system, so analysis never competes with matching for resources. It is hard because the volume is the largest in the venue, the patterns span days and members, and false alerts consume analyst time.",
    k: ["Real-time alert stream vs. next-day batch analysis: real-time can stop harm in progress, while batch can use the full day's context and fewer false positives.", "Surveillance on the venue vs. on a cross-venue utility: the venue sees its own detail fully, but manipulation spanning several venues is invisible to it."],
    p: ["Surveillance reads from the production engine's memory and slows matching during heavy analysis.", "Order identifiers that change on amend break the chain a detector needs to follow one intention across messages."],
    v: "Inject a scripted layering pattern from a test member and confirm the detector raises an alert with the correct member, instrument and order ids within its stated delay.",
    dep: ["event-log","order-audit-trail"]
  },
  "regulatory-reporting": {
    s: "Produces the reports a venue must file: trade reports, order data submissions, transaction reports and halt notices, in prescribed formats and within prescribed deadlines.",
    d: "Reports are generated from the trade capture and audit trail on schedules ranging from near real time to end of day. Each regime defines fields, identifiers for members and instruments, and rules on corrections and late filing. A rules table maps internal fields to each regulator's format. It is hard because regimes differ and change, because a correction must be filed as a linked amendment rather than a replacement, and because a missed deadline is itself a breach.",
    k: ["Generate reports from the audit trail vs. from the clearing record: the trail is more complete, but the clearing record matches what the regulator reconciles against.", "Configurable field mappings vs. coded reports per regime: mapping tables adapt to rule changes quickly, but encode logic that is hard to test as a whole."],
    p: ["A change to an instrument identifier scheme goes unmapped and a day of reports is rejected by the regulator.", "Trade corrections are filed as new trades and the regulator sees double volume."],
    v: "Reconcile one day's filed report counts and notional totals against the venue's own trade capture and the regulator's acknowledgment file. Any mismatch must be zero or explained.",
    dep: ["order-audit-trail","trade-capture","record-retention"]
  },
  "record-retention": {
    s: "Stores audit, order and trade records for the legally required period, in a tamper-evident form that can still be searched and replayed years later.",
    d: "Records move from fast journal storage to compressed archives, usually in write-once media or storage with immutability locks, with checksums and chained hashes to show nothing was altered. Retention periods are set by regulation and can run for many years. Index and schema versions are kept with the data so old records stay readable. The hard part is longevity: formats evolve, software that wrote them is retired, and a record that cannot be decoded is as bad as one that was deleted.",
    k: ["Immutable storage with legal hold vs. conventional storage with access control: immutability gives tamper evidence by construction, while conventional storage is cheaper and easier to correct.", "Keep raw logs and decode on demand vs. keep decoded tables: raw logs are the truth, but decoded tables answer queries without the old decoder."],
    p: ["The schema of a five-year-old archive is no longer documented and the decoder no longer builds.", "Retention deletes were scheduled per system and one copy outlives a legal hold, or the reverse."],
    v: "Restore a randomly chosen archive from the oldest retained year, verify its hash chain and decode it with the current tooling. Report any record that cannot be read.",
    dep: ["log-archival"]
  },
  "operations-console": {
    s: "The tool operators use to run the venue: start and stop sessions, change instrument state, halt trading, cancel a member's orders and see current health and queue depths.",
    d: "Commands are authenticated, authorized by role and recorded. Many actions, such as a halt or a mass cancel, are injected into the sequenced input stream like any order, so they take effect at a defined point in the event order and replay identically. Read-only views come from monitoring and from the book. It is hard because it holds powerful actions with consequences for the whole market, so it needs confirmations, two-person approval for some actions and a clear picture of what each command will do.",
    k: ["Operator commands through the sequencer vs. out-of-band edits: sequenced commands replay and audit correctly, while out-of-band is simpler but produces unrecoverable divergence.", "Single approval vs. two-person approval for market-wide actions: two-person slows an emergency response but blocks a slip from halting a market."],
    p: ["A mass cancel for the wrong member id is applied with no undo and no confirmation of the target.", "A console action edits the active process but not the standby, so failover reverts the change."],
    v: "Issue a halt in a test venue and confirm it appears at one sequence number in the log, stops matching on active and standby alike, and is attributed to the operator in the audit trail.",
    dep: ["sequencer","member-entitlements","order-audit-trail"]
  },
  "member-entitlements": {
    s: "The registry of who may connect, as whom, to which instruments, with what order types and limits, and who may see which data.",
    d: "Each member has firms, traders and sessions, with permissions per instrument group and per function: send orders, cancel only, view data, drop copy. Entitlements are loaded by gateways and risk components and updated while the venue runs, with changes sequenced so every component applies them at the same point. It is hard because permissions are checked on every order and must be cached for speed, yet a withdrawal, for example when a firm is suspended, has to be effective immediately everywhere.",
    k: ["Push entitlement changes through the sequenced stream vs. gateways polling a database: pushing gives a single effective point, but polling is simpler and survives restarts of the core.", "Fine-grained per-instrument rights vs. coarse tiers: fine rights model real membership, but multiply the cases every check must handle."],
    p: ["Gateways cache an entitlement and keep accepting orders for a suspended firm until restart.", "Entitlements for a new instrument are loaded after trading starts and every order for it is rejected for a morning."],
    v: "Suspend a test member while it is sending orders and measure the delay until the first rejection on every gateway. It should be within the stated bound with no accepted order afterwards.",
    dep: ["reference-data","sequencer"]
  },
  "reference-data": {
    s: "The definitions of tradable instruments: identifiers, tick sizes, lot sizes, price bands, trading calendars, phase schedules and corporate-action adjustments.",
    d: "Reference data is created before an instrument can trade and distributed to the engine, gateways, risk and the market data feed. Each field affects behavior: tick size controls which prices are valid, bands set the volatility thresholds, schedules drive phase changes. Changes happen before the open or via a controlled event. It is hard because every component must hold identical data at the same moment, and an error such as a wrong tick size is not a crash but a market that trades at wrong prices.",
    k: ["Load once at start of day vs. dynamic updates during the session: static loads are simple and consistent, but intraday listings and corporate actions then need a restart.", "Single golden source distributed by the sequencer vs. each component reading a database: one source cannot disagree with itself, while per-component reads are easy to build and easy to skew."],
    p: ["A tick table with the wrong decimal place lets orders rest at prices no member can see in their systems.", "A new listing goes live on the engine but not on the feed, so trades occur in an instrument nobody has data for."],
    v: "Compare a hash of the instrument table across engine, standby, gateways, risk and the feed at the start of day. Every component must report the same hash.",
    dep: []
  },
  "change-control": {
    s: "The process and tooling for changing a running venue: software releases, configuration changes and rule changes, with testing, member notification, staged rollout and a way back.",
    d: "Releases pass through test environments fed with recorded production traffic, then a member test period, then a deployment to the standby first, followed by a controlled failover. Rule changes require notice to members and often regulator approval. Freezes surround peak periods. It is hard because the engine must never run two behaviors for the same input, so a change is effective at a defined sequence point, and because rollback after trades under new logic cannot undo the trades.",
    k: ["Rolling upgrade through the standby vs. an overnight stop and start: a rolling upgrade avoids downtime but demands compatible state formats across versions.", "Frequent small releases vs. a few large ones: small releases reduce the risk of each, while large ones reduce the member testing burden and the number of change windows."],
    p: ["A new version is deployed to the standby and fails over the first time under load, which is its first live use.", "A configuration change is applied to the engine on one node and not the other, so replay diverges."],
    v: "Deploy a build to the standby, replay a full day of production traffic through it and compare its output stream byte for byte against the production output. Any difference blocks the release.",
    dep: ["replay-testing","hot-standby"]
  },
  "monitoring-and-alerting": {
    s: "Continuous measurement of latency, queue depth, message rates, session state and component health, with alerts that reach the right operators before members notice a problem.",
    d: "Components export counters and latency histograms from the hot path cheaply, usually written into shared memory and collected by a separate process. Dashboards show per-gateway rates, per-instrument volume, replication lag and clock offset. Alerts use thresholds and rates of change. It is hard because measurement itself costs time on the hot path, and because a venue's problems are often in the tail, a few slow orders per million that an average hides.",
    k: ["Histograms with tail percentiles vs. averages: histograms expose the rare slow path that matters, but cost memory and need care to aggregate correctly.", "Out-of-process collection vs. instrumenting inline: out-of-process keeps the hot path clean, but sees only what is exposed and sees it late."],
    p: ["An alert threshold calibrated on quiet days fires constantly on opening, and operators learn to ignore it.", "Metrics are exported from the engine thread and a slow collector stalls matching."],
    v: "Inject a one-millisecond stall in a test gateway and confirm the tail latency alert fires within its stated window and names the right component.",
    dep: ["latency-measurement"]
  },
  "capacity-testing": {
    s: "Load tests that drive the venue with recorded or synthetic traffic at multiples of peak to find the rate at which latency or correctness first degrades.",
    d: "A harness replays production captures with their original timing, scaled up, through gateways and engine in a production-like environment, and records latency per message and the output stream. Synthetic traffic adds cases that never occurred, such as a thousand members canceling at once. Peak events like a news shock or a market open set the target. It is hard because realistic load depends on member behavior, which changes when the venue gets faster, and because a test environment rarely matches the hardware and network of production.",
    k: ["Replay recorded traffic vs. generate synthetic orders: replay is realistic but old, while synthetic can create tomorrow's extreme at the cost of unrealistic order mixes.", "Test on production hardware vs. a scaled replica: production hardware gives trustworthy numbers but is expensive and in use, while replicas misstate tails."],
    p: ["Tests measure average latency under load and miss the tail that members actually experience.", "A load generator on the same host steals the CPU cores the engine would have used."],
    v: "Run recorded peak-day traffic at double speed and confirm the tail latency target holds and the output stream still matches the expected result for every order.",
    dep: ["replay-engine","latency-measurement"]
  },
  "order-entry-protocol": {
    s: "The binary or text protocol on which members send orders and receive acknowledgments and fills, defining message types, fields, versions and error codes.",
    d: "A gateway decodes member messages for new order, amend, cancel, mass cancel and quote, and encodes acknowledgments, rejects, fills and unsolicited cancels. Fast venues use compact binary encodings with fixed-position fields so decoding takes a handful of instructions; older and slower interfaces use tag-value text. The protocol is a public specification that members code against for years. It is hard because it must be extended without breaking old clients, and because every reject reason is a contract that members' software acts on.",
    k: ["Fixed-layout binary vs. self-describing text: binary decodes in nanoseconds and is smaller, but is opaque in logs and harder to extend.", "Several protocol versions in parallel vs. a forced upgrade: parallel versions protect members from change but multiply gateway code and test cases."],
    p: ["A field's meaning is changed in a new version without a version bump, and old clients silently send wrong quantities.", "Reject codes are reused for different causes, so members cannot tell a risk limit from a price band."],
    v: "Run the published conformance suite against the gateway, covering every message type and every reject code, and confirm each response matches the specification byte for byte.",
    dep: ["binary-encoding","session-layer"]
  },
  "session-layer": {
    s: "The layer that gives each member connection a reliable, ordered message stream with sequence numbers, heartbeats, resend and recovery after disconnect.",
    d: "Both sides number every message. On reconnect they compare the next expected numbers and the sender resends what was missed, or the session is reset by agreement. Heartbeats detect a dead peer. The gateway persists the sequence state so it survives a gateway restart. Some venues let clients choose between recoverable and unrecoverable sessions. It is hard because duplicates must never create a second order, and because replaying a backlog to a slow client can overwhelm it or the gateway.",
    k: ["Persistent recoverable sessions vs. stateless sessions where the client recovers by querying state: persistence prevents loss on disconnect but needs durable gateway storage.", "Resend by gateway on reconnect vs. clients querying order status: resend is automatic but can flood, while status queries put the burden on clients."],
    p: ["A gateway restarts with an old sequence number and accepts a replayed message as new.", "A client reconnects in a tight loop and each attempt triggers a full resend, which saturates the gateway."],
    v: "Cut a connection mid-burst, reconnect and confirm that no order is duplicated or lost, and that the sequence numbers on both sides agree afterwards.",
    dep: ["gateway-core-link"]
  },
  "authentication": {
    s: "Verifies that a connecting party is the member it claims to be, using credentials and network identity, and limits how many sessions each member may open.",
    d: "At logon the gateway checks the credential, the source network address or dedicated cross-connect, and the entitlement for the session id. Credentials are certificates or shared secrets rotated on a schedule, and failed attempts are rate limited and logged. The checks happen once per session, not per message, so they can be slow but must never be bypassed by a reconnect path. It is hard because a stolen credential is a way to trade as someone else, and because rotation must not drop live sessions.",
    k: ["Mutual certificates vs. shared secrets in the logon message: certificates give strong identity and revocation, while secrets are simple and fast to check.", "Binding sessions to specific network ports vs. credentials alone: port binding blocks stolen credentials from elsewhere, but complicates member moves and disaster recovery."],
    p: ["A shared test credential is accepted in production and a test member trades live.", "Credential rotation expires the old secret before the member has deployed the new one and sessions fail at the open."],
    v: "Attempt a logon with an expired, revoked and wrong-network credential and confirm each is refused and logged, then confirm a valid logon is accepted within the stated time.",
    dep: ["member-entitlements"]
  },
  "message-validation": {
    s: "Checks that each message is well formed and internally consistent before it goes further: required fields, valid values, sizes within range and identifiers that exist.",
    d: "The gateway parses fields, rejects unknown instruments, invalid enumerations, negative quantities, off-tick prices and duplicate client order ids, and returns a specific reject code. Structural checks need no state, so they run at the edge in parallel across many gateways. Checks that depend on book state, such as whether an order to cancel exists, happen in the core. It is hard because the edge must reject enough to protect the core without duplicating its rules in a way that drifts.",
    k: ["Validate at the gateway vs. in the core: gateways scale out and shield the core, but any rule copied from the core can drift away from it.", "Reject unknown fields vs. ignore them: rejection catches client bugs early but breaks forward compatibility."],
    p: ["Gateway and core disagree about the tick size and the core rejects orders the gateway accepted, or the reverse.", "An oversize message exhausts a fixed buffer and corrupts adjacent messages."],
    v: "Send a corpus of malformed and boundary messages and confirm each gets the documented reject code, nothing reaches the core log, and the gateway stays up.",
    dep: ["reference-data","order-entry-protocol"]
  },
  "cancel-on-disconnect": {
    s: "Automatically cancels a member's resting orders when its session drops or heartbeat fails, so a broken client cannot leave stale orders to be hit.",
    d: "The member opts in per session or per firm. The gateway detects the disconnect and sends a mass cancel into the sequenced stream, so it takes effect at one defined point. A grace period can tolerate brief network blips. Some venues also provide a dead-man timer that a client must refresh. It is hard because detection is by timeout, so there is a window in which stale orders can trade, and because a cancel storm after a network event adds load at the worst moment.",
    k: ["Short timeout vs. long grace period: short protects members from stale orders but cancels on a blip, while long avoids false cancels but leaves exposure.", "Gateway-initiated cancel vs. core-side session tracking: gateway initiation is simple but fails if the gateway dies, while core tracking is more robust and more coupled."],
    p: ["The gateway crashes with the member's connection and nobody sends the cancel, so the orders stay live.", "A network partition drops hundreds of sessions at once and the mass cancels delay matching for everyone."],
    v: "Kill a test member's connection with resting orders and confirm that they are canceled at one logged sequence point within the configured timeout, with a cancel report queued for the member.",
    dep: ["session-layer","sequencer"]
  },
  "message-throttling": {
    s: "Limits how many messages a session or member may send per interval, protecting the venue from runaway algorithms and unfair use of shared capacity.",
    d: "Counters per session, and sometimes per member, track messages and order-to-trade ratios in sliding windows. Excess messages are delayed, rejected or the session is disconnected, according to published policy. Throttles sit in the gateway so they cost the core nothing. It is hard because a limit that is too low hurts legitimate market makers at the busiest moment, while one that is too high does not stop a runaway program, and because the response itself, rejects, adds traffic.",
    k: ["Reject excess messages vs. queue them: rejection is immediate and fair, while queuing adds delay that can make orders stale.", "Per-session limits vs. per-member limits: per-session is simple, but a member can open many sessions to multiply its allowance."],
    p: ["A throttle applied to cancels blocks a member from removing orders during a fast market, which is the opposite of the goal.", "Reject messages for a throttled client themselves flood the gateway and the client."],
    v: "Drive a test session at ten times its limit and confirm that the excess is rejected or disconnected as published, other sessions' latency is unchanged, and cancels are still honored.",
    dep: ["member-entitlements","session-layer"]
  },
  "gateway-core-link": {
    s: "The path from gateways to the core: the transport and message format that carry validated orders inward and acknowledgments and fills back, at low latency and in order.",
    d: "Gateways forward normalized messages to the sequencer over a low-latency transport, often shared-memory-like queues over kernel-bypass networking or dedicated links. A return path carries results back to the owning gateway, which maps them to session messages. Many gateways fan into one sequencer, so the link must bound queueing and apply backpressure. It is hard because this path adds latency for every order, and because a slow or failed gateway must not hold up others.",
    k: ["One link per gateway vs. a shared bus: dedicated links isolate failures, while a shared bus uses fewer ports and cores.", "Backpressure to the client vs. dropping inside the venue: backpressure keeps the record clean, but blocks fast clients behind a slow one."],
    p: ["A single gateway's burst fills the queue and delays orders from every other gateway.", "Results are routed to the wrong gateway after a failover and a member never sees its fill."],
    v: "Measure gateway-to-sequencer latency per message with timestamps at each end, under full load from all gateways, and confirm the tail stays within budget with no message lost or reordered per gateway.",
    dep: ["sequencer","kernel-bypass-networking","binary-encoding"]
  },
  "price-and-size-checks": {
    s: "Rejects orders whose price or quantity is implausible, such as a price far from the market or a size far above normal, to catch fat-finger errors before they trade.",
    d: "Each order is compared with limits for its instrument: a collar around the last trade or reference price, a maximum order quantity and a maximum notional value. Limits can be venue-wide, per instrument or per member. The check is a few comparisons against cached values, so it sits directly on the critical path. It is hard because the reference price moves, so a collar based on a stale price rejects good orders after a real jump, and because orders just inside the collar can still move a market.",
    k: ["Collar around last trade vs. around the best quote: last trade is simple but can be stale, while the quote is current but can itself be manipulated.", "Reject outside the collar vs. hold for confirmation: rejecting is deterministic, while holding can save a legitimate order at the cost of state and delay."],
    p: ["After a halt the reference price is the pre-halt value and every order at the new price is rejected.", "A new listing has no reference price and the check either rejects all orders or accepts anything."],
    v: "Send orders at, just inside and just outside every limit for a test instrument, and confirm the boundary behavior and reject codes exactly as specified.",
    dep: ["reference-data","price-level-index"]
  },
  "credit-limits": {
    s: "Tracks each member's financial exposure from open orders and executed trades against an allocated limit, rejecting orders that would exceed it.",
    d: "The risk component keeps, per member, the notional value of open buy and sell orders plus net traded exposure, updating on every acknowledgment, fill, cancel and amend. A new order is accepted only if projected exposure stays within the limit. Limits come from the clearing firm and can change during the day. It is hard because exposure must be updated atomically with matching, or a second order can slip in before the first order's effect is counted, and because worst-case exposure is more than the sum of the open orders.",
    k: ["Check before the book on the critical path vs. asynchronously after: before is exact, while after is faster but permits overshoot of the limit.", "Gross exposure vs. net: gross is simpler and conservative, while net matches real risk but needs correct offsets across instruments."],
    p: ["A fill and a cancel arrive in an unexpected order and exposure drifts negative or high until end of day.", "Amends count only the increase and a chain of small amends exceeds the limit."],
    v: "Fill a member to just under its limit, send an order that would cross it, and confirm the reject. Then cancel and confirm the same order is accepted and the exposure returns to the expected value.",
    dep: ["risk-state-store","limit-administration"]
  },
  "position-limits": {
    s: "Caps the net position a member or account may hold in an instrument or related group, as set by the venue, the clearing firm or the regulator.",
    d: "Net position is the sum of executed quantities with open orders counted as potential exposure. Limits are held per instrument and per group, such as all contracts on one underlying. Orders that would breach are rejected, and some limits are checked only after the trade, with warnings and forced reductions. It is hard because related instruments share limits, because positions carry across days, and because accounts can be aggregated differently by venue, clearer and regulator.",
    k: ["Hard pre-trade rejection vs. post-trade monitoring with warnings: pre-trade enforces the limit exactly but adds latency, while post-trade is lighter and allows breaches.", "Venue-side positions vs. relying on clearing: venue-side is immediate but sees only its own trades, while clearing sees everything but later."],
    p: ["Opening positions loaded at start of day are wrong and limits are enforced against the wrong base.", "A trade bust restores a position in risk but the limit state is not reinstated."],
    v: "Load a known opening position, trade up to the limit and one lot beyond, and confirm that the last order is rejected. Bust a trade and confirm position and headroom revert.",
    dep: ["risk-state-store","reference-data"]
  },
  "self-trade-prevention": {
    s: "Stops two orders from the same owner from matching each other, applying a chosen rule such as canceling the newer or older order or reducing both.",
    d: "Each order carries an owner identifier, usually a firm or trader group. During matching, when the best resting order shares the incoming order's owner, the engine applies the configured mode: cancel the incoming, cancel the resting, cancel both or decrement the smaller quantity, then continues with the next order. It is hard because it interacts with priority, partial fills and reports, and because members use it to avoid regulatory wash trade problems, so the behavior has to be exactly what they expect.",
    k: ["Cancel newest vs. cancel oldest vs. decrement: each preserves a different order of the member, and a mismatch with the member's strategy appears as unexpected cancels.", "Prevent within a firm vs. within a trader id: wider groups protect against wash trades but block legitimate trading between desks."],
    p: ["The skipped resting order loses its time priority in some implementations but should not, and members notice.", "Owner ids are set by the member without validation, so unrelated firms are blocked from trading with each other."],
    v: "Place a resting order and an opposing order from the same owner in each mode and confirm the result, the reports and the book, including that priority behind the skipped order is untouched.",
    dep: ["matching-loop","member-entitlements"]
  },
  "risk-state-store": {
    s: "The in-memory state the risk checks read and update: per-member exposure, positions, open order notional and reference prices.",
    d: "Data sits in compact arrays indexed by member and instrument, updated on the same thread that applies matching results so every check sees consistent state. It is part of the deterministic state, snapshot and replayed with the book, so a standby has identical exposure. When risk is a separate process, updates arrive on a stream and the check sees slightly old data. It is hard because it is on the critical path, must be exactly right, and must be rebuilt on recovery from snapshot plus log.",
    k: ["Risk state in the core thread vs. a separate risk process: in-core is exact and fast, but adds work to the single thread, while a separate process scales and may lag.", "Preallocated dense tables vs. hash maps: dense tables are predictable and cache friendly, but need ids assigned up front."],
    p: ["Risk state is excluded from snapshots and a recovered engine allows orders that the live one would have rejected.", "A separate risk process falls behind during a burst and approves orders against stale exposure."],
    v: "Recover an engine from snapshot and replay, then compare every member's exposure and position with the live engine's. They must match exactly.",
    dep: ["state-snapshots","deterministic-state-machine"]
  },
  "limit-administration": {
    s: "The process and interface through which risk limits are set, raised, lowered and suspended, by the venue, clearing firms and members themselves.",
    d: "Limits flow from clearing firms to the venue, which applies them to member sessions. Changes arrive through an administrative interface and are sequenced so they take effect at one point for every component. Some members can set sub-limits for their own traders. A lowered limit below current exposure is applied immediately but only blocks new risk. It is hard because limit updates often arrive during volatile moments and must be applied at once without disturbing matching, and every change must be attributable.",
    k: ["Sequenced limit updates vs. direct writes to the risk store: sequenced updates replay correctly, while direct writes are faster but skip the audit trail.", "Clearing-firm-controlled limits vs. venue-controlled: clearing firm control puts the loss on the party who bears it, while venue control is consistent but ignores their view."],
    p: ["A limit raised by an authorized user is accepted from a stale session after that user lost access.", "Limits set in a different currency or unit than exposure is computed in, so the cap is off by a large factor."],
    v: "Lower a test member's limit to below its exposure during active trading and confirm that new risk is rejected from the next sequence number, with the change logged with user and time.",
    dep: ["member-entitlements","sequencer"]
  },
});
