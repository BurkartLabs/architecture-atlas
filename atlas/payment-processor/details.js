// Details for the payment processor plate, part 1: payment methods, API and webhooks, merchant tools.
ATLAS.details("payment-processor", {
  "card-acceptance": {
    s: "The path that takes a card number, expiry and security code from a customer and turns it into an authorization request, for online, in-person and phone orders.",
    d: "Online, the details arrive through a form or SDK; in person, through a terminal that reads a chip, a contactless tap or a stripe. The data is validated for format (length, check digit, expiry), tagged with how it was captured, and passed to tokenization before anything else sees it. The capture method matters downstream because networks assign different fees, liability and approval rules to chip, contactless and keyed entry. The hard part is keeping the raw number away from every system that does not need it.",
    k: ["Collecting card data on the processor's own pages vs on the merchant's pages: the first shrinks the merchant's compliance burden; the second gives full design control at much higher security cost.", "Validating format locally vs relying on the network to reject: local checks save a round trip and a fee; they must track changing number ranges."],
    p: ["Logging a request body that contains the full number puts card data into a system that was never meant to hold it.", "Rejecting a valid new number range because the local format rules are out of date silently lowers approval rates."],
    v: "Submit a test card through each capture path and confirm the stored record contains only a token, a masked number and the capture method, and that the raw number appears in no log or database outside the vault.",
    dep: ["tokenization", "payments-api"]
  },
  "hosted-fields": {
    s: "Embedded frames or full-page redirects served by the processor, so card data goes from the customer's browser straight to the processor and never touches the merchant's servers.",
    d: "The merchant page includes a script that renders input fields inside frames loaded from the processor's origin. The browser's same-origin rules keep the merchant's code from reading them. On submit the frame sends the data directly to the vault and returns a single-use token to the merchant page. Redirect flows do the same with a whole page. The difficulty is user experience and security together: styling, accessibility, wallet buttons and error messages must work across frames, while the script itself becomes a target for tampering.",
    k: ["Embedded frames vs full redirects: frames keep the customer on the merchant's page and brand; redirects are simpler to secure and need no script integrity guarantees.", "Single-use short-lived tokens vs reusable ones: single-use limits the harm of a leaked token; reuse requires an extra step to save a card."],
    p: ["A tampered merchant page can overlay fake fields on top of the frames and capture keystrokes.", "Strict page security policies on the merchant side can block the frame from loading, causing a silent checkout failure."],
    v: "Load the merchant page, inspect the network traffic during a test purchase, and confirm the card number appears only in requests to the processor's origin and the merchant server receives only a token.",
    dep: ["tokenization", "pci-scope-reduction", "card-acceptance"]
  },
  "wallets": {
    s: "Wallet payment flows where the customer's device holds the credential and authenticates the user, handing the merchant an encrypted payment token instead of a card number.",
    d: "The wallet provider tokenizes the card on the device. At checkout the user confirms with a fingerprint, face or PIN and the device produces an encrypted payload with a one-time cryptogram. The processor decrypts it with keys registered for the merchant or forwards it to the network, which maps the token to the real number. The payload counts as strongly authenticated, which can change both fees and liability. The hard parts are certificate and key rotation, domain verification, and handling wallets with differing payload formats.",
    k: ["Processor decrypts the payload vs passes it to the network opaque: decrypting allows routing choices and risk checks; passing it on reduces exposure to key handling.", "Treating wallet payments as authenticated vs applying normal risk checks: skipping checks lowers friction, but stolen-device and provisioning fraud still occur."],
    p: ["An expired decryption certificate causes every wallet payment to fail at once, often on a weekend.", "Saving the device token as if it were the card number makes later payments fail when the device is replaced."],
    v: "Run a test wallet payment end to end and confirm the cryptogram is verified, the authorization carries the wallet indicator, and the stored credential is the token reference, not a card number.",
    dep: ["key-management", "network-tokens", "authorization"]
  },
  "bank-debits": {
    s: "Pulling funds directly from a customer's bank account using mandates, which is cheaper than cards but settles slowly and can be returned for weeks afterward.",
    d: "The customer supplies account details and agrees to a mandate that authorizes debits. The processor submits instructions in batches through the national clearing system, which settle after one or more days. The bank can return a debit for insufficient funds, a closed account, or because the customer disputes it, sometimes up to months later. Account ownership has to be verified first, by micro-deposit or by login through the bank. Cheap fees come with the risk that the processor has already paid the merchant when a return arrives.",
    k: ["Paying the merchant on submission vs on settlement: early payout helps merchants and moves return risk to the processor; late payout is safe and slow.", "Instant account verification vs micro-deposits: instant checks convert better but depend on bank coverage; deposits work everywhere and take days."],
    p: ["Treating a submitted debit as paid lets goods ship against funds that later bounce.", "Storing a mandate without evidence of consent leaves the processor unable to defend an unauthorized-debit claim."],
    v: "Submit a test debit, simulate a return code after settlement, and confirm the payment moves to failed, the ledger reverses the credit, and the merchant is notified with the return reason.",
    dep: ["payment-state-machine", "payout-rails", "journal-entries"]
  },
  "bank-transfers": {
    s: "Customer-initiated credit transfers, including payments started through open banking interfaces, where the customer approves the payment inside their own bank.",
    d: "The merchant requests a payment and the processor either gives the customer a reference and bank details to send funds to, or redirects them to their bank to approve a one-off transfer. Because the customer pushes the money, there is no chargeback, but there is also no automatic link between an incoming credit and an order. The processor must match arriving funds against open requests by reference, amount and sender. It gets hard when customers underpay, pay twice, or omit the reference.",
    k: ["Unique account number per payment vs a shared account with a reference: unique numbers match reliably but cost more to operate; shared accounts depend on customers typing references correctly.", "Redirecting to the bank vs asking the customer to initiate: redirects confirm instantly and need bank coverage; manual transfers work anywhere and confirm late."],
    p: ["An overpayment or duplicate transfer with no matching request sits unclaimed and becomes a regulatory problem.", "Marking a payment complete on the redirect return rather than on the bank's confirmation records a payment that never arrived."],
    v: "Create a payment request, send a transfer with the right reference, and confirm it matches and completes. Send one with a wrong reference and confirm it lands in the exception queue rather than disappearing.",
    dep: ["matching-engine", "payment-state-machine", "exception-queue"]
  },
  "bnpl": {
    s: "Methods where a third party pays the merchant up front and collects from the customer in installments, with the credit decision made during checkout.",
    d: "The customer chooses the method, is redirected or shown a widget, and the lender runs a credit decision using the order and their history. If approved, the processor receives an authorization-like confirmation, the merchant ships, and the lender pays the merchant on capture, usually minus a higher fee. The processor handles order data, partial refunds that reduce installments, and the lender's separate dispute rules. It is hard because the decision, installment terms and refund treatment belong to another party with its own API and timing.",
    k: ["Treating the lender as one more payment method vs as a distinct product: reuse of the lifecycle is cheap; distinct handling matches different refund and dispute rules.", "Sending rich line-item data vs minimal data: line items improve approval and dispute outcomes at the cost of mapping effort and privacy exposure."],
    p: ["Refunding in full when the lender expects line-level adjustments leaves installments and the merchant payout inconsistent.", "Showing the method for orders the lender will certainly decline hurts conversion and trust."],
    v: "Place a test order, approve and capture it, issue a partial refund, and confirm the lender's side shows the reduced installment amount and the ledger shows the matching fee and refund entries.",
    dep: ["payment-state-machine", "refunds", "method-eligibility"]
  },
  "local-methods": {
    s: "Region-specific ways to pay, such as vouchers paid in cash at a shop, domestic wallets and instant-payment schemes, each with its own flow and confirmation timing.",
    d: "Each local method is a small adapter: it builds the payment instruction the scheme expects, presents a code, QR image or redirect to the customer, and waits for a notification of payment. Voucher flows can take days and expire; instant schemes confirm in seconds. Confirmations arrive as webhooks or files from an intermediary and must be authenticated and matched to the original request. The difficulty is volume of variation: dozens of methods, each with its own limits, refund rules and settlement timing, behind one common interface.",
    k: ["One adapter per method behind a common interface vs a generic configurable flow: adapters handle quirks; generic flows ship faster and break on the first exception.", "Expiring unpaid payments on a fixed timer vs on provider events: timers are predictable; provider events avoid cancelling payments that are about to arrive."],
    p: ["A payment confirmation that arrives after the order was cancelled leaves money received with nothing to apply it to.", "Assuming every method supports refunds sends customers to a manual support process."],
    v: "Create a voucher payment, let it sit, then deliver a signed confirmation after expiry. Confirm the system records the late funds, flags it for handling, and does not silently complete a cancelled order.",
    dep: ["payment-state-machine", "webhook-signing", "exception-queue"]
  },
  "method-eligibility": {
    s: "Logic that decides which payment methods to show for a given customer, amount, currency, country and device, and in what order.",
    d: "At checkout the system evaluates each configured method against the merchant's settings, the order's currency and amount limits, the customer's region, device capabilities and the merchant's risk profile. It returns an ordered list, often tuned from conversion data. Rules come from three places: what the merchant enabled, what regulation permits, and what each provider supports. It is hard because the list must be fast, consistent between display and execution, and explainable when a method is missing.",
    k: ["Static rules vs learned ordering: rules are predictable and auditable; learned ordering raises conversion but is harder to explain to a merchant asking why a method vanished.", "Evaluating eligibility at display time only vs again at submit: display-only is cheap; rechecking blocks stale lists from creating invalid payments."],
    p: ["Offering a method the customer cannot use ends in a failed payment at the last step.", "Cached eligibility lists outliving a provider outage keep sending customers to a method that is down."],
    v: "Request the method list for a set of test orders varying amount, country and currency, and confirm each list matches the configured limits and that submitting an excluded method is rejected.",
    dep: ["acquirer-routing", "merchant-onboarding", "risk-scoring"]
  },
  "payments-api": {
    s: "The programmatic interface merchants use to create, confirm, capture, cancel and refund payments, and to read their state.",
    d: "Resources are modeled as objects with a lifecycle: a payment request, its attempts, and the resulting charges and refunds. Calls over HTTP create or advance these objects; reads return their current state and recent history. Because many outcomes are asynchronous, the response says what happens next, such as requiring customer action, rather than only succeeded or failed. The challenge is designing an interface that stays correct under retries, partial failures and concurrent calls, and that merchants can integrate once and keep for years.",
    k: ["Separating a payment request from its attempts vs one flat charge object: separation models retries and multiple tries cleanly; flat objects are simpler and lose history.", "Synchronous final answers vs asynchronous states with events: synchronous is easier to integrate; asynchronous is honest about methods that cannot answer immediately."],
    p: ["Returning success when the payment is only pending leads merchants to ship goods that are never paid for.", "Unbounded list endpoints let a single merchant's reporting query degrade the service for everyone."],
    v: "Drive a payment through create, confirm, capture and refund against the sandbox and confirm each response, the stored object and the emitted events describe the same state at every step.",
    dep: ["payment-state-machine", "api-auth", "idempotency-keys", "event-log"]
  },
  "idempotency-keys": {
    s: "Client-supplied unique keys that make a request safe to repeat: the second attempt returns the stored result of the first instead of acting again.",
    d: "The client generates a key per logical operation and sends it with the request. The server stores the key with a fingerprint of the request and, once finished, the response. A repeat with the same key and body returns the stored response; the same key with a different body is rejected; a repeat while the first is still running waits or reports a conflict. The key check and the money effect must succeed or fail together, so the key record is written in the same transaction as the state change. Retention length is a trade-off.",
    k: ["Storing the key in the same transaction as the effect vs in a separate cache: one transaction cannot lose or double the effect; a cache is faster and can disagree with the database.", "Long key retention vs short: long retention protects slow retries; short retention bounds storage and risks a late retry creating a duplicate."],
    p: ["A client that generates a fresh key on every retry gets no protection at all and double-charges a customer.", "Matching on key alone, ignoring the request body, returns a stale result for a genuinely different request."],
    v: "Send the same create request three times concurrently with one key and confirm exactly one payment and one ledger entry exist, all three responses are identical, and a changed body with that key is refused.",
    dep: ["payments-api", "journal-entries"]
  },
  "api-auth": {
    s: "Credentials and permission checks that identify the caller as one merchant and limit what the credential may do.",
    d: "Merchants receive secret keys for servers and restricted or publishable keys for browsers and apps. Each key maps to a merchant, a mode (test or live) and a set of permissions, and is sent over TLS in a header. Keys are stored only as hashes, can be rotated with an overlap period and are revocable instantly. Platforms acting on behalf of other merchants use delegated authorization, with explicit scope. The hard part is making revocation fast and complete while keeping every request's check cheap.",
    k: ["Long-lived secret keys vs short-lived signed tokens: keys are simple for integrators; tokens limit leak damage and require refresh logic on the client.", "Fine-grained permissions vs all-or-nothing keys: fine-grained keys contain a leak; they raise integration complexity and support load."],
    p: ["A secret key committed to a public code repository is found by scanners within minutes and used to create refunds.", "Treating test and live keys as interchangeable in logs and tooling lets live credentials leak into test environments."],
    v: "Create a restricted key without refund permission, call the refund endpoint with it, and confirm a clear permission error. Revoke a key and confirm the next request fails within the documented time.",
    dep: ["merchant-onboarding", "rate-limits"]
  },
  "api-versioning": {
    s: "The policy and mechanism that let the API change without breaking merchants integrations that were written years ago.",
    d: "Each merchant is pinned to a dated version, which determines the shape of requests, responses and events they see. Internally the system keeps one current model and applies a chain of small transformations that translate to and from older shapes. A new version is released only for breaking changes, and migration tooling lets a merchant test an upgrade before switching. The difficulty is carrying the cost: every old version is behavior to keep correct, test and secure, while some old integrations never upgrade.",
    k: ["Pinning each merchant to a version vs a single global version: pinning avoids forced rewrites; it multiplies the behaviors the team must keep working.", "Transformation layers over one internal model vs separate code per version: layers prevent drift between versions; each layer must be tested against every older shape."],
    p: ["Adding a field with a new meaning in place, without a version, breaks parsers that treat unknown values as errors.", "Webhooks sent in the account's current version while the merchant's code expects the old one cause parsing failures after an upgrade."],
    v: "Replay a recorded set of requests and events from the oldest supported version against the current system and confirm every response and event matches its original byte-for-byte shape.",
    dep: ["payments-api", "event-log"]
  },
  "rate-limits": {
    s: "Controls that cap how many requests, or how much work, any one merchant or credential may impose, protecting shared capacity and each merchant from a noisy neighbor.",
    d: "Limits are counted per credential, per merchant and per endpoint class using token buckets or sliding windows held in a fast shared store. Writes and reads have separate budgets, and money-moving calls are protected so that read traffic never starves them. Rejected calls get a specific status and a hint for when to retry. Limits can be raised for known high-volume merchants. The hard part is accuracy across many servers and distinguishing a legitimate traffic spike, such as a sale starting, from abuse.",
    k: ["Strict per-merchant limits vs a shared pool with priorities: strict limits are fair and predictable; a shared pool uses capacity better and lets one merchant crowd out others.", "Limiting in the edge layer vs in the service: the edge drops abuse cheaply; the service knows which calls actually cost money."],
    p: ["Retrying clients that ignore the retry hint turn a brief limit into a sustained overload.", "A limit applied to payment creation but not to card-testing endpoints lets attackers probe stolen numbers freely."],
    v: "Drive one credential past its limit with a load script and confirm excess calls receive the documented limit response with a retry hint while another merchant's calls keep their normal latency.",
    dep: ["api-auth"]
  },
  "webhook-delivery": {
    s: "The system that sends events to merchant endpoints reliably, retrying failures with backoff, in a way merchants can process safely.",
    d: "Each state change writes an event; a delivery worker posts it to every endpoint subscribed to that event type and records the response. Any non-success response or timeout schedules a retry with growing delay for a day or more. Delivery is at least once, and order is not guaranteed, so each event carries an identifier and a timestamp, and the merchant is expected to fetch the current object when order matters. Hard parts are slow or failing endpoints that back up queues, and merchants who disable events after an outage.",
    k: ["At-least-once delivery vs attempted exactly-once: at-least-once is achievable and requires merchant deduplication; exactly-once claims hide failures.", "Thin events carrying an identifier vs full snapshots: thin events avoid stale data and force a read; snapshots save a call and can arrive out of date."],
    p: ["One failing merchant endpoint that is not isolated fills the shared retry queue and delays everyone's events.", "Merchants handling the event synchronously before replying time out, causing duplicate deliveries of an event they already processed."],
    v: "Point an endpoint at a server that fails three times then succeeds, and confirm the same event arrives four times with the same identifier on a backoff schedule, and that an unrelated merchant's events are not delayed.",
    dep: ["event-log", "async-queues", "webhook-signing"]
  },
  "webhook-signing": {
    s: "A signature on every webhook, computed with a per-endpoint secret over the body and a timestamp, so receivers can verify origin and reject replays.",
    d: "The sender computes a keyed hash over the timestamp and the exact raw body and includes both in a header. The receiver recomputes it with its copy of the secret, compares in constant time, and rejects messages whose timestamp is too old. Secrets are per endpoint and can be rotated while both old and new are accepted for a period. The difficulty is in receivers: frameworks that parse and re-serialize the body before verifying it change the bytes and break the signature, so many integrations quietly skip verification.",
    k: ["Shared-secret signatures vs public-key signatures: shared secrets are simple and fast; public keys let receivers verify without holding anything that could forge events.", "Short timestamp tolerance vs long: short windows limit replay; they break when merchant clocks drift."],
    p: ["Verifying a parsed and re-encoded body instead of the raw bytes makes every valid event fail, so teams switch verification off.", "Comparing signatures with ordinary equality leaks timing information."],
    v: "Send an event with a valid signature, a tampered body and an old timestamp. Confirm the receiver accepts the first and rejects the other two, and that secret rotation keeps both secrets valid during the overlap.",
    dep: ["key-management", "webhook-delivery"]
  },
  "event-log": {
    s: "An append-only record of every state change in the system, serving as the source for webhooks, merchant event history and internal consumers.",
    d: "Each change to a payment, refund, dispute or payout writes an event with an identifier, type, object reference, version and timestamp. The event is created in the same transaction as the change, then published through an outbox. Merchants can list recent events and re-fetch ones they missed, and internal services subscribe to build analytics, risk features and notifications. It is hard because ordering is per object, not global, and because events are a public contract: once a field is in an event, it stays.",
    k: ["Events written in the same transaction as the change vs published afterward: same-transaction writes can never be lost; afterward is simpler and loses events on a crash.", "Retaining events for a limited window vs indefinitely: limited windows control cost; indefinite retention supports audit and replay at a storage price."],
    p: ["An event emitted before the transaction commits tells subscribers about a payment that then rolls back.", "Internal fields added to events for convenience become permanent public contract."],
    v: "Kill the service between a state change and publication, restart it, and confirm the event is still published exactly once and the merchant's event list shows it in sequence for that payment.",
    dep: ["outbox-pattern", "payment-state-machine"]
  },
  "sandbox": {
    s: "A complete test environment with its own keys and data, where merchants can simulate approvals, declines, disputes and delays without moving real money.",
    d: "Test mode uses separate credentials and storage and returns scripted outcomes: special card numbers trigger declines, 3-D Secure challenges, disputes and failures, and clocks can be advanced to simulate time-based events like payouts. The goal is the same behavior as live, without the networks. It is hard to keep faithful: every new feature must have a test-mode counterpart, and differences between simulated and real network behavior, such as response timing or rare codes, are exactly where integrations break.",
    k: ["Simulating the networks inside the sandbox vs connecting to network test systems: simulation is fast and controllable; real test systems catch real format issues but are slow and flaky.", "Fully separate data stores vs a mode flag on shared tables: separation prevents mixing; a flag is cheaper and risks a test object leaking into live reports."],
    p: ["A sandbox that always succeeds teaches merchants nothing about declines, so their error handling goes untested until live.", "Live webhooks delivered to an endpoint registered in test mode, or the reverse, confuse merchants and corrupt their data."],
    v: "Run each documented test card in the sandbox and confirm the exact outcome, event sequence and error code described for it, then confirm no test object appears in any live-mode list or report.",
    dep: ["payments-api", "api-auth"]
  },
  "dashboard": {
    s: "The web application merchants use to see payments, issue refunds, respond to disputes, manage keys and team members, and view payouts.",
    d: "It is a client of the same API merchants use, plus internal read models built for search and filtering across millions of payments. Merchant staff have roles that restrict, for example, who can refund or view full card details. Actions are logged. Search must be fast across fields like amount, email, last four digits and reference. It is hard because it exposes the most sensitive operations to people, so authentication, step-up checks and rate limits matter, and it must stay correct about eventually consistent data.",
    k: ["A separate search index vs querying the primary store: an index gives fast, flexible search; it lags the source and can show stale status.", "Showing data from the public API only vs privileged internal queries: public-only guarantees parity with merchants' code; internal queries enable features the API lacks."],
    p: ["A search index that lags the ledger shows a refund as pending after it is complete, creating duplicate refund attempts.", "Staff roles that are too coarse let any team member export every customer's details."],
    v: "Issue a refund as a restricted-role user, confirm it is refused, then as an authorized user and confirm the dashboard, API and audit log all show the same refund within the documented delay.",
    dep: ["payments-api", "api-auth", "access-audit"]
  },
  "payment-links": {
    s: "Hosted payment pages and shareable links that let a merchant collect payment with no integration, by sending a URL or showing a QR code.",
    d: "A merchant configures an item, amount and options in the dashboard, and the system produces a link that opens a hosted checkout page with the same payment methods, 3-D Secure and fraud checks as an API integration. The page creates a payment request when opened and reports the outcome to the merchant by event and email. Links may be single-use, reusable or expire. It is hard because it is a public, unauthenticated surface: links get guessed, shared, scraped and used for card testing.",
    k: ["Unguessable single-use links vs reusable links: single-use links limit abuse and need one per customer; reusable links suit posters and need quantity and expiry controls.", "Merchant-editable page content vs fixed templates: editable content aids conversion; it creates room for impersonation and phishing."],
    p: ["A reusable link with no limits becomes a free card-testing endpoint within days of being posted publicly.", "Link amounts editable in the URL let customers pay less than the listed price."],
    v: "Open a single-use link, pay, then open it again and confirm it is rejected. Tamper with the amount parameter and confirm the server uses the stored amount.",
    dep: ["payments-api", "hosted-fields", "velocity-checks"]
  },
  "subscriptions": {
    s: "Recurring billing: plans, schedules, proration, invoices and automated charging of stored payment methods, including recovery of failed charges.",
    d: "A subscription links a customer, one or more prices and a billing cycle. Each cycle the system generates an invoice, computes proration for changes, applies discounts and tax, then charges the stored credential. Failed charges enter a retry schedule, notify the customer and eventually cancel or suspend. The scheduler must run each charge once and at the right time in the customer's calendar. It is hard because billing rules are endless and money is involved: upgrades mid-cycle, trials, pauses, time zones and month ends.",
    k: ["Charging at a fixed time of day vs spreading load across the cycle: fixed times are predictable for merchants; spreading smooths load on networks and databases.", "Retrying failed charges on a fixed schedule vs a learned schedule: fixed is simple and explainable; learned recovers more revenue and is hard to debug."],
    p: ["A scheduler run twice after a restart bills every customer twice unless each charge is protected by an idempotency key.", "Proration computed in the wrong rounding order produces invoices that differ by cents from what customers expect."],
    v: "Create a monthly subscription with a trial, advance the sandbox clock through three cycles and a failed charge, and confirm the invoice amounts, retry timing, and final status match the configured rules.",
    dep: ["stored-credentials", "soft-decline-retries", "idempotency-keys", "payments-api"]
  },
  "platform-payments": {
    s: "Support for marketplaces and platforms that take a payment from a buyer and divide it among sellers, with the platform's own fee, and pay each party separately.",
    d: "A platform onboards sellers as connected accounts, each with its own identity checks and balance. A single customer payment can be split into transfers to several sellers and a platform fee, recorded as separate ledger entries. Payouts happen per seller. Refunds and disputes must unwind the right portions. Liability is a design decision: either the platform or each seller is responsible for negative balances. It is hard because every extra party adds compliance, reconciliation and failure cases, and each has to be traceable.",
    k: ["Platform as the merchant of record vs sellers as merchants of record: platform-owned flows give control and liability; seller-owned flows push responsibility outward and limit options.", "Splitting at payment time vs transferring later: splitting at payment is immediate and rigid; later transfers allow holds and adjustments."],
    p: ["A refund that does not reverse the seller's transfer leaves the platform paying out of its own balance.", "Onboarding sellers without identity verification makes the platform a conduit for laundering."],
    v: "Make a payment split between two sellers and a fee, refund half, and confirm each seller's balance, the platform fee and the ledger entries all change by exactly their proportional share.",
    dep: ["double-entry-ledger", "merchant-onboarding", "payout-scheduling", "refunds"]
  },
  "merchant-reporting": {
    s: "Reports and exports that give merchants their transactions, fees, payouts and disputes in forms their accountants can use.",
    d: "Merchants get filterable lists, summaries by period, and downloadable files of transactions and payout contents. The most important report ties each payout to the individual payments, fees and refunds inside it, so merchants can reconcile their bank deposits. Reports are generated from ledger-derived tables, not live operational data, and large exports run as background jobs. It is hard to make them exact: totals must agree with the bank deposit to the cent, across currencies and time zones.",
    k: ["Generating reports from the ledger vs from payment tables: ledger-based reports always tie to money movement; payment tables are simpler and can omit fees and adjustments.", "Synchronous downloads vs asynchronous report jobs: synchronous is simple for small merchants; asynchronous prevents large exports from timing out or loading the database."],
    p: ["Reports cut at midnight in the processor's time zone instead of the merchant's disagree with the merchant's books.", "Exports built on a replica with lag omit the most recent payments without any indication."],
    v: "Download the payout report for a test payout, sum its lines, and confirm the total equals the amount deposited in the test bank account and the ledger payout entry exactly.",
    dep: ["balance-computation", "payout-scheduling", "fee-engine"]
  },
  "merchant-onboarding": {
    s: "The process that turns an applicant into an approved merchant: collecting business details, verifying identity and ownership, assessing risk and setting limits and pricing.",
    d: "The applicant supplies company data, the people who own or control it, a bank account and a description of what they sell. The system verifies identity documents, checks registries and sanctions lists, reviews the website, and assigns a risk tier that determines reserves, payout delay and volume limits. Some merchants go live instantly with low limits and are reviewed as volume grows. It is hard because the flow is also a legal obligation: incomplete or fake information here becomes fraud and laundering later.",
    k: ["Instant approval with low limits vs full review before going live: instant raises sign-ups and exposes the processor to fraud; review is safer and loses applicants.", "Collecting information up front vs progressively as volume grows: up front is simple; progressive lowers friction and needs controls tied to thresholds."],
    p: ["An approved merchant whose real business differs from the described one carries higher dispute rates that nobody expected.", "Limits not enforced in the payment path make the risk tier decorative."],
    v: "Submit an applicant with a sanctioned-name test owner and confirm they are held for review, and that a low-tier approved merchant is refused when a payment would exceed the configured volume limit.",
    dep: ["kyc-aml", "sanctions", "merchant-risk"]
  },
});
