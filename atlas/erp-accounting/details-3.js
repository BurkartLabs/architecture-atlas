// Details for the ERP & accounting plate, part 3: account structure, ledger, currencies and entities, tax.
ATLAS.details("erp-accounting", {
  "chart-of-accounts": {
    s: "The ordered list of ledger accounts, each with a number, name, type and rules, that defines every category in which the company records its financial position and results.",
    d: "Accounts are grouped into assets, liabilities, equity, income and expense, usually in a numbering scheme with ranges and parents for rollups. Each account carries flags: posting allowed, control account, currency restrictions, required dimensions, tax relevance and statement mapping. Group and local charts may coexist with mappings between them. Design is hard because too few accounts hide information and too many make entry error-prone, and changes after history exists affect every report.",
    k: ["Few accounts with many dimensions versus many accounts: dimensions keep the chart short and flexible, while rich account numbers are easier for people to read and for auditors to follow.", "One global chart versus a chart per entity with mapping: a single chart makes consolidation trivial and forces local needs into dimensions, while local charts fit statutory rules and require maintained mappings."],
    p: ["Reusing an old account number for a new purpose mixes histories and corrupts comparatives.", "An unmapped account is created locally, and consolidated statements silently omit it."],
    v: "Add an account, post to it, and confirm it appears in the trial balance and in the statement line it was mapped to. Block it and confirm further posting is refused while history remains.",
    dep: ["account-types","legal-entities"]
  },
  "account-types": {
    s: "The behavior attached to an account class: normal balance side, whether it closes to retained earnings, whether it is monetary, a control account, or revalued, and which statements include it.",
    d: "Account type decides how balances are signed, presented and carried across year end. Income and expense accounts are zeroed into retained earnings at year end; balance sheet accounts carry forward. Monetary accounts are revalued at period end, nonmonetary ones are not. Control accounts accept only subledger postings. Getting these rules wrong produces a ledger that balances and still reports the wrong things, which makes the problem hard to detect.",
    k: ["Rules on the account type versus on each account: type-level rules are consistent, while per-account flags handle exceptions and invite drift.", "Signed balances stored positive for debit versus separate debit and credit columns: separate columns match accounting practice and avoid sign errors, while signed amounts simplify arithmetic."],
    p: ["A contra account typed as a normal asset flips its sign in the balance sheet.", "An income account flagged as a balance sheet account never closes at year end, and profit accumulates in it."],
    v: "Post revenue and expense, run the year-end close in a test ledger, and confirm income and expense balances are zero, retained earnings equals net profit, and balance sheet accounts carry forward unchanged.",
    dep: ["chart-of-accounts"]
  },
  "analytic-dimensions": {
    s: "Tags such as department, cost center, project, product line and region attached to ledger lines, enabling reporting along any combination without multiplying accounts.",
    d: "A dimension is a set of values with its own hierarchy and validity. Each ledger line carries values per dimension, and accounts can require or forbid certain ones. Combinations can be restricted to valid sets. Balances by dimension are stored or computed for reporting. The challenge is cardinality: too many dimensions and values make balances sparse and slow, and any dimension added later cannot be applied to history unless entries are restated.",
    k: ["Fixed dimension columns versus open attribute sets: fixed columns index and aggregate quickly, while open sets are flexible and harder to query and validate.", "Dimensions mandatory on posting versus optional: mandatory rules give complete reporting and make entry harder, while optional ones leave blanks that analysts must guess about."],
    p: ["Blank dimension values accumulate and management reports show a large unassigned bucket.", "A department reorganization is applied to the dimension in place and silently restates last year's reports."],
    v: "Post expenses with required cost center and project, then report by each and confirm both views sum to the same account total. Attempt a posting with an invalid combination and confirm it is rejected.",
    dep: ["chart-of-accounts"]
  },
  "fiscal-calendars": {
    s: "Defines the company's fiscal years and periods, including adjustment periods, with each period's status controlling whether postings are allowed.",
    d: "A calendar lists periods with start and end dates, a year, and often a thirteenth period for adjustments. Periods can be open, soft closed for some modules, or hard closed. Different ledgers or entities may use different calendars, such as a statutory year and a tax year. Posting dates map to periods through this table. Complications are fifty-two-week years, changes in year end, and alignment between operational and financial calendars.",
    k: ["Calendar per ledger versus one company-wide: per-ledger fits differing statutory years and complicates consolidation, while one calendar is simple and forces compromises.", "Adjustment periods versus posting adjustments into the last regular period: adjustment periods keep late entries visible, at the cost of reports that must decide whether to include them."],
    p: ["A date falls outside every defined period after a year-end change, and postings are rejected on the first day of January.", "Different calendars between subsidiaries put an entry in different months, and intercompany balances never agree."],
    v: "Post one entry on the last day of a period and one on the first day of the next, and confirm each lands in its own period and that posting into a hard-closed period is refused.",
    dep: ["legal-entities"]
  },
  "parallel-ledgers": {
    s: "Several complete sets of books over the same transactions, such as statutory, group and tax, each with its own accounting rules, currency, calendar and adjustments.",
    d: "A transaction posts once as an event and produces entries in each ledger according to that ledger's rules. A leading ledger carries the main flow; additional ledgers take the same entries or only adjustments. Differences, such as depreciation methods or lease treatment, show up as ledger-specific postings. The hard part is keeping ledgers reconcilable, since each may use different accounts and valuation, and reporting must say which ledger a number comes from.",
    k: ["Full duplicate postings per ledger versus delta ledgers holding only differences: full postings are standalone and multiply storage, while deltas are compact and need the base ledger to be read together.", "Rules per ledger configured centrally versus in each module: central rules are consistent, while module rules are close to the process and easily diverge."],
    p: ["A manual adjustment posted to one ledger and not the other makes the difference unexplainable at the next audit.", "Reports that do not state the ledger mix numbers from two accounting standards."],
    v: "Post one asset acquisition and depreciation under two methods and confirm each ledger has its own expense, the base entries agree, and the difference is traceable to the method.",
    dep: ["chart-of-accounts","fiscal-calendars","posting-profiles"]
  },
  "posting-profiles": {
    s: "Configuration that maps a business event, by document type, item or customer group, to the ledger accounts and dimensions it posts to, determining the debits and credits.",
    d: "When a subledger document posts, the posting engine looks up an account for each role in the entry, such as receivable, revenue, tax, discount or variance, using keys like customer group, item group and entity. Missing mappings fall back to defaults or stop the posting. The configuration is the translation layer between operations and finance, and the most common cause of wrong books: an unmapped combination posts somewhere nobody expected.",
    k: ["Fall back to a default account versus fail the posting: defaults keep the process running and bury errors in a catch-all, while failing is visible and stops operations until fixed.", "Mapping by group tables versus rule expressions: tables are easy to audit and grow combinatorially, while expressions are compact and harder to review."],
    p: ["A new item group has no mapping, and a month of sales post to a suspense account.", "A mapping changed mid-period applies to documents posted later in the same period, splitting similar sales across accounts."],
    v: "Post a sale for each customer and item group in a test entity and confirm every journal line uses the account documented in the mapping table, with no postings to default or suspense accounts.",
    dep: ["chart-of-accounts","analytic-dimensions"]
  },
  "journal-entries": {
    s: "The unit of accounting: a dated, balanced set of debit and credit lines with a source, description and dimensions, entered manually or generated by a subledger.",
    d: "A journal has a header, with date, period, ledger, source, currency and status, and lines, each with account, amount, side and dimensions. It is created as a draft, validated for balance, period and account rules, approved if required, and posted. Posted journals are immutable. Manual entries are the riskiest because they bypass subledger controls, so they require reasons, limits and review. Volume is the other problem: operational events can create millions of lines a day.",
    k: ["Header and lines versus a flat transaction per line: header-and-lines keeps the balance rule checkable per document, while flat records scale well and make the balance check an aggregation.", "Draft approval before posting versus post then review: pre-approval prevents errors from reaching the books and delays close, while after-the-fact review is fast and relies on reversals."],
    p: ["A manual journal posted to a control account makes the subledger and ledger disagree.", "Free-text descriptions with no reason code leave auditors unable to tell why an entry was made."],
    v: "Attempt to post a journal where debits and credits differ by one cent and confirm rejection. Post a balanced one and confirm it appears on the trial balance and cannot be edited afterward.",
    dep: ["chart-of-accounts","fiscal-calendars","analytic-dimensions","approval-workflows"]
  },
  "posting-engine": {
    s: "The service that turns business documents into balanced journal entries, resolving accounts, dimensions, currencies and periods, and writing them atomically with the document's status change.",
    d: "On posting, it reads the document, applies the posting profiles, computes amounts in transaction and ledger currencies, assigns the period, validates, and writes the journal lines in the same database transaction that marks the document posted. For several ledgers it writes one set per ledger. It must be deterministic and idempotent: running twice for one document yields one journal. The hard part is throughput, and correctness when posting fails midway.",
    k: ["Synchronous posting in the user's transaction versus asynchronous posting from a queue: synchronous gives immediate consistency and slows users, while async scales and leaves a window where documents are posted but not in the ledger.", "Reject an unbalanced journal versus auto-balance with a rounding line: rejection exposes logic errors, while auto-balancing keeps work flowing and can mask real defects."],
    p: ["A crash between writing the document status and the journal lines leaves a posted document with no ledger effect.", "A retry after timeout posts the same document twice because the posting lacked a unique key on the source."],
    v: "Kill the service mid-posting during a test run, restart, and confirm every document either has a complete balanced journal and posted status or neither, and no document has two journals.",
    dep: ["posting-profiles","journal-entries","dual-currency-amounts","transactional-store","fiscal-calendars"]
  },
  "general-ledger": {
    s: "The book of record: the complete set of posted journal lines, from which every account balance, statement and audit query derives.",
    d: "The ledger is the append-only collection of posted lines, indexed by account, period, ledger, entity and dimensions. Balances at any date are sums of lines up to it. It accepts only writes from the posting engine, and no update or delete is allowed, since corrections are new entries. It is hard because of size, often billions of lines, and because many reports need point-in-time balances, so the design trades between computing from lines and maintaining aggregates.",
    k: ["Lines as the source of truth with derived balances versus balances as primary state: lines make every figure explainable and recomputable, while stored balances answer faster and can drift.", "Partition by period versus by entity: period partitions make close and archival easy, while entity partitions isolate tenants and shard well."],
    p: ["Direct database updates to fix a number bypass the journals, and balances stop matching the lines.", "An index missing for a common report query turns the trial balance into an hours-long scan."],
    v: "Sum all posted lines for an account up to a date and compare with the balance the trial balance reports for that date; confirm they are identical for every account and that total debits equal total credits.",
    dep: ["journal-entries","append-only-storage","chart-of-accounts"]
  },
  "balance-aggregates": {
    s: "Precomputed totals by account, period, ledger and dimension, maintained as lines post, so reports and drill-downs read a few rows instead of scanning the ledger.",
    d: "Each posting increments aggregate rows for the keys it touches, in the same transaction or by a trailing process. Reports read period movements and opening balances from them. A rebuild routine recomputes them from lines to prove or repair them. Aggregates by many dimensions explode combinatorially, so designs limit the keys or compute others on demand. Concurrent postings to the same hot account, such as cash, create contention on single rows.",
    k: ["Update aggregates in the posting transaction versus asynchronously: in-transaction is always consistent and creates lock contention on hot accounts, while async is smooth and briefly stale.", "Store all dimension combinations versus only the common ones: all combinations make every report fast and consume space, while a chosen set makes unusual queries slow."],
    p: ["A failed async update leaves aggregates behind the lines, and two reports disagree until someone rebuilds.", "Hot-row contention on one account serializes all postings during the end-of-month rush."],
    v: "Run the rebuild routine into a scratch table and compare it with live aggregates, row for row; confirm zero differences, and that postings during the rebuild are reflected afterward.",
    dep: ["general-ledger","posting-engine","analytic-dimensions","batch-scheduler"]
  },
  "recurring-and-reversing": {
    s: "Entries created from templates on a schedule, such as monthly rent accruals, and automatic reversals that cancel an accrual in the next period.",
    d: "A recurring template defines lines, frequency, start and end dates, and variable amounts. The scheduler generates journals into drafts or posts them. A reversing entry copies a journal with debits and credits swapped, dated the first day of the next period, so accruals do not double count when the real invoice arrives. It is simple in concept and error-prone in practice: end dates, skipped periods, and reversals of entries that were later adjusted.",
    k: ["Auto-post recurring entries versus create drafts for review: auto-posting is reliable and carries stale amounts forward, while drafts are reviewed and depend on someone remembering to post.", "Auto-reverse accruals versus manual clearance: auto-reversal prevents double counting and surprises when the actual cost differs, while manual clearance needs diligence."],
    p: ["An accrual flagged to reverse is edited after posting, and the reversal cancels a different amount.", "A recurring entry continues after the contract ended and quietly overstates expense."],
    v: "Post an accrual with auto-reverse in March and confirm April's first day contains its exact mirror, and that March and April net to the actual invoice once it is posted.",
    dep: ["journal-entries","batch-scheduler","fiscal-calendars"]
  },
  "allocations": {
    s: "Rules that spread an amount from one account or cost pool across others using a driver such as headcount, revenue or square meters, producing the balancing journals.",
    d: "An allocation rule names a source, a set of receivers, a basis and a sequence. At run time the engine reads the source balance and driver statistics, computes shares, and posts offsetting lines. Allocations can be stepped, where later pools receive earlier ones, or reciprocal. Hard parts are rounding so shares sum exactly, driver data that arrives late, and runs that must be repeatable: running twice must replace, not add.",
    k: ["Allocate in the ledger versus in a reporting layer: ledger allocations are auditable and clutter the books with transfers, while reporting-layer allocations keep the ledger pure and are less visible.", "Static percentages versus statistical drivers: percentages are stable and drift from reality, while drivers track actual use and need dependable data."],
    p: ["A rerun of an allocation adds a second set of entries instead of replacing the first.", "Driver data for the last week is missing and the shares favor departments with complete records."],
    v: "Run an allocation of a known pool across three departments with fixed drivers and confirm the receiving amounts sum to the pool exactly, the source is cleared, and a second run changes nothing.",
    dep: ["posting-engine","analytic-dimensions","journal-entries","batch-scheduler"]
  },
  "subledger-reconciliation": {
    s: "The check that each subledger's total equals its control account in the general ledger, with a report of any difference by document.",
    d: "For receivables, payables, inventory and assets, the subledger total at a date is compared with the ledger balance of its control account. Differences are traced to documents that posted to one side only, were back-dated into another period, or were revalued differently. Good systems prevent divergence structurally, by forbidding manual postings to control accounts and posting both sides in one transaction, and use the reconciliation as a detector.",
    k: ["Continuous reconciliation versus at period end: continuous checks find breaks within hours and cost a scheduled job, while period-end checks are cheap and find problems when the close is waiting.", "Prevent divergence structurally versus detect it: prevention removes whole classes of error and makes some corrections awkward, while detection allows flexibility and needs vigilance."],
    p: ["A tolerance that hides small differences lets a recurring one-cent error grow into a material misstatement.", "Reconciling at today's date and not the period end gives numbers that cannot be reproduced for the auditor."],
    v: "Run the reconciliation for each control account at period end and confirm a zero difference, then force a one-sided posting in a test ledger and confirm the report names the document.",
    dep: ["receivables-ledger","payables-ledger","general-ledger","stock-ledger"]
  },
  "currencies-and-rates": {
    s: "The catalog of currencies with their decimal places and the tables of exchange rates by type and date, such as spot, average and closing, that all conversions draw from.",
    d: "Each currency has a code, minor unit exponent and rounding rules. Rates are stored per pair, type and effective date, loaded from a feed or entered by treasury, and may be inverted or triangulated through a base currency. Lookups return the latest rate on or before a date. Hard parts include missing rates for weekends or holidays, rate type choice, the number of decimals kept, and controlling who may change a rate that revalues the whole balance sheet.",
    k: ["Direct pair rates versus triangulation through one base: direct pairs are exact and numerous, while triangulation needs few rates and compounds rounding.", "Automated feed versus manually entered rates: a feed is timely and needs validation for bad data, while manual entry is controlled and often late."],
    p: ["A feed delivers a rate off by a factor of one hundred, and every foreign transaction that day is misstated.", "Rate lookup with no fallback fails postings on public holidays."],
    v: "Request conversions for a weekend date and a date with no rate and confirm the rule used (prior day or error) matches documented policy, and that a rate edit is logged with user and time.",
    dep: ["audit-trail","decimal-arithmetic"]
  },
  "dual-currency-amounts": {
    s: "Storage of each amount in the transaction's own currency and the ledger's currency, and often a group currency, so reports in any of them add up without reconversion.",
    d: "Every ledger line holds the original amount, the converted amount in each ledger currency, and the rate used. Conversion happens once at posting. Balancing is enforced in each currency separately, which means a journal balanced in the transaction currency may need a rounding line in the ledger currency. Aggregated reports sum stored amounts and never convert the sum. The difficulty is maintaining the equality across currencies when postings are partial, reversed or revalued.",
    k: ["Store converted amounts at posting versus convert at reporting: storing makes history stable and reports fast, while reporting-time conversion is flexible and gives different numbers on different days.", "Balance per currency versus only in the ledger currency: per-currency balance is rigorous and generates rounding lines, while ledger-only balance is simpler and can hide errors."],
    p: ["Reversal posted at today's rate instead of the original line's rate leaves a spurious exchange difference.", "Summing amounts across currencies in a report adds euros to dollars with no conversion at all."],
    v: "Post a foreign invoice and its reversal and confirm the original-currency and ledger-currency amounts both net to zero on every account, with no residual exchange difference.",
    dep: ["currencies-and-rates","decimal-arithmetic"]
  },
  "fx-revaluation": {
    s: "Periodically restates open foreign currency balances and monetary accounts at the closing rate, posting unrealized gains and losses and reversing them next period.",
    d: "At period end, the engine selects open items and monetary balances in foreign currency, compares carrying value with value at the closing rate, and posts the difference to unrealized gain or loss accounts, per ledger and often per dimension. Many setups reverse the revaluation on the first day of the next period, so that realized amounts are computed at settlement from original cost. The hard parts are doing it per open item, handling prepayments and advances, and avoiding double revaluation.",
    k: ["Revalue open items individually versus account balances: item-level is precise and heavy, while balance-level is simple and mishandles items with mixed rates.", "Reverse at the next period start versus carry forward: reversing is simple to reason about and doubles the postings, while carry-forward needs cumulative tracking."],
    p: ["Revaluation run before final postings leaves late items at old rates until the next period.", "Realized gain at settlement is computed from the revalued amount instead of the original, double counting the unrealized part."],
    v: "Hold a foreign invoice across a period end with a changed rate, run revaluation, then settle it and confirm total gain or loss equals the settlement amount minus original cost, with no leftover unrealized balance.",
    dep: ["currencies-and-rates","dual-currency-amounts","receivables-ledger","payables-ledger","posting-engine"]
  },
  "legal-entities": {
    s: "The hierarchy of companies, branches and business units that own books, each with its own ledger, currency, calendar, tax registrations and users.",
    d: "A legal entity is the basic unit of statutory reporting and tax. Its record defines currency, chart, calendar, address, registration numbers and default accounts. Below it may be business units for management reporting; above it, a hierarchy for consolidation with ownership percentages. Nearly every table is scoped by entity, and security follows it. It is hard because group structures change through acquisitions and mergers, and history must stay attributable to the entity that existed.",
    k: ["Entity as a hard partition of data versus a dimension: partition gives clean legal separation and security, while a dimension makes cross-entity reporting easy and risks mixing legal books.", "Ownership hierarchy versus flat list: a hierarchy supports consolidation with minorities and costs maintenance, while a flat list is simple and ignores structure."],
    p: ["A transaction posted without an entity scope lands in the default entity and appears in the wrong statutory books.", "Merging two entities in the system rewrites history and breaks comparison with filed accounts."],
    v: "Create two entities with different currencies, post in each, and confirm a user limited to one entity cannot see the other's ledger, while the consolidating user sees both through the hierarchy.",
    dep: ["chart-of-accounts","identity-and-roles"]
  },
  "intercompany": {
    s: "Handles trade and loans between entities of the same group: matching sales and purchases, creating mirror documents and keeping both sides in agreement for elimination.",
    d: "When one entity sells to another, the system creates an order, invoice and receipt on both sides, linked by an intercompany reference, with the same amounts in the transaction currency. Balances sit in intercompany accounts by partner. Differences from timing, rates or disputes must be found and resolved before close. The hard part is that two entities, often in different systems and time zones, must record the same event in the same period, and transfer pricing and tax rules apply.",
    k: ["Automatic mirror document in the counterparty versus manual entry on both sides: mirrors guarantee agreement and surprise the receiving entity, while manual entry respects its autonomy and drifts.", "Settle through a central netting account versus bilaterally: netting reduces payments and adds a clearing process, while bilateral settlement is simple and expensive."],
    p: ["One side posts in March and the other in April, and the intercompany difference is never explained.", "Currency differences on the two sides are booked in different entities and do not net on consolidation."],
    v: "Run an intercompany sale across two entities and confirm both sides show identical amounts and reference, and the partner balance report shows zero difference at period end.",
    dep: ["legal-entities","dual-currency-amounts","journal-entries","fiscal-calendars"]
  },
  "currency-translation": {
    s: "Converts a subsidiary's statements from its functional currency into the group's reporting currency, using closing rates for the balance sheet, average rates for results and recording the equity difference.",
    d: "Assets and liabilities translate at the closing rate, income and expenses at average or transaction rates, and equity at historical rates. The difference between these goes to a cumulative translation adjustment in equity, not to profit. Translation is run in the consolidation process on trial balances, not on transactions. It is hard because rate choice by account is a policy, equity history must be preserved, and hyperinflationary economies need restatement.",
    k: ["Translate from balances versus from transactions: balance translation is simple and approximates results, while transaction translation is accurate and heavier and needs all lines.", "Average rate per month versus per day: monthly averages are easy to audit and less precise, while daily rates track events and need more data."],
    p: ["Rates mapped incorrectly by account type send translation differences through profit and loss.", "Opening equity is retranslated at current rates, and the cumulative adjustment no longer rolls forward."],
    v: "Translate a subsidiary's trial balance and confirm the translated balance sheet balances, with the cumulative translation adjustment equal to the difference computed by hand from the three rate types.",
    dep: ["currencies-and-rates","consolidation","account-types"]
  },
  "tax-codes": {
    s: "The set of tax rates, jurisdictions, categories and rules by effective date, with the accounts and reporting boxes each one posts to.",
    d: "A tax code defines a rate or formula, its type (sales, purchase, withholding, reverse charge), its jurisdiction, effective dates, whether it is recoverable, the ledger accounts for collected and paid amounts, and the return box it feeds. Product and party categories determine which code applies. The hard part is change and scale: rates, rules and boundaries change often, and a single country can have thousands of local jurisdictions.",
    k: ["Maintain tax content in-house versus subscribe to an external feed: in-house control is exact and costly to keep current, while a feed is current and puts a dependency inside every invoice.", "One code per rate versus codes by combination of rate and treatment: simple lists are readable, while treatment-aware codes make reporting direct."],
    p: ["A rate change applied by editing the existing code rewrites tax on past documents instead of taking effect from its date.", "A code missing its return box reaches the filing as an unreported amount."],
    v: "Change a rate with a future effective date and confirm invoices dated before use the old rate and later ones the new, and that each code posts to its configured account and return box.",
    dep: ["chart-of-accounts","legal-entities"]
  },
  "tax-determination": {
    s: "Chooses which tax applies to each document line from the seller, buyer, product, place of supply, date and exemption status, then computes the tax amount.",
    d: "Inputs are the ship-from and ship-to locations, party registrations, item tax category and transaction type. A rule engine or external service returns codes and rates, then amounts are computed per line, with rounding at line or document level as the jurisdiction requires. Tax is stored on the document and posted separately. It is hard because place-of-supply rules differ between goods and services and across borders, and an incorrect determination is a legal error on an issued invoice.",
    k: ["Rule tables in the ERP versus an external calculation service: tables are controlled and need constant upkeep, while a service tracks law changes and adds latency and an outage dependency.", "Round per line versus per document: each follows different jurisdictions, and choosing the wrong one gives totals that differ from the authority's."],
    p: ["Missing a customer's exemption certificate charges tax that must be refunded, or omits it and creates a liability.", "A timeout from an external service falls back to zero tax and silently under-bills."],
    v: "Issue invoices for the same product to buyers in two jurisdictions and to an exempt buyer, and confirm each gets the right code, rate and amount, and that the tax service timeout blocks posting instead of defaulting to zero.",
    dep: ["tax-codes","customer-master","vendor-master","item-master","decimal-arithmetic"]
  },
  "tax-ledger": {
    s: "A record of every tax amount collected and paid, by code, jurisdiction and period, forming the liability or refund to report and reconciling to tax accounts in the ledger.",
    d: "Each posted document writes tax lines with base amount, tax amount, code, direction and period of reporting. Settlement periods group them, and clearing entries move balances from collected and paid accounts to a liability account at filing. Adjustments cover bad debts, credit notes and partially recoverable input tax. The challenge is timing: some regimes tax on invoice, others on payment, and the ledger must report each document in the right period.",
    k: ["Invoice-basis versus cash-basis tax point: invoice basis is simple and ties to the documents, while cash basis follows payments and needs tracking per settlement.", "Separate tax subledger versus tax lines only on the ledger: a subledger supports filing logic and needs reconciling, while ledger-only is leaner and weak for reporting."],
    p: ["A credit note posted in a later period than its invoice reduces tax in the wrong return.", "Tax accounts used for manual journals drift away from the tax subledger."],
    v: "Total the tax subledger for a period by code and compare it with the corresponding tax account balances; confirm equality, and that each amount traces to its documents.",
    dep: ["tax-codes","general-ledger","fiscal-calendars","subledger-reconciliation"]
  },
  "withholding-and-exemptions": {
    s: "Deducts tax at the source from supplier payments, such as for services or non-residents, and records exemption certificates that remove or reduce taxes for particular parties.",
    d: "Rules by payee type, payment category, treaty and threshold determine a withholding rate. At payment or invoice posting, the amount is deducted, posted to a liability, and later remitted to the authority with a certificate to the payee. Exemption certificates have validity dates and scopes. It is hard because thresholds accumulate over a year, treaty rates need documents, and mistakes are the payer's liability.",
    k: ["Withhold at invoice versus at payment: invoice-time withholding is early and simple to report, while payment-time follows many laws and needs partial-payment handling.", "Certificate stored as an attachment versus structured with validity dates: attachments are easy and cannot be enforced, while structured records allow automatic checks and need data entry."],
    p: ["An expired exemption certificate still removes tax because validity dates were not checked.", "Annual thresholds are tracked per entity when the law counts per payer group."],
    v: "Pay a supplier above and below a cumulative threshold and confirm withholding starts at the crossing, the net payment is correct, and the withheld amount appears in the liability account and certificate list.",
    dep: ["tax-codes","payables-ledger","payment-runs","vendor-master"]
  },
  "tax-returns": {
    s: "Compiles tax ledger data into the periodic returns and listings that authorities require, in their formats, and records filing, payment and acknowledgment.",
    d: "A return definition maps tax codes and bases to boxes and computes totals. The system assembles the figures for a period, lists the underlying documents for review, adjusts for corrections, and exports the form or sends it electronically. Submission produces an acknowledgment and a payment or refund claim. It is hard because formats and deadlines vary by country and change often, and a filing must tie exactly to the ledger and be reproducible years later.",
    k: ["Direct electronic filing versus preparing a file for a portal upload: direct filing is efficient and requires authority integration and credentials, while upload is simple and manual.", "Lock the period after filing versus allow later corrections in the open period: locking preserves what was filed, and corrections are then adjustments in a later return."],
    p: ["A late posting changes the figures after the return was prepared, so the filed amount differs from the ledger.", "A rejected submission is corrected by hand and the system keeps the original figures as the record."],
    v: "Prepare a return for a closed period, compare each box total with the tax ledger and its listed documents, and confirm that submission stores the filed copy and the authority's acknowledgment reference.",
    dep: ["tax-ledger","period-controls","edi-and-einvoicing","audit-trail"]
  },
}
);
