// Details for the e-commerce platform plate, part 2: catalog, pricing, cart and checkout.
ATLAS.details("ecommerce-platform", {
  "product-model": {
    s: "The core record describing something for sale: identity, titles, descriptions, brand, categories and the relationship to its sellable variants.",
    d: "A product groups what a shopper thinks of as one item, while child variants are what is actually priced, stocked and shipped. The model holds shared content and links to attributes, media, categories and regional visibility. Identifiers include an internal id, a merchant code and often a global trade number. Every other layer reads it, so changes ripple. The hard part is picking the right grain early: whether a color is a variant or a separate product affects search, reviews, inventory and reporting for years.",
    k: ["Parent product with variants vs flat sellable items: a parent groups content and reviews but adds a join to every read; flat items are simple and duplicate content.", "Fixed schema vs flexible attribute bag: fixed columns validate and index well; a bag adapts to any merchant's data but pushes validation and queries to application code."],
    p: ["A color treated as a separate product splits reviews and search results into near-duplicates.", "Merchants import products with reused codes and two items collide on one identifier."],
    v: "Create a product with three variants and confirm one product page shows shared content, each variant has its own price, stock and identifier, and an attempt to reuse an identifier is rejected.",
    dep: ["attributes-and-taxonomy"]
  },
  "variants-and-options": {
    s: "Defines the choices a shopper makes, such as size and color, and the resulting sellable units, each with its own identifier, price, weight and stock.",
    d: "Options are axes with allowed values, and variants are the combinations that actually exist. A shirt with five sizes and four colors may have only eighteen real variants. The page must show valid selections, disable unavailable ones, and update price, images and availability as the shopper chooses. Variants carry the shipping weight, dimensions and barcode the warehouse needs. Combinatorial growth is the difficulty: products with several axes produce thousands of variants, each needing price, stock and search entries.",
    k: ["Generate all combinations vs create only existing ones: generating is quick for merchants but creates unsellable variants; explicit creation is accurate and slower to set up.", "Variant-level images and content vs inheriting from the product: per-variant detail converts better and multiplies editorial work and storage."],
    p: ["A shopper selects a size and color that was never made and sees a blank price or a failed add-to-cart.", "A product with many axes explodes into so many variants that the product page and search index slow down."],
    v: "On a product with several option axes, select every combination and confirm each either shows a price, image and availability matching a real variant, or is clearly disabled and cannot be added.",
    dep: ["product-model", "attributes-and-taxonomy"]
  },
  "attributes-and-taxonomy": {
    s: "The category tree and the typed attributes attached to products, which drive navigation, filters, comparison tables and search matching.",
    d: "Categories form a hierarchy, and each category defines attribute sets: names, types, units, allowed values and whether they are filterable or required. Products inherit the sets of their category. Values should be normalized, so that 'navy' and 'dark blue' map to one facet value. A product may appear in several categories, while having one primary path for breadcrumbs. Hard parts include governance across thousands of attributes, unit conversion, and re-categorizing without breaking URLs and merchandising rules.",
    k: ["Controlled value lists vs free text: lists give clean facets and consistent data, but need maintenance and mapping on import; free text is easy and gets messy quickly.", "One category per product vs many: one gives clean breadcrumbs and reporting; many improves findability but makes ownership and sorting ambiguous."],
    p: ["Imported data fills a size attribute with 'S', 'Small' and 'small' and the filter shows three options.", "Moving a category changes URLs and breaks saved links, rules and ranking history."],
    v: "Import a file with deliberately inconsistent attribute values and confirm they are mapped or rejected per the value list, and that each resulting facet shows one option per real value.",
    dep: []
  },
  "bundles-and-kits": {
    s: "Sells several items as one: fixed kits, build-your-own sets and gift packs, with a defined relationship between the bundle and its component stock.",
    d: "A bundle is a sellable item whose components are other variants with quantities. Availability is the minimum across components divided by their quantities. Price may be fixed, a discount off the sum, or per-component allocation, and tax and refunds must follow the component split. The fulfillment side sees either the bundle as one pick, or its components. The difficulty is coherence: inventory, pricing, tax and returns each need a rule for what happens when one component is sold alone, out of stock or returned.",
    k: ["Virtual bundles that reserve components vs physical kits stocked as their own item: virtual bundles stay flexible but need composite availability; physical kits are simple to count and cannot be broken apart.", "Fixed bundle price vs sum minus discount: a fixed price is simple for shoppers but needs allocation for tax and refunds; a discount keeps line prices real."],
    p: ["A bundle shows in stock because one component's stock is counted twice in the minimum.", "Returning one item from a bundle refunds the full bundle price or the wrong share."],
    v: "Buy a bundle with three components, return one, and confirm stock for every component changes by the right amount, the refund equals the allocated share and tax adjusts to match.",
    dep: ["product-model", "variants-and-options", "stock-ledger", "price-resolution"]
  },
  "product-media": {
    s: "Stores and serves images, video and 3D assets for products, with automatic resizing, formats and variant-specific galleries.",
    d: "Original files go to object storage. A transformation service produces sizes and formats on demand or at upload, and a CDN caches them under versioned URLs. Each image links to a product or variant and has an order, alt text and a role such as primary or swatch. Video is transcoded to adaptive streaming formats. The challenge is volume and weight: media is most of the bytes a page loads, so format choice, lazy loading and cache hit rates dominate page speed.",
    k: ["Generate renditions at upload vs on first request: upload-time is predictable and wastes storage on unused sizes; on-demand is lean and gives first viewers a slow request.", "Versioned URLs per change vs overwriting in place: versioning allows long caching and instant updates but needs references updated; overwriting is simple and needs purging."],
    p: ["An updated image does not appear because an old copy is cached at the edge under the same URL.", "Uploaded originals are served at full resolution to phones because no size parameter is enforced."],
    v: "Upload a new primary image and confirm shoppers on the page get the new version within the cache tolerance, in a modern compressed format, at a size matching their screen, with alt text present.",
    dep: ["cdn-and-edge", "product-model"]
  },
  "catalog-import": {
    s: "Brings product data in from merchants, suppliers and other systems by files, feeds or APIs, validating, mapping and merging it without overwriting good data.",
    d: "Sources send files or calls in their own formats. A pipeline parses, maps fields to the model, validates required values and types, and computes the difference from current data, so only changes are applied. Errors are reported per row rather than failing everything. Imports can be scheduled or triggered. The hard parts are identity matching, deciding which source wins when two disagree, and bulk loads that must not overwhelm search indexing and cache invalidation downstream.",
    k: ["Full-file replace vs incremental diff: replace is simple and risks deleting products absent from a partial file; diffs are safe and need stable keys and delete rules.", "Reject the whole import on error vs apply valid rows: rejecting keeps data consistent and blocks releases; partial apply moves faster and leaves partly updated data."],
    p: ["A truncated supplier file is read as a full catalog and unpublishes thousands of products.", "A bulk update emits one event per row and floods the search indexer for hours."],
    v: "Import a file containing valid rows, malformed rows and a deletion, and confirm valid rows apply, bad rows are listed with reasons, the deletion follows the rule, and no unchanged row triggers an event.",
    dep: ["product-model", "attributes-and-taxonomy", "event-bus", "integration-connectors"]
  },
  "product-lifecycle": {
    s: "Moves products through draft, scheduled, published, discontinued and archived states, controlling where each is visible and what happens to its links, stock and orders.",
    d: "A product is created as a draft, reviewed, and published on a schedule, per region and channel. Discontinuing stops new sales but keeps the page for existing orders and links, often as an informational page with alternatives. Archiving removes it from sale and search while orders still reference it. Because orders keep a snapshot of what was sold, products can change freely afterward. The difficulty is the references: carts, wishlists, bundles, promotions and external links all point at products that disappear.",
    k: ["Soft delete with a state vs hard delete: states keep history and links working and require every query to filter; hard delete is clean and breaks references.", "Per-channel publication vs a single global state: per-channel gives control and many combinations to manage; one state is simpler and too coarse for regional ranges."],
    p: ["A product is unpublished while still in thousands of carts, and checkout then fails with a confusing error.", "Order pages cannot render a line because the discontinued product record was deleted."],
    v: "Discontinue a product that is in open carts, a bundle and a past order, and confirm the cart reports it clearly, the bundle becomes unavailable and the past order still renders its name and price.",
    dep: ["product-model", "cart-service", "order-model"]
  },
  "digital-and-subscription-goods": {
    s: "Handles products with no parcel: downloads, license keys, services and recurring plans, which are delivered instantly and billed on a schedule.",
    d: "Delivery is a digital action rather than a shipment: issuing a license key from a pool, granting access to a download with an expiring link, or provisioning an entitlement in another system. Subscriptions define plans, trial periods, billing intervals and proration. Tax rules differ for digital goods and depend on the buyer's location. Refund and revocation must undo the entitlement. The hard parts are idempotent fulfillment, preventing key sharing, and billing edge cases like plan changes mid-cycle.",
    k: ["Immediate delivery on payment authorization vs on capture: immediate feels instant and risks giving goods for payments that fail later; waiting is safer and slower.", "Platform-managed subscription billing vs delegating to the processor: platform control allows custom rules and carries more edge cases; delegation is simpler and limits flexibility."],
    p: ["A retried fulfillment job issues two license keys for a single order line.", "A refunded customer keeps access because revocation is not wired to the refund event."],
    v: "Buy a digital item, check the entitlement is granted exactly once, refund the order, and confirm access is revoked and the key is invalidated within the stated time.",
    dep: ["order-state-machine", "recurring-orders", "tax-calculation", "payment-orchestration"]
  },
  "price-books": {
    s: "Stores the base prices for each product or variant, separated by currency, region, customer group and validity period, as the source for all price calculation.",
    d: "A price book is a list of prices with a currency, an audience and effective dates. Several can apply, such as retail, wholesale and a country-specific list, with a defined precedence. Prices are imported from other systems or edited in bulk, often for hundreds of thousands of items. Sale prices are entries with a time window, and the previous price is kept so a was-price can be shown honestly. The hard part is volume and correctness: schedule changes must take effect exactly once, everywhere.",
    k: ["Explicit price per currency vs one price converted by rate: explicit prices allow psychological price points and cost editorial work; conversion is automatic and yields odd numbers.", "Effective-dated rows vs overwriting the current price: dated rows give history and scheduling and cost a range lookup; overwriting is simple and loses the trail."],
    p: ["Two overlapping price entries for one audience have no tie-break and the cart picks one at random.", "A scheduled price change runs on server time in the wrong time zone and starts hours early."],
    v: "Schedule a price change for a precise instant, query the resolved price before and after it from several regions, and confirm the switch happens once, at that instant, in each region.",
    dep: ["variants-and-options", "multi-currency-pricing"]
  },
  "price-resolution": {
    s: "Computes the single price a given customer pays for a given item now, by applying price book precedence, quantity breaks and the context of channel and region.",
    d: "Given item, quantity, customer group, channel, region and time, the resolver selects the applicable books, picks the winning entry by precedence, applies quantity tiers, and returns a price with its source and validity. It is called from listing pages in bulk and from the cart for exact totals, so it is both fast and consistent. Results are cached by context. The hard part is making the listing price, cart price and order price identical, even as rules and time move.",
    k: ["Computing prices at request time vs precomputing per audience: request time is flexible and costs CPU on every listing; precomputation is fast and multiplies stored rows by audiences.", "Returning a price with an expiry token vs plain numbers: tokens let checkout honor a quoted price briefly and need token handling; plain numbers are simpler and can differ at checkout."],
    p: ["The listing shows one price from a cache while the cart resolves another from fresh rules.", "A missing price for one region falls back silently to the base currency amount."],
    v: "For a sample of items and customer groups, compare the price on the listing, in the product page, in the cart and on the placed order, and confirm all four agree to the cent.",
    dep: ["price-books", "tiered-pricing", "cache-layers"]
  },
  "promotion-engine": {
    s: "Evaluates merchant-defined promotion rules such as percent off, buy-one-get-one and free shipping against a cart, and returns the discounts to apply and why.",
    d: "A promotion has conditions on items, customers, totals and dates, and actions such as discounting lines, adding gifts or reducing shipping. The engine evaluates all eligible promotions on the cart, resolves conflicts and returns line-level adjustments with explanations. It runs on every cart change, so evaluation must be fast, and results must be reproducible for the order record. Rules are authored through a constrained builder, because arbitrary logic becomes unmaintainable. The hard part is interaction: promotions combine in unexpected ways.",
    k: ["Declarative rule builder vs scripted rules: declarative rules are safe, testable and limited; scripts express anything and become unreviewable and slow.", "Discount applied to lines vs to the order total: line allocation keeps tax and refunds exact and costs more computation; order-level discounts are easy and complicate partial returns."],
    p: ["A rule matches on category and gives a discount on already discounted clearance items, producing negative margin.", "Discount is allocated to the order total, so returning one item refunds an incorrect amount."],
    v: "Run a library of cart scenarios with known expected totals, including combinations of promotions, and confirm every line's discount and the order total match, with an explanation for each applied rule.",
    dep: ["price-resolution", "discount-stacking", "redemption-limits", "cart-totals"]
  },
  "coupon-codes": {
    s: "Issues and validates codes that unlock promotions: single-use or shared, targeted to customers, with expiry, and tracked to prevent leaks and abuse.",
    d: "Codes are generated in bulk or created by hand, linked to a promotion and optionally to a customer, and validated at the cart: existence, window, eligibility and remaining uses. Redemption is recorded at order placement, not at validation, so a shopper who tries a code and leaves does not burn it. Unique-per-recipient codes are used in email campaigns. The difficulty is leakage: codes posted on coupon sites get used by everyone, and guessable code formats allow brute-force discovery.",
    k: ["Unique single-use codes vs one shared code: unique codes trace and limit abuse and need generation and distribution; a shared code is simple and leaks instantly.", "Counting use at apply time vs at order placement: apply-time stops races and lets abandoned carts burn codes; placement-time is fair and allows brief over-use."],
    p: ["A short alphanumeric format is guessed by a script that tries thousands of codes per minute.", "Two checkouts redeem a single-use code simultaneously because the check and the record are separate steps."],
    v: "Fire many parallel checkouts using one single-use code and confirm exactly one succeeds, the others are told it is used, and the redemption count equals one.",
    dep: ["promotion-engine", "redemption-limits", "rate-limiting"]
  },
  "tiered-pricing": {
    s: "Supports prices that depend on who is buying and how much: volume breaks, contract prices per company, customer groups and negotiated catalogs for business buyers.",
    d: "Quantity breaks define a price per unit at thresholds. Company contracts assign specific prices or percentage discounts to buyers, sometimes with a restricted catalog and approval for orders over a limit. Prices may be set per company or inherited through a hierarchy of accounts. Quotes and negotiated carts need a price held for days. The hard part is the data model for hierarchy and overrides, and keeping these rules visible so support can explain why a buyer sees a price.",
    k: ["Company-specific price lists vs a discount percentage off public price: lists give exact control and large data to maintain; percentages are compact and break when the base moves oddly.", "Honoring a quoted price for a period vs repricing at order time: honoring is what buyers expect and creates exposure to cost changes; repricing is safe and breaks trust."],
    p: ["A new product has no contract price and falls to the public price, giving a key customer a surprise.", "Quantity break applies per line, so splitting an order across lines defeats or doubles the tier."],
    v: "For a business account with a contract, quantity breaks and a quote, confirm the price shown at each quantity matches the agreement and the quoted price holds through the validity window.",
    dep: ["price-books", "customer-identity"]
  },
  "discount-stacking": {
    s: "Defines how multiple promotions combine: which can stack, in what order they apply, and what the ceiling is, so totals are deterministic and margin-safe.",
    d: "Each promotion declares a priority and a stacking policy: exclusive, combinable with some groups, or best-of. The engine applies them in a fixed order, such as item-level before order-level before shipping, and recomputes the base each time or uses the original price. Floors prevent a price going below cost or zero. Results must be identical regardless of the order lines were added. The difficulty is that the policy must be explainable to merchants, who otherwise cannot predict outcomes.",
    k: ["Best single discount vs stack all eligible: best-of is predictable and gives away less; stacking rewards loyalty and risks compounding to near zero.", "Percentage applied to the already reduced price vs to the original: sequential compounds smaller; original-based is simpler to explain and sums quickly to large discounts."],
    p: ["Two percentage promotions plus a coupon combine to a price below cost during a campaign.", "Totals differ depending on the order in which items were added to the cart."],
    v: "Generate random carts with many eligible promotions in shuffled line orders and confirm the same total each time, never below the configured floor, with a printed order of application.",
    dep: ["promotion-engine", "cart-totals"]
  },
  "redemption-limits": {
    s: "Counts and caps how often a promotion or code can be used, per customer, per period and in total, including budget caps, safely under concurrent checkouts.",
    d: "Counters track uses per promotion, per customer and per window, and sometimes the total discount value spent. A redemption is recorded in the same transaction as order placement and released when the order is cancelled or the payment fails. Limits can be per household or per payment method to catch multiple accounts. The challenge is concurrency and fairness, since a popular limited offer is contended and counters that are slightly wrong either lose margin or turn customers away.",
    k: ["Strict transactional counter vs approximate counter: strict is exact and becomes a hot row under a spike; approximate scales and lets a few extra redemptions through.", "Release the use on cancellation vs keep it consumed: release is fair to customers and invites repeated cancel-and-retry; keeping is firm and punishes legitimate cancels."],
    p: ["A flash promotion limited to 500 uses is redeemed 530 times because counters are read before they are written.", "Failed payments consume a use and the offer sells out to orders that never completed."],
    v: "Run a load test hitting a promotion with limit 100 using thousands of concurrent checkouts and confirm exactly 100 succeed, and that cancelled orders return their use.",
    dep: ["promotion-engine", "order-placement", "coupon-codes"]
  },
  "cart-service": {
    s: "Holds the shopper's items and selections between visits, tied to a session or account, and validates changes against catalog and stock as they happen.",
    d: "A cart is a document keyed by customer or anonymous id, holding lines with variant, quantity, selected options and a price snapshot, plus coupons and delivery choices. Each change reprices and revalidates. Carts live in a fast store with expiry rules, and are persisted for returning shoppers. They are read and written constantly and must tolerate two devices editing at once. The difficulty is deciding what a cart promises: it reflects intent, not a reservation, so contents can become invalid between visits.",
    k: ["Server-side cart vs client-held cart: server-side works across devices and supports recovery; client-held is cheap and loses the cart with the browser and invites tampering.", "Last write wins vs versioned updates: last write is simple and drops changes from a second device; versioning prevents silent loss and needs conflict handling."],
    p: ["Cart lines keep an old price snapshot and the shopper sees a different amount at checkout without explanation.", "A cart accepts any quantity sent by the client, including negative or huge values."],
    v: "Edit one cart concurrently from two devices, and confirm both converge on a consistent set of lines, quantities are bounded, and prices shown are current with any change explained.",
    dep: ["variants-and-options", "availability-service", "cart-totals", "guest-and-merge"]
  },
  "cart-totals": {
    s: "Calculates subtotal, discounts, shipping, tax and grand total for a cart, with line-level detail, deterministic rounding and a breakdown the shopper can read.",
    d: "On each change, it calls price resolution for lines, applies promotions, adds shipping quotes, then calls tax calculation on the discounted, shipped amounts, and sums in the order's currency. Each line carries its own allocated discount and tax so partial returns work. The totals object is the same one used to authorize payment. The hard part is determinism: rounding at each step versus at the end changes totals by cents, and those cents cause payment mismatches and accounting differences.",
    k: ["Round per line vs round the total: per-line rounding matches invoices and refunds line by line and can differ from the sum of exact amounts; total rounding is exact and impossible to split.", "Recompute on every read vs store a computed snapshot: recompute is always current and costs more; snapshots are fast and can go stale."],
    p: ["Tax is calculated before discounts are allocated and the tax charged is too high.", "The total shown in the cart differs by a cent from the amount sent to the payment provider."],
    v: "Compute totals for a set of carts with multiple tax rates and discounts, then confirm the sum of line values equals the grand total exactly and equals the amount authorized with the payment provider.",
    dep: ["price-resolution", "promotion-engine", "tax-calculation", "shipping-rate-quoting", "money-and-rounding"]
  },
  "checkout-flow": {
    s: "Drives the shopper through address, delivery, payment and review as an explicit state machine, so each step can be validated, resumed or retried safely.",
    d: "A checkout session is created from the cart and holds the data collected so far: contact, addresses, delivery choice and payment details. Each step validates its inputs and recomputes totals. The session has states such as in progress, awaiting payment action, completing and complete, and only valid transitions are accepted. Sessions expire. Because it runs across several requests and redirects to payment pages, the failures that matter are interruptions: closed tabs, retries, double clicks and returns from external authentication.",
    k: ["One-page vs multi-step checkout: one page is faster to complete and heavier to validate; steps are simpler to build and lose shoppers at each transition.", "Server-owned checkout session vs client-driven steps: server-owned enforces rules and survives refresh; client-driven is flexible and trusts input that must be rechecked anyway."],
    p: ["A shopper double-clicks Place Order and two sessions complete, creating two orders.", "Returning from an external payment page resumes at the wrong step with stale totals."],
    v: "Interrupt a checkout at every step by closing the tab, refreshing and replaying requests, and confirm each resume lands in a valid state with correct totals and never produces a duplicate order.",
    dep: ["cart-service", "delivery-selection", "payment-orchestration", "order-placement", "checkout-validation"]
  },
  "delivery-selection": {
    s: "Captures and verifies the shipping address and chosen delivery method, including address autocomplete, validation, pickup points and per-line delivery options.",
    d: "The shopper enters or picks a saved address; an address service standardizes and validates it against postal data, and corrects formatting by country, since fields and postal code rules vary. The address determines available carriers, shipping cost, tax jurisdiction and whether the item can ship there at all. Options show a price and promised date per method, and mixed carts can split by origin. The challenge is that this single step feeds tax, shipping, fraud and fulfillment, so bad input propagates widely.",
    k: ["Strict address validation vs accepting what is typed: strict reduces failed deliveries and rejects unusual but valid addresses; permissive never blocks a sale and ships errors.", "One delivery method per order vs per shipment: one is simple to explain; per-shipment reflects how goods really ship and complicates the UI and totals."],
    p: ["An address correction changes the postal code after tax was computed and the tax is not recalculated.", "A restricted product is accepted for a destination where it cannot legally ship, and the order fails later."],
    v: "Submit addresses from many countries, including edge formats and restricted destinations, and confirm each is standardized or rejected with a reason and that tax and shipping options recompute after every change.",
    dep: ["shipping-rate-quoting", "tax-jurisdiction-rules", "delivery-promise"]
  },
  "shipping-rate-quoting": {
    s: "Produces the shipping options and prices for a cart and destination, from merchant rate tables, free-shipping rules or live carrier quotes.",
    d: "Inputs are items with weight and dimensions, origin, destination and service levels. Rates come from tables by weight and zone, flat or free-over-threshold rules, or live calls to carrier APIs. Packing logic estimates how many boxes the items need. Quotes are cached briefly, since live carrier calls are slow and sometimes unavailable. The hard parts are the packing estimate, which drives real cost, and falling back sensibly when a carrier does not answer during checkout.",
    k: ["Live carrier rates vs rate tables: live rates are accurate and add latency and a failure dependency; tables are fast and drift from actual costs.", "Free shipping threshold on subtotal before vs after discounts: before is generous and easy to explain; after protects margin and confuses shoppers when a coupon removes it."],
    p: ["A carrier timeout leaves the shipping step empty and shoppers cannot complete checkout.", "Missing item weights default to zero and shipping is badly underpriced."],
    v: "Quote shipping for carts of varying weight and zone with the carrier API disabled and enabled, and confirm results fall within tolerance of actual carrier cost and a fallback rate appears when the carrier is down.",
    dep: ["variants-and-options", "carrier-integration", "cache-layers"]
  },
  "checkout-validation": {
    s: "Re-checks everything that can have changed before an order is accepted: price, stock, shipping eligibility, promotion validity, address and purchase limits.",
    d: "Immediately before placing the order, a validation pass recomputes totals from authoritative data, checks stock can be reserved, confirms each product is still sellable in the destination, revalidates coupons and enforces per-customer quantity limits and age or license restrictions. It returns structured, actionable errors, not a generic failure. The pass is deliberately repeated, since the cart may be hours old. The challenge is giving shoppers a way forward and not blocking them on trivial price movements.",
    k: ["Block on any price change vs allow small drift: blocking is exact and annoys shoppers; allowing drift within a limit keeps conversion and absorbs small losses.", "Validate all rules every time vs only changed inputs: full validation is simple and safe; incremental is faster and risks missing dependent rules."],
    p: ["A generic error appears when one line went out of stock and shoppers do not know which one.", "Validation checks stock but not purchase limits, so a limited item is bought in bulk through repeated orders."],
    v: "Change price, stock, destination eligibility and coupon validity between add-to-cart and checkout in staging, and confirm each produces a specific message naming the line and a path to continue.",
    dep: ["availability-service", "price-resolution", "redemption-limits", "delivery-selection"]
  },
  "order-placement": {
    s: "The single atomic step that turns a validated checkout into an order: it records the order, reserves stock, redeems promotions and starts payment, or does none of it.",
    d: "It runs under an idempotency key. In one transaction it writes the order with an immutable snapshot of prices, taxes and addresses, converts reservations into commitments, records redemptions and emits an order-created event through an outbox. Payment authorization is attempted before or after depending on the design, with compensating actions if it fails. Everything else, such as emails and fulfillment, happens asynchronously. The difficulty is the boundary with the outside world: payment is not part of the database transaction.",
    k: ["Authorize payment before creating the order vs after: payment first never leaves an unpaid order and can leave a charge without an order after a crash; order first is recoverable and leaves unpaid orders to clean up.", "Synchronous completion vs accept-and-process asynchronously: synchronous gives an immediate answer and fails under load; async absorbs spikes and shows a pending state."],
    p: ["A crash after payment authorization and before the order commit leaves a charge with no order.", "Retries without an idempotency key create duplicate orders and duplicate holds."],
    v: "Kill the service at every step of order placement in a staging run and confirm after recovery each attempt resolves to exactly one order with a matching payment, or no order and no charge.",
    dep: ["checkout-validation", "reservations", "payment-orchestration", "transactional-outbox", "idempotency-and-retries", "order-model"]
  },
  "express-checkout": {
    s: "Shortens checkout using wallets, saved credentials and one-click buttons that supply payment and address from the shopper's device or account.",
    d: "A wallet button on the product or cart page opens the device's payment sheet, which returns a payment token, contact and shipping address with the shopper's confirmation. The platform creates a checkout session from that data, recomputes shipping and tax for the supplied address, and the sheet displays updated totals before the shopper confirms. One-click uses a saved method and address. The difficulty is that the usual steps are compressed, so every validation, tax and fraud check must still run, with less shopper input to rely on.",
    k: ["Wallet from the cart or product page vs only at checkout: earlier placement converts better and requires totals and shipping to be computed from partial data.", "Trusting wallet-supplied addresses vs revalidating: trusting is faster and accepts bad or incomplete addresses; revalidating adds a step and catches errors."],
    p: ["Shipping cost shown in the wallet sheet differs from the final amount because tax was computed with a placeholder address.", "Wallet orders skip a validation that the normal path performs, such as purchase limits."],
    v: "Complete orders through the wallet path to several countries and compare the totals, tax, shipping and validation outcomes with the same carts through normal checkout, and confirm they are identical.",
    dep: ["checkout-flow", "payment-orchestration", "saved-payment-methods", "cart-totals"]
  },
});
