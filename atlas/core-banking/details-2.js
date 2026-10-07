// Details for the core banking plate, part 2: customers and accounts, products and interest, loans.
ATLAS.details("core-banking", {
  "customer-master": {
    s: "The authoritative record of each customer as a legal party: identity, contact details, classification, status and a stable identifier that every account and product refers to.",
    d: "One record per person or organization holds names, identifiers, addresses, tax residency, segment and risk rating, with history of changes. A durable customer number links all accounts. Deduplication prevents the same party being created twice. Other systems copy data from it, so changes propagate through events. It is hard because identity is messy: names change, organizations merge, and a duplicate or wrong merge puts one customer's money or data in another's hands.",
    k: ["One customer master for the whole bank versus per-product customer records: a single view and consistent KYC, but a hard dependency and a big migration from product silos.", "Effective-dated attribute history versus overwrite: past statements and reports remain reproducible, at the cost of more complex queries."],
    p: ["Duplicate customers hold separate balances, defeating deposit limits and risk aggregation.", "A merge of two parties is wrongly applied and cannot be undone because history was overwritten."],
    v: "Create a customer twice with slightly different spelling and confirm duplicate detection flags it, then change an address and confirm the previous value remains queryable as of an earlier date.",
    dep: ["transactional-store", "kyc-records", "audit-trail"]
  },
  "kyc-records": {
    s: "Stores the identity evidence, due-diligence results, risk classification and review schedule that prove the bank knows its customer before and during the relationship.",
    d: "At onboarding the bank collects identity documents, beneficial ownership, source of funds and checks against watch lists, then assigns a risk rating that drives monitoring intensity and review frequency. Records link to the documents themselves and to who verified them. Periodic and trigger-based reviews refresh them. The difficulty is that obligations never end: expired documents, changed circumstances and rule changes require ongoing refresh, and incomplete records can legally force the bank to restrict accounts.",
    k: ["KYC status as a gate on account activity versus an advisory flag: regulators are satisfied and risk is contained, but customers are blocked by a back-office delay.", "Storing document images in the core versus a separate repository: simpler access control and retention, but heavier storage and a slower core."],
    p: ["Review dates are tracked in a spreadsheet and lapse, leaving high-risk customers unreviewed.", "Ownership chains for companies are captured once and never updated after a share transfer."],
    v: "Let a high-risk customer's review date pass in a test environment and confirm the account is flagged, restricted per policy, and the event appears in the compliance queue and audit trail.",
    dep: ["customer-master", "holds-blocks-restrictions", "retention-legal-hold"]
  },
  "party-relationships": {
    s: "Models how parties relate to each other and to accounts: joint holders, guarantors, beneficial owners, dependents, groups and powers of attorney.",
    d: "A relationship record connects a party to an account or another party with a role, share and validity dates. It drives who can see and operate an account, who is liable, who is reported to tax authorities and how exposure is aggregated across a group. Roles may change over time, and some are legally defined. The complexity is in the graph: a corporate group, its directors and their personal accounts form relationships that must be traversed for risk and reporting.",
    k: ["A general party-relationship graph versus fixed role columns on the account: flexible modeling of real structures, but queries and reports become graph traversals.", "Relationship changes effective-dated versus immediate: legal changes apply from the right day, but staff must handle dates in the past."],
    p: ["A removed joint holder keeps access because the change did not reach the digital channel.", "Group exposure is understated because an indirect owner link was never recorded."],
    v: "Add a guarantor to a loan, remove a joint holder from an account, and confirm access, notices and exposure reports change from the effective date, with a history of each change.",
    dep: ["customer-master", "account-master", "mandates-signatories"]
  },
  "account-master": {
    s: "The record of every account: its owner, product, currency, status, terms and balance containers, which postings and every other component reference.",
    d: "Each account has an internal identifier, product, currency, branch, opening date, status and links to owners. It carries the parameters inherited from the product plus any account-specific overrides, and owns the balances that postings update. It is the unit of locking and often of partitioning. The challenge is size and stability: hundreds of millions of rows, very hot for the busiest accounts, and the identifier must never change or be reused because history across years depends on it.",
    k: ["Internal account id separate from the customer-visible number: numbers can change format or be re-issued without breaking history, but every lookup needs a mapping.", "Product terms copied to the account versus referenced: the account's contract is stable if the product changes, but mass changes require touching every account."],
    p: ["Reusing a closed account number sends later payments to an unrelated customer.", "Account-level overrides accumulate and nobody can say what the account's real terms are."],
    v: "Open an account, change the product parameters, and confirm the account keeps its original terms or follows the change as designed, with a full history queryable by internal id.",
    dep: ["customer-master", "product-catalog", "account-numbering", "transactional-store"]
  },
  "account-numbering": {
    s: "Generates and validates customer-visible account numbers and international identifiers, with check digits, branch or product encoding and rules against reuse.",
    d: "Numbers follow national or international formats, with a check digit that catches typing errors. Generation must be unique, non-guessable where policy demands, and fast under load. Aliases such as phone numbers or proxy identifiers may map to accounts for payments. Validation functions are shared by channels and payment intake. It looks easy and is not: formats differ by country, a bank may need several numbering schemes after mergers, and changing formats ripples to every external party that stored the old number.",
    k: ["Meaningful numbers that encode branch and product versus opaque numbers: staff can read them, but reorganizations make the encoded data wrong.", "Check-digit validation in the core versus only at channels: stops mistyped numbers from any entry point, with small added latency."],
    p: ["Sequential numbers let an attacker enumerate accounts through a payment-validation API.", "A new check-digit rule rejects previously valid numbers on standing orders."],
    v: "Generate ten thousand numbers under concurrent load and confirm no duplicates, valid check digits on all, and rejection of a number with one transposed digit.",
    dep: ["account-master"]
  },
  "account-lifecycle": {
    s: "Controls the states an account passes through, from application and opening to dormant, frozen, closed and archived, and the checks required at each transition.",
    d: "State changes are explicit transitions with preconditions: opening needs verified KYC, closing needs zero balance and no pending items, reactivation needs confirmation. Each state determines allowed transactions. Closure also triggers returning balances, cancelling mandates and standing orders, and notifying the customer. Hard parts include pending items arriving after closure, accounts that cannot close because of disputes, and consistent state across channels that cache it.",
    k: ["Strict state machine with allowed transitions versus flags set freely: invalid combinations are impossible, but real-world exceptions require explicit override paths.", "Soft close with a grace period versus immediate close: late-arriving payments can still be handled, but the account lingers in reporting and risk."],
    p: ["A closed account still receives direct debits that are posted to a suspense account indefinitely.", "State change events arrive out of order at a channel, which then shows an account as open."],
    v: "Attempt to close an account with a pending hold and standing order and confirm the transition is refused, then clear both and confirm closure cancels the order and notifies the customer.",
    dep: ["account-master", "holds-blocks-restrictions", "standing-orders-direct-debits", "event-publication"]
  },
  "holds-blocks-restrictions": {
    s: "Places controls on accounts or funds: amount holds, debit or credit blocks, legal freezes and regulatory restrictions, each with a reason, owner and expiry.",
    d: "A hold reserves an amount, reducing available balance without changing the ledger balance; a block prevents whole classes of transaction; a freeze from a court order stops everything. Each has a source such as a card authorization, a legal request or an internal risk team, an authority required to release it, and often an end date. The posting engine checks them on every transaction. It is hard because holds come from many systems with different lifetimes and must be released exactly when intended.",
    k: ["Holds as first-class records with owner and expiry versus a single flag: each source can manage its own hold, but available balance must aggregate many.", "Block checked inside the posting transaction versus before it: no race between check and update, but the posting path takes on more reads."],
    p: ["Expired card holds never release, so customers see money they cannot spend.", "A legal freeze is lifted by the wrong team because release authority was not recorded."],
    v: "Place a legal freeze and a card hold on an account, attempt a debit and confirm it is refused with the correct reason, then release each in turn and confirm available balance returns by exactly the held amounts.",
    dep: ["account-master", "available-balance", "maker-checker"]
  },
  "mandates-signatories": {
    s: "Records who may operate an account, within what limits and in what combinations, including signing rules, delegated authority and third-party collection mandates.",
    d: "A mandate lists signatories with their authority: sole signing, any two of three, limits per transaction or per day, and effective dates. Business accounts need rules like one from group A and one from group B. Collection mandates authorize others to debit the account. The posting and payment components evaluate the rules before accepting an instruction. The difficulty is correct evaluation of combinations, and keeping mandates synchronized with corporate resolutions and with the digital channels' own user permissions.",
    k: ["Rule-based approval matrices versus fixed signer lists: models real corporate governance, but rules need testing like code.", "Mandate evaluated in the core versus in the channel: the core cannot be bypassed, but it must understand every channel's approval workflow."],
    p: ["A signatory leaves the company and keeps approval rights because the change was never recorded.", "Limits apply per transaction but not per day, so payments are split to evade them."],
    v: "Configure a two-of-three mandate with a daily limit and confirm a payment with one approval waits, with two executes, and a further payment above the daily total is refused.",
    dep: ["account-master", "party-relationships", "access-control"]
  },
  "product-catalog": {
    s: "The registry of product definitions the bank sells, each with a code, family, eligibility, lifecycle state and version, from which accounts are created.",
    d: "A product definition names what the account is and which parameter sets, fees, interest rules and transaction permissions apply. Products are grouped into families and versioned so changes do not rewrite existing contracts. Marketing can retire a product to new sales while accounts continue. It is difficult because the catalog is the interface between business and system: a product that sounds simple may need dozens of parameters, and thousands of legacy variants may exist from past campaigns.",
    k: ["Product as template plus overrides versus fully independent products: a small catalog that is easy to govern, but special cases push logic into overrides.", "Versioned product definitions versus in-place edits: existing customers keep their contracts, but the bank may run many versions for decades."],
    p: ["A product is edited in place and the new terms silently apply to existing customers, breaching their contracts.", "Hundreds of near-duplicate products make pricing and reporting unmanageable."],
    v: "Launch a new product version with a higher fee and confirm new accounts get it, existing accounts keep the old terms, and a report lists how many accounts are on each version.",
    dep: ["product-parameters", "release-configuration-management", "maker-checker"]
  },
  "product-parameters": {
    s: "The detailed configuration of how each product behaves: limits, permitted transactions, interest, fees, overdraft rules, tenor, and which accounting entries it creates.",
    d: "Parameters are organized into groups, validated for allowed ranges and combinations, and effective-dated. Accounts read them at posting and batch time. A parameter can be defaulted at product level and overridden on a specific account with permission. They connect business policy to ledger accounts and interest. It is hard because parameters interact: a minimum balance, a fee waiver and an interest tier can contradict each other, and nobody sees the effect until a customer's statement is wrong.",
    k: ["Validated typed parameters versus free-form configuration: errors are caught at entry, but the schema must evolve with each new feature.", "Resolution at read time versus snapshot at account opening: changes flow automatically, but past behavior must be reconstructed from versions."],
    p: ["Contradictory parameters pass validation and produce negative interest or impossible fees.", "A default change silently alters thousands of accounts that relied on the old default."],
    v: "Enter two conflicting parameters in a test product and confirm validation rejects them with a clear message, then change a valid parameter and confirm the effective date applies in a simulated posting.",
    dep: ["product-catalog", "chart-of-accounts", "maker-checker"]
  },
  "rate-tables-benchmarks": {
    s: "Holds the interest rates and reference benchmarks that products use, with effective dates, spreads, floors and caps, and the history needed to recompute past interest.",
    d: "Fixed rates, tiers and variable rates tied to a benchmark plus spread are all stored as dated entries. Benchmarks are loaded from external publishers on a schedule, with fallback rules if one is not published. Rate changes for existing variable accounts need notice periods. The challenge is correctness over time: interest for a past period must use the rate then in force, benchmarks are discontinued and replaced, and an error in a rate affects every account referencing it.",
    k: ["Rates as effective-dated rows versus latest value only: past interest can be recomputed and disputes resolved, at the price of date-aware lookups everywhere.", "Automatic benchmark loading versus manual entry: fewer errors and delays, but a bad feed propagates widely unless it is checked and approved."],
    p: ["A benchmark is missing on a holiday and accounts accrue at zero or at yesterday's rate without anyone deciding.", "A change is applied on the announcement date rather than the effective date and interest is wrong for days."],
    v: "Change a variable rate effective next Monday, accrue across the boundary, and confirm interest uses the old rate before and the new rate from Monday, with the change approved and logged.",
    dep: ["product-parameters", "maker-checker", "business-calendar"]
  },
  "interest-accrual": {
    s: "Computes the interest earned or owed on each account every day from balances, rates and conventions, and records it as accrued but not yet paid.",
    d: "Each day the accrual job takes the day's closing, or time-weighted, balance, applies the applicable rate and day-count rule, and adds the result to an accrued-interest balance, with a matching ledger entry. It must handle backdated transactions that change earlier balances, rate changes mid-period, leap years and rounding. Accrual runs across millions of accounts in the batch window. It is hard because small errors compound over time and are visible to customers and auditors.",
    k: ["Daily accrual postings versus compute on demand at period end: ledger always reflects earned interest, but doubles the daily batch volume.", "Accrue on closing balance versus on lowest or average balance: product-specific fairness rules, each needing different data retained."],
    p: ["A backdated posting changes past balances but accrued interest is not recalculated, so the final payment is wrong.", "Rounding at each day rather than at payout makes interest differ by cents from published examples."],
    v: "Run accrual for a test account across a month with a mid-month deposit and a backdated correction, and compare the total to an independent calculation to the smallest currency unit.",
    dep: ["day-count-conventions", "rate-tables-benchmarks", "balance-model", "eod-orchestrator"]
  },
  "interest-capitalization": {
    s: "Turns accrued interest into an actual posting on a schedule, crediting or debiting the account, withholding tax and starting compounding on the new balance.",
    d: "At the end of each interest period the accrued amount is rounded, tax is withheld according to the customer's status, and a posting moves the net interest to the account, with the ledger moving it from accrued to paid. For loans, interest due may be capitalized into principal. Schedules differ by product and may fall on non-business days. Mistakes are visible and expensive: a posting error repeats for every account of a product at once.",
    k: ["Rounding after accumulation versus rounding daily: totals agree with the stated rate, but daily figures cannot be reproduced from rounded numbers.", "Capitalize on a fixed calendar date versus account anniversary: easier batches, but customers see different effective yields."],
    p: ["Interest paid twice because the job restarted without a record of the accounts already done.", "Tax withheld at the wrong rate after a residency change is applied retroactively without correction."],
    v: "Run interest payout for a sample of one thousand accounts, then rerun the same job and confirm no second posting occurs, and ledger accrued interest falls by exactly the amount paid.",
    dep: ["interest-accrual", "tax-withholding", "posting-engine", "checkpoint-restart"]
  },
  "day-count-conventions": {
    s: "Defines how elapsed days and year length are counted when converting an annual rate into interest for a period, such as actual over 365 or thirty over 360.",
    d: "Conventions differ by market, product and currency: actual days over a 360 or 365 year, thirty-day months, or actual over actual with leap-year handling. The calculation module takes a start date, end date and convention and returns a year fraction used by accrual, loan schedules and pricing. It sounds trivial and is a classic source of disagreement, because contracts name the convention and any difference shows as a dispute on the customer's statement.",
    k: ["A shared calendar library used by all products versus local implementations: one correct version, but every product depends on it and change is risky.", "Convention fixed per product versus per contract: simple rules, but loan agreements negotiated individually cannot be represented."],
    p: ["A leap year handled differently in accrual and in schedules makes the final payment off by a day of interest.", "Using the wrong convention for a foreign-currency product overcharges consistently."],
    v: "Compute interest on a fixed principal across a leap-year February under each convention and compare to published reference values in the contract documentation to the smallest unit.",
    dep: ["business-calendar"]
  },
  "tiered-bonus-interest": {
    s: "Applies interest rules that vary with balance bands, behavior or relationship, such as higher rates on higher balances or a bonus for no withdrawals.",
    d: "Tiered products pay different rates on slices of the balance or on the whole balance by band. Bonus rules check conditions over a period, such as monthly deposits or no withdrawals, and add a bonus rate or amount if met. These rules need history, so conditions are evaluated at period end or tracked daily. The challenge is clarity and testing: customers expect the rule in the brochure to match their interest exactly, and edge cases around band boundaries multiply.",
    k: ["Whole-balance tiering versus marginal tiering: easy to explain, but a balance just over a threshold changes all the interest, causing cliff effects.", "Evaluate bonus conditions daily versus at period end: instant feedback to customers, but more state and more recalculation."],
    p: ["A bonus condition is checked in the wrong period due to a month-end date, and eligible customers are denied.", "Boundary balances exactly on a band edge are assigned to the lower band inconsistently."],
    v: "Test accounts with balances just below, at and above each band boundary and with and without the bonus condition, and confirm interest matches a hand-computed table in every case.",
    dep: ["interest-accrual", "rate-tables-benchmarks", "balance-model"]
  },
  "term-deposits": {
    s: "Manages fixed-term deposits with a set rate and maturity: opening, interest handling, early withdrawal penalties, and rollover or payout at maturity.",
    d: "A term deposit locks funds for a period at a rate fixed at opening. The core tracks principal, maturity date, interest payment schedule and instructions for maturity: renew, pay out or move to another account. Early withdrawal applies a penalty that may reduce interest or principal. At maturity a batch job processes thousands of deposits on the same day. It is hard because rates for renewal are decided at that moment, customers often must be notified in advance, and penalties are regulated.",
    k: ["Automatic renewal versus payout by default: customers keep their money invested, but regulators may require explicit consent and prior notice.", "Penalty calculated in the product engine versus by staff: consistent and auditable, but complex cases like partial withdrawal need explicit rules."],
    p: ["Renewal at an expired rate card gives customers a rate the bank no longer offers.", "Maturity jobs run after cutoff and funds are unavailable on the contractual day."],
    v: "Open a deposit maturing next week, break it early and confirm the penalty matches the product rule, then let another mature and confirm funds or renewal follow the instruction on the contractual date.",
    dep: ["product-parameters", "interest-accrual", "business-calendar", "notices-letters"]
  },
  "loan-booking": {
    s: "Creates a loan account from an approved credit decision, capturing amount, rate, tenor, repayment terms, collateral links and the schedule, and disbursing funds.",
    d: "The origination system decides credit; the core books the resulting contract. Booking validates terms against product limits, creates the loan account with parameters, generates the initial schedule, links collateral and guarantors, and posts disbursement to the borrower's account or a third party. The boundary matters: the core must trust the decision but verify limits. The difficulty is the accuracy of the contract record, because everything later, including interest, arrears and reporting, derives from it.",
    k: ["Core as sole contract record versus origination system holding the master: one truth for servicing, but origination changes must be synchronized in.", "Disburse at booking versus on separate release conditions: simple, but conditions precedent such as registered security can be skipped."],
    p: ["Terms booked differ from the signed agreement because of a manual re-keying step.", "Disbursement is posted twice when the booking call is retried."],
    v: "Book a test loan from an approved decision, confirm the schedule's totals equal principal plus contractual interest, and that retrying the booking request creates no second loan or disbursement.",
    dep: ["account-master", "product-parameters", "amortization-schedules", "idempotency-dedup"]
  },
  "amortization-schedules": {
    s: "Generates and maintains the repayment schedule for a loan, splitting each installment into principal and interest according to the repayment method and contract terms.",
    d: "Methods include equal installments, equal principal, interest-only, balloon and custom plans. The schedule is computed from principal, rate, day count and dates, adjusted for holidays, and recomputed when the rate changes, a prepayment is made or terms are modified. Each installment becomes a due item. The hard parts are rounding so the schedule sums exactly, variable rates that change future installments, and regenerating consistently after partial prepayments.",
    k: ["Store the full schedule versus compute installments on demand: schedule is visible and stable, but must be rewritten on every change; computed values are always current but can differ from what was shown.", "Last-installment absorbs rounding versus spread across installments: simple and exact total, but the final payment looks odd."],
    p: ["A rate change regenerates the schedule from the wrong base, and installments no longer sum to the balance.", "A prepayment is applied to the schedule but the borrower's remaining term is not recalculated as agreed."],
    v: "Generate a thirty-year schedule, apply a prepayment and a rate change, and confirm the closing balance reaches exactly zero at the final installment and agrees with an independent calculation.",
    dep: ["day-count-conventions", "rate-tables-benchmarks", "business-calendar"]
  },
  "repayment-allocation": {
    s: "Decides how each incoming payment is split across fees, penalties, interest and principal, and across multiple overdue installments, following the contract's waterfall.",
    d: "A payment arrives and is applied in a defined order, for example costs, penalty interest, overdue interest, overdue principal, then current installment and finally any prepayment. Different products and jurisdictions require different orders. Partial payments, overpayments and payments from third parties must be handled. The allocation creates postings for each component. It is hard because the order materially changes what the borrower still owes and what is reported as past due, and disputes about allocation are common.",
    k: ["Configurable allocation waterfall versus a single fixed order: fits different laws and products, but every variant needs testing.", "Apply overpayment to future installments versus reduce principal: customers choose, but systems must support both and explain the effect."],
    p: ["Payment applied to current principal before overdue interest keeps the account looking healthier than it is.", "Allocation is computed again after a reversal and yields a different split than the original."],
    v: "Make a partial payment on a loan with overdue interest and principal and confirm each component is reduced in the contractual order, with arrears status and balances matching a hand calculation.",
    dep: ["amortization-schedules", "posting-engine", "arrears-delinquency"]
  },
  "drawdowns-and-limits": {
    s: "Manages revolving and committed credit lines: limits, drawn and undrawn amounts, drawdown requests, repayments that restore availability, and commitment fees.",
    d: "A facility has a total limit and may contain sub-limits for several products or borrowers. Each drawdown checks available headroom and may require conditions. Repayments free headroom. Limits can expire or be reduced. Exposure is aggregated by customer and group. The difficulty is that limits are checked concurrently across channels and accounts, so two simultaneous drawdowns must not both succeed beyond the limit, and nested limits create multi-level checks in the same transaction.",
    k: ["Limit check inside the posting transaction versus an advisory check beforehand: no overshoot under concurrency, but the limit record becomes a contention point.", "Limits held in the core versus a separate credit system: the core can enforce in real time, but synchronization with credit decisions is needed."],
    p: ["Concurrent drawdowns from two channels together exceed the facility limit.", "An expired limit still allows drawdowns because expiry is checked only in a nightly job."],
    v: "Submit simultaneous drawdowns that together exceed a limit and confirm only those within the limit succeed, with the drawn total never above the limit at any observed moment.",
    dep: ["account-concurrency-control", "loan-booking", "posting-engine"]
  },
  "overdraft-facilities": {
    s: "Allows an account to go below zero within an agreed or discretionary limit, charging interest and fees and applying rules for exceeding the limit.",
    d: "Arranged overdrafts have a limit and pricing agreed in advance; unarranged ones arise when payments exceed available funds and the bank chooses to pay. Available balance includes the limit. Interest accrues on the negative balance and fees apply per event or period. Regulations constrain pricing and require warnings. The challenge is deciding at posting time, often within milliseconds, whether to pay, and doing so consistently with limits, holds and the order in which items are processed.",
    k: ["Pay-or-return decision at posting time versus end of day: customers can use funds immediately, but intraday exposure must be controlled.", "Processing credits before debits within a day versus chronological order: fewer overdraft fees for customers, but a fairness and disclosure issue."],
    p: ["Item ordering changes how many overdraft fees are charged and draws regulatory complaints.", "Limit increases take effect in the channel before the core and payments are wrongly declined."],
    v: "Set an overdraft limit, post debits that cross zero and then the limit, and confirm the first are paid with interest and fee accrual and the one past the limit is declined, with available balance matching throughout.",
    dep: ["available-balance", "interest-accrual", "fee-assessment", "posting-engine"]
  },
  "arrears-delinquency": {
    s: "Tracks overdue amounts and days past due for each loan, moves accounts through delinquency stages and triggers penalties, notices and collections actions.",
    d: "When an installment is not paid by its due date, the amount moves to an overdue balance and a counter of days past due starts. Stage boundaries, such as thirty and ninety days, change penalty interest, notices, reporting classification and provisioning. Payments cure arrears according to the allocation order. It is difficult because the stage drives money and reporting: a one-day error can change a loan's classification and required provision, and cures that arrive late in the day affect the count.",
    k: ["Days past due computed in the nightly batch versus continuously: simpler, but intraday payments do not immediately cure an account's status.", "Count from oldest unpaid installment versus per installment: matches regulators' view, but loses detail needed for restructuring."],
    p: ["A payment posted on the due date after the batch cutoff still triggers a late notice.", "Days past due is reset by a small partial payment, hiding serious delinquency."],
    v: "Leave an installment unpaid across thirty and ninety days in a test calendar and confirm stage changes, penalties and notices fire on the correct dates, and a full cure returns the account to current.",
    dep: ["repayment-allocation", "eod-orchestrator", "penalty-charges", "notices-letters"]
  },
  "loan-restructuring": {
    s: "Changes the terms of an existing loan, such as extending tenor, reducing rate or capitalizing arrears, while keeping the history, accounting and regulatory treatment correct.",
    d: "Restructuring may be a reschedule, a payment holiday, a refinancing into a new loan or a forbearance arrangement. Each has different effects on the schedule, interest, classification and provisioning. The core records the change as an amendment with a reason and an effective date, regenerates the schedule and may reclassify the loan as restructured. It is hard because the same customer action can be treated differently by accounting rules depending on whether it is a modification or a new contract.",
    k: ["Amend the existing loan versus close and rebook: history stays continuous, but accounting may require derecognition and a new contract.", "Retrospective versus prospective change: fair to the customer, but replays interest and fees and changes already reported figures."],
    p: ["A payment holiday extends the term but accrued interest is not handled as agreed, so the final payment is wrong.", "Restructured loans are not flagged for reporting and are shown as performing."],
    v: "Reschedule a loan with arrears, confirm the new schedule starts from the effective date, arrears are treated as agreed, the loan carries a restructured flag, and the audit trail shows the approver.",
    dep: ["amortization-schedules", "arrears-delinquency", "maker-checker", "provisioning-impairment"]
  },
  "provisioning-impairment": {
    s: "Calculates the loss allowance each loan requires based on its stage, exposure and risk, and posts the changes to the ledger as an expense and a reserve.",
    d: "Accounting standards require banks to recognize expected losses. The component takes each loan's exposure, days past due, risk grade and collateral, applies rates or models by stage, and produces the required allowance. Differences from the prior period are posted. Inputs come from the core, outputs return to the ledger and to regulatory reports. The difficulty is the dependency on many data sources and models, and that small changes in stage assignment move large amounts of money.",
    k: ["Run in the core's batch versus in a dedicated risk engine: close to the data and consistent, but modeling is complex and often belongs to specialists.", "Collective versus individual assessment: scales to large portfolios, but large exposures need manual judgment and override."],
    p: ["Provisions calculated on stale exposure data understate losses at period end.", "Manual overrides are not recorded and the ledger no longer matches the model output."],
    v: "Move a test loan from current to ninety days past due and confirm the allowance increases to the policy amount, the ledger posts the expense and reserve, and the reconciliation to the model's output shows zero difference.",
    dep: ["arrears-delinquency", "double-entry-journals", "regulatory-data-mart"]
  },
});
