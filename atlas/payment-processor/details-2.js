// Details for the payment processor plate, part 2: lifecycle, fraud and risk, refunds and disputes, currency and fees.
ATLAS.details("payment-processor", {
  "payment-state-machine": {
    s: "The explicit set of states a payment can be in and the allowed transitions between them, enforced in one place so every path agrees on what is possible.",
    d: "A payment moves from created through requires-action, processing, authorized, captured, partially refunded and similar states, with terminal states for failed, canceled and fully refunded. Each transition is triggered by an API call, a network response or an event, checked against the current state with an atomic compare-and-set, and records its cause. Late, duplicate or out-of-order inputs are common, so an input that does not fit the current state is stored and handled by rule rather than applied blindly. The difficulty is the number of asynchronous actors that can all change the same payment.",
    k: ["Explicit state machine vs status flags updated by each service: a machine makes illegal states unrepresentable; flags are quicker to add and drift apart over time.", "Optimistic compare-and-set vs locking each payment: compare-and-set scales and needs retry logic; locks are simple and risk contention on hot rows."],
    p: ["A late network response arriving after a timeout handler already canceled the payment produces a charge nobody tracks.", "Adding a new state without updating every consumer leaves some services treating it as an error."],
    v: "Fire conflicting inputs at one payment concurrently, such as capture and cancel, and confirm exactly one wins, the other receives a clear conflict error, and the recorded history is consistent with the final state.",
    dep: ["journal-entries", "event-log"]
  },
  "authorization": {
    s: "The request to the card issuer asking whether the cardholder can pay an amount, which if approved places a hold on funds but moves no money.",
    d: "The processor builds an authorization message with the card data or token, amount, currency, merchant category, capture method and risk data, sends it through the acquirer to the network and on to the issuer. The issuer checks funds, account status and its own fraud rules and answers with approve, decline or a request for more authentication. An approval carries an authorization code and may include data to quote later. A timeout is not a decline: the outcome is unknown, and the processor must find out before retrying.",
    k: ["Authorize and capture together vs separately: together is simpler and suits immediate goods; separate fits shipping later and requires tracking expiring holds.", "Treating a timeout as a decline vs as unknown: declining is simple and risks a customer's funds being held with no order; unknown requires reversal logic."],
    p: ["Retrying a timed-out authorization without reversing the first can leave two holds on the cardholder's funds.", "Ignoring the issuer's request for authentication and showing a generic decline wastes a payment that would have succeeded."],
    v: "Force a network timeout in the test environment and confirm the system sends a reversal, leaves the payment in a defined state, and the retry produces one hold, not two.",
    dep: ["message-gateway", "card-message-codec", "acquirer-routing", "response-codes"]
  },
  "capture": {
    s: "The instruction that turns an authorization into a claim for money, in full or part, queuing the transaction for clearing and settlement.",
    d: "After goods ship or the service is delivered, the merchant captures some or all of the authorized amount. The system checks that the authorization is still valid and not expired, records the capture, and includes the transaction in the next clearing file sent to the network. Captures can be partial, multiple, or less than authorized, and some networks forbid capturing more. Auto-capture does this immediately. It is hard because authorization windows vary by network and merchant type, and a capture after expiry may be declined or may raise dispute risk.",
    k: ["Immediate capture vs delayed capture: immediate removes the expiry risk and forces refunds for canceled orders; delayed avoids refunds and needs tracking of hold lifetimes.", "Allowing multiple partial captures vs one capture: multiples fit split shipments and need sum checks; one capture is simpler and rejects valid cases."],
    p: ["Capturing after the authorization expired forces a new authorization, which may fail, leaving a shipped order unpaid.", "Capturing more than authorized in a tolerance range assumed to be allowed is rejected by some networks."],
    v: "Authorize 100, capture 60 and then 40 in test, and confirm the clearing file contains both captures linked to the authorization and the ledger holds equal and opposite entries for each.",
    dep: ["authorization", "clearing-files", "posting-rules"]
  },
  "void-reversal": {
    s: "Canceling an authorization before capture, releasing the cardholder's held funds and telling the issuer the transaction will not be cleared.",
    d: "A void is the merchant's choice to cancel; a reversal is sent when the processor itself needs to undo an authorization, for instance after a timeout or a failed downstream step. The system sends a reversal message that references the original, the issuer releases the hold, and the payment moves to canceled. Reversals must be reliable because they are the only way to fix an authorization whose result is unknown. It is hard because reversals are best-effort in the network: a lost one leaves a hold that expires on its own days later.",
    k: ["Sending reversals automatically on any ambiguity vs only on request: automatic reversals protect cardholders and generate message volume; manual leaves orphaned holds.", "Reversing by exact original message vs by transaction reference: exact matching is precise and fragile; references tolerate changes and can be misapplied."],
    p: ["A reversal queued but lost in a restart leaves the cardholder with funds held and no order, driving support complaints.", "Voiding a payment already submitted for clearing has no effect and the customer is still charged."],
    v: "Authorize in test, cancel before capture, and confirm the network simulator receives a reversal referencing the original authorization, and that the payment ends canceled with no clearing record.",
    dep: ["authorization", "payment-state-machine", "async-queues"]
  },
  "three-ds": {
    s: "A protocol in which the issuer authenticates the cardholder during checkout, for example with a one-time code or app approval, shifting fraud liability and satisfying strong-authentication rules.",
    d: "The processor sends the issuer's directory service the order and device data. The issuer either approves silently based on risk (frictionless) or demands a challenge shown to the customer in a frame or app. The result carries a cryptographic proof that is attached to the authorization request. On success, liability for fraud usually moves to the issuer. It is hard because it interrupts the checkout: challenges are abandoned, redirect flows break in some browsers and apps, and the result must be bound to the exact amount and card.",
    k: ["Authenticating every payment vs only when required or risky: every payment maximizes liability shift and loses conversion; selective use keeps conversion and carries more fraud.", "Requesting an exemption vs a challenge: exemptions keep checkout smooth; the issuer may still demand a challenge, adding a round trip."],
    p: ["Treating an authentication result as valid for a later, different amount causes issuers to decline or dispute it.", "Abandoned challenges counted as declines distort approval metrics and risk models."],
    v: "Run a test payment that triggers a challenge, complete it, and confirm the authorization carries the authentication proof and the payment record shows the liability shift flag. Repeat with failure and confirm it is declined.",
    dep: ["authorization", "sca-rules", "risk-scoring"]
  },
  "stored-credentials": {
    s: "Saving a customer's payment method for later use, with the consent and message markers that networks require for repeat and merchant-initiated charges.",
    d: "On the first payment the customer consents and authenticates, and the system stores a token plus the identifier the network returns for that relationship. Later charges are marked as customer-initiated or merchant-initiated, and recurring or unscheduled, and reference the first transaction. Issuers use these flags to apply different approval rules. It is hard because rules differ by network and region, the original authentication cannot be redone offline, and a mislabeled transaction is declined or disputed more often.",
    k: ["Storing the network's original-transaction reference vs only the token: the reference raises approval rates for recurring charges; it is another value to keep consistent.", "Authenticating at setup only vs on each use: setup-only is frictionless for recurring billing; per-use is safer and cannot work without the customer present."],
    p: ["Charging a saved card without the merchant-initiated marker causes issuers to demand authentication that cannot happen, and the charge declines.", "Keeping a credential after the customer withdrew consent breaches network rules and invites disputes."],
    v: "Save a card with a first payment, then run a later off-session charge and confirm the authorization message carries the stored-credential markers and the original transaction reference from the first payment.",
    dep: ["tokenization", "authorization", "network-tokens"]
  },
  "incremental-auth": {
    s: "Adjusting the amount of an existing authorization, upward or downward, or approving part of a requested amount, for cases like hotels, fuel and tips.",
    d: "Some merchants cannot know the final amount in advance. The processor sends an initial estimated authorization, then incremental requests that add to the hold as the stay or order grows, and a final capture. An issuer may approve only part of the amount, and the system must let the merchant decide whether to accept the partial. Network rules limit how much and how long, and not every card type supports it. It is hard because the total across several messages must stay consistent with what the issuer holds.",
    k: ["Incremental authorizations vs one large initial hold: incrementals match the true amount and can be declined midway; a large hold is simple and ties up the customer's funds.", "Accepting partial approvals automatically vs asking the merchant: automatic is smooth; asking prevents shipping an order only half-paid."],
    p: ["Capturing more than the sum of authorized increments is rejected by the network and the merchant never gets the money.", "An incremental declined late in a stay leaves the merchant owed money with no way to collect."],
    v: "Authorize 50, add increments of 30 and 20, and confirm the stored authorization total is 100, the issuer simulator shows one hold of that size, and a final capture of 100 succeeds while 101 is refused.",
    dep: ["authorization", "capture", "payment-state-machine"]
  },
  "acquirer-routing": {
    s: "Choosing which acquirer or processor connection to send each transaction through, based on cost, approval rates, card type, currency and availability.",
    d: "For each authorization the router evaluates the card's network and country, the merchant's agreements, the currency, and live health and approval statistics of each connection. It picks the primary and, on a soft failure or outage, a fallback. Costs differ between acquirers, and approval rates differ by card type and region, so routing can raise both margin and conversion. It is hard because retrying through another acquirer after an ambiguous result risks a double authorization, and because changing routes alters the data used to judge performance.",
    k: ["Static rules vs adaptive routing from live approval data: static is predictable and auditable; adaptive improves results and can oscillate or hide a problem.", "Retrying on another acquirer after a decline vs never: retrying recovers some approvals; it can trigger issuer fraud rules and confuse the cardholder."],
    p: ["Failing over after a timeout without confirming the first outcome produces two authorizations for one purchase.", "Routing changes made without a holdout group make it impossible to tell if approval rates improved."],
    v: "Mark one connection unhealthy in test and confirm new transactions flow to the fallback, and that a transaction timed out on the first connection is reversed before any attempt on the second.",
    dep: ["acquirer-connectors", "bin-tables", "failover-routing", "observability"]
  },
  "soft-decline-retries": {
    s: "Logic that distinguishes declines that may succeed on a retry from final ones, and re-attempts only the first kind, at suitable times and by suitable means.",
    d: "Issuer responses carry reason codes. Some, like insufficient funds or a temporary issuer error, are soft: another try after a day or on payday may succeed. Others, like stolen card or closed account, are hard: retrying is useless and harms standing with the network. The system maps codes, caps attempts, spaces them out, and may refresh card details or request authentication before retrying. It is hard because codes are inconsistent across issuers, and networks penalize excessive retries with fees or compliance programs.",
    k: ["Retrying on a fixed schedule vs a data-driven schedule: fixed is simple and capped easily; data-driven recovers more and needs monitoring to stay within network limits.", "Silent retries vs notifying the customer to update their card: silent recovery is frictionless for temporary issues; prompting is the only route for hard declines."],
    p: ["Retrying hard declines repeatedly triggers network fees and warnings for excessive attempts.", "Treating every decline code as final cancels subscriptions that a retry would have saved."],
    v: "Simulate a soft decline followed by success, a hard decline, and an attempt past the cap, and confirm only the first is retried, the second is not, and the third stops at the configured limit.",
    dep: ["response-codes", "authorization", "account-updater"]
  },
  "risk-scoring": {
    s: "A model that estimates the probability a payment is fraudulent from hundreds of signals, returning a score within a few tens of milliseconds.",
    d: "At payment time the system assembles features about the card, customer, device, merchant, amount and history, and runs a trained model that returns a score. The score is combined with rules to approve, decline, require authentication or send to review. Models are trained on labeled outcomes, mainly disputes, which arrive weeks late. It is hard because labels lag, attackers adapt, base rates are tiny, and a false decline costs a customer while a miss costs the goods plus fees.",
    k: ["One global model vs per-merchant models: global models learn from far more fraud; per-merchant models fit local patterns and starve for data.", "Hard threshold vs a score feeding several actions: a threshold is simple; graduated actions such as step-up authentication reduce false declines."],
    p: ["Training on disputes alone misses fraud that was never reported, so the model learns only the fraud that gets caught.", "A new model released without a shadow run shifts approval rates for every merchant on day one."],
    v: "Replay a week of labeled historical payments through the model and confirm it reproduces its reported precision and recall within tolerance, and that live scoring latency stays under its budget at peak load.",
    dep: ["feature-store", "rules-engine", "device-signals"]
  },
  "rules-engine": {
    s: "A system for evaluating human-written conditions, such as country mismatch or high-value first orders, that block, allow or flag payments alongside the model.",
    d: "Rules are expressions over the payment's attributes and features, grouped into rulesets that can be tested against history, rolled out gradually and edited by risk analysts without a code release. Each rule produces an action and a reason shown in reviews and to merchants who may add their own. Order and conflicts are resolved by priority. It is hard because rules accumulate: hundreds of overlapping conditions, no one remembering why each exists, and a bad one can decline thousands of good customers within minutes.",
    k: ["Analyst-editable rules vs rules in code: editable rules respond to attacks within minutes; code review catches mistakes that live edits ship.", "Evaluating all rules vs stopping at the first match: evaluating all gives full explanations at more cost; stopping early is faster and hides other flags."],
    p: ["A rule written for one attack remains active for years and keeps blocking legitimate customers.", "Merchant-defined rules that conflict with the platform's make behavior impossible for support to explain."],
    v: "Backtest a new rule against last month's payments, confirm the count and value it would have blocked, deploy it in monitor-only mode, and verify live hits match the backtest before enforcing it.",
    dep: ["feature-store", "velocity-checks"]
  },
  "device-signals": {
    s: "Data about the browser or device and the user's behavior during checkout, such as fingerprints, typing patterns and network details, used to recognize returning or suspicious actors.",
    d: "A script or SDK on the checkout page collects device attributes, timing of interactions, network origin and whether automation tools are present, and sends them with the payment. The system links devices to cards, emails and accounts, so a device seen with many cards stands out. Data is hashed or tokenized where possible. It is hard because it is privacy-sensitive and subject to consent rules, attackers spoof fingerprints, and legitimate changes such as a new phone must not look like fraud.",
    k: ["Collecting rich client signals vs minimal data: rich signals detect bots and device reuse; they raise privacy obligations and integration cost.", "Fingerprint matching that is exact vs fuzzy: exact matching has few false links; fuzzy matching survives small changes and links unrelated users."],
    p: ["Merchants who block the collection script silently remove the best fraud signal for their own traffic.", "Using signals without lawful basis or consent in a region turns a fraud control into a compliance breach."],
    v: "Run a headless-browser bot and a normal browser through checkout and confirm the signal payload differs, the bot receives a higher score contribution, and the data stored contains hashes, not raw identifiers.",
    dep: ["feature-store", "data-retention"]
  },
  "velocity-checks": {
    s: "Counters that limit how many attempts, cards, amounts or accounts may be seen from one source in a time window, to catch testing and bursts.",
    d: "The system counts events per key, such as card, device, IP address, email and merchant, in sliding windows from a minute to weeks. Exceeding a threshold adds to the risk score or blocks outright. Card-testing attacks make many small authorizations to find live cards, so these checks guard payment creation before any network call is made. Counters live in a fast in-memory store updated on every attempt. It is hard because counters must be accurate across regions, cheap, and tuned so a sale or a family sharing a card does not trip them.",
    k: ["Exact counters vs approximate sketches: exact counts are easy to explain; sketches handle huge key spaces in less memory with small errors.", "Blocking at the limit vs scoring: blocking stops attacks instantly and hurts bursts of genuine customers; scoring lets other signals decide."],
    p: ["Counting only successful payments misses the tester whose attempts almost all fail.", "Counters not shared across regions let an attacker multiply the limit by the number of regions."],
    v: "Send fifty small authorizations from one test device with different cards in a minute and confirm the checks trip at the configured threshold, before any further requests reach the networks.",
    dep: ["feature-store", "rate-limits"]
  },
  "feature-store": {
    s: "The service that computes, stores and serves the derived values used by models and rules, with the same definitions at training time and at decision time.",
    d: "Features such as average amount on this card over thirty days or number of distinct countries this week are computed from the event stream and stored for low-latency lookup at decision time, with batch versions for training. Keeping the two in agreement is the main job: a feature computed differently online and offline makes a model behave differently in production than in testing. It is hard because lookups must complete in milliseconds, and because features that use data from after the decision silently leak the answer into training.",
    k: ["One definition feeding both batch and online use vs separate pipelines: one definition prevents skew and constrains tooling; separate pipelines are easier to start and drift.", "Precomputed aggregates vs computing at request time: precomputed is fast and stale by seconds; request-time is fresh and costly."],
    p: ["Training features computed with information available only after the payment inflate offline accuracy and fail live.", "A stale feature pipeline that silently stops leaves the model scoring on old data without any alert."],
    v: "For a sample of live decisions, recompute each feature from raw events as of the decision time and confirm it equals the served value, and alert when freshness exceeds the stated bound.",
    dep: ["event-log", "async-queues"]
  },
  "manual-review": {
    s: "A queue where analysts examine payments the system could not confidently approve or decline, and decide with the evidence on one screen.",
    d: "Payments within a gray band of risk are held, or approved and flagged, and sent to a queue with the signals, history and linked accounts. An analyst approves, declines or asks for more information, and each decision is stored as a label that retrains the model. The queue has deadlines because customers are waiting and authorizations expire. It is hard to staff and scale: review is expensive, decisions are inconsistent between analysts, and holding too many payments costs sales.",
    k: ["Reviewing before capture vs after shipping: before is safe and delays orders; after keeps speed and risks losing goods.", "Analyst decisions as training labels vs separate labeling: reuse is cheap; analyst bias and the selection of reviewed cases skew the model."],
    p: ["A queue that backs up past the authorization expiry forces re-authorization that the customer's bank may now decline.", "Only the borderline cases are reviewed, so the labels teach the model nothing about clear cases."],
    v: "Route a test payment into review, confirm it appears with its signals within the service target, approve it, and verify the decision, the analyst and the resulting label are all recorded and the payment proceeds.",
    dep: ["risk-scoring", "access-audit", "authorization"]
  },
  "merchant-risk": {
    s: "Continuous watching of merchants, not just buyers, for signs of fraud, illegal goods, sudden volume changes or inability to pay back disputes.",
    d: "The system tracks each merchant's volume, average ticket, refund and dispute rates, delivery times and shifts from their stated business. Alerts trigger holds, reserves, lower limits or termination. A merchant can be a front for fraud: a fake shop that processes stolen cards for a few days and disappears with the payouts. It is hard because the signs are statistical and delayed, the damage can be large before disputes arrive, and legitimate growth, such as a viral product, looks like an attack.",
    k: ["Delaying payouts for new merchants vs paying quickly: delays limit exposure and hurt cash flow and sign-ups; quick payouts win merchants and carry the loss.", "Automated holds on anomalies vs human review first: automation stops loss quickly and hurts legitimate spikes; review is slower and accurate."],
    p: ["Monitoring only dispute ratios reacts weeks after the money has gone.", "A merchant split across several accounts avoids per-account thresholds that were meant to catch it."],
    v: "Simulate a new merchant with a tenfold sudden volume jump and confirm an alert fires, the payout is held within the configured delay, and the hold and reason appear in the merchant's account history.",
    dep: ["dispute-ratios", "reserve-accounts", "transaction-monitoring"]
  },
  "refunds": {
    s: "Returning money to a customer after a payment, in full or part, through the original payment method and the ledger.",
    d: "The merchant requests a refund for a captured payment. The system validates that the amount does not exceed the remaining refundable total, posts the ledger entries moving funds from the merchant's balance, and sends a credit message to the network or an instruction to the bank. The cardholder typically sees it in days. Refunds are not reversals: the original fees are normally not returned. It is hard because refunds can fail, such as to a closed card, and funds may need to go by another route, while merchants with no balance cannot cover them.",
    k: ["Refunding from the merchant's balance vs from platform funds: balance refunds protect the processor and can fail on empty balances; platform funds always work and add credit risk.", "Refunds to the original method only vs to any method: original-only blocks laundering; any-method handles closed cards and invites abuse."],
    p: ["Two concurrent refund requests that each check the remaining amount separately refund more than was paid.", "A failed refund treated as complete leaves the customer unpaid and the merchant believing it was done."],
    v: "Issue two simultaneous refunds that together exceed the payment and confirm only one succeeds, then fail a refund at the network simulator and confirm the payment shows it failed and the ledger returns the funds.",
    dep: ["double-entry-ledger", "payment-state-machine", "message-gateway", "fee-engine"]
  },
  "dispute-intake": {
    s: "Receiving a chargeback notice from the network, matching it to the original payment and starting a response clock.",
    d: "The cardholder disputes a charge with the issuer, who raises it with the network under a reason code such as fraud, not received or not as described. The notice arrives as a file or message, is parsed, linked to the original payment, and the disputed amount is immediately debited from the merchant. The merchant is notified with the deadline, often a week or two. It is hard because notices carry codes with rules that vary by network, arrive in volume at month end, and may not match any payment because the original was split or its reference changed.",
    k: ["Debiting the merchant at intake vs at final loss: immediate debit protects the processor and strains merchants; later debit is friendlier and increases exposure.", "Automatic matching by reference alone vs fuzzy matching: references are exact and fail on missing data; fuzzy matching finds more and can link the wrong payment."],
    p: ["A notice that matches no payment is dropped, the deadline passes, and the dispute is lost by default.", "Dispute notices received twice, from a retry or both a file and a message, debit the merchant twice."],
    v: "Feed a test dispute notice through intake, and confirm it matches the correct payment, creates one ledger debit, notifies the merchant with the correct deadline, and that feeding it again creates nothing new.",
    dep: ["clearing-files", "double-entry-ledger", "idempotency-keys"]
  },
  "evidence-assembly": {
    s: "Collecting and packaging proof that a payment was legitimate, such as delivery records, customer communications and authentication results, into the format the network expects.",
    d: "For each dispute the system pulls data it already holds: authentication result, device and IP, prior successful payments by the same customer and the stored consent. It asks the merchant for what only they have, such as tracking, signed delivery or usage logs, and builds a document under size and format limits that match the reason code. The right evidence differs by code: proving delivery answers non-receipt, not fraud. It is hard because merchants respond late, evidence is unstructured, and quality decides win rates.",
    k: ["Auto-compiling evidence vs merchant-supplied only: auto-compiling raises win rates and covers merchants who never respond; merchant-supplied evidence is stronger for goods and services.", "Reason-specific templates vs a generic packet: templates fit the rules of each code; a generic packet is simple and wins less."],
    p: ["Submitting generic evidence for a fraud code, which asks about authorization, not delivery, loses a winnable case.", "Missing the network's file size or page limits causes the whole submission to be rejected at the deadline."],
    v: "Open a test dispute for each of three reason codes and confirm each generated packet contains exactly the fields that code requires, within the size limits, and includes the stored authentication result.",
    dep: ["dispute-intake", "event-log", "three-ds"]
  },
  "representment": {
    s: "Submitting the merchant's response to a dispute through the network and tracking each later stage until the issuer accepts it or the case escalates.",
    d: "Before the deadline the system sends the evidence to the network. The issuer reviews it and either reverses the chargeback, returning funds to the merchant, or maintains it. The case can then proceed to a second dispute round or arbitration, where the loser pays fees. Each stage has its own clock and amounts, and each outcome posts different ledger entries. It is hard because the process is long, rules differ by network, and the economics of fighting small disputes are often negative.",
    k: ["Contest every dispute vs only when the expected win exceeds the cost: contest-all is simple and loses money on small ones; selective is efficient and needs a model of win odds.", "Automating responses vs requiring merchant approval: automation never misses a deadline; approval keeps merchants in control and misses some."],
    p: ["Missing the deadline by minutes through a time zone mistake loses a case that evidence would have won.", "Ledger entries posted at the wrong stage leave merchant balances wrong until someone reconciles them."],
    v: "Run a test dispute through submission, issuer reversal and a second-round loss, and confirm each stage posts the expected ledger entries, fees and merchant notifications, and that the final balance matches the total.",
    dep: ["evidence-assembly", "double-entry-ledger", "message-gateway"]
  },
  "dispute-liability": {
    s: "Rules and balances determining who bears the cost of a lost dispute, and the funds the processor holds in advance to cover it.",
    d: "When a dispute is lost, the amount plus a fee is charged to the merchant. If the merchant's balance is empty or the merchant is gone, the processor absorbs it. To limit this, higher-risk merchants have rolling reserves or delayed payouts sized to expected dispute exposure, which can extend for months because disputes can arrive up to a hundred and twenty days or more later. It is hard because exposure depends on delivery timelines and merchant type, and because over-holding hurts merchants while under-holding loses money.",
    k: ["Rolling percentage reserve vs fixed deposit: a percentage tracks volume and releases over time; a fixed deposit is simple and can be too small as volume grows.", "Pricing in expected losses vs holding collateral: pricing keeps merchants happy and costs everyone; collateral targets the risky ones and affects sign-ups."],
    p: ["Releasing a reserve on a schedule shorter than the dispute window leaves losses with nothing to cover them.", "Applying the same reserve to all merchants penalizes low-risk ones until they leave."],
    v: "Create a test merchant with a ten percent rolling reserve, process payments, and confirm held amounts, release dates and the ledger reserve account all match the policy, and that a late dispute draws on the reserve.",
    dep: ["reserve-accounts", "merchant-risk", "dispute-intake"]
  },
  "dispute-ratios": {
    s: "Tracking each merchant's disputes against their transactions, because networks run monitoring programs that fine or remove merchants and processors above set thresholds.",
    d: "The system computes monthly dispute counts and amounts divided by sales volume per merchant and for the processor overall, using the definitions each network publishes, which differ in counting dates and what is included. Merchants approaching thresholds get warnings and may be required to put remediation in place. The processor's own ratio matters as much: a few bad merchants can put it in a program with fees and restrictions. It is hard because the ratio lags by months and has to be calculated the way each network does.",
    k: ["Using the network's exact definitions vs one internal definition: exact matches avoid surprises and requires several calculations; one definition is simple and mispredicts program entry.", "Alerting at an early threshold vs at the network's limit: early alerts leave time to act and annoy merchants; late alerts risk penalties."],
    p: ["Counting disputes by the transaction date rather than the network's reporting month produces a different ratio from the one used to fine the processor.", "Ignoring early-warning programs and early refunds that avoid disputes hides a real problem."],
    v: "Load a month of test payments and disputes, compute the ratio with the system and by hand using the network's published formula, and confirm they match and the alert fires at the configured level.",
    dep: ["dispute-intake", "merchant-risk"]
  },
  "fx-rates": {
    s: "Sourcing, validating and storing exchange rates from banks and market data providers, with timestamps, for pricing, conversion and reporting.",
    d: "Rates are pulled from one or more providers on a schedule, checked against each other and against recent history to reject spikes and stale values, then published with a validity window. Different uses need different rates: quotes shown to customers, rates locked for a payment, the rate the bank actually applies at settlement, and month-end reporting rates. It is hard because each use has a different source of truth, and the difference between quote and realized rate is a real cost or gain someone must account for.",
    k: ["Multiple providers with cross-checks vs one provider: cross-checks catch bad data and cost more; one provider is simple and fails silently.", "Rates stored with exact timestamps vs daily rates: timestamps make every conversion reproducible; daily rates are smaller and less precise."],
    p: ["A provider outage causes the system to keep using a stale rate that is hours old, so conversions are mispriced.", "Overwriting a rate instead of versioning it makes past conversions impossible to explain."],
    v: "Inject a rate spike of fifty percent from one provider and confirm it is rejected against the other source, the last good rate is flagged stale after its window, and past conversions can be reproduced from stored rates.",
    dep: ["event-log"]
  },
  "presentment-currency": {
    s: "Letting merchants price in one currency and customers pay in another, with a quoted rate and a clear statement of the amount charged.",
    d: "The merchant sets prices in their currency, or per-currency prices. For a customer in another currency, the system quotes a converted amount using a rate with a markup, locks it for a short period, and charges in that currency. Networks require clear disclosure and give cardholders a chance to choose their home currency. The processor then carries the conversion to the merchant's settlement currency. It is hard because rounding differs by currency, quoted and settled amounts can differ, and refunds must decide which rate applies.",
    k: ["Locking a rate for the payment vs repricing at capture: a lock gives the customer certainty and the processor FX risk; repricing moves risk to the customer and confuses them.", "Showing converted prices throughout vs only at checkout: throughout is consistent and recalculates often; checkout-only is simple and surprises users."],
    p: ["Refunding at today's rate instead of the original means the customer receives a different amount than they paid.", "Currencies with no minor unit or three decimals handled as if all have two mischarge by a factor of ten or a thousand."],
    v: "Charge a test order in a currency with no decimals and one with three, and confirm the network message carries the correct integer amount for each and a refund returns the exact original amount.",
    dep: ["fx-rates", "money-representation", "authorization"]
  },
  "settlement-conversion": {
    s: "Converting funds collected in one currency into the merchant's payout currency, with the rate, fees and timing recorded for each conversion.",
    d: "Funds arrive from networks in various currencies. If the merchant wants payout in another currency, the processor exchanges at a rate in a batch with its banking partner, then allocates the result to merchants by their share. The ledger records the exposure in each currency and the realized difference. It is hard because the processor holds currency risk between collection and conversion, may net positions across merchants, and has to allocate costs and gains fairly down to a single payment.",
    k: ["Converting per payout vs netting and converting in bulk: per payout is simple to explain; bulk netting reduces fees and requires allocation of the result.", "Hedging currency exposure vs accepting it: hedging stabilizes margins at a cost and complexity; accepting is cheap and exposes results to market moves."],
    p: ["Allocating the batch rate unevenly leaves small rounding residue that accumulates into an unexplained ledger balance.", "Conversion done at payout without recording the rate makes merchant statements impossible to verify."],
    v: "Settle test payments in two currencies into one payout currency, and confirm each merchant's converted amount, the applied rate and the fee reconcile to the bank's conversion advice with no unallocated residue.",
    dep: ["fx-rates", "double-entry-ledger", "settlement-batching"]
  },
  "fee-engine": {
    s: "The component that computes what each payment costs and what the merchant is charged, from the layers of network, issuer and processor fees.",
    d: "For each transaction the engine looks up the interchange category from card type, region, capture method and merchant category, adds network assessments and the processor's markup, and applies the merchant's contract, which may be blended or itemized. Fees are computed when the transaction clears, because the category can change with how it was captured, and posted to the ledger separately from the principal. It is hard because pricing tables are large and change twice a year, contracts have exceptions, and a one-basis-point error across billions is real money.",
    k: ["Blended pricing vs interchange-plus: blended is simple for merchants and hides margin variation; interchange-plus is transparent and complex to explain and bill.", "Computing at authorization vs at clearing: authorization-time gives immediate estimates; clearing-time is accurate and arrives later."],
    p: ["Applying last quarter's table after a network change misprices every transaction until someone notices.", "Rounding each fee separately instead of the sum causes totals to differ from the network's invoice."],
    v: "Run a set of test transactions with known categories through the engine and compare each computed fee and the total with the network's published tables and a hand calculation, to the cent.",
    dep: ["interchange-tables", "posting-rules", "money-representation"]
  },
  "interchange-tables": {
    s: "The versioned data tables of interchange rates, assessments and scheme fees, with effective dates, that the fee engine and routing read.",
    d: "Networks publish rate tables covering thousands of categories, as a percentage plus a fixed amount, with conditions such as card type, region and data quality. The processor loads each new release, validates it against the previous one, and activates it on the effective date, keeping old versions for historical transactions. The same data helps routing and pricing. It is hard because formats vary, releases arrive on short notice, and a misparsed table silently mispriced millions.",
    k: ["Automated table ingestion vs manual entry: automation scales and needs strong validation; manual entry is slow and catches odd changes.", "Versioning by effective date vs overwriting: versioning keeps every historical fee reproducible; overwriting is smaller and loses history."],
    p: ["A table activated a day early or late misprices a day of transactions that must then be corrected for each merchant.", "Missing a rarely used category defaults to the highest rate without anyone noticing."],
    v: "Load a new release in staging, diff it against the previous version, and confirm changed rows match the network's change notice, and that a transaction dated before the effective date still prices at the old rate.",
    dep: []
  },
});
