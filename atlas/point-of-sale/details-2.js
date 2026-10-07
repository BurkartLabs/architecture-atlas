// Details for the point-of-sale plate, part 2: catalog, pricing and discounts, transactions and receipts, inventory.
ATLAS.details("point-of-sale", {
  "item-master": {
    s: "The record of every sellable thing: identity, description, department, tax category, unit of sale, restrictions and flags that control how the register treats it.",
    d: "Each item has a stable internal key distinct from any barcode, so codes can change without losing history. Attributes drive behavior at the register: whether it needs a weight, an age check, a serial, a deposit or a manager's approval. A compact version is copied to each register and indexed for lookup. It is hard because one table serves many readers: merchandising wants rich data, the register wants a few fast fields, and every change must reach thousands of registers coherently.",
    k: ["Stable internal key versus the barcode as key: an internal key survives relabeling and supplier changes, but needs a mapping layer and care when merging items.", "Rich central record versus lean register record: a lean copy loads fast and fits small devices, but needs a build step and loses attributes some features need."],
    p: ["Using the barcode as the primary key breaks history when a supplier reuses or changes codes.", "A missing tax category defaults to zero tax and undercharges every sale of the item."],
    v: "Change an item's tax category centrally, publish, and confirm a register sale of that item after the update charges the new tax while a receipt reprint of an older sale still shows the old one.",
    dep: ["local-database-engine"]
  },
  "variants-and-matrices": {
    s: "Models one product that comes in sizes, colors or other options as a parent with child items, each with its own code, stock and sometimes price.",
    d: "A matrix defines axes such as size and color and generates a child per combination. The parent holds shared attributes and children hold code, stock and overrides. At the register the cashier picks or scans a child, and search can show the parent as a grid. Reports roll up to the parent. The hard part is volume and exceptions: a hundred styles with thirty combinations each is thousands of items, and some combinations are never made but must not be sellable.",
    k: ["Generated children versus free-form variants: generation keeps naming and structure uniform, but handling one-off exceptions needs an escape hatch.", "Price at parent versus per child: parent pricing is easy to maintain, while per-child pricing handles extended sizes at a cost of more data to keep consistent."],
    p: ["Selling the parent code with no size selected makes stock impossible to decrement correctly.", "Renaming a color axis value after launch splits history between two apparently different variants."],
    v: "Create a style with 3 sizes and 2 colors, scan one child's barcode, and confirm the line shows the right size and color, and the stock of only that child decreases.",
    dep: ["item-master", "code-to-item-mapping", "inventory-ledger"]
  },
  "code-to-item-mapping": {
    s: "Maps many external codes, such as retail product codes, supplier codes and internal labels, to one item and unit, so any valid scan resolves quickly.",
    d: "A table keyed by normalized code points to an item key, a pack or unit multiplier and optionally a variant. One item can have several codes, for different pack sizes or old labels, and codes can have effective dates. The register keeps this table in a local index so a lookup completes in milliseconds. The hard part is uniqueness and lifecycle: duplicate codes across items are a data error, reused codes confuse history, and retired codes must still resolve for returns.",
    k: ["One code per item versus many codes per item: many codes accept old and new labels, but need rules to prevent collisions and to choose a primary one for display.", "Hard uniqueness constraint versus warn on duplicates: a constraint stops bad data at the source, while warnings allow imports to finish and leave resolution to humans."],
    p: ["A reused barcode sold under a new item makes old returns resolve to the wrong product.", "Removing a retired code too early makes returns of old stock impossible to scan."],
    v: "Attach three codes to one item, scan each, and confirm all resolve to the same item with the pack multiplier of the one scanned; then try to assign one code to a second item and confirm it is rejected.",
    dep: ["item-master", "units-and-packs"]
  },
  "units-and-packs": {
    s: "Defines how an item is counted and sold: each, case, pack, weight or length, with conversion between them for sale, stock and cost.",
    d: "An item has a base unit, and alternate units with a multiplier, such as a six-pack equal to six eaches. Price may be set per unit and stock is held in the base unit. Fractional quantities apply to weight and length, with rules for minimum and step sizes. Unit-price display for comparison is required in some markets. It is hard because conversions touch everything: scanning a case must decrement the right quantity and a return of one unit from a pack must be handled.",
    k: ["Stock in the base unit versus in the sold unit: base-unit stock gives a single truth for conversions, but loses sight of intact cases the store wants to track.", "Fractional quantity with fixed decimals versus integer thousandths: integers avoid binary rounding errors in weights, at the cost of conversion code at every display."],
    p: ["A case scan that decrements one unit instead of twenty-four leaves stock wildly overstated.", "Binary floating-point for weights makes totals differ by a cent between systems."],
    v: "Sell one case of a 24-unit item and one single unit, and confirm the ledger decreases by 24 and 1 in base units, and a return of 5 units adds exactly 5.",
    dep: ["item-master"]
  },
  "modifiers-and-bundles": {
    s: "Supports items with options and add-ons, such as a meal with sides, and bundles or kits that sell several items as one with a combined price.",
    d: "A modifier group lets the cashier choose from options, with rules for required, optional, minimum and maximum selections, and price adjustments. A bundle is a parent whose components are looked up and stock-adjusted individually. The sale line stores both the chosen options and the allocated prices. It is hard because every component needs a price share for taxes, returns and margin: returning one part of a bundle requires an allocation that is fair and auditable.",
    k: ["Price allocated to components at sale versus bundle as a single line: allocation lets one part be returned and taxed correctly, but needs a rule that customers can follow.", "Bundles as items versus bundles as promotions: items are simple to sell, while promotions apply to any qualifying set and need engine support."],
    p: ["A bundle priced at one total with no allocation makes a partial return impossible to price.", "Components with different tax rates inside one bundle are taxed at the parent's rate."],
    v: "Sell a bundle of three items with different tax rates, return one component, and confirm the refund equals that component's allocated price plus the tax collected on that part.",
    dep: ["item-master", "price-resolution", "tax-calculation"]
  },
  "price-books": {
    s: "Named sets of prices with scope and effective dates, such as base, regional, store-specific, member and promotional, that the register consults in a defined order.",
    d: "Each price entry ties an item, unit and price to a book, validity window and priority. The register holds the books relevant to its store and clock, and the price resolver picks the most specific, current entry. Books let head office manage broad prices while a store or an event overrides a few items. The hard part is the combination: many books, dates and scopes interact, and an operator needs to know why one price won over another.",
    k: ["Layered books with precedence versus one flat price per item and store: layers reduce maintenance and express intent, but a flat table is easier to verify at the register.", "Effective dating in the data versus swapping books at the cutover: dating allows advance staging and history, while swapping is simpler but needs a precise cutover moment."],
    p: ["Two books overlapping with equal specificity pick a price by load order, which changes between releases.", "A deleted promotional price entry reverts silently to base price while shelf labels still show the promotion."],
    v: "Define base, regional and store books with three different prices for one item and confirm the register shows the store price, and that the price-explain view lists all three and which one won.",
    dep: ["item-master", "price-and-promo-scheduling", "store-hierarchy"]
  },
  "catalog-distribution": {
    s: "Publishes catalog and price changes from the center to every register as full snapshots and incremental updates, and confirms each one applied.",
    d: "The center compiles versioned packages per store group: a full snapshot for new or recovering registers, and ordered deltas after that. Registers download in the background, verify integrity, stage the update and apply it between transactions or at a quiet moment. Each register reports its version, so head office sees who is behind. It is hard because versions must be consistent: a register applying half an update, or a store with registers on different versions, charges differently for the same item.",
    k: ["Delta updates versus full snapshots: deltas are small and fast, but fail if one is missed, while full snapshots are simple and slow on large catalogs and weak links.", "Apply immediately versus at a safe point: immediate is current, while safe-point application avoids changing prices under an open cart."],
    p: ["Two registers in one store on different catalog versions sell the same item at different prices.", "An update applied mid-sale changes the price of items already in the cart."],
    v: "Publish a price change, and confirm every register in a test store reports the new catalog version within the target window, and a register deliberately offline catches up through ordered deltas.",
    dep: ["central-catalog-management", "sync-engine", "local-database-engine"]
  },
  "price-resolution": {
    s: "Determines the base selling price of a line from the item, unit, store, time, customer group and any manual override before discounts apply.",
    d: "The resolver walks price books from most specific to least, filters by effective date and customer group, and returns a price with its source. Manual overrides, open prices and embedded label prices are alternatives with their own permission rules. Results are cached for the sale. It is hard because it must be deterministic and explainable: the same inputs must produce the same price on every register, and a dispute over a price needs a record of which rule produced it.",
    k: ["Resolve at scan time versus at total time: scan-time shows the price immediately, but a late customer attach or a rule change may need a reprice anyway.", "Store the resolved price and its source on the line versus recompute later: storing makes returns and disputes exact, but uses more space and exposes any resolver bug permanently."],
    p: ["A resolver that silently falls back to the base price when a book fails to load charges the wrong price without any alert.", "Using the register's local time for effective dates makes a store with a bad clock sell expired prices."],
    v: "Ring an item with a store-specific price valid today only, confirm the line records price, book and rule id, then set the clock past the end date and confirm the base price is used instead.",
    dep: ["price-books", "item-master", "clock-and-ordering"]
  },
  "promotion-engine": {
    s: "Evaluates active promotions, such as buy-one-get-one, multi-buy, percent off and spend thresholds, against the cart and produces discount allocations per line.",
    d: "Rules have conditions on items, quantities, customers and time, and effects that reduce price or add a free item. The engine finds qualifying sets, chooses the best combination for the customer, and spreads each discount across lines for tax and return purposes. It reruns on every cart change. The hard part is the combinatorics: choosing which items fill which promotion is an optimization problem, and a different but equally valid result gives a different total that is hard to defend.",
    k: ["Best-for-customer optimization versus first-match in priority order: optimization is fair and predictable to shoppers, but is expensive on large carts and harder to explain.", "Evaluate promotions on the register versus on a central service: local is fast and works offline, while central keeps rules in one place and fails when the network does."],
    p: ["A promotion allocated to the wrong lines causes the wrong tax and the wrong refund on a partial return.", "Rule changes deployed between the first and last scan of a sale change the total of a cart already half-built."],
    v: "Put 5 items in a cart that qualifies for a buy-three-get-one deal in two ways, and confirm the engine applies the cheaper-to-customer outcome, shows each line's allocation, and gives the same result on a second register.",
    dep: ["discount-stacking-rules", "price-resolution", "item-master"]
  },
  "discount-stacking-rules": {
    s: "Defines which discounts may combine, in what order they apply, and which win when they conflict, with limits per line, per receipt and per customer.",
    d: "Each discount carries a type, priority, exclusivity flags and a base to apply to, such as the original price or the already-discounted price. Rules say, for example, that a coupon never stacks with a clearance price, or that employee discounts apply last. Manual discounts and loyalty offers go through the same rules. It is hard because the order matters mathematically: ten percent then five dollars differs from five dollars then ten percent, and each choice has a financial and legal effect.",
    k: ["Sequential application on the running price versus parallel on the original: sequential shrinks each later discount and protects margin, but customers often expect each percentage off the shelf price.", "Global stacking policy versus per-promotion flags: a global policy is simple to explain, while per-promotion flags give planners control and make combinations hard to predict."],
    p: ["Unspecified order between two discounts gives different totals on different register versions.", "A discount larger than the line price produces a negative line and a refund-like sale."],
    v: "Apply a 10 percent promotion, a 5 dollar coupon and an employee discount to one item in each permitted order and confirm the total follows the documented order and never goes below the configured floor.",
    dep: ["promotion-engine", "coupons-and-vouchers", "price-resolution"]
  },
  "coupons-and-vouchers": {
    s: "Validates and redeems coupons, vouchers and promotional codes: checks eligibility, limits and expiry, applies the value, and records the use so it cannot be reused.",
    d: "A coupon is scanned or entered, parsed for its issuer, value and conditions, and validated against the cart: required items, minimum spend, dates and per-customer limits. Single-use codes are marked used locally and at the center. Manufacturer coupons are reimbursed and need a clearing record. It is hard because redemption is a shared counter: two stores can redeem the same single-use code at once, and offline stores cannot know.",
    k: ["Central one-time redemption check versus local validation: a central check prevents reuse, but fails offline, while local validation always works and permits some abuse.", "Coupon as a tender versus as a discount: a tender is simple to account for, while a discount affects tax and the base price and needs promotion logic."],
    p: ["An offline store accepts a single-use code that another store already redeemed, with no way to recover the money.", "A coupon barcode photocopied or shared online redeems many times because nothing ties it to a customer."],
    v: "Redeem a single-use code on register A, then try it on register B and confirm B rejects it with the original redemption time; repeat with B offline and confirm the second use is flagged at sync.",
    dep: ["discount-stacking-rules", "sync-engine", "idempotency-and-dedupe"]
  },
  "loyalty-accounts": {
    s: "Tracks a customer's points, tier and offers: awards points on a sale, redeems them as tender or discount, and reverses them on returns.",
    d: "The register identifies the member, sends the basket or fetches the offers, and on completion posts earned points. Redemption reduces the amount due, typically as a tender with a ledger entry. Rules vary by tier, category and campaign. A central service holds the balance; the register may cache it for offline sales. It is hard because points are money-like: a return must claw back the points earned, a double submission awards twice, and offline redemptions can drive balances negative.",
    k: ["Real-time balance service versus register-cached balance: real-time prevents overspend, while caching works offline but can let two stores spend the same points.", "Points as a tender versus as a discount: tender accounting is straightforward, while discount treatment affects tax in some regions."],
    p: ["A return that refunds the money without reversing earned points lets customers farm points through returns.", "A retried upload awards the points twice because the posting has no transaction key."],
    v: "Earn 100 points on a sale, return half the items, and confirm the balance drops by the proportional points, and that replaying the same sale upload leaves the balance unchanged.",
    dep: ["customer-attach", "idempotency-and-dedupe", "tender-manager"]
  },
  "gift-cards-and-store-credit": {
    s: "Sells, activates and redeems stored-value cards and issues store credit for returns, keeping a balance that behaves like cash owed to the customer.",
    d: "Cards are activated at the register with a value, and redemption checks the balance and reduces it, ideally in real time against a central ledger. Store credit is issued at return and may be tied to an account. Unspent balances are liabilities that finance must report, and unclaimed balances can be subject to regulation. It is hard because a balance is a target for fraud: cards are copied, drained and bought with stolen tenders.",
    k: ["Central balance ledger versus value stored on the card: a central ledger is secure and revocable, while on-card value works offline and cannot be recalled.", "Allow offline redemption with a limit versus require online: a limit keeps sales moving through outages, but the risk is a drained card spending twice."],
    p: ["Activating a card against a stolen card payment turns the fraud into spendable value.", "Redeeming offline on a card with no balance leaves the retailer carrying the loss."],
    v: "Activate a card for 50, spend 30, and confirm the central balance is 20 immediately; then retry the same redemption message and confirm the balance still shows 20.",
    dep: ["tender-manager", "idempotency-and-dedupe", "fraud-and-loss-detection"]
  },
  "tax-calculation": {
    s: "Computes the tax due on each line from the item's tax category, the store's jurisdiction, exemptions and whether prices include tax.",
    d: "Rules map tax category and location to one or more rates, possibly compounding or capped, with effective dates. Exempt customers or goods use certificates or flags. Inclusive pricing extracts tax from the displayed price while exclusive pricing adds it. Discounts reduce the taxable base according to local rules. It is hard because rules differ by place and change often: items can be taxed differently when eaten in or taken away, and a return must reverse the exact tax collected.",
    k: ["Local rate tables versus a tax service call: local tables work offline and are fast, while a service stays current but adds latency and a failure mode in the sale path.", "Tax per line then sum versus tax on the receipt total: per line supports partial returns exactly, while receipt-level rounding matches some regulations and can differ by a cent."],
    p: ["A discount applied after tax instead of before taxes the wrong base and overcharges every promotional sale.", "A stale rate table after a rate change under- or over-collects until all registers update."],
    v: "Ring a taxable and an exempt item with a coupon and confirm each line shows its tax, the tax base is net of the coupon, and the totals match a hand calculation for the jurisdiction.",
    dep: ["item-master", "store-hierarchy", "rounding-and-totals"]
  },
  "rounding-and-totals": {
    s: "Defines how amounts are rounded at line, tax and total levels, and how cash totals round to the smallest coin, so every figure adds up exactly.",
    d: "Money is held as integers in the smallest unit or fixed-point decimals, never binary floating point. Rounding mode and level are explicit: per line, per tax group or per receipt. Where the smallest coin has been withdrawn, a cash total rounds to the nearest allowed value and the difference is recorded. The aim is that lines, tax and tenders sum exactly. It is hard because every region, and sometimes every retailer, has different rules, and small errors multiply across millions of sales.",
    k: ["Round per line versus per receipt: per line makes each line's price stable on returns, but the sum can differ from rounding the total, which regulation may specify.", "Integer minor units versus decimal types: integers are fast and simple, but multi-currency and fractional-unit cases need explicit scales."],
    p: ["Floating-point sums produce a cent of drift that shows up as a permanent cash difference.", "Cash rounding applied to a card total makes the terminal and receipt disagree."],
    v: "Ring 1,000 randomized baskets through two independent implementations or registers and confirm every line, tax group and total matches to the cent, and cash rounding differences sum into their own account.",
    dep: ["tax-calculation", "units-and-packs"]
  },
  "transaction-state-machine": {
    s: "Models a sale's life as explicit states, such as open, tendering, completed, voided and suspended, with only allowed transitions between them.",
    d: "Each transaction has a state and a set of events that move it. Open allows adding lines; tendering locks the cart and tracks payments; completed is final; voided and reversed leave a trace. The machine is persisted at each step, so a crash resumes from the last state. Payments are sub-state machines of their own. It is hard because failures land between states: a card approved but the receipt never printed, or a sale finished locally and never uploaded, and each needs a defined recovery.",
    k: ["Explicit state machine versus ad hoc flags: explicit states make illegal actions impossible and recovery well defined, but need discipline and tests for every edge.", "Persist after every transition versus only at completion: persisting each step survives crashes and resumes safely, at the cost of more writes on every scan."],
    p: ["A completed flag set before the payment is confirmed lets the cashier hand over goods with no payment on record.", "A transaction stuck in tendering after a crash blocks the register until someone resolves it."],
    v: "Kill power at each step from first scan to receipt print, restart, and confirm every case resumes in a valid state and either completes or cleanly cancels, with no payment unaccounted for.",
    dep: ["transaction-journal", "local-transaction-store", "tender-manager"]
  },
  "transaction-journal": {
    s: "The append-only record of everything that happened in a sale: each line, change, discount, tender, approval and reversal, in order, with who and when.",
    d: "Events are written as the cashier acts, each with a sequence number, timestamp, register and user. Completed transactions are derived from the journal, and corrections are new entries, never edits. The journal is the source for receipts, reports, audit and sync. Sequence numbers per register reveal gaps. It is hard because it must be both complete and compact: a busy register generates many events, and the journal must survive power loss mid-write.",
    k: ["Append-only events versus mutable transaction rows: append-only gives honest audit and easy sync, but needs projections for current state and more storage.", "Journal every keystroke versus only business events: fine detail helps investigations, while business events are smaller and enough for most needs."],
    p: ["Gaps in a register's sequence numbers go unnoticed and hide deleted sales.", "A journal written after the sale completes loses everything from a crash during the sale."],
    v: "Complete a sale with edits and a void line, then replay the journal into a blank projection and confirm the rebuilt receipt, totals and tenders match the original exactly, with contiguous sequence numbers.",
    dep: ["local-database-engine", "clock-and-ordering"]
  },
  "voids-and-cancellations": {
    s: "Removes a line or an entire sale before completion, or cancels one after, in a way that is permissioned, reasoned and visible in the record.",
    d: "A line void removes an item from an open cart but leaves the entry in the journal with a reason and approver. A sale cancellation reverses any payments taken and closes the transaction as voided. Post-sale voids of a finished transaction, same day and same tender, are a separate and riskier action. Receipt numbers used by voids are not reused. It is hard because voids are a classic theft vector: a cashier rings a sale, takes cash, and voids it.",
    k: ["Immediate void permitted versus approval needed: immediate keeps the line moving after a mis-scan, while approval catches abuse and delays honest corrections.", "Void as deletion versus reversing entry: reversing entries preserve evidence and numbering, but make reports show both the sale and its cancellation."],
    p: ["Voiding after cash is taken lets a cashier pocket the tender while the system shows no sale.", "Voids that leave no trace break fiscal sequence rules and fail audits."],
    v: "Void a line, then a full sale, on a test register, and confirm the journal keeps both with reason and approver, any card payment is reversed, and the day's report counts them as voids.",
    dep: ["transaction-journal", "manager-override-prompts", "reversals-and-timeouts"]
  },
  "returns-and-exchanges": {
    s: "Takes goods back against an original sale or without one, refunds or exchanges them, and restores stock and reverses tax and promotions correctly.",
    d: "The cashier finds the original by receipt code, card or customer, selects lines and quantities, and picks a reason. The system computes the refund from what was actually paid: line price after discount allocation plus its tax. The refund goes back to the original tender where possible, or to credit. Stock goes to sellable, damaged or return-to-vendor status. It is hard because the original context matters: promotions that depended on the whole basket, loyalty points, partial quantities and cross-store returns all complicate the refund.",
    k: ["Refund the price actually paid versus the current price: the paid price is fair and prevents arbitrage, but needs the original sale data and fails for no-receipt returns.", "Refund to original tender versus to store credit: original tender prevents laundering money, while store credit is faster, cheaper and keeps the customer."],
    p: ["Refunding at the current shelf price on an item that was on sale gives customers more than they paid.", "A return without receipt accepted at the register with no limits becomes a way to cash out stolen goods."],
    v: "Sell three items with a basket promotion, return one with its receipt, and confirm the refund equals its allocated paid price plus its tax, goes to the original card, and stock rises by one in the chosen status.",
    dep: ["return-policy-rules", "transaction-journal", "authorization-and-capture", "inventory-ledger"]
  },
  "return-policy-rules": {
    s: "Configurable rules deciding whether a return is allowed: time window, condition, item class, receipt presence, tender and limits per customer.",
    d: "Each item class has a window and conditions, such as non-returnable hygiene goods or longer holiday windows. The rules engine checks the original sale date, whether a receipt exists, the number of recent returns by the customer and the value, then returns allowed, needs approval or denied with a reason. Exceptions go to a manager. It is hard because policy is a mix of law and judgment: some regions mandate refund rights, and fraud rings exploit loose rules.",
    k: ["Strict automatic enforcement versus cashier discretion: automatic rules are consistent and cheap to run, while discretion keeps good customers and creates inconsistent treatment.", "Per-customer return limits versus per-transaction limits: customer limits catch serial abusers, but need identification the customer may refuse."],
    p: ["A return window measured from the wrong date, such as upload time, wrongly denies or allows returns.", "Rules that exist only on paper leave every cashier applying their own."],
    v: "Attempt returns just inside and just outside the window, with and without receipt, and confirm each yields allow, approval or deny with the documented reason, and each decision is journaled.",
    dep: ["returns-and-exchanges", "item-master", "manager-override-prompts"]
  },
  "receipt-composer": {
    s: "Builds the receipt from a completed transaction using a template: store header, lines, discounts, tax breakdown, tenders, codes for returns and legal text.",
    d: "A template engine takes the journaled transaction and renders it for each channel: narrow thermal text, a formatted image, a PDF or an HTML message. Content includes localized text, the tax summary, loyalty balance, barcode or QR code for returns, and region-specific legal lines. Reprints are marked as copies. It is hard because the receipt is evidence: it must match the journal exactly, fit a fixed paper width in every language, and keep working when the template or data is partly missing.",
    k: ["Template per channel versus one model rendered by channel adapters: separate templates give full control of each look, while one model keeps the content consistent.", "Render at sale time and store versus re-render on reprint: storing gives the exact original, while re-rendering uses current templates and can differ from what the customer got."],
    p: ["A long item name wraps and pushes the total off the page in a narrow print width.", "A reprint without a copy marker lets customers present duplicate receipts for returns."],
    v: "Complete a sale with a discount, two tax rates and a split tender, print the receipt, and verify by hand that lines, tax summary and tenders add up, and a reprint is clearly marked as a copy.",
    dep: ["transaction-journal", "tax-calculation", "receipt-printer-driver"]
  },
  "receipt-delivery-channels": {
    s: "Sends the receipt through the customer's chosen route: printed, emailed, texted, shown as a code or held in an app, with consent and retry.",
    d: "The register records the preference, from a profile or a prompt, and hands a rendered receipt to a delivery service. Digital delivery needs an address, consent and a queue with retries, because the register cannot wait for a mail server. Printed receipts may be skipped but must be reproducible. The hard parts are privacy and failure: addresses typed by customers at a counter are error-prone, and a failed digital send needs a fallback so the customer is not left with nothing.",
    k: ["Ask at every sale versus default by profile: asking is explicit and costs seconds per customer, while defaults are quick and risk sending to a stale address.", "Send from the register versus from a central service: central sending retries reliably and keeps credentials off devices, but needs the transaction uploaded first."],
    p: ["A typo in an email address sends a receipt with partial card details and purchases to a stranger.", "No fallback when sending fails leaves a customer with no proof of purchase for a return."],
    v: "Choose emailed receipt for a sale with the mail service down, and confirm the sale completes, the message is queued, and it is delivered once the service returns, exactly once.",
    dep: ["receipt-composer", "store-and-forward-queue", "data-privacy-controls"]
  },
  "fiscal-compliance-module": {
    s: "Connects the register to fiscal devices or tax-authority services where law requires signed, sequential, tamper-evident records of every sale.",
    d: "Depending on the country, a certified fiscal printer or a service signs each receipt, assigns the sequential number, keeps a protected memory and issues daily closing reports. Some regimes require reporting each sale to the authority in near real time. The register routes every transaction through the module before the receipt can be given. It is hard because of certification and failure: the module is often a black box with its own firmware, and when it fails the store may be legally unable to sell.",
    k: ["Hardware fiscal device versus software signing service: hardware is tamper-resistant and works offline, while a service is cheaper to update and needs connectivity and trust in its operator.", "Block sales when the module fails versus continue and report later: blocking is compliant and stops trade, while continuing keeps revenue and may be illegal."],
    p: ["A sale rung and paid before the fiscal signature returns produces a receipt with no legal number.", "A software update that changes receipt layout invalidates a certified configuration."],
    v: "Complete a sale and confirm the receipt carries the module's signature and the next sequential number, then run the daily closing report and verify it matches the total of those receipts.",
    dep: ["transaction-journal", "device-abstraction-layer", "regional-compliance"]
  },
  "inventory-ledger": {
    s: "The store's record of stock by item, location and status, built from every movement: sale, return, receipt, transfer, count and adjustment.",
    d: "Rather than a single editable number, the ledger keeps movements with quantity, type, reason and reference, and derives on-hand by summing. Statuses separate sellable, reserved, damaged and in-transit stock. Registers write movements locally and upload them; the center merges them with deliveries and counts. It is hard because the physical world disagrees: theft, mis-scans and unrecorded deliveries drift the number, and negative stock from sales ahead of receiving must be tolerated.",
    k: ["Movement ledger versus a current-quantity column: a ledger explains every change and merges concurrent writers safely, but needs summaries for fast reads.", "Allow negative stock versus block the sale: allowing keeps sales moving when receiving lags, while blocking protects accuracy and stops a customer who can see the item on the shelf."],
    p: ["Updating quantity in place from two registers loses a decrement when they sync.", "Treating on-hand as available double-sells goods that are reserved or damaged."],
    v: "Sell 3, receive 10 and count 12 against a starting 5, and confirm the ledger lists each movement and the derived on-hand equals the count, with a variance of zero recorded as a reconciling adjustment.",
    dep: ["local-database-engine", "item-master", "idempotency-and-dedupe"]
  },
  "sale-stock-decrement": {
    s: "Reduces stock as each sale completes, with the right item, quantity, unit and location, and reverses it when the sale is voided or returned.",
    d: "On completion, each line produces a movement in base units, including components of bundles and variants. Decrement happens locally and immediately so the next cashier sees the change, and is queued to the center. Weight items decrement by measured weight. Return movements go to the status chosen at the return. It is hard because the effect must happen exactly once: an uploaded retry must not decrement again, and a void after upload needs a reversing movement.",
    k: ["Decrement at line add versus at completion: at line add shows availability early and holds stock, while at completion avoids holding for carts that are never finished.", "Decrement locally first versus wait for center acknowledgement: local first is fast and offline-safe, but means stores briefly disagree about the same stock."],
    p: ["A retried upload decrements the same sale twice and stock drifts downward.", "Bundle sales decrementing only the parent leave component stock overstated."],
    v: "Sell a bundle of three components, replay the upload, void the sale, and confirm each component decreased once, increased once on the void, and ends at its original quantity.",
    dep: ["inventory-ledger", "modifiers-and-bundles", "idempotency-and-dedupe"]
  },
  "stock-availability-service": {
    s: "Publishes near-real-time stock by item and store to other channels such as the website, so they can show and promise only what exists.",
    d: "The service aggregates ledger movements into available quantities, subtracts reservations and safety buffers, and exposes them by query or event. Online channels reserve stock against it for click-and-collect. Updates arrive from stores with varied delay. It is hard because it is a distributed counter with no single clock: two channels can sell the last unit within seconds, and the safety buffer that prevents this also hides sellable stock.",
    k: ["Safety buffer versus exact availability: a buffer reduces oversells at the cost of showing out-of-stock items that are actually on the shelf.", "Reservation with expiry versus immediate decrement: reservations protect pending orders, but need timeouts and cleaning to avoid locking stock."],
    p: ["A store whose sync is hours behind reports stock it already sold.", "Reservations never released after an abandoned order slowly drain apparent availability."],
    v: "Reserve the last unit through the online channel and confirm a register in store sees it as unavailable within seconds, then let the reservation expire and confirm it returns to available.",
    dep: ["inventory-ledger", "sync-engine", "cross-store-lookup"]
  },
  "receiving-and-transfers": {
    s: "Records goods arriving from suppliers and moving between stores: expected quantities, what was actually received, discrepancies and in-transit status.",
    d: "A purchase order or transfer advice creates an expected receipt. Staff scan what arrives, the system compares against expected, and records shortages, overages and damage. Stock enters the ledger on confirmation, and in-transit stock is held separately for transfers. Cost may be captured for valuation. It is hard because paperwork and reality diverge: unlabelled cartons, partial deliveries and substitutions need rules, and unreceived goods sit invisible until counted.",
    k: ["Blind receiving versus receiving against expected quantities: blind receiving counts honestly, while expected quantities are faster but let staff confirm what they never counted.", "Receive at the door versus at putaway: at the door is timely, while at putaway reflects what is really sellable."],
    p: ["Confirming a delivery from the delivery note without counting inflates stock by the shortage.", "In-transit transfers never received by the destination vanish from both stores' stock."],
    v: "Receive a delivery with one shortage and one damaged unit against a purchase order, and confirm the ledger shows the received sellable quantity, the damaged status, and a discrepancy entry visible to purchasing.",
    dep: ["inventory-ledger", "scanner-input-path", "item-master"]
  },
  "stock-counts": {
    s: "Compares physical counts, full or cyclic, with the ledger and posts the differences as adjustments, with variances reviewed before they are accepted.",
    d: "Counts are scheduled by area or by item class. Staff scan items with a handheld, quantities are recorded against a snapshot of expected stock, and variances are calculated. Large variances trigger a recount before posting. Sales during the count need a freeze or a movement cutoff so numbers are comparable. It is hard because counting takes time while the store trades: the book number changes during the count, and a careless count creates the very error it was meant to fix.",
    k: ["Full count versus cycle counting: full counts give a clean reset but close or disrupt the store, while cycle counts spread effort and find drift sooner.", "Freeze sales in the counted area versus reconcile movements after: freezing is simple, while reconciliation keeps trading and needs careful cutoff logic."],
    p: ["Counting without a movement cutoff posts variance that is really just sales made during the count.", "Accepting the first count without a recount for large differences bakes in miscounts."],
    v: "Count a shelf during which two units sell, and confirm the posted variance equals the true count minus the book quantity net of those sales, and a large variance forces a recount before posting.",
    dep: ["inventory-ledger", "scanner-input-path", "shrink-and-adjustments"]
  },
  "shrink-and-adjustments": {
    s: "Records losses and corrections: theft, damage, expiry and write-offs, each with a reason, approver and value, so shrink can be measured and managed.",
    d: "Adjustments are movements with a reason code and, above limits, an approval. Damaged and expired stock moves to a status and is then written off. Totals by reason feed shrink reports against sales. It is hard because shrink is the sum of unknowns: counts reveal a gap but not its cause, and reason codes are chosen by the person who may be responsible.",
    k: ["Mandatory reason codes versus free text: codes can be reported on and compared, but staff choose the most convenient rather than the true one.", "Approval on every adjustment versus above a threshold: universal approval catches everything and clogs managers, while thresholds let small losses go unreviewed."],
    p: ["An adjustment with no approver is the easiest way to hide theft in inventory.", "Writing off damaged goods without removing them physically leaves them on the shelf for sale."],
    v: "Write off 5 units as damaged above the approval limit and confirm it requires a manager, produces a ledger movement and appears in the shrink report under the damage reason.",
    dep: ["inventory-ledger", "manager-override-prompts", "audit-trail"]
  },
});
