// Details for the ERP & accounting plate, part 4: close, reporting, controls and audit.
ATLAS.details("erp-accounting", {
  "close-checklist": {
    s: "A dated, ordered list of tasks with owners and dependencies that takes the books from open to closed each period, with status visible to the controller.",
    d: "Tasks include running accruals, depreciation, revaluation, allocations and reconciliations, reviewing exceptions and signing off. Some are automatic jobs, others are human steps with evidence attached. Dependencies prevent a step running before its inputs are final. The board shows progress per entity. The difficulty is that close is a critical path across many teams, and the real delays are waiting on late inputs, not computing.",
    k: ["Tasks tracked inside the ERP versus in a separate tool: inside means jobs and status are linked and evidence attaches to entries, while an outside tool is flexible and loses automatic status.", "Strict sequential gates versus parallel work with final review: gates keep order and lengthen the close, while parallel work is faster and risks rework when late entries arrive."],
    p: ["A task marked done by hand without evidence is repeated by the auditor and found to be wrong.", "A dependency missing from the template lets revaluation run before the last invoices are posted."],
    v: "Open a test period, run the checklist, and confirm each automated task records its run and output, each manual task needs a named sign-off, and the period cannot close with an incomplete mandatory task.",
    dep: ["batch-scheduler","approval-workflows","account-reconciliation","period-controls"]
  },
  "period-controls": {
    s: "The statuses and permissions that decide who can post into which period, moving from open through soft-closed to hard-closed, enforced by the posting engine.",
    d: "Each ledger and module has a status per period. Open allows normal posting; soft close limits it to finance or particular sources; hard close blocks all posting. Reopening requires privilege and is logged. Posting dates are checked against status in the same transaction as the write. It is hard because operational systems keep producing documents dated in closed periods, and every rejection needs a defined route: move the date forward or reopen.",
    k: ["Reject postings into closed periods versus auto-roll the date forward: rejection preserves integrity and interrupts operations, while rolling keeps flow and moves revenue or cost into a different period than the event.", "Reopen by exception with approval versus never reopen, only adjust: reopening fixes history and risks changes to filed numbers, while adjust-only keeps filings stable and is clumsy."],
    p: ["Module-level close applied while the ledger stays open lets back-dated subledger postings slip in unseen.", "Reopening a period to fix one entry leaves it open for weeks, and unrelated changes follow."],
    v: "Hard-close a period and attempt posting from the screens, an API call and a batch job with a date in it; confirm all three are refused, and that a reopen requires a privileged user and appears in the audit trail.",
    dep: ["fiscal-calendars","posting-engine","identity-and-roles","audit-trail"]
  },
  "account-reconciliation": {
    s: "The review of each balance sheet account to prove its ledger balance is supported by an independent source, with differences explained, owned and signed off.",
    d: "For each account, a reconciliation compares the ledger balance with a source such as a bank statement, a subledger, a schedule or a third-party confirmation, lists reconciling items with age and owner, and shows the unexplained difference. Matching rules can automate high-volume accounts. Sign-off by preparer and reviewer is recorded. Risk-based frequency and thresholds focus effort. The challenge is evidence: balances stay unreconciled when nobody owns old items.",
    k: ["Automated transaction matching versus preparer-built schedules: matching handles high volume and needs rules that must be maintained, while schedules are flexible and slow.", "Reconcile all accounts every month versus by risk: all gives full coverage and burns effort on stable accounts, while risk-based focuses and needs defensible criteria."],
    p: ["Reconciling items carried forward for a year are accepted as normal and hide a real error.", "A reviewer signs reconciliations they prepared themselves because roles were not separated."],
    v: "Reconcile a sample account, confirm its ledger balance equals source balance plus listed reconciling items, and that the preparer and reviewer are different users with timestamps in the record.",
    dep: ["general-ledger","bank-reconciliation","segregation-of-duties","document-attachments"]
  },
  "eliminations": {
    s: "Removes balances and transactions between group entities before consolidating, so the group statements show only dealings with outsiders.",
    d: "Intercompany receivables and payables, sales and purchases, loans and interest, and investments against equity must cancel. The engine identifies partner balances by account and entity, compares the two sides, posts elimination entries to a consolidation ledger, and reports differences. Unrealized profit in stock held by the buyer is also eliminated. It is hard because the two sides rarely agree on the first run, and rule configuration for investments in subsidiaries is intricate.",
    k: ["Eliminate in a separate consolidation ledger versus in the entities' books: a separate ledger keeps legal books untouched and can be rerun, while in-entity eliminations are simple and corrupt statutory accounts.", "Auto-plug small differences versus force resolution: plugging closes fast and hides mismatches, while forced resolution gives clean books and delays close."],
    p: ["An uneliminated intercompany loan inflates both assets and liabilities in the group balance sheet.", "Eliminations are posted manually each month and one entity is forgotten."],
    v: "Run eliminations on test entities with known intercompany balances and confirm every partner pair nets to zero, any difference is listed by pair, and consolidated revenue excludes intragroup sales.",
    dep: ["intercompany","consolidation","legal-entities"]
  },
  "consolidation": {
    s: "Combines the statements of all group entities into one set, applying currency translation, ownership percentages, eliminations and adjustments, with a trail from group figures back to entities.",
    d: "Each entity's trial balance is collected, mapped to group accounts, translated, adjusted for policy differences, and summed according to the ownership structure (full, proportional or equity method). Eliminations and minority interests are applied, and results are stored by consolidation level so any group figure can be drilled to its sources. Hard parts are changing structures during the year, mapping, restatements of prior periods, and rerunning for corrected entities.",
    k: ["Consolidate inside the ERP versus in a dedicated consolidation tool: inside shares one chart and drill-down, while a dedicated tool handles complex ownership and heterogeneous sources.", "Rebuild from scratch each run versus incremental updates: full rebuilds are simple and slow, while incremental ones are fast and risk stale pieces."],
    p: ["A late correction in one subsidiary is not reflected because the consolidation ran on an earlier snapshot.", "Acquisition mid-year is included for the whole year, overstating group results."],
    v: "Consolidate two subsidiaries and the parent and confirm group totals equal the sum of entity balances after translation and eliminations, with each group figure drilling to entity trial balances.",
    dep: ["currency-translation","eliminations","legal-entities","trial-balance","parallel-ledgers"]
  },
  "year-end-rollover": {
    s: "Closes a fiscal year by moving income and expense balances into retained earnings, carrying forward balance sheet balances and opening the next year's periods.",
    d: "The process zeros every income and expense account into retained earnings, per ledger and dimension as required, creates opening balances for the new year, and freezes the old year except for audit adjustments. Open items and inventory carry forward as detail, not just totals. Because audit adjustments can still arrive, systems allow a provisional close and a rerunnable final close. Common difficulties are rerunning after adjustments and getting dimension-level opening balances correct.",
    k: ["Provisional close that can be rerun versus a one-time final close: rerunnable closes accept audit adjustments and risk drift between the old and new year, while one-time closes are clean and inflexible.", "Closing entries as journals versus a computed carry-forward: journals are visible and numerous, while computed balances are quiet and need explanation."],
    p: ["An adjustment to the prior year after rollover is not carried to opening balances.", "Retained earnings is closed by entity alone and loses the dimension split needed by reports."],
    v: "Roll over a test ledger, post an audit adjustment to the old year, rerun, and confirm opening balances and retained earnings reflect it, and that income and expense accounts start the new year at zero.",
    dep: ["account-types","fiscal-calendars","general-ledger","journal-entries"]
  },
  "trial-balance": {
    s: "The list of every account with its opening balance, period movement and closing balance, whose debits and credits must be equal, serving as the base for all statements.",
    d: "Computed from the ledger or aggregates for a ledger, entity, period range and dimension filter, it proves arithmetic integrity and is the first thing checked at close. It can be shown in transaction, ledger and group currency, before and after adjustments, and with comparatives. Because everything above it derives from it, it must match the ledger exactly, be reproducible for any past date, and be fast enough for use during the close.",
    k: ["Computed live from lines versus read from period aggregates: live is exact and slow at scale, while aggregates are fast and depend on their integrity.", "Single trial balance versus several stages (unadjusted, adjusted, consolidated): stages show each adjustment step to auditors and multiply the objects to maintain."],
    p: ["A trial balance that balances while individual accounts are wrong because of an offsetting misposting.", "Running for a past date after a late back-dated posting yields different figures than were reported."],
    v: "Produce the trial balance for last month's end, confirm total debits equal total credits, and confirm that rerunning it now returns the same figures as when it was first issued.",
    dep: ["general-ledger","balance-aggregates","dual-currency-amounts"]
  },
  "financial-statements": {
    s: "The balance sheet, income statement and cash flow statement built from the trial balance through defined mappings, with comparatives and notes in the required presentation.",
    d: "Each statement is a hierarchy of lines, and each line sums mapped accounts with sign rules. The cash flow statement is derived by the indirect method from balance changes or from tagged cash movements. Prior-period comparatives are included, and statutory layouts apply per country. The hard parts are the cash flow, which depends on classification of every movement, and keeping presentations in step when the chart of accounts changes.",
    k: ["Accounts mapped to statement lines by range versus by explicit assignment: ranges are compact and break when new accounts are inserted, while explicit mapping is exact and burdens setup.", "Direct versus indirect cash flow: indirect works from the balance sheet and is common, while direct needs cash movements classified at posting."],
    p: ["An account added in the chart without a statement mapping drops out and the balance sheet no longer balances.", "Comparatives use the current mapping rather than the one in force, so last year's figures change."],
    v: "Generate statements for a closed period and confirm total assets equal liabilities plus equity, net income matches the income statement and retained earnings movement, and closing cash equals the cash accounts.",
    dep: ["trial-balance","report-definitions","chart-of-accounts"]
  },
  "report-definitions": {
    s: "The configurable layouts that describe a report's rows, columns, filters and formulas, stored as data so finance staff can build and version reports without programming.",
    d: "A definition lists row sets (accounts, ranges, calculated lines), column sets (periods, budgets, variance), filters and parameters. The engine resolves it into queries against balances and lays out the result. Definitions are versioned and permissioned. Complexity comes from formula references between rows, hierarchies, currency choice, and the need for the same definition to run for one entity or a whole group with the same meaning.",
    k: ["Row and column definitions versus free-form query: structured definitions are understandable and reusable, while queries are powerful and drift from agreed meanings.", "Definitions edited live versus released through approval: live edits are fast and let a report change shape between two reviews, while releases give stable numbers."],
    p: ["A formula referencing a row by position breaks when someone inserts a row above it.", "A shared report is changed by one team and silently alters another team's package."],
    v: "Run one definition for entity A, for entity B, and for the group, and confirm the group figures equal the sum of the two entities for every additive line.",
    dep: ["balance-aggregates","analytic-dimensions","identity-and-roles"]
  },
  "management-reporting": {
    s: "Views of results by product, region, customer, department or project, using dimensions and allocations, for decisions rather than for filing.",
    d: "Management reports slice the ledger by dimensions and apply allocations to give contribution and margin by segment. They compare actuals with budgets and forecasts, show trends and exceptions, and support drill-down to documents. Unlike statutory statements they may use rules that differ from the ledger, so each report must state its basis. The risk is two versions of the truth: a management figure that cannot be reconciled to the ledger stops being trusted.",
    k: ["Report from the ledger with dimensions versus from a separate data mart: the ledger gives one source and loads the transactional system, while a mart is fast and can diverge.", "Fully allocated versus direct contribution view: full allocation shows total profitability and mixes controllable with arbitrary costs, while contribution is clearer for decisions and hides overhead."],
    p: ["Management margin includes accrual adjustments the statutory ledger lacks, and executives quote different profits.", "A reorganized hierarchy is applied backward and trends across the reorganization become meaningless."],
    v: "Sum a management report across all segments and compare with the income statement for the same period; confirm equality, or that the listed reconciling items fully explain the difference.",
    dep: ["analytic-dimensions","allocations","reporting-store","budgets-and-forecasts"]
  },
  "budgets-and-forecasts": {
    s: "Plans of expected income, expense and cash by account and dimension, with versions, workflow and comparison with actuals and with commitments as they accrue.",
    d: "Budgets are built by departments, loaded from spreadsheets or driver models, approved and locked as versions. Forecasts are revised during the year. Budget control compares spend with budget at requisition, order or invoice, as warning or block. Actuals come from the ledger and commitments from open orders. Hard parts are version management, allocation across periods and dimensions, and a budget check that is fast enough to run at every purchase.",
    k: ["Hard budget stop versus warning: a stop enforces discipline and blocks urgent legitimate spend, while warnings leave overspend to be explained after the fact.", "Check against budget by account or by dimension combination: finer checks control more tightly and need more setup, while coarse checks are loose and easy."],
    p: ["The budget check ignores open commitments, so total orders exceed the budget while each passes.", "A revised forecast overwrites the original budget, and variance analysis loses its baseline."],
    v: "Set a department budget, commit orders to near the limit, and confirm the next requisition is flagged with remaining budget including commitments, and that variance uses the approved original version.",
    dep: ["analytic-dimensions","general-ledger","purchase-orders","approval-workflows"]
  },
  "reporting-store": {
    s: "A read-optimized copy or cube of ledger and subledger data, refreshed from the transactional system, serving heavy analysis without slowing posting.",
    d: "Data is replicated or extracted on a schedule into columnar tables or multidimensional models with conformed dimensions, so large queries scan only what they need. It supports history across years, many dimensions and joins to non-financial data. Consistency with the ledger must be checked, since a stale or partly loaded store gives wrong numbers confidently. Security rules from the source must be reproduced, which is easy to forget.",
    k: ["Near-real-time replication versus nightly loads: near-real-time keeps analysis current and demands change capture, while nightly loads are simple and stale during the day.", "Replicate entity security into the store versus restrict who may query it: replication protects each user's view and is hard to keep right, while restricting access is simple and coarse."],
    p: ["A load that fails halfway leaves the store with some entities updated and others not, and nobody is told.", "The store exposes all entities to analysts who lacked access in the ERP."],
    v: "After a load, compare account totals by entity and period in the store with the ledger; confirm zero difference and that a restricted analyst sees only their entities.",
    dep: ["general-ledger","batch-scheduler","identity-and-roles","analytic-dimensions"]
  },
  "approval-workflows": {
    s: "Routes documents such as invoices, orders, journals and payments to the right approvers by rules on amount, type, department and risk, recording every decision.",
    d: "A workflow definition lists steps, conditions, approver selection and escalation rules. When a document is submitted, the engine creates tasks, tracks them, applies delegation, and releases the document on final approval or returns it on rejection. The document is locked during approval, and changes restart it. Hard parts are choosing approvers from a changing organization, parallel and conditional steps, and ensuring that approvers cannot approve their own documents.",
    k: ["Approver by named person versus by role or hierarchy: named is clear and breaks on departures, while roles and hierarchy follow reorganizations and need accurate organization data.", "Approve whole document versus line by line: whole-document is quick and may hide a bad line, while line approval is precise and slow."],
    p: ["Escalation timers fire and send documents to a manager who is also the requester.", "A document edited after approval keeps its approved status because the edit did not reset the workflow."],
    v: "Submit a document above the limit, approve it as the wrong user and confirm refusal, approve as the correct one, then edit it and confirm approval is reset, with all decisions and times in the history.",
    dep: ["authority-limits","identity-and-roles","segregation-of-duties","audit-trail"]
  },
  "authority-limits": {
    s: "Defines the monetary and type limits each role or person may approve or release, with temporary delegation, so that spending authority follows the company's policy.",
    d: "Limits are set by document type, amount, currency, department and sometimes account, and are checked by workflow and by posting. Delegation grants another user a person's authority for a period, recorded with who delegated to whom. Limits in different currencies need conversion at a stated rate. Hard parts are aggregate limits, so that splitting one purchase into small parts does not avoid review, and keeping limits aligned with HR changes.",
    k: ["Limits in a central matrix versus embedded in each workflow: a matrix is auditable in one place and complex to express, while embedded limits are flexible and scattered.", "Delegation by approver versus by administrator: approver delegation is quick and relies on judgment, while administrator-granted delegation is controlled and slow."],
    p: ["A departed approver's limits stay active because they were never removed with the user.", "Purchases split into several orders of just under the limit are never aggregated."],
    v: "Set a limit for a role, submit documents at, below and above it, and confirm only the above-limit one is escalated; add a delegation and confirm it expires on its end date and is logged.",
    dep: ["identity-and-roles","audit-trail","currencies-and-rates"]
  },
  "segregation-of-duties": {
    s: "Prevents one person from performing conflicting steps, such as creating a vendor and paying it, by defining incompatible permissions and enforcing or reporting violations.",
    d: "A rule matrix lists pairs of duties that must not be held by the same user or must not act on the same transaction. Enforcement happens in role assignment, which blocks or warns, and at transaction time, where the system checks that the approver differs from the creator. Periodic reports flag users with conflicts and compensating controls. It is hard because small teams cannot separate everything, and combinations of roles across modules create conflicts that nobody designed.",
    k: ["Preventive enforcement versus detective reporting: prevention blocks violations at the cost of rigid operations, while detection is flexible and finds problems after money has moved.", "Role-level conflict rules versus transaction-level checks: role rules are easy to maintain and miss same-transaction abuse, while transaction checks catch it and need data on each action."],
    p: ["Emergency access granted to fix an issue is never removed, and a user holds conflicting powers for months.", "Two roles that are safe separately combine through a third module into an unreviewed payment path."],
    v: "Assign one user conflicting roles and confirm the system blocks or flags it, then have a user create and try to approve their own invoice and confirm the approval is refused.",
    dep: ["identity-and-roles","approval-workflows","audit-trail"]
  },
  "audit-trail": {
    s: "A tamper-evident record of who created, changed, approved, posted or viewed what and when, including old and new values of controlled data.",
    d: "Every transaction and master data change writes an audit record with user, time, source, action and before and after values. For ledgers, immutability and reversal entries are themselves the trail; for master data, change tables capture field-level diffs. Records are stored apart from the application's write path and protected from deletion, sometimes chained by hashes. Volume and relevance are the problem: logging everything buries what matters, while logging too little fails the first audit.",
    k: ["Field-level change logging versus document snapshots: field logs are compact and need reassembly to view a past state, while snapshots show state at once and use more storage.", "Log inside the application transaction versus asynchronously: in-transaction logs cannot be missed and slow writes, while async logs are fast and can be lost on a crash."],
    p: ["A database administrator edits a row directly and the application log shows nothing.", "Logs kept for one year are asked for in the eighth year of an audit or dispute."],
    v: "Change a vendor's bank account and a customer's credit limit and confirm each produces a record with user, time, old value and new value, and that a deletion attempt on the audit table by an application user fails.",
    dep: ["append-only-storage","identity-and-roles","transactional-store"]
  },
  "document-attachments": {
    s: "Stores supporting files such as invoices, contracts, receipts and certificates, linked to the transactions and records they justify, with retention and access control.",
    d: "Files are held in object storage with a metadata record linking to a document, line or master record, a type, a hash, a retention class and permissions. Viewing a journal can show its supporting documents. Hashing at upload shows later tampering. Retention rules delete or hold files by legal requirement. Challenges are volume, scanning for malware, finding evidence quickly during an audit, and keeping links valid when documents are archived or merged.",
    k: ["Files in the database versus in object storage with links: database storage is transactional and heavy on backups, while object storage is cheap and needs consistency between metadata and files.", "Link evidence to the document versus to the ledger line: document links are natural, while line links support specific audit questions and take more effort."],
    p: ["A file attached by path breaks when storage is reorganized, and the evidence for a posted entry disappears.", "An attachment deleted by a user after approval leaves the document without the contract that justified it."],
    v: "Attach a file to a posted invoice, view it from the related journal line, then try to delete it as an ordinary user; confirm deletion is refused and its stored hash still matches.",
    dep: ["encryption-and-masking","archival-retention","identity-and-roles"]
  },
  "anomaly-detection": {
    s: "Rules and statistical models that flag suspicious or erroneous transactions, such as duplicates, round-number payments, off-hours entries, and unusual vendors or amounts, for review.",
    d: "Detectors run at entry or in batch over documents and ledger lines. Rules cover exact duplicates, sequence gaps, weekend postings, entries by senior users and just-below-threshold amounts. Models score deviations from a vendor's or account's history. Flags go to a review queue with the evidence. The difficulty is precision: too many false alarms are ignored, and what is flagged but not investigated is worse evidence than silence.",
    k: ["Block on detection versus flag for review: blocking stops loss immediately and halts legitimate work on false positives, while flagging keeps flow and relies on timely review.", "Rules versus learned models: rules are explainable to auditors and easily evaded, while models find new patterns and are harder to justify."],
    p: ["A duplicate rule that compares only invoice numbers misses the same bill re-keyed with a changed number.", "Flags pile up unreviewed, and the log becomes evidence of ignored warnings."],
    v: "Enter the same supplier invoice twice with a slightly different number and a payment just below an approval limit; confirm both are flagged with the reason and appear in the review queue with the flagging rule.",
    dep: ["vendor-master","payables-ledger","journal-entries","audit-trail"]
  },
  "control-testing": {
    s: "Maps each control to its risk, owner and evidence, schedules tests, and stores results, so management and auditors can show that controls operate as designed.",
    d: "A control library lists controls such as three-way match, journal approval and access review, each with a risk statement, frequency, owner and test procedure. The system schedules reviews, collects evidence from approvals, reports and logs, records exceptions and tracks remediation. Some tests can be automated by querying the data, for example checking every posted journal for an approver. The challenge is keeping the library in step with the real system as processes change.",
    k: ["Automated continuous testing versus periodic sample testing: continuous tests cover everything and need exact queries, while samples are cheaper and may miss rare breaches.", "Controls defined in the ERP versus in a governance tool: ERP-defined controls link to live data, while a separate tool serves many systems and depends on exports."],
    p: ["A control remains in the library after the process it protected was replaced, and testing proves nothing.", "Evidence is screenshots collected by hand weeks after the period, and cannot be shown to be complete."],
    v: "Run an automated test that lists all journals above the approval threshold lacking an approver in the last quarter, and confirm it returns zero, or each exception with a recorded remediation.",
    dep: ["audit-trail","approval-workflows","segregation-of-duties","batch-scheduler"]
  },
}
);
