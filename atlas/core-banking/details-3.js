// Details for the core banking plate, part 3: fees, posting and balances, general ledger.
ATLAS.details("core-banking", {
  "fee-catalog": {
    s: "The list of every fee the bank can charge, with trigger, amount or formula, currency, frequency, tax treatment and the ledger accounts that receive the income.",
    d: "Each fee is defined once with its triggering event, such as a transaction type, a period end or a service request, and how it is computed: flat, percentage, tiered or per item with minimums and maximums. Products reference fees from the catalog and may override amounts. Disclosure documents are generated from it. It is hard because fees multiply over years, regulations require clear disclosure of each, and a catalog that does not match what is actually charged is a compliance breach.",
    k: ["Central fee catalog referenced by products versus fees embedded in each product: change once and disclose consistently, but products lose independence.", "Fees as formula parameters versus coded rules: new fee shapes are configured without release, but the formula language needs limits to remain testable."],
    p: ["A fee charged in practice that is missing from the published schedule draws regulatory action.", "A catalog change meant for new customers applies to existing ones."],
    v: "Compare every fee posted in a sample month against the catalog and published tariff, and confirm each matches in amount, trigger and income ledger account with no unexplained charges.",
    dep: ["product-parameters", "chart-of-accounts", "maker-checker"]
  },
  "fee-assessment": {
    s: "Evaluates events and periods against the fee catalog to decide which fees apply to which account, computing amounts and posting them through the normal posting path.",
    d: "Some fees are event-driven, such as a transfer fee posted with the transaction. Others are periodic, such as monthly maintenance, assessed in batch after checking usage, balance and package conditions. Assessment applies waivers, caps and tax, then creates a posting with a reference to the cause. Failed fees, for lack of funds, may be retried or written off. The challenge is volume and fairness: millions of small charges, all of which must be explainable to the customer.",
    k: ["Assess at transaction time versus in batch: customers see fees immediately, but real-time paths grow slower and more complex.", "Charge when funds are insufficient versus defer: income is protected, but pushes accounts into overdraft or negative balance for fees alone."],
    p: ["A batch fee run is repeated after restart and charges every customer twice.", "Fees assessed against closed or dormant accounts create negative balances nobody expected."],
    v: "Run monthly fee assessment on a sample population including waived, capped and underfunded accounts, and confirm each charge, waiver and failure is recorded with its reason and no account is charged twice on rerun.",
    dep: ["fee-catalog", "posting-engine", "accrual-fee-runs", "waivers-reversals"]
  },
  "waivers-reversals": {
    s: "Allows fees to be waived in advance by rule or refunded afterward by staff, with approvals, limits and reasons recorded.",
    d: "Automatic waivers come from rules such as balance thresholds or package membership. Manual waivers are granted by staff within limits, with higher amounts needing approval. A reversal creates a compensating posting linked to the original fee, restoring income and the customer's balance, along with any tax. It is hard to control: waivers reduce income directly, so authority limits and reporting by staff and branch are needed to spot abuse and to prove fairness.",
    k: ["Waiver by rule versus discretionary staff waiver: consistent outcomes at scale, but staff need discretion for exceptional cases, which must be limited and reported.", "Reverse with a linked compensating entry versus delete the fee: the audit trail shows what happened, but statements show both lines."],
    p: ["A staff member waives fees on their own or relatives' accounts without detection.", "A reversal restores the fee but not the tax collected on it."],
    v: "Waive a fee above a staff member's limit and confirm it waits for approval, then approve and confirm a compensating entry links to the original, restores tax and appears on the customer's statement.",
    dep: ["fee-assessment", "maker-checker", "reversals-corrections", "tax-withholding"]
  },
  "relationship-pricing": {
    s: "Adjusts fees and rates for a customer based on their overall relationship, such as combined balances, packages or segment, rather than product by product.",
    d: "A relationship tier is computed from aggregate balances, products held or income, usually in the periodic batch, and stored on the customer. Fee assessment and interest then look up the tier for discounts or bonus rates. Packages bundle several accounts under one fee with conditions. It is difficult because aggregation crosses account boundaries and time, tiers can change daily and customers need to understand why prices change.",
    k: ["Tier computed in batch and cached versus evaluated at transaction time: fast and predictable, but a customer's tier lags behind their real position.", "Package pricing versus per-product pricing: simple marketing and discounts, but fee attribution to individual accounts becomes artificial."],
    p: ["Tier recalculation uses a stale balance snapshot and removes a discount customers had earned.", "Closing one account in a package silently changes pricing on others."],
    v: "Raise a customer's combined balance above a tier threshold and confirm after the next run their discount applies from the specified date on all linked accounts, with the tier history recorded.",
    dep: ["customer-master", "fee-assessment", "tiered-bonus-interest", "party-relationships"]
  },
  "tax-withholding": {
    s: "Calculates and withholds taxes on interest, fees and transactions according to customer status and jurisdiction, and records the amounts owed to the authority.",
    d: "Rules depend on residency, account type, product and exemptions. Interest payout withholds tax, some fees carry a consumption tax, and certain transactions may be taxed. Withheld amounts post to liability accounts and are later remitted. Rates and exemptions change with dates and customer certification. It is hard because errors affect both the customer and the bank's legal obligations, and because tax status data in the customer master must stay correct and dated.",
    k: ["Rules held in a tax engine versus parameters per product: complex jurisdictions are handled, but data needs and rule changes need specialist ownership.", "Withhold at payment versus report only: the bank collects tax correctly at source, but must refund over-withholding when exemptions arrive late."],
    p: ["A customer's exemption certificate expires and tax continues to be withheld at the lower rate.", "Tax liability accounts are not reconciled to what is remitted, and discrepancies grow."],
    v: "Pay interest to a resident, a non-resident and an exempt customer and confirm each is taxed at the correct rate, with the liability account matching the withheld total and the tax reporting extract.",
    dep: ["customer-master", "chart-of-accounts", "tax-reporting"]
  },
  "penalty-charges": {
    s: "Applies charges for late payment, returned items, early closure and limit breaches, within the caps allowed by contract and regulation.",
    d: "Penalty rules trigger from events: an installment becoming overdue, a payment bounced, a limit exceeded. The charge may be fixed, percentage or penalty interest on the overdue amount, often with grace periods and maximum caps per period. Each is posted against the account and noted on the statement. The challenge is legal limits and fairness: charges beyond cap or without proper notice can be reversed by regulators, and automatic penalties compound customer hardship.",
    k: ["Automatic penalty on trigger versus discretionary imposition: consistent and cheap to run, but ignores individual circumstances unless a waiver path exists.", "Penalty interest on overdue amount versus flat fee: proportional to harm, but needs separate accrual and ledger accounts."],
    p: ["Penalties are charged during a bank outage that prevented the customer from paying.", "Caps are applied per transaction, not per period, and total charges exceed the legal limit."],
    v: "Leave an installment overdue past grace, confirm the penalty is posted once with the right rate and cap, and that a payment in grace period produces none.",
    dep: ["arrears-delinquency", "fee-catalog", "posting-engine", "waivers-reversals"]
  },
  "posting-engine": {
    s: "The single component through which every balance change passes: it validates, applies and records a transaction atomically so debits equal credits and each instruction takes effect exactly once.",
    d: "A posting request names accounts, amounts, currency, dates and a transaction code. The engine checks account state and holds, applies business rules, determines the entries, updates balances and writes the transaction and ledger journals in one database transaction, then emits events. It must be fast on the hot path and correct under concurrency, retries and partial failure. The hardest properties are atomicity across several accounts, idempotency under retries, and never leaving the books unbalanced even if the process dies midway.",
    k: ["One posting path for every channel versus channel-specific shortcuts: consistent rules and audit, but it concentrates load and risk.", "Synchronous update of balances versus appending entries and aggregating later: exact balances at once, but contention on hot accounts; append-only scales better and delays visibility."],
    p: ["A shortcut path that updates balances directly bypasses holds, limits and journal creation.", "A crash between balance update and journal write leaves them inconsistent without detection."],
    v: "Post one million random transfers with injected crashes and retries, then confirm every posting is complete or absent, the sum of balances equals the ledger exactly, and each retry created no duplicate effect.",
    dep: ["transaction-codes-rules", "account-concurrency-control", "balance-model", "double-entry-journals", "idempotency-dedup", "transactional-store"]
  },
  "transaction-codes-rules": {
    s: "A table of transaction types that defines, for each, the entries to create, the accounts affected, whether it can be reversed, and what it shows on statements.",
    d: "Every posting names a code such as cash deposit, card purchase, fee or interest credit. The code determines debit and credit sides, ledger event, narrative text, limits, whether it counts toward available balance and how it can be reversed. Product and channel can refine behavior. It is the common vocabulary between channels, posting, accounting and statements. It is hard because the code set grows for decades, similar codes drift apart, and meanings embedded in codes are hard to change.",
    k: ["Rich, specific codes versus few generic codes with attributes: reports and statements are precise, but the table becomes large and hard to maintain.", "Rules in tables versus in code: bankers can adjust behavior, but table logic is untyped and needs strong testing."],
    p: ["A new code is copied from an old one with a wrong accounting side, and the ledger drifts.", "The same event is mapped to different codes by different channels, splitting reports."],
    v: "For each code in use, post a sample transaction and confirm the resulting entries, statement narrative and reversibility match the specification, and that no posting uses an undefined code.",
    dep: ["accounting-event-rules", "product-parameters"]
  },
  "idempotency-dedup": {
    s: "Ensures a repeated request with the same identifier produces the same single effect, so retries after timeouts never move money twice.",
    d: "Each instruction carries a unique key from the originator. The posting engine records the key with the result in the same transaction as the posting. A repeat returns the stored result without reapplying. Keys are scoped by originator and kept for a defined window or forever, depending on risk. It is hard because the guarantee must hold under concurrency, so two simultaneous identical requests cannot both pass the check, and because a key reused with different content must be detected as an error.",
    k: ["Unique constraint on the key in the posting transaction versus a prior lookup: race-free, but contention and index size grow with volume.", "Retain keys forever versus a window: complete protection, but unbounded storage; windows risk duplicates arriving after expiry."],
    p: ["Check-then-insert without a constraint lets two concurrent retries both post.", "A key generated per attempt rather than per instruction makes retries look like new payments."],
    v: "Send the same request ten times concurrently and confirm exactly one posting exists, all callers receive the same result, and a request reusing the key with a different amount is rejected.",
    dep: ["transactional-store", "posting-engine"]
  },
  "balance-model": {
    s: "Defines the balances each account keeps, such as ledger, available, pending and accrued, and how they are updated and derived from the entries.",
    d: "The ledger balance is the sum of posted entries. Other balances are layers: pending credits and debits, held amounts, accrued interest, limits. Some systems store a running balance on each entry; others store snapshots plus entries since. Balances exist per account, currency and sometimes per bucket such as principal and interest. The challenge is consistency under concurrency and the ability to recompute any balance as at any past date from entries.",
    k: ["Stored running balance versus computing from entries: reads are instant, but stored balances must be locked and can drift from the log; computing is always right but slow for large histories.", "Single balance per account versus multiple balance buckets: simple, versus precise handling of loan components and holds at the cost of more state."],
    p: ["Stored balance and entries diverge after a bug, and no routine detects it until a customer complains.", "Historical balance requests recompute from millions of entries and overload the store."],
    v: "Recompute every account's balance from its entries nightly and confirm it equals the stored balance for all accounts, and that balance as at a date last month can be produced and matches that day's statement.",
    dep: ["transactional-store", "append-only-log", "double-entry-journals"]
  },
  "available-balance": {
    s: "The amount a customer can actually spend: ledger balance adjusted for holds, pending items and credit limits, computed consistently for every channel and authorization.",
    d: "Available balance equals ledger balance minus holds and uncleared items, plus any overdraft or credit limit. Rules decide whether uncleared deposits count. It is read on every card authorization, transfer and ATM request, so it must be fast and exactly agree with what the posting engine will accept. It is hard because several writers change its inputs at once: holds placed by cards, funds released by clearing, interest posted by batch.",
    k: ["Stored available balance updated with each change versus computed on demand: fast reads, but another value to keep correct; computed is simpler but costs more per authorization.", "Count uncleared deposits as available versus not: better customer experience, but exposure to returned items."],
    p: ["A hold is added without updating the cached available balance, and the account is overdrawn by a second authorization.", "Channels compute available balance differently and show customers conflicting figures."],
    v: "Create an account with a hold, a pending deposit and an overdraft limit and confirm available balance in the core, the card interface and the app are identical and change correctly as each item clears or releases.",
    dep: ["balance-model", "holds-blocks-restrictions", "overdraft-facilities"]
  },
  "value-dating": {
    s: "Separates the date a transaction is booked from the date it takes effect for interest and availability, supporting future-dated and past-dated entries.",
    d: "Every posting carries a booking date and a value date. Interest runs from the value date; availability may follow clearing rules, such as funds from a cheque becoming available after days. Future-dated postings sit pending until their date. Past-dated ones, such as late-arriving payments, change earlier interest. It is difficult because balances now need both views, positions as of any date, and interest recalculation whenever a value date lands in the past.",
    k: ["Value-dated balances stored per day versus derived: interest is easy to compute, but backdated entries force rewriting history.", "Strict rejection of value dates beyond a limit versus accepting any: controls risk and rework, but blocks legitimate corrections."],
    p: ["A value date in a closed period changes interest already paid without a compensating adjustment.", "Future-dated items are counted in available balance too early."],
    v: "Post one entry value-dated yesterday and one for next week and confirm interest adjusts for yesterday only, the future item appears pending and becomes effective on its date.",
    dep: ["business-calendar", "balance-model", "backdated-postings"]
  },
  "account-concurrency-control": {
    s: "Serializes or safely orders simultaneous updates to the same account so balances stay correct when thousands of operations arrive at once.",
    d: "Mechanisms include row locks, optimistic version checks, per-account queues and sequencing in a single-writer partition. Postings touching several accounts need a consistent lock order to avoid deadlocks. Hot accounts, such as a merchant settlement or a bank's own clearing account, concentrate contention. The design goal is throughput without sacrificing correctness: every serialization choice trades latency for safety and shows up as lock waits under peak load.",
    k: ["Pessimistic row locks versus optimistic version checks: locks are simple and certain, but wait; optimistic is faster at low contention but retries under high contention.", "Single writer per account partition versus shared database locking: no deadlocks and predictable order, but cross-partition transfers need coordination."],
    p: ["Two transfers locking the same accounts in opposite order deadlock under load.", "A hot internal account serializes the entire bank's throughput."],
    v: "Run concurrent transfers in both directions between two accounts at peak rate and confirm zero deadlock failures beyond retry policy and balances equal the arithmetic sum of all transfers.",
    dep: ["transactional-store", "account-master", "partitioning-sharding"]
  },
  "backdated-postings": {
    s: "Handles entries that belong to a past date, such as late payments and corrections, by adjusting interest, balances and reports without rewriting history.",
    d: "A backdated posting uses a value date earlier than today. The system appends the entry today but recalculates balances and interest as at the past date, posting an interest adjustment for the difference. If the date falls in a closed accounting period, rules decide whether it is allowed, moved to the current period or needs approval. It is hard because it ripples: past statements, accruals, fees, tax and reports could all be affected.",
    k: ["Recalculate and post an adjustment versus restate past balances: history stays intact and auditable, but customers see correction lines instead of clean statements.", "Allow only within a limited number of days versus unlimited: bounded rework, but legitimate late corrections need exception handling."],
    p: ["Backdating into a closed month changes figures already reported to the regulator.", "Interest adjustments are posted but fees triggered by the earlier balance are not recomputed."],
    v: "Post a deposit dated ten days ago on an account with accrued interest and confirm the interest adjustment equals an independent calculation, and the entry is blocked or flagged if the period is closed.",
    dep: ["value-dating", "interest-accrual", "reversals-corrections"]
  },
  "reversals-corrections": {
    s: "Cancels or corrects a posted transaction by adding linked opposite entries, never by editing the original, preserving a complete and explainable history.",
    d: "A reversal copies the original transaction with debits and credits swapped and links to it with a reason. It also reverses side effects such as fees or interest when policy says so. Corrections may reverse and repost. Rules decide who may reverse what, within which time, and what happens if the funds are no longer there. It is hard because a reversal can fail: money already spent leaves a negative balance, and linked effects such as tax or fees need coordinated reversal.",
    k: ["Full reversal with repost versus a delta adjustment: a clean audit story, but doubles entries and statement lines compared with a single net correction.", "Reverse side effects automatically versus case by case: consistent, but sometimes reverses a fee the bank wanted to keep."],
    p: ["A reversal posted against a closed account has nowhere to go and fails silently.", "Reversing the same item twice credits the customer twice because the link to the original is not checked."],
    v: "Reverse a card payment and its fee, confirm both original entries remain, linked reversing entries exist, balances are restored, and a second reversal attempt of the same item is refused.",
    dep: ["posting-engine", "append-only-log", "double-entry-journals"]
  },
  "chart-of-accounts": {
    s: "The structured list of ledger accounts, grouped into assets, liabilities, equity, income and expense, against which every journal line is recorded.",
    d: "Each ledger account has a code, type, currency, parent in a hierarchy, and rules for use. For banks, accounts distinguish deposits by product and maturity, loans by stage, accrued interest, fees, tax liabilities, suspense and nostro balances. Rollups feed financial and regulatory reports. It is hard because design choices persist for decades: too coarse and reports cannot be built, too fine and posting rules and reconciliation explode.",
    k: ["Detailed chart with analytical dimensions versus a minimal chart: reports slice flexibly, but every posting must carry correct dimensions.", "One chart for the group versus local charts per entity: consolidation is simple, but local statutory needs require mapping."],
    p: ["Accounts reused for different purposes mix balances that later need splitting.", "A new product is launched without ledger accounts and its postings land in a generic account."],
    v: "List every posting rule's target accounts and confirm each exists and is active, then check that the chart's hierarchy rolls up to the published balance sheet totals with zero unmapped accounts.",
    dep: ["accounting-event-rules"]
  },
  "double-entry-journals": {
    s: "Records every financial event as balanced debit and credit lines against ledger accounts, so the total of debits always equals the total of credits.",
    d: "A journal is a set of lines with account, amount, currency, side, value date and a reference to the source transaction. The posting engine writes them in the same transaction as the account entries. Balanced-ness is enforced by constraint, not by trust. Multi-currency journals balance in each currency and in base currency. The challenge is volume, since every customer posting may produce several lines, and keeping detail linked to source for audit.",
    k: ["Journal line per event at full detail versus summarized lines: complete traceability, but billions of rows; summaries are cheap but cannot explain a figure.", "Balance check in the database versus in application code: cannot be bypassed, at some write cost."],
    p: ["Rounding in currency conversion leaves journals out of balance by a fraction, and the transaction is rejected or silently adjusted.", "Lines are written by a separate job and fall behind the account entries."],
    v: "Select a random day and confirm total debits equal total credits per currency across all journals, and each journal line traces to a source posting and back.",
    dep: ["chart-of-accounts", "accounting-event-rules", "append-only-log", "transactional-store"]
  },
  "accounting-event-rules": {
    s: "Maps each business event to the debit and credit ledger accounts it must hit, depending on product, transaction type, status and customer segment.",
    d: "When a posting occurs, event rules determine the journal lines: a deposit credits a customer-deposit liability and debits cash, interest accrual debits expense and credits accrued interest, a loan moving to arrears reclassifies balances. Rules are data, versioned and effective-dated, so accounting treatment can change without code. It is hard to keep complete: every transaction code, product and status combination needs a rule, and gaps surface as unposted or misposted entries at month end.",
    k: ["Rules as data tables versus coded mappings: finance can review and change them, but complexity moves into hard-to-test configuration.", "Event-driven accounting separate from posting versus inline: flexible re-accounting, but more moving parts to keep consistent."],
    p: ["A new transaction code has no accounting rule and posts to a default suspense account.", "Rule changes are applied to past-dated postings and restate closed periods."],
    v: "Enumerate all combinations of transaction code, product and status in use and confirm each resolves to exactly one rule, then post a sample and verify resulting journals against the finance team's expected entries.",
    dep: ["chart-of-accounts", "transaction-codes-rules", "product-parameters"]
  },
  "subledger-gl-mapping": {
    s: "Relates the detailed balances in customer accounts to the control accounts in the general ledger so that the two always agree.",
    d: "Customer accounts form a subledger; the general ledger holds control accounts summarizing them by product and status. Each account movement updates both, directly or by summarized journals. The control relationship is tested daily: the sum of subledger balances for a product must equal the control account. Reclassifications, such as an account moving from performing to arrears, move amounts between control accounts. The challenge is exactness at scale and quickly finding which account causes a difference.",
    k: ["Real-time journal per posting versus summarized batch journals: instant agreement and detail, but heavy write volume; summaries are light but delay detection.", "Control accounts only versus per-customer ledger accounts: small ledger, but customer balances live outside it and need their own proof."],
    p: ["Summarized journals skip an account type, and the control total drifts a little each day.", "A subledger correction is posted without the matching ledger movement."],
    v: "At close of day, sum all subledger balances by control account and compare with the ledger balance of each, and confirm differences are exactly zero with any exception listing the responsible accounts.",
    dep: ["double-entry-journals", "balance-model", "reconciliation-engine"]
  },
  "multi-currency-revaluation": {
    s: "Keeps books in several currencies, converts using dated rates, and revalues foreign-currency balances so gains and losses are recognized correctly.",
    d: "Accounts have a transaction currency; the ledger records amounts in that currency and in the bank's base currency at the rate on the transaction date. Periodically, positions are revalued at current rates and the difference posted as gain or loss. Conversion for customers applies rates with margins and rounding rules. It is hard because rates change constantly, triangulation through a base currency rounds, journals must balance in each currency separately, and positions must be tracked per currency.",
    k: ["Book in both transaction and base currency versus only convert for reports: exact foreign balances and automatic revaluation, but each journal carries two amounts that must agree.", "Single rate table per day versus continuous rates: reproducible, but intraday customer conversions use stale prices."],
    p: ["Revaluation uses a rate from the wrong date, producing false gains.", "Cross rates are rounded at each step, and conversions do not round-trip."],
    v: "Hold a foreign-currency position, change the rate, run revaluation and confirm the posted gain or loss equals position times rate difference, and journals balance in both currencies.",
    dep: ["double-entry-journals", "chart-of-accounts", "business-calendar"]
  },
  "trial-balance": {
    s: "Reports the balance of every ledger account at a point in time and proves that total debits equal total credits across the bank.",
    d: "The ledger maintains running balances per account and date, from which a trial balance is produced intraday and at each close. It feeds the balance sheet and income statement and is the first check finance performs. Balances come from journals or incremental updates. The challenge is speed and consistency: producing a balanced trial balance while postings continue, and reproducing any past day's report exactly, including after later corrections.",
    k: ["Maintained incremental balances versus recomputing from journals: fast reports, but another structure that can drift and must be verified against journals.", "Snapshot at close and never altered versus recompute on demand: stable published figures, but late corrections need explicit adjustment entries."],
    p: ["A trial balance run mid-posting mixes before and after states and shows a false imbalance.", "Closed-period snapshots are overwritten by a rerun, so published figures change."],
    v: "Generate the trial balance at close, confirm total debits equal total credits, then regenerate it a week later for the same date and confirm identical figures.",
    dep: ["double-entry-journals", "chart-of-accounts", "day-rollover"]
  },
  "suspense-clearing-accounts": {
    s: "Temporary ledger accounts that hold money or items not yet identified or settled, such as unmatched receipts and in-transit payments, with owners and deadlines for clearing.",
    d: "When an incoming payment lacks a valid beneficiary, or a scheme settles before the customer is posted, the amount goes to a suspense or clearing account rather than being lost or guessed. Each item records its origin, age and owner and must be cleared by identification, return or write-off. Balances should trend to zero. It is hard because suspense accounts are where errors and fraud hide, and old items become harder to resolve each week.",
    k: ["Many specific clearing accounts versus one general suspense account: easy to attribute and reconcile each flow, but more accounts to monitor.", "Automatic matching and release versus manual handling: faster clearance of volume, but wrong matches move money to the wrong customer."],
    p: ["Items older than ninety days are bulk written off without investigation.", "A general suspense account is used as a place to park postings staff cannot explain."],
    v: "Run an ageing report on every suspense and clearing account, and confirm each balance equals the sum of identified open items with owner and age, and none exceeds its policy limit.",
    dep: ["chart-of-accounts", "double-entry-journals", "reconciliation-engine"]
  },
  "reconciliation-engine": {
    s: "Compares two sets of financial records, such as ledger versus subledger or bank versus counterparty, matches items by rules, and surfaces unmatched differences for resolution.",
    d: "Inputs are two or more sources with different formats. Rules match on references, amounts, dates and tolerances, one-to-one or many-to-one. Unmatched items age into exceptions with an assignee and a deadline. The engine also reconciles internal control totals across the core, such as balances against ledger and event counts against postings. Hard parts are fuzzy matching, timing differences and keeping the exception process from becoming a backlog.",
    k: ["Many specific matching rules versus a general scoring approach: predictable and explainable, but needs maintenance as formats change.", "Continuous intraday reconciliation versus end-of-day: problems caught within minutes, but requires timely data from all counterparties."],
    p: ["Tolerances wide enough to hide real errors let small differences accumulate.", "Exceptions have no owner, so the same breaks reappear each day."],
    v: "Feed two datasets with five known differences and confirm exactly those five surface as exceptions with correct age and owner, and the matched totals on both sides are equal.",
    dep: ["double-entry-journals", "transaction-history-store", "balance-model"]
  },
});
