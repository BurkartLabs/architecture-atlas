// Details for the booking system plate, part 4: payments, guests and permissions, storage, time and operations.
ATLAS.details("booking-system", {
  "payment-authorization": {
    s: "Verifies that a payment method can cover the amount and reserves the funds, or takes payment outright, as part of confirming a booking.",
    d: "At checkout the system sends the amount, currency and a payment token to the processor and receives an approved, declined or action-required result, including extra customer authentication where mandated. An authorization reserves funds for a limited time without moving them. The result is stored with the booking and the idempotency key. The hard parts are the unknowns: timeouts where the outcome is unclear, asynchronous results delivered later by callback, and approvals that arrive after the hold expired.",
    k: ["Authorize then capture vs immediate charge: authorizing lets the booking fail cleanly and expires if unused; immediate charge is simple and needs refunds for any failure.", "Wait for the result in the request vs treat it as pending and finish by callback: waiting is simple for the guest; pending handles slow authentication and requires a robust callback path."],
    p: ["A timeout is treated as a decline, the guest retries, and both attempts later succeed.", "A callback arrives for a booking already canceled and the funds are never released."],
    v: "Run test payments for approve, decline, extra authentication and timeout outcomes. After each, the booking state, held funds and processor record must agree, and a repeated callback must change nothing.",
    dep: ["payment-method-tokens", "idempotent-booking-requests", "confirmation-commit"]
  },
  "deposits-and-prepayment": {
    s: "Collects part or all of the price at booking time, with schedules for the balance, and rules for what is kept if the guest cancels.",
    d: "Policies range from no payment, to a card guarantee, to a deposit of a fixed amount or percentage, to full prepayment. A schedule can charge installments before the date, using the stored method. Deposits are tied to the cancellation policy that decides refundability. Funds may belong to the supplier or be held by the platform until fulfillment. The challenge is state: tracking paid, due and refundable amounts per booking, and handling failed scheduled charges close to the date.",
    k: ["Full prepayment vs deposit with balance later: prepayment secures revenue and lowers conversion; deposits convert better and risk failed later charges.", "Hold funds until fulfillment vs release to the supplier at once: holding protects guests and needs fund handling rules; immediate release is simple and exposes refunds to the supplier's solvency."],
    p: ["A balance charge fails a week before arrival and no one follows up until the guest shows up.", "A deposit is refundable under the policy but already paid out to the supplier."],
    v: "Book with each payment policy, advance the clock, and confirm balances are charged on schedule, a failed charge triggers the dunning steps, and cancellation refunds follow the stored rule.",
    dep: ["payment-authorization", "payment-method-tokens", "cancellation-policies", "scheduler-and-timers"]
  },
  "capture-and-settlement": {
    s: "Moves authorized funds from the guest, records them as received, and reconciles the processor's batch settlements with the system's own payment records.",
    d: "Capture claims the authorized amount at the right time, such as at booking, check-in or after the stay. The processor later settles net amounts to the business's account, minus fees. A reconciliation job matches each settlement line to payments and refunds, and flags differences: missing, duplicated or amounts that differ. Finance relies on this to close books. The challenge is time and volume: delays between capture and settlement, partial captures, currency conversion and chargebacks arriving weeks later.",
    k: ["Capture at booking vs at fulfillment: early capture secures funds and complicates refunds; late capture keeps flexibility and risks expiry of the authorization.", "Match by processor reference vs by amount and date: references are exact when present; fuzzy matching handles gaps and creates wrong matches."],
    p: ["An authorization expires before the late capture and the business discovers it only at the end of the month.", "Settlement lines net out fees and refunds, so totals never equal the sum of bookings without breaking them down."],
    v: "Reconcile a month of test payments, refunds and a chargeback against the processor statement. Every settlement line should match a record, and the unmatched total should be zero or explained.",
    dep: ["payment-authorization", "money-and-refund-correctness", "booking-record"]
  },
  "refunds-and-credits": {
    s: "Returns money or issues credit when a booking is canceled, changed or compensated, according to the policy and the actual payment method and amount.",
    d: "The refund calculation uses the stored price breakdown, the policy in force, and what was actually paid and captured. It may refund fully or partly to the original method, or issue a credit or voucher for later use. Each refund is idempotent and tied to the event that caused it. Processors limit refund windows and methods. The challenge is multi-step operations: partial refunds after partial captures, refunds across currencies, and keeping the booking and the processor's records agreed when a refund fails.",
    k: ["Refund to original method vs credit voucher: original is fair and costly for the business; vouchers retain revenue and need accounting for unused balances.", "Automatic refunds vs staff approval above a threshold: automatic is fast and consistent; approval stops mistakes and errors by delaying the guest."],
    p: ["A retried refund request is processed twice because it had no idempotency key.", "The card was replaced after booking and the refund fails with no fallback path."],
    v: "Refund partially, fully and repeatedly on the same test booking, in each policy window. The processor's total refunded and the ledger must equal the policy amount exactly once.",
    dep: ["payment-method-tokens", "price-quote-and-lock", "cancellation-policies", "idempotent-booking-requests"]
  },
  "payment-method-tokens": {
    s: "Stored references to a guest's card or wallet, held by the payment provider, which let the system charge later without handling the raw numbers.",
    d: "The guest's details go straight to the provider from the browser, and the system receives only a token tied to the guest and the agreed use, such as a no-show fee or balance. Tokens are stored with the booking or profile with the consent that was given. Charges using them are marked as business-initiated. Tokens expire, get replaced by card networks and can be declined. The challenge is compliance scope and consent: using a stored token for something the guest did not agree to is a dispute.",
    k: ["Tokens held by the provider vs details stored in-house: provider tokens shrink security scope and tie you to the provider; in-house storage gives control at a very high compliance cost.", "Token per booking vs token per guest profile: per booking limits misuse and re-entry; per profile is convenient and widens the blast radius."],
    p: ["A token saved for a deposit is later used for an unrelated charge and the guest disputes it.", "Raw card numbers leak into logs or support notes during debugging."],
    v: "Search logs, stores and exports for card number patterns in a test environment and find none. Charge a stored token for the agreed purpose and confirm the record shows the consent reference.",
    dep: ["consent-and-data-requests", "guest-profiles"]
  },
  "supplier-payouts-and-commission": {
    s: "Splits the money from a booking among the business, the venue or supplier and any channel: commissions, fees, payout schedules and statements.",
    d: "In a marketplace the platform collects from the guest and pays suppliers after fulfillment, minus commission and fees. Partner channels take their own commission, either deducted or invoiced. Payout runs batch eligible completed bookings, apply refunds and adjustments, and produce statements. Cancellations after payout create clawbacks. The challenge is timing and traceability: each payout line must trace to bookings, and refunds and chargebacks that arrive later must correct the right period.",
    k: ["Pay after fulfillment vs on booking: after fulfillment protects against cancellations and delays suppliers; on booking helps suppliers and exposes the platform to refunds.", "Commission computed at booking vs at completion: at booking is predictable; at completion reflects changes and cancellations correctly."],
    p: ["A supplier is paid for a booking that was refunded the next day, and recovery is manual.", "Commission rates change and old bookings are recalculated at the new rate."],
    v: "Run a payout cycle over completed, canceled and partly refunded test bookings. Each statement line must trace to a booking, totals must equal the ledger, and a later refund must appear as an adjustment.",
    dep: ["check-in-and-fulfillment", "capture-and-settlement", "refunds-and-credits"]
  },
  "invoicing-and-receipts": {
    s: "Produces the documents that prove what was charged: receipts for guests, tax invoices for businesses, and corrections when the booking changes.",
    d: "Documents are generated from the stored price breakdown and payment events, numbered in a gapless sequence where law requires, and include tax details, party details and currency. Amendments and refunds produce credit notes, not edits to the original. Business customers may need invoices with their tax identity and payment terms. The challenge is legal correctness across places, immutability once issued, and keeping documents consistent with the ledger across partial refunds and currency conversion.",
    k: ["Issue documents immutably with credit notes for changes vs regenerate on edit: immutable satisfies audit rules and adds documents; regenerating is tidy and unacceptable to auditors.", "Generate on demand vs store at issue: on demand is smaller and drifts when templates or data change; stored copies are exact and consume space."],
    p: ["A receipt is regenerated after a template change and no longer matches what the guest originally received.", "Invoice numbers have gaps because a failed generation consumed a number."],
    v: "Issue, amend and partly refund a test booking and confirm the document set: original, credit note and new invoice, with sequence numbers contiguous and totals equal to the ledger.",
    dep: ["booking-record", "taxes-and-fees", "refunds-and-credits"]
  },

  "guest-profiles": {
    s: "The record of a person who books: contact details, preferences, history, saved payment references and links to the bookings they made.",
    d: "A profile consolidates the guest across bookings and channels using email, phone or account identity. It stores preferences, language, past stays, notes and consent. Matching and merging avoid duplicates, while avoiding wrongly joining two people with a shared email. Profiles feed personalization, no-show scoring and support. The challenge is data quality and privacy: partner bookings carry partial or masked details, and everything stored must be justified, secured, and deletable on request.",
    k: ["Create profiles automatically from bookings vs only for registered accounts: automatic gives history for everyone and stores more people's data; registered-only is lean and loses insights.", "Merge duplicates automatically vs by review: automatic is clean and joins strangers sometimes; review is accurate and leaves duplicates."],
    p: ["Two family members sharing an email are merged and see each other's bookings.", "Free-text notes about guests include sensitive details visible to every staff role."],
    v: "Create bookings through different channels for the same and for different people with shared contact details. Confirm correct matching, no cross-visibility, and that a deletion request removes personal fields everywhere.",
    dep: ["booking-store", "consent-and-data-requests", "roles-and-permissions"]
  },
  "party-and-traveler-details": {
    s: "The details of everyone attending, not just the payer: names, ages, documents, needs and contacts, collected when the product requires them.",
    d: "A booking may have one payer and many attendees. Products demand attendee data for tickets, insurance, safety, legal registration or personalization. Details can be required at booking or by a deadline, with reminders to complete them. They link to eligibility checks and to check-in. The challenge is that attendee data is personal and sometimes sensitive, may involve minors, and must be corrected after the fact without breaking tickets or the audit trail.",
    k: ["Require all attendee details at booking vs collect later: upfront is complete and reduces conversion; later is friendly and leaves missing data at arrival.", "Name-bound tickets vs transferable: bound tickets reduce resale and require name changes; transferable is flexible and invites scalping."],
    p: ["Names are misspelled and a document check at the door fails, so the guest is refused.", "Attendee details sit in a text field with no retention limit after the event."],
    v: "Book a party with missing details, follow the reminders, correct a name after confirmation and check in. The corrected data should flow to the ticket and the manifest, with the change in the audit trail.",
    dep: ["booking-record", "eligibility-and-party-rules", "consent-and-data-requests"]
  },
  "accounts-and-login": {
    s: "Optional sign-in for guests and required sign-in for staff and partners, with passwords or passwordless methods, recovery and session control.",
    d: "Guest accounts let people see their bookings and rebook quickly, while guest checkout avoids forcing registration. Staff and partner accounts use stronger authentication and are bound to roles and venues. Sessions have limits and can be revoked. Identity may come from an external provider. The challenge is the trade-off between friction and security: account takeover exposes personal data and payment tokens, while a forced account loses sales, and linking old guest bookings to a new account must be verified.",
    k: ["Guest checkout allowed vs account required: guest checkout converts more and has less data to reuse; accounts help loyalty and support and add friction.", "Passwordless links vs passwords: links remove password reuse and depend on email security; passwords are familiar and attract credential stuffing."],
    p: ["Account recovery relies on an email that was mistyped at booking, and bookings attach to the wrong person.", "Staff sessions never expire and a shared front desk device leaves the system open."],
    v: "Sign up, book as guest, then create an account with the same email and confirm only verified bookings link. Revoke a staff session and confirm it is refused on the next request.",
    dep: ["guest-profiles", "roles-and-permissions"]
  },
  "loyalty-and-credits": {
    s: "Balances that reward or compensate guests: points, member tiers, store credit and vouchers, earned by bookings and spent on later ones.",
    d: "Points accrue on completed bookings according to rules, and tiers unlock benefits such as waitlist priority or lower fees. Credits arise from refunds, compensation or promotions, and are redeemed at checkout as part of the price calculation. Each balance is a ledger with expiry. The challenge is correctness of balances under cancellation: points earned on a canceled booking must be reversed, credit must not be spent twice, and liability for outstanding credit must be tracked.",
    k: ["Earn at booking vs at completion: at booking motivates and needs clawback; at completion is accurate and delayed.", "Credits as a ledger of entries vs a balance field: a ledger is auditable with expiry by entry; a field is simple and impossible to explain or repair."],
    p: ["A canceled booking keeps its earned points and the guest farms rewards through repeated bookings and cancellations.", "Credit is spent in two concurrent checkouts and the balance goes negative."],
    v: "Earn, spend, cancel and expire points and credits across concurrent checkouts. The ledger must sum to the displayed balance, and double spending must be refused.",
    dep: ["guest-profiles", "price-quote-and-lock", "refunds-and-credits"]
  },
  "consent-and-data-requests": {
    s: "Records what each person agreed to and handles requests to access, correct, export or delete their data under privacy rules.",
    d: "Consent entries store what was agreed, when, where and under which wording: terms, marketing, data sharing, stored payment use. Data requests trigger a search across the store, copies, logs, partner systems and backups, then an export or deletion, subject to legal retention such as tax records. A booking system holds data in many copies, so deletion must be coordinated. The challenge is completeness and proof: knowing everywhere a person's data lives and showing that the request was carried out.",
    k: ["Delete immediately vs anonymize while keeping financial records: deletion fully honors the request and breaks accounting; anonymizing preserves totals and must be irreversible.", "Central consent service vs per-feature flags: central gives one source and a dependency; flags are local and inconsistent."],
    p: ["Deletion removes the profile but the data remains in analytics copies and email provider lists.", "Consent is stored without the wording version, so it cannot be shown to be valid."],
    v: "File a deletion request for a test guest and search every store, cache, export, log and partner copy for their identifiers. None should remain except retained financial records with identifying fields removed.",
    dep: ["booking-store", "audit-trail", "guest-profiles"]
  },
  "roles-and-permissions": {
    s: "Defines what each kind of user may see and do: guest, front desk, manager, finance, partner, support, administrator, scoped to venues and tenants.",
    d: "Permissions attach to roles and to scope, such as one venue or one channel. Sensitive powers need separate rights: overriding a restriction, refunding above a limit, viewing full guest details, exporting data. Each check is made on the server for every action, and each use is recorded. Partners see only their own bookings and inventory. The challenge is accumulated exceptions: roles drift as people take on duties, and checks missing on one endpoint nullify the model.",
    k: ["Role-based with scopes vs per-user permission lists: roles are manageable and coarse; per-user lists are precise and impossible to review at scale.", "Enforce in one central layer vs in each handler: central enforcement is consistent and hard to bypass; per-handler is flexible and gets forgotten."],
    p: ["An export endpoint checks login but not role, and any staff user downloads the full guest list.", "A former employee keeps access because deprovisioning is manual."],
    v: "For each role, attempt every sensitive action on a test venue and on another venue. Allowed actions succeed and are logged; others are refused at the server, including direct calls that skip the interface.",
    dep: ["tenant-configuration", "audit-trail"]
  },

  "booking-store": {
    s: "The transactional database holding bookings, holds, inventory and payments, which acts as the single source of truth for every decision.",
    d: "It needs strong guarantees on writes: atomic transactions, constraints that enforce uniqueness and non-overlap, and durable commits. Everything else, from search to reports, derives from it. It is partitioned by tenant or venue to scale, with replicas for reads. Schema changes must be done online. The challenge is hot spots: popular slots cause row contention, large tenants outgrow a partition, and heavy reporting queries must be kept away from the primary.",
    k: ["Single primary with replicas vs sharded by venue: a primary is simple with strong guarantees and a ceiling; sharding scales and makes cross-venue queries and bookings harder.", "Constraints in the database vs only in code: constraints are a last line of defense for every path; code-only rules are flexible and can be bypassed by one bug."],
    p: ["Analytics queries run on the primary during an on-sale and slow every booking.", "A migration locks a large table and the booking path is down for the duration."],
    v: "Run a peak load while performing a schema change and a heavy report on a replica. Booking latency should stay within target, and a constraint violation test from every path should be rejected by the store itself.",
    dep: ["transaction-boundaries", "backup-and-recovery"]
  },
  "transaction-boundaries": {
    s: "The decision of what must change together in one atomic unit, and what is allowed to follow later through events and retries.",
    d: "Inventory, the booking record and the outbox event must commit together. Payments, messages and channel updates live outside that boundary and are driven by events with retries and compensation. Keeping the boundary small limits lock time on hot rows, while keeping it complete prevents half-finished states. Isolation levels and lock order are chosen to avoid deadlocks. The challenge is multi-service flows with no shared transaction, where each step needs a defined undo.",
    k: ["Single local transaction vs distributed saga: local is simple and strict; sagas span services and need compensation logic and a visible pending state.", "Higher isolation vs explicit locks and constraints: higher isolation is easier to reason about and aborts under contention; explicit control is faster and easy to get wrong."],
    p: ["A transaction includes a slow external call and holds locks on a hot slot while waiting.", "A compensation step is missing, and a failed payment leaves inventory sold."],
    v: "Inject failures after each step of a multi-step booking in a test and verify that every run ends consistent: either complete, or fully compensated, with no leaked holds, charges or events.",
    dep: ["booking-store", "outbox-and-queues"]
  },
  "domain-event-log": {
    s: "The ordered record of facts such as held, confirmed, canceled and paid, which other components consume to stay in sync.",
    d: "Each change in the engine emits an event with a booking identifier, a version and the data needed downstream. Consumers update search indexes, send messages, push to channels, build reports and feed analytics. Ordering within one booking matters, and events are delivered at least once, so consumers dedupe. Events may also serve as the history for audit and rebuilding projections. The challenge is schema evolution and replay: old events must remain readable, and replays must not resend messages.",
    k: ["Events as the source of truth vs events as notifications of state: source-of-truth gives complete history and complexity; notifications keep the store authoritative and lose detail.", "One global stream vs per-booking or per-venue streams: global is simple and bottlenecks; partitioned scales and orders only within a partition."],
    p: ["A consumer replays old events and sends guests confirmations again.", "An event changes shape and a slow consumer cannot parse earlier versions."],
    v: "Replay the full log into an empty projection and compare it with the live one. Then replay it with messaging in dry-run mode and confirm no external messages are sent.",
    dep: ["outbox-and-queues", "booking-store"]
  },
  "outbox-and-queues": {
    s: "Writes events into the same transaction as the change, then publishes them reliably to queues, so no event is lost or sent for a rolled-back change.",
    d: "The booking and an outbox row commit together. A relay reads unsent rows and publishes them to a queue, marking them sent. Consumers process at least once and must be idempotent. Queues carry messages to notifications, channel pushes and projections, with retry policies, dead-letter handling and backpressure. The challenge is ordering, poison messages that fail forever, and lag during peaks, which can delay confirmations and channel updates enough to cause oversell elsewhere.",
    k: ["Outbox with a relay vs publish directly after commit: outbox never loses events and adds a hop; direct publish is fast and loses events on a crash between steps.", "Per-key ordered queues vs unordered with versions: ordered is simple for consumers and limits parallelism; versions allow parallelism and require consumers to ignore stale messages."],
    p: ["A poison message blocks a partition and every later booking event for that venue waits.", "The relay crashes after publishing and before marking sent, and consumers receive duplicates they cannot detect."],
    v: "Kill the relay and a consumer at random points under load, then restart. Every committed change should be published and applied exactly once by effect, and the dead-letter queue should hold only genuine failures.",
    dep: ["booking-store", "transaction-boundaries"]
  },
  "read-model-projections": {
    s: "Query-shaped copies of data built from events: availability views, manifests, search documents and report tables, separate from the transactional store.",
    d: "Projections subscribe to events and maintain structures for specific reads: remaining counts by day, today's arrivals, a guest's bookings, revenue by month. They are rebuildable from the log or store. They allow different storage engines and scale independently of booking writes. The challenge is lag and drift: a projection is slightly behind, a bug can corrupt it silently, and clients must know which operations may rely on it and which must go to the authority.",
    k: ["Rebuildable projections vs hand-maintained copies: rebuildable ones can be repaired at any time and cost reprocessing; hand-maintained copies are quick and cannot be verified.", "Update in the booking transaction vs asynchronously: in-transaction is always fresh and slows writes; asynchronous is fast and has a lag window."],
    p: ["A projection bug miscounts for weeks and staff decisions rely on its numbers.", "A rebuild takes hours and no one has tested whether it finishes within the maintenance window."],
    v: "Rebuild each projection from scratch in a test environment and diff against the live one. Measure the lag after bursts of changes and confirm it stays within the documented bound.",
    dep: ["domain-event-log", "booking-store"]
  },
  "caching-layer": {
    s: "In-memory storage for hot, derived or slow-to-compute data: search answers, catalog and rate data, sessions and counters, with expiry and invalidation.",
    d: "A cache sits between components and slower stores. Catalog and rate data change rarely and cache well; availability changes constantly and caches only briefly. Keys include tenant and version so stale values cannot leak across tenants. Invalidation comes from events or short expiry. The booking decision never reads from it. The challenge is knowing what is safe: caching the wrong thing causes oversell, and cache failure under peak can send all traffic to the store at once.",
    k: ["Cache-aside with expiry vs write-through: cache-aside is simple and may serve stale data for the lifetime; write-through is fresher and couples writers to the cache.", "Per-tenant keys vs shared keys with tenant fields: per-tenant isolates and fragments; shared saves space and risks leaking."],
    p: ["The booking step reads availability from the cache and sells a unit that is gone.", "A cache restart at peak sends every request to the database, which then falls over."],
    v: "Flush the cache under production-like load in a test and confirm the store holds up, then check that no code path used for confirmation reads a cached count, by tracing a booking request.",
    dep: ["booking-store", "domain-event-log"]
  },
  "backup-and-recovery": {
    s: "Copies of data and the rehearsed procedure to restore the system after loss or corruption, with defined recovery point and time targets.",
    d: "Continuous log shipping and periodic snapshots allow restoring to a chosen moment. A replica in another location covers a site failure. Recovery has to consider the outside world: after restoring, payments, partner channels and sent messages have moved on, and the system must be reconciled with them. Point-in-time restore also helps undo bad data changes. The challenge is practice: backups that are never restored are guesses, and a restore that loses the last minutes creates bookings guests hold and the system does not.",
    k: ["Synchronous replica vs asynchronous replica: synchronous loses no committed bookings and adds write latency; asynchronous is fast and can lose the last seconds on failover.", "Whole-system restore vs per-tenant restore: whole-system is simple and affects everyone; per-tenant is surgical and needs tooling that is rarely tested."],
    p: ["A restore succeeds technically, but bookings made since the backup exist only in partner and payment records.", "Backups include personal data that was deleted on request and returns after a restore."],
    v: "Restore a backup to a clean environment, run the reconciliation against payment and partner records, and report how many bookings were missing, with elapsed time against the recovery targets.",
    dep: ["booking-store", "channel-reconciliation"]
  },

  "scheduler-and-timers": {
    s: "Runs work at a future time reliably: expiring holds, sending reminders, charging balances, releasing blocks and generating reports.",
    d: "Jobs are stored with a due time and a unique key, and workers claim due jobs, run them and record the result. Time-based work must survive restarts, run exactly once by effect, and scale to many jobs at the same minute. Jobs are cancelable and reschedulable when the booking changes. Delays and retries use backoff. The challenge is bursts at round times, jobs that run late, and jobs whose reason has changed by the time they run, so each job re-checks state before acting.",
    k: ["Persistent job table vs in-memory timers: a table survives crashes and needs polling; in-memory timers are cheap and lost on restart.", "Per-booking jobs vs periodic sweeps: per-booking is precise and must be rescheduled on change; sweeps are robust and imprecise."],
    p: ["Thousands of reminders fall due at nine o'clock and the system sends them an hour late.", "A job runs twice after a worker crash and charges a balance twice."],
    v: "Schedule thousands of jobs for the same minute, kill workers mid-run and restart. All jobs must complete once by effect and within the lateness target, and a canceled booking's jobs must not act.",
    dep: ["booking-store", "time-source-and-clock-skew", "idempotent-booking-requests"]
  },
  "time-source-and-clock-skew": {
    s: "The single agreed source of time for holds, cutoffs and ordering, and the handling of clocks that disagree across servers and clients.",
    d: "Expiry and cutoffs depend on a clock. If servers disagree by seconds, one may expire a hold that another considers live. Decisions that matter, such as hold expiry and cancellation cutoffs, use the database or one time service. Clients see a countdown based on a server-provided deadline, not their own clock. Time zones are applied only for display and for venue-local rules. The challenge is leap seconds and daylight changes, and tests, which must control time.",
    k: ["Database time for decisions vs each server's clock: database time is consistent and adds a dependency; server clocks are free and drift.", "Server-supplied deadlines to clients vs client-side timers: server deadlines are authoritative and need correction for latency; client timers feel smooth and can be changed by users."],
    p: ["Two servers disagree by several seconds and the same hold is both valid and expired.", "A client sets its clock back and sees a countdown that never ends."],
    v: "Skew one server's clock by thirty seconds in a test and run holds and cutoffs through it. Decisions should match those of a correct clock, because they come from the single source.",
    dep: ["time-and-timezones"]
  },
  "audit-trail": {
    s: "A tamper-resistant record of who did what and when: bookings changed, rules overridden, refunds issued, data viewed, with before and after values.",
    d: "Every sensitive action writes an entry with actor, role, time, target, reason and the changed fields, stored separately from ordinary data and protected against edits. It answers questions from disputes, regulators and security reviews. Reads of sensitive data can be logged too. Retention balances proof and privacy. The challenge is completeness and noise: if some paths skip the trail it cannot be relied on, and if it logs everything nobody can find the relevant entry.",
    k: ["Append-only store with restricted access vs logs in the application database: separate and append-only resists tampering by insiders; the same database is easy and editable by anyone with access.", "Log every read vs only changes: reads catch snooping and generate volume; changes alone are cheap and miss data exposure."],
    p: ["A bulk import path bypasses the audit hooks and thousands of changes have no record.", "Entries contain full personal data and become a second copy that is never deleted."],
    v: "Perform each sensitive action through every path in a test, including bulk and support tools, and confirm one complete entry for each with actor, reason and before and after values, and no edit or delete is possible.",
    dep: ["roles-and-permissions", "booking-store"]
  },
  "observability-and-alerting": {
    s: "The metrics, logs and traces that show whether bookings are working: conversion, hold failures, latency, sync lag and money mismatches, with alerts.",
    d: "Business metrics sit beside technical ones: bookings per minute, hold-to-confirm rate, payment failures, expired holds, queue depth, channel push lag, projection lag and reconciliation differences. Traces follow one booking across services. Alerts fire on symptoms, such as conversion dropping, rather than only on machine health. The challenge is signal: a payment provider outage looks like many separate failures, and a silent drift in counts produces no error at all, so periodic checks are needed.",
    k: ["Alert on business symptoms vs on component health: symptoms catch real harm and need good baselines; component alerts are easy and often fire without impact.", "Trace every booking vs sample: full tracing explains any case and costs storage; sampling is cheap and may miss the rare failure."],
    p: ["Dashboards show healthy servers while channel feeds fall an hour behind and partners oversell.", "Logs contain full guest details and card references."],
    v: "Break each dependency in turn in a test, including a payment provider, a partner feed and a queue. Each failure should raise an alert naming the symptom within the target time and show a trace to the cause.",
    dep: ["domain-event-log", "outbox-and-queues"]
  },
  "rate-limiting-and-quotas": {
    s: "Caps on how often a client, partner or address may call the system, protecting inventory and capacity from floods and unfair use.",
    d: "Limits apply per address, account, partner key and endpoint, with tighter ones on costly or abusable calls such as holds and searches. Token buckets allow short bursts. Partners get contractual quotas and clear responses with retry hints. Limits can tighten automatically during a spike. The challenge is fairness and evasion: shared networks look like one user, attackers spread across many, and legitimate partners legitimately burst after a reconnect.",
    k: ["Per client key vs per address: keys are accurate for partners and easy to rotate for attackers; addresses catch anonymous abuse and punish shared networks.", "Reject over-limit calls vs queue them: rejecting protects the core immediately; queuing is friendly and grows latency and memory under pressure."],
    p: ["A retry loop on rejection amplifies the load it was meant to stop.", "A limit applies to staff devices behind one office address and blocks the front desk."],
    v: "Drive a test client above its quota with bursts and sustained load. It should receive the documented rejection with retry guidance, other clients should be unaffected, and normal traffic from the same network should pass.",
    dep: ["observability-and-alerting", "tenant-configuration"]
  },
  "tenant-configuration": {
    s: "Per-business settings that change behavior without code changes: rules, policies, branding, channels, features, limits and integrations.",
    d: "Configuration is stored and versioned by tenant and venue, validated on save, and read by every component, often through a cache. It covers policies, templates, payment settings, time zones and feature flags for gradual rollout. Changes are audited and can be rolled back. The challenge is safety: a bad value can stop all bookings for a business, changes must not alter bookings already made, and settings spread over many places become impossible to reason about.",
    k: ["Versioned, validated configuration vs free-form settings: versions and validation prevent damage and can be rolled back; free-form is quick and breaks silently.", "Per-tenant overrides on top of defaults vs full copies per tenant: overrides stay current with defaults; full copies are explicit and fall behind."],
    p: ["A configuration edit sets a restriction that blocks every date, discovered only when bookings stop.", "A flag is switched on for one tenant and a shared cache serves the change to others."],
    v: "Change a policy for one test tenant and verify new bookings use it, existing bookings keep their stored terms, other tenants are unaffected and a rollback restores the earlier behavior.",
    dep: ["booking-store", "audit-trail"]
  },
});
