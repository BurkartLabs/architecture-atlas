// Details for the e-commerce platform plate, part 4: orders, fulfillment, fraud.
ATLAS.details("ecommerce-platform", {
  "order-model": {
    s: "The durable record of a purchase: lines with price and tax snapshots, addresses, payments, shipments, adjustments and the history of how it got to its current state.",
    d: "At placement the order captures an immutable snapshot of what was sold: names, prices, discounts, tax per line and addresses, so later catalog edits never rewrite history. Mutable parts, such as payment status, shipments and returns, are separate records linked to it. Adjustments are added as entries rather than edits. The order is read by support, finance, the customer portal and fulfillment. The hard part is sizing it for decades of reads and keeping a clean boundary between what is fixed and what evolves.",
    k: ["Snapshot of values vs references to live catalog records: snapshots keep history exact and duplicate data; references are compact and make old orders change when products do.", "Adjustments as new entries vs editing the order: entries keep an audit trail and require summing to see current state; edits are simple and lose history."],
    p: ["An order that references the live product price displays a different total after a sale ends.", "Support edits an order total directly and the payment, invoice and order no longer agree."],
    v: "Change a product's name, price and tax class after an order is placed and confirm the order, its invoice and its portal view still show the original values, with later changes appearing only as adjustments.",
    dep: ["audit-log"]
  },
  "order-state-machine": {
    s: "Defines the allowed states of an order and its parts, such as payment, fulfillment and return, and the transitions and guards between them.",
    d: "Rather than one status, an order keeps several coordinated state fields: payment, fulfillment and return status, each with its own transitions. A transition checks a guard, such as payment captured, then writes the new state and emits an event. Invalid transitions are rejected. External events, like carrier updates and payment callbacks, drive many transitions and can arrive late or twice. The challenge is making transitions idempotent and consistent, so retries and races never skip or duplicate effects such as capture or stock release.",
    k: ["Several independent state dimensions vs one status field: separate dimensions describe reality, like paid but partly shipped, and are more to keep consistent; one status is simple and explodes into combined states.", "Transitions as commands with guards vs direct state writes: commands protect invariants and require more code; direct writes are quick and let bad states in."],
    p: ["A late shipped event arrives after cancellation and the order moves to shipped, with refunded money.", "Retried transitions run the stock release twice and inflate availability."],
    v: "Feed a test order every event in random order, with duplicates, and confirm it ends in the same legal state as the ordered run, each side effect happened once and illegal transitions were rejected and logged.",
    dep: ["order-model", "event-bus", "idempotency-and-retries"]
  },
  "order-splitting": {
    s: "Divides one order into several shipments, or several fulfillment orders, by location, supplier, delivery date or item type, while keeping one customer-facing order.",
    d: "After routing decides where items ship from, the order is split into fulfillment groups, each with its own shipment, tracking, carrier cost and sometimes capture. The customer sees one order with several parcels. Totals, discounts, tax and shipping charges must be allocated correctly across groups, since returns and refunds work per group. Splits can change after the fact if an item is out of stock at the chosen location. The hard parts are the allocation of shared amounts and explaining the split to the shopper.",
    k: ["Split to minimize parcels vs to minimize delivery time: fewer parcels cut shipping cost and may delay everything; fastest split costs more and arrives piecemeal.", "Charge shipping once vs per parcel: once is what shoppers expect and absorbs cost; per parcel reflects reality and annoys customers."],
    p: ["Order-level discount is allocated to the first parcel only, so returning the others refunds the wrong amount.", "A re-split after a stock miss leaves a line in two groups and it ships twice."],
    v: "Place a multi-item order stocked in different locations and confirm shipments, shipping fees, discounts, tax and captured amounts for each group sum exactly to the order, with each line in exactly one group.",
    dep: ["fulfillment-routing", "order-model", "discount-stacking"]
  },
  "order-edits-cancellation": {
    s: "Lets staff or customers change an order after placement, such as address, items or cancellation, while the order is still early enough, adjusting payment, stock and tax.",
    d: "Edits are allowed until a lock point, often when a pick is released to the warehouse. An edit recalculates totals, adjusts the payment by capture, partial void or refund, updates the reservation, and notifies fulfillment. Cancellation releases stock and payment and may fail if the warehouse has already started. The request to the warehouse is asynchronous, so it can be accepted or refused later. The difficulty is the race with fulfillment, and money adjustments that must match what the shopper was told.",
    k: ["Allow edits until shipment vs lock early: late edits are customer friendly and force warehouse coordination; early lock is simple and frustrates shoppers.", "Cancel immediately and reverse later vs wait for warehouse confirmation: immediate gives an instant answer and may misreport shipped goods; confirmation is correct and slow."],
    p: ["A cancelled order ships anyway because the warehouse never received the cancel request.", "Address change after tax calculation leaves the old tax in place and the order is under-taxed."],
    v: "Request address changes and cancellations at each order stage, including after warehouse release, and confirm the outcome matches the stage rule, stock, payment and tax are adjusted, and the warehouse acknowledges.",
    dep: ["order-state-machine", "warehouse-handoff", "reservations", "refund-decisions"]
  },
  "returns-rma": {
    s: "Manages return requests from authorization through receipt and inspection, with eligibility windows, reasons, prepaid labels and the resulting stock disposition.",
    d: "A customer or agent starts a return against order lines. Rules check window, condition and category, and issue a return authorization with instructions or a label. When the parcel arrives, it is inspected and graded, and each item is restocked, sent to outlet, repaired or scrapped. Only then, or earlier for trusted customers, is money released. Exchanges create a new order. The difficulty is the physical side: the platform's record depends on warehouse reports, and return abuse needs limits without hurting honest buyers.",
    k: ["Refund on receipt vs on label scan: on receipt prevents loss and delays money; on scan is customer friendly and exposes the seller to empty boxes.", "Auto-approve returns vs review each: auto-approve is cheap and scales; review catches abuse at a cost and makes honest customers wait."],
    p: ["A return is restocked as sellable without inspection and a damaged item goes to the next buyer.", "Serial returners are not detected because returns are counted per order, not per customer."],
    v: "Run returns for sellable, damaged and missing-part items and confirm each reaches the right disposition, stock changes as expected, and the refund triggers at the configured point for the amount allowed.",
    dep: ["order-state-machine", "warehouse-handoff", "refund-decisions", "stock-ledger"]
  },
  "refund-decisions": {
    s: "Decides how much to return and in what form, such as original payment, store credit or exchange, and carries out the refund through payment, tax and accounting.",
    d: "A refund is computed from the returned lines, with their allocated discount, tax and a share of shipping where policy allows, capped by what was actually captured. It is issued to the original payment method, or as credit if the method has expired or by customer choice. Each refund references the order and creates a credit note and a ledger entry. Partial and multiple refunds must never exceed the total paid. Providers refund asynchronously, and the status must be tracked.",
    k: ["Refund to original method vs store credit: original is expected and lets money leave; credit retains revenue and needs customer consent and liability tracking.", "Automatic calculation vs staff-entered amount: automatic is consistent and exact; manual handles goodwill and invites mistakes and fraud."],
    p: ["Two agents refund the same line at once and the order is refunded for more than was paid.", "Refunds computed without the discount allocation return the undiscounted price."],
    v: "Issue partial, repeated and concurrent refunds on a discounted, taxed order, and confirm the total refunded never exceeds what was captured, each credit note matches, and the provider shows matching refunds.",
    dep: ["order-model", "payment-orchestration", "invoicing-and-tax-reporting", "idempotency-and-retries"]
  },
  "recurring-orders": {
    s: "Creates orders automatically on a schedule for subscriptions and replenishment, charging saved methods and handling skips, changes and failed payments.",
    d: "A subscription record stores items, interval, next date, address and payment token. A scheduler creates each cycle's order using current prices and stock rules, charges the saved method, and fires fulfillment. Customers can skip, swap, pause or cancel. Failed payments trigger a retry schedule and messages, known as dunning, before the subscription lapses. The hard parts are the scheduler at scale, since millions of subscriptions renew on the first of the month, and rules for price changes and out-of-stock items at renewal.",
    k: ["Spread renewals over the day vs all at the start: spreading smooths load and makes charges arrive at odd times; bunching is simple and creates a daily spike.", "Honor the signup price vs reprice at renewal: honoring builds trust and costs margin as prices rise; repricing is accurate and prompts cancellations."],
    p: ["A scheduler restart processes the same renewal twice and charges customers twice.", "A renewal for an item out of stock silently skips and the customer is not told."],
    v: "Run a month of simulated renewals including failed cards, skips and out-of-stock items, and confirm each subscription yields exactly one order per cycle, dunning follows its schedule and customers receive the right notices.",
    dep: ["saved-payment-methods", "order-placement", "idempotency-and-retries", "strong-customer-authentication"]
  },
  "fulfillment-routing": {
    s: "Chooses, for each order line, which warehouse, store or supplier fulfills it, balancing cost, speed, stock and capacity.",
    d: "Given the destination, delivery promise and stock by location, the router scores candidate sources by shipping cost, transit time, handling capacity and rules like keeping lines together or protecting store stock. It outputs fulfillment assignments, possibly splitting the order. Rules are configured by priority and can change during peaks, such as shifting work from an overloaded warehouse. The routing decision happens at order time, with a reroute if the location cannot ship. The difficulty is optimizing across conflicting goals with stale stock data.",
    k: ["Rule-based priorities vs cost optimization: rules are explainable and easy to change; optimization finds cheaper plans and is harder to debug and trust.", "Route at order time vs defer until the pick: early routing gives certainty to promise and stock; deferred routing uses fresher data and delays the answer."],
    p: ["Routing sends an order to a location whose stock was already picked for another order.", "A closed or overloaded warehouse stays in the rules and orders pile up unshipped."],
    v: "Run a batch of historical orders through the router and compare cost, delivery time and split rate against the previous rules, and confirm every assignment is to a location with actual stock and open capacity.",
    dep: ["multi-location-stock", "delivery-promise", "carrier-integration", "order-splitting"]
  },
  "warehouse-handoff": {
    s: "Sends fulfillment requests to warehouse systems and receives their confirmations, short picks, shipments and returns, mapping them back to orders.",
    d: "Each routed group becomes a message to the warehouse system, by API, file or queue, with items, quantities, address, service level and gift or packing instructions. The warehouse answers with acceptance, shortages, packed and shipped events with tracking. The platform matches those to its orders and updates states and stock. The warehouse's own picking and slotting are outside this platform. The difficulty is the unreliable handoff: messages are duplicated or lost, and the two systems must agree on every unit's location in the process.",
    k: ["Platform pushes orders vs warehouse pulls them: push is immediate and needs retry logic and backpressure; pull lets the warehouse pace itself and delays visibility.", "Event confirmations only vs periodic status reconciliation: events are timely and can be lost; reconciliation catches gaps and is delayed."],
    p: ["An order message is lost and the order sits in released state for days with no one checking.", "A short pick is reported and no one is told, so the customer waits for a full order that is partial."],
    v: "Drop, duplicate and delay messages in both directions in staging, and confirm every order eventually matches the warehouse state, stuck orders are flagged within the limit and short picks produce a customer-visible update.",
    dep: ["fulfillment-routing", "event-bus", "integration-connectors", "order-state-machine"]
  },
  "shipment-creation": {
    s: "Records each parcel of an order, with contents, weight, carrier service and tracking number, and triggers payment capture and customer notification.",
    d: "When the warehouse confirms packing, the platform creates a shipment tied to order lines and quantities. A label is obtained from the carrier integration, giving a tracking number, or the warehouse's number is recorded. The shipment moves the order's fulfillment state, triggers capture for shipped value, reduces committed stock and sends a shipping notification. Partial shipments are normal. The difficulty is maintaining the invariants: each unit ships once, quantities never exceed ordered amounts, and the money, stock and message steps do not repeat on retry.",
    k: ["Create the shipment on pack vs on carrier scan: on pack tells customers sooner and may precede an actual handoff; on scan is truthful and later.", "Capture on shipment creation vs on carrier acceptance: early capture is simpler and risks charging for lost handoffs; later is accurate and slower."],
    p: ["A retried shipment confirmation creates a second shipment and captures the money twice.", "Shipped quantity exceeds ordered quantity because lines were edited meanwhile."],
    v: "Send duplicate, partial and over-quantity shipment confirmations for a test order and confirm only valid quantities are recorded once, capture equals shipped value and the customer gets one notice per parcel.",
    dep: ["warehouse-handoff", "carrier-integration", "authorize-and-capture", "order-state-machine"]
  },
  "carrier-integration": {
    s: "Connects to carriers for rates, labels, pickups, address checks and tracking through their APIs, behind one internal interface.",
    d: "An adapter per carrier translates a common shipment request into the carrier's format and returns rates, labels and tracking identifiers. The layer manages credentials per merchant account, service-level mapping, customs documents and rate limits, and handles carrier outages with queues and fallbacks. Carrier systems differ in what they support and how they report errors. The challenge is the number of variants and the unreliability of external APIs, which are a dependency in both the checkout and the warehouse.",
    k: ["One abstraction over carriers vs direct integration per use case: an abstraction cuts duplication and hides carrier-specific features; direct is flexible and repetitive.", "Own carrier accounts vs a shipping aggregator: own accounts give best rates and many integrations to maintain; an aggregator is quick and adds margin and a dependency."],
    p: ["A carrier API change breaks label creation, and the warehouse cannot ship until a fix is deployed.", "Service-level names are mapped wrongly, and expedited orders go by the economy service."],
    v: "Create labels for each supported service and destination type in carrier test mode, then confirm tracking numbers are returned and retrievable, and an unavailable carrier falls back to its configured alternative.",
    dep: ["shipment-creation", "shipping-rate-quoting", "duties-and-landed-cost"]
  },
  "tracking-ingest": {
    s: "Collects tracking events from carriers by webhook or polling, normalizes them to a common set of statuses, and updates orders and customer messages.",
    d: "Carriers report scans in their own codes and formats, with unreliable timing. Events are received by callback or by polling shipments that are in transit, mapped to statuses such as in transit, out for delivery, delivered and exception, and deduplicated by shipment and time. The order's fulfillment state advances on delivery. Exceptions create tasks or messages. Delivered events also start the returns window and review requests. The hard parts are out-of-order scans, false delivered scans and polling at scale.",
    k: ["Webhook from carrier vs polling: webhooks are timely and need a public endpoint and gap handling; polling is controlled and costs calls and delay.", "Show raw carrier events vs normalized statuses: raw detail is complete and confusing; normalized is clear and can hide a useful nuance."],
    p: ["A delivered scan arrives for a parcel that was not delivered and the customer is told it arrived.", "Polling thousands of in-transit parcels every few minutes exhausts a carrier's rate limit."],
    v: "Replay a real sequence of carrier events including duplicates, out-of-order scans and an exception, and confirm the final normalized status and notifications match the true sequence, with each message sent once.",
    dep: ["carrier-integration", "order-state-machine", "event-bus"]
  },
  "delivery-promise": {
    s: "Calculates the delivery date shown to the shopper from stock location, order cut-off, handling time, carrier transit and calendars, and monitors whether it is kept.",
    d: "For each item and destination, the promise adds handling time at the best source, transit time for each carrier service, cut-off times, weekends and holidays to estimate an arrival window. It appears on product pages, in the cart and at checkout, and gets stored on the order. Actuals feed back to tune transit estimates. Backordered or multi-shipment orders show several dates. The challenge is accuracy and cost: a promise that is too optimistic drives complaints, too pessimistic loses conversion, and computing it for every listing item is heavy.",
    k: ["Computing precisely per item and address vs coarse estimates by region: precise promises are credible and expensive to compute; coarse ones are cheap and less accurate.", "Promise the median vs the 95th percentile transit time: median looks attractive and is late half the time; the 95th percentile is reliable and less competitive."],
    p: ["Promise ignores a carrier's holiday closure and every order in the period is late.", "The date on the product page differs from the date at checkout because different calendars are used."],
    v: "Compare promised against actual delivery dates for a month of orders by region and service, and confirm the share delivered on or before promise is at or above the target.",
    dep: ["multi-location-stock", "carrier-integration", "oversell-policy"]
  },
  "dropship-marketplace": {
    s: "Supports items sold by outside suppliers or sellers, who hold the stock and ship directly, with order routing, seller feeds, commission and payouts.",
    d: "Third-party sellers list offers, either attached to platform products or as their own, and manage price and stock through feeds or an API. When a customer orders, each seller's lines are routed to that seller as a sub-order, with their own acceptance, shipping and returns. The platform takes payment, deducts commission and fees, and pays sellers after delivery or a hold period. The difficulty is control without ownership: stock accuracy, ship times and customer service all depend on parties whose systems the platform does not run.",
    k: ["Platform collects payment and pays sellers vs sellers take payment directly: platform collection controls the experience and creates payout and liability duties; direct payment is simple and loses control and fees.", "Strict seller performance enforcement vs tolerance: enforcement protects customers and drives sellers away; tolerance grows supply and harms trust."],
    p: ["A seller's stale feed sells items that do not exist, and cancellations pile up.", "Seller payouts are released before the return window closes and refunds cannot be recovered."],
    v: "Place an order spanning two sellers and the platform, ship, return one item, and confirm each sub-order's state, the commission, the customer refund and the seller payouts all reconcile to the original payment.",
    dep: ["order-splitting", "stock-sync", "integration-connectors", "refund-decisions"]
  },
  "click-and-collect": {
    s: "Lets customers order online and pick up at a store or locker, with local stock checks, ready-for-pickup notices, holds and identity verification at handover.",
    d: "At checkout the shopper picks a location, and availability is checked against that store's stock and capacity. The order is routed to the store, which picks and holds it for a set number of days and signals when ready. The customer receives a code or ID check at pickup, and unclaimed orders are returned to stock and refunded. Store staff use a simple app or the register system. The challenge is the accuracy of store stock, which is counted less rigorously than warehouse stock, and the workload placed on store staff.",
    k: ["Show store stock live vs as a coarse indicator: live is accurate and costly to maintain; an indicator is cheap and may send customers to a store without the item.", "Pay online vs pay at pickup: online secures the sale and requires refunds for unclaimed orders; at pickup is flexible and invites no-shows."],
    p: ["Store stock is outdated and staff cannot find the item, so the customer's trip is wasted.", "Unclaimed orders stay held past the deadline and stock stays locked."],
    v: "Place pickup orders at several stores, including with a short pick and an unclaimed order, and confirm ready notices, handover verification, release to stock and refund occur at the configured times.",
    dep: ["multi-location-stock", "fulfillment-routing", "order-state-machine"]
  },
  "order-risk-scoring": {
    s: "Rates each order's likelihood of being fraudulent from payment, identity, device, address and behavior signals, then approves, challenges, holds or declines it.",
    d: "At checkout or just after, a scoring service combines signals: mismatches between billing and shipping, email age, device reputation, velocity counters, order value and product risk, and the payment provider's own score. Rules and models yield a score with reasons, mapped to actions by thresholds that merchants tune. Decisions and later outcomes, such as chargebacks, are stored to retrain. The challenge is the balance of costs: blocked good customers lose revenue permanently, while approved fraud costs goods, fees and penalties.",
    k: ["Rules vs a trained model: rules are transparent and quickly adapt to a known attack; models find subtle patterns and need labeled outcomes that arrive months later.", "Score before payment vs after: before avoids fees on blocked orders and delays checkout; after uses provider data and may leave a charge to reverse."],
    p: ["Thresholds tuned during a fraud wave keep declining legitimate customers long afterward.", "Chargeback outcomes never flow back to the scoring data, so the model does not learn."],
    v: "Replay a labeled set of past orders with known fraud outcomes and confirm the share of fraud caught and good orders blocked at the current thresholds meets the stated targets.",
    dep: ["velocity-device-signals", "manual-review-queue", "payment-orchestration"]
  },
  "velocity-device-signals": {
    s: "Collects behavioral and device evidence, such as how many cards, accounts or addresses appear together, and feeds counters and fingerprints to the risk checks.",
    d: "Counters track events per window by card, email, device, address and IP: attempts, failures, accounts created, orders. A device fingerprint, built from browser and network characteristics, links sessions without cookies. Data is held in a fast store with expiry, and checks run in the checkout path under a tight latency budget. Shared entities like offices or family devices create false positives. The difficulty is speed and privacy: signals must be fast and fresh, and collecting fingerprints and addresses carries consent and retention obligations.",
    k: ["Real-time counters vs batch features: real-time catches fast attacks and needs a low-latency store; batch is cheap and misses bursts.", "Strong device fingerprinting vs minimal collection: strong linking finds fraud rings and raises privacy and legal concerns; minimal is safer and weaker."],
    p: ["A shared office IP triggers velocity limits and blocks every colleague's order.", "Counters keyed by raw email miss variants of one address that differ by dots or suffixes."],
    v: "Simulate an attack with many cards on one device and many accounts from one address, and confirm counters trip within the stated number of attempts while an ordinary shared-network user is unaffected.",
    dep: ["order-risk-scoring", "pci-and-privacy-scope"]
  },
  "manual-review-queue": {
    s: "Holds orders the automated checks cannot decide, showing reviewers the evidence, and records approve or cancel decisions that feed back to the scoring.",
    d: "Orders over a review threshold are paused before capture or shipment and appear in a queue, ordered by value and age with the signals and reasons that triggered them. Reviewers may contact the customer, request verification, and approve, cancel or refer. Service levels matter, because delay loses the sale or misses the delivery promise. Decisions are stored as labels. The difficulty is volume and consistency: reviewers differ, queues swell during campaigns and payment authorizations expire during long reviews.",
    k: ["Hold before capture vs after: before avoids chargebacks and refunds and risks authorization expiry; after is simple and creates reversal work.", "Reviewer discretion vs strict playbooks: discretion handles odd cases and varies; playbooks are consistent and miss new patterns."],
    p: ["Orders in the queue lose their payment authorization and the customer is asked to pay again.", "Reviewer decisions are not recorded as labels, so the same cases are reviewed repeatedly."],
    v: "Inject a day's worth of held orders and confirm all are reviewed within the service-level target, each decision has a reason and reviewer, and the outcomes appear in the training data.",
    dep: ["order-risk-scoring", "order-state-machine", "audit-log"]
  },
  "chargeback-handling": {
    s: "Receives card disputes, gathers evidence such as delivery proof and communications, responds within deadlines, and tracks outcomes and rates per merchant.",
    d: "A dispute notice arrives from the payment provider with a reason and a deadline. The platform links it to the order, freezes related fulfillment or refunds, assembles evidence automatically, including tracking, signatures, logs and the order snapshot, and submits it. Outcomes update the ledger, with fees and reversals. Dispute rates are monitored because exceeding network thresholds brings penalties. The challenge is to catch each deadline, assemble evidence from many systems, and separate true fraud from friendly disputes and unhappy customers who should have been refunded.",
    k: ["Contest every dispute vs only likely wins: contesting all maximizes recovery and consumes staff time and fees; selecting saves effort and gives up winnable cases.", "Refund proactively on early warnings vs wait for a dispute: proactive avoids dispute fees and counts and may refund fraudulent buyers; waiting keeps options and risks the rate."],
    p: ["A response deadline passes unnoticed and the dispute is lost by default.", "Evidence lacks proof of delivery because tracking events were not stored with the order."],
    v: "Open sample disputes in sandbox for fraud, not-received and not-as-described, and confirm each is linked to its order, evidence is assembled automatically and submitted before the deadline.",
    dep: ["payment-webhooks", "tracking-ingest", "order-model", "audit-log"]
  },
  "bot-scalper-defense": {
    s: "Detects and limits automated traffic that scrapes prices, hoards stock, stuffs credentials or buys limited items at machine speed.",
    d: "Layers include challenge pages, behavioral analysis of request patterns, device and network reputation, per-account and per-payment purchase caps, and honeypot fields. Protection is applied by sensitivity: browsing is lightly checked, while add-to-cart, login and checkout of scarce items are strongly protected. Decisions allow, challenge or block. Attackers adapt, so rules change constantly. The difficulty is not harming real shoppers and accessibility tools, and recognizing that bots use real payment methods and residential networks.",
    k: ["Challenge every suspicious visitor vs score and act only at critical steps: challenging everything blocks more bots and hurts real shoppers; step-based protection preserves experience and lets scraping through.", "Edge-based detection vs in-application checks: edge stops traffic early and lacks business context; in-application knows the account and purchase and costs capacity."],
    p: ["Strict challenges lock out users of assistive technology and lower conversion.", "Per-IP caps are bypassed by thousands of residential addresses, each making one purchase."],
    v: "Run a scripted purchase bot and a credential-stuffing test against a protected staging launch and confirm most automated attempts are blocked or challenged, while a set of real user journeys completes without friction.",
    dep: ["cdn-and-edge", "rate-limiting", "velocity-device-signals"]
  },
  "account-takeover-protection": {
    s: "Detects and stops the use of stolen credentials against customer accounts, protecting saved payment methods, addresses, points and personal data.",
    d: "Signals include login attempts across many accounts from one source, passwords known from public breaches, new devices and locations, and sudden changes of address or email followed by a purchase. Responses are step-up authentication, forced reset, throttling and holds on high-risk actions such as changing email or shipping a high-value order to a new address. Customers are notified of sensitive changes. The challenge is high-volume, low-and-slow attacks that stay under rate limits, and keeping friction low for legitimate logins.",
    k: ["Check passwords against breach lists vs not: checking blocks known-bad passwords and requires handling hashed lookups safely; not checking is simple and leaves easy targets.", "Step-up only on risk vs on every login: risk-based keeps friction low and depends on detection; always-on is safe and drives abandonment."],
    p: ["Attackers change the account email first, and the real owner can no longer recover it.", "Alerts about new-device logins go to the email the attacker has just changed."],
    v: "Replay a credential-stuffing list at a realistic low rate and confirm compromised accounts are challenged or locked, sensitive changes trigger a notice to the previous email, and genuine logins pass.",
    dep: ["customer-identity", "velocity-device-signals", "rate-limiting"]
  },
});
