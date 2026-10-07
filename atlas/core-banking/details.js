// Details for the core banking plate, part 1: channels, payments, cross-cutting concerns.
ATLAS.details("core-banking", {
  "api-gateway": {
    s: "The single entry point that authenticates callers, throttles traffic, validates requests and routes them to core services, shielding the core from channel load and misuse.",
    d: "Every channel and partner call passes through it. It terminates TLS, checks credentials and scopes, enforces rate limits and payload schemas, and attaches a correlation id that follows the request through posting and audit. It routes reads to replicas and writes to the transactional core. The difficulty is protecting a system of record from traffic it was never sized for: a retry storm from a mobile app or a partner bug can look exactly like legitimate load.",
    k: ["Central rate limiting per client versus limits inside each service: one place to tune and audit, but the gateway becomes a critical dependency whose outage blocks everything.", "Schema validation at the edge versus in the core: bad input is rejected cheaply, but rules are duplicated and can drift from the core's own checks."],
    p: ["Clients retry on timeout and the gateway forwards duplicates without an idempotency key, producing double payments.", "Limits tuned for average load throttle month-end salary runs and genuine peaks."],
    v: "Send one thousand requests per second from a single client and confirm excess calls receive explicit throttle responses while other clients' latency is unchanged and every accepted call carries a traceable correlation id in the audit trail.",
    dep: ["access-control", "channel-orchestration"]
  },
  "channel-orchestration": {
    s: "Coordinates multi-step customer journeys across several core services so that a request like opening an account or making a transfer completes or fails as a whole.",
    d: "A channel action often needs several calls: check the customer, create an account, set a mandate, post a fee. Orchestration sequences them, holds the journey state and decides what to do when a step fails, either compensating earlier steps or parking the case for staff. It also shapes core responses into what each channel needs. It is hard because the core's postings are atomic but the journey is not, so partial completion must be visible and recoverable.",
    k: ["Orchestrated sagas with compensation versus one large core transaction: services stay decoupled, but compensations must themselves be reliable and visible to audit.", "Journey state held in the orchestrator versus in the core: the core stays simple, but two sources of truth can disagree after a crash."],
    p: ["A journey that fails after posting but before confirming leaves the customer charged with no account opened.", "Compensating steps that assume the world has not changed reverse the wrong amounts."],
    v: "Kill the orchestrator mid-journey in a test environment, restart it, and confirm every in-flight journey either completes or is compensated, with no orphaned postings found by the reconciliation report.",
    dep: ["api-gateway", "posting-engine", "idempotency-dedup"]
  },
  "digital-banking-backend": {
    s: "Serves online and mobile banking: balances, history, transfers, beneficiaries and notifications, optimized for read volume far above the core's write rate.",
    d: "It sits between apps and the core, keeping a read-optimized view of balances and recent transactions fed by core events, so most screen loads never touch the transactional store. Writes such as transfers are validated and sent to the core with strong customer authentication evidence. It manages sessions, devices and limits. The challenge is freshness: a customer who just paid expects the balance to change immediately, while the read view may lag the ledger by seconds.",
    k: ["Event-fed read model versus querying the core: scales to millions of logins, but shows stale data unless the view is updated synchronously after the customer's own writes.", "Per-channel limits in the backend versus in the core: closer to the user experience, but a second channel bypasses them."],
    p: ["A cached balance shown after a payment lets customers submit a second payment the core must then reject.", "Limits enforced only in the app can be bypassed by calling the API directly."],
    v: "Make a transfer from the app and confirm the displayed balance and history update within the stated freshness target and match the core's available balance exactly when queried directly.",
    dep: ["api-gateway", "event-publication", "reporting-replicas", "available-balance"]
  },
  "branch-teller-services": {
    s: "The staff-facing front end for cash deposits, withdrawals, account servicing and overrides, with till balancing and supervisor approval built in.",
    d: "Tellers and relationship staff operate through screens that call the same posting and account services as digital channels, plus functions customers never get: cash handling, overrides, holds, signature verification and manual adjustments. Each teller has a till treated as a ledger account that must balance at close. Offline operation may be needed when links fail. It is difficult because staff privileges are the highest-risk access in the bank, so every override needs an approver and a trail.",
    k: ["Tills modeled as ledger accounts versus a separate cash-handling module: balancing is automatic and auditable, but cash movements share the posting load and calendar.", "Local queueing when the link is down versus refusing service: customers are served, but postings may later fail against balances that changed."],
    p: ["Shared teller credentials make cash discrepancies impossible to attribute.", "Offline postings replayed after reconnection overdraw accounts that were drained elsewhere."],
    v: "Run a teller shift of deposits and withdrawals and confirm the till's ledger balance equals counted cash at close, with every override showing both the requester and the approver in the audit trail.",
    dep: ["posting-engine", "maker-checker", "access-control", "holds-blocks-restrictions"]
  },
  "card-and-atm-interface": {
    s: "Connects the core to the card processor and ATM network so authorizations check real balances and settled card transactions post to accounts.",
    d: "Card authorizations arrive in real time and must be answered in a few hundred milliseconds with approve or decline, based on the available balance, limits and account status. An approval creates a hold, not a posting. Later clearing files from the scheme turn holds into final postings, sometimes with a different amount, currency or date. The challenge is that authorization, clearing and chargeback are separate events that must reconcile, and the core must answer even when degraded.",
    k: ["Core-side authorization versus stand-in limits at the processor: balances are always accurate, but a core outage stops all card use unless stand-in rules take over.", "Hold at authorization versus post at clearing only: customers see pending spend immediately, but orphaned holds must expire correctly."],
    p: ["Authorizations without matching clearing leave holds that reduce available balance for weeks.", "Stand-in approvals during an outage overdraw accounts beyond acceptable risk."],
    v: "Authorize a purchase, confirm the available balance drops and a hold exists, then process the clearing record for a different amount and confirm the hold releases and the posted amount matches the clearing file.",
    dep: ["available-balance", "holds-blocks-restrictions", "posting-engine", "batch-payment-files"]
  },
  "open-banking-apis": {
    s: "Standardized, consent-based APIs that let authorized third parties read account data and initiate payments on a customer's behalf.",
    d: "Regulation in many markets requires banks to expose accounts and payment initiation to licensed providers. The interface authenticates the provider, records the customer's consent with scope and expiry, and exposes only what that consent permits. Payments initiated this way flow into the normal payment engine. It is hard because consent is a first-class object with its own lifecycle, because availability and performance are measured by regulators, and because a third party's mistake still shows up on the bank's books.",
    k: ["Dedicated third-party APIs versus reusing internal channel APIs: cleaner consent and monitoring, but a second surface to build and keep equivalent to what customers get.", "Consent stored centrally versus per channel: one place to revoke access, but a dependency every data request must check."],
    p: ["Consents that never expire keep sharing data long after the customer forgot granting them.", "Provider traffic spikes degrade the core because the APIs bypass the read replicas."],
    v: "Grant a test provider read access to one account, confirm it sees only that account, revoke consent, and confirm the next call is refused immediately and the revocation is in the audit trail.",
    dep: ["api-gateway", "access-control", "reporting-replicas", "audit-trail"]
  },
  "event-publication": {
    s: "Publishes a durable stream of business events, such as postings and account changes, so downstream systems react without querying or modifying the core.",
    d: "After a transaction commits, an event describing it is written to an outbox in the same database transaction and relayed to the message bus in order. Consumers include notifications, fraud screening, the data mart and the digital read model. It is hard to get right: an event published before commit announces something that may roll back, one lost after commit leaves consumers permanently wrong, and consumers must tolerate duplicates and replays.",
    k: ["Transactional outbox versus publishing directly to the bus: no event is lost or invented, but adds a relay and some latency.", "Fine-grained events versus state-snapshot messages: fine events let consumers rebuild history, but force them to handle ordering and schema evolution."],
    p: ["Publishing inside the transaction before commit sends notifications for payments that then fail.", "A changed event schema breaks a downstream consumer nobody knew existed."],
    v: "Post one thousand transactions with a forced crash in the middle and confirm every committed posting has exactly one event delivered in account order, and no event exists for a rolled-back one.",
    dep: ["message-bus", "posting-engine", "transactional-store"]
  },
  "payment-intake": {
    s: "Accepts payment instructions from channels, files and schemes, normalizes them to one internal format and assigns the identifiers used to trace them end to end.",
    d: "Instructions arrive as API calls, uploaded files and scheme messages in many formats. Intake parses and normalizes them into a common payment object, records the original untouched, assigns an internal reference and the customer's reference, and persists before acknowledging. From then on a payment moves through states: received, validated, routed, settled or rejected. The challenge is traceability and idempotency: the same instruction can legitimately arrive twice through different paths and must be recognized.",
    k: ["One canonical internal format versus scheme-native handling: simpler routing and reporting, but fields unique to a scheme can be lost in translation.", "Persist-then-acknowledge versus acknowledge-then-process: no accepted payment can vanish, at the cost of a write on the critical path."],
    p: ["Normalization drops a remittance field that a regulation requires to be passed on intact.", "Duplicates from a file resubmitted by the customer are processed twice."],
    v: "Submit the same payment through the API and again inside a file, and confirm the second is flagged as a duplicate, while a payment's full original message can be retrieved by its internal reference.",
    dep: ["idempotency-dedup", "transactional-store", "api-gateway"]
  },
  "payment-validation-screening": {
    s: "Checks each payment for format errors, authority, limits, sanctions and fraud signals before money is committed to move.",
    d: "Validation covers structure, account existence, currency, cutoff and the sender's authority and limits. Screening compares names and countries against sanctions and watch lists, producing hits that a human must clear. Fraud scoring may hold unusual payments. The difficulty is the trade-off between speed and certainty: real-time schemes allow seconds, but ambiguous name matches need people, and a held payment must not block those behind it or be released twice.",
    k: ["Screening before posting versus after: nothing prohibited moves, but latency and false-positive queues grow on the critical path.", "Fuzzy matching with tunable thresholds versus exact match: catches transliterated names, but analysts face large volumes of near-misses."],
    p: ["List updates not applied to in-flight payments let a newly listed party's payment through.", "A blocked payment is released by a retry that bypasses the screening step."],
    v: "Submit a payment naming a test entity placed on the screening list and confirm it halts before posting, appears in the review queue, and releases only after a recorded approval.",
    dep: ["payment-intake", "maker-checker", "audit-trail"]
  },
  "payment-routing": {
    s: "Chooses the scheme, channel and timing for each outgoing payment by currency, amount, urgency, destination and cost, and handles internal transfers directly.",
    d: "Routing rules look at the destination bank, currency, value, customer instructions and cutoff times, then select among real-time, batch, high-value and cross-border paths, or an on-us transfer that never leaves the bank. Rules are configuration with fallbacks if a scheme is down. The challenge is that cutoffs, holidays and fees differ per scheme, and a payment sent late may settle a day later than the customer was told.",
    k: ["Rules-driven routing versus hard-coded paths per product: new schemes can be added without release, but misconfigured rules misroute money at scale.", "Cheapest route versus fastest route: lowers cost, but can break customer promises on delivery time."],
    p: ["A holiday calendar error sends payments to a closed scheme, which queues them for days.", "On-us detection fails on a changed bank identifier and costs a fee for a payment that should be internal."],
    v: "Send test payments to an internal account, a domestic bank and a foreign bank before and after cutoff, and confirm each takes the expected route and expected settlement date.",
    dep: ["business-calendar", "payment-validation-screening", "product-parameters"]
  },
  "clearing-settlement-interface": {
    s: "Exchanges payment messages and settlement positions with clearing houses and central settlement accounts, applying their rules for finality and timing.",
    d: "Outgoing payments are batched or streamed to the scheme in its format, and incoming ones arrive for posting. The bank's net position with the scheme settles through an account at a central institution at defined cycles. This component tracks each message's status, acknowledgments and timeouts, and posts settlement movements. It is hard because the scheme, not the bank, defines truth: a message accepted by the bank but rejected by the scheme must be unwound, sometimes after the customer was told it succeeded.",
    k: ["Direct scheme connection versus through a correspondent or aggregator: control and cost versus less operational burden and extra dependency.", "Post on acceptance versus post on settlement confirmation: customers get faster feedback, but the bank carries the risk of unwinds."],
    p: ["Unacknowledged messages are assumed lost and resent, creating duplicates at the scheme.", "A scheme outage is only noticed when customers complain."],
    v: "Send a test batch, withhold the scheme acknowledgment, and confirm the payments remain in a pending state with an alert; then acknowledge and confirm settlement postings match the scheme's position report to the cent.",
    dep: ["payment-routing", "settlement-account-reconciliation", "suspense-clearing-accounts"]
  },
  "real-time-payments": {
    s: "Handles instant payments that must be validated, posted and confirmed within seconds, around the clock, with finality and no daily batch window.",
    d: "An instant payment arrives, is validated and screened, checked against the available balance, posted and confirmed to the scheme, usually in under ten seconds. Because it runs at all hours, it cannot depend on the end-of-day window; the core must accept postings while batch work runs. Finality means a settled payment cannot be recalled by the system, only by a new payment. The hard part is meeting latency targets while maintaining strict ordering of balance updates and surviving partial failure mid-flow.",
    k: ["Reserve funds then confirm versus post directly: protects against double spend during the exchange, but adds states to manage and expire.", "Synchronous end-to-end processing versus queued processing: simple guarantees, but a slow dependency causes timeouts that look like failures."],
    p: ["A timeout after the scheme confirmed leaves the bank unsure whether the money left, and a blind retry pays twice.", "Maintenance windows designed for batch systems are no longer acceptable."],
    v: "Send one hundred concurrent instant payments from the same account with a balance covering only fifty, and confirm exactly fifty settle, the rest are declined, and every timeout is resolved to a definite state by status inquiry.",
    dep: ["available-balance", "idempotency-dedup", "posting-engine", "online-during-batch"]
  },
  "batch-payment-files": {
    s: "Processes bulk payment and collection files from corporate customers and schemes, validating, splitting and posting thousands of items with per-item results.",
    d: "A file with a header, items and control totals arrives, is checked as a whole and then item by item. Valid items are scheduled to the right value date and posted; invalid ones are rejected individually or the whole file is refused, depending on policy. Control totals must match. The challenge is scale and partial success: a file with ten thousand lines where three fail must produce a precise report, not reprocess or lose anything if the job restarts.",
    k: ["Reject the whole file on any error versus process the valid items: whole-file rejection is simpler to reason about, but one bad line delays every payroll payment.", "Posting at receipt versus at value date: funds are held early, but postings sit dated in the future and need their own control."],
    p: ["A restarted job reprocesses lines already posted because item status was not committed with the posting.", "Control totals are checked but not the duplicate file name, so a resent file pays again."],
    v: "Submit a file of one thousand items with five invalid lines and confirm exactly 995 post, five are reported with reasons, and replaying the same file is refused as a duplicate.",
    dep: ["batch-job-framework", "payment-intake", "idempotency-dedup", "checkpoint-restart"]
  },
  "standing-orders-direct-debits": {
    s: "Runs recurring instructions: scheduled transfers the customer set up, and collections that other parties pull from the account under a mandate.",
    d: "Standing orders are stored schedules executed on their due dates, with rules for holidays and insufficient funds. Direct debits are initiated by the collector and rely on a mandate the customer granted, which can be amended or revoked. Each execution passes through normal payment flow. The difficulty is correctness over time: rules for non-business days, retries, failed payments and customer rights to reclaim a debit all create states that must be tracked for years.",
    k: ["Execute on the due date versus the prior business day: avoids missed payments, but changes when money leaves the account.", "Retry insufficient-funds orders versus fail once: more payments succeed, but customers face unexpected fees and repeated attempts."],
    p: ["A revoked mandate is not checked at collection time, so a debit goes through anyway.", "Schedules created in one time zone fire on the wrong day for customers in another."],
    v: "Create a monthly order on the thirty-first and confirm it executes on the correct business day in a short month, and that a debit under a revoked mandate is rejected with the reason code.",
    dep: ["business-calendar", "mandates-signatories", "payment-intake", "returns-and-rejections"]
  },
  "returns-and-rejections": {
    s: "Handles payments that bounce back, are recalled or are disputed, reversing postings and sending reason codes to the right party.",
    d: "A payment can be returned by the receiving bank for a closed account or wrong details, recalled by the sender, or reversed after fraud. Each case follows scheme rules with time limits and reason codes. The component matches the return to the original payment, reverses the postings, returns funds and fees as policy requires and informs the customer. It is hard because the original may be days old, the account may since have changed, and money may already be spent.",
    k: ["Automatic return posting versus manual review: speed and low cost, but a bad return can overdraw an account or leave suspense items unresolved.", "Reverse in place versus new compensating posting: in-place breaks history, so compensating entries preserve audit but make statements longer."],
    p: ["Returns that fail to match their original sit in suspense indefinitely.", "Returned funds credited to a closed account vanish without a person noticing."],
    v: "Return a settled test payment and confirm the original is linked, funds go back to the sender with the reason code, and the ledger shows balanced compensating entries and no leftover suspense item.",
    dep: ["reversals-corrections", "suspense-clearing-accounts", "payment-intake"]
  },
  "settlement-account-reconciliation": {
    s: "Matches the bank's own records of its accounts at other institutions against their statements, line by line, and chases every difference.",
    d: "The bank keeps a ledger account mirroring each account it holds at a central bank or correspondent. Statements arrive in files or messages; the component matches entries by reference, amount and date and flags unmatched items on either side. Differences age into exceptions with owners and deadlines. It is difficult because matching is imperfect: references are truncated, amounts net, and timing differs, so matching rules need tuning and breaks need investigation.",
    k: ["Automatic rule-based matching versus manual matching: handles volume, but wrong rules can match unrelated items and hide real breaks.", "Daily reconciliation versus intraday: earlier detection of breaks, but needs continuous statements that not all counterparties provide."],
    p: ["Old unmatched items are written off in bulk without understanding their cause.", "Breaks accumulate because nobody owns the exception queue."],
    v: "Load a statement with three deliberate differences against the ledger and confirm exactly those three appear as aged exceptions with owners, and that the matched total equals the statement balance.",
    dep: ["reconciliation-engine", "suspense-clearing-accounts", "clearing-settlement-interface"]
  },
  "money-integrity": {
    s: "The rule that money is never created, destroyed or counted twice, enforced by atomic balanced postings, exact decimal arithmetic and exactly-once effects across every layer.",
    d: "Every movement is a set of debits and credits that sum to zero, committed atomically or not at all. Amounts are held in integer minor units or fixed decimals, never binary floating point, with explicit rounding rules and a place for rounding differences to land. Retries, timeouts and replays are made safe with idempotency keys. This concern is hard because failures happen between systems, where no single transaction spans the whole flow, so consistency has to be rebuilt by design and checked by reconciliation.",
    k: ["Strong consistency on the posting path versus eventual consistency everywhere: balances are trusted, but throughput and availability are limited by what must be serialized.", "Integer minor units versus decimal types: exact and fast, but currencies with different exponents need care at every boundary."],
    p: ["A rounding rule applied differently in two components leaves a persistent penny difference between ledger and statement.", "Floating point creeps in through a reporting tool and totals no longer tie."],
    v: "Sum all customer balances and all internal accounts from the ledger and confirm the total of debits equals credits exactly, with the difference zero to the smallest unit, after a day of live traffic including failures.",
    dep: ["posting-engine", "double-entry-journals", "idempotency-dedup", "reconciliation-engine"]
  },
  "time-and-value-dates": {
    s: "The set of rules about which date a transaction belongs to: business day, booking date, value date and calendar by currency and country, distinct from wall-clock time.",
    d: "A transaction has a timestamp of when it happened, a booking date for the day's accounts, and a value date from which interest runs. Calendars of holidays differ by country, currency and scheme. The system has its own business date that advances only at rollover. Interest, cutoffs, statements and reporting all key on these dates. It is hard because dates collide with each other: a payment arriving late Friday, value dated Monday, and backdated by a correction touches three different days' books.",
    k: ["One bank-wide business date versus per-entity dates: simple consistency, but multinational banks with several time zones cannot close at the same moment.", "Store UTC timestamps plus business date versus local time: unambiguous ordering, but all display and cutoff logic needs explicit conversion."],
    p: ["A cutoff evaluated in server time rather than the scheme's time rejects valid payments or accepts late ones.", "Daylight saving changes create a day with twenty-three or twenty-five hours that breaks interval arithmetic."],
    v: "Post transactions at 23:59 and 00:01 across the date boundary and a holiday, and confirm each lands on the correct booking and value date and that interest accrues from the expected day.",
    dep: ["business-calendar", "value-dating", "day-rollover"]
  },
  "immutability-and-correction": {
    s: "The principle that recorded history is never edited or deleted: mistakes are fixed by new, linked entries, so every past state can be reconstructed and audited.",
    d: "Postings and journal lines are append-only. A wrong entry is cancelled by a reversing entry and replaced by a correct one, both pointing at the original with a reason. Balances are derived from, or checked against, the log. Immutability is enforced in the data model, in database permissions and sometimes with cryptographic chaining. The tension is with operational reality: errors are routine, privacy law requires erasure, and statements already issued must stay true even when the books are later corrected.",
    k: ["Compensating entries versus in-place correction: full audit and reproducibility, but harder for staff to read and for reports to present net outcomes.", "Cryptographic chaining versus database controls alone: tampering is provable, but adds cost and complicates archival and partial erasure."],
    p: ["A support tool with direct database write access edits a balance, and no entry explains the change.", "Corrections posted into a closed period silently change figures already reported."],
    v: "Attempt to update and delete a posted entry as an administrator and confirm both are refused, then correct it via a reversal and confirm the original, the reversal and the replacement are linked.",
    dep: ["append-only-log", "reversals-corrections", "audit-trail"]
  },
  "parameterization": {
    s: "The decision to express products, fees, interest, limits and rules as configuration data rather than code, so the bank can change behavior without a software release.",
    d: "Product behavior lives in parameter sets with effective dates, validated against allowed ranges and versioned. The engine reads them at runtime. Banks can then launch a product or change a fee by configuration, with maker-checker approval. The limit is expressiveness: parameters handle variation within anticipated shapes, but new shapes need code. It is hard because configuration becomes a programming language without tests, and a wrong parameter acts across every account of a product at once.",
    k: ["Rich parameterization versus customer-specific code: fast product launches and one codebase, but the parameter model grows complex and hard to reason about.", "Effective-dated configuration versus immediate change: past behavior can be reproduced and future changes scheduled, but every lookup must pass a date."],
    p: ["A rate parameter typo applied to every account of a product posts wrong interest for a day.", "Configuration changed directly in production differs from the test environment and cannot be reproduced."],
    v: "Change a fee parameter with a future effective date through approval, and confirm transactions before that date use the old value, those after use the new, and the change appears in the audit trail with approver.",
    dep: ["product-parameters", "release-configuration-management", "maker-checker"]
  },
  "regulatory-change": {
    s: "The ongoing obligation to absorb new rules from supervisors, tax authorities and schemes, often with fixed deadlines, without destabilizing the system of record.",
    d: "Rules change constantly: report formats, payment scheme versions, identity requirements, interest disclosures and data residency. The core needs a way to take such changes on a dated basis, usually through configuration, versioned interfaces and an adaptable reporting layer. It is hard because deadlines are external and immovable, changes touch many components at once, and a missed one carries fines or loss of scheme access.",
    k: ["Regulatory logic in a dedicated, replaceable layer versus spread through components: change is localized, but data must be exposed in a form the layer can use.", "Early adoption versus last-minute: reduces risk of missing the date, but may require rework if guidance changes."],
    p: ["A scheme message version change is deployed in test but not production before the cutover date.", "Regulatory reports built on ad hoc queries break silently when a table changes."],
    v: "Run a scheme's published conformance test suite against the new message version before the mandatory date and confirm every case passes, with the cutover rehearsed and the old version still accepted during overlap.",
    dep: ["regulatory-returns", "release-configuration-management", "product-parameters"]
  },
  "resilience-and-recovery": {
    s: "The set of design choices that keep the core correct and available through hardware, software and site failures, defined by recovery time and recovery point objectives.",
    d: "Resilience combines redundancy within a site, replication across sites, tested failover, backups and the ability to replay logs to a known point. Targets are explicit: how much committed data may be lost and how long recovery may take. Correctness takes priority: failing over must never lose or duplicate a committed posting. It is difficult because failover is rarely exercised, partial failures are ambiguous, and dependencies such as payment schemes and message buses also need to recover consistently.",
    k: ["Synchronous replication versus asynchronous: no committed data lost on site failure, but every write pays inter-site latency.", "Automatic failover versus manual decision: faster recovery, but split-brain risk if the automation misjudges a network partition."],
    p: ["Disaster recovery that has never been tested fails when needed because of a missing credential or stale configuration.", "Failover completes but in-flight payments are in an unknown state with the scheme."],
    v: "Kill the primary site during a controlled test under load and confirm the secondary takes over within the recovery time target, with zero committed postings lost and reconciliation to the scheme showing no unknown payments.",
    dep: ["high-availability-failover", "disaster-recovery", "transactional-store", "checkpoint-restart"]
  },
});
