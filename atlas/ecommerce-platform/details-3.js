// Details for the e-commerce platform plate, part 3: payments, tax and regions, inventory.
ATLAS.details("ecommerce-platform", {
  "payment-orchestration": {
    s: "The platform's single internal interface to payments: it chooses a processor and method, sequences authorization, capture and refund, and keeps order state aligned with the outcome.",
    d: "Checkout calls one payment service rather than each provider. The service maps a payment intent to the right processor adapter by method, currency, region and cost, calls it with an idempotency key, records every attempt and response, and updates the payment state. It can retry on a second processor after a technical failure, but not after a real decline. Adapters hide provider differences. The hard part is state: the outside party's truth arrives late through callbacks, so the platform must treat its own record as provisional.",
    k: ["Single processor vs multiple behind an abstraction: one is simple and a single point of failure; several add routing and resilience and a lowest-common-denominator interface.", "Synchronous result vs state driven by callbacks: synchronous is easy to reason about and misses later changes; callbacks are authoritative and arrive out of order."],
    p: ["A timeout is treated as a failure and the customer retries, while the first authorization actually succeeded.", "Failover to a second processor after a soft decline double-charges a customer."],
    v: "Inject timeouts, duplicate callbacks and an outage of the primary processor in a sandbox, and confirm every order ends with exactly one successful charge or none, and the platform record matches the processor's.",
    dep: ["payment-method-registry", "idempotent-payment-calls", "authorize-and-capture", "payment-webhooks"]
  },
  "payment-method-registry": {
    s: "Declares which payment methods exist and when they appear: by country, currency, order amount, device and customer, with their display order and fee rules.",
    d: "Methods include cards, bank debits and transfers, wallets, buy-now-pay-later and cash on delivery. Each entry holds eligibility rules, the processor adapter that supports it, minimum and maximum amounts, and presentation. At checkout the registry returns the allowed methods for this cart. Merchants enable and reorder them. The challenge is that local methods dominate in some countries and have unusual flows, such as redirects and delayed confirmation, so the registry has to carry the behavior a method needs, not just a name.",
    k: ["Rules in configuration data vs in code: data lets merchants change them without releases and can hide untested combinations; code is reviewed and slower to change.", "Show all eligible methods vs a curated few: showing all serves every shopper and adds choice overload; curation lifts conversion and omits someone's preferred method."],
    p: ["A method is offered in a country where the processor does not support it, and payment fails at the last step.", "A delayed-confirmation method is treated as instant and the order ships before funds arrive."],
    v: "For each country, currency and amount band in the test matrix, load checkout and confirm the offered methods equal the expected list and each completes a sandbox payment.",
    dep: ["multi-currency-pricing", "regional-deployment"]
  },
  "hosted-fields": {
    s: "Collects card details in elements served by the payment provider and exchanges them for a token, so card numbers never pass through the store's own servers.",
    d: "The checkout page embeds provider-hosted inputs, often in isolated frames, which send card data directly to the provider and return a single-use token. The platform's servers see only the token and display data. The page itself must still be protected, because injected scripts can alter the page around the frames, so content security rules and script integrity checks are applied. The hard parts are consistent styling and accessibility inside the frames, and securing the surrounding page against script tampering.",
    k: ["Hosted fields vs a redirect to the provider's page: fields keep the shopper in the flow and leave page script risk; redirects shrink scope further and lose control of the experience.", "Collecting card data on own servers vs tokenizing at the client: own servers give full control and bring the full compliance burden; client tokenization removes most of it."],
    p: ["A third-party marketing script on the checkout page is compromised and skims card data from the surrounding page.", "The token expires or is reused after a slow shopper edits the form and an error is shown."],
    v: "Complete a purchase while capturing all traffic from the browser and server, and confirm the card number appears only in requests to the provider's domain and never in any request, log or database of the platform.",
    dep: ["pci-and-privacy-scope", "payment-orchestration"]
  },
  "authorize-and-capture": {
    s: "Holds funds on the customer's account first, then collects them when goods ship or the sale is confirmed, with rules for partial captures, expiry and voids.",
    d: "An authorization reserves an amount for a limited time, typically days. Capture later collects all or part of it. Merchants who ship in parts capture per shipment; digital goods usually capture immediately. A void releases an unused hold. If the authorization expires before shipment, the platform must re-authorize, which may fail. Capturing less than authorized releases the remainder. The difficulty is aligning payment state with fulfillment events, including cancellations, splits and price adjustments after the original hold.",
    k: ["Capture at order time vs at shipment: at order time is simple and requires refunds for unfulfilled items; at shipment charges only for what is sent and carries expiry and re-authorization risk.", "Authorize the exact total vs a margin above: exact is clean and cannot cover later adjustments; a margin handles tips and shipping changes and ties up more of the customer's funds."],
    p: ["An authorization expires while an item is backordered and the capture fails after shipping.", "A split shipment captures the full amount on the first parcel."],
    v: "Run orders with split shipments, a cancellation and a delayed shipment past the hold period, and confirm captured amounts equal shipped value and expired holds are re-authorized or the order is flagged before shipment.",
    dep: ["payment-orchestration", "shipment-creation", "order-state-machine"]
  },
  "strong-customer-authentication": {
    s: "Handles the extra identity step that banks and regulation can require on a payment: a challenge such as an app approval or code, and the checkout flow around it.",
    d: "When a payment requires authentication, the provider returns a signal that a challenge is needed. The shopper completes it in a frame or redirect, and the platform resumes the payment with the result. Exemptions, such as low value or trusted merchants, can skip it, and a successful challenge shifts liability for fraud to the issuer. Subsequent charges on saved methods use earlier authentication. The hard part is the interrupted flow: shoppers abandon at the challenge, and the platform must resume correctly or recover the order afterward.",
    k: ["Always challenge vs request exemptions where allowed: always challenging lowers fraud liability and loses conversions; exemptions convert better and can be declined by the issuer, forcing a retry.", "Authenticate at checkout vs for later stored-credential charges: checkout is when the customer is present; later charges rely on prior consent and need clear rules."],
    p: ["The shopper closes the challenge window and the order sits pending forever with held stock.", "A challenge result is trusted from the browser instead of confirmed server-to-server with the provider."],
    v: "Pay with test cards that require authentication, succeeding, failing and abandoning the challenge, and confirm each order reaches the right final state, stock is released on abandonment and the result is confirmed by the provider.",
    dep: ["payment-orchestration", "checkout-flow", "payment-webhooks"]
  },
  "idempotent-payment-calls": {
    s: "Attaches a unique key to every money-moving request so that retries after timeouts or crashes return the original result instead of charging twice.",
    d: "The platform generates a key per payment attempt, derived from the order and attempt number and stored before the call. The provider remembers the key and response for a period and replays the same answer if it sees the key again. The platform's own endpoints do the same for its clients. A key must identify the intent, not the request: changed parameters under the same key are an error. The difficulty is key scope and lifetime, since too narrow permits duplicates and too broad blocks legitimate new attempts.",
    k: ["Key per order vs per attempt: per order makes duplicates impossible and blocks retrying with a new card; per attempt allows retries and needs separate protection against double charges.", "Store the key before the call vs after: before survives crashes and records attempts that never completed; after is simpler and loses the key exactly when it is needed."],
    p: ["A key is generated fresh on every retry, so each retry is a new charge.", "The provider's key window is shorter than the platform's retry period, and a late retry charges again."],
    v: "Send the same payment request ten times in parallel and after a simulated timeout, and confirm the provider shows exactly one charge and all ten responses carry the same result.",
    dep: ["payment-orchestration", "idempotency-and-retries"]
  },
  "payment-webhooks": {
    s: "Receives the processor's asynchronous notifications about payment outcomes, verifies them, and applies them to orders exactly once and in a safe order.",
    d: "Providers call back an endpoint with signed events for captured, failed, refunded, disputed and expired payments, and for methods that confirm later. The handler verifies the signature, deduplicates by event id, loads the current state, and applies the change only if it is valid from that state, then returns success quickly and does heavy work asynchronously. Events can arrive late, repeated or out of order, and some are lost. A periodic poll or reconciliation covers the gaps.",
    k: ["Trust the event payload vs refetch the object from the provider: payload is cheap and may be stale or out of order; refetching costs a call and gives the current truth.", "Process in the request vs enqueue and acknowledge: in-request is simple and times out under load, causing provider retries; enqueue is resilient and adds a delay."],
    p: ["A refund event arrives before the capture event and is rejected, and the order never records the refund.", "The endpoint accepts unsigned requests, letting anyone mark orders paid."],
    v: "Replay captured webhooks duplicated, delayed and in reverse order against staging, and confirm the final order and payment states equal those from the in-order run, and an unsigned request is rejected.",
    dep: ["payment-orchestration", "order-state-machine", "event-bus"]
  },
  "payment-reconciliation": {
    s: "Compares the platform's recorded payments, refunds and fees against the processor's settlement reports, finding differences before finance does.",
    d: "Each day the processor delivers settlement files listing transactions, fees, holds and payouts. A job matches them to platform payments by reference and amount, classifying results as matched, missing on either side, or amount mismatch. Differences create tasks for support or finance, and fees and payout totals feed accounting. The hard parts are matching across currencies and timing, with transactions that appear on different days, and distinguishing real errors from known behaviors like rounding or batched payouts.",
    k: ["Match per transaction vs per payout total: per transaction finds exact problems and is heavy; totals are quick and hide offsetting errors.", "Automatic correction vs manual review: automatic fixes close gaps fast and may hide root causes; review is slower and builds knowledge of recurring faults."],
    p: ["An order marked paid has no matching settlement line because a callback was lost, and nobody notices for weeks.", "Currency conversion rounding causes thousands of false mismatches and real ones are ignored."],
    v: "Seed a test day with a missing capture, a duplicate and an amount mismatch, run reconciliation, and confirm each is reported once with the order reference and the clean transactions are matched.",
    dep: ["payment-orchestration", "money-and-rounding", "invoicing-and-tax-reporting"]
  },
  "tax-calculation": {
    s: "Computes the tax owed on each line and on shipping for a given buyer location, item class and seller registration, in a way that is reproducible and refundable.",
    d: "The calculator takes lines with their tax class, discounted amounts, shipping, origin and destination, and returns per-line tax with the rate, jurisdiction and rule applied. It may call an external tax service or a local rules table. The result is stored on the order, so later refunds reverse exactly what was charged. Prices may be tax-inclusive or tax-exclusive, which changes the math. The hard parts are accuracy across thousands of jurisdictions and the rounding of tax per line versus per order.",
    k: ["External tax service vs in-house rules: a service stays current with law changes and adds cost, latency and a dependency; in-house is cheap and demands constant legal maintenance.", "Tax-inclusive vs exclusive display: inclusive matches consumer expectations in many regions and requires back-calculation; exclusive is simple and surprises shoppers at checkout."],
    p: ["Tax is computed on the pre-discount price and overcharges every promotional order.", "A tax service outage blocks all checkouts because there is no fallback or cached estimate."],
    v: "Run a table of known cases covering several jurisdictions, item classes, discounts and shipping, and confirm the tax per line and total match the verified expected values to the cent.",
    dep: ["tax-jurisdiction-rules", "tax-exemptions", "money-and-rounding"]
  },
  "tax-jurisdiction-rules": {
    s: "The data that maps a destination, an item class and a seller's registrations to the applicable tax type, rate and rules, with effective dates.",
    d: "Rules cover sales tax by state and locality, value-added tax by country with reduced rates for categories, thresholds that create a registration obligation and place-of-supply rules for digital goods. Each product carries a tax class; each rule has an effective period, because rates change, and history must be preserved for audits. Updates arrive from a data provider or are maintained by hand. The difficulty is volume and boundary cases, such as addresses straddling jurisdictions and items that count differently in different places.",
    k: ["Rate by postal code vs by exact address: postal code is easy and wrong where boundaries cut across codes; exact address is accurate and needs geocoding.", "Maintain rules manually vs subscribe to a data feed: manual gives control for a few markets; a feed scales and requires trust and a validation process before activation."],
    p: ["A rate change is applied from the day the file loaded rather than the legal effective date.", "A product category misclassified as clothing receives the zero rate and under-collects tax for months."],
    v: "Compare computed rates for a sample of addresses and item classes against an authoritative source, and confirm a rate change with a future effective date applies to orders at exactly that time.",
    dep: ["delivery-selection"]
  },
  "tax-exemptions": {
    s: "Manages buyers and items that owe no tax or reduced tax, with certificates, validation of tax identifiers and the evidence kept for audits.",
    d: "Business buyers may be exempt by certificate, resale status or a valid tax registration number; some institutions are exempt by type. The account stores certificates with issuer, jurisdiction and expiry, and the calculator consults them at checkout. Validation can call a government registry for identifiers. Cross-border business sales may be reverse-charged. The hard parts are evidence and expiry: an exemption applied without a valid certificate becomes the seller's liability when audited.",
    k: ["Apply exemption on upload vs after verification: on upload is fast for buyers and risks unvalidated claims; after verification protects the seller and delays the order.", "Exemption by customer vs per order: by customer is convenient and misapplies when the buyer orders a non-exempt item; per order is precise and tedious."],
    p: ["An expired certificate stays attached to the account and tax is not collected for months.", "A registry check is skipped when its service is down, and invalid numbers are accepted."],
    v: "Place orders with a valid, expired and missing certificate and a valid and invalid registration number, and confirm tax is charged or exempted accordingly and the evidence is saved to the order.",
    dep: ["tax-calculation", "customer-identity"]
  },
  "duties-and-landed-cost": {
    s: "Estimates import duties, customs taxes and fees for cross-border orders, and decides whether the shopper pays them at checkout or on delivery.",
    d: "For each item a commodity code, origin and value determine duty and import tax in the destination. The platform quotes a landed cost, either a total including duties paid by the seller on the customer's behalf, or a warning that charges apply on delivery. Customs documents, such as a commercial invoice, are generated with correct values and codes. The difficulty is data quality: wrong commodity codes mean wrong duties and delayed parcels, and thresholds for low-value shipments change by country.",
    k: ["Duties paid at checkout vs collected on delivery: paid at checkout gives a known total and exposes the seller to estimate errors; on delivery is simpler and leads to refused parcels.", "Merchant-assigned commodity codes vs automatic classification: merchant codes are deliberate and slow to maintain; automatic is quick and sometimes wrong in costly ways."],
    p: ["Recipients refuse parcels because unexpected charges appear at the door.", "An item shipped with the wrong code is held by customs and the buyer sees no tracking updates."],
    v: "Quote and ship test orders to several countries and compare the estimated duties and taxes with the amounts actually assessed, confirming documents carry correct codes and values.",
    dep: ["tax-calculation", "multi-currency-pricing", "carrier-integration"]
  },
  "multi-currency-pricing": {
    s: "Presents and charges prices in the shopper's currency, with rules for explicit prices, converted prices, rounding and the currency used for settlement.",
    d: "Each market has a display currency, a charging currency and a settlement currency, which may differ. Prices come from explicit per-currency entries or are converted using the exchange rate service plus a margin, then rounded to local price endings. The cart, tax and payment all must use the same currency and amounts. Refunds return the original amount, not a reconverted one. The hard part is consistency: a shopper browsing in one currency and paying in another sees a different amount than they were promised.",
    k: ["Charge in the shopper's currency vs the merchant's: shopper's currency is clear to buyers and exposes the merchant to rate movement; merchant's currency is stable and moves conversion to the buyer's bank.", "Rates refreshed continuously vs fixed for a period: continuous tracks the market and makes prices wobble; fixed gives stable prices and a margin buffer."],
    p: ["Product pages convert with one rate and checkout with another, and shoppers see the price change.", "A refund is computed at today's rate and returns more or less than was paid."],
    v: "Buy the same item in several currencies, and confirm the price shown on the listing, cart and payment confirmation are identical, and a later refund returns the exact amount paid.",
    dep: ["price-books", "exchange-rate-service", "money-and-rounding"]
  },
  "exchange-rate-service": {
    s: "Provides current and historical currency rates from a trusted source, with a defined refresh schedule, margin and fallbacks, and stores the rate used for every order.",
    d: "A job fetches rates from a data provider at an interval, validates them against bounds and the previous values, and publishes a versioned rate table. Consumers ask for the rate at a time. A margin is added to cover movement. Orders store the rate applied so reports and refunds are exact. If the source fails, the last good table is used until a staleness limit, after which conversion is blocked or flagged. The hard parts are bad data and consistency across services reading different versions.",
    k: ["Single published table per interval vs rates fetched on demand: a table is consistent and slightly stale; on demand is fresh and can give different rates within one checkout.", "Block conversions when stale vs continue with the last rate: blocking protects margin and stops sales; continuing keeps selling and risks a bad rate."],
    p: ["A provider glitch returns a rate off by a factor of 100 and prices drop to a hundredth for minutes.", "Two services use different rate versions and report different totals for the same day."],
    v: "Feed the service an outlier rate and a stale source in staging, and confirm the outlier is rejected, the last good table is used within the limit, and an alert fires when the limit is exceeded.",
    dep: []
  },
  "regional-deployment": {
    s: "Runs the platform for several regions with local data residency, latency and legal rules, deciding which data and services are local and which are global.",
    d: "Regions may be separate deployments with their own databases, or one global system with regional replicas. Customer and order data may have to stay in a legal region, while the catalog and content are replicated everywhere. Traffic is routed to the nearest region, and checkout for a market may be pinned to its region. Global concerns such as the catalog source of truth and cross-region reporting need explicit replication paths. The difficulty is deciding what is truly global and living with replication delay.",
    k: ["Active in every region vs one primary with regional read replicas: active everywhere gives low write latency and complex conflict rules; one primary is simple and slow for distant writes.", "Region-bound customer data vs global accounts: bound data meets residency rules and breaks travelers and global accounts; global accounts are convenient and may breach law."],
    p: ["A shopper moves country and finds their account and orders absent because data is region-bound.", "Replication lag shows old stock in a region and orders are accepted for items already sold."],
    v: "Fail a region over in a drill and confirm shoppers are served from another region within the recovery target, with no personal data crossing a restricted boundary and the stock lag within its stated bound.",
    dep: ["cdn-and-edge", "consistency-boundaries", "pci-and-privacy-scope"]
  },
  "invoicing-and-tax-reporting": {
    s: "Issues legally valid invoices and credit notes with sequential numbers, and produces the tax reports and ledger entries finance and authorities require.",
    d: "On the right trigger, such as payment or shipment, an invoice is created from the order snapshot with seller and buyer details, line tax and totals, in the format and language the jurisdiction demands, and numbered in a gap-free sequence where required. Refunds produce credit notes referencing the invoice. Periodic reports summarize sales by jurisdiction and rate. Entries flow to the accounting system. The challenge is legal variation, and immutability: an issued invoice is never edited, only credited.",
    k: ["Invoice at order vs at shipment: at order is simple and invoices goods that may never ship; at shipment is accurate and creates timing differences with payment.", "Gap-free numbering per series vs unique ids: gap-free meets strict laws and serializes issuance; unique ids scale and may not be accepted."],
    p: ["A failed transaction leaves a gap in the invoice sequence that auditors ask about.", "An invoice is regenerated from edited order data and no longer matches what the customer received."],
    v: "Issue invoices and credit notes for a day of mixed orders, and confirm numbering has no gaps, totals match payments, and the tax report totals equal the sum of invoice taxes by jurisdiction.",
    dep: ["order-model", "tax-calculation", "integration-connectors"]
  },
  "stock-ledger": {
    s: "The authoritative record of every change to on-hand and committed quantities per item and location, from which current stock is derived and audited.",
    d: "Each receipt, sale, reservation, return, adjustment and transfer appends an entry with quantity, reason, reference and time. Current balances are maintained incrementally and can be rebuilt from the entries. Quantities are tracked in states such as on hand, reserved, allocated and in transit. Updates for a hot item serialize on one counter. The hard part is correctness under concurrency: two checkouts must not both take the last unit, and counts from the warehouse must be reconciled without erasing history.",
    k: ["Append-only ledger with derived balance vs mutable counters: the ledger is auditable and rebuildable and costs more to read; counters are fast and lose the story behind a wrong number.", "Row lock per item vs optimistic conditional update: locking is simple and queues under a spike; conditional updates scale and require retries."],
    p: ["Direct edits to the balance without an entry make discrepancies impossible to explain.", "A hot product's counter becomes a bottleneck and checkout latency rises for everyone."],
    v: "Fire many concurrent purchases at an item with five units and confirm exactly five succeed, the balance is zero and the ledger entries sum to the balance, with none negative.",
    dep: ["variants-and-options", "multi-location-stock"]
  },
  "availability-service": {
    s: "Answers whether and how many units can be sold now, quickly and in bulk, for listings, product pages, the cart and checkout.",
    d: "It combines on-hand stock, reservations, safety stock and location rules to return a sellable quantity or a status such as in stock, low and out of stock. Listing pages ask for hundreds of items at a time and tolerate slight staleness; the cart and checkout need exact answers. Results are cached with short lifetimes and invalidated by stock events. Different channels may see different numbers. The challenge is serving enormous read volume without letting stale reads cause overselling at the commit point.",
    k: ["Cached approximate availability for browsing vs exact reads everywhere: cached scales and can mislead near zero; exact is always right and loads the ledger.", "Showing exact counts vs bands: counts help urgency and reveal stock levels to competitors; bands hide detail and reduce precision."],
    p: ["A cached in-stock status stays after the last unit sold and shoppers are disappointed at checkout.", "Bulk reads for a listing page hit the ledger one item at a time and slow the page."],
    v: "Sell down an item while sampling the listing, product page and cart, and confirm the displayed status flips to out of stock within the freshness target and checkout refuses any unit beyond real stock.",
    dep: ["stock-ledger", "reservations", "safety-stock-allocation", "cache-layers"]
  },
  "reservations": {
    s: "Temporarily holds units for a shopper during checkout, or for an order awaiting payment, and releases them on expiry, cancellation or failure.",
    d: "A reservation decrements sellable stock without removing it from on-hand, with an owner, quantity and expiry. It is created at checkout start or at order placement, converted to a commitment when payment succeeds, and released if payment fails or time runs out. An expiry job or lazy check frees abandoned holds. Holds should be short during normal sales and carefully chosen for scarce items. The difficulty is balance: long holds lock out buyers, while short holds let shoppers lose their item mid-payment.",
    k: ["Reserve at add-to-cart vs at checkout: add-to-cart guarantees the item and lets abandoned carts lock stock; at checkout holds only serious intent and shoppers may lose items late.", "Fixed expiry vs extend on activity: fixed is predictable and cuts off slow payers; extending is friendly and lets a session hold stock indefinitely."],
    p: ["Reservations from abandoned checkouts are never released and a product shows sold out with stock on the shelf.", "Payment succeeds just after the reservation expired, and the stock has been sold to someone else."],
    v: "Abandon, expire and complete checkouts in staging and confirm the sellable quantity returns after expiry, a payment completing at the expiry boundary is either honored or refunded, and totals always reconcile.",
    dep: ["stock-ledger", "order-placement", "idempotency-and-retries"]
  },
  "oversell-policy": {
    s: "The rule for what happens when demand exceeds stock: block the sale, allow backorders with a promised date, or sell beyond stock and sort it out later.",
    d: "Policy is set per product, channel or customer. Backorders show an expected date and accept payment, while pre-orders sell before stock exists. Some merchants deliberately oversell small amounts to offset cancellations. The policy interacts with payment capture, shipping promises and customer messaging. When oversold orders occur by error, a resolution flow decides who is served, who is offered an alternative and who is refunded. The difficulty is that every rule is a promise to a customer that operations may not be able to keep.",
    k: ["Hard block at zero vs allow backorder: block never disappoints after purchase and loses sales; backorder keeps selling and creates delivery risk.", "First-come served vs prioritize by customer value when resolving oversell: first-come is defensible and simple; priority protects best customers and looks unfair."],
    p: ["Items marked backorderable have no supplier date, and customers wait months with no communication.", "Oversold orders are cancelled by hand days later after a bulk of tickets arrives."],
    v: "Sell past zero stock under each policy in staging, and confirm the shopper sees the correct message and date, the order is flagged appropriately and the resolution flow lists affected orders in the right order.",
    dep: ["availability-service", "order-state-machine", "delivery-promise"]
  },
  "multi-location-stock": {
    s: "Tracks stock separately in warehouses, stores and in-transit pools, and lets the platform sell from the union or restrict by channel and region.",
    d: "Each location has its own balances and rules, such as which channels may sell from it and whether store stock is visible online. Availability may be the sum across eligible locations, and the fulfillment routing step then picks where each unit ships from. Transfers between locations are modeled as movements with an in-transit state. The hard parts are consistency between systems that own the counts, and showing shoppers a number that can actually be fulfilled in time.",
    k: ["Sellable pool as the sum of all locations vs per-location listing: the sum maximizes sales and may promise stock that cannot reach the buyer quickly; per-location is accurate and fragments availability.", "Platform owns counts vs the warehouse system owns them: platform ownership is fast and drifts from reality; warehouse ownership is truthful and slower and less available."],
    p: ["Store stock is counted as online-sellable although the store has no process to pick online orders.", "In-transit transfers are counted twice, in the source and the destination."],
    v: "Move stock between locations and sell during the transfer, and confirm availability per channel never exceeds fulfillable units and the sum across locations plus in-transit equals the control total.",
    dep: ["stock-ledger", "fulfillment-routing"]
  },
  "stock-sync": {
    s: "Keeps stock numbers consistent with warehouses, suppliers and marketplaces by receiving counts and pushing availability out, tolerating delay and disagreement.",
    d: "Inbound, warehouse systems send receipts, adjustments and cycle-count results as events or files. Outbound, the platform pushes availability to marketplaces and other channels, often with a buffer to avoid overselling. The two directions can conflict: a delta from the warehouse and a sale on the platform may cross in flight. Snapshots resolve drift, deltas keep it current. The challenge is detecting drift and choosing which side wins, while limiting how stale outbound numbers become.",
    k: ["Deltas vs periodic full snapshots: deltas are timely and accumulate errors when messages are lost; snapshots self-correct and race with ongoing sales.", "Push availability on every change vs on a schedule: every change keeps channels precise and floods them with calls; a schedule is cheap and exposes oversell windows."],
    p: ["A full snapshot overwrites newer sales made while the file was being produced, and stock reappears.", "A marketplace shows stock the platform sold out an hour ago because pushes were rate limited."],
    v: "Inject lost, duplicated and delayed warehouse messages during live test sales, and confirm the platform converges to the warehouse count within the drift target and outbound channels match within their lag limit.",
    dep: ["stock-ledger", "warehouse-handoff", "integration-connectors", "event-bus"]
  },
  "safety-stock-allocation": {
    s: "Withholds part of the stock from sale as a buffer and divides what remains between channels, regions or customer groups according to policy.",
    d: "A safety quantity per item and location is subtracted from sellable stock to absorb counting errors and returns delays. Allocation rules reserve a share for specific channels, such as marketplaces, wholesale accounts or a launch, and release unsold shares back after a time. Rules may be percentages or fixed counts. The difficulty is tuning: too much buffer loses sales on stock that exists, too little leads to oversell, and allocations that are not rebalanced leave one channel sold out and another idle.",
    k: ["Fixed buffer vs buffer proportional to velocity: fixed is simple and wasteful for slow items; proportional adapts and needs sales data and tuning.", "Hard channel allocation vs shared pool: hard allocation guarantees supply to key channels and strands stock; shared pool uses all stock and favors whoever sells fastest."],
    p: ["A buffer set for a launch is never removed and the product shows sold out while units sit unsold.", "Wholesale allocation holds half the stock and retail sells out in minutes."],
    v: "Configure buffers and allocations for a test item, sell through each channel, and confirm every channel sells only up to its share, unsold allocations are released on schedule and the buffer is never sold.",
    dep: ["stock-ledger", "multi-location-stock"]
  },
  "flash-sale-stock": {
    s: "A path for scarce, heavily contended items: pre-loaded counters, strict limits per buyer and queued reservation, so a spike does not oversell or crash the ledger.",
    d: "For launches and limited drops, stock is loaded into a fast in-memory counter, with atomic decrement and a short hold. A per-buyer cap and a queue admit shoppers in order. Orders are written asynchronously from the winning claims. The normal ledger is updated afterwards and reconciled. Unsold holds return to the pool quickly. The challenge is the hot key: thousands of requests per second on one counter, and the need for fairness and resistance to bots.",
    k: ["Atomic counter in memory vs database lock: memory handles huge rates and risks loss at a crash unless persisted; database is durable and tops out far lower.", "Lottery vs first-come: first-come rewards speed and bots; lottery is fairer and slower to run and explain."],
    p: ["Scalper bots claim every unit within seconds using many accounts.", "The counter node crashes and restarts with stale numbers, so more units are sold than exist."],
    v: "Run a staged drop of 1,000 units with 100,000 simulated buyers and confirm exactly 1,000 orders, per-buyer caps hold, the ledger reconciles to zero and median checkout latency stays within target.",
    dep: ["stock-ledger", "virtual-waiting-room", "bot-scalper-defense", "async-order-pipeline"]
  },
});
