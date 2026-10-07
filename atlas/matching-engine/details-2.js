// Details for the matching engine plate, part 2: order types, order book, matching logic.
ATLAS.details("matching-engine", {
  "limit-orders": {
    s: "An order to buy or sell a quantity at a stated price or better, resting in the book at that price if it cannot trade immediately.",
    d: "On arrival, a limit order is matched against opposing resting orders whose prices cross its limit. Any remainder is placed in the book at its limit price, at the back of the queue for that price. The limit price must be a multiple of the instrument's tick size. It is the base case every other type is defined against. The difficulty is not the type itself but the exact rules around it: what price an aggressive limit trades at, what happens to the remainder and how its timestamp becomes its queue position.",
    k: ["Trade at the resting order's price vs. at the incoming order's price: resting-price execution rewards the passive side and is the convention, while the alternative would reward aggression.", "Remainder rests vs. remainder canceled by default: resting is the usual expectation, but cancel behavior must be expressible through time-in-force."],
    p: ["A crossed limit order rests in the book because the cross check used a stale best price.", "A price that is off-tick is accepted by one path and rejected by another, so the book holds an unmatchable level."],
    v: "Submit a buy limit through three resting sells at ascending prices and confirm it trades at each resting price in order and rests the remainder at its own limit, with the expected queue position.",
    dep: ["matching-loop","price-level-index","time-in-force"]
  },
  "market-orders": {
    s: "An order to buy or sell a quantity at the best available prices with no limit, executing against the book until filled or the book is exhausted.",
    d: "A market order walks the opposite side of the book from best price outward. Because it has no price, any unfilled remainder cannot rest at a price, so venues either cancel it, convert it to a limit order at the last trade price, or protect it with a price band. Many venues add a protection limit so a thin book cannot fill an order at an absurd price. It is hard because it is the order type most exposed to thin books, and its behavior in auctions and halts differs from continuous trading.",
    k: ["Cancel the unfilled remainder vs. convert it to a resting limit order: canceling is clean but leaves buyers unfilled, while converting leaves an order at an arbitrary price.", "Unbounded vs. protection-banded market orders: unbounded is purest but exposes members to extreme prices, and bands add a rule to explain."],
    p: ["A market order into an empty book trades at the only price present, which was an erroneous quote.", "During an auction a market order is accepted but does not participate, and the member is not told."],
    v: "Send a market order larger than the visible book and confirm that it fills in strict price order, stops at the protection band and reports the remainder exactly as specified.",
    dep: ["matching-loop","price-and-size-checks"]
  },
  "stop-orders": {
    s: "An order that stays dormant until the market trades at or through a trigger price, then becomes a market or limit order, used to limit losses or enter on breakouts.",
    d: "A stop order is held in a trigger store, not the visible book. When a trade price, or in some designs the best bid or ask, reaches the trigger, the engine releases it as a new market or limit order, which gets the arrival time of its release. Several stops can trigger from one trade, so release order must be defined. It is hard because triggering is itself an event that must be sequenced deterministically, because stops can cascade and drive prices further, and because trigger rules differ between venues.",
    k: ["Trigger on last trade vs. on best quote: last trade is harder to manipulate with small quotes, while quote triggers react sooner but can be gamed.", "Hold stops in the engine vs. in the member's system: engine-held stops are reliable but add state and cascade behavior, while member-held stops are simple for the venue and unreliable for the member."],
    p: ["A single trade triggers thousands of stops whose release order is undefined and varies between replay and live.", "Stops placed during a halt trigger at the reopening price all at once."],
    v: "Place stops at three prices, trade through them with one large order, and confirm that they are released in the documented order with correct timestamps and identical results on replay.",
    dep: ["stop-trigger-store","matching-loop"]
  },
  "time-in-force": {
    s: "The instruction that says how long an order lives and what happens to any unfilled part: for the day, until canceled, immediate-or-cancel, or at the open or close.",
    d: "Each order carries a validity. Day orders expire at the end of the session by an expiry event the engine generates, good-till-canceled orders persist across days and need to be stored overnight, and immediate-or-cancel orders never rest. Auction-only orders are accepted only in the matching phase. Expiries are sequenced events so every copy of the engine removes the same orders at the same point. It is hard because carrying orders across days requires persisting and revalidating them, and expiry bursts can be large.",
    k: ["Engine-generated expiry events vs. checking validity at each match: events are explicit and replay cleanly, while lazy checks avoid a burst but leave expired orders in the book.", "Persist multi-day orders in the engine vs. have members resubmit: persistence is convenient, but needs corporate action handling and start-of-day revalidation."],
    p: ["End-of-day expiry of a million orders runs as a single event that stalls the engine into the next phase.", "A multi-day order outlives a change in the instrument's tick size and cannot be matched or canceled."],
    v: "Enter orders with each validity, run the session through close and the next open, and confirm that each is expired, retained or never rested exactly as specified, with an unsolicited report for each expiry.",
    dep: ["trading-phases","level-order-queue"]
  },
  "execution-instructions": {
    s: "Conditions that constrain how an order may fill: fill-or-kill requires the whole quantity at once, minimum quantity sets a smallest acceptable fill, and all-or-none holds out for the full size.",
    d: "Before matching, the engine checks whether the opposing book can satisfy the condition at acceptable prices, and either proceeds or cancels without trading. Minimum quantity applies to each fill, so it may skip small resting orders. These checks require looking ahead through the book without changing it. It is hard because the check and the execution must see identical state, because skipping small orders interacts with price-time priority, and because a rejected fill-or-kill must have no side effect.",
    k: ["Check feasibility first then execute vs. execute and roll back: checking first never mutates the book, while rollback is simpler to write and cannot be exactly undone for reports.", "Minimum quantity per fill vs. per order: per-fill is flexible but skips queue positions, per-order is simpler and covers fewer needs."],
    p: ["The look-ahead counts hidden quantity that the incoming order is not allowed to trade with, and the order is accepted then fails to fill.", "A fill-or-kill partially executes after a concurrent change to the book in a multi-threaded design."],
    v: "Send fill-or-kill orders for exactly the available size, one lot more and one lot less, and confirm that only the first executes, with the book unchanged after the rejections.",
    dep: ["matching-loop","price-level-index"]
  },
  "iceberg-orders": {
    s: "Orders that display only part of their size, refilling the visible slice from hidden reserve as it trades, so large orders do not reveal their full intent.",
    d: "The order carries a total quantity and a display quantity. Only the display quantity is published; when it fills, a new slice is shown, usually losing time priority to others at the price. Fully hidden orders show nothing. Hidden quantity trades only after visible quantity at the same price. It is hard because it splits an order into several queue positions, needs published rules for refill priority, and complicates reports and market data, which must not leak the reserve.",
    k: ["Refill loses priority vs. keeps priority: losing priority is fairer to visible orders and discourages hiding, while keeping it is attractive to large traders.", "Randomized refill size vs. fixed: randomizing hides the pattern of a refill but makes behavior harder to test and explain."],
    p: ["A cancel acknowledgment reveals the remaining reserve through the quantity canceled.", "Market data is generated from the full quantity, so the feed exposes hidden size."],
    v: "Rest an iceberg, trade through its visible slice repeatedly, and confirm that the feed shows only displayed slices, refills queue behind earlier orders as specified, and the final fills total the original quantity.",
    dep: ["reserve-quantity-handling","level-order-queue"]
  },
  "pegged-orders": {
    s: "Orders whose price follows a reference, such as the best bid, the best ask or the midpoint, and is repriced by the engine as the reference moves.",
    d: "The engine keeps pegged orders in a side structure per reference. Each time the reference changes, it recomputes the prices of affected orders and moves them, which counts as a new arrival for priority. Offsets and limit caps bound where they may go. It is hard because repricing is work triggered by other people's orders, which can cascade, because pegs to each other can loop, and because a peg's priority behavior must be explicit.",
    k: ["Reprice immediately on every reference change vs. in batches: immediate is exact but adds work to each update, while batching saves work and lets the order trade at an outdated price.", "Pegged orders lose time priority when they move vs. keep it: losing it is consistent with amending, while keeping it advantages pegs over ordinary orders."],
    p: ["Two pegged orders referencing each other's side move forever, generating an endless stream of updates.", "Repricing is applied in a different order on live and replay and the book diverges."],
    v: "Rest a peg to best bid with offset, move the best bid several times, and confirm each reprice happens at one sequence point per change, with correct priority and one report per move.",
    dep: ["price-level-index","level-order-queue","matching-loop"]
  },
  "amend-and-cancel": {
    s: "Operations on resting orders: cancel removes an order, and amend changes price or quantity, with rules on which changes keep the order's place in the queue.",
    d: "A cancel finds the order by identifier and removes it from its level and the index; a reduction in quantity usually keeps priority, while a price change or quantity increase counts as a new order and goes to the back of the queue. Mass cancel removes all orders for a session, member or instrument. A cancel racing a fill is resolved by sequence order, and the report states which won. It is hard because races are routine, and the member must be told exactly what happened.",
    k: ["Reduce keeps priority, increase loses it vs. any amend loses it: the first rewards members who shrink and invites no gaming, while the second is simplest to explain and punishes risk reduction.", "Cancel-replace as one atomic message vs. cancel then new order: atomic avoids a window with no order, but is harder to implement and test."],
    p: ["A cancel is acknowledged for an order that had already filled in the same burst, and the member double-counts the position.", "A mass cancel takes a long time on a large book and holds up every other order."],
    v: "Race a cancel against an incoming order that would fill the target and confirm that the sequence order decides the winner, with exactly one of a fill or a cancel acknowledgment sent.",
    dep: ["order-id-lookup","level-order-queue","execution-reports"]
  },
  "price-level-index": {
    s: "The sorted structure of price levels on each side of the book, giving fast access to the best price and fast insertion and removal of levels.",
    d: "Options include a sorted tree, a skip list, and a dense array indexed by price offset from the market, which exploits the fact that most activity is near the best price. Each level holds an aggregate quantity and a pointer to the order queue. Operations are find best, find level, insert level and remove empty level. It is hard because the structure must be fast for the common case near the top while handling rare far-away prices, and its memory behavior determines tail latency.",
    k: ["Dense array indexed by tick vs. balanced tree: arrays give constant-time access and cache locality near the market but need a bounded price range, while trees handle any range at logarithmic cost.", "Cache the best price pointer vs. recompute: caching makes the common read free but needs updating on each removal of the top level."],
    p: ["A fat-finger price far from the market forces the array to grow or re-center and causes a latency spike.", "Empty levels are not removed and the best-price search walks thousands of empty slots."],
    v: "Benchmark insert, remove and best-price lookup under a recorded market-data mix and confirm the 99.99th percentile stays within budget, including the arrival of an extreme-price order.",
    dep: ["book-memory-pools","cache-aware-layout"]
  },
  "level-order-queue": {
    s: "The first-in, first-out list of orders resting at one price, preserving arrival order so the oldest order at a price trades first.",
    d: "Usually an intrusive doubly linked list or a ring buffer per level, with each order holding its remaining quantity, owner and arrival sequence. Matching reads from the front; cancels remove from anywhere via the order index; amends that lose priority move to the tail. Level aggregate quantity is kept in sync. It is hard because cancels in the middle of a queue are common, because contiguous layouts are fast but need compaction, and because queue position is a money-making property that must never be miscounted.",
    k: ["Intrusive linked list vs. contiguous array per level: lists give constant-time removal anywhere but scatter memory, while arrays are cache friendly and make removal costly.", "Store full orders in the queue vs. compact handles into a pool: handles shrink the queue but add an indirection on each match."],
    p: ["A cancel unlinks an order but fails to reduce the level's aggregate, and the feed shows depth that does not exist.", "Arrival sequence is taken from the gateway instead of the sequencer, so queue priority reflects the wrong order."],
    v: "Fill a level with a known sequence of orders, cancel from the middle and amend one, then trade through the level and confirm fills occur in the exact expected sequence.",
    dep: ["book-memory-pools","logical-time"]
  },
  "order-id-lookup": {
    s: "A map from order identifier to the order's location in the book, so cancels and amends reach their target without scanning.",
    d: "A hash table or direct-indexed array keyed by the venue's internal id, sometimes also by member session and client order id, which members use and which must be unique per session. Lookups happen on every cancel and amend and on each fill for reports. Entries are removed when orders complete. It is hard because the table sits on the hot path and grows with the number of live orders, because client ids are chosen by clients and can collide or be reused, and because resizing causes pauses.",
    k: ["Direct-indexed array by internal id vs. hash table: direct indexing is a single memory access but needs ids to be dense and recycled, while hashing handles arbitrary ids at higher cost.", "Resolve client ids at the gateway vs. in the core: gateway resolution shortens the core's path but requires gateways to hold the mapping across failover."],
    p: ["A hash table resizes in the middle of a burst and a 10-millisecond pause appears in the latency tail.", "Client order ids reused after a day roll resolve to the previous day's order."],
    v: "Insert and cancel a million orders with random ids and confirm each cancel finds its order in constant time, no lookups fail, and no latency outlier occurs when the table grows.",
    dep: ["book-memory-pools","identifier-generation"]
  },
  "book-memory-pools": {
    s: "Preallocated, fixed-size pools of order and level records that the book draws from, so matching never asks the operating system for memory.",
    d: "At startup, the engine reserves memory sized for the expected maximum live orders and levels, and hands out slots from a free list. Slots are addressed by index, which lets structures use compact integer handles instead of pointers and survive snapshots and restarts. Pools are touched in advance so page faults happen before trading. It is hard because the maximum must be chosen in advance, because exhaustion has to be handled safely, and because fragmentation across pools wastes cache.",
    k: ["Fixed pools sized for peak vs. growing on demand: fixed pools have predictable latency and fail hard at the limit, while growth survives surprises with pauses.", "Index handles vs. raw pointers: handles are relocatable and snapshot friendly, but require translation on every dereference."],
    p: ["The pool is exhausted by a flood of orders and the engine rejects everything or crashes.", "Memory is not pre-touched and the first orders at each new price trigger page faults at the open."],
    v: "Fill the pools to the configured limit in a test, confirm that the engine rejects new orders cleanly with a defined reason, and measure that no allocation or page fault occurs during a full-speed run.",
    dep: ["allocation-free-hot-path"]
  },
  "instrument-partitioning": {
    s: "Splitting instruments across independent books, threads or machines, so unrelated markets match in parallel while each book stays strictly single-threaded.",
    d: "Each instrument's book is owned by exactly one matching thread, with instruments assigned to threads or engine instances by a static map. The partition respects dependencies: instruments linked by spread orders, implied matching or shared risk must be together or coordinated. A router in front directs each order to its owner. It is hard because load is skewed, with a few instruments carrying most of the traffic, and because rebalancing requires moving a book safely during a pause.",
    k: ["Static partition by instrument vs. dynamic load balancing: static keeps ownership clear and replay simple, while dynamic evens load and complicates the single-writer rule.", "One engine process per partition vs. many partitions per process: separate processes isolate faults, while shared processes share cache and reduce cost."],
    p: ["The busiest instrument is assigned to the same core as several others and sets the tail for all of them.", "A cross-instrument risk check needs state owned by another partition and introduces a lock on the hot path."],
    v: "Run a recorded peak day with the real partition map and confirm that each partition's utilization and tail latency stay within budget, and the busiest partition has measurable headroom.",
    dep: ["single-writer-core","reference-data"]
  },
  "reserve-quantity-handling": {
    s: "The bookkeeping that tracks hidden quantity behind displayed quantity, so matching, priority and market data treat visible and reserve size consistently.",
    d: "Each order with reserve has a displayed slice and a hidden remainder. Level aggregates keep visible and hidden totals separately, so the feed publishes only visible depth while matching can trade the whole. Rules define whether hidden quantity at a price trades after all visible, and how refills re-enter the queue. It is hard because every path that reads levels, including risk, matching, snapshots and the feed, must use the right total, and a mix-up either leaks information or trades the wrong size.",
    k: ["Separate visible and hidden aggregates per level vs. derive on demand: separate totals make the feed cheap, while derivation avoids drift at the cost of walking the queue.", "Hidden orders in the same queue vs. a separate hidden queue: a shared queue keeps one priority order, while separate queues simplify the display path."],
    p: ["A snapshot built from total quantity publishes reserve to the world.", "Hidden quantity trades ahead of later visible orders at the same price, against the published rule."],
    v: "Rest visible and hidden orders at one price and cross them with a large order, then confirm fill order against the published rule and that no published message includes hidden size.",
    dep: ["level-order-queue","price-level-index"]
  },
  "stop-trigger-store": {
    s: "A structure holding dormant stop orders sorted by trigger price, so the engine can find and release exactly the stops that a trade price has reached.",
    d: "Buy stops and sell stops live in separate sorted collections keyed by trigger price, with arrival order within a price. After each trade, the engine checks the store against the new last price, removes triggered entries and injects them as new orders in a defined sequence. Cancels need the id index to reach stop entries too. It is hard because releasing stops creates new orders in the middle of matching, which can trade and trigger more stops, so the loop must be bounded and ordered.",
    k: ["Process triggered stops immediately after each trade vs. after the current incoming order completes: immediate is simpler to reason about, while deferred avoids stops trading mid-order and is more stable.", "Separate store vs. stops embedded in the book: a separate store keeps the visible book clean, while embedding allows one structure at the cost of hiding entries."],
    p: ["Stops are released in hash-map order and the order differs after a restart.", "A cascade of stop releases has no depth limit and monopolizes the engine for seconds."],
    v: "Load stops at many prices, trigger a chain of releases, and confirm the sequence of released orders and resulting trades is identical across live and three replays, with a bounded processing time.",
    dep: ["book-memory-pools","order-id-lookup"]
  },
  "price-time-priority": {
    s: "The standard matching rule: better prices trade first, and among orders at the same price the earliest to arrive trades first.",
    d: "On the buy side, higher prices rank first; on the sell side, lower prices rank first. Ties are broken by arrival sequence assigned by the sequencer, not by wall-clock time. The rule is encoded in the book's ordering and in what an amend does to an order's place. It is simple to state and subtle in practice: priority after partial fills, after quantity changes, after pegged repricing and across hidden quantity all need explicit answers, and members adapt their behavior to any ambiguity.",
    k: ["Strict time priority vs. size-weighted priority: time priority rewards speed and invites a speed race, while weighting rewards size and invites quote inflation.", "Priority by sequencer number vs. by gateway receive time: the sequencer number is a single total order, while gateway times differ and cannot be compared fairly."],
    p: ["Two orders in the same burst receive the same timestamp and tie-break differently on replay.", "An amend rule change silently moves the existing orders to the back of the queue."],
    v: "Submit a known set of orders at one price in a fixed sequence and confirm that fills follow the sequence numbers exactly, repeated across live, standby and replay with identical outcomes.",
    dep: ["level-order-queue","sequencer"]
  },
  "matching-loop": {
    s: "The core routine that takes one incoming order, matches it against the opposite side of the book while prices cross, then rests or discards the remainder and emits results.",
    d: "For each input, the loop checks validity, applies risk, then repeatedly takes the best opposite order, tests price crossing and instructions, computes the fill quantity and price, updates both orders and the level, and emits a trade, until the order is filled, no longer crosses or is blocked by a condition. A remainder is added to the book. It runs on one thread without locks. It is hard because every branch, such as self-trade prevention, minimum quantity and stops, must keep the book consistent, and it is the one piece of code that cannot be wrong or slow.",
    k: ["Single-threaded loop per book vs. concurrent matching with locks: single-threaded is deterministic and fast, while concurrency uses more cores and breaks ordering guarantees.", "Emit results as the loop runs vs. collect then emit: immediate emission lowers latency, while collecting allows atomic output if the order is later rejected."],
    p: ["An early exit leaves the book half-updated when a condition fails mid-order.", "Quantity arithmetic overflows on a large notional and trades at the wrong size."],
    v: "Run a property test that feeds random order streams and checks invariants after every step: no crossed book, quantities conserved, every trade matches a pair of orders. Replay a day and match the output.",
    dep: ["price-level-index","level-order-queue","deterministic-state-machine","execution-reports"]
  },
  "pro-rata-allocation": {
    s: "A rule that splits an incoming order's fill across all resting orders at the best price in proportion to their size, often with a priority bonus for the first or the largest.",
    d: "When an order trades against a level, the engine totals the resting quantity, then gives each order a share proportional to its size, rounds down to whole lots, and distributes the remainder by a secondary rule such as time or size. Some venues give a top order a fixed portion first. It is common where tick sizes are very small and queue position is cheap to win. It is hard because rounding must be deterministic and fair, and because the rule encourages members to inflate quoted size.",
    k: ["Pro-rata vs. price-time: pro-rata rewards size and avoids a speed race, but invites oversized quotes that are canceled when hit.", "Pure pro-rata vs. with a time-priority top order: the bonus rewards the first quoter and keeps tight spreads, at the price of a more complex rule to explain."],
    p: ["Rounding leftovers are assigned by iteration order of an internal container and differ between runs.", "Quantities below the lot size at a level receive zero, and members cannot understand why they never fill."],
    v: "Trade against a level with orders of known sizes and confirm the shares, the rounding and the remainder match a reference computation exactly, then repeat on replay for identical output.",
    dep: ["level-order-queue","matching-loop"]
  },
  "trade-price-rules": {
    s: "Rules that fix the price of each execution: normally the resting order's price, with specific rules for auctions, crosses, midpoint orders and price improvement.",
    d: "In continuous matching each fill occurs at the resting order's price, so an aggressive order may get price improvement. In auctions every trade occurs at one uncrossing price. Midpoint and hidden orders can trade at the reference midpoint, which may fall between ticks. Prices are integers in fixed units to avoid rounding differences. It is hard because the price rule also feeds the last-trade price used by stops, bands and the feed, and because sub-tick prices need consistent representation everywhere.",
    k: ["Integer prices in fixed minor units vs. floating-point: integers are exact and deterministic, while floating-point is convenient and gives different results across machines.", "Trade at resting price vs. at midpoint of the two: resting-price is conventional and rewards the passive side, while midpoint splits the benefit and surprises members."],
    p: ["A conversion between price scales drops precision and a trade prints one tick off.", "Midpoint trades set the last-trade price and trigger stops at a price no order showed."],
    v: "Execute a sample of trades of every type and recompute each price from the orders involved with an independent implementation. Every price must match to the last digit.",
    dep: ["matching-loop","reference-data"]
  },
  "partial-fills": {
    s: "The handling of orders that trade only part of their quantity: updating remaining size, keeping or losing priority, and reporting each fill separately.",
    d: "Each match reduces both orders' remaining quantities by the fill size. A resting order partially filled keeps its queue position with the smaller size; an incoming order continues to the next resting order or rests with the remainder. Each fill produces an execution report with cumulative and remaining quantity. It is hard because members' systems reconcile to these reports exactly, and because remainders can fall under minimum lot or minimum quantity and need a rule.",
    k: ["Partially filled resting orders keep priority vs. lose it: keeping is natural and fair to the passive party, while losing would discourage resting large orders.", "Report each fill vs. aggregate per incoming order: separate reports give exact detail and more messages, while aggregates are lighter and hide prices."],
    p: ["Cumulative quantity in a report is computed from stale state and members see fills exceeding the order size.", "A tiny remainder below the lot size rests forever because nothing can match it."],
    v: "Fill an order in many parts via several counterparties and verify that cumulative, remaining and average price in the reports always sum to the original quantity and the exact trade total.",
    dep: ["matching-loop","execution-reports"]
  },
  "implied-matching": {
    s: "Matching that derives prices for spread or combination instruments from the individual outright books, and the reverse, so liquidity in one book appears in the other.",
    d: "A spread order trades two or more legs together at a net price. Implied matching constructs synthetic orders: a buy of the spread plus an outright order can imply a price in another leg. The engine maintains implied prices as outright books change and matches in a way that both legs execute atomically. It is hard because the implied book is derived state that must update on each change, because legs may sit in different partitions, and because it can create cycles of derived prices.",
    k: ["Compute implied prices incrementally vs. on demand: incremental keeps match time low but adds work to every outright update, while on-demand is cheaper in updates and slower in matching.", "Keep legs in one partition vs. coordinate across partitions: one partition keeps atomicity trivial, while coordination spreads load and adds protocol."],
    p: ["Implied depth is published but is no longer executable once a leg changes, and members see phantom liquidity.", "A cyclic combination produces an implied price that implies itself."],
    v: "Rest outright orders that imply a spread price, trade the spread, and confirm all legs fill at the implied prices atomically, and that the implied depth disappears from the feed immediately afterwards.",
    dep: ["instrument-partitioning","matching-loop","price-level-index"]
  },
  "execution-reports": {
    s: "The messages telling a member what happened to its order: accepted, rejected, partially filled, filled, canceled or expired, each with exact quantities and prices.",
    d: "The matching loop emits typed events as it works, and the output stage turns them into per-member reports sent through the owning gateway. Each report has the order id, the client id, cumulative quantity, remaining quantity, last fill price and a venue timestamp. Reports for one order are ordered, and a fill report precedes the market data for the same trade or follows it according to published policy. It is hard because members rebuild their positions from this stream, so a missing or reordered report becomes a position error.",
    k: ["Report before publishing market data vs. after: reporting first gives members their fills earliest, while publishing first treats the public feed as the primary record.", "One report per fill vs. batched: per-fill is exact and chatty, while batching reduces load and delays fills."],
    p: ["A report is generated but lost between the core and the gateway, and the member believes the order is still working.", "Reports for a canceled and a filled order cross in the gateway queue and arrive out of order."],
    v: "Replay a day and reconcile each member's reports against the trade capture: sum of fills, final status and prices must match for every order, with report order monotonic per order.",
    dep: ["gateway-core-link","logical-time","identifier-generation"]
  },
});
