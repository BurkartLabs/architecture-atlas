// Details for the point-of-sale plate, part 1: reporting, back office, register app, scanning.
ATLAS.details("point-of-sale", {
  "sales-reporting": {
    s: "Aggregates completed transactions into totals by store, department, item, hour and tender, so managers can see what sold and compare it with plan and prior periods.",
    d: "Reports read from a central copy of the transaction journal, loaded continuously or in batches, never from live registers. Facts such as lines, tenders and discounts are joined to dimensions such as item hierarchy, store and calendar. Returns and voids enter as negative or reversing rows so net figures are correct. The hard part is definition: gross, net, and net of tax differ, late-arriving offline sales change yesterday's totals, and a store whose clock was wrong lands in the wrong day.",
    k: ["Business day versus calendar day: grouping by trading day matches how the store thinks, but needs a closed-day marker and breaks across time zones and overnight shifts.", "Pre-aggregated rollups versus querying raw lines: rollups are fast for dashboards, but every new question needs a new rollup and corrections must be replayed."],
    p: ["Late offline uploads silently change totals already sent to management, so two people quote different numbers for the same day.", "Net sales computed before discount allocation to lines makes department margins wrong while store totals still match."],
    v: "Ring a known set of sales, one return and one voided sale on a test register, close the day, and confirm the report totals equal the hand-computed gross, discounts, returns, tax and net by tender.",
    dep: ["transaction-journal", "warehouse-feed", "end-of-day-close"]
  },
  "margin-and-cost-analysis": {
    s: "Joins sales with item cost to show gross margin by item, category and store, and flags items sold below cost or with eroding margin.",
    d: "Cost comes from the purchasing or accounting side and changes over time, so each sale line either captures a cost snapshot at sale time or is joined later to a cost history by effective date. Promotions, markdowns and vendor funding adjust the effective cost or revenue. Weighted-average and last-received costs give different margins for the same sale. The difficulty is that register data alone cannot produce margin: it depends on cost feeds that arrive late, are missing for new items, and are revised after the fact.",
    k: ["Cost snapshot at sale versus later join: the snapshot is stable and auditable, but later cost corrections never reach historical margin without a restatement process.", "Item-level versus category-level margin: item-level finds problems precisely, but needs complete costs that many stores lack, so category rollups often substitute."],
    p: ["Items with a zero or missing cost report one hundred percent margin and hide real problems in the average.", "Bundles and kits assigned the full price to one component distort margin for every other component."],
    v: "Sell a costed item at a discount and confirm the margin report shows revenue after discount minus the cost in effect on the sale date, and shows the same figure after a later cost change.",
    dep: ["sales-reporting", "item-master", "price-resolution"]
  },
  "exception-reports": {
    s: "Lists unusual activity by cashier and register: voids, no-sale drawer opens, overrides, large discounts and returns without receipts, for loss-prevention review.",
    d: "Each risky action is already written to the journal or audit trail with its actor, reason and approver. Exception reports compare counts and values per cashier or shift against peers and thresholds, and rank outliers. Rules range from simple counts to patterns such as a void shortly after a cash tender. The challenge is signal: busy registers and training modes produce many harmless events, so unfiltered reports are ignored, while thresholds set too loosely miss slow, steady theft.",
    k: ["Fixed thresholds versus peer-relative scoring: thresholds are easy to explain and defend, but peer comparison adapts to busy stores and finds people who are unusual for their own role.", "Report to managers versus flag at the register: reports catch patterns without slowing the line, but only act after the loss has happened."],
    p: ["Training-mode and test transactions left in the data inflate void and return counts and bury real cases.", "A report that names an employee before the context is reviewed leads to accusations from ordinary shift patterns."],
    v: "Perform ten voids on one test cashier among otherwise normal activity and confirm the exception report ranks that cashier first with each void linked to its transaction and approver.",
    dep: ["audit-trail", "fraud-and-loss-detection", "transaction-journal"]
  },
  "tax-and-fiscal-reports": {
    s: "Produces the tax-by-rate, exemption and fiscal totals that must be filed or reconciled with authorities, tied back to individual receipts.",
    d: "Every transaction line stores the tax category, rate, jurisdiction and amount actually charged, so reports sum by period and rate without recomputing. Fiscal regimes add sequential numbering, daily closing totals and signed archives that auditors can verify. Exemptions, tax-inclusive pricing and rounding at line versus receipt level all change the amounts. The hard part is that rules and rates change on specific dates, and returns of old sales must use the rate at the time of the original sale.",
    k: ["Store the tax charged on each line versus recompute at report time: stored values reproduce what customers paid, while recomputation drifts when rates or rules change.", "One report per jurisdiction versus a general tax ledger: per-jurisdiction output matches filing forms, but a ledger adapts to new regimes with less custom work."],
    p: ["Recomputing tax from current rates when reporting an old period produces totals that do not match issued receipts.", "A return processed after a rate change refunds a different tax than was collected."],
    v: "Sell items at two rates across a rate-change date, return one sale from before the change, and confirm the report shows collected tax by original rate with the return netting against it.",
    dep: ["tax-calculation", "transaction-journal", "fiscal-compliance-module"]
  },
  "warehouse-feed": {
    s: "Streams or batches transactions, stock movements and cash events to a central warehouse so finance, planning and analytics use the same record the registers wrote.",
    d: "An extract process reads the central journal in order, tags each record with a sequence, and delivers it to analytical storage, usually with a defined schema and a replay mechanism. Consumers rely on exactly-once effect through keys, not on exactly-once delivery. Schema changes in the register data must be versioned, and backfills must not duplicate rows. The difficulty is completeness: offline stores upload hours or days late, and a feed that only moves forward misses corrections to sales already extracted.",
    k: ["Change-data capture versus nightly batch export: continuous capture gives fresh numbers and catches corrections, but needs ordering, replay and monitoring that batch files avoid.", "Wide denormalized rows versus normalized facts: denormalized rows are easy to query, but duplicate item and store attributes and hide corrections to them."],
    p: ["A feed that watermarks on upload time instead of transaction time drops late offline sales from the period they belong to.", "Changing a column meaning without a version silently corrupts every downstream report."],
    v: "Replay one day of transactions twice into an empty warehouse and confirm row counts and totals equal the store journal exactly, with no duplicates and a late offline sale landing in its own day.",
    dep: ["transaction-journal", "store-and-forward-queue", "idempotency-and-dedupe"]
  },
  "store-hierarchy": {
    s: "The tree of company, region, store and register that determines who sees which data, which prices and rules apply where, and how reports roll up.",
    d: "Nodes carry attributes such as currency, tax region, time zone, trading hours and price zone. Settings are inherited downward and overridden at the lowest level that needs them. Users are granted roles at a node and see everything beneath it. Franchises, shop-in-shops and temporary pop-up stores do not fit a single clean tree, so many systems support multiple hierarchies for different purposes. The hard part is changes: moving a store between regions mid-period affects history, permissions and report comparisons.",
    k: ["Single tree versus multiple hierarchies: one tree is simple to reason about, but pricing, reporting and permissions often need different groupings of the same stores.", "Inherited settings with local overrides versus fully explicit settings: inheritance reduces setup work, but an override deep in the tree is easy to forget and hard to audit."],
    p: ["Moving a store to a new region rewrites historic report groupings unless the hierarchy is effective-dated.", "A role granted at the wrong node exposes every store below it, not just one."],
    v: "Change a price at region level and an override at one store, then confirm that registers in the region show the new price and the overridden store keeps its own, as shown by the effective-settings view.",
    dep: ["central-catalog-management", "access-control-and-roles"]
  },
  "central-catalog-management": {
    s: "The head-office tool and service where products, costs, hierarchies, tax categories and attributes are created, approved and prepared for distribution to stores.",
    d: "Merchandisers create items with attributes, codes, categories and vendor data, usually through forms, spreadsheet import or an upstream system. Changes pass through draft, approval and effective-date states before they are published. Validation enforces unique codes, required fields and tax mapping. The central model is richer than any register needs, so a publish step compiles a compact version per store group. It is hard because of volume and timing: bulk imports of tens of thousands of items must not block stores, and a bad import must be reversible.",
    k: ["Draft and approval workflow versus direct edits: workflow prevents accidental price changes on live items, but slows urgent corrections that stores need now.", "One master record versus store-specific item copies: a master keeps data consistent, while copies let stores differ at the cost of drift and duplicate maintenance."],
    p: ["A duplicate barcode assigned to two items makes the register sell whichever loaded last.", "A bulk import with a misplaced decimal point reaches every store before anyone checks the preview."],
    v: "Import a file of 1,000 items with three deliberate errors, confirm the three are rejected with reasons, the rest are staged, and publishing them makes them appear in a test register's lookup.",
    dep: ["item-master", "catalog-distribution", "code-to-item-mapping"]
  },
  "price-and-promo-scheduling": {
    s: "Lets head office define prices and promotions with start and end times per store group, and stage them so each store switches at the right moment.",
    d: "A schedule holds a set of price changes or promotion definitions with effective ranges, targeting rules and priorities. The distribution layer ships them ahead of time so registers hold both current and upcoming versions and switch locally by clock. Overlaps are resolved by priority and specificity. The hard part is the boundary: stores in different time zones, a register offline at the switch moment, and shelf labels that must change in step with the register to avoid disputes.",
    k: ["Ship in advance and switch locally versus push at the moment: local switching works offline and avoids a thundering herd, but depends on correct register clocks.", "Overlapping rules resolved by priority versus rejecting overlaps: priority is flexible, while rejection is easier to reason about and test but frustrates planners."],
    p: ["A promotion ending at midnight store-local time is applied in head-office time, so stores in other zones sell it at the wrong price for hours.", "Two overlapping schedules with equal priority apply in an arbitrary order that changes between releases."],
    v: "Schedule a price change for a minute in the future on a test store, with the register offline, and confirm the register switches on its own at that minute and the sale line shows the new price.",
    dep: ["price-books", "promotion-engine", "catalog-distribution", "store-hierarchy"]
  },
  "head-office-consolidation": {
    s: "Combines every store's sales, cash, stock and tax data into company-level figures and hands them to finance for accounting and period close.",
    d: "Store day-closes are collected, validated against expected counts, and transformed into summarized postings by tender, tax rate, department and store. The postings go to the accounting system as journal entries. Differences between expected and counted cash are posted separately as over or short. It is hard because the numbers must reconcile: the sum of tenders must equal sales plus tax, every store must be accounted for exactly once, and a missing or late store blocks the company close.",
    k: ["Summary postings versus line-level export: summaries keep the ledger small and readable, but lose the ability to drill from a ledger figure to the receipts behind it.", "Close when all stores report versus close on schedule with estimates: waiting is exact, while scheduling avoids one dead register delaying the company at the cost of later adjustments."],
    p: ["A store that never completes its day-close leaves a silent gap that is found only at month end.", "Posting tender and sales in different periods creates a permanent reconciling difference."],
    v: "Close a test day across three stores, one of them offline until later, and confirm the consolidation flags the missing store, then reconciles to zero difference once its data arrives.",
    dep: ["end-of-day-close", "sales-reporting", "settlement-and-reconciliation"]
  },
  "cross-store-lookup": {
    s: "Lets a cashier or customer see stock at other stores and order or reserve an item for pickup or delivery from another location.",
    d: "The register queries a central availability service, or a regional cache, for stock by item and store, then creates a transfer request, reservation or customer order. The store that holds the item sees a pick task, and the transaction links the sale to the fulfilling location. Data is only as fresh as each store's last sync, so results are estimates. The hard part is accuracy and ownership: stock can be sold in between, returns may go to a different store, and revenue and inventory must be credited to the right location.",
    k: ["Query live stock from the other store versus central snapshot: live is accurate but fails when the other store is offline, while snapshots always answer and may be wrong.", "Hold stock on promise versus first-come at pickup: holding avoids disappointed customers, but locks inventory that may never be collected."],
    p: ["Showing 'in stock' from an hours-old snapshot sends a customer to a store whose last unit sold at lunch.", "A cross-store return credits the revenue reversal to the wrong store and breaks both stores' reports."],
    v: "Reserve the last unit of an item at store B from store A's register and confirm store B's availability drops immediately and A's order shows the pickup location and reservation expiry.",
    dep: ["stock-availability-service", "inventory-ledger", "store-hierarchy"]
  },
  "back-office-console": {
    s: "The web or desktop application where managers handle store-level tasks outside the sale flow: adjusting stock, approving requests, viewing cash and editing local settings.",
    d: "Typically a server-hosted interface over the same services the registers use, with role-based screens. Common functions are approving price overrides, reviewing day-close differences, receiving deliveries, scheduling staff and fixing mis-keyed sales through documented adjustment transactions rather than edits. In offline-capable stores it may run on the in-store server. It is difficult because it holds the powers that bypass the register's controls, so each action must be permissioned, reasoned and logged.",
    k: ["Adjustment transactions versus editing past records: adjustments preserve an honest history, but make corrections feel indirect and need clear tooling.", "Console on the central server versus on the in-store server: central is simpler to run, while a store server keeps managers working during a network outage."],
    p: ["A console that edits historical sales in place leaves the receipts and the books disagreeing.", "A shared manager login makes it impossible to say who approved a change."],
    v: "Correct a mis-keyed quantity from the console and confirm the original sale is unchanged, an adjustment transaction exists with the manager's name and reason, and the stock level moved by the difference.",
    dep: ["access-control-and-roles", "audit-trail", "in-store-server"]
  },
  "register-app-shell": {
    s: "The application frame that hosts the sale screen and other flows, owns navigation, the session, device connections and the connection to local and central services.",
    d: "The shell starts at boot, loads configuration, opens the local database, connects peripherals and routes to sign-in. It provides common services to screens: current cashier, current shift, transaction context, localization, theme and error display. Screens are modules that can be enabled per store type. Rendering runs on a native toolkit or an embedded web view. The hard part is resilience: a crash must restart quickly into the same open transaction, and a stuck screen must never leave a customer unable to pay.",
    k: ["Native application versus web view: native gets device access and speed, while a web view shares code with other channels and updates faster but needs a native bridge.", "Single process versus separate processes for payment and UI: separation limits the damage of a crash and scope of certification, while adding inter-process messaging to keep reliable."],
    p: ["A crash during tender restarts the app with no memory of a half-completed card payment.", "A long-running modal blocks all input and leaves the cashier with only a power-cycle."],
    v: "Kill the register process mid-sale, restart it, and confirm it returns to sign-in, restores the open cart and the shift state, and shows any in-flight payment for resolution before new sales.",
    dep: ["local-database-engine", "device-abstraction-layer", "configuration-and-feature-flags"]
  },
  "cashier-sign-in": {
    s: "Identifies the person at the register by badge, code, card or fingerprint and starts a session tied to a role, a shift and a drawer.",
    d: "Credentials are checked locally against a cached roster so sign-in works offline, with stronger factors for managers. A successful sign-in creates a session that every transaction and audit event cites. Sessions lock after inactivity and sign-out clears the cart or holds it. It is hard because speed and accountability conflict: staff share credentials to avoid typing, and a fast sign-in without a real check makes every later audit entry untrustworthy.",
    k: ["Badge or short PIN versus full password: fast entry keeps the line moving, but short secrets are easily shared and observed.", "Local roster cache versus central authentication at each login: cached works offline, but a terminated employee may sign in until the next roster refresh."],
    p: ["Employees sharing one code means voids and discounts are attributed to the wrong person.", "A roster not refreshed for days still accepts a dismissed employee's badge."],
    v: "Disable a user centrally, sync the register, and confirm that user's badge is rejected, while a still-active user can sign in with the network unplugged and the session appears in the audit trail.",
    dep: ["access-control-and-roles", "local-database-engine", "audit-trail"]
  },
  "sale-screen-and-cart": {
    s: "The main screen: a running list of lines with quantity, price and discounts, a total, and the actions to change, remove, discount or tender.",
    d: "The cart is a model object holding lines, applied discounts, customer, tax and totals. Every change, whether from a scan or an edit, goes through a command that updates the model, reprices the cart and journals the event. The screen only renders that model. The hard parts are speed and honesty: repricing must feel instant on a cart of fifty lines, the displayed total must always equal what will be charged, and edits during a pending payment must be blocked or handled explicitly.",
    k: ["Reprice the whole cart on each change versus incremental updates: whole-cart repricing is correct with interacting promotions, but costs time that incremental updates avoid and can get wrong.", "Mutable cart versus event-sourced command log: a log gives replay and audit for free, but needs more code to display the current state."],
    p: ["Allowing a quantity change after card authorization leaves the total charged differing from the receipt.", "Display rounding that differs from the engine's total produces a one-cent surprise at payment."],
    v: "Scan twenty items with two promotions active, edit three lines, and confirm the displayed total always equals the amount sent to the card terminal and the amount printed on the receipt.",
    dep: ["price-resolution", "promotion-engine", "transaction-state-machine", "rounding-and-totals"]
  },
  "item-search-and-lookup": {
    s: "Finds items without a barcode: by name, partial code, category, quick-key grid or image, with results from the local catalog in a fraction of a second.",
    d: "A local search index covers names, codes and attributes, with prefix, tolerance for typos and ranking by frequent sales. Fast-entry paths include quick-key pages for produce or menu items and a number-pad lookup by short code. Results show price, stock and variants. The hard part is speed on small hardware and quality of results: a thousand near-identical product names, accents and abbreviations, and the need to work with the catalog still downloading.",
    k: ["Full-text index on the register versus server-side search: local search is instant and offline, but needs index maintenance and memory the register may lack.", "Free search versus curated quick keys: quick keys are the fastest for the top items, but need upkeep and stale layouts mislead staff."],
    p: ["A search that returns discontinued items first sells products that are no longer stocked.", "Slow search on a large catalog makes cashiers skip it and key in the wrong item."],
    v: "On the lowest-spec register, with a 100,000-item catalog, type a partial name and confirm the first useful result appears within 200 ms and picking it adds the correct item to the cart.",
    dep: ["item-master", "code-to-item-mapping", "local-database-engine"]
  },
  "customer-attach": {
    s: "Associates a customer record with the sale by loyalty card, phone number or lookup, for pricing, receipts, tax exemption or account purchases.",
    d: "The cashier or customer identifies themselves by scanning a card, entering a phone number or using an app code. The register fetches a profile from a local cache or the central service, and attaches it to the transaction so promotions, points and exemptions apply. Collection is optional and must respect consent. The hard part is availability and privacy: lookups must not stall the line when the service is slow, and the register must not display more personal data than the cashier needs.",
    k: ["Look up at the start versus at the end of the sale: early attach applies member prices while scanning, but delays the first item when the lookup is slow.", "Show full profile versus a minimum: a full profile helps service, while a minimum limits what bystanders and staff can see."],
    p: ["Attaching the wrong customer by phone-number typo gives their loyalty points and receipt to a stranger.", "A failing lookup that blocks the sale makes cashiers skip attach for all customers."],
    v: "Attach a member by card with the network blocked and confirm a cached profile applies member pricing, and with no cache the sale continues as a guest and the points are claimed later.",
    dep: ["loyalty-accounts", "data-privacy-controls", "local-transaction-store"]
  },
  "hold-and-recall": {
    s: "Parks an unfinished sale so the cashier can serve another customer, and brings it back later by a number or a name.",
    d: "A held transaction is saved with its lines, prices and customer, flagged as suspended, and given a retrieval key. Recall restores the cart and reprices it with current rules, or keeps the old prices depending on policy. Expiry removes stale holds. In multi-register stores holds can be shared through the store server so any register can recall. It is hard because held carts can reserve stock or promotions, and abandoned holds accumulate and distort reports.",
    k: ["Reprice on recall versus keep the held price: repricing is fair to the retailer if prices changed, while keeping the price is fair to the customer who was already quoted.", "Local hold versus store-wide hold: local is simple and fast, while store-wide lets customers move between registers but needs the server to be up."],
    p: ["A hold never recalled keeps a coupon or serial-numbered item locked, so the next customer cannot buy it.", "Recalling a cart on a different register after a shift change attributes the sale to the wrong drawer."],
    v: "Hold a sale on register one, recall it on register two, and confirm the cart is intact, the coupon is applied once, and the hold record is gone from register one.",
    dep: ["sale-screen-and-cart", "local-transaction-store", "in-store-server"]
  },
  "customer-facing-display": {
    s: "A second screen that shows the customer what is being rung up and what is owed, and carries prompts, signature and tip entry, and sometimes advertising.",
    d: "The display is driven by the same cart model as the cashier screen but through a separate view with larger text and fewer controls. It may be a pole display with two text lines, a secondary monitor or a tablet. For payments it shows prompts and receives choices such as tip or receipt type. Content must stay in sync with the actual transaction. The hard part is trust and reliability: the customer relies on what they see, so a lag or mismatch with the cashier's total causes disputes.",
    k: ["Mirror the cart versus a simplified view: a mirror guarantees the same numbers, while a simplified view reads better at distance and hides internal codes.", "Display as a dumb output versus an input device: input enables tipping and signing without a separate terminal, but then it joins the security scope."],
    p: ["A display that updates after the cashier's total lets the customer see an old figure when they approve payment.", "Advertising content left running on the display during a payment prompt hides the amount."],
    v: "Ring a three-item sale with a coupon and confirm the customer display shows each line and the final total within one second, matching the cashier screen digit for digit at tender.",
    dep: ["sale-screen-and-cart", "device-abstraction-layer"]
  },
  "self-checkout-mode": {
    s: "A customer-operated variant of the register with guided steps, weight verification and an attendant approval path for age checks and exceptions.",
    d: "The flow is the same cart and tender logic wrapped in a simplified, guided interface. A scale under the bagging area checks each item against its expected weight and raises an alert when they disagree. Restricted items, such as age-limited goods, pause for attendant approval from a supervisor panel. It is hard because it replaces the cashier's judgment: the system must catch honest mistakes without constantly interrupting, and still make theft costly enough to deter.",
    k: ["Strict weight checking versus lenient tolerance: strict catches more theft, but produces false alarms with bags, produce and light items that frustrate honest shoppers.", "Attendant approval for every exception versus automated rules: approval is safe, but a single attendant watching many lanes becomes the bottleneck."],
    p: ["A weight database with wrong item weights causes a stream of false alerts that attendants learn to dismiss.", "No fallback when the scale fails leaves every lane unusable until service."],
    v: "At a lane, scan an item and place a different-weight item in the bag, and confirm the system halts with a weight alert, calls the attendant, and logs the intervention with the item and the resolution.",
    dep: ["sale-screen-and-cart", "scale-integration", "manager-override-prompts"]
  },
  "manager-override-prompts": {
    s: "Requires a second, higher-privileged person to approve sensitive actions at the register, such as price changes, large discounts, voids and returns without a receipt.",
    d: "Each action has a permission and a threshold. When the signed-in cashier lacks it, the register prompts for a manager's badge, code or remote approval, records who approved and why, and continues. Remote approval sends the request to the manager's device. Reason codes are required and stored. It is hard because approvals add friction in a queue, so staff look for shortcuts: leaving a manager signed in, sharing codes or setting thresholds high enough that nothing prompts.",
    k: ["On-the-spot manager credential versus remote approval: on the spot is secure and offline-safe, while remote spares the walk but needs connectivity and a manager who is watching.", "Per-action thresholds versus blanket role limits: thresholds target real risk, but add configuration that drifts and confuses cashiers."],
    p: ["A manager left signed in turns every override into a rubber stamp attributed to them.", "Offline overrides recorded without the approver's identity cannot be audited later."],
    v: "As a cashier, attempt a 50 percent discount above your limit, confirm a prompt appears, approve with a manager badge, and find the approver, reason and amount in the audit trail.",
    dep: ["access-control-and-roles", "audit-trail", "cashier-sign-in"]
  },
  "scanner-input-path": {
    s: "Brings scanned characters into the register app from a handheld, fixed or presentation scanner, normally by acting like a keyboard or a serial device.",
    d: "Most scanners emit the decoded string as keystrokes followed by a terminator, so the app must tell scanner input from typing by timing or prefix characters. A more robust path uses a direct device interface that delivers whole scans with the symbology type. Scanners are configured with prefixes, suffixes and enabled symbologies. The hard part is reliability: keystroke-mode scans land in whatever field has focus, split across slow screens, or trigger shortcuts when a focused control interprets a character.",
    k: ["Keyboard wedge versus direct device interface: a wedge works with anything and needs no driver, while a direct interface delivers whole, typed scans but needs a device layer.", "Detect scans by inter-key timing versus configured prefix: timing needs no scanner setup, but fails on slow machines, and a prefix is exact but must be set on every unit."],
    p: ["A scan arriving while a dialog has focus is typed into a text field and corrupts a quantity or a name.", "A scanner reset to factory settings after a battery swap stops sending the terminator, so scans never complete."],
    v: "Scan 50 items rapidly on a loaded register and confirm every scan adds exactly one correct line, that scans during a dialog are rejected, and the log shows each raw string and symbology.",
    dep: ["device-abstraction-layer", "symbology-and-check-digits"]
  },
  "symbology-and-check-digits": {
    s: "Recognizes which barcode family a scan belongs to, strips format characters, and validates the check digit so misreads are rejected instead of sold.",
    d: "Retail products use a small set of one-dimensional codes with fixed lengths and a check digit computed from the other digits. Other codes cover cases, coupons, internal labels and two-dimensional symbols that carry more data. The decoder normalizes variants, such as shorter or expanded forms of the same product code, to one canonical key. It is hard because of ambiguity: a short code can be a product, a coupon or a loyalty card, and the same number may be valid in two families.",
    k: ["Canonicalize to a single key versus store every variant as a separate code: one key avoids duplicates, while storing variants is simpler to look up but makes maintenance error-prone.", "Reject on bad check digit versus accept and flag: rejecting prevents misreads from selling the wrong item, while flagging works for stores with legacy internal codes."],
    p: ["A damaged label that decodes with one digit wrong passes if the check digit is not verified, and sells the wrong product.", "Leading-zero loss when a code is stored as a number makes lookups fail for some products."],
    v: "Scan a valid code, the same code with one digit changed, and a short-form variant, and confirm the first and third resolve to the same item and the second is rejected with a clear message.",
    dep: ["scanner-input-path", "code-to-item-mapping"]
  },
  "variable-measure-barcodes": {
    s: "Handles labels printed in store for weighed or cut goods, where the code carries the item and the price or weight rather than just an identity.",
    d: "Store-printed labels use a reserved prefix, followed by an item number and an embedded price or weight with its own check digit. The register parses the fields, looks up the item by its number, and either takes the embedded price as the line price or computes it from weight and unit price. The scheme is local to the retailer. The hard part is agreement: the label printer, the scale and the register must interpret the same fields, and a unit price change invalidates labels already on the shelf.",
    k: ["Price embedded in the code versus weight embedded: embedded price is trivial to ring up, but old labels sell at stale prices, while embedded weight lets the register apply the current price.", "Retailer-specific parsing rules versus a fixed global scheme: configurable rules fit every store's labels, but each new format is a risk to test."],
    p: ["Labels printed before a price change sell at the old price until they are all used.", "A scale that rounds weight differently than the register produces a one-cent mismatch against the label."],
    v: "Scan a label for 1.250 kg of an item priced at 4.00 per kg and confirm the line shows 1.250 kg and 5.00, and that after a price change a re-scan of the same label shows the new price.",
    dep: ["symbology-and-check-digits", "item-master", "units-and-packs"]
  },
  "scale-integration": {
    s: "Reads weight from a certified scale and delivers a stable, legal-for-trade value to the sale line for items sold by weight.",
    d: "A scale connects by a serial or USB interface and reports weight with a stability flag. The register requests a reading, waits for stability, then captures the value with its unit and tare. Legal-for-trade scales are sealed and approved, and the register must display the weight to the customer. Combination scanner-scales are common. The hard part is correctness: motion or a hand on the platter gives unstable readings, tare must be handled, and rounding rules are set by weights-and-measures regulation.",
    k: ["Capture only on stable flag versus continuous weight: waiting for stability is legal and correct, but slows ringing when the item is hard to settle.", "Scale as a device the register queries versus pushing weight automatically: querying makes capture explicit and auditable, but needs the cashier to trigger it."],
    p: ["Using a reading taken while the scale is moving sells the wrong weight and breaks a legal-for-trade requirement.", "A scale left with residue on the platter reads a constant offset all day."],
    v: "Place a certified 500 g test weight on the scale, confirm the register captures exactly 0.500 kg only after the stable flag, and that moving the weight mid-capture is rejected.",
    dep: ["device-abstraction-layer", "units-and-packs"]
  },
  "camera-and-rfid-capture": {
    s: "Identifies items with camera-based code reading or radio tags, for mobile registers, self-service lanes and stores that tag items individually.",
    d: "Camera capture decodes one- and two-dimensional codes from video frames on a phone or tablet, with autofocus and lighting concerns. Radio-tag capture reads many tags at once from a tunnel or pad, then reconciles the set of tag identifiers with items and de-duplicates reads. Both feed the same item lookup. It is hard because the signals are noisy: cameras misread glossy or curved labels, and radio reads can include items nearby that are not part of the sale.",
    k: ["Camera scanning versus dedicated laser or imager: cameras reuse a phone and cost less, while dedicated imagers are faster and more reliable in bulk use.", "Bulk radio read versus line-by-line scanning: bulk is much faster for apparel, but needs verification that every tagged item was read and no stray tag was."],
    p: ["A tag from an item on a nearby rack gets read and added to a customer's sale.", "Slow camera focus under poor lighting makes staff abandon scanning and key codes by hand."],
    v: "Place ten tagged items in a read zone with two others just outside it, and confirm exactly ten lines are added, each unique, and the two outside are not.",
    dep: ["scanner-input-path", "item-master", "serial-and-lot-capture"]
  },
  "unknown-code-handling": {
    s: "Decides what happens when a scan matches nothing: a clear message, a way to ring the item manually, and a record so the catalog gap gets fixed.",
    d: "On a miss, the register checks other code families, recently changed items and, if online, the central catalog. If still unknown, it prompts for a department and price or a manual search, flags the line as unmatched and logs the code. Management reviews the unmatched list to add missing items. It is hard because the options conflict: a strict block stops the line for an item the store clearly sells, while open-ring entry invites mispricing and theft.",
    k: ["Block unknown items versus open-ring into a department: blocking protects pricing, while open-ring keeps the line moving and fixes the data afterward.", "Check the central catalog on a miss versus rely on the local copy: a central check finds brand-new items, but adds a delay and fails offline."],
    p: ["Open-ring items with typed prices lead to under-ringing that never shows in the catalog.", "Logging unknown codes nobody reviews lets the same gap cost sales for months."],
    v: "Scan an unassigned code, confirm the register offers manual entry with department, and that the code appears in the unmatched-items report with the cashier, price entered and time.",
    dep: ["code-to-item-mapping", "audit-trail", "item-search-and-lookup"]
  },
  "serial-and-lot-capture": {
    s: "Records the specific serial number, lot or expiry for items that must be traced, such as electronics, medicines and warranty goods, at the moment of sale.",
    d: "Flagged items prompt for a serial or lot scan after the item is added. The value is validated for format and, where inventory is serialized, checked against what the store holds and not already sold. It is stored on the line for returns, warranty and recall. The hard part is discipline: capture adds a step to every sale, serial formats vary by maker, and the same serial can be offered twice, once legitimately after a return.",
    k: ["Require capture at sale versus capture at receiving only: at-sale capture is the only proof of who bought what, but slows the line and depends on cashier care.", "Validate serials against inventory versus accept any value: validation prevents typos and double sales, but needs accurate serial-level stock that many stores lack."],
    p: ["A mistyped serial makes a warranty claim or recall notification unmatchable years later.", "A serial sold twice because the first sale was never synchronized yields duplicate warranties."],
    v: "Sell a serialized item with a valid serial, then try to sell the same serial again, and confirm the second attempt is blocked with the first sale's reference; then return it and sell again successfully.",
    dep: ["item-master", "inventory-ledger", "scanner-input-path"]
  },
});
