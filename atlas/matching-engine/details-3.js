// Details for the matching engine plate, part 3: phases, auctions, halts, market data, post-trade, sequencing.
ATLAS.details("matching-engine", {
  "trading-phases": {
    s: "The state machine that moves each instrument through pre-open, auction, continuous trading, closing auction, post-close and halted states, changing which orders and actions are allowed.",
    d: "Each instrument has a current phase driven by a schedule, by operator commands and by automatic triggers such as volatility limits. Phase changes are events in the sequenced stream, so every copy of the engine switches at the same point. In each phase the engine accepts, queues or rejects order types differently and chooses between continuous matching and call matching. It is hard because transitions are the moments of highest load and risk, and because a missed or doubled transition leaves instruments in different states.",
    k: ["Time-driven transitions injected as sequenced events vs. each node reading its own clock: sequenced events keep copies identical, while local clocks are simpler and let nodes diverge.", "Phase per instrument vs. one phase for the whole venue: per-instrument supports halts and staggered opens, while a global phase is simpler to operate."],
    p: ["A clock-driven transition fires on the standby a few microseconds earlier than on the active node and the two disagree about an order.", "An instrument stuck in a pre-open phase after a failed uncross never opens."],
    v: "Run a full simulated day with scheduled and forced transitions and confirm that every instrument follows the intended phase sequence, the log shows each change at one sequence number, and the standby's state is identical at every step.",
    dep: ["sequencer","reference-data","deterministic-state-machine"]
  },
  "opening-auction": {
    s: "A call phase in which orders accumulate without matching, then all trade at one price chosen to maximize volume, establishing a fair opening price after a closed period.",
    d: "During the call, the engine accepts, amends and cancels orders and publishes an indicative price and imbalance computed from the current book. At the scheduled end, possibly after a random extension, the uncrossing algorithm picks the price and matches eligible orders. Unmatched interest moves into the continuous book. It is hard because the book is not matched while orders arrive in huge numbers, because the end time is a peak, and because indicative information can be gamed.",
    k: ["Fixed end time vs. random end within a window: fixed is predictable, while random discourages last-microsecond manipulation of the indicative price.", "Allow cancels during the final seconds vs. lock the book: allowing cancels is flexible but permits spoofing the price, while locking is robust and unfriendly."],
    p: ["The uncross computation for thousands of instruments starts at once and overloads the cores, delaying the open.", "An imbalance feed published too late makes the indicative price meaningless to members."],
    v: "Load a recorded opening book into a test engine, run the auction and confirm that the price, matched volume and allocation equal an independent reference calculation, and the continuous book opens with the expected remainder.",
    dep: ["trading-phases","uncrossing-algorithm","incremental-feed"]
  },
  "closing-auction": {
    s: "A call phase at the end of the day that sets the official closing price, which index providers, funds and derivatives rely on for valuation.",
    d: "Orders for the close accumulate during the continuous session and a dedicated call. The uncross takes place at the end, with rules for imbalance publication and for which orders may be added or removed late. The resulting price is published as the official close. Large volumes trade there, so the engine and feed see a sudden burst. It is hard because many parties benefit from influencing the closing price, which makes manipulation attractive and the integrity rules central.",
    k: ["Single closing auction vs. continuous trading until a reference price calculation: an auction gives an exact, liquid close, while a calculated price avoids the burst and can be skewed by thin trading.", "Late entry of imbalance-offsetting orders only vs. open entry: restricting protects price integrity, while open entry invites volume."],
    p: ["A system delay makes the uncross late and downstream indices use an unofficial price.", "Late cancels are allowed for a few members through a fallback path and the integrity rule becomes unfair."],
    v: "Replay the final minutes of a heavy day, including a large imbalance, and confirm the official close, the volume and the timing of every published step match the specification.",
    dep: ["trading-phases","uncrossing-algorithm","incremental-feed"]
  },
  "uncrossing-algorithm": {
    s: "The calculation that chooses the single auction price: usually the one that maximizes executable volume, then minimizes imbalance, then follows a reference price rule.",
    d: "The engine aggregates cumulative buy and sell quantity at each candidate price and evaluates executable volume, which is the smaller of the two. Ties are broken by the smallest imbalance, then pressure from the larger side, then proximity to a reference price. After the price is fixed, orders are allocated by priority and quantity. It is hard because it must be deterministic and fully specified, handle market orders and hidden orders, and run quickly on large books at the same moment for many instruments.",
    k: ["Maximize volume first vs. minimize imbalance first: volume first yields the most trading, while imbalance first can produce a price that is fairer to the larger side.", "Compute incrementally during the call vs. once at the end: incremental spreads load and supports an accurate indicative price, while a single pass is simpler and the end becomes a peak."],
    p: ["Tie-breaking falls through to an unspecified rule and live and replay choose different prices.", "Market orders are left out of the aggregate and the price ignores a large part of the demand."],
    v: "Feed a set of randomly generated books to the engine and an independent reference implementation and confirm they pick the same price, volume and allocation for every case, including ties and empty sides.",
    dep: ["price-level-index","price-time-priority","trade-price-rules"]
  },
  "volatility-interruptions": {
    s: "A temporary switch of one instrument from continuous trading to an auction when its price moves beyond a set range from a reference, giving the market time to absorb information.",
    d: "Each instrument has static limits around a daily reference and dynamic limits around the last price. If a trade or an execution price would breach a limit, the engine stops matching for that instrument, enters a short auction and resumes after the uncross, often with widened limits. The check happens in the matching loop. It is hard because the decision must be made before the trade it would prevent is published, and the reference price rules must be exact.",
    k: ["Halt before the breaching trade vs. after: before protects the market from the print, while after is simpler and publishes the extreme price.", "Auction-based pause vs. a no-trade freeze: an auction gives price discovery and continues trading, while a freeze is simple and leaves orders stuck."],
    p: ["The reference price is not updated after a corporate action and instruments halt all morning.", "Repeated triggers cause a loop of short auctions that never settle."],
    v: "Drive a test instrument through a series of prints that crosses the limit and confirm that matching stops before the breaching trade, the auction runs for the specified time and trading resumes with the new reference.",
    dep: ["matching-loop","trading-phases","reference-data"]
  },
  "market-wide-circuit-breakers": {
    s: "Rules that halt trading across a whole venue, or in all instruments of a market, when a broad index falls by set percentages within a day.",
    d: "A reference index value feeds the venue. When it drops past defined thresholds, a venue-wide halt of fixed length is triggered, with rules by time of day and by level. All instruments transition to a halted phase at one sequence point, orders may still be entered or canceled, and trading resumes through an auction. It is hard because it spans every partition, because it may be coordinated with other venues by rule, and because a mistake in the index feed can halt a market for no reason.",
    k: ["Automatic trigger vs. operator decision: automatic is consistent and fast, while an operator can resist a bad index reading and takes longer.", "Venue-local trigger vs. coordinated across venues: local is independent and simple, while coordinated halts stop displacement of trading to other venues."],
    p: ["A faulty index value triggers a halt that has to be reversed manually with members unable to trade.", "Partitions receive the halt at different sequence points and trade for a moment after others stop."],
    v: "Feed a test index through each threshold and confirm every instrument on every partition halts at one logged point, orders can be canceled during the halt, and the reopening auction runs as specified.",
    dep: ["halt-and-resume","trading-phases","instrument-partitioning"]
  },
  "halt-and-resume": {
    s: "The procedure for stopping trading in an instrument or market and restarting it: what is allowed during the halt, how the restart auction runs and how members are told.",
    d: "A halt is a sequenced event that moves instruments to a halted phase. During it, orders may be accepted and canceled but not matched, depending on the halt type, such as news pending or regulatory. Resumption goes through a pre-open call so the price is rediscovered fairly, and the venue publishes the planned resume time. It is hard because halts are rare, which means the code is rarely exercised, and because they come at the most stressful moments.",
    k: ["Keep accepting orders during a halt vs. reject them: accepting preserves interest and makes the restart auction rich, while rejecting is simpler and loses information.", "Resume with an auction vs. directly into continuous matching: an auction restarts fairly and takes time, while direct restart is quick and favors the fastest."],
    p: ["Halted instruments are exercised only in the yearly drill and the code path has bit-rotted.", "Members are not told of the planned resume time and reopen with stale orders."],
    v: "Run a halt and resume drill in production-like conditions on each halt type and confirm that the allowed actions, published messages and restart auction behave exactly as the rulebook says.",
    dep: ["trading-phases","operations-console","incremental-feed"]
  },
  "incremental-feed": {
    s: "The stream of small messages describing every change to the order book and every trade, from which a subscriber can rebuild the book and track it live.",
    d: "The engine's output events are converted into a compact binary stream: add, modify, delete order or level, trade, and state changes, each with a sequence number. Subscribers apply them in order to a local copy of the book. The feed is the primary product of the venue to most participants. It is hard because it must be complete, strictly ordered and fast, because bursts are far above the average rate, and because its format is a public contract.",
    k: ["Order-level (full depth) vs. price-level aggregated updates: order-level lets subscribers rebuild exact queues and costs bandwidth, while aggregated is light and hides queue position.", "One stream for all instruments vs. several partitioned channels: one stream is simple to consume, while channels bound each subscriber's load and require more connections."],
    p: ["A message type is added without notice and subscribers' decoders drop the stream.", "The feed carries events in internal order, which differs from the order of the execution reports."],
    v: "Rebuild the book from the feed alone at several points in a recorded day and compare with the engine's book at the same sequence number. They must be identical.",
    dep: ["feed-sequencing","multicast-distribution","binary-encoding"]
  },
  "snapshot-feed": {
    s: "A periodic or on-demand full picture of the book, with the sequence number it reflects, used by late joiners and by subscribers recovering from a gap.",
    d: "A separate process consumes the incremental feed, maintains a copy of each book and publishes its full state on a loop, either on a separate channel or in response to requests. Each snapshot carries the incremental sequence number at which it is valid, so a subscriber can apply it and continue with later incrementals. It is hard because the snapshot must be consistent with a single sequence, it must not slow the real-time feed, and a big book takes many messages to send.",
    k: ["Cyclic snapshots on a multicast channel vs. request-response over TCP: cyclic is simple and scales to any number of subscribers, while request-response is efficient and adds load on the venue.", "Snapshot built by a separate consumer vs. by the engine: a consumer keeps the engine out of it, while the engine's copy is always exact and costs hot-path time."],
    p: ["A snapshot taken across several messages mixes two sequence numbers and subscribers build a corrupt book.", "A burst of simultaneous recoveries after an outage overloads the snapshot service."],
    v: "Join a fresh subscriber mid-day using the snapshot plus incrementals and confirm that its book equals the engine's book at the next sequence number, repeated while the market is moving fast.",
    dep: ["incremental-feed","feed-sequencing"]
  },
  "top-of-book-feed": {
    s: "A light feed with only the best bid and ask, last trade and summary statistics, for subscribers who do not need full depth.",
    d: "It is derived from the incremental stream by a separate consumer, publishing a message whenever the best prices, sizes or last trade change. It carries daily volume, high, low and the indicative auction price. Because it is smaller, it can be published to many more recipients and over wider networks. It is hard because it must never disagree with the full feed and may be required by regulators to be available to the public at a defined delay or cost.",
    k: ["Derived by a consumer of the full feed vs. generated by the engine: derived is simple and slower by a few microseconds, while engine generation is fastest and adds work to the hot path.", "Publish every change vs. throttled snapshots: every change is exact and costly, while throttling is light and shows stale prices."],
    p: ["The derived feed lags the full feed by a burst and a quoter sees a price that no longer exists.", "Trade condition flags are dropped in conversion, so a trade at an auction price looks like a regular print."],
    v: "Compare the top-of-book feed with the best prices implied by the full feed over a recorded day and confirm every difference is a documented latency, with no state where they conflict.",
    dep: ["incremental-feed"]
  },
  "multicast-distribution": {
    s: "Delivers each feed message once to many subscribers using network-level replication, so latency does not grow with the number of recipients.",
    d: "The publisher sends each packet to a multicast group address; switches replicate it to every subscribed port. Feeds are usually published on two identical redundant streams (A and B) over separate paths so a subscriber can recover from loss by taking whichever copy arrives first. Packets bundle several small messages up to the network's frame size. It is hard because multicast is unreliable and best effort, so loss recovery is the subscriber's job, and because switch buffers and replication limits shape both fairness and loss.",
    k: ["Redundant A/B streams with arbitration vs. a single stream with retransmission: A/B recovers instantly from single-path loss and doubles the bandwidth, while retransmission is cheaper and slower to repair.", "Packing many messages per packet vs. one per packet: packing lowers packet rate and adds a small delay at low volume."],
    p: ["The A and B streams share a switch and a single failure loses both.", "A subscriber's slow consumer overflows its socket buffer and drops packets during the opening burst."],
    v: "Cut one stream path in a test and confirm that subscribers continue with no gap, then measure packet loss and arrival skew across all subscriber ports during a peak-rate replay.",
    dep: ["low-latency-switching","kernel-bypass-networking"]
  },
  "feed-sequencing": {
    s: "Numbers every feed message in a continuous series, so subscribers can detect missing or duplicate messages, rejoin after a gap and merge redundant streams.",
    d: "Each packet carries a sequence number, with a separate series per channel. Subscribers expect consecutive numbers; on a gap they wait briefly for the other stream, then request retransmission or fall back to a snapshot. The venue resets numbering at defined points such as start of day. The number is also the reference in snapshots and audit. It is hard because the sequence must reflect the engine's true order, survive failover without a gap or reuse, and the reset rules must be unambiguous.",
    k: ["Sequence numbers from the engine's event log vs. assigned by the publisher: log-derived numbers survive failover and tie feed to audit, while publisher numbers are independent and can diverge across nodes.", "Retransmission service vs. snapshot-only recovery: retransmission preserves the exact stream, while snapshots are simpler and lose detail."],
    p: ["After failover the standby restarts sequence numbering and subscribers see duplicates or a false gap.", "Two channels use overlapping number ranges and a consumer merges them."],
    v: "Kill the active publisher mid-stream and confirm that the standby's first message continues the sequence with no gap or repeat, and that a subscriber's gap detector stays silent.",
    dep: ["event-log","logical-time"]
  },
  "equal-latency-distribution": {
    s: "Design so that every subscriber receives each message at the same time, regardless of location in the facility, using matched cable lengths and identical network paths.",
    d: "Fairness at microsecond scale depends on physics: a longer cable adds about five nanoseconds per meter. Venues standardize the cable length from the core to every member's rack, give every member the same hardware class and port speed, and use the same switch hops. Some add deliberate delay to equalize or to slow the fastest path, as in speed bumps. It is hard because equal means measured at the subscriber's port, which requires verification, and because members will exploit any difference.",
    k: ["Equalize cable lengths with coils vs. place members by distance: coils make every path equal and waste fiber, while distance-based placement is cheaper and unequal.", "Add a deliberate delay on inbound orders vs. none: a delay reduces the value of raw speed and complicates the explanation of latency."],
    p: ["A member's cross-connect is replaced with a shorter run during maintenance and its feed arrives earlier than the others.", "Equalization covers the feed but not the order entry path, so fairness is only half there."],
    v: "Measure the arrival time of one feed packet at every member port with hardware timestamps and confirm that the spread across ports is within the published tolerance, and repeat after any change.",
    dep: ["colocation-cross-connects","hardware-timestamping","low-latency-switching"]
  },
  "data-entitlements": {
    s: "Controls who may receive which feed, in real time or delayed, and measures usage for billing, with rules that depend on the subscriber's category.",
    d: "Real-time depth feeds go to paying members and vendors, while delayed or top-of-book data may be free to the public. Entitlement can be enforced by separate multicast groups per tier, by a distribution service that checks accounts, or by encryption with keys. Delayed streams are produced by a separate component that buffers messages for the configured time. It is hard because enforcement on a high-rate multicast stream is coarse, and because the delay must be exact, or the free data competes with the paid.",
    k: ["Separate multicast groups per tier vs. one group and key-based encryption: groups are simple and fast but exposed to anyone who can join, while encryption enforces the rights and costs per-message work.", "Delay produced by the venue vs. by vendors: the venue's delay is uniform and authoritative, while vendors' delays are free for the venue and uneven."],
    p: ["A delayed channel is joined at the wrong group and real-time data is served for free.", "Usage counts for billing come from sessions rather than messages and are disputed."],
    v: "Subscribe test accounts of each tier and confirm each receives exactly its entitled channels with the specified delay, and that the billing record matches the observed message counts.",
    dep: ["member-entitlements","incremental-feed"]
  },
  "trade-capture": {
    s: "Records each executed trade with both sides, price, quantity, time and identifiers as the authoritative trade record that feeds clearing, reporting and member statements.",
    d: "Every trade event from the matching loop is written into the trade store with a unique trade id and the two orders and members involved. The store is derived from the sequenced log, so the engine's output and the record always agree. It records trade type, such as auction or implied, and flags for later corrections. It is hard because this record is a legal and financial fact: it must not be lost or duplicated, and everything downstream reconciles to it.",
    k: ["Write trades from the engine output stream vs. from a separate path inside the core: the output stream is simple and decoupled, while an inline write is atomic and slows matching.", "Store by trade vs. by trade leg per side: per trade is compact, while per leg simplifies member statements."],
    p: ["A crash between matching and writing the trade leaves a fill reported to members that clearing never hears about.", "The same trade is written twice after a replay and clearing sees double volume."],
    v: "Reconcile the trade store against the engine's execution reports for a full day: counts, quantities and values must match exactly, with each trade id appearing once.",
    dep: ["event-log","identifier-generation","execution-reports"]
  },
  "clearing-interface": {
    s: "The link that sends executed trades to the clearing house, which becomes the counterparty to both sides, and receives confirmations, rejections and margin or limit updates.",
    d: "Trades are forwarded in near real time over a reliable channel in an agreed format, with acknowledgments and reconciliation at end of day. The clearing house may reject trades that fail its checks, and the venue must handle the resulting breaks. Limit information can flow the other way, as risk limits for pre-trade checks. It is hard because the two systems must agree to the last trade, because delivery must tolerate outages on either side, and because rejects arrive after the trade is public.",
    k: ["Real-time trade-by-trade delivery vs. batches: real-time gives the clearer earlier risk control, while batches are simpler and delay exposure.", "Venue sends trades and clearing validates vs. clearing validates before the trade: pre-validation prevents breaks and adds a network round trip to matching."],
    p: ["A clearing connection outage queues trades in memory and a restart loses them.", "A trade rejected by clearing remains live in members' positions with no process to unwind it."],
    v: "Interrupt the clearing link in a test, continue trading, restore the link and confirm that all queued trades are delivered once, in order, and the end-of-day reconciliation shows zero breaks.",
    dep: ["trade-capture","event-log"]
  },
  "drop-copy": {
    s: "A copy of a member's own order and trade messages sent to a second recipient, such as the member's risk or compliance system, independent of the trading session.",
    d: "The gateway or an output stage duplicates execution reports for a member to separate drop-copy sessions, often with filters by trader or account. The copy lets a firm's risk team see activity in real time and reconcile against its own records even if the trading session fails. It carries the same reports with the same sequence. It is hard because it must be complete and in order, it must not slow the primary path, and it must be as authoritative as the trading session.",
    k: ["Duplicate at the gateway vs. generate from the event log: gateway duplication is simple and ties to sessions, while log generation is complete and independent of any gateway failure.", "Per-firm drop copy vs. per-trader: per-firm gives the risk team the full picture, while per-trader suits desk-level controls."],
    p: ["Drop copy lags trading during a burst and risk sees positions late.", "A gateway failover loses the drop-copy session state and the firm's risk system misses a stretch of fills."],
    v: "Compare a member's drop-copy stream with its trading session for a day and confirm identical reports in identical order, then fail the trading session and confirm the drop copy continues.",
    dep: ["execution-reports","member-entitlements","session-layer"]
  },
  "trade-corrections": {
    s: "The controlled process for canceling or amending a trade after the fact, because of an error or an order of the regulator, and informing members, clearing and the public.",
    d: "A trade bust removes a trade or an erroneous-trade policy adjusts its price, usually by an operator command with approval, and often within a short window after execution. The correction is recorded as an event, published on the feed, sent to clearing, and its effect on positions and risk is reversed. It is hard because the effect propagates to every member's position and limit, and because policy decides which trades may be reversed and who bears the consequence.",
    k: ["Cancel the trade vs. adjust its price: canceling is clean and removes the trade for both sides, while adjusting keeps volume and is harder to explain.", "Operator-initiated only vs. member requests with approval: operator-only is controlled and slow, while requests surface errors quickly and need a workflow."],
    p: ["A bust reverses the trade in the trade store but not in the risk state, and the member's headroom stays wrong.", "A bust is published late and members hedged against it in the meantime."],
    v: "Bust a test trade and confirm that the feed, trade store, clearing message, risk state and both members' reports all reflect it, with the original trade still visible in the audit trail.",
    dep: ["operations-console","trade-capture","risk-state-store"]
  },
  "end-of-day-processing": {
    s: "The orderly close of the trading day: expiring orders, final reports, reconciliation with clearing, snapshots, archival and the roll to the next day's reference data.",
    d: "After the close, the engine expires day orders, publishes final statistics, and writes a snapshot. Trade totals are reconciled with clearing and members, the day's log is sealed, and reference data for the next day, including corporate action effects, is loaded. Carried orders are revalidated against new rules. It is hard because it is a chain of dependent steps with deadlines, any failure delays the next open, and some steps cannot be repeated safely.",
    k: ["Automated pipeline with manual gates vs. fully manual checklist: automation is fast and repeatable and can fail silently, while manual steps are slow and give operators judgment.", "Roll over in place vs. restart on a fresh process: in place is quick and carries accumulated state, while a fresh start proves the recovery path every day."],
    p: ["Day orders are expired after the new day's reference data loads and are revalidated against the wrong tick table.", "The snapshot is written before the final expiry and recovery restores orders that should be gone."],
    v: "Run end of day on a recorded session and confirm: no live day orders remain, the clearing reconciliation shows zero breaks, the snapshot restores to an identical book and the next day's reference hash matches everywhere.",
    dep: ["state-snapshots","clearing-interface","reference-data","time-in-force"]
  },
  "sequencer": {
    s: "The single point that assigns every inbound message its position in one global order before the matching engine sees it, defining what happened first.",
    d: "Gateways send validated messages to the sequencer, which stamps each with a monotonically increasing sequence number and a time and writes it to the input log, then delivers the stream to the engine and the standbys. That order is the venue's truth for priority, audit and replay. It is a very simple component on purpose, often a single thread or a hardware device. It is hard because it is the one serial point in the system: it caps throughput, must never fail unnoticed and must never reorder.",
    k: ["One sequencer for the venue vs. one per partition: one gives a single global order across instruments, while per-partition scales and loses cross-instrument ordering.", "Software sequencer vs. hardware-assisted: software is easy to change and has jitter, while hardware has fixed tiny latency and costs agility."],
    p: ["The sequencer's own queue grows under a burst and every order's latency grows with it.", "Two sequencers both believe they are active after a fault and issue conflicting numbers."],
    v: "Send traffic from many gateways at full rate and confirm that the output has consecutive numbers, no loss, per-gateway order preserved, and the sequencer's added latency stays within budget at the 99.99th percentile.",
    dep: ["lock-free-queues","event-log","logical-time"]
  },
  "deterministic-state-machine": {
    s: "The design in which the engine's state depends only on the ordered stream of inputs, so any process fed the same inputs reaches the same state and produces the same outputs.",
    d: "The matching core is a pure function of the previous state and the next input: no wall-clock reads, random numbers, thread races or unordered iteration. Time arrives as an input event. Any needed outside data is also logged as an input. This lets a standby apply the same stream to stay identical, lets a replay reproduce a bug exactly, and allows the audit to be derived from the log. It is hard to keep because one stray source of nondeterminism, such as hash ordering or a floating-point difference, silently breaks every guarantee built on it.",
    k: ["Strict determinism with all inputs logged vs. replicate state by copying: determinism makes replication cheap and exact and demands discipline in every change, while copying state is forgiving and heavier.", "Logical time from inputs vs. reading the clock: input time replays exactly, while reading the clock is convenient and makes replay diverge."],
    p: ["Iterating a hash container in the core produces a different order between builds and standby diverges after a release.", "A library call that reads the clock or the environment creeps into the hot path."],
    v: "Run the same recorded input log through two independently started instances and compare their output streams and state hashes at every thousandth sequence number. Any difference fails the build.",
    dep: ["sequencer","logical-time"]
  },
  "single-writer-core": {
    s: "The rule that exactly one thread mutates the book and engine state, with everything else communicating with it through queues, so no locks are needed on the hot path.",
    d: "A dedicated core thread, pinned to a CPU, reads the sequenced input, runs risk and matching, and writes outputs to queues consumed by other threads. Other threads do I/O, encoding and persistence, but never touch book state. Locks and atomics are unnecessary for the state itself, and cache lines stay in one core's cache. It is hard because anything slow on that thread, a log write or a large report, stalls every order, so the thread's work must be strictly limited.",
    k: ["One thread per book with message passing vs. shared state with fine-grained locks: single-writer is simpler to prove correct and fast, while locks use more cores and add unpredictable waits.", "Do everything on the core thread vs. offload outputs: inline is lowest latency for light work, while offload protects the thread from variable costs."],
    p: ["A logging call on the core thread blocks on disk and the whole engine freezes.", "A diagnostics tool reads the book from another thread and races with a writer."],
    v: "Profile the core thread under peak load and confirm it spends all of its time in matching, with no system calls, no blocking and no waits on locks, verified with tracing during a full-speed replay.",
    dep: ["cpu-isolation","lock-free-queues"]
  },
  "logical-time": {
    s: "Time as the engine sees it: a timestamp attached to each input by the sequencer, used for priority, expiry and reports, instead of reading a clock during matching.",
    d: "The sequencer stamps each message with a sequence number and a wall-clock time from a synchronized source. The core uses only these values: priority comes from the sequence number, expiry and phase changes from timer events that are themselves sequenced inputs, and reports carry the stamped time. Replay, standby and live therefore agree. It is hard because multiple notions of time exist, receipt at the gateway, sequencing and matching, and the regulator asks for each, but the engine's decisions must use one.",
    k: ["Stamp once at the sequencer vs. at each stage: one stamp is consistent and hides intermediate delays, while stage stamps measure the path and produce several competing values.", "Sequence number for priority vs. timestamp: the number is unique and strictly ordered, while timestamps tie and need a tie-break."],
    p: ["Two components stamp the same event with their own clocks and the audit trail shows the fill before the order.", "A clock step backwards produces a timestamp earlier than its predecessor."],
    v: "Check the log for monotonic sequence numbers and non-decreasing timestamps across a full day and a clock-correction event, and confirm that replay yields identical report times.",
    dep: ["clock-synchronization"]
  },
  "identifier-generation": {
    s: "Creation of unique, never-reused identifiers for orders, trades and executions inside the engine, in a way that replays to the same values.",
    d: "Identifiers are derived from counters advanced by sequenced events, or from the sequence number itself, rather than from random sources or the clock. Many venues combine a partition prefix, a day and a counter so ids are unique across engine instances and days. Ids appear in reports, the feed and the audit trail, so their format becomes a public contract. It is hard because they must be unique across failover, never repeat after a restart and be generated without coordination on the hot path.",
    k: ["Counter derived from the sequence vs. an independent generator: derived ids replay identically and cannot collide, while an independent generator is flexible and needs durable state.", "Opaque ids vs. ids that encode meaning: opaque ids are safe to change, while encoded ids are easy to debug and tempt clients to parse them."],
    p: ["A counter restored from an old snapshot reissues ids already used by trades in the previous log segment.", "Ids that embed a timestamp reveal activity information to other members."],
    v: "Replay a day twice and confirm every order and trade id is identical across runs and unique across the full set, including across a simulated failover and day roll.",
    dep: ["sequencer","deterministic-state-machine"]
  },
  "arrival-order-fairness": {
    s: "Ensures that orders are sequenced in the order they actually reach the venue's boundary, and that no member can systematically get ahead of another through a faster path or a privileged port.",
    d: "Orders arrive on many gateways over different cables, so the first to reach the sequencer is not necessarily the first to enter the network. Venues equalize gateway paths, give every member the same gateway class, and sometimes timestamp at the edge with hardware and sort by those stamps before sequencing. Some add a small delay before the order is stamped so that jitter does not decide priority. It is hard because arrival order has to be measurable and defensible, not just intended.",
    k: ["Sequence in order of arrival at the sequencer vs. sort by edge hardware timestamps: sequencer arrival is simple and inherits path jitter, while edge timestamps are fair to the nanosecond and need a short holding delay.", "Identical gateways for everyone vs. tiers: identical gateways remove a source of dispute, while tiers let members pay for performance."],
    p: ["One gateway has a slightly shorter path to the sequencer and its members win ties systematically.", "A load imbalance puts a busy member's orders on a gateway with a longer queue."],
    v: "Send simultaneous test orders from every gateway repeatedly and confirm that the priority outcomes are evenly distributed, with no gateway winning more than chance allows, and the edge-timestamp order matches the sequence order.",
    dep: ["gateway-core-link","hardware-timestamping","sequencer","equal-latency-distribution"]
  },
});
