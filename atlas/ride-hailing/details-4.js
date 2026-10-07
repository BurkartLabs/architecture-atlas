// Details for the ride-hailing plate, part 4: payments, ratings and safety.
ATLAS.details("ride-hailing", {
  "payment-methods-vault": {
    s: "Stores riders' payment instruments as tokens held by a payment provider, with the platform keeping only references, never the raw card or account numbers.",
    d: "When a rider adds a card or wallet, the entry form sends details directly to the payment provider and receives a token that the platform stores with display data such as the last four digits and expiry. Tokens are used for authorization and capture. Methods can be verified, set as default, or replaced when the card network updates credentials. It is hard because it must meet card-data security rules, support local payment types in each country, and handle expired cards without failing trips.",
    k: ["Provider-held tokens vs own vault: provider tokens avoid holding card data and tie the platform to the provider; an own vault gives portability and a large compliance burden.", "Multiple providers vs one: multiple improve acceptance and resilience and complicate routing and reconciliation; one is simple and a single point of failure."],
    p: ["A card expires between booking and capture and the trip ends with an unpaid fare.", "A new payment type is supported in the app but not by the provider in that country."],
    v: "Add a test card, request a trip, and confirm the platform database holds only a token and display fields while the authorization succeeds, then expire the card and confirm the next booking is blocked with a clear message.",
    dep: []
  },
  "authorization-hold": {
    s: "Reserves funds on the rider's payment method before or at the start of a trip so that the final charge is likely to succeed.",
    d: "At request or pickup the system asks the provider to authorize an estimated amount plus a margin. The authorization is attached to the trip. At the end, the final fare is captured against it, and the remainder is released. Some methods cannot hold funds, and in those the platform verifies the method with a small authorization or relies on risk checks. It is hard because holds block the rider's available balance and may expire before a long trip ends.",
    k: ["Authorize the estimate vs a high ceiling: the estimate is gentle on the rider and fails when the fare exceeds it; a ceiling covers more and shows large pending charges.", "Authorize at request vs at pickup: at request catches bad cards before dispatch and holds funds for cancelled trips; at pickup holds less and finds problems late."],
    p: ["A hold for a trip that was cancelled is never released, and the rider sees money reserved for days.", "Hold expiry on a long trip makes the final capture fail as a new, unapproved charge."],
    v: "Run a test trip with an authorized amount, finish it with a lower fare and confirm the captured amount equals the fare and the remainder is released within the provider's stated time.",
    dep: ["payment-methods-vault", "trip-state-machine"]
  },
  "fare-capture": {
    s: "Charges the final fare when a trip completes, idempotently, with retries and a defined fallback when the payment fails.",
    d: "The trip-completed event triggers a capture request with an idempotency key built from the trip id. On success, the ledger records the charge and the receipt is issued. On failure, the system retries with backoff, tries alternate methods and marks the rider as owing, blocking new trips until settled. It is hard because capture must happen once even if events are redelivered or the provider times out after charging, and because the rider is no longer present to fix a failure.",
    k: ["Capture immediately vs batch: immediate gives fast receipts and many small provider calls; batch is cheaper and delays the visible charge.", "Block new trips on unpaid balance vs allow with a limit: blocking limits loss and strands customers; allowing a limit is friendly and costs more."],
    p: ["A timeout from the provider after a successful charge leads to a retry, and the rider is charged twice.", "An unpaid fare is never collected because the debt record is not linked to the next booking."],
    v: "Simulate a provider timeout after a successful charge and confirm the retry with the same key returns the first result, with one captured charge and one ledger entry.",
    dep: ["authorization-hold", "trip-state-machine", "event-bus"]
  },
  "driver-payouts": {
    s: "Moves earned money from the platform to drivers' bank accounts or wallets on a schedule, or instantly on request, net of fees and with compliance checks.",
    d: "At each payout run the system reads each driver's ledger balance, applies holds and fees, validates the destination, and sends a transfer through the banking provider. Instant payouts are offered for a fee. Results update the ledger. Failures such as closed accounts return to the balance with a reason. It is hard because payouts are irreversible once sent, because destinations vary by country and rail, and because fraud and regulatory checks may require holds.",
    k: ["Weekly scheduled payouts vs instant on demand: scheduled is cheap and predictable; instant retains drivers and costs more and increases fraud exposure.", "Pay gross and bill fees later vs pay net: gross is simple for drivers and creates debts; net is clean and complicates the ledger."],
    p: ["A payout is sent to a destination changed by an attacker minutes before the run.", "A failed bank transfer is marked paid, and the driver is not told."],
    v: "Run a payout cycle in a sandbox, and confirm each driver's transfer equals their ledger balance minus fees, ledger balances go to zero, and a deliberately invalid account is returned and shown to the driver.",
    dep: ["earnings-ledger", "tax-and-currency", "account-takeover"]
  },
  "refunds-and-adjustments": {
    s: "Corrections after a trip: refunds for poor service or overcharges, fare adjustments for route disputes, and the matching changes to driver earnings and taxes.",
    d: "Support or an automated rule creates an adjustment with a reason and an amount. The system reverses part of the charge through the provider, updates the receipt, and decides who bears the cost: the platform or the driver. Ledger entries record each side. It is hard because adjustments touch payment, driver pay, taxes and promotions together, and because refunds are a common abuse path.",
    k: ["Automatic small refunds vs agent approval: automatic is fast and cheap for the customer and exploitable; agent approval controls cost and slows resolution.", "Platform absorbs vs driver pays back: platform-absorbed keeps drivers whole and costs money; driver payback is cheap and unpopular when the driver was not at fault."],
    p: ["A refund is issued on the card but the driver is still paid the full fare, so the platform pays twice.", "Repeat refund requests for the same trip go through because nothing checks prior adjustments."],
    v: "Refund half of a test fare and confirm the card refund, receipt, driver ledger and tax record all show the adjustment, and that a second refund attempt on the same trip is checked against the first.",
    dep: ["fare-capture", "earnings-ledger", "support-and-disputes"]
  },
  "cash-trips": {
    s: "Trips paid in cash to the driver, where the platform tracks what the driver collected and recovers its commission from other earnings or by invoice.",
    d: "The fare is shown to both sides, the driver collects it at dropoff, and the trip is marked paid by cash. The platform's share becomes a debt on the driver's account, offset against card-trip earnings, and blocks cash trips when the debt passes a limit. It is hard because the platform cannot verify cash was paid, because it extends credit to drivers, and because cash introduces safety and tax handling issues.",
    k: ["Offset debt against card earnings vs separate invoices: offset is automatic and can leave drivers with little pay; invoices are transparent and slow to collect.", "Cash allowed for all riders vs trusted riders: all is accessible and open to disputes; trusted riders limit loss and exclude new customers."],
    p: ["A driver on cash-only trips accumulates debt and never pays it.", "Rider says they paid, driver says they did not, with nothing to settle it."],
    v: "Complete test cash trips and confirm the driver's cash debt equals the commission, card earnings offset it correctly, and cash trips are blocked automatically when the configured limit is exceeded.",
    dep: ["earnings-ledger", "trip-state-machine"]
  },
  "tax-and-currency": {
    s: "Calculates sales tax or VAT, handles withholding for drivers, and converts currencies, according to local rules, with records for filing.",
    d: "Each fare component is tagged with a tax treatment by jurisdiction. The system calculates taxes on the rider side, records driver income for reporting, and applies withholding where required. Foreign-currency riders are charged at a fixed rate with an explicit rule on conversion and rounding. Rates change by date. It is hard because rules differ at city level and change, and because incorrect tax is a legal exposure.",
    k: ["Own tax engine vs outsourced: own gives control and requires tracking law changes constantly; outsourced is current and adds a dependency and cost.", "Convert at charge time vs at settlement: charge time is predictable for the rider and carries exchange risk for the platform; settlement time is accurate and surprises the rider."],
    p: ["A new city tax takes effect on a date and the rates are updated a week late.", "Rounding is applied per line in some paths and on totals in others."],
    v: "Calculate taxes for a set of trips in each jurisdiction against reference results prepared by the tax team, and confirm every line matches to the cent on the effective date and the day before.",
    dep: ["city-config-and-launch"]
  },
  "payment-reconciliation": {
    s: "Checks that every charge, refund and payout in the platform's ledger matches the provider's and the bank's records, and flags any difference.",
    d: "Daily files from providers and banks are matched with ledger entries by reference and amount. Unmatched items are classified as timing, fee, error or fraud, and routed to finance. Totals are checked from trips to ledger to provider to bank. It is hard because providers report in different formats and times, because fees are netted from settlements, and because small mismatches accumulate into large money errors.",
    k: ["Daily automated matching vs month-end manual review: daily catches problems quickly and needs strong tooling; month-end is simple and discovers errors late.", "Match per transaction vs per batch totals: per transaction finds the exact item and is heavier; totals are simple and need drill-down when they differ."],
    p: ["A provider settles a charge a day later across a month boundary, and finance reports a phantom loss.", "Duplicate charges stay unnoticed because totals look balanced against duplicate ledger entries."],
    v: "Load a day of provider settlement data with three injected discrepancies and confirm all three are reported with the right category, and the remaining transactions match with zero unexplained difference.",
    dep: ["fare-capture", "driver-payouts", "earnings-ledger"]
  },
  "two-way-ratings": {
    s: "After each trip, riders rate drivers and drivers rate riders, with the scores and written feedback used for quality control, matching and account decisions.",
    d: "Both sides are prompted after the trip. Ratings are stored per trip, aggregated over recent trips, and shown in part to the other party. Low scores trigger coaching or review. Some systems use ratings in matching or access to premium classes. It is hard because ratings are biased and skewed toward the top, because they are used to punish a person for things such as traffic, and because they invite retaliation unless hidden until both are submitted.",
    k: ["Show ratings immediately vs reveal after both submit: immediate is simple and invites retaliation; blind reveal gives more honest scores.", "Simple average vs weighted recent: average is easy to explain and hides recent decline; weighted reacts quickly and is volatile for few trips."],
    p: ["A driver is penalized for a low score caused by a long wait at a venue that is not their fault.", "Ratings of riders reflect bias and are used without review to restrict access."],
    v: "Submit ratings from both sides of a test trip, and confirm neither is visible until both are in or the window closes, and the aggregate updates exactly once.",
    dep: ["trip-state-machine", "deactivation-and-appeals"]
  },
  "emergency-tools": {
    s: "In-app features for urgent help: an emergency button that contacts local services, trip sharing with trusted contacts, and a way to alert a safety team.",
    d: "The emergency button sends the trip, vehicle, driver and live location to a responder, or connects the user to local emergency services with location attached. Trip sharing gives friends a live link. A safety team can call both sides and escalate. It is hard because the feature must work with a weak network, because it must be safe to trigger accidentally, and because the response must be local, with each country having its own emergency numbers and rules.",
    k: ["Direct call to emergency services vs call to company team first: direct is fastest for real danger and strains services with false alarms; company first filters and delays help.", "Always-visible button vs inside a safety menu: always visible is quick and gets accidental presses; a menu is calm and slower in a crisis."],
    p: ["The emergency number for a country is wrong in the table, and the button dials the wrong service.", "The share link continues to work for days after the trip, exposing the rider's location."],
    v: "In every launched country, press the button in a test build on a test trip and confirm the correct local number is dialed with the location and vehicle details attached, and that the share link expires after the trip.",
    dep: ["live-trip-tracking", "incident-response", "city-config-and-launch"]
  },
  "route-anomaly-detection": {
    s: "Watches active trips for signs of trouble such as a long unexpected stop, a major deviation from the route or a trip that ends far from the destination, and prompts a check-in.",
    d: "The detector compares the live trace with the expected route and typical durations. A stop in an isolated place, a route that diverges without a traffic reason, or an unusually long trip raises a flag. The app asks the rider if all is well, and no response escalates to the safety team. It is hard because most anomalies are harmless, such as traffic, fuel stops and shortcuts, and too many prompts annoy people into ignoring them.",
    k: ["Rule-based thresholds vs learned model: rules are explainable and simple; learned models handle context and are harder to validate for safety.", "Prompt the rider vs alert the safety team directly: prompting is gentle and relies on a response; direct alerting is faster and floods the team."],
    p: ["Riders learn to dismiss the check-in without reading it, including the time it matters.", "A detector blind spot in tunnels and garages produces false alerts at predictable places."],
    v: "Replay recorded trips with staged detours and long stops and confirm the right ones trigger a check-in within the target time, while a set of normal traffic-delayed trips triggers few or none.",
    dep: ["map-matching", "routing-engine", "push-and-notifications"]
  },
  "identity-verification": {
    s: "Confirms that a driver or rider is who they claim to be, using identity documents, selfie matching and periodic re-checks.",
    d: "Drivers upload a license and a live photo that is matched against the document and, later, against the face at the start of shifts to stop account sharing. Some markets verify riders for trips or payment methods. Verification can use third-party document checks. It is hard because document formats vary by country, because face matching has uneven accuracy across groups, and because the photos and documents are highly sensitive personal data.",
    k: ["Verify once at onboarding vs recurring checks: once is easy for drivers and allows account sharing later; recurring prevents it and adds friction on every shift.", "Automated matching vs human review fallback: automated is fast and sometimes wrong for some users; human fallback is fairer and slow and costly."],
    p: ["Face matching fails more often for some groups of drivers, who are locked out unfairly.", "Identity photos are stored with broad access and leak."],
    v: "Submit a test set of valid, expired and forged documents and photos, and confirm each is classified correctly, that mismatched live selfies block going online, and that access to the stored images is logged.",
    dep: ["driver-onboarding"]
  },
  "background-screening": {
    s: "Checks driver applicants and periodically existing drivers against criminal, driving and sanction records, according to local law and the platform's policy.",
    d: "With consent, the platform sends the applicant's identity to a screening provider, which searches records and returns a report. Rules classify findings as pass, fail or manual review, with looks-back set by law. Continuous monitoring flags new offenses after approval. It is hard because the law limits what may be used and how, because records are often incomplete or mismatched to the wrong person, and because rejection decisions must be explainable and appealable.",
    k: ["Rely on one provider vs several: one is simple and has blind spots; several improve coverage and add cost and conflicting results.", "Continuous monitoring vs periodic re-screening: continuous reacts quickly and raises privacy concerns; periodic is cheaper and leaves gaps."],
    p: ["A common name leads to a false match and a qualified applicant is rejected.", "A required check is skipped for a city after a configuration error, and unscreened drivers go online."],
    v: "Run a set of test applicants with known records through the process and confirm the outcome matches the policy table, and that a driver cannot go online in a city until all required checks show as passed.",
    dep: ["driver-onboarding", "city-config-and-launch"]
  },
  "incident-response": {
    s: "The team, tools and procedures for handling reports of accidents, assaults and other safety incidents: triage, contact, evidence, support to the people involved and escalation to authorities.",
    d: "Reports arrive from the app, support and emergency tools. A case gets a severity, and the team reaches the people, preserves trip data including location trace and communications, applies temporary account holds and coordinates with law enforcement when required. Outcomes lead to policy changes. It is hard because it is time-critical and emotional, because evidence must be preserved legally, and because requests from authorities must be verified before sharing data.",
    k: ["24 hour in-house team vs outsourced: in-house knows the product and costs more; outsourced scales and loses context.", "Hold accounts immediately on report vs after review: immediate protects people and punishes false reports; after review is fair and leaves risk in place."],
    p: ["Trip data is deleted by retention policy while an investigation is open.", "A law-enforcement request is answered without verification and exposes a rider's trip history."],
    v: "Run a tabletop exercise with a simulated serious incident, and confirm severity is assigned, data is frozen from deletion, both parties' accounts are held per policy, and the response time meets the target.",
    dep: ["location-history", "trip-event-log", "emergency-tools"]
  },
  "driver-fatigue-limits": {
    s: "Rules that cap continuous or daily driving time and require rest, enforced by tracking online hours and blocking dispatch when a limit is reached.",
    d: "The system sums time a driver spends online or on trips across a rolling period, in some places across several platforms, warns as the limit nears, and prevents new offers once exceeded until a rest has passed. Limits are set by law or by company policy and configured per city. It is hard because online time is not the same as driving time, drivers may use several apps, and a hard stop mid-trip is dangerous.",
    k: ["Count online time vs driving time: online is simple and conservative and penalizes waiting; driving time is accurate and relies on trip data being complete.", "Hard block vs warning: a block enforces the rule and may strand a driver; warnings respect autonomy and leave risk."],
    p: ["A driver using two apps exceeds safe hours because each platform only sees its own.", "A limit hits mid-trip and the platform cancels instead of letting the driver finish."],
    v: "Simulate a driver accumulating hours to the limit, and confirm warnings appear at the thresholds, no new offers arrive after the limit, the current trip finishes, and offers resume after the required rest.",
    dep: ["driver-presence", "city-config-and-launch"]
  },
  "deactivation-and-appeals": {
    s: "The process for removing a driver or rider from the platform, with the reasons, evidence, notice and a path to challenge the decision.",
    d: "A decision from low ratings, safety incidents, fraud findings or policy violations creates a deactivation with a reason code. The person is notified, access is removed, and pending earnings are handled by rule. An appeal goes to a reviewer who sees the evidence and can reverse the decision. Some jurisdictions require notice and review. It is hard because a drivers' livelihood is at stake, automated systems cause wrongful decisions, and the platform must protect people reporting problems.",
    k: ["Automated deactivation vs human decision: automatic is consistent and fast and errs without review; human is fair and slow and expensive.", "Show the evidence vs only the reason code: evidence supports a fair appeal and may reveal who reported; a code protects sources and feels arbitrary."],
    p: ["A driver is deactivated by a model and never learns why, so no appeal is possible.", "Appeal backlog leaves wrongly blocked drivers without income for weeks."],
    v: "Deactivate a test driver for a stated reason and confirm notice with the reason is sent, access ends, earnings are settled by rule, and an appeal reaches a reviewer with the evidence and a decision within the target time.",
    dep: ["two-way-ratings", "fraud-case-management", "driver-payouts"]
  },
});
