// Details for the ERP & accounting plate, part 2: purchasing, inventory and other subledgers.
ATLAS.details("erp-accounting", {
  "vendor-master": {
    s: "The record for each supplier: legal identity, tax registrations, bank accounts, payment terms and approval status, guarded because it controls where money is sent.",
    d: "Like the customer record it has a global identity and per-entity purchasing and finance data. Onboarding collects tax forms, bank details and sanctions checks, and a new vendor typically needs approval before it can be paid. Bank detail changes are the highest-risk edit in the system and are verified outside the system, for example by calling a known number. Duplicate vendors are common, and each one is a chance to pay the same bill twice.",
    k: ["Central onboarding team versus any buyer creating vendors: central control reduces fraud and duplicates but delays urgent purchases, while open creation is fast and fills with near-duplicates.", "Validate bank details by external lookup versus trust the form: lookup catches typos and fraud at some cost and coverage gaps, while trusting leaves the payment run to find them."],
    p: ["A changed bank account approved by the same person who requested it sends a month of payments to a fraudster.", "Two records for one supplier mean invoices are matched against the wrong order and paid twice."],
    v: "Change a vendor's bank account and confirm the payment run excludes that vendor until a second, different user approves, and the audit trail records old and new values.",
    dep: ["legal-entities","tax-codes","segregation-of-duties","audit-trail"]
  },
  "requisitions": {
    s: "Internal requests to buy something, entered by the person who needs it, routed for budget check and approval and converted into purchase orders by procurement.",
    d: "A requisition lists items or services, quantities, estimated cost, account and dimensions, and a requester. Budget availability is checked against commitments, and approvers are chosen by amount, department and category. Approved lines go to a buyer who consolidates them and selects a supplier from catalogs or contracts. The difficulty is making it easy enough that staff use it rather than buy first and ask later.",
    k: ["Catalog-based requisitions with preset prices versus free-text: catalogs speed approval and enforce contracts but need curation, while free-text handles anything and defeats spend analysis.", "Budget check at request versus at order: early checks prevent overspend before commitments, but estimates are rough and can block valid requests."],
    p: ["Staff buy outside the system and submit invoices later, so the control exists only on paper.", "A budget check that ignores open commitments approves spend that exhausts the budget twice over."],
    v: "Submit a requisition above the requester's budget and confirm it is blocked with the remaining amount shown, then approve a smaller one and confirm it reaches a buyer with the account and dimensions intact.",
    dep: ["approval-workflows","analytic-dimensions","budgets-and-forecasts","vendor-master"]
  },
  "purchase-orders": {
    s: "Commitments to suppliers listing items, quantities, prices and delivery dates, which reserve budget and serve as the reference that later receipts and invoices are matched against.",
    d: "A purchase order is created from requisitions, contracts or directly, approved by authority, and sent to the supplier. It records what was agreed so later documents can be checked against it. Changes create revisions rather than overwriting. Open orders are commitments, visible to budgeting and cash forecasting. Complications are blanket orders with releases, partial deliveries, price and quantity tolerances, and services with no physical receipt.",
    k: ["Revisions versus editing in place: revisions preserve what the supplier saw and complicate matching to the right version, while in-place edits lose the history that settles disputes.", "Commitment accounting in the ledger versus a memo: ledger commitments make budget reporting exact but add postings that are reversed on receipt, while memos keep the ledger purely actual."],
    p: ["An order approved for one amount is raised afterward by a quantity edit that skips re-approval.", "Closed orders with leftover quantity keep commitments alive and distort budgets for months."],
    v: "Raise an order above an approver's limit and confirm it routes upward. Increase its quantity after approval and confirm it returns for approval, with both revisions retained.",
    dep: ["requisitions","vendor-master","approval-workflows","authority-limits"]
  },
  "goods-receipt": {
    s: "Records that ordered goods or services have arrived, updating stock and creating the accrual for the liability to be matched to the supplier's invoice later.",
    d: "Receiving confirms quantity and condition against an order line and creates a receipt document. For stocked items it posts to inventory and to a goods-received-not-invoiced account; for services, a confirmation plays the same role. Returns and rejections reverse parts. The accrual matters because goods are usually received before the bill arrives, and without it expenses and liabilities are understated at period end.",
    k: ["Receive against the order only versus allow unordered receipts: strict receiving keeps every receipt matched, while allowing unordered ones handles real warehouse life and creates items nobody owns.", "Value receipts at order price versus actual cost: order price is available immediately and later needs a variance entry, while waiting for the invoice delays stock valuation."],
    p: ["Receipts left unmatched for months leave a large uninvoiced balance that no one can clear at year end.", "A receipt entered into the wrong period understates the liability at close."],
    v: "Receive ten of twelve ordered units and confirm stock rises by ten, the uninvoiced liability equals ten units at order price, and the order shows two units open.",
    dep: ["purchase-orders","stock-ledger","posting-engine"]
  },
  "invoice-capture": {
    s: "Brings supplier invoices into the system from email, scans, portals and electronic formats, extracting header and line data and routing them for coding and matching.",
    d: "Paper and PDF invoices pass through text extraction that proposes vendor, number, date, amounts and lines, with a person confirming low-confidence fields. Electronic invoices arrive structured. Each is checked for duplicates, linked to an order where one exists, and coded to accounts when there is none. Extraction accuracy, line-level capture and keeping the original as evidence are the hard parts, along with fraud: fake invoices look like real ones.",
    k: ["Header-only capture versus line-level capture: header-only is cheap and accurate but cannot match to order lines, while line capture enables matching and multiplies extraction errors.", "Learned vendor templates versus general extraction: templates are very accurate for known suppliers and brittle on layout changes, while general models handle new suppliers less precisely."],
    p: ["A resubmitted invoice with a slightly different number passes the duplicate check and is paid again.", "Extraction swaps the invoice and purchase order numbers, and an unrelated order is matched."],
    v: "Submit the same invoice twice, once as a scan and once by email, and confirm the second is flagged as a probable duplicate, with the original image retrievable from the posted document.",
    dep: ["vendor-master","document-attachments","anomaly-detection","integration-queues"]
  },
  "three-way-match": {
    s: "Compares the purchase order, goods receipt and supplier invoice line by line within tolerances, and releases the invoice for payment only when quantity and price agree.",
    d: "For each invoice line the engine finds the order and receipt lines, compares quantities and unit prices within configured tolerances, and records variances. Matched lines post to payables; exceptions go to a queue for buyers or receivers to resolve by correcting a document or approving the difference. Variance postings go to price or quantity variance accounts. The hard parts are partial deliveries, multiple invoices per receipt, and exception volume, which can swamp a team if tolerances are too tight.",
    k: ["Strict tolerances versus loose: strict ones stop overpayment but create large exception queues, while loose ones pay fast and let small leaks accumulate.", "Two-way match for services versus three-way everywhere: two-way is practical where there is no receipt, and relies on approval of the invoice as the control."],
    p: ["Matching to the first open receipt rather than the right one leaves later receipts unmatched and invoices blocked.", "Tolerances set as a percentage allow large absolute overpayments on high-value lines."],
    v: "Invoice 12 units at a price 3 percent above order with a 2 percent tolerance and confirm the line is held with the price variance shown. Correct it and confirm payables posts only after release.",
    dep: ["purchase-orders","goods-receipt","invoice-capture","payables-ledger"]
  },
  "payables-ledger": {
    s: "The subledger of every open and paid supplier item with due dates, discounts and holds, whose total must equal the payables control account.",
    d: "Posted invoices and credit memos create open items with terms-based due dates and early-payment discount windows. Items can be put on hold, disputed or scheduled for payment. Payments clear items, and withholding tax is deducted at clearing. Aging and cash forecasts are read from it. Complexity comes from prepayments, advance credits, foreign currency items needing revaluation, and corrections to invoices that were already partly paid.",
    k: ["Pay on due date versus pay at discount date: taking discounts earns return at the cost of cash earlier, and needs forecasting to make the trade rationally.", "Single control account versus separate accounts per vendor type: separate accounts make the balance sheet more informative and multiply the reconciliations."],
    p: ["A credit memo not applied to its invoice lingers as a vendor balance while the invoice is paid in full.", "Holds that are never reviewed leave suppliers unpaid long past terms."],
    v: "Post three invoices, hold one, pay the others, and confirm open items equal the held invoice and the control account equals the remaining item exactly.",
    dep: ["three-way-match","vendor-master","general-ledger","subledger-reconciliation","withholding-and-exemptions"]
  },
  "payment-runs": {
    s: "Selects due and approved payables, proposes a batch, applies approvals and bank checks, generates the payment file and posts the clearing entries.",
    d: "A run selects open items by due date, discount date, vendor and currency, excluding holds. A proposal lets a clerk adjust it. After approval the run creates payments, marks items as paid, and produces the file or print for the bank. Remittance advices go to suppliers. A run touches large amounts of money in one step, so it needs sanctions and duplicate checks, cutoff awareness, and a way to void payments that were not sent without leaving open items.",
    k: ["Mark items paid at file creation versus at bank confirmation: early marking prevents double selection, and late marking reflects reality but needs locking to stop a second run grabbing them.", "One run per bank account and currency versus consolidated: separate runs are simpler and easier to approve, while consolidated ones cut the number of approvals."],
    p: ["A run aborted after the file was sent leaves items marked unpaid, and the next run pays them again.", "A currency conversion at proposal time differs from the bank's rate and payment is short."],
    v: "Create a run of ten invoices, generate the file, then try to select the same items in a second run; confirm they are locked, and that voiding an unsent payment reopens exactly those items.",
    dep: ["payables-ledger","bank-connectivity","approval-workflows","posting-engine","vendor-master"]
  },
  "item-master": {
    s: "The catalog of every stocked, purchased or sold item with its units of measure, categories, costing method, tracking requirements and the accounts it posts to.",
    d: "An item defines how it is counted, bought, sold, stored and valued. Posting groups on the item choose inventory, cost of goods sold and variance accounts. Variants, units of measure with conversions, lot and serial tracking and expiry add structure. Changing a costing method or unit after movements exist is dangerous, so the system restricts it. The hard parts are scale, with millions of items, and data quality, since duplicates distort availability and cost.",
    k: ["Costing method per item versus per company: per item allows exceptions and complicates reporting, while a company-wide method is easy to explain and audit but fits fewer businesses.", "Unit conversions as fixed ratios versus per-item: per-item handles odd packs and creates inconsistency, while fixed ratios keep arithmetic clean."],
    p: ["Changing the base unit after stock exists silently rescales quantities and corrupts valuation.", "Duplicate items hold split stock, and a shortage appears while another record shows surplus."],
    v: "Create an item with a case-to-each conversion, receive one case, and confirm stock shows the right number of eaches and a unit cost equal to the case cost divided by the conversion.",
    dep: ["posting-profiles","chart-of-accounts","analytic-dimensions"]
  },
  "stock-ledger": {
    s: "A permanent record of every inventory movement, receipts, issues, transfers and adjustments, with quantity, cost, location and date, from which on-hand balances derive.",
    d: "Each movement is a line with item, location, quantity, cost and source document, written once and never edited. Balances are sums of lines and are cached for speed. Financial postings are produced from the same lines, so inventory value in the ledger follows physical movement. The difficulty is that quantity and value can diverge, through back-dated entries, negative stock, and costs that change after issues already happened.",
    k: ["Allow negative stock versus block it: blocking keeps data physically plausible and stops sales on late receipts, while allowing it reflects reality and defers errors to later cost corrections.", "Computed balances versus stored running balances: computed ones cannot drift, while stored ones are fast and need reconciliation against the lines."],
    p: ["A back-dated receipt silently changes the cost of every later issue, and prior period margins move after close.", "Cached balances drift from the lines after a failed batch, and picking shows stock that is not there."],
    v: "Receive, issue and transfer a known set of items, then recompute balances from the movement lines and confirm they match the cached balances and the inventory account value.",
    dep: ["item-master","goods-receipt","append-only-storage","costing-methods"]
  },
  "costing-methods": {
    s: "The rule that assigns a cost to each issue from stock: first-in first-out, weighted average, standard cost or specific identification, each with different effects on margin.",
    d: "With layers, an issue consumes the oldest receipts first. With moving average, cost is recomputed on each receipt. With standard cost, issues use a set price, and the difference from actual goes to variance accounts. The method decides what is posted to cost of goods sold and what stays on the balance sheet. It is hard because the methods interact with back-dated entries, returns and landed costs, and must be applied identically in every ledger book that has to follow a different standard.",
    k: ["Standard cost versus actual cost: standard gives stable margins and clear variance analysis and demands periodic rate setting, while actual follows reality and makes product margin noisy.", "Recalculate on late cost changes versus freeze at issue: recalculation keeps values correct and rewrites history, while freezing leaves adjustments for the period when they were found."],
    p: ["Changing standard costs mid-period without revaluing stock leaves the inventory account out of line with quantity times cost.", "A return valued at today's average rather than the original cost creates phantom profit."],
    v: "Receive two lots at different prices, issue one unit under the chosen method, and confirm the posted cost of goods sold equals the hand-computed figure and the remaining stock value is the rest.",
    dep: ["stock-ledger","item-master","parallel-ledgers"]
  },
  "landed-cost": {
    s: "Allocates freight, duty, insurance and handling charges onto the cost of the received items, so inventory is valued at what it truly cost to bring to the door.",
    d: "Charges arrive on separate supplier invoices, often after the goods. They are collected into a landed cost document, allocated across receipt lines by value, weight, volume or quantity, and added to item cost. If the goods are already sold, a share goes to cost of goods sold. The difficulty is timing and rounding: allocation must sum exactly, and recalculations after partial sales have to be sensible.",
    k: ["Allocate by value versus by weight or volume: value is simple and burdens expensive items with freight that depends on size, while physical bases are fairer and need clean item data.", "Capitalize all charges versus expense small ones: capitalizing is correct and tiresome, while a threshold saves effort and breaks strict policy."],
    p: ["Duty invoice arrives after the goods are sold and the extra cost is stuck on empty stock.", "Allocation rounding leaves a few cents unassigned, so the document never fully reconciles."],
    v: "Receive three items, add a freight invoice, and confirm the allocated amounts sum exactly to the invoice and each item's unit cost rises by its allocated share.",
    dep: ["goods-receipt","costing-methods","invoice-capture","stock-ledger"]
  },
  "valuation-and-revaluation": {
    s: "Reports the value of stock at cost and adjusts it down to net realizable value or to new standard costs, posting the difference to the ledger.",
    d: "Inventory value is quantity times cost by item and location, and must reconcile to the inventory control account. Revaluation changes unit cost across existing stock, such as a new standard, and posts the difference. Write-downs cover obsolescence, damage and market declines. The period-end valuation report is the main tie-out between the stock ledger and the general ledger, and differences are investigated item by item.",
    k: ["Continuous perpetual posting versus periodic valuation: perpetual postings keep the ledger current with every movement, while periodic runs are cheaper and leave the ledger stale between runs.", "Write-down by rule versus by judgment: rules are consistent and may over- or under-reserve, while judgment fits the facts and is harder to audit."],
    p: ["Valuation run before all receipts are in produces a ledger difference that vanishes mysteriously the next day.", "A write-down is booked but the item cost is not reduced, so the next sale is expensed at the old cost."],
    v: "Run the valuation report at period end and confirm its total equals the inventory control account to the cent, listing zero unexplained items.",
    dep: ["stock-ledger","costing-methods","subledger-reconciliation","posting-engine"]
  },
  "bill-of-materials": {
    s: "The structured list of components, quantities and routing steps needed to make an item, with versions and effective dates, used for planning and for costing finished goods.",
    d: "A bill lists components with quantities, scrap allowances and alternates, possibly several levels deep. Routings add operations, work centers and times. Versions have effective dates and approval, so production uses the right one. Costs roll up from components and operations to a standard cost. The difficulty lies in versions and engineering changes, since the bill in force at production time, not today, must drive both consumption and cost.",
    k: ["Single level bills versus multi-level: multi-level reflects reality and makes cost rollup and where-used analysis heavier, while single level suits simple assembly.", "Engineering changes effective by date versus by serial number: dates are simple and wrong for stock in the pipeline, while serial effectivity is exact and demands tracking."],
    p: ["A cost rollup run on a draft version changes standard costs for every parent item.", "A circular bill, where a part contains itself through a subassembly, makes the rollup loop forever."],
    v: "Roll up cost for a two-level product and confirm it equals the sum of component costs times quantities plus operation costs, and that changing a component price changes only dependent products.",
    dep: ["item-master","costing-methods"]
  },
  "production-costing": {
    s: "Collects material, labor and overhead into work orders, moves value from raw material and work in progress to finished goods, and posts the variances.",
    d: "Issuing material to a work order moves value from stock to work in progress. Labor and machine time add their rates, and overhead is absorbed by a rule. Completion moves the accumulated cost to finished goods; the difference against standard becomes variances. Scrap and rework add noise. The hard part is the work in progress balance at period end, because orders in flight carry costs that must be valued sensibly and reversed correctly.",
    k: ["Absorb overhead by labor hours versus machine hours: each fits different plants, and a wrong base shifts cost between products without any real change.", "Backflush consumption at completion versus issue as used: backflushing saves transactions and hides shrinkage, while explicit issue is accurate and labor-intensive."],
    p: ["Work orders left open for months hold value in work in progress that belongs in finished goods or expense.", "Backflushing from an outdated bill consumes the wrong materials and destroys stock accuracy."],
    v: "Complete a work order and confirm material plus labor plus overhead equal the finished goods increase plus variances, and that work in progress for the order is zero afterward.",
    dep: ["bill-of-materials","stock-ledger","costing-methods","allocations"]
  },
  "fixed-asset-register": {
    s: "A record of every capital asset with acquisition cost, dates, life, location, owner and status, serving as the subledger for property and equipment accounts.",
    d: "Assets are created from invoices, constructions in progress or transfers. Each has a class, life, depreciation method and, often, parallel books for tax and financial reporting. Events include additions, improvements, transfers, impairment, disposal and sale. Each posts to the ledger and updates the register. Physical existence checks compare the register with what is actually on site. Difficulty comes from mass assets, component accounting and keeping book and tax values separately but consistently.",
    k: ["Capitalize at invoice posting versus a separate asset acquisition step: automatic creation saves effort and creates assets from coding mistakes, while a step lets finance review the capital decision.", "Component-level assets versus one record per purchase: components give correct lives for parts and multiply records."],
    p: ["Assets bought in the period but never placed in service accumulate in construction-in-progress with no depreciation.", "Disposals recorded in the register but not in the ledger leave ghost assets and wrong gains."],
    v: "Acquire an asset, depreciate for a month, dispose of it, and confirm the register's cost and accumulated depreciation equal the ledger accounts before and after, with the gain or loss posted.",
    dep: ["chart-of-accounts","parallel-ledgers","invoice-capture","subledger-reconciliation"]
  },
  "depreciation-engine": {
    s: "Calculates periodic depreciation for every asset under each book's method, such as straight line or declining balance, and posts the expense and accumulated depreciation.",
    d: "For each asset and book the engine determines the depreciable base, remaining life and period charge, handling partial first and last periods by a convention. A run creates journals by account and dimension and records them on the asset. Backdated additions and life changes require catch-up charges. It is hard because rules differ by book and jurisdiction, runs touch many assets in one transaction, and a run must be repeatable and reversible.",
    k: ["Run depreciation on a schedule versus calculate on demand: schedules provide fixed postings that can be audited and cannot respond to retroactive changes, while on-demand views are always current.", "Daily versus monthly convention for partial periods: daily is precise and creates odd amounts, while monthly rules are simple and distort short holdings."],
    p: ["A run in a closed period is rejected after calculating half the assets and leaves the register partly updated.", "A life change applied without catch-up depreciation leaves the asset over- or under-depreciated for years."],
    v: "Run depreciation twice for one period and confirm the second produces no new entries, then change an asset's life and confirm the catch-up entry makes accumulated depreciation equal the recomputed figure.",
    dep: ["fixed-asset-register","posting-engine","period-controls","batch-scheduler"]
  },
  "project-accounting": {
    s: "Tracks costs, billing and revenue for each project or contract, with budgets, work breakdown, time and expense capture and profitability by project.",
    d: "A project has a structure of tasks, budgets, a billing method such as time and materials, fixed price or milestone, and a cost sharing arrangement. Time sheets, expenses, purchases and inventory issues are charged to project tasks and costed. Billing converts costs and milestones into invoices; revenue recognition follows the contract. The challenge is mixing accrual with operational data from many sources and reporting over-and-under billing at any date.",
    k: ["Project as an analytic dimension versus a first-class ledger of its own: a dimension is cheap and enough for tagging, while a separate ledger supports budgets, billing rules and work in progress reporting.", "Cost at standard rates versus actual: standard rates keep time entry timely and ignore pay changes, while actual rates need payroll data and arrive late."],
    p: ["Unapproved time sheets are left out of billing, and revenue slips into the next period.", "Costs charged to a closed task are rejected and end up on a generic overhead project, hiding losses."],
    v: "Charge time and an expense to a fixed-price project and confirm cost to date, percent complete, billed amount and over- or under-billing agree with a hand calculation.",
    dep: ["analytic-dimensions","revenue-recognition","invoicing","expense-reports"]
  },
  "lease-accounting": {
    s: "Models leases as a right-of-use asset and liability with interest and amortization schedules, remeasurements on changes and the journals for both parties' accounting standards.",
    d: "A lease contract defines payments, term, options and discount rate. The engine computes the present value, builds a schedule, and posts monthly interest and amortization. Modifications, extensions and terminations trigger remeasurement. It sits between payables, which pays the rent, and fixed assets, which holds the asset. The difficulty is judgment inputs such as discount rate and option likelihood, and carrying correct schedules for hundreds of leases through changes.",
    k: ["Dedicated lease module versus spreadsheets: a module has controls, reproducible schedules and links to payables, while spreadsheets are flexible and fragile at audit time.", "Remeasure on each change automatically versus on review: automatic updates keep the books correct and apply input mistakes immediately."],
    p: ["A lease renewal is signed but never entered, so the liability and the asset stay understated.", "Rent invoices coded to expense directly double count with the lease amortization entries."],
    v: "Enter a lease, post three months, and confirm the liability equals the present value of remaining payments, and interest plus principal equals the cash paid.",
    dep: ["fixed-asset-register","payables-ledger","currencies-and-rates","posting-engine"]
  },
  "bank-reconciliation": {
    s: "Compares the bank's statement lines with the ledger's cash postings, matching them and listing outstanding items so the book balance explains the bank balance.",
    d: "Statement lines are imported and matched to ledger or subledger entries by reference, amount and date, using rules. Unmatched statement lines create adjustments such as fees and interest; unmatched book entries are outstanding checks or deposits in transit. The result is a statement showing bank balance, adjustments and book balance agreeing. It is hard because matching is many-to-many, banks batch entries, and timing differences span periods.",
    k: ["Automatic rule-based matching versus manual: rules clear the bulk and are subtly wrong in edge cases, while manual matching is accurate and does not scale.", "Reconcile daily versus at month end: daily finds problems early and spreads work, while month-end is simpler and discovers fraud late."],
    p: ["A reconciling difference forced to zero with a plug entry hides a real missing payment.", "Statements imported twice duplicate lines and create phantom outstanding items."],
    v: "Import a statement, match it, and confirm that bank balance plus deposits in transit minus outstanding checks equals the cash ledger balance, with zero unexplained difference.",
    dep: ["bank-connectivity","general-ledger","journal-entries","account-reconciliation"]
  },
  "expense-reports": {
    s: "Lets employees claim reimbursement for business spending with receipts, policy checks, approval and posting to expense accounts, and tracks corporate card transactions.",
    d: "An employee builds a report from receipts and card transactions, assigning category, project and dimensions. Policy rules flag limits, missing receipts and duplicates. Approvers review, finance audits samples, and approved reports post to expense accounts and create payables to the employee. Taxes on recoverable amounts and per diem rules complicate it, as do foreign currency expenses converted at a date rate.",
    k: ["Audit every report versus a risk-based sample: full audit is safe and slow, while sampling is efficient and depends on a good risk model.", "Corporate card feed versus out-of-pocket reimbursement: feeds give timely, complete data and require matching; reimbursement is simpler and misses spending that is never claimed."],
    p: ["Reports split into amounts below the approval limit avoid review.", "Foreign receipts converted at claim date instead of spend date misstate expense and employee payable."],
    v: "Submit a report with a receipt-less item above policy and a duplicate and confirm both are flagged, then approve the clean lines and confirm one payable to the employee equals their total.",
    dep: ["approval-workflows","analytic-dimensions","payables-ledger","anomaly-detection","tax-determination"]
  },
}
);
