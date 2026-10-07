// Details for the e-commerce platform plate, part 1: storefront, search, accounts.
ATLAS.details("ecommerce-platform", {
  "storefront-rendering": {
    s: "Produces the pages shoppers see by combining templates with catalog, price and stock data, rendered on a server, at the edge or in the browser.",
    d: "Product, listing and content pages are built from templates plus data fetched from the commerce APIs. Pages may be rendered per request, prerendered and cached, or assembled in the browser from API calls. Personalized fragments such as the cart count and logged-in name are layered on top of otherwise cacheable markup. The hard part is freshness: a price or stock change must reach a cached page quickly, while the page still renders fast for the first byte and stays stable as it loads.",
    k: ["Server rendering with cached output vs browser-only rendering: cached markup gives fast first paint and indexable pages; it needs invalidation when data changes.", "Personalization inside the page vs fetched after load: inline personalization is simple but defeats shared caching; deferred fragments keep the cache but flicker."],
    p: ["A cached page shows a sale price after the promotion ended, and the cart then charges a different amount.", "Rendering that waits on a slow stock call makes every product page as slow as its slowest dependency."],
    v: "Change a product price, then load the page from outside the network and confirm the new price shows within the stated freshness target, with the cart agreeing to the cent.",
    dep: ["headless-commerce-api", "cache-layers", "content-management"]
  },
  "headless-commerce-api": {
    s: "The public, versioned interface that exposes catalog, cart, checkout and account operations to any client: the store's own pages, apps, kiosks and partner sites.",
    d: "Every shopper-facing capability is exposed over HTTP with JSON bodies, authenticated by session or customer tokens, and documented by a schema. Reads are cacheable and write endpoints are idempotent where they create money-bearing state. A separate admin interface covers merchant operations. The challenge is stability: external clients cannot be upgraded in lockstep, so fields are added but rarely removed, versions overlap for years, and every endpoint needs its own rate and abuse limits.",
    k: ["One API for all clients vs a purpose-built backend per client: one surface limits drift and duplicated rules; per-client backends fit screens better but multiply logic to keep consistent.", "Strict versions vs additive evolution: strict versions are easy to reason about but force migration deadlines on partners; additive change keeps clients working but accumulates legacy fields."],
    p: ["Publishing an internal field by accident turns it into a contract that cannot be removed.", "Cart and checkout endpoints without idempotency keys create duplicate orders when a mobile client retries on a bad connection."],
    v: "Replay a recorded request set from an old client version against the current API and confirm every response still validates against that version's schema, including checkout and cart mutation calls.",
    dep: ["cart-service", "price-resolution", "availability-service", "customer-identity", "rate-limiting"]
  },
  "query-api": {
    s: "A typed query layer that lets a client ask for exactly the product, price and availability fields a screen needs in one request, instead of many fixed endpoints.",
    d: "A schema describes types such as product, variant, price and cart, and a resolver per field fetches from the owning service. Clients send a query naming fields, and the server returns that shape. Resolvers batch lookups to avoid one call per item. This helps screens that mix catalog, stock, price and reviews, but it shifts cost control to the server: arbitrary nesting can fan out into thousands of backend calls unless depth, breadth and cost limits are enforced.",
    k: ["Client-shaped queries vs fixed endpoints: clients fetch less and iterate without server changes, but the server loses predictable load and cache keys.", "Persisted queries vs free-form text: persisted queries allow caching and block abusive shapes, at the cost of a build step and slower experimentation."],
    p: ["A nested query asks for related products of related products and fans out until the catalog service times out.", "Per-item resolvers without batching turn a 48-product listing into 48 stock calls."],
    v: "Run the heaviest allowed query against production-sized data and confirm backend call count stays within the documented bound and the response stays under the latency target, while an over-limit query is rejected.",
    dep: ["headless-commerce-api", "product-model"]
  },
  "content-management": {
    s: "Stores and publishes the non-product material of a store: landing pages, banners, size guides, policies and campaign layouts, with drafts, scheduling and localization.",
    d: "Editors compose pages from blocks, preview them, schedule them and publish. Content is stored as structured data rather than finished markup, so the same block renders on web and in apps. Blocks can reference catalog items or collections, which couples content to product data. Hard parts are scheduled changes that must flip at an exact moment across caches, approval workflows for legal text, and keeping referenced products valid when they are unpublished.",
    k: ["Structured blocks vs free-form markup: structured content reuses across channels and validates, but editors have less layout freedom and new layouts need development.", "Scheduled publish evaluated at read time vs a job that flips a flag: read-time evaluation is exact, while a job is simpler but makes launches late if it stalls."],
    p: ["A campaign banner links to a product that was unpublished, sending shoppers to an error page at peak.", "A scheduled launch is cached at the edge past its start time and shows the old page for minutes."],
    v: "Schedule a banner for a specific second in staging, hit the page from multiple regions before and after that time, and confirm every response switches within the stated cache tolerance.",
    dep: ["product-model", "cache-layers"]
  },
  "seo-structured-data": {
    s: "Makes store pages discoverable by crawlers: clean URLs, canonical links, sitemaps, and machine-readable product markup carrying price, availability and ratings.",
    d: "Each page emits a canonical URL, title and description, and embedded structured data describing product, offer and review. Sitemaps list indexable pages and are regenerated as the catalog changes. Faceted URLs are controlled with canonical tags or exclusion rules so filter combinations do not create millions of near-duplicate pages. The difficulty is accuracy: markup that disagrees with the visible price or stock status can get a store penalized, and redirects must be kept when products or categories move.",
    k: ["Indexing filter combinations vs canonicalizing to the category: indexing captures long-tail searches but floods crawlers with duplicates and wastes crawl budget.", "Permanent redirects for every retired URL vs letting them return not-found: redirects keep link value but grow a table that must be maintained and loop-checked."],
    p: ["Structured data showing in-stock after the item sold out produces mismatched search results and complaints.", "A template change drops canonical tags and thousands of duplicate pages appear in the index."],
    v: "Crawl a staging copy, validate the structured data on a sample of products against the visible price and stock, and confirm each page has exactly one canonical link and appears in the sitemap.",
    dep: ["storefront-rendering", "product-model", "category-listing"]
  },
  "search-indexing": {
    s: "Copies catalog, price and stock data into a dedicated search index, keeping it fresh through events and full rebuilds so queries never touch the transactional database.",
    d: "A pipeline consumes catalog change events, flattens each product and its variants into search documents with text, attributes, facet values, sort fields and business signals, and writes them to an inverted index. Full rebuilds run into a new index that is swapped in atomically. Price and stock change far more often than titles, so they are often updated separately or filtered at query time. The hard problems are lag, partial failures that leave documents stale, and rebuilds under load.",
    k: ["Event-driven incremental updates vs periodic full rebuilds: events are fresh but can drift after missed messages; rebuilds are self-healing but slow and expensive.", "Storing price and stock in the index vs fetching at query time: indexed values sort and filter quickly but go stale; live lookups are exact but cap throughput."],
    p: ["A missed event leaves a sold-out product ranking first for hours.", "A rebuild swapped in before it is complete hides part of the catalog."],
    v: "Change a product title, price and stock, then query for it and confirm each change appears within the freshness target; run a full rebuild and compare document counts against the catalog before the swap.",
    dep: ["event-bus", "product-model", "variants-and-options"]
  },
  "query-understanding": {
    s: "Interprets what a shopper typed: correcting spelling, expanding synonyms, detecting brands, sizes and colors, and deciding which fields the words should match.",
    d: "The raw query is normalized, tokenized and stemmed, then passed through spelling correction, synonym and phrase rules, and entity recognition that maps words like a color or size to a facet. It also chooses whether to treat the query as a product name, a category intent or an identifier such as a part number. Rules are curated by merchants and mixed with learned models. The difficulty is precision: broad expansion returns irrelevant products, and aggressive correction rewrites valid rare words.",
    k: ["Curated synonym lists vs learned expansion: curated rules are predictable and auditable but need constant upkeep; learned models adapt but produce hard-to-explain results.", "Auto-correct vs suggest-and-confirm: auto-correct saves a step but harms rare brand names; suggestions are safer but cost a click."],
    p: ["A synonym rule meant for one category makes unrelated products match everywhere.", "Part numbers are tokenized as words and no longer match exactly."],
    v: "Run a labeled set of real queries, including misspellings and identifiers, and confirm the intended product appears in the top results at or above the previous baseline.",
    dep: ["search-indexing", "attributes-and-taxonomy"]
  },
  "relevance-ranking": {
    s: "Orders matching products by a score combining text match with business signals such as sales, margin, stock and personalization, and exposes the knobs merchants may tune.",
    d: "Candidate products are retrieved by text match, then scored by a function that blends term relevance, popularity, recency, availability, price band and sometimes learned behavior. Merchants add boosts, pins and exclusions. Out-of-stock items are demoted or hidden. Evaluation uses click and purchase data, with online experiments splitting traffic. The hard parts are feedback loops that entrench already popular items, new products with no history, and explaining to a merchant why one product outranks another.",
    k: ["Hand-weighted scoring vs learned ranking: weights are explainable and quick to adjust, while learned models find better blends but need data, monitoring and drift handling.", "Optimizing for clicks vs purchases: clicks are plentiful but reward attractive images; purchases are what matters but are sparse and delayed."],
    p: ["Popular products keep rising because they are shown first, and new items never get exposure.", "A boost for a campaign is never removed and distorts results for months."],
    v: "Run an experiment with a holdout group and confirm the new ranking raises purchase conversion per search without raising zero-result or abandonment rates beyond the pre-agreed limits.",
    dep: ["search-indexing", "query-understanding", "availability-service"]
  },
  "faceted-navigation": {
    s: "Lets shoppers narrow results by attributes such as size, brand and price range, showing each option with a count of matching products.",
    d: "At query time the index computes, for each facet, the values among the current result set and their counts. Selecting one value filters results and recomputes the others, so shoppers cannot choose combinations that return nothing. Ranges, hierarchical facets and multi-select behavior need different logic. Facet definitions come from the attribute model per category. The difficulty is cost and consistency: counting across large result sets is expensive, and counts must agree with what the filtered list then shows.",
    k: ["Counts computed live vs approximate counts: live counts are exact but cost more per request; approximate counts are cheap and may disagree with the list.", "Showing every attribute vs a curated set per category: everything gives completeness but clutter; curation helps shoppers but needs merchandising effort."],
    p: ["A facet count says 12 but the filtered list shows 9 because stock filtering is applied only to one.", "A free-text attribute with thousands of spelling variants produces an unusable facet."],
    v: "Pick random facet selections on a large category and confirm each displayed count equals the number of products in the resulting list, and no offered option returns zero results.",
    dep: ["search-indexing", "attributes-and-taxonomy"]
  },
  "category-listing": {
    s: "Builds browse pages for categories and collections, whether they are curated manually or defined by rules, with sorting, pagination and merchandising placements.",
    d: "A category has a position in a tree and either a hand-picked list or a rule such as all products tagged with an attribute. The listing is served by the search index, so sort order, filters and pagination behave like search results. Merchants pin items and schedule collections. Pagination must be stable while data changes. The challenge is scale in both directions: very large categories need efficient deep paging, and rule-based collections must update when products change.",
    k: ["Rule-based collections vs hand-picked lists: rules stay current automatically but give less control; lists are precise but go stale as the range changes.", "Offset paging vs cursor paging: offsets are simple but slow and unstable on deep pages; cursors are fast and stable but cannot jump to an arbitrary page."],
    p: ["A product appears on two consecutive pages, or is skipped, because the list changed between page loads.", "A rule-based collection quietly includes discontinued products after an attribute value is reused."],
    v: "Page through a large category to the end while products are being added and removed, and confirm no product appears twice and none present throughout is missed.",
    dep: ["search-indexing", "attributes-and-taxonomy", "relevance-ranking"]
  },
  "autocomplete": {
    s: "Suggests queries, categories and products as the shopper types, within a few tens of milliseconds, using prefix lookups over popular and valid terms.",
    d: "A dedicated, small index holds popular queries, product names, brands and category names, ranked by frequency and filtered to those that return results. Each keystroke sends a prefix lookup, debounced on the client, and the response is cached at the edge for common prefixes. Suggestions can include product cards with price. The difficulty is latency and quality: suggestions must be fast, must not offer queries that return nothing, and must avoid surfacing offensive or private terms drawn from query logs.",
    k: ["Suggestions mined from query logs vs from catalog terms: logs reflect real demand but can leak odd or sensitive phrases; catalog terms are safe but miss how shoppers actually phrase things.", "Per-user personalization vs shared suggestions: personalization raises relevance but prevents edge caching of the most frequent prefixes."],
    p: ["A suggestion leads to a results page with zero products, because the index of suggestions is not tied to stock.", "Every keystroke reaches the origin when the prefix cache key includes a session value."],
    v: "Type the top thousand prefixes against a production-like index and confirm the 95th percentile response is within the latency target and every suggested query returns at least one product.",
    dep: ["search-indexing", "query-understanding", "cdn-and-edge"]
  },
  "customer-identity": {
    s: "Registers, authenticates and recovers customer accounts, issuing session tokens and supporting passwords, one-time codes, passkeys or federated login.",
    d: "Credentials are stored as salted slow hashes or replaced by passkeys and delegated login. Successful login issues short-lived access tokens and a revocable refresh token. Recovery flows send a signed, single-use link. Signals such as new device or country can trigger a second factor. The hard part is balance: every step of friction costs conversions, while weak recovery flows are the usual way accounts are taken over, so both need testing against real attacker behavior.",
    k: ["Own credential store vs delegated identity provider: owning gives full control of the flow but makes the store a breach target; delegating reduces risk but adds a dependency and per-user cost.", "Long-lived sessions vs short tokens with refresh: long sessions are convenient and riskier if stolen; short tokens limit damage but add refresh complexity."],
    p: ["Account existence is revealed by different error messages on login and recovery, helping enumeration.", "Recovery links that do not expire or stay valid after a password change allow takeover."],
    v: "Run credential-stuffing style attempts against a staging login with a list of known-bad passwords and confirm throttling engages, the account locks or challenges, and no response reveals whether an email is registered.",
    dep: ["rate-limiting", "account-takeover-protection", "privacy-consent"]
  },
  "guest-and-merge": {
    s: "Lets shoppers browse, fill a cart and check out without an account, then attaches that cart and order history to an account when they register or log in.",
    d: "An anonymous session identifier, held in a cookie or token, owns a cart and recent activity. At checkout a guest provides an email and address, and the order is linked to that email. When the shopper later logs in, the guest cart is merged into the account cart by rules that decide about duplicates and quantities, and past guest orders matching the verified email can be attached. The difficulty is correctness of the merge and not letting someone claim another person's orders by typing their email.",
    k: ["Merging guest and account carts vs replacing one with the other: merging keeps intent but needs quantity and price conflict rules; replacing is simple and drops items shoppers expected.", "Attaching past guest orders automatically vs after email verification: automatic is convenient but exposes order details to anyone who knows the address."],
    p: ["Logging in empties the cart, because the account cart overwrote the guest cart.", "Orders are attached to an account by unverified email, exposing addresses and purchases to a stranger."],
    v: "Add items as a guest, log in to an account with its own cart, and confirm the merged cart has the expected lines and quantities, current prices and no duplicates.",
    dep: ["customer-identity", "cart-service", "order-history-portal"]
  },
  "saved-payment-methods": {
    s: "Keeps tokens that stand for a customer's cards and wallets at the payment provider, so returning shoppers can pay without retyping and subscriptions can charge later.",
    d: "After a successful payment the provider returns a reusable token tied to the customer and the merchant. The platform stores the token with display data such as brand, last four digits and expiry, never the number. Tokens are listed at checkout, can be deleted, and are used for recurring or one-click charges, which require stored consent. Providers can update tokens when cards are reissued. The difficulty is the legal and authentication rules around charging when the customer is absent.",
    k: ["Storing provider tokens vs holding card data in a own vault: tokens keep the platform mostly out of card-data scope, but lock customers to that provider and complicate switching.", "Charging a saved method with an extra challenge vs without: a challenge lowers fraud and declines for stored credentials but adds friction to returning customers."],
    p: ["A deleted payment method is still used by a subscription because the token was cached elsewhere.", "Expired cards cause silent renewal failures with no prompt to update."],
    v: "Save a method, delete it, and confirm every later attempt to charge or list it fails; reissue a test card and confirm the stored display data refreshes through the provider's update flow.",
    dep: ["hosted-fields", "customer-identity", "pci-and-privacy-scope"]
  },
  "order-history-portal": {
    s: "The self-service area where customers see orders and tracking, download invoices, start returns, change details and reorder, reducing support contacts.",
    d: "It reads from the order service and shipment events and presents each order's status in customer language rather than internal states. Actions such as cancel, return, reorder and invoice download call the same operations staff use, with limits on what is permitted at each state. Guests reach their orders through a signed link or an email and order number. The challenge is mapping many internal states to a few honest ones, and exposing only the actions that will actually succeed.",
    k: ["Showing internal states vs a simplified customer status set: internal states are exact but confusing; simplified sets read well but can hide a real problem like a payment review.", "Letting the customer cancel directly vs by request: direct cancellation is cheap but races with shipping; requests are safe but slow to resolve."],
    p: ["The page shows Cancel after the warehouse has already shipped, and cancellation silently fails.", "The order lookup by number alone lets anyone enumerate other customers' orders."],
    v: "Place orders and advance them through every state in staging, and confirm each status text, enabled action and tracking link on the portal matches the true state within the update tolerance.",
    dep: ["order-model", "order-state-machine", "tracking-ingest", "customer-identity"]
  },
  "reviews-ratings": {
    s: "Collects and displays customer ratings and written reviews for products, aggregates them into scores, and marks which come from verified buyers.",
    d: "After delivery, a request is sent inviting the buyer to review. Submissions go to moderation, then publish and update aggregate rating and distribution for the product. Reviews may be shared across variants of the same product. Aggregates feed search ranking, listing badges and structured data. Hard parts are authenticity, since fake and incentivized reviews distort ratings, and aggregation across variants, languages and syndicated sources without double counting.",
    k: ["Verified-purchase-only reviews vs open reviews: verification raises trust and lowers volume; open reviews collect more but invite manipulation.", "Aggregating at the parent product vs per variant: parent scores have more data but may mislead when variants differ in quality; per-variant scores are specific and thin."],
    p: ["Aggregates are computed on read and make listing pages slow when a product has tens of thousands of reviews.", "A product merged with another inherits its reviews, and the ratings no longer fit the item."],
    v: "Submit a verified review and a spoofed one in staging, and confirm only the verified one appears with the badge, and the product's average and count update exactly once.",
    dep: ["review-moderation", "order-model", "product-model"]
  },
  "review-moderation": {
    s: "Screens submitted reviews and questions for abuse, spam, personal data and fake patterns, by automated checks plus human decisions, before or after publication.",
    d: "New content passes automated filters for profanity, links, contact details and duplicate text, and signals such as reviewer history, device and timing patterns. Items are approved, held or rejected, with reasons recorded. Sellers may flag reviews; platform policy limits what they can remove. A queue shows reviewers the evidence. The difficulty is policy, not mechanics: removing negative reviews looks like manipulation and can breach consumer rules, so decisions need consistent, auditable rules.",
    k: ["Pre-moderation vs post-moderation: pre-moderation stops harm but delays content; post-moderation is immediate and lets bad reviews appear briefly.", "Automated rejection vs routing to humans: automation scales and makes unexplained mistakes; human review is accurate and slow and costly at volume."],
    p: ["Reviews containing a customer's phone number or address are published before filtering catches them.", "Merchants delete only negative reviews through an admin path with no audit trail."],
    v: "Submit samples including spam, abusive text, personal data and a legitimate negative review, and confirm the first three are held, the last is published unchanged, and each decision has a recorded reason and actor.",
    dep: ["reviews-ratings", "audit-log", "manual-review-queue"]
  },
  "privacy-consent": {
    s: "Records what customers agreed to for marketing, cookies and data use, and carries out their requests to export, correct or delete personal data across systems.",
    d: "A consent record stores the purpose, wording version, time and channel for each choice, and every messaging and tracking system must check it before acting. Data subject requests trigger a workflow that finds the customer's data across the order store, search logs, support tools and backups, then exports or erases it, keeping what law requires, such as invoices. The hard part is knowing where personal data lives; copies in analytics, caches and third-party tools are easily missed.",
    k: ["Central consent service vs per-system flags: a service gives one answer and a full history but is a new dependency on every send; flags are local and drift apart.", "Hard deletion vs anonymization: deletion is clean but breaks aggregates and legal records; anonymization keeps totals and risks re-identification."],
    p: ["A customer unsubscribes but a second tool keeps its own list and keeps sending.", "A deletion request removes the account but leaves the person's name and address in order exports and logs."],
    v: "File an erasure request for a test customer with orders, reviews and logs, and confirm every listed store either no longer holds identifying data or retains only legally required records with the reason noted.",
    dep: ["customer-identity", "event-bus", "pci-and-privacy-scope"]
  },
});
