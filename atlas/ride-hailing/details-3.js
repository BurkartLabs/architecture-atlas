// Details for the ride-hailing plate, part 3: pricing, incentives, fraud, trip state machine.
ATLAS.details("ride-hailing", {
  "upfront-pricing": {
    s: "Quotes a fixed price before the rider confirms, computed from predicted route, time, demand level and rules, then honored even if the trip takes longer.",
    d: "At quote time the system estimates distance and duration, applies the base fare rules and the current demand multiplier, adds fees and discounts, and returns a price valid for a few minutes. The quote id is stored on the trip. At completion the quoted price is charged unless the route changes materially. It is hard because the platform carries the risk of a bad estimate, and because every request triggers a quote, including many that never become trips.",
    k: ["Upfront price vs metered fare: upfront gives the rider certainty and puts estimation risk on the platform; metered is simple and surprises the rider.", "Short quote validity vs long: short keeps price tied to conditions and annoys riders who hesitate; long is friendly and can be exploited."],
    p: ["Estimated route is much shorter than actual because of an unseen closure, and every such trip loses money.", "Quotes differ between screens because two services use different estimates."],
    v: "Compare quoted and meter-equivalent fares across a week of completed trips, and confirm the average gap and the share of large losses are within the platform's target.",
    dep: ["fare-components", "surge-computation", "eta-model"]
  },
  "fare-components": {
    s: "The rules that build a fare: base amount, per-distance and per-time rates, minimum fare, tolls, airport and service fees, taxes and rounding, by vehicle class and city.",
    d: "Rates and fees are data in the city configuration, versioned, and combined by a pricing function that must give identical results for a quote, for a final fare and for a refund recomputation. Components are itemized on the receipt. Special cases include waiting time, extra stops and cancellations. It is hard because rounding and tax rules differ by place, and any difference between quote-time and charge-time logic becomes a payment dispute.",
    k: ["One shared pricing library vs per-service implementations: shared gives identical numbers everywhere and couples every service to a release; separate copies drift.", "Itemized components vs a single total: itemizing explains the fare and supports tax and disputes; a total is simpler and opaque."],
    p: ["Rounding is done at each step in one service and at the end in another, causing a one-cent mismatch on every trip.", "A new fee is added to the quote and not to the final fare."],
    v: "Feed 10,000 sampled trips through quote, final fare and refund paths and confirm all three produce identical itemized totals, to the cent, for every city.",
    dep: ["city-config-and-launch", "tax-and-currency"]
  },
  "surge-computation": {
    s: "Calculates a price multiplier per zone from the balance of requests and available drivers, raising prices when demand exceeds supply to draw drivers and moderate demand.",
    d: "Per zone and minute, the system compares open requests with available drivers, adding forecast demand and supply for the near future. The imbalance is mapped through a function to a multiplier within a cap. The multiplier is applied to new quotes only. It is hard because a higher price both reduces demand and attracts supply, with delay, so a naive controller oscillates, and because the multiplier has political and legal consequences in emergencies.",
    k: ["Reactive to current imbalance vs forecast-based: reactive is simple and always late; forecast-based acts early and is wrong when forecasts are.", "Zone-level multiplier vs per-request personalized price: zone-level is transparent and consistent; per-request can be more efficient and raises fairness and legal concerns."],
    p: ["A small number of drivers in a zone swings the multiplier wildly, and riders see the price flicker.", "Surge stays on after the event has ended because the signal lags."],
    v: "Inject a synthetic demand spike into a test zone and confirm the multiplier rises within the response time, stays within the cap, and falls back as the injected demand ends without oscillating.",
    dep: ["stream-processing", "demand-forecasting", "geofences-and-zones"]
  },
  "surge-smoothing": {
    s: "Dampens the multiplier over time and space so prices change gradually, adjacent zones do not differ by large jumps, and riders and drivers can trust what they see.",
    d: "Raw multipliers are filtered with limits on rate of change, spatial blending with neighbors, and hysteresis that avoids flipping across a threshold. Displayed multipliers are rounded to steps. Special caps apply during declared emergencies. It is hard because smoothing delays real response, and because spatial blending moves price across a boundary where drivers can be one block away from a higher price.",
    k: ["Strong smoothing vs fast response: strong is calm and slow to correct a shortage; fast corrects quickly and looks erratic.", "Spatial blending vs sharp zone borders: blending avoids a driver-gaming cliff and spreads price into zones without the shortage."],
    p: ["Drivers wait at a zone border for the higher price, and leave the zone that needs them.", "Smoothing is tuned in a calm period and hides a real shortage during a storm."],
    v: "Replay a day of raw multipliers through the smoothing step and confirm the maximum change per minute and the neighbor difference never exceed their limits, while a true sustained shortage still reaches the target price.",
    dep: ["surge-computation", "price-regulation"]
  },
  "pricing-experiments": {
    s: "Tests changes to rates, fees and multiplier functions on parts of the marketplace, measuring effects on conversion, supply, margin and fairness.",
    d: "Pricing experiments assign cities, time slices or user cohorts to variants and measure request conversion, acceptance, driver earnings, cancellations and platform margin. Because price changes shift both sides of the market, switchback designs and long observation windows are common. Guardrails stop a variant that hurts drivers or breaks a regulation. It is hard because price is visible and sensitive, and differing prices for similar users raise fairness and legal questions.",
    k: ["Randomize by rider vs by city and time: by rider is powerful and visible to people comparing prices; by city and time is cleaner and slow and coarse.", "Optimize margin vs optimize long-term retention: margin shows quickly and can erode trust; retention is slow to measure and protects the business."],
    p: ["Two riders standing together see different prices and post screenshots.", "A short experiment captures the first-week novelty effect and misses the long-run response."],
    v: "Run a price change in a test switchback, and confirm quotes shown match the assigned variant, measured conversion differences are logged per variant, and the guardrail halts the test when its threshold is crossed in simulation.",
    dep: ["experimentation-platform", "upfront-pricing"]
  },
  "promotions-and-credits": {
    s: "Discount codes, referral credits and rider wallets: how they are issued, applied against a fare, funded and expired, with the rules that stop them being abused.",
    d: "A promotion has an audience, a value, limits per user and total, an expiry and a funding source. At fare time the system applies eligible credits in a defined order, records the redemption, and tracks cost to the budget. Referral programs link accounts. It is hard because promotions interact with each other and with surge, because they are the largest target of fraud, and because refunds must restore credits correctly.",
    k: ["Discount at quote vs credit at charge: discount at quote shows the rider the real price; credit at charge is simpler and shows a price that does not match what is paid.", "Per-user limits via account vs via device and payment: account limits are simple and easy to dodge; stronger identity signals catch more abuse and block shared households."],
    p: ["A promotion code posted publicly is redeemed by thousands of new accounts before limits trigger.", "A refund returns money to the card and not the credit, so the credit is lost."],
    v: "Apply a stacked promotion and a wallet credit to a test fare, and confirm the amounts match the stacking rules, the budget counter moves once, and a full refund restores both.",
    dep: ["fare-components", "promo-abuse-detection", "earnings-ledger"]
  },
  "price-regulation": {
    s: "Enforces legal limits on pricing: caps on multipliers, minimum earnings rules, emergency freezes, mandated fee disclosures and audit records of every price shown.",
    d: "City rules are expressed as configuration that the pricing path checks: maximum multiplier, minimum per-minute or per-mile driver pay, required fee breakdown and emergency price caps triggered by official declaration. Every quote and its inputs are logged for audit. It is hard because rules differ by jurisdiction and change with little notice, and because noncompliance can mean fines or loss of the operating license.",
    k: ["Rules as configuration vs hard-coded per city: configuration changes quickly and is easy to misconfigure; code is reviewed and slow to change.", "Enforce at pricing vs verify after the fact: enforcement prevents violations and adds latency and failure points; after-the-fact checks are cheap and can only detect."],
    p: ["An emergency cap is enabled in the config and a cached service still applies the old multiplier for an hour.", "Audit logs record the final price and not the inputs, so a regulator's question cannot be answered."],
    v: "Declare a test emergency cap and confirm new quotes in the city are limited within the propagation target and the audit log shows each affected quote with its inputs.",
    dep: ["city-config-and-launch", "local-regulation"]
  },
  "driver-pay-model": {
    s: "Defines what the driver earns for a trip, such as a share of the fare or an independently computed amount from time and distance, plus minimums and adjustments.",
    d: "Pay can be a percentage of the rider fare or a separate formula, with the platform's margin as the difference. It includes components for time, distance, waiting, surge share, tolls and minimums, and passes through tips. The driver sees an estimate at offer time and a final amount after the trip. It is hard because decoupling pay from price lets the platform optimize each separately and makes the difference visible, which raises transparency concerns.",
    k: ["Fixed percentage of the fare vs independent pay formula: a percentage is simple and tracks price; an independent formula lets pay follow driver cost and opens a perceived gap.", "Show earnings at offer vs after: showing helps drivers decide and reveals the platform's choices; after the trip hides them and increases dissatisfaction."],
    p: ["Estimated earnings in the offer differ materially from the final pay, and drivers stop trusting the number.", "A pay formula update changes earnings for thousands of drivers without notice."],
    v: "Recompute pay for 5,000 completed trips from the formula and trip facts and confirm the amounts match the ledger exactly, and that estimates at offer time are within the stated tolerance.",
    dep: ["fare-components", "city-config-and-launch"]
  },
  "quest-bonuses": {
    s: "Rewards for completing a number of trips within a period or during targeted hours, announced to drivers and paid when the condition is met.",
    d: "A campaign defines eligibility, a target, a window, a reward and a budget. Progress is computed from the trip event stream and shown in the driver app. When the target is met, the reward is posted to the earnings ledger. Campaigns are targeted by city, time and driver segment. It is hard because bonuses change driver behavior in ways that create their own problems, such as cherry-picking short trips and rejecting others to hit the target.",
    k: ["Trip-count targets vs earnings targets: counts are easy to understand and encourage low-value short trips; earnings targets are fairer and harder to explain.", "Broadcast to all vs targeted segments: all is transparent and expensive; targeted spends less and can feel arbitrary."],
    p: ["A target defined by trips completed counts a trip that is later cancelled or refunded, and the bonus is paid wrongly.", "Drivers complete trips in a loop with an accomplice to reach the target."],
    v: "Complete a series of test trips against a campaign and confirm progress updates after each, the reward posts once at the target, and a reversed trip reduces progress.",
    dep: ["earnings-ledger", "collusion-detection", "stream-processing"]
  },
  "earnings-guarantees": {
    s: "A promise of minimum earnings for a period or area, with the platform paying the shortfall, used to attract drivers during launches and low-demand times.",
    d: "A guarantee sets a minimum hourly or period amount conditional on being online, accepting most offers and staying in a zone. At the end of the period the system compares earnings to the minimum and posts a top-up. Conditions are tracked from presence and trip events. It is hard because the conditions need precise definitions, because it can pay drivers to be online without working, and because it is expensive.",
    k: ["Condition on acceptance rate vs only on availability: acceptance conditions force service and punish drivers who decline poor trips; availability alone is cheaper to track and invites idling.", "Per hour vs per period guarantees: per hour targets the hours needed and is complex; per period is simple and lets drivers choose when."],
    p: ["Drivers sit online in a guarantee zone declining everything and collect the top-up.", "Ambiguous terms about breaks produce thousands of support disputes."],
    v: "Run a simulated driver through a guarantee window with known idle and busy periods, and confirm the top-up equals the documented formula, with conditions failed correctly when presence data shows a gap.",
    dep: ["earnings-ledger", "driver-presence"]
  },
  "positioning-incentives": {
    s: "Targeted payments or boosts that draw idle drivers to areas expecting a shortage, based on forecasts and aimed at moving supply early.",
    d: "For zones where forecast demand exceeds forecast supply, the system offers selected idle drivers a bonus for entering and staying, or a boost on trips starting there. Selection considers distance, past behavior and the number needed. Payment depends on arrival and activity in the zone. It is hard because incentives must be sized to produce the needed number of drivers and no more, and because the response is uncertain.",
    k: ["Pay for arrival vs pay for completed trips there: arrival moves drivers and can be gamed; completed trips pays only for work and moves fewer.", "Broadcast to everyone nearby vs choose specific drivers: broadcast is simple and risks oversupply; selection controls the count and needs a response model."],
    p: ["Too many drivers respond, the zone is oversupplied, and the incentive spent produced idle time.", "Drivers learn the pattern and deliberately leave a zone to be paid to return."],
    v: "Offer an incentive for a zone with a measured shortage and confirm the number of drivers arriving within the window matches the target within tolerance, with wait times for riders falling.",
    dep: ["demand-forecasting", "supply-forecasting", "earnings-ledger"]
  },
  "earnings-ledger": {
    s: "The double-entry record of money owed to each driver: fares, bonuses, tips, fees, adjustments and payouts, with every entry traceable to an event.",
    d: "Each trip completion, bonus, tip, refund and fee posts balanced entries with a reason and a source event id. Balances are derived from entries, and nothing is edited in place: corrections are new entries. Payout reads the ledger to pay what is owed. It is hard because it must tolerate duplicate events, late adjustments and reversals while staying consistent, and because drivers watch it closely and check it against their own records.",
    k: ["Append-only entries vs mutable balances: append-only gives audit and exact reconstruction at the cost of more storage; mutable balances are simple and lose history.", "Post immediately vs batch end of day: immediate lets drivers see earnings live and multiplies write volume; batching is cheaper and delays feedback."],
    p: ["A duplicated trip event posts earnings twice and the error is paid out.", "A bonus is posted to the wrong currency account in a multi-country driver's profile."],
    v: "Replay a day of trip events twice and confirm balances equal a single replay, and that the sum of all driver entries plus platform entries is zero across the ledger.",
    dep: ["event-bus", "driver-pay-model"]
  },
  "tips": {
    s: "Optional extra money from rider to driver after the trip, collected and paid with fees and rules that vary by city and payment method.",
    d: "After a trip the rider may add a tip within a time window. The tip is charged separately or added to the fare, recorded in the ledger as driver money not subject to platform commission, and shown to the driver. It is hard because tips arrive after the trip is closed, must reuse payment methods that may have changed, and because their handling may be restricted by law or by payment rules.",
    k: ["Tip after the trip vs before: after is less pressured and often not given; before is more frequent and feels coerced.", "Pass through fully vs deduct fees: full pass-through builds trust and the platform absorbs payment cost; deducting is simpler to fund and criticized."],
    p: ["A tip is charged to an expired card and the driver is shown it as paid.", "The tip window closes before the rider has opened the receipt, and a late tip cannot be processed."],
    v: "Add a tip after trip close and confirm a separate charge is captured, the full tip appears in the driver ledger, and a failed charge produces a visible failed status for both sides.",
    dep: ["fare-capture", "earnings-ledger"]
  },
  "risk-scoring": {
    s: "A real-time service that returns a risk score and recommended action for an event, such as sign-up, payment, promotion redemption or payout, from models and rules.",
    d: "Events carry device, account, payment, location and behavior features. The scoring service combines rules for known patterns and models for subtle ones, returns allow, challenge or block with reasons, and logs every decision. Challenges include extra verification. It is hard because decisions are on the request path and have tight latency limits, because attackers adapt, and because false positives block legitimate drivers from earning.",
    k: ["Rules vs learned models: rules are explainable and quick to deploy against a new attack and get stale; models find subtle patterns and are opaque and slower to react.", "Block vs challenge on uncertainty: blocking is safe for the platform and harms real users; challenges keep good users and add friction and drop-off."],
    p: ["A new model raises false blocks in one city, and thousands of drivers cannot go online until it is rolled back.", "Labels come from past blocks only, so the model learns the old rules instead of fraud."],
    v: "Replay labeled historical fraud and good events and confirm detection and false-positive rates meet targets, and that p99 scoring latency stays under the budget at peak.",
    dep: ["feature-store", "event-bus"]
  },
  "location-spoofing-detection": {
    s: "Detects drivers or riders who fake their GPS position to claim surge, bonuses or fake trips, using sensor consistency, device integrity and movement plausibility.",
    d: "Checks compare reported position with network-derived location, motion sensors, cell and wireless environment, impossible jumps, perfectly smooth paths and signs of mock-location software or rooted devices. Suspicious sessions get a lower trust score or a challenge such as a live selfie. It is hard because it is an arms race against spoofing tools, and because legitimate causes such as tunnels or old phones produce similar anomalies.",
    k: ["Device attestation vs behavioral analysis: attestation is strong on supported devices and absent on others; behavioral analysis works anywhere and has more false positives.", "Detect and flag vs prevent in the app: prevention in the client is easy to defeat; server-side detection is slower and harder to tamper with."],
    p: ["Drivers in a dense district appear to jump around because of signal reflections and are marked as spoofers.", "A published detection rule is quickly circumvented by new spoofing tools."],
    v: "Run known mock-location tools against a test fleet and confirm they are flagged within the target time, while recorded legitimate tunnel and parking-structure traces are not.",
    dep: ["gps-quality-filtering", "risk-scoring", "device-location-sdk"]
  },
  "payment-fraud": {
    s: "Detects stolen cards, chargeback patterns and payment abuse such as repeated disputes, using card, device and trip signals before and after the charge.",
    d: "At sign-up and each trip the system evaluates payment details against known bad patterns, velocity of new cards, mismatched geography and device history. After the charge it tracks chargebacks and disputes and links them to accounts. Confirmed fraud trains models and updates block lists. It is hard because labels arrive weeks later, as chargebacks, and because cash and account sharing complicate attribution.",
    k: ["Verify at sign-up vs at first ride: sign-up verification is clean and loses conversions; first-ride verification is smooth and takes risk on one trip.", "Auto-block on chargeback vs review: auto-block stops losses and punishes honest disputes; review is fair and slow."],
    p: ["Fraud rings use many new cards each for a small number of trips, and per-card rules never trigger.", "Chargeback labels arrive a month late, so the model is always a month behind."],
    v: "Check that a test of tokenized cards flagged as stolen is rejected at authorization, and that a month of confirmed chargebacks is linked back to the originating accounts in the case system.",
    dep: ["risk-scoring", "authorization-hold", "payment-methods-vault"]
  },
  "account-takeover": {
    s: "Detects and stops control of an account by someone else, especially drivers' accounts, where payouts can be redirected to a new bank account.",
    d: "Signals include a login from a new device, a changed phone or email, a changed payout destination and unusual activity. Risky changes trigger step-up verification and a delay on payouts to new destinations. A recovery flow lets real owners regain control. It is hard because the same changes happen legitimately when a person gets a new phone, and because the damage, redirected earnings, is immediate and hard to reverse.",
    k: ["Delay payouts after a change vs pay immediately: delay gives time to catch takeovers and frustrates honest drivers who changed banks; immediate is friendly and unrecoverable.", "SMS verification vs stronger methods: SMS is universal and can be intercepted; stronger methods are safe and need devices some users lack."],
    p: ["Attackers change the payout account and cash out within one payout cycle.", "A recovery flow is weaker than the login flow and becomes the way in."],
    v: "Change the payout destination on a test account from a new device and confirm step-up verification is required, the first payout is held for the configured delay, and the old destination is notified.",
    dep: ["risk-scoring", "identity-verification", "driver-payouts"]
  },
  "collusion-detection": {
    s: "Finds rings of drivers and riders who stage trips to collect bonuses, promotions or surge, by looking for unusual connections in trip and device graphs.",
    d: "A graph links accounts through shared devices, payment methods, repeated pairing of the same rider and driver, trips with no real route, and synchronized timing. Community detection and anomaly scoring surface clusters for review. It is hard because repeat pairings are normal for commuters and regular customers, and because colluders learn the thresholds and spread activity.",
    k: ["Graph analysis vs per-account rules: graphs find coordinated behavior and are heavy to compute and explain; per-account rules are fast and miss rings.", "Act on clusters vs on individuals: acting on clusters stops a ring quickly and punishes innocent members; acting on individuals is fair and slow."],
    p: ["Regular commuters and their usual driver are flagged because their pairing is frequent.", "A ring splits activity across many accounts to stay under each rule."],
    v: "Seed a test dataset with known staged rings among normal traffic and confirm the detector surfaces them, with a false-positive rate on regular commuters below the target.",
    dep: ["risk-scoring", "analytics-warehouse", "quest-bonuses"]
  },
  "promo-abuse-detection": {
    s: "Identifies accounts that exploit promotions, such as multiple accounts for one person, referral loops and redeeming codes through resold credentials.",
    d: "It correlates device identifiers, payment instruments, contact details and behavior across accounts to find duplicates, and watches redemption velocity per code. Responses range from denying a specific promotion to closing accounts. It is hard because households share devices and cards legitimately, because privacy rules limit which signals can be linked, and because promotional budgets are exhausted quickly by organized abuse.",
    k: ["Strict one per person rules vs tolerant rules: strict protects budgets and blocks families; tolerant is friendly and leaks money.", "Deny at redemption vs claw back later: denying is immediate and visible to the abuser; clawback catches more and is harder to collect."],
    p: ["A shared device in a student dormitory blocks hundreds of legitimate users from a welcome offer.", "Redemption velocity limits are applied per code and not per attacker, so a new code resets them."],
    v: "Create a set of test accounts sharing a device and payment method and confirm only the first receives the welcome credit, while distinct households using the same office network are not blocked.",
    dep: ["risk-scoring", "promotions-and-credits"]
  },
  "fraud-case-management": {
    s: "Tools for analysts to review flagged accounts and trips, see the evidence, take actions and feed outcomes back into rules and models.",
    d: "Flagged events create cases with the account's history, linked accounts, maps, payment details and model reasons. Analysts decide, apply actions such as warnings, holds or bans, and add a label. Common patterns become automated rules. Actions are logged with reasons for appeal. It is hard because analyst time is limited, because decisions affect people's income, and because the labels analysts produce are the training data and carry their biases.",
    k: ["Manual review of every flag vs automation with sampling: full review is accurate and does not scale; sampling scales and risks mistakes unnoticed.", "Single analyst decision vs second review for severe actions: single is fast; second review prevents wrongful bans and slows the response."],
    p: ["Cases have no reasons attached, and an appeal cannot be evaluated.", "A backlog grows until flagged fraudulent accounts keep operating for weeks."],
    v: "Open a flagged test case, confirm the evidence view shows linked accounts and the model's reasons, take an action, and confirm the decision, the actor and the label appear in the audit log and the training set.",
    dep: ["risk-scoring", "deactivation-and-appeals"]
  },
  "trip-state-machine": {
    s: "The authoritative definition of a trip's states and allowed transitions, from requested through matched, arrived, in progress and completed or cancelled.",
    d: "A trip moves through requested, offered, assigned, driver arriving, arrived, in progress, dropped off, completed, and the terminal cancelled or failed states. Each transition has guards (who may cause it, what must be true) and effects (events published, timers started, charges triggered). Transitions are applied atomically with a version check. It is hard because many actors, the rider, the driver, timers and operators, can push events concurrently and out of order.",
    k: ["One central state machine service vs state spread across services: central gives a single truth and a shared dependency; spread is resilient and creates disagreement.", "Strict transitions vs permissive recovery: strict prevents impossible histories and strands trips on a missed event; permissive heals but allows nonsense."],
    p: ["A driver's late arrival event arrives after the rider cancelled, and the trip moves back to an active state.", "A new state is added and a downstream consumer treats it as unknown and drops the trip."],
    v: "Send every pair of states with an event and confirm only the documented transitions succeed, and that concurrent conflicting events, such as cancel and start together, resolve to exactly one outcome.",
    dep: ["trip-event-log", "trip-store"]
  },
  "trip-event-log": {
    s: "An append-only record of every event and state change of a trip, with times and actors, from which the current state and any past state can be reconstructed.",
    d: "Each transition writes an event with the trip id, sequence number, type, actor, and relevant data such as position and price. Current state is a projection; other services subscribe to the same log. It supports disputes, support investigations, payment calculation and analytics. It is hard because events must be written together with the state change or the two disagree, and because the schema must evolve over years of history.",
    k: ["Event sourcing vs current state with an audit table: event sourcing makes history the truth and is more complex to query; audit tables are simple and can diverge from the state.", "Fine-grained events vs summary events: fine-grained supports any later question and costs storage; summaries are cheap and answer fewer questions."],
    p: ["The state update commits and the event publish fails, so payments never learn the trip ended.", "Event timestamps use phone clocks and appear out of order in a dispute."],
    v: "Take a completed trip, rebuild its state from the event log alone, and confirm it equals the stored final state, including fare inputs and timestamps.",
    dep: ["event-bus"]
  },
  "trip-timers": {
    s: "Deadlines attached to trip states: offer expiry, driver arrival wait, no-show cancellation, scheduled dispatch and stuck-trip detection.",
    d: "When a trip enters a state, timers are registered with a due time and an action. A scheduler delivers expirations, which must be durable across restarts and idempotent when delivered twice. The timer's action goes through the same state machine guards. It is hard because millions of timers are live at once, because clock differences distort durations, and because timer firing after the state has changed must do nothing.",
    k: ["Durable timer service vs in-memory timers: durable survives restarts and costs write load; in-memory is cheap and loses timers on a crash.", "Cancel timers on state change vs let them fire and check: cancelling saves work and risks leaks; check-on-fire is robust and simple."],
    p: ["A restart loses in-memory arrival timers and no-show fees are never applied.", "A timer fires twice and a rider is charged two cancellation fees."],
    v: "Start a trip with an arrival wait timer, restart the timer service, and confirm the timer still fires once at its due time and the no-show transition applies exactly once.",
    dep: ["trip-state-machine"]
  },
  "cancellations-and-fees": {
    s: "Rules for who may cancel when, what it costs, and who is compensated, depending on the trip state, elapsed time and fault.",
    d: "A cancellation request is evaluated against the state: free within a grace period, charged after the driver has traveled or waited, waived if the driver was late or the cause is a safety issue. Fees are split between the driver and the platform. Cancellation reasons are collected and feed quality scores. It is hard because fault is often unclear, and because the rules shape behavior: too lenient and drivers lose time, too strict and riders stop booking.",
    k: ["Time-based grace periods vs distance-based: time is simple to explain; distance-based reflects driver effort and needs reliable location.", "Automatic fee vs support review: automatic is consistent and wrong in edge cases; review is fair and expensive."],
    p: ["The driver is still far away when the rider cancels, and a fee is charged for a trip that barely began.", "Drivers pressure riders to cancel to avoid a poor trip and collect the fee."],
    v: "Cancel test trips at each state and elapsed time, and confirm the fee charged and driver compensation match the rule table in every cell.",
    dep: ["trip-state-machine", "fare-components", "fare-capture"]
  },
  "mid-trip-changes": {
    s: "Handling a rider who changes destination, adds a stop or ends early, repricing the trip and updating routing, the driver and any pooled passengers.",
    d: "A change request is validated against the state and zone rules, the new route and price are computed, and the rider confirms. The driver is notified and the navigation updated. The original quote is replaced or adjusted by a defined rule. In shared rides, other riders' ETAs are recomputed. It is hard because the change is made in a moving vehicle with limited attention, and because the price rule must be predictable.",
    k: ["Reprice the whole trip vs add an increment: whole repricing is consistent with a new quote and may seem larger; an increment is easy to explain and can be gamed.", "Driver approval required vs automatic: approval protects the driver and slows the change; automatic is smooth and can send a driver somewhere unsafe."],
    p: ["A destination change leaves the rider on the old quote, and the driver is paid for a longer trip than the rider is charged.", "A change in the last minute of a trip crashes the receipt calculation."],
    v: "Change a test trip's destination mid-trip and confirm the driver's route updates, a new quote is shown and accepted, the final fare equals the new quote, and the receipt lists both legs.",
    dep: ["trip-state-machine", "routing-engine", "upfront-pricing"]
  },
  "trip-recovery": {
    s: "Detects and repairs trips that are stuck or inconsistent after a crash, a lost connection or a failed message, so no trip stays open forever.",
    d: "Sweepers look for trips in a state longer than expected, such as an in-progress trip with no location for an hour or an assigned trip with an offline driver. They query the apps, apply safe transitions, notify support, and close what cannot be recovered at a defined policy. Rider and driver apps resync their state from the server on reconnect. It is hard because the right repair depends on what really happened in the car.",
    k: ["Aggressive auto-close vs support-led recovery: auto-close frees drivers and riders and may close a real trip early; support-led is accurate and slow.", "Server is truth vs device is truth after reconnect: server truth is consistent and can disagree with a phone that saw a later event; device truth reflects the car and is unverified."],
    p: ["A driver whose app crashed after dropoff is stuck on a trip and cannot receive offers.", "A sweeper closes a long but real trip and triggers an early charge."],
    v: "Kill the driver app mid-trip and confirm that after reconnect the app shows the correct state, and that a trip with no signals for the stuck limit is flagged and resolved by policy.",
    dep: ["trip-state-machine", "driver-presence", "trip-timers"]
  },
  "trip-receipt": {
    s: "The itemized summary sent to the rider and driver at the end: route, times, distance, fare components, fees, taxes, discounts and payment method.",
    d: "At completion the receipt service reads the final trip facts and fare computation, renders a document in the rider's language and currency, and sends it by app and email. A map of the route is included with limits on location detail. Fare adjustments after the fact produce an updated receipt. It is hard because receipts are legal documents in many places, because translations and formats vary, and because it must match the charge.",
    k: ["Generated at completion vs on demand: at completion is immutable and matches the charge; on demand can reflect corrections and may show something different from what was sent.", "Detailed route map vs approximate: detail helps disputes and reveals precise home addresses; approximate protects privacy and weakens evidence."],
    p: ["The receipt shows a total different from the charge because it was rendered before a promotion was applied.", "Receipts forwarded by email expose a home address to anyone who sees them."],
    v: "For a sample of 1,000 trips compare each receipt's total and components against the captured payment and confirm they match, and view a receipt in each supported locale.",
    dep: ["fare-components", "trip-event-log", "tax-and-currency"]
  },
  "trip-store": {
    s: "The durable database of trips and their current state, optimized for high write rate, lookup by trip, rider and driver, and survival of a region failure.",
    d: "Trips are keyed by id and partitioned for even load, with secondary lookups for the rider's active trip and the driver's active trip. Writes use version checks for the state machine. Recent trips live in the fast store; older ones move to archival storage. It is replicated across regions. It is hard because it is the system of record for money and safety, because it takes steady high-volume writes, and because its keys must not create hot partitions.",
    k: ["Time-ordered ids vs random ids: time-ordered help range queries and concentrate writes on one partition; random ids spread load and lose locality.", "Synchronous cross-region replication vs asynchronous: synchronous loses no trips on failover and adds latency to every write; asynchronous is fast and can lose the last seconds."],
    p: ["A hot partition during a big event slows trip writes and every dispatcher in the city.", "An index on the rider's active trip lags, and a rider can request a second trip while the first is still open."],
    v: "Write 1,000 trips per second for ten minutes, then fail one node and confirm no trip is lost, active-trip lookups remain correct, and write latency stays inside the budget.",
    dep: []
  },
});
