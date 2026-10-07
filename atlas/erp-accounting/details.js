// Details for the ERP & accounting plate, part 1: interfaces, integrations, sales and receivables.
ATLAS.details("erp-accounting", {
  "role-workspaces": {
    s: "Landing pages tailored to a job, such as payables clerk or controller, showing that role's queues, alerts and key figures and hiding everything else.",
    d: "A workspace is a configured set of tiles: work queues, saved reports, shortcuts and alerts, each bound to a permission. The role comes from the identity layer, and the same user can hold several. Queues are queries over open documents, such as invoices on hold or journals awaiting approval, with counts refreshed on a schedule. The hard part is cost: dozens of live counters per user per page load can hit the transactional store harder than the postings they summarize.",
    k: ["Live counts versus cached counts: live figures are always right but load the transactional store; cached ones are cheap but can show an empty queue while work waits.", "Role-defined versus user-defined layouts: fixed layouts keep training and support simple, while personal layouts please power users and hide the queues a control depends on."],
    p: ["A queue tile filtered by the wrong entity shows zero items, and the real backlog ages unseen until close.", "Counters running unindexed queries make the home page the slowest screen in the product."],
    v: "Log in as a payables clerk, hold three invoices, and confirm the queue tile shows exactly three, links to those three, and shows none for a user in a different entity.",
    dep: ["identity-and-roles","approval-workflows"]
  },
  "transaction-entry-forms": {
    s: "The screens where people key invoices, journals, receipts and orders, validating as they type and refusing to save an unbalanced or unauthorized document.",
    d: "A form edits a draft document: a header and lines, with defaults filled from master data and dimensions copied down. Validation runs in layers: field format, cross-field rules, then posting-time checks such as open period and balanced totals. Drafts can be saved incomplete, but only a validated document can be submitted. Difficulty lies in speed for heavy users who key thousands of lines, and in showing posting consequences before commitment, such as the accounts and amounts that will result.",
    k: ["Validate on every keystroke versus on submit: instant feedback helps accuracy but chatters against the server, while submit-only checks surface errors late and in bulk.", "Preview of postings versus trust in setup: showing the journal before posting catches mapping errors but adds a step users learn to click through."],
    p: ["Defaults copied from a master record that later changed make old drafts post to accounts that are now blocked.", "A paste of hundreds of lines times out and leaves a half-saved document that looks complete."],
    v: "Enter an invoice with a line missing a required dimension and confirm submission is refused with the field named. Fix it, preview the posting, and confirm debits equal credits.",
    dep: ["business-rules","document-numbering","posting-profiles"]
  },
  "drilldown-navigation": {
    s: "The ability to click any figure in a report and descend through account, journal, subledger document and source attachment until the originating business event is on screen.",
    d: "Every ledger line stores a reference to its source document and every document stores its lines, so a drill path is a chain of keyed lookups rather than a recomputation. Reports carry the filter that produced each cell, so a click re-runs it at finer grain. The challenge is that aggregates are often stored or cached: a drill that returns a different total than the cell it came from destroys trust, so the two paths must read the same posted data.",
    k: ["Drill from stored aggregates versus recompute from lines: stored is fast but can disagree with detail after a late posting; recomputing is always consistent and slow on large ledgers.", "Navigate to the source document versus the journal only: reaching the document answers the auditor's question, but requires every subledger to expose a stable viewer."],
    p: ["A cell built from summary tables disagrees with its drill-down after a reversal, and nobody can say which is right.", "Drill into archived periods fails with a blank page instead of explaining where the data went."],
    v: "Pick a single reported expense total, drill to its journal lines, and confirm the line amounts sum exactly to the cell and each opens the originating supplier invoice.",
    dep: ["general-ledger","balance-aggregates","audit-trail"]
  },
  "self-service-portals": {
    s: "Restricted web views where customers see invoices and pay them, and suppliers see orders, submit invoices and check payment status, without a license or an account clerk.",
    d: "A portal is a separate identity realm bound to one customer or vendor record. It reads a narrow slice of the receivables or payables data and writes only drafts: a supplier submits an invoice that enters capture like any other, and a customer payment is handed to a payment gateway. It reduces calls and email, and it exposes the system to the internet, so every query must be scoped to the external party and every write must be treated as untrusted input.",
    k: ["Portal writes become drafts versus post directly: drafts keep the ledger safe from outside input, but add internal review that suppliers experience as delay.", "Separate portal database replica versus shared store: a replica isolates load and breach impact, but shows data that lags the books."],
    p: ["A missing party filter lets one supplier read another's remittance advice, a reportable data breach.", "Bank detail changes made through the portal are accepted without callback verification and redirect a payment run."],
    v: "Log in as one supplier and request another supplier's invoice by guessing its identifier; confirm the request is denied and logged. Submit an invoice and confirm it appears in capture as a draft.",
    dep: ["vendor-master","customer-master","identity-and-roles","invoice-capture"]
  },
  "mobile-and-receipt-capture": {
    s: "Phone-based entry for expenses, approvals and receipts: photograph a receipt, extract amount and date, and attach it to an expense line or approval request.",
    d: "The app captures an image, runs text extraction in the cloud or on the device, proposes merchant, date, amount and category, and lets the user correct them before submission. Offline use queues drafts for later sync. Approvals arrive as push notifications with enough context to decide. Hard parts are extraction accuracy on crumpled or foreign receipts, duplicate submission of the same receipt, and keeping the original image as evidence for years.",
    k: ["Extraction suggests versus extraction decides: suggestions keep a human accountable but slow entry, while auto-filled fields speed it and push errors into the books.", "On-device versus server extraction: on-device works offline and keeps images private, while server models are more accurate and easier to update."],
    p: ["The same receipt photographed twice becomes two reimbursed expenses because no image fingerprint was compared.", "Approving from a notification shows only a total, so approvers rubber-stamp without seeing the lines."],
    v: "Photograph one receipt twice and submit both; confirm the second is flagged as a duplicate. Approve a request from a phone and confirm the approver, device and time appear in the audit trail.",
    dep: ["expense-reports","document-attachments","approval-workflows","anomaly-detection"]
  },
  "rest-and-event-apis": {
    s: "The programmatic interface to the system: synchronous calls to create and read documents, and published events when postings, approvals and payments change state.",
    d: "Calls accept documents in an external shape, map them to internal ones, and run the same validation and posting rules as the screens, never a shortcut around them. Events carry a document type, identifier and version so consumers can fetch current state. Authentication is per integration with scoped permissions. The hard problems are idempotency, since a retried call must not post twice, and versioning, since customers' integrations outlive several product releases.",
    k: ["Idempotency keys supplied by the caller versus server-side duplicate detection: keys are exact but burden every client; detection by content can wrongly merge two real identical invoices.", "Events with full payload versus identifiers only: full payloads save a round trip but leak data and go stale, while identifiers force consumers to call back."],
    p: ["A client retries after a timeout and the invoice posts twice because the first call had succeeded.", "An API path skips an approval rule enforced in the screens, and the control is bypassed by any integration."],
    v: "Send the same create-invoice request twice with one idempotency key and confirm one document exists. Subscribe to the event feed and confirm the posting event arrives once with the new document version.",
    dep: ["identity-and-roles","business-rules","integration-queues","posting-engine"]
  },
  "bank-connectivity": {
    s: "Exchange of statements and payment instructions with banks: importing daily balances and transactions, and sending credit transfers and direct debits in the bank's file or network format.",
    d: "Inbound statements arrive in structured file formats or through bank APIs, are parsed into statement lines and fed to reconciliation. Outbound payment files carry beneficiary details, amounts and references, signed or authenticated under the bank's scheme. Acknowledgments come back per file and per payment. It is hard because every bank and country differs in format details, cutoffs and rejection codes, and because a payment file, once sent, is effectively irreversible.",
    k: ["Direct bank API versus file exchange through a gateway: APIs are faster and richer but bank-specific, while gateways give one format at the cost of delays and a middleman.", "Dual authorization at the bank versus only inside the ERP: bank-side approval survives a compromised ERP, but slows every run and splits control across two systems."],
    p: ["A file resent after a timeout pays every supplier twice because no one checked the bank acknowledgment first.", "A rejected payment returns days later with a cryptic code and the invoice stays marked as paid."],
    v: "Send a test payment file, confirm the acknowledgment marks each payment accepted or rejected with the bank's reason, and import the next-day statement to see the debit appear once.",
    dep: ["payment-runs","bank-reconciliation","integration-queues","encryption-and-masking"]
  },
  "edi-and-einvoicing": {
    s: "Structured business documents exchanged between companies or with tax authorities: orders, advance shipping notices and invoices in agreed standards, sometimes cleared by a government network.",
    d: "Inbound documents are validated against a schema and business rules, matched to a trading partner, and converted into internal orders or invoices. Outbound ones are generated from posted documents, signed, delivered and acknowledged. Some jurisdictions require the invoice to be registered with the authority before it is legally valid, so posting waits on a response. Partner-specific variations, mandatory fields and clearance outages make this the most operationally fragile integration.",
    k: ["One canonical internal model with per-partner mappings versus per-partner code: mappings centralize rules and can be reviewed, but hide partner exceptions inside configuration.", "Post then clear versus clear then post: posting first keeps books current but may need reversal on rejection; clearing first delays the ledger on an outside system."],
    p: ["A partner changes one optional field to mandatory and every invoice to them is rejected until someone notices.", "A cleared invoice is edited locally afterwards and no longer matches what the authority holds."],
    v: "Send a sample purchase order through the partner channel and confirm a matching acknowledgment arrives, then issue an invoice and confirm the authority's clearance identifier is stored on it.",
    dep: ["integration-queues","invoicing","tax-returns","customer-master"]
  },
  "bulk-import-export": {
    s: "Spreadsheet and file-based loading and extraction of documents and master data, with row-level validation and the ability to reject or partially accept a batch.",
    d: "An import reads a template into a staging area, validates each row with the same rules as entry, reports failures with row numbers, and only then posts or creates records. Exports write ledger and master data in stable column layouts for analysts, auditors and downstream systems. Large files are processed as batch jobs. The difficulty is atomicity: whether one bad row fails the whole file, and how to guarantee that a rerun after a fix does not duplicate the good rows.",
    k: ["All-or-nothing versus partial acceptance: all-or-nothing keeps batches consistent but blocks on one bad row, while partial acceptance leaves operators to track which rows still need work.", "Staging then validate then post versus direct load: staging is safer and reviewable, but doubles storage and adds a step for urgent loads."],
    p: ["A journal import with rounding differences in a spreadsheet posts unbalanced pairs that are silently adjusted to a suspense account.", "Reuploading a corrected file creates second copies of the rows that had already loaded."],
    v: "Import a file with one invalid row and confirm the report names that row and reason. Fix and reimport the same file and confirm exactly one copy of each valid row exists.",
    dep: ["batch-scheduler","business-rules","journal-entries"]
  },
  "commerce-and-crm-sync": {
    s: "Continuous exchange with storefronts, subscription billing and customer relationship systems: orders, customers, prices and payment settlements flow in, and invoice status flows back.",
    d: "Orders and payments arrive from channels in channel formats and are mapped to sales documents and cash receipts. Settlement reports from payment processors are matched to the bundles of orders they pay, with fees, refunds and chargebacks posted separately. Customer and product records are synchronized so both sides agree on identity. The hard part is volume and grain: thousands of small orders and one net bank deposit that must be reconciled to them.",
    k: ["Post each order individually versus summarize by day: per-order posting preserves detail and bloats the ledger, while summaries keep it small and push detail to a side store.", "ERP as master of customer data versus the CRM as master: a single owner prevents conflicts, but the other system's users then wait on a sync or a manual fix."],
    p: ["Processor fees netted out of the deposit are never posted, so receivables are cleared for the gross amount and cash never matches.", "Two systems create the same customer under slightly different names, and credit limits are split."],
    v: "Run a day of test orders through the channel, then compare the settlement deposit with the sum of order totals minus recorded fees and refunds; the difference must be zero.",
    dep: ["customer-master","quotes-and-orders","cash-application","integration-queues"]
  },
  "integration-queues": {
    s: "Durable message queues, retry rules and a dead-letter store that carry every inbound and outbound exchange, so failures are visible, replayable and never silently lost.",
    d: "Each external message is stored before it is processed, assigned a status, and handled by a worker that retries transient errors with backoff and parks permanent errors for a human. Operators see queues by integration with counts, ages and error text, and can fix data and replay. Ordering and exactly-once effects are hard: a retried message must produce one document, and two messages about the same document must not overtake each other.",
    k: ["Strict ordering per document versus maximum parallelism: ordering prevents an update arriving before its create, at the cost of one slow message blocking the rest.", "Automatic retry forever versus a limit and a dead-letter store: endless retry hides a poison message, while limits require someone to watch and own the dead letters."],
    p: ["A dead-letter store nobody monitors holds two weeks of unposted supplier invoices until the close.", "A replay after a fix re-sends messages that had partly succeeded and duplicates the downstream effect."],
    v: "Make the downstream endpoint fail, send a message, and confirm it retries with backoff, lands in dead letters after the limit, and replays once after the endpoint recovers, producing a single document.",
    dep: ["transactional-store","batch-scheduler"]
  },
  "customer-master": {
    s: "The record for each customer: legal name, addresses, tax registrations, payment terms, credit limit, currency and the receivables account it posts to.",
    d: "A customer record is split into a global identity and per-entity sales and finance data, because the same buyer may be served by several legal entities on different terms. Changes to bank details, credit limits and terms are controlled and audited, as they affect cash and risk. Merging duplicates is hard because history references the old record and must keep meaning what it meant when it was posted.",
    k: ["One record per entity versus a shared global party: per-entity records keep legal separation clean, while a global party enables group credit exposure and avoids duplicates but needs careful scoping.", "Effective-dated terms versus overwriting: dating terms keeps old invoices explainable, at the cost of every lookup needing a date."],
    p: ["A duplicate customer created at entry splits payments and credit limits, and collections chases the wrong balance.", "A tax registration number left unvalidated makes every invoice to that customer invalid for the buyer's own tax recovery."],
    v: "Create a customer, change its payment terms, and confirm new invoices use the new terms, an old invoice keeps its own, and the audit trail shows who changed it and when.",
    dep: ["legal-entities","tax-codes","audit-trail","chart-of-accounts"]
  },
  "quotes-and-orders": {
    s: "Commercial documents that precede an invoice: quotations, sales orders and their lines, with pricing, availability checks, credit checks and fulfillment status.",
    d: "An order captures what was promised: items, quantities, prices, discounts, delivery dates and terms. On confirmation it may reserve stock, check credit and notify fulfillment. Orders have no ledger effect in most systems, but they feed the revenue and inventory processes: shipments or milestones trigger invoices. The difficulty is change: partial deliveries, price changes, returns and cancellations all create deltas against a document that has already caused downstream commitments.",
    k: ["Price fixed at order versus price at invoice: fixing protects the customer's quote and complicates price changes, while repricing at invoice surprises customers and breaks contracts.", "Hard credit stop versus warning: a stop contains risk and blocks revenue on mistakes, while a warning leaves the decision to a person who may be absent."],
    p: ["An order edited after a partial shipment leaves invoiced and delivered quantities that no longer reconcile.", "Credit checks use an outdated balance because open orders and unapplied cash were not included."],
    v: "Place an order above the credit limit and confirm it is held with the limit and exposure shown. Ship half, edit the order, and confirm the invoiced quantity equals the shipped quantity.",
    dep: ["customer-master","item-master","receivables-ledger"]
  },
  "invoicing": {
    s: "Turns shipments, services, time or contract schedules into legal invoices with numbering, tax, terms and the journal that debits receivables and credits revenue and tax.",
    d: "Invoices are generated by event (a shipment), by schedule (a subscription) or by milestone, then tax is determined per line and the document is numbered from a legal sequence. Posting creates a receivable and the revenue or deferred revenue entries in a single balanced journal. Credit notes and corrections are separate documents referencing the original. Hard parts are gapless numbering under concurrency, rounding between line and total tax, and the formats required by each country.",
    k: ["Batch generation versus invoice at the moment of event: batches are efficient and keep cutoffs predictable, while immediate invoices improve cash timing but tie performance to operational peaks.", "Edit a posted invoice versus issue a credit note and a new invoice: credit notes preserve the legal record and the trail, and cost two documents for one typo."],
    p: ["Gapless numbers are allocated before posting and a failed post leaves a hole that an auditor must be shown how to explain.", "Per-line rounding differs from the tax authority's total rounding, so every invoice is off by a cent."],
    v: "Generate one hundred invoices concurrently and confirm the numbers run consecutively with no gaps or repeats, and that each journal balances and its tax lines equal the computed tax.",
    dep: ["quotes-and-orders","tax-determination","document-numbering","posting-engine","revenue-recognition"]
  },
  "revenue-recognition": {
    s: "Decides when billed amounts become revenue, splitting contracts into obligations and releasing deferred revenue to income as each is delivered over time or at a point.",
    d: "A contract is parsed into performance obligations with allocated prices. Each has a rule: a point in time, straight line over a term, or percentage of completion. A schedule engine produces the periodic journals that move amounts from deferred revenue to revenue, and contract changes reallocate the remaining price. It is hard because modifications, bundles, discounts and variable consideration require judgment that must still be applied consistently and explained to auditors.",
    k: ["Rules engine with configurable obligation types versus hard-coded patterns: configuration covers new contract shapes without a release, but complex logic is then hidden in setup nobody reviews.", "Compute schedules on demand versus store them: stored schedules are auditable and stable, while on-demand computation adapts to changes and is harder to prove later."],
    p: ["A contract amendment mid-period reallocates price, but the schedule for prior periods is not catch-up adjusted, so the year is misstated.", "Revenue releases run after the period is closed and land in the wrong period."],
    v: "Book a twelve-month subscription billed upfront, run six months of releases, and confirm deferred revenue is exactly half the billed amount and recognized revenue the other half.",
    dep: ["invoicing","journal-entries","fiscal-calendars","recurring-and-reversing"]
  },
  "receivables-ledger": {
    s: "The subledger holding every open and cleared customer item with its due date, currency and status, whose total must always equal the receivables control account.",
    d: "Each invoice, credit note, payment and adjustment is an item. Matching a payment to an invoice clears both and records the date and any difference. Queries give aging by customer, by due date and by dimension. The subledger posts to a control account in the general ledger, and a control account cannot be posted to directly. It is hard because partial payments, unapplied cash, disputes and foreign currency each create items that sit open for long periods.",
    k: ["Open-item management versus balance forward: open items let each invoice be tracked and disputed, while balance forward is simpler and hides which invoice is unpaid.", "Control account closed to manual posting versus allowed: closing it guarantees the subledger agrees with the ledger, but forces every correction through a subledger document."],
    p: ["A manual journal to the control account makes the ledger and the subledger disagree and no one can find the difference.", "Foreign currency items are never revalued, so aging reports use stale local values."],
    v: "Compare the sum of open items by currency with the control account balance after posting a mix of invoices, partial payments and credits; the difference must be exactly zero.",
    dep: ["customer-master","general-ledger","subledger-reconciliation","fx-revaluation"]
  },
  "cash-application": {
    s: "Matches incoming payments, from bank statements, lockboxes and remittance advices, to open invoices, clearing items and handling short pays, overpayments and unidentified receipts.",
    d: "Incoming bank lines are parsed for reference numbers, amounts and payer names, then matched by rules, from exact invoice reference to fuzzy amount combinations. Unmatched cash goes to an unapplied account for a person. Short payments create dispute or write-off entries, discounts are taken within terms, and currency differences post as gains or losses. The challenge is that customers pay several invoices with one transfer and give inconsistent references.",
    k: ["Automatic matching with high confidence only versus aggressive matching: conservative rules rarely misapply but leave a manual queue, while aggressive ones clear more and sometimes clear the wrong invoice.", "Apply at receipt versus at identification: applying on receipt shows true cash early, while waiting avoids unwinding applications made on a wrong guess."],
    p: ["A lump-sum payment matched to the oldest invoices leaves a disputed invoice marked paid.", "Unapplied cash accumulates unnoticed, and customers are dunned for invoices they paid."],
    v: "Import a statement with one payment covering three invoices and one with no reference; confirm the first clears exactly the three items and the second lands in unapplied cash with the payer name shown.",
    dep: ["receivables-ledger","bank-reconciliation","bank-connectivity","currencies-and-rates"]
  },
  "collections-and-dunning": {
    s: "Chases overdue invoices by sending escalating reminders, recording promises to pay and disputes, and scoring customers by risk to prioritize the collector's day.",
    d: "A dunning procedure defines levels by days overdue, each with a letter, fee and block rule. A collector sees a worklist ranked by amount and risk, with call notes, promised dates and disputed items excluded from reminders. Disputes route to sales or operations for a decision and may end in a credit note. The hard parts are accuracy, since a reminder for an already-paid invoice damages a relationship, and coordination between collection and sales.",
    k: ["Automatic dunning letters versus collector-approved: automatic scales and sends errors at once, while approval keeps judgment and slows large volumes.", "Credit hold on first overdue versus later escalation: early holds protect cash but interrupt good customers over small amounts or disputes."],
    p: ["Reminders go out for invoices disputed or in a payment plan because those flags were not read by the dunning run.", "Unapplied cash is not considered, and a paying customer receives a final notice."],
    v: "Age one invoice past each dunning level and confirm the correct letter generates at each, then mark it disputed and confirm no further letter is produced.",
    dep: ["receivables-ledger","cash-application","customer-master","batch-scheduler"]
  },
}
);
