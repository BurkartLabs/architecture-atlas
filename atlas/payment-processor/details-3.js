// Details for the payment processor plate, part 3: ledger, settlement and payouts, reconciliation, network connectivity.
ATLAS.details("payment-processor", {
  "double-entry-ledger": {
    s: "The system of record that records every movement of value as balanced debits and credits across accounts, so money is never created or lost without a visible entry.",
    d: "Each business event, such as a captured payment, fee, refund or payout, becomes a transaction made of two or more entries whose debits equal credits per currency. Entries are appended, never updated. Balances are derived from them, so any number can be explained by the entries behind it. Writes are transactional and idempotent, and reads serve balances for payouts, limits and reports. It is hard because the ledger sits on the critical path of every payment, must scale to very high write rates, and has to stay correct even while everything around it fails.",
    k: ["A purpose-built ledger service vs entries in the payment tables: a dedicated service enforces balance and immutability for every caller; embedded entries are faster to build and drift by feature.", "Synchronous posting in the payment path vs asynchronous posting from events: synchronous keeps balances exact; asynchronous is faster and shows briefly stale balances."],
    p: ["Allowing updates or deletes to fix a mistake destroys the audit trail that makes the ledger trustworthy.", "A hot account, such as the platform fee account, becomes a lock bottleneck for all payments."],
    v: "Post ten thousand random test transactions concurrently and confirm that per currency the sum of all debits equals the sum of all credits, and that every account balance equals the sum of its own entries.",
    dep: ["account-model", "journal-entries", "ledger-invariants", "money-representation"]
  },
  "account-model": {
    s: "The set of ledger accounts, their types and hierarchy, covering merchant balances, customer funds, fees, reserves, network receivables and bank accounts.",
    d: "Accounts are typed (asset, liability, revenue, expense) and scoped by owner and currency. A merchant has several: available balance, pending balance, reserve, and sometimes per-currency balances. The processor has accounts mirroring each bank account and each network position, so that outside statements can be compared one to one. Structure is chosen so that one question, such as how much we owe merchants in total, is a single sum. It is hard because changing the model later means migrating history, and every shortcut here shows up as a reconciliation problem.",
    k: ["Many fine-grained accounts vs few coarse ones: fine accounts make reconciliation and explanations easy and increase rows and complexity; coarse accounts are cheap and hide where money is.", "Accounts per currency vs a single multi-currency account: per currency keeps amounts exact and simple; multi-currency reduces account count and blurs balances."],
    p: ["Combining merchant funds and processor revenue in one account makes safeguarding obligations unprovable.", "An account created ad hoc by a feature team with no owner or type ends up unreconciled for years."],
    v: "Pick any bank account balance from the day's statement and confirm there is one ledger account whose balance matches it, and that the sum of merchant liability accounts equals the sum of the funds held.",
    dep: ["double-entry-ledger", "funds-flow"]
  },
  "journal-entries": {
    s: "The immutable records of individual debits and credits, each linked to the business event that caused it and to a transaction that balances.",
    d: "An entry carries an account, an amount and direction, a currency, a timestamp, an idempotency reference and a pointer to the originating object, such as a payment or refund. Entries are written in transaction groups that must balance. Corrections are made with new entries that reverse and replace, with a reason, never by editing. Stored in append-only tables, often partitioned by time, they feed balances, reports and audits. It is hard because the volume is large, long retention is required by law, and each entry must keep meaning years later when the business has changed.",
    k: ["Append-only with reversing entries vs updating rows: append-only gives complete history and requires reversals for every fix; updates are easy and lose the record.", "Event time vs posting time as the accounting date: event time matches reality; posting time makes closed periods immutable."],
    p: ["An entry without a link to its source event cannot be explained to an auditor.", "Rewriting history by direct database edit during an incident breaks every downstream snapshot and report."],
    v: "Pick a random posted entry and trace it to its originating payment event, then pick a payment and confirm the set of its entries balances and its reversal, if any, exactly offsets it.",
    dep: ["double-entry-ledger"]
  },
  "balance-computation": {
    s: "Producing the current and historical balance of any account from its entries, quickly enough for payouts and dashboards, and exactly enough for audit.",
    d: "A balance is the sum of an account's entries. Summing millions on every read is too slow, so the system keeps running balances updated with each posting, plus periodic snapshots to compute any past date. Reads use the snapshot plus later entries. Different balances exist for the same account: available, pending, and as-of a date. It is hard because incremental balances can drift from entries after bugs or partial failures, so they need to be verified against full sums, and hot accounts need techniques to avoid contention on a single row.",
    k: ["Maintained running balances vs computing on demand: maintained balances are fast and need drift checks; on-demand sums are always right and slow at scale.", "Sharding hot accounts into sub-balances vs one row: sharding removes contention and complicates reads and limits; one row is simple and serializes writes."],
    p: ["A running balance updated in a separate transaction from its entry diverges after a crash between the two.", "Reading a balance and then deciding a payout in separate steps lets a concurrent debit make it overdrawn."],
    v: "Recompute every merchant's balance from raw entries and compare with the maintained balance, confirming zero differences, and run concurrent debits against one account to confirm the balance never goes below the allowed floor.",
    dep: ["journal-entries", "account-model", "pending-holds"]
  },
  "pending-holds": {
    s: "Balances that are known but not yet spendable, such as captured payments awaiting settlement or funds held for risk, with release dates and conditions.",
    d: "When a payment is captured the merchant is owed money, but the processor does not yet have it. The credit lands in a pending account and moves to available only when settlement completes or the hold period passes. Holds from reserve rules or reviews work the same way. Each hold has an amount, a reason and a release condition, and releases are scheduled postings. It is hard because merchants see a single number, the logic of what can be paid out must agree with the ledger exactly, and early release decisions are risk decisions.",
    k: ["Time-based release vs event-based release: time-based is predictable for merchants; event-based, such as on settlement receipt, is accurate and varies day to day.", "Showing pending and available separately vs one balance: separate balances are honest and confusing; one number is simple and wrong about what can be paid."],
    p: ["Releasing funds on a schedule without checking that settlement actually arrived makes the processor pay out its own money.", "Holds with no owner or expiry stay forever and the merchant never sees why."],
    v: "Capture a test payment, confirm it appears as pending with a release date, advance to settlement and confirm it moves to available exactly once, with matching ledger entries, and a payout can then include it.",
    dep: ["account-model", "journal-entries", "settlement-batching"]
  },
  "ledger-invariants": {
    s: "Automated checks that run continuously and assert properties that must always hold, such as balanced transactions, no negative customer funds and agreement with bank balances.",
    d: "Checks run on every write and in periodic sweeps. Write-time checks reject unbalanced transactions and mixed-currency postings. Sweeps compare maintained balances with entry sums, confirm that total liabilities do not exceed total assets in funds accounts, and that every payment in a terminal state has matching entries. Failures page an engineer, and some stop payouts until understood. It is hard to choose invariants that are strict enough to catch real errors and not so strict they cause false alarms that people learn to ignore.",
    k: ["Blocking writes on invariant failure vs alerting only: blocking prevents compounding damage and risks a payment outage; alerting keeps flow and lets errors spread.", "Checking every transaction vs sampling: full checks catch all issues and cost compute; sampling is cheap and may miss rare errors."],
    p: ["An invariant that has been failing quietly for months is no longer an invariant, it is noise.", "Checks that run only on the primary database miss errors introduced by replication or export."],
    v: "Inject a deliberately unbalanced transaction in a test environment and confirm it is rejected at write time, and corrupt a running balance and confirm the next sweep alerts with the account identified.",
    dep: ["double-entry-ledger", "balance-computation"]
  },
  "reserve-accounts": {
    s: "Ledger accounts that hold back part of a merchant's funds as security against disputes, refunds and other liabilities, with defined release rules.",
    d: "Funds in a reserve account belong to the merchant but cannot be paid out. Reserves can be a rolling percentage of volume released after a delay, a fixed amount, or a one-off hold placed when risk rises. Postings move value between available balance and reserve, and releases are scheduled. The processor can draw on the reserve to cover negative balances. It is hard because merchants dislike them, rules are set in contracts that differ per merchant, and every draw or release must be traceable to a reason.",
    k: ["Reserve held in the ledger only vs in a separate bank account: ledger-only is flexible and still depends on the processor's solvency; a separate account protects funds and costs operational effort.", "Automatic release on schedule vs on review: schedule is predictable; review catches late risk and delays merchants."],
    p: ["A reserve policy encoded in code instead of contract data cannot be audited against what the merchant agreed.", "Reserve draws made without notifying the merchant lead to disputes about missing money."],
    v: "Apply a rolling reserve in test, process a month of payments, and confirm the amounts held, the release postings after the delay and the merchant-visible statement agree with the contract terms to the cent.",
    dep: ["account-model", "pending-holds", "merchant-risk"]
  },
  "posting-rules": {
    s: "The mapping from business events, such as capture, refund, fee, dispute or payout, to the exact set of ledger entries each one creates.",
    d: "Each event type has a rule that specifies which accounts to debit and credit, how to split principal, fee and tax, and which dates apply. Rules are versioned and keyed to the event version, and posting is idempotent per event, so replaying events never duplicates entries. Having one place for these rules lets finance review them and lets the same rules rebuild the ledger from events. It is hard because there are hundreds of combinations of method, currency, fee model and merchant type, and mistakes are repeated at volume.",
    k: ["Declarative rules reviewed by finance vs posting code in each service: declarative rules are auditable and need a rule language; code is flexible and scatters accounting logic.", "Posting from events after the fact vs inline in the request: events decouple and delay; inline is exact and slows the payment path."],
    p: ["A new payment method launched without posting rules produces payments that succeed and appear nowhere in the books.", "Changing a rule without versioning retroactively changes how past events would be posted on replay."],
    v: "Replay a day of recorded events into an empty ledger and confirm the resulting balances equal the production balances, and replay the same events twice to confirm no entries are duplicated.",
    dep: ["double-entry-ledger", "event-log", "fee-engine"]
  },
  "clearing-files": {
    s: "The files and messages through which merchants' captured transactions are submitted to networks for payment and through which networks send back what they will settle.",
    d: "After capture, transactions are batched into a clearing file in the network's format and sent to the acquirer at set times. The network responds with acknowledgments, rejects for invalid items, and later with settlement reports stating amounts due after fees. Each item must be tracked from submission to acknowledged to settled. It is hard because formats are dense and version-specific, rejects are partial, and a missed file or a duplicate submission has direct money consequences that appear only days later.",
    k: ["Submitting once a day in bulk vs continuously in small batches: bulk is simple and delays money; small batches speed settlement and multiply files to track.", "Treating a file as accepted when sent vs when acknowledged: acknowledgment is accurate and delays state; sent-only assumes success that rejects will contradict."],
    p: ["Resubmitting a file after a timeout, without checking whether the first was received, pays merchants twice.", "Rejected items with no owner never get fixed and merchants are never paid for them."],
    v: "Submit a test batch with one invalid item, and confirm the acknowledgment marks that item rejected, the others settle, and the rejected transaction appears in an exception queue with the reason.",
    dep: ["capture", "card-message-codec", "acquirer-connectors", "exception-queue"]
  },
  "settlement-batching": {
    s: "Grouping captured and cleared transactions into settlement units per network, currency and date, and computing the net amount the processor will receive.",
    d: "Funds flow to the processor in net amounts per settlement date, after interchange, fees, refunds and disputes are deducted. The system groups transactions into batches that mirror each network's settlement report so totals can be compared exactly. Each batch moves through expected, reported and received, with the ledger moving value from receivable to cash. It is hard because batch boundaries are set by the network's cutoffs and time zones, and a transaction on the wrong side of a cutoff appears in the wrong day's total.",
    k: ["Batch boundaries by network cutoff vs by processor's own day: matching the network reconciles exactly; the processor's day is simple and always off by the edge cases.", "Netting refunds and disputes in the batch vs settling them separately: netting reduces transfers; separate lines are clearer for merchants and reports."],
    p: ["Using the local calendar day for batches that the network defines in another time zone leaves a permanent one-day offset.", "A batch missing a late-arriving item cannot be amended without a manual adjustment."],
    v: "Compare a test batch's computed total against the network's settlement report and the bank statement credit for that date, and confirm all three agree to the cent with every transaction accounted for.",
    dep: ["clearing-files", "double-entry-ledger", "cutoff-calendars"]
  },
  "payout-scheduling": {
    s: "Deciding when and how much to pay each merchant, based on their schedule, available balance, holds, minimums and the destination account.",
    d: "Merchants choose daily, weekly, monthly or manual payouts, with a delay such as two business days after capture. At the scheduled time the system computes the available balance, excludes held funds, applies minimums, and creates a payout instruction for the bank rail. The ledger debits the merchant's balance when the payout is created, not when the bank confirms. It is hard because the amount must equal the exact sum of included transactions, the schedule depends on bank calendars, and concurrent refunds or disputes can change the balance at any moment.",
    k: ["Creating the payout in a single transaction with the ledger debit vs afterward: one transaction cannot lose or duplicate money; afterward is simpler and can pay twice.", "Fixed delay after capture vs risk-based delay: fixed is predictable for merchants; risk-based reduces loss and surprises them."],
    p: ["A payout computed from a balance read earlier than a refund pays out money that no longer exists.", "A destination account change followed by an immediate payout sends funds to an attacker's account."],
    v: "Schedule a test payout while a refund is in flight and confirm the payout amount accounts for it, that the ledger debit and payout record are created together, and that changing the bank account delays the next payout.",
    dep: ["balance-computation", "pending-holds", "cutoff-calendars", "payout-rails"]
  },
  "payout-rails": {
    s: "The bank payment systems used to send money to merchants, such as batch credit transfers, same-day and instant rails, and card payouts.",
    d: "Each rail has its own message format, cutoffs, limits, fees and finality. Batch transfers are cheap and take a day or more; instant rails settle in seconds and have low limits and always-on availability; card payouts push to a debit card. The system chooses a rail per payout, builds the instruction, submits it through a sponsor bank, and tracks status. It is hard because status feedback is asynchronous and sometimes only arrives as a file next day, and because different rails have different return and recall rules.",
    k: ["One preferred rail vs routing by amount and urgency: one rail is simple and operationally uniform; routing optimizes cost and speed and multiplies tests.", "Using the processor's own bank accounts vs a sponsor bank: own accounts are cheaper and require licenses and operations; a sponsor is quicker to start and sets rules."],
    p: ["Treating submission as success when the rail reports failure the next day leaves merchants believing they were paid.", "Sending an instant payout above the rail's limit fails after the ledger debit was already posted."],
    v: "Send test payouts across each rail and confirm each produces a correctly formatted instruction, a status update that moves the payout to paid, and a bank statement line matching the amount and reference.",
    dep: ["payout-scheduling", "funds-flow", "cutoff-calendars"]
  },
  "payout-failures": {
    s: "Detecting and handling payouts that bounce, are returned or are rejected, restoring merchant balances and getting the money to the right place.",
    d: "A payout may be rejected on submission for bad account details, or returned days later because the account is closed or the name does not match. The system receives the return, matches it to the payout, reverses the debit to the merchant's balance, notifies the merchant and holds further payouts until they update details. Returned money must be tracked as a liability to the merchant until paid. It is hard because returns arrive late, in files, with terse codes, and a merchant with a pattern of failures may signal fraud.",
    k: ["Automatically retrying failed payouts vs holding for merchant action: retrying fixes transient errors and repeats permanent ones; holding is safe and delays money.", "Crediting the merchant balance on return vs holding returned funds aside: crediting is simple; holding protects against sending to a compromised account again."],
    p: ["A return not matched to its payout leaves funds sitting in a suspense account while the merchant waits.", "Retrying a payout to an account that was closed repeatedly incurs bank fees each time."],
    v: "Simulate a return code for a test payout, and confirm the payout shows returned with the reason, the merchant's balance is restored by an offsetting entry, and the next payout is held until the account is confirmed.",
    dep: ["payout-rails", "double-entry-ledger", "exception-queue"]
  },
  "negative-balances": {
    s: "Recovering money when a merchant's balance goes below zero, after refunds, disputes or fees exceed what they hold, through debits, reserves or collection.",
    d: "A merchant who has paid out their funds can still owe money when disputes arrive. The system detects the negative balance, notifies the merchant, offsets future incoming payments, and may debit their bank account if the agreement allows. If recovery fails, the loss is written off from a provision. It is hard because recovery relies on the contract, because bank debits are returnable, and because merchants may stop trading, leaving the processor bearing the loss.",
    k: ["Automatic offset against future sales vs requiring top-up: offset recovers without friction and fails when sales stop; top-up demands action and may never come.", "Pulling funds from the merchant's bank vs only offsetting: pulling recovers more and risks returns; offsetting is safe and slower."],
    p: ["A merchant with a negative balance who keeps processing builds a bigger hole before anyone acts.", "Writing off a loss without a ledger record of the recovery attempts leaves nothing to show an auditor."],
    v: "Drive a test merchant negative with a dispute after payout, and confirm notification, offset against the next payment, and a ledger trail from detection to full recovery or write-off with the reason.",
    dep: ["double-entry-ledger", "dispute-liability", "merchant-risk"]
  },
  "funds-flow": {
    s: "The map of which bank accounts hold which funds at each stage, and the rules, such as segregation and safeguarding, that keep customer money separate from the processor's own.",
    d: "Money travels from issuer to network to acquiring bank, into the processor's settlement account, then out to merchant payout accounts, with fees moved to operating accounts. Regulations often require customer funds to sit in segregated accounts and be reported separately. Each bank account has a ledger counterpart, and daily movement between them is planned and checked. It is hard because the funds flow is the processor's real business model, mistakes can mean unlicensed handling of funds, and every change requires bank and regulator coordination.",
    k: ["Segregated safeguarding accounts vs pooled accounts with ledger-level separation: segregation is clear to regulators and costs operational complexity; pooling is simple and requires heavy controls.", "Same-day sweeps of fees to operating accounts vs periodic: same-day limits commingling risk; periodic is simpler and holds mixed funds longer."],
    p: ["Fees swept before disputes and refunds are resolved leave customer funds short in the safeguarding account.", "A new bank account added without a matching ledger account cannot be reconciled."],
    v: "Trace one payment from capture to payout across every bank account it touches, confirming each hop has a statement line and a ledger posting, and that safeguarded funds always cover merchant liabilities at day end.",
    dep: ["account-model", "settlement-batching"]
  },
  "cutoff-calendars": {
    s: "The calendars and cutoff times of every network, bank and rail, deciding when files must be sent and when money will arrive.",
    d: "Each rail has business days, holidays per country, cutoff times in its own time zone, and settlement lags. The system holds these as data, computes expected arrival dates for payouts and settlements, and schedules submissions before cutoffs. Calendars change yearly and sometimes at short notice. It is hard because there are dozens of calendars, cutoffs interact with time zone changes, and a payout missed by a minute arrives a day, or a weekend, later.",
    k: ["Calendars as maintained data vs hard-coded rules: data can be updated without a release; hard-coded rules are simple and go stale after the first holiday change.", "Submitting early with buffer vs at the last minute: early is safe and delays; last-minute pays faster and risks missing the cutoff."],
    p: ["Daylight saving shifts a cutoff by an hour in one region and every payout for that rail misses the window.", "A holiday missing from the calendar causes payouts to be submitted when no one will process them."],
    v: "Compute expected arrival dates for payouts around a country's public holiday and a clock change, and compare against the rail's published calendar, confirming every date and cutoff matches.",
    dep: []
  },
  "statement-ingestion": {
    s: "Importing the bank's account statements and transaction files into a normalized form that can be compared with the ledger.",
    d: "Banks deliver statements as files in several standard formats, via secure transfer or API, at different times of day. The system parses each, normalizes dates, amounts and references, deduplicates repeated files, and stores the raw file with a checksum alongside the parsed lines. It verifies that opening balance plus lines equals closing balance. It is hard because formats vary by bank, reference fields are free text, files are sometimes resent with corrections, and a missing file must be noticed, not assumed empty.",
    k: ["Keeping raw files forever vs only parsed lines: raw files let any parse bug be corrected later and cost storage; parsed lines are compact and irreversible.", "Strict parsing that rejects malformed lines vs lenient parsing: strict catches problems early and blocks reconciliation; lenient keeps flowing and risks wrong data."],
    p: ["Treating a missing statement as a quiet day hides a bank outage until balances disagree.", "Normalizing amounts with a locale-dependent parser turns a thousand separator into a decimal point."],
    v: "Ingest the same statement twice and confirm no duplicate lines, confirm opening plus lines equals closing for each file, and withhold one expected file to confirm an alert fires.",
    dep: ["data-retention", "async-queues"]
  },
  "scheme-report-ingestion": {
    s: "Importing network settlement, fee and dispute reports into the system so network claims can be compared with the processor's own records.",
    d: "Networks and acquirers publish daily reports listing settled transactions, fees charged, chargebacks, adjustments and exchange rates. The system parses them into normalized records, links each to the original transaction, and checks totals against the bank credit. Fees on the report are compared with those the fee engine predicted. It is hard because report formats are large and dense, change with network releases, and carry fields with network-specific meaning, and because the report is the authority on what the network says it owes.",
    k: ["Matching on network reference vs on amount and date: references are precise when present; amount and date work in their absence and match wrongly.", "Treating the report as the truth vs the processor's records: the report is what the money follows; records show what the merchant was told."],
    p: ["A format change in a network release causes a parser to read a field as another, producing wrong fees for weeks.", "Ignoring adjustment lines because they are rare lets unexplained debits accumulate."],
    v: "Ingest a day's network report in test and confirm each settled item links to a transaction, the report's fee total equals the fee engine's prediction within tolerance, and every unlinked line appears as an exception.",
    dep: ["clearing-files", "fee-engine", "async-queues"]
  },
  "matching-engine": {
    s: "The component that pairs ledger entries with bank, network and processor records using references, amounts and dates, and classifies the result as matched or not.",
    d: "Matching runs in passes: exact on unique reference, then by amount and date within tolerance, then one-to-many and many-to-one groups, such as a bank credit that covers a whole settlement batch. Each match records the rule used and confidence. Unmatched items are carried forward. It runs continuously and reprocesses when late data arrives. It is hard because ambiguous matches have to be resolved safely, one-to-many sets need subset-sum logic, and a wrong match hides a real discrepancy.",
    k: ["Strict rules only vs probabilistic matching: strict rules leave more for humans and are never wrong; probabilistic matching clears more automatically and can hide errors.", "Matching in real time vs in daily batches: real time finds problems sooner and needs partial data handling; batches are simpler and slower to react."],
    p: ["Matching by amount alone pairs two unrelated items of the same value and hides both discrepancies.", "No record of which rule made a match makes it impossible to review automatic decisions later."],
    v: "Feed a test set with known matches, mismatches, duplicates and a batch credit, and confirm the engine pairs each correctly, reports the rule used, and leaves the planted errors unmatched.",
    dep: ["statement-ingestion", "scheme-report-ingestion", "journal-entries"]
  },
  "exception-queue": {
    s: "The list of unmatched or disputed items awaiting investigation, with owners, categories and deadlines, so every discrepancy is tracked to resolution.",
    d: "Each unmatched item becomes a break with an amount, age, suspected cause and owner. Common causes are timing differences, missing references, duplicates, fee differences and bank errors. Analysts resolve by correcting a record, posting an adjustment or contacting a bank or network. Resolution creates ledger entries with a reason and closes the break. It is hard because volume must stay manageable through automation of common causes, because each break needs context from several systems, and because resolution is a money movement requiring controls.",
    k: ["Auto-resolving known patterns vs manual review of all: automation keeps volume low and risks hiding a new failure inside a known pattern; manual is thorough and does not scale.", "Breaks owned by team vs by individual: team ownership is flexible and diffuses responsibility; individual ownership is clear and creates bottlenecks."],
    p: ["A queue with no aging view lets old items rot until an audit finds them.", "Adjustments posted without approval turn the exception process into a way to move money unreviewed."],
    v: "Create planted discrepancies of each type, and confirm each appears with the right category and owner, that resolving one posts a balanced adjustment with a reason, and that aged items appear on the aging report.",
    dep: ["matching-engine", "journal-entries", "access-audit"]
  },
  "break-aging": {
    s: "Tracking how long each discrepancy has been open, escalating the old ones, and writing off the unrecoverable ones under defined approval.",
    d: "Breaks are bucketed by age: days, weeks, months. Policies define when an item escalates to a manager, when it must be reported to finance, and when it can be written off, along with who may approve at each size. A write-off posts a loss entry to an expense account. Aging reports are reviewed at month end. It is hard because old breaks are the hard ones, with missing evidence and counterparties unwilling to respond, and because write-offs are a financial and regulatory event.",
    k: ["Time-based automatic escalation vs judgment-based: automatic escalation guarantees attention; judgment avoids noise and lets things slip.", "Small-amount automatic write-off thresholds vs approving every one: thresholds save effort and permit slow leakage; approving all is safe and costly."],
    p: ["Write-offs done in bulk at year end hide patterns that would reveal a systematic bug.", "No cap on the cumulative amount written off lets a fraud hide in many small items."],
    v: "Age a set of test breaks past each threshold and confirm escalations fire on time, that a write-off above a limit needs a second approver, and that totals on the aging report match the open breaks.",
    dep: ["exception-queue", "double-entry-ledger"]
  },
  "finance-reports": {
    s: "The statements and reports that tell finance and auditors what the processor owes, holds and earns, and prove the books agree with the banks.",
    d: "Reports include daily funds position, settlement receivables by network, merchant liabilities, fee revenue, reserve balances and unreconciled items. They derive from the ledger, and each ties to bank balances and network reports. Month-end close freezes a period and produces a package for accounting. It is hard because definitions must match between systems, because reports run on large data and must be reproducible as of a date, and because the numbers feed regulators and auditors who ask to see how each was built.",
    k: ["Reports computed from the ledger directly vs from a warehouse copy: direct reports are exact and load the ledger; a warehouse is flexible and may lag or drift.", "Closing periods hard vs allowing backdated postings: hard closes make reports final and require adjustment entries later; open periods are flexible and unstable."],
    p: ["A report built on different definitions than the ledger gives finance a number that never reconciles.", "Reports without a stored as-of snapshot cannot be reproduced for an auditor months later."],
    v: "Generate the funds position report for a closed date, then regenerate it a week later and confirm identical figures, and tie its totals to the bank balances and the sum of merchant liabilities.",
    dep: ["balance-computation", "journal-entries", "funds-flow"]
  },
  "message-gateway": {
    s: "The service that sits between the payment core and the networks, sending and receiving real-time messages and keeping track of each outstanding request.",
    d: "It takes an internal authorization request, builds the message for the chosen network or acquirer, sends it on an open connection, and waits for the matching response, correlating on identifiers in the message. It enforces timeouts, produces reversals when responses are late, and passes the result back. It holds hundreds or thousands of in-flight requests per connection. It is hard because the networks require strict timing, the gateway must be correct under partial failure, and its behavior on timeout decides whether customers are double-charged or left holding funds.",
    k: ["Stateful gateway tracking each in-flight request vs stateless relay: stateful handles timeouts and late responses correctly; stateless scales simply and loses the context for reversals.", "One shared gateway vs one per network: shared reduces components; per network isolates faults and lets each follow its own release cycle."],
    p: ["A late response arriving after the timeout path already reversed the transaction is applied as a fresh approval.", "Losing in-flight state on restart leaves requests whose outcome nobody knows."],
    v: "Kill the gateway while fifty requests are in flight and confirm after restart each one is resolved by response or reversal, none is lost, and the payment records show exactly one outcome each.",
    dep: ["card-message-codec", "network-links", "response-codes"]
  },
  "card-message-codec": {
    s: "Encoding and decoding the compact binary and bitmap-based messages the card networks use, mapping internal fields to the numbered data elements of each message type.",
    d: "Network messages follow a standard of numbered fields, indicated by a bitmap, each with a type and a length, fixed or variable, and with network-specific extensions in sub-fields. The codec converts between these and the internal model, validates mandatory fields for each message type, and handles character encodings and padding. Message types include authorization, reversal, clearing and network management. It is hard because every network and acquirer interprets the standard differently, and a single misplaced byte yields an unreadable or wrongly interpreted request.",
    k: ["A table-driven codec from message specifications vs hand-written per network: tables are consistent and easy to update; hand-written code handles quirks and rots.", "Strict validation before sending vs trusting the model: strict catches bugs locally; trusting is faster and shows errors as network rejects."],
    p: ["A field length error shifts every later field, so the network reads an amount as a date.", "Logging raw messages for debugging records full card numbers and keys in plain text."],
    v: "Encode a set of golden test messages for each network and compare byte-for-byte against certified samples, then decode them back and confirm every field equals the original, including edge cases like maximum lengths.",
    dep: ["bin-tables"]
  },
  "network-links": {
    s: "Managing the persistent connections to networks and acquirers: establishing sessions, sending keep-alives, detecting failure and signing on and off.",
    d: "Real-time connections are long-lived. A link signs on with a network management message, exchanges keys, then sends echo messages to prove it is alive. On failure it reconnects with backoff and signs on again. Multiple links per network provide redundancy and spread load by address and region. Link state is exposed to routing. It is hard because failures are partial, such as an open connection where the far end no longer answers, and because link policy has contractual rules about failover and message order.",
    k: ["Active-active links across sites vs primary with standby: active-active uses capacity and survives a site loss smoothly; standby is simpler and fails over slowly.", "Aggressive keep-alive timeouts vs relaxed: aggressive detects failure quickly and can flap on a slow second; relaxed is stable and slow to notice."],
    p: ["A half-open connection looks healthy while every request times out, until echo timeouts are enforced.", "Both ends believing they are signed on after a flap leads to messages silently dropped."],
    v: "Sever a link in a test network and confirm it is detected within the keep-alive bound, traffic shifts to the other link, in-flight requests resolve, and the link re-signs on automatically when restored.",
    dep: ["message-gateway", "encryption-in-transit"]
  },
  "response-codes": {
    s: "Translating the hundreds of response codes issuers and networks return into a small, stable set of outcomes and reasons that the rest of the system and merchants can act on.",
    d: "Each network defines codes for approvals, declines, referrals and errors, and issuers use them inconsistently. A mapping table normalizes them into categories such as approved, soft decline, hard decline, authentication required, invalid data and system error, with a retry policy per category. Merchants see a safe, standardized message, because detailed reasons can help fraudsters test cards. It is hard because the same code means different things from different issuers, new codes appear, and the mapping drives retries and customer messages.",
    k: ["Detailed reasons shown to merchants vs generic ones: detailed reasons help legitimate debugging; generic reasons deny attackers information about why a card failed.", "A central mapping vs per-acquirer mappings: central is consistent and generalizes; per-acquirer reflects local use of codes and is hard to maintain."],
    p: ["Unknown codes defaulting to approved or to retry-forever have costly consequences either way.", "Showing the issuer's exact reason, such as stolen card, to the customer tips off a fraudster."],
    v: "Run every code in the mapping table through the gateway simulator and confirm each produces the intended category, retry action and merchant-facing message, and that an unmapped code is treated as a safe decline and logged.",
    dep: []
  },
  "stand-in": {
    s: "Processing authorizations on behalf of an issuer or acquirer when the normal path is unavailable, using pre-agreed limits, so payments continue during outages.",
    d: "When an issuer is unreachable, the network can approve or decline based on stand-in rules and risk limits the issuer supplied. On the acquiring side, a processor may approve small offline transactions at a terminal, or hold a store-and-forward queue for later submission. Parameters, such as maximum amount and cumulative limit per card, are agreed in advance. It is hard because stand-in approves without real funds checks, shifting risk to whoever carries the liability, and queued transactions must be forwarded exactly once when service returns.",
    k: ["Approving small amounts in stand-in vs declining everything: approving preserves commerce during outages and accepts some losses; declining is safe and stops all payments.", "Store-and-forward with limits vs requiring online authorization: forwarding keeps tills moving; online is safe and fails when the link does."],
    p: ["Replaying a store-and-forward queue after an outage without deduplicating charges customers twice.", "Stand-in limits set generously for a rare outage become the preferred route for fraudsters who trigger it."],
    v: "Take the simulated issuer offline and confirm small transactions are approved within the stand-in limits, larger ones are declined, and after recovery each queued transaction is forwarded once and reconciled.",
    dep: ["message-gateway", "failover-routing", "degraded-modes"]
  },
  "acquirer-connectors": {
    s: "Adapters that connect to each acquiring bank or upstream processor, hiding their differing interfaces, formats and rules behind one internal contract.",
    d: "Each connector translates the internal request into that partner's protocol, whether network messages, a web API or files, and maps responses and errors back. It handles the partner's authentication, rate limits, test environment and reporting formats. A processor often has several for redundancy, price and coverage of regions and currencies. It is hard because partners behave differently in edge cases, change without much notice, and each connector multiplies the testing for every feature.",
    k: ["Adapters to a common internal model vs exposing partner features directly: adapters keep the core clean and lose partner-specific capabilities; direct exposure is powerful and leaks complexity upward.", "Direct network connections vs via an upstream processor: direct is cheaper per transaction and costly to certify; upstream is quick to start and adds margin and dependency."],
    p: ["A partner's undocumented change in a response format breaks one connector's parsing without breaking its tests.", "Connector logic that special-cases a partner inside the core makes the abstraction fail over time."],
    v: "Run the same suite of test transactions through every connector against its test environment and confirm identical internal outcomes, and fault-inject malformed partner responses to confirm they become clean errors.",
    dep: ["message-gateway", "card-message-codec", "certification"]
  },
  "network-tokens": {
    s: "Tokens issued by card networks that stand in for card numbers, kept up to date by the network and usable only in approved ways.",
    d: "A network token is provisioned for a card and merchant by a token service run by the network. Each payment includes the token and a cryptogram proving authorized use, which the network translates back to the real number for the issuer. When the card is reissued the token is updated automatically. Approval rates are typically higher and fraud lower. It is hard because provisioning requires issuer and network support, tokens differ per network, and the processor must keep its own token and the network token linked and in sync.",
    k: ["Network tokens vs processor-only tokens: network tokens improve approval and survive reissue; processor tokens are universal and give none of the network benefits.", "Requesting a cryptogram per transaction vs reusing: per transaction is the secure standard and costs a call; reuse is faster and rejected by networks."],
    p: ["Treating a network token like a card number and sending it without a cryptogram gets the payment declined.", "Failing to delete the network token when a customer removes a card leaves a usable credential behind."],
    v: "Provision a token for a test card, make a payment with a fresh cryptogram, simulate card reissue, and confirm the next payment still works and the processor's record updates without customer action.",
    dep: ["tokenization", "message-gateway", "key-management"]
  },
  "account-updater": {
    s: "A network service that refreshes stored card details when issuers replace or reissue cards, so recurring payments continue after expiry or loss.",
    d: "The processor sends batches of stored cards, or participates automatically, and the network returns updates: a new number, a new expiry, a closed account or contact-the-cardholder. The processor applies updates to the stored credential and notes the change on the payment record. Results arrive asynchronously and cover only participating issuers. It is hard because updating must be careful, not changing a card the customer replaced deliberately, and because it touches stored data and so must be tightly logged.",
    k: ["Automatic updates vs customer-approved updates: automatic keeps subscriptions alive; approval avoids charging a card the customer meant to retire.", "Running before each billing cycle vs periodically: before each cycle gets freshest data and costs fees; periodic is cheaper and misses recent changes."],
    p: ["Updating a closed-account response by deleting the card loses the history needed to handle later disputes.", "Updates applied to the vault but not to the subscription records leave the old number being charged."],
    v: "Submit test cards with reissue, expiry and closure outcomes, and confirm each update reaches the vault, the subscription charges the new details, and the closed card is flagged for customer contact.",
    dep: ["card-vault", "stored-credentials", "message-gateway"]
  },
  "bin-tables": {
    s: "Reference data mapping the first digits of a card number to its network, issuer, country, card type and product, used for routing, pricing and risk.",
    d: "The first six to eight digits identify the issuer range. Tables list for each range the network, issuing country, credit or debit or prepaid, consumer or commercial, and sometimes the currency. The system loads updates from networks and data providers, often weekly, and caches them for lookup at every payment. They drive routing decisions, interchange categories and eligibility for local methods. It is hard because ranges overlap and change, data is imperfect, and a stale table silently misroutes and misprices.",
    k: ["Network-supplied tables vs third-party enriched data: network tables are authoritative and sparse; third-party data is richer and sometimes wrong.", "Cached in memory per node vs a shared lookup service: caches are fast and can differ between nodes; a shared service is consistent and adds latency and a dependency."],
    p: ["A new range not yet loaded makes valid new cards fail format checks or route to the wrong network.", "Treating the country of a card as the country of the customer breaks fraud rules."],
    v: "Look up a sample of test numbers across ranges and confirm each returns the expected network, country and type, then load an updated table and confirm all nodes serve the new data within the stated time.",
    dep: ["data-retention"]
  },
  "certification": {
    s: "The formal testing a processor must pass to connect to each network or acquirer, and again whenever formats, features or security rules change.",
    d: "Before going live and on each mandated release, the processor runs a script of test cases against the network's test environment: message formats, edge cases, reversals, timeouts and security. Results are submitted and reviewed, and some cases require specific data. Mandates arrive on fixed calendars with deadlines. It is hard because the work is repetitive and rules-heavy, test environments are unreliable, deadlines are fixed by others, and a failed certification can block a new region or feature for months.",
    k: ["Automating certification scripts vs running them by hand: automation repeats cheaply on each mandate and takes effort to build; manual runs are flexible and error-prone.", "Certifying new features early vs near the deadline: early leaves slack for retests; late avoids rework when the specification changes."],
    p: ["Missing a mandate deadline results in fines or loss of a feature that merchants already rely on.", "Tests that pass in the network's sandbox but depend on timing the production network does not give."],
    v: "Re-run the full certification script against the test network from a clean environment, and confirm each case passes with the expected message trace and the results package is generated without manual edits.",
    dep: ["card-message-codec", "acquirer-connectors"]
  },
});
