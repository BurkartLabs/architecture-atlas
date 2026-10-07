// Details for the core banking plate, part 4: end-of-day, statements, reporting, audit.
ATLAS.details("core-banking", {
  "business-calendar": {
    s: "Defines which days are business days for each currency, country and scheme, and drives value dates, cutoffs, due dates and the end-of-day schedule.",
    d: "Calendars list holidays and weekend rules for each jurisdiction and payment scheme, and include special closures announced late. Services ask for the next business day, add business days, or test whether a date is a working day. The bank's own processing date comes from here. It is hard because calendars differ across currencies for a single transaction, change with short notice, and an error shifts interest, payment settlement and loan due dates for everyone.",
    k: ["Central calendar service versus per-module tables: one correction applies everywhere, but it becomes a dependency of nearly every operation.", "Pre-generated years of dates versus rules computed on demand: quick lookups, but movable holidays need yearly maintenance."],
    p: ["A newly announced holiday is not entered, and payments are routed to a closed scheme.", "Two modules hold different calendars and disagree on a due date."],
    v: "Add a one-off holiday and confirm payment settlement dates, loan due dates and the end-of-day schedule all move consistently, with the calendar change visible in the audit trail.",
    dep: ["transactional-store"]
  },
  "eod-orchestrator": {
    s: "Runs the ordered end-of-day sequence: closing the business date, running accruals, fees and reports, then opening the next date, with dependencies, monitoring and controlled reruns.",
    d: "It reads a dependency graph of jobs, starts each when predecessors finish, tracks status and elapsed time, and halts or alerts on failure. Operators can skip, rerun or hold steps within rules. Steps include cutting off intake, snapshotting balances, accruals, fee runs, statements, ledger close and extracts for downstream systems. The hard part is the time box and failure handling: a failure at step forty of sixty must be fixed and resumed without redoing completed steps or breaking consistency.",
    k: ["Dependency-graph scheduling versus a fixed linear sequence: more parallelism and a shorter window, but order-sensitive bugs appear.", "Stop on first failure versus continue independent branches: more done by morning, but a failed step may leave later steps working on incomplete data."],
    p: ["The batch overruns its window and online channels open with the previous day's data.", "A manual rerun of a posted step is allowed and posts it twice."],
    v: "Run the full end-of-day in a test with a forced failure in one job, fix and resume it, and confirm every step ran exactly once, the next date opened, and closing balances match an uninterrupted run.",
    dep: ["batch-job-framework", "business-calendar", "day-rollover", "checkpoint-restart"]
  },
  "day-rollover": {
    s: "Advances the system's business date, freezing the closing state of the old day and opening the new one so later postings belong to the correct period.",
    d: "At rollover the system stops accepting postings for the old date, takes the closing balances snapshot, marks the date closed and sets the new current date. In continuous systems rollover is a logical cut rather than a stop, with in-flight transactions assigned by rule. Interest, statements and reports use the snapshot. It is hard because the cut must be atomic across all components, since a posting that lands on the wrong side changes both days' balances.",
    k: ["Hard stop with an offline window versus a rolling logical cutover: simple and safe, but unavailable for the window; rolling gives 24-hour service but needs dual-date handling.", "Single cutover for the whole bank versus per-entity: consistent books, but entities in other time zones lose operating hours."],
    p: ["A transaction timestamped before cutover but committed after lands on the new day and breaks the closing snapshot.", "A component misses the date change and keeps posting to yesterday."],
    v: "Post transactions continuously across rollover in a test and confirm every transaction lands on the date assigned by the cutoff rule, and the closing snapshot of the old date never changes afterward.",
    dep: ["business-calendar", "balance-model", "online-during-batch"]
  },
  "batch-job-framework": {
    s: "The shared runtime for large scheduled jobs: it partitions work, runs it in parallel, tracks progress and enforces common rules for logging, errors and resource use.",
    d: "A job is defined as a reader of accounts or files, a processor, and a writer, run in chunks inside transactions. The framework splits the population into ranges, runs partitions across workers, records chunk progress and publishes metrics. Common behaviors, such as retry, skip policy and throttling to protect online traffic, are provided once. The challenge is exactness at volume: hundreds of millions of items must each be processed once, even when workers die and ranges are reassigned.",
    k: ["Chunked transactions versus one transaction per job: bounded locks and restartable progress, but partial effects are visible between chunks.", "Partitioning by account range versus by hash: simple restart by range, but uneven load if accounts cluster."],
    p: ["A skipped item is logged and never revisited, and the customer is silently missed.", "A batch that is not throttled starves online posting of database capacity."],
    v: "Run a job over ten million test accounts, kill half the workers midway, and confirm all accounts are processed exactly once, with the item counts on completion equal to the population.",
    dep: ["transactional-store", "checkpoint-restart", "partitioning-sharding"]
  },
  "accrual-fee-runs": {
    s: "The scheduled jobs that perform each day's or period's interest accrual, fee assessment, charges and reclassifications across all accounts.",
    d: "Runs read each account's closing state, determine what is due under its product, and post accruals, fees or reclassifications through the posting engine. Some run daily, others at month, quarter or year end, and some depend on others: fees assume interest was accrued. They are the largest consumers of the batch window. The hard part is idempotency and ordering: each run must be safe to repeat, produce the same results from the same inputs and correctly handle accounts that changed state during the day.",
    k: ["Daily incremental runs versus end-of-period catch-up: smooth load and instant visibility, but more jobs to monitor; catch-up is simple but creates a month-end peak.", "Post through the normal engine versus bulk write: all rules and audit apply, but slower than direct inserts."],
    p: ["A run starts before the previous day's transactions have all posted and misses them.", "Accounts that closed during the day still get accruals and fees."],
    v: "Run the day's accruals and fees twice on a test copy and confirm identical results on the second run with no additional postings, and totals match an independent recomputation for a random account sample.",
    dep: ["interest-accrual", "fee-assessment", "batch-job-framework", "posting-engine"]
  },
  "checkpoint-restart": {
    s: "Records progress as work is done so a failed job or process can resume from the last committed point, without repeating or skipping any item.",
    d: "Jobs write a checkpoint, such as the last account processed, in the same transaction as the work it covers. On restart the job reads it and continues. For streams and files the checkpoint is an offset or sequence number. Combined with idempotent postings, a crash at any instant leaves a state from which resumption is safe. It is hard because the checkpoint and the effect must commit together, and because external effects such as sending a file cannot be rolled back.",
    k: ["Checkpoint in the same database transaction as the work versus a separate store: atomic and simple, but couples progress tracking to the main database.", "Frequent small checkpoints versus rare large ones: little rework after failure, but more write overhead."],
    p: ["A checkpoint saved before its work commits causes the job to skip items after a crash.", "Restarting a job that sent external messages resends them all."],
    v: "Kill a running job at random points a hundred times and confirm each restart completes with every item processed exactly once, verified against a precomputed expected result.",
    dep: ["transactional-store", "idempotency-dedup"]
  },
  "online-during-batch": {
    s: "Allows customer-facing posting and inquiry to continue while heavy batch jobs run, by controlling locks, data versions and the meaning of today's balance.",
    d: "Rather than a nightly outage, modern cores keep accepting transactions during batch. Batch jobs read a consistent snapshot as of the cutoff and write adjustments that do not block live postings. Postings arriving during batch are assigned to the correct date and may require later adjustments to accruals. Resource governance limits batch I/O. It is hard because two kinds of work touch the same accounts, and every shortcut that avoids locking risks a subtle inconsistency.",
    k: ["Snapshot reads for batch versus locking accounts: no blocking of customers, but accruals can lag changes made after the snapshot and need adjustment.", "Separate resource pools for batch and online versus shared: protects customer latency, but leaves capacity idle at times."],
    p: ["A batch job holding long locks stalls payments during the morning peak.", "Postings during rollover are counted in neither day's accrual."],
    v: "Run a full batch while sending peak payment traffic and confirm online response times stay within target, no postings are lost or double counted, and next-day balances reconcile.",
    dep: ["day-rollover", "account-concurrency-control", "capacity-performance"]
  },
  "statement-generation": {
    s: "Builds the periodic statement for each account from its entries and balances, with opening and closing balances, running totals and required legal text.",
    d: "At the statement date a job reads the period's entries from the history store, orders them, computes opening, closing and subtotals, and renders them into a document or data set by template and language. Requirements vary by product and country: mandatory disclosures, interest summaries and fee itemization. The statement must equal the ledger exactly and be reproducible later. Scale is the problem, since millions are produced in a short window, as is correct handling of corrections after the cutoff.",
    k: ["Generate from stored entries as at the cutoff versus from live data: reproducible statements, but need a consistent snapshot per account.", "Template-driven rendering versus coded layouts: marketing and compliance update text without release, but complex layouts are limited."],
    p: ["A late backdated posting changes balances after the statement was issued, and the next opening balance no longer matches.", "Statements are rendered with an old template that lacks a newly mandatory disclosure."],
    v: "Generate statements for a month, then check for a sample that opening plus entries equals closing, the closing balance matches the ledger, and next month's opening equals this month's closing.",
    dep: ["transaction-history-store", "balance-model", "eod-orchestrator"]
  },
  "statement-delivery": {
    s: "Sends statements through the customer's chosen channel, print, secure online, email notification or file, and records proof of delivery and retention.",
    d: "Delivery depends on preferences and consent: paper through a print vendor, electronic through the online channel with an alert, or files to corporate customers. Bounced mail and failed deliveries are tracked and trigger fallbacks. Copies are archived for the retention period. The difficulty is the number of channels and the legal weight of delivery: some jurisdictions treat a statement as delivered only when the customer could access it, so proof and retries matter.",
    k: ["Paper default with opt-in electronic versus the reverse: regulatory comfort and accessibility, versus lower cost and faster delivery.", "Notify only and keep documents online versus attach to message: avoids exposing data in transit, but customers must sign in."],
    p: ["Statements go to an old address after a change that did not reach the print file.", "Electronic statements are sent to an email address that bounced for months."],
    v: "Change a customer's address and channel, run the next cycle, and confirm the statement goes by the new channel with a delivery record, and a simulated bounce triggers the fallback.",
    dep: ["statement-generation", "customer-master", "retention-legal-hold"]
  },
  "notices-letters": {
    s: "Produces event-driven communications to customers, such as rate changes, overdue warnings, maturity reminders and account closure, with required wording and timing.",
    d: "Notices are triggered by events and dates: a rate change needing notice before taking effect, a loan going overdue, a deposit maturing. The component selects a template by product, jurisdiction and language, merges data, delivers by the customer's channel and records the notice as legal evidence. The hard part is timing compliance: if a notice must go out sixty days before a change, the change cannot be applied if the notice failed.",
    k: ["Notice generation tied to the business event versus a separate batch: guaranteed linkage, but event paths need delivery tracking.", "Gate the business change on proof of notice versus assume delivery: legally safest, but delivery problems delay product changes."],
    p: ["A rate rise takes effect before the notice period elapsed because the two schedules were independent.", "Templates in a language the customer did not choose are sent by default."],
    v: "Schedule a rate change with a required notice period, then confirm notices are sent by the deadline, recorded with proof, and that for a customer whose notice failed the change is held.",
    dep: ["statement-delivery", "event-publication", "customer-master"]
  },
  "transaction-history-store": {
    s: "A queryable archive of all posted entries per account for statements, inquiries, disputes and reports, retained for years and optimized for reading by account and date.",
    d: "Entries move from the hot transactional store into a history store keyed by account and date, with older partitions on cheaper storage. Channels query it for recent activity and staff for dispute investigations. It must serve millions of reads without disturbing posting. It is hard because the data is large and long-lived, schema changes over decades must preserve old rows, and queries must stay fast whether they ask for yesterday or seven years ago.",
    k: ["Separate history store versus keeping everything in the core database: reads do not compete with postings, but the copy must be consistent and complete.", "Tiered storage by age versus uniform: cost savings, but slower old queries and complexity in retrieval."],
    p: ["The history copy lags the core by hours, and customers see missing transactions.", "Archived rows in an old format cannot be read after a schema change."],
    v: "For a sample of accounts, compare the history store entry list and totals with the core's for the same range, including a period seven years old, and confirm they match and return within the response target.",
    dep: ["append-only-log", "partitioning-sharding", "reporting-replicas"]
  },
  "tax-certificates": {
    s: "Issues year-end certificates and statements of interest earned, tax withheld and fees paid, which customers need for their own tax filings.",
    d: "After year end, a job aggregates interest, withholding and sometimes fees per customer and tax category, matching what was reported to the authority. Certificates are generated and delivered by the customer's channel, and corrections are reissued with a version. Data must agree exactly with the tax reports. It is hard because totals span many accounts and product types, joint accounts split by ownership share, and late corrections require reissuing.",
    k: ["Derive from the same data as tax reports versus separate calculation: guarantees agreement, but ties the certificate schedule to reporting.", "Reissue on correction automatically versus on request: customers always hold correct figures, but they receive more documents."],
    p: ["Joint account interest is assigned entirely to the first holder.", "Certificate totals differ from the report filed with the authority."],
    v: "Generate certificates for a sample including joint and closed accounts, and confirm each customer's totals equal the amounts in the filed tax report and a reissue replaces the earlier version with a link.",
    dep: ["tax-reporting", "tax-withholding", "party-relationships"]
  },
  "regulatory-data-mart": {
    s: "A curated, historized copy of core data organized for regulatory and management reporting, with lineage from every reported figure back to source records.",
    d: "Data flows from the core and ledger into a mart that standardizes definitions: exposure, product class, counterparty type, residual maturity. Snapshots are kept per reporting date so reports can be rerun. Quality rules check completeness and consistency. Lineage lets analysts and auditors trace a number to the accounts behind it. The difficulty is definitions: each regulator defines terms slightly differently, and the mart must reconcile to the ledger while serving several reports.",
    k: ["Dedicated mart with standard definitions versus reports directly from core tables: consistent and explainable numbers, but another copy to reconcile.", "Snapshots per reporting date versus recompute from history: reproducible filings, but significant storage."],
    p: ["A report built on live tables changes when rerun after a correction.", "Mart totals differ from the ledger and nobody owns the difference."],
    v: "Rebuild last quarter's mart snapshot from archived data and confirm it reproduces the filed figures, with totals reconciled to the ledger and a sampled reported number traced to its source accounts.",
    dep: ["reporting-replicas", "trial-balance", "transaction-history-store"]
  },
  "regulatory-returns": {
    s: "Produces the prescribed periodic reports submitted to supervisors, covering balance sheet, exposures, deposits, loans, large positions and other required returns, in mandated formats.",
    d: "Each return has a definition, a schedule, a format and validation rules from the regulator. The component queries the mart, applies mappings from internal products to regulatory categories, validates the output, and holds it for review before submission. Evidence of sign-off is retained. It is hard because formats and definitions change frequently, because explanations for variances are expected, and because a late or wrong filing carries penalties.",
    k: ["Mapping layer from internal products to reporting lines versus hard-coded queries: new rules need only mapping changes, but mappings must be governed.", "Automated submission versus manual upload after review: fewer errors and faster, but a bad run can file wrong data unless gated."],
    p: ["A new product is not mapped, and its balances are omitted from the return.", "A resubmission after correction is not versioned and the regulator holds conflicting copies."],
    v: "Run a return for a closed period, confirm it passes the regulator's validation rules, its totals agree with the ledger, and a reviewer's approval is recorded before submission.",
    dep: ["regulatory-data-mart", "trial-balance", "maker-checker"]
  },
  "aml-monitoring-feed": {
    s: "Sends transactions and customer data to monitoring systems that detect suspicious activity, and receives alerts and case decisions back, including the ability to block or report.",
    d: "A continuous feed delivers postings, payments and customer changes to monitoring rules and models, which flag patterns such as structuring, unusual cross-border flows or dormant account bursts. Alerts become cases handled by analysts, who may file reports with the authority. The core supplies complete, timely data and enforces holds on instruction. The challenge is completeness and latency: a transaction missing from the feed cannot be flagged, and confidential reporting means customers must not be told.",
    k: ["Real-time feed versus nightly batch: earlier interception of suspicious payments, but needs reliable streaming and consumes core capacity.", "Core enforces blocks on instruction versus monitoring system acts independently: single control point, but analysts depend on the core's responsiveness."],
    p: ["A channel's transactions are missing from the feed because it posts through a different path.", "An analyst's request to freeze an account is applied but not recorded."],
    v: "Inject a synthetic structuring pattern across test accounts and confirm every transaction appears in the feed within the target delay, an alert is raised, and a freeze instruction takes effect in the core.",
    dep: ["event-publication", "holds-blocks-restrictions", "kyc-records"]
  },
  "liquidity-capital-data": {
    s: "Supplies the cash flows, maturities, balances and risk classes that liquidity and capital calculations need, grouped as supervisors define.",
    d: "Liquidity reports require a projection of inflows and outflows by maturity, split by customer type and product, and the stock of liquid assets. Capital reports need exposures with risk classes and collateral. The core provides contractual cash flows from loan schedules and term deposits, and behavioral attributes such as account stability. Hard parts are data granularity and timing, and that behavioral assumptions are applied outside the core but depend on its data.",
    k: ["Contractual cash flows from the core versus modeled behavior from risk systems: precise and auditable, versus realistic for balances without maturity.", "Daily computation versus month end: early warning of stress, but heavy data processing every night."],
    p: ["Cash flows of restructured loans are taken from the original schedule.", "Maturity buckets are wrong for accounts with call options."],
    v: "Compare projected cash flows for a sample portfolio from the report against the schedules in the core by maturity bucket, and confirm totals match to the unit.",
    dep: ["amortization-schedules", "term-deposits", "regulatory-data-mart"]
  },
  "tax-reporting": {
    s: "Reports customer interest, withholding, account ownership and foreign holdings to tax authorities in prescribed formats and on fixed dates.",
    d: "Annual and periodic returns list account holders, balances, interest and tax withheld, and certain cross-border information exchanged between governments. The component selects reportable accounts by residency and type, aggregates amounts, validates identifiers and submits. Corrections follow specific resubmission rules. It is hard because it depends on correct tax status for every customer, on data quality of identifiers, and on rules that differ by country and change annually.",
    k: ["Report from the same data as certificates and withholding versus separate extraction: totals agree, but changes in one flow affect the others.", "Self-certification stored per customer versus verified status: lower burden, but the bank is responsible for reasonable checks."],
    p: ["Customers with missing tax identifiers are silently dropped from the report.", "Joint holders are reported under one party only."],
    v: "Produce the annual report for a test population including non-residents and joint accounts, and confirm each reportable account appears with correct amounts, identifiers pass validation and totals match withholding postings.",
    dep: ["tax-withholding", "customer-master", "party-relationships", "regulatory-data-mart"]
  },
  "deposit-insurance-file": {
    s: "Produces a single customer view of insured deposits, aggregated across accounts, so that a deposit insurer can pay out quickly if the bank fails.",
    d: "Regulators in many countries require the bank to be able to generate, within days or even hours, a file listing each depositor, their eligible balances across all products and the insured amount. This needs correct aggregation across joint accounts, exclusions and ownership shares. The file is tested periodically. It is hard because it exercises every data weakness at once: duplicate customers, wrong ownership, missing balances and accounts on separate systems.",
    k: ["Maintain the aggregation continuously versus build on demand: always ready and testable, but another daily job and data store.", "Strict data quality gate versus best-effort file: a payout that is correct, but failing tests exposes problems the bank must fix."],
    p: ["Customers with accounts across two systems are counted twice or not aggregated.", "Joint account shares default to equal when the real split differs."],
    v: "Run the generation on a copy of production within the mandated time and confirm each depositor's insured total equals a manual calculation on a sample, and accounts total reconciles to the ledger.",
    dep: ["customer-master", "party-relationships", "balance-model", "regulatory-data-mart"]
  },
  "dormant-unclaimed-accounts": {
    s: "Identifies accounts with no customer activity for a legal period, restricts them, attempts contact and eventually transfers unclaimed balances as the law requires.",
    d: "A periodic job flags accounts without customer-initiated transactions beyond a threshold, which varies by product and jurisdiction. The bank notifies the customer, restricts the account, may stop fees and later transfers the balance to the state or a designated fund and reports it. Reactivation must be possible when the customer returns. It is hard because definitions of activity differ, contact data may be stale, and an account must never be closed in a way that loses entitlement.",
    k: ["Automatic status change by batch versus manual review: consistent and cheap, but errors affect many customers at once.", "Keep the account with restrictions versus move the balance early: easy reactivation, but ongoing cost and risk until the legal transfer date."],
    p: ["Interest postings are counted as customer activity and keep accounts forever active.", "Balances are transferred without the required final notice."],
    v: "Age a test account past the threshold and confirm it is flagged, notified, restricted, and that a customer transaction reactivates it, while a longer-aged one produces the correct unclaimed transfer and report.",
    dep: ["account-lifecycle", "notices-letters", "eod-orchestrator"]
  },
  "append-only-log": {
    s: "The ordered, never-edited record of every transaction and entry, from which balances, journals and history can be verified or rebuilt.",
    d: "Entries are inserted with a sequence number, timestamp, source and content, and are never updated or deleted by application paths. Database permissions, constraints and, in some designs, hash chaining enforce this. Later systems derive balances, statements and reports from it. It also supports replay after failure and verification by auditors. The challenge is size and performance, because it grows without bound, and operational temptation to fix data by editing.",
    k: ["Log as the source of truth with balances derived versus balances as truth with the log as a record: full reproducibility, but derived views need maintenance and recompute capability.", "Hash chaining of entries versus permissions only: tampering is provable, but archival and partition management become harder."],
    p: ["A privileged support script updates rows directly to fix a problem, and the log no longer explains balances.", "Gaps in sequence numbers go unnoticed and a missing entry is discovered months later."],
    v: "Check sequence continuity over a full day, verify the hash chain if used, and attempt an update through the application and with a normal administrator role and confirm both fail.",
    dep: ["transactional-store", "access-control"]
  },
  "audit-trail": {
    s: "A separate record of who did what and when: logins, configuration changes, overrides, approvals and data access, kept apart from the business transaction log.",
    d: "Each sensitive action creates an audit record with actor, role, time, source system, target and before and after values, plus the correlation id tying it to business events. Records are written to protected storage that administrators of the core cannot alter, and are searchable by auditors and security teams. Reads of sensitive data are also logged. It is hard because volume is large, completeness matters more than speed, and a missing record is itself a finding.",
    k: ["Synchronous audit write in the same transaction versus asynchronous shipping: no action without a record, but adds latency and a failure mode.", "Logging before and after values versus event only: precise forensics, but sensitive data copies need protection and retention themselves."],
    p: ["A batch process runs under a shared service account, so no individual is accountable.", "Audit storage fills and the system either stops or silently drops records."],
    v: "Perform a configuration change, an override and a sensitive data read as named users and confirm three records with actor, time, before and after values, and that an administrator cannot delete them.",
    dep: ["access-control", "retention-legal-hold", "transactional-store"]
  },
  "maker-checker": {
    s: "Requires a second authorized person to approve sensitive changes made by the first before they take effect, such as limits, parameters, manual postings and releases.",
    d: "A maker submits a change that is held in a pending state. A checker with the right authority, different from the maker, reviews the exact content and approves or rejects it. Only approved changes are applied. Rules define which actions require it and thresholds by amount. The record keeps both identities. It is hard because workflows must be airtight: pending changes must not be editable after approval, and the approver must see what will actually be applied.",
    k: ["Four-eyes on every change versus on thresholds only: stronger control, but approval queues slow operations and breed rubber-stamping.", "Approval at the data layer versus in each application screen: cannot be bypassed by a new screen, but needs a generic pending-change mechanism."],
    p: ["The maker edits a request after approval and the changed version is applied.", "Two colleagues share credentials and approve each other's work."],
    v: "Submit a limit change as one user, confirm it has no effect until a different authorized user approves, then try approving as the same user and confirm refusal, with both identities recorded.",
    dep: ["access-control", "audit-trail"]
  },
  "access-control": {
    s: "Defines who can see and do what in the core through roles, entitlements, segregation of duties and strong authentication for staff and systems.",
    d: "Staff and services authenticate through central identity, and receive roles granting specific functions and data scopes such as branch or customer segment. Rules prevent toxic combinations, such as creating and approving the same payment. Access is reviewed periodically and revoked on departure. System-to-system credentials are rotated. It is hard because privileges accumulate as people change roles, and because emergency access to fix production must exist while staying controlled and logged.",
    k: ["Role-based access with segregation rules versus per-user permissions: manageable at scale, but roles proliferate and become overly broad.", "Time-limited privileged access with approval versus standing admin rights: smaller attack window, but slows urgent fixes."],
    p: ["A leaver's account remains active and is used after departure.", "Service accounts have wide rights and static passwords shared across environments."],
    v: "Run an entitlement review comparing roles to current duties, confirm no user holds conflicting duties, a leaver's access is revoked on the day, and emergency access appears in the audit trail with an approver.",
    dep: ["encryption-key-management"]
  },
  "retention-legal-hold": {
    s: "Keeps each class of record for the legally required period, then disposes of it, and suspends disposal when litigation or investigation requires.",
    d: "Policies set retention by record type and jurisdiction, such as transactions for seven or more years and account opening documents for years after closure. A job applies the policy to archives and flags items for deletion or anonymization, honoring legal holds that override it. Retrieval must remain possible across format changes. It is hard because rules conflict, for example retention duties against erasure rights, and because records are copied across many systems.",
    k: ["Central retention policy engine versus each system's own rules: consistent compliance, but needs integration to every store.", "Delete at expiry versus keep indefinitely: lower risk and cost, but loses the ability to answer old inquiries; retention costs grow without limit."],
    p: ["A legal hold is set in one system but copies in backups and archives are destroyed on schedule.", "Records are kept far beyond the legal need and become a privacy liability."],
    v: "Create test records past their retention date, one under legal hold, run disposal and confirm only unheld ones are removed everywhere including archives, with a disposal log kept.",
    dep: ["audit-trail", "transaction-history-store", "privacy-erasure"]
  },
  "encryption-key-management": {
    s: "Protects sensitive data at rest and in transit with managed cryptographic keys, including generation, storage, rotation, access control and revocation.",
    d: "Data is encrypted in the database, backups and messages. Keys live in hardware-backed modules or managed vaults, separate from the data, with access logged. Field-level encryption or tokenization covers identifiers and card data. Keys rotate on a schedule and on suspicion of compromise, and data is re-encrypted or re-wrapped. It is difficult because key loss means data loss, rotation across billions of rows is slow, and every system that decrypts is a potential exposure point.",
    k: ["Envelope encryption with a master key in hardware versus keys held by applications: strong separation and cheap rotation of the master, but a dependency on the key service for every operation.", "Field-level encryption versus whole-disk: protects data from administrators and database copies, but prevents indexing and searching on encrypted fields."],
    p: ["Keys and encrypted backups are stored together, so one theft exposes both.", "A rotation job fails midway and some rows can no longer be decrypted."],
    v: "Rotate a key in a test environment under load, confirm all data remains readable, old key access is removed, and a restored backup from before the rotation can still be decrypted using retained key versions.",
    dep: ["transactional-store"]
  },
  "privacy-erasure": {
    s: "Honors data protection rights, including access, correction and erasure or anonymization, without breaking the financial records the bank must retain.",
    d: "Personal data in the core is mapped: where it lives, why it is kept and for how long. Requests from customers are verified and fulfilled across systems. Erasure is limited by duties to retain transaction records, so the usual answer is restriction and later anonymization of identifying fields while keeping the financial data. It is hard because personal data spreads across logs, backups and analytical copies, and because anonymized records must still reconcile to the ledger.",
    k: ["Anonymize identity fields while keeping transactions versus delete rows: preserves ledger integrity and reporting, but anonymization must be irreversible and leave no linkable data.", "Central personal-data registry versus ad hoc searches: complete and quick responses, but needs a continuously maintained map."],
    p: ["Customer names remain in free-text narratives and log files after anonymization.", "Erasing a customer breaks the foreign keys of old transactions."],
    v: "Process an erasure request for a closed test customer and confirm name, address and identifiers are anonymized across core, history and logs, while balances, journals and reports still reconcile.",
    dep: ["customer-master", "retention-legal-hold", "audit-trail"]
  },
});
