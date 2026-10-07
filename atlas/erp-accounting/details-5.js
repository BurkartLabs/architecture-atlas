// Details for the ERP & accounting plate, part 5: configuration, data and security, and cross-cutting concerns.
ATLAS.details("erp-accounting", {
  "custom-fields": {
    s: "Lets customers add their own fields and record types to standard documents and master data, with validation and reporting support, without changing the product's code.",
    d: "A field definition has a name, type, validation, default, visibility and the objects it attaches to. Values are stored in extension tables or typed columns, and appear on forms, reports, imports and APIs. Custom fields can be required in workflows or used as dimensions. The challenge is that every added field must survive upgrades, perform in queries, be secured like standard fields and never alter posting logic, which only standard fields drive.",
    k: ["Typed extension columns versus generic key-value storage: typed columns index and report well and need schema changes, while key-value storage is flexible and slow to query at scale.", "Fields allowed to feed posting rules versus display only: letting them drive accounts is powerful and puts the ledger at the mercy of customization, while display-only keeps books safe and limits usefulness."],
    p: ["A mandatory custom field added to a document breaks every integration that creates it.", "Deleting a field removes the values that audit trails and old reports still reference."],
    v: "Add a required custom field to purchase orders, create an order through the screen and the API, and confirm both enforce it, the value appears in the order report, and an upgrade test keeps its data.",
    dep: ["configuration-management","identity-and-roles","transactional-store"]
  },
  "business-rules": {
    s: "A configurable engine of conditions and actions, such as validations, defaults, routing and notifications, that adapts process behavior per company without code.",
    d: "Rules fire on events such as save, submit or post, evaluate conditions over the document and its related data, and apply actions: reject with a message, set a field, start a workflow or call out. Rules are ordered, versioned and tested in a non-production environment. The hazard is hidden complexity: dozens of rules interact in unexpected ways, and a rule that changes data during posting can undermine invariants the posting engine depends on.",
    k: ["Declarative rules versus scripts: declarative rules are reviewable and limited, while scripts can do anything and need development discipline and sandboxing.", "Rules run before commit versus after: before-commit rules can block bad data and slow every save, while after-commit rules cannot undo and are cheaper."],
    p: ["Two rules set the same field to different values, and the result depends on execution order.", "A rule calling an external service makes document saving fail whenever that service is slow."],
    v: "Define a rule rejecting journals without a reason code, then post one with and one without, and confirm the second is refused with the rule's message and that the rule's version and change history are recorded.",
    dep: ["configuration-management","approval-workflows"]
  },
  "document-numbering": {
    s: "Allocates the identifiers for documents such as invoices, journals and payments from configured sequences, with prefixes, resets and, where law requires, gapless and ordered numbers.",
    d: "A sequence is defined per entity, document type and year, with a format. Allocation happens at creation or at posting. Gapless sequences need the number to be assigned inside the same transaction that commits the document, which serializes concurrent users on a lock; sequences that allow gaps use cached ranges and scale better. Voided numbers must be kept and explained. Hard parts are concurrency and keeping legally required sequences separate from internal ones.",
    k: ["Gapless numbers assigned at posting versus allowed gaps assigned at creation: gapless satisfies strict law and serializes the posting path, while gaps scale well and need explanation.", "One sequence per entity versus global: per-entity matches legal expectations, while global ones are unique across the group and meaningless to authorities."],
    p: ["A failed transaction burns a number from a sequence that must be gapless, leaving a hole for the auditor.", "Year reset applied by calendar year when the fiscal year differs produces duplicate numbers."],
    v: "Post many invoices concurrently, with some failing and rolling back, and confirm the committed numbers run consecutively without repeats or gaps, and that voided numbers are listed with a reason.",
    dep: ["legal-entities","transactional-store","posting-locks"]
  },
  "configuration-management": {
    s: "Moves settings, rules and reports between development, test and production environments as versioned packages, with comparison, approval and rollback.",
    d: "Configuration is data: chart of accounts, posting profiles, workflows, tax setup, report layouts and security roles. A change is made in a sandbox, exported as a package, validated against a test copy and applied in production through approval. Differences between environments are shown before applying. Hard parts are dependencies between items, since a mapping needs its account to exist, and environment-specific values, such as bank accounts and endpoints, that must not be copied.",
    k: ["Configuration promoted as packages versus edited directly in production: packages are controlled and traceable and slower, while direct edits are fast and leave no tested path.", "Refresh test from production often versus keep curated test data: frequent copies give realism and expose private data, while curated data is safe and drifts from reality."],
    p: ["A package carries a production bank endpoint into test, and a test payment run sends real files.", "A manual edit in production is overwritten by the next package because nobody recorded it."],
    v: "Change a posting profile in the test environment, export, apply to a second environment, and confirm the comparison report lists exactly that change, postings behave as in test, and rollback restores the prior mapping.",
    dep: ["posting-profiles","audit-trail"]
  },
  "extension-points": {
    s: "Defined places where partners and customers add code, such as hooks around posting, custom documents, reports and integrations, without modifying the core product.",
    d: "Extensions subscribe to events before or after core operations, add fields, screens and background jobs, or call the API. They run in the application process or in a sandbox, with permission scopes and resource limits. Upgrades need a stable contract, so extension APIs are versioned and old ones deprecated slowly. The difficulty is protecting the ledger: an extension must not post outside the posting engine, hold locks for long, or leak data across entities.",
    k: ["In-process extensions versus remote services called over an API: in-process is fast and can crash or stall the system, while remote services isolate failures and add latency and failure modes.", "Wide extension surface versus narrow, stable one: a wide surface lets partners solve more and makes every upgrade a compatibility risk, while a narrow one is safe and frustrating."],
    p: ["An extension writes directly to ledger tables and creates entries the posting engine never validated.", "An upgrade changes an internal method that extensions override, and posting fails after the release."],
    v: "Install a test extension that runs after posting, then run the posting suite and an upgrade; confirm journals are unchanged, the extension saw each event once, and removing it leaves no residue.",
    dep: ["posting-engine","identity-and-roles","rest-and-event-apis"]
  },
  "data-migration": {
    s: "Loads master data, open items and opening balances from legacy systems, reconciles them to the legacy ledgers and proves the new books start from the same position.",
    d: "Migration extracts master data and open documents, cleans and maps them to the new structures, loads them in dependency order, and creates opening balance journals. Open receivables and payables are loaded as items so they can be matched and paid. Trial balances are compared account by account at the cutover date, in rehearsals before the real run. It is hard because legacy data is dirty and unrelated to the new model, and the cutover window is short.",
    k: ["Load open items only versus full history: open items are fast and keep the new system lean, while full history supports reports and comparison and multiplies load time and cleaning.", "Big-bang cutover versus phased by entity: big-bang is clean and risky, while phased reduces risk and requires bridges between old and new systems."],
    p: ["Opening balances loaded without the matching open items leave subledger totals that do not equal control accounts.", "Duplicates in legacy vendors are carried over and the first payment run pays both."],
    v: "In a rehearsal, load a copy of legacy data and compare each account's opening balance and each subledger total with legacy reports at the cutover date; every difference must be zero or explained.",
    dep: ["bulk-import-export","chart-of-accounts","receivables-ledger","payables-ledger","journal-entries"]
  },
  "transactional-store": {
    s: "The transactional database that holds documents, journals and master data, guaranteeing that a posting is applied completely or not at all and that committed postings survive failure.",
    d: "Documents and journal lines are written in one transaction with constraints enforcing keys, required fields and, where supported, balance checks. Isolation and durability settings protect against partial writes and lost commits. Replication and backup serve recovery and read load. The ledger is the table with the heaviest write contention and the longest retention. The hard choices are schema design for sizes of billions of lines, and ensuring application bugs cannot violate accounting rules the database could have enforced.",
    k: ["Enforce accounting constraints in the database versus only in the application: database constraints cannot be bypassed by any client and are limited in expressiveness, while application checks are rich and can be circumvented by direct access.", "Single database for everything versus separate stores for the ledger and for documents: one store keeps transactions atomic, while separation scales independently and needs distributed coordination."],
    p: ["A long reporting query on the primary blocks postings during the end-of-month peak.", "Asynchronous replication loses the last committed postings in a failover."],
    v: "Cut power to the database mid-posting in a test, restart, and confirm every committed document has its balanced journal, no partial document exists, and total debits still equal total credits.",
    dep: ["append-only-storage"]
  },
  "posting-locks": {
    s: "Concurrency control that stops two users or jobs from changing the same document, balance or sequence at once, without letting contention stall the company at close.",
    d: "Documents use optimistic version checks or row locks during edit and posting. Hot rows such as numbering counters, cash account aggregates and inventory balances use short, ordered locks or are redesigned to avoid single points. Long-running batches take period-level or entity-level logical locks. Deadlocks are detected and retried. The difficulty is that financial correctness needs serialization at exactly the places where throughput demands parallelism.",
    k: ["Pessimistic locks while editing versus optimistic version checks: pessimistic prevents conflict and strands locks when users leave, while optimistic is scalable and tells the second user to redo work.", "Lock by entity during batch versus by document: entity locks are simple and block everything else, while fine-grained locks allow parallel work and risk deadlocks."],
    p: ["A payment run holding locks for ten minutes blocks all invoice posting for the entity.", "Two jobs lock the same documents in opposite order and deadlock every night."],
    v: "Run two concurrent postings against the same inventory item and numbering sequence, and confirm both succeed or one retries cleanly, with consistent balances and no duplicate numbers.",
    dep: ["transactional-store"]
  },
  "append-only-storage": {
    s: "Storage rules that make posted ledger lines and audit records insert-only, so history cannot be edited or deleted and a correction is always a new row.",
    d: "Posted tables allow inserts and reads but no updates or deletes, enforced by database permissions, triggers or a storage engine that refuses mutation. Sometimes records are chained with hashes so alteration is detectable. Status columns that must change, such as open or cleared, live in separate tables from the immutable facts. The hard parts are legitimate needs to change data, such as personal data erasure, and migrations that must rewrite old rows without breaking immutability.",
    k: ["Database-enforced immutability versus application convention: database enforcement stops administrators and bugs, while convention is flexible and one script away from a rewrite.", "Hash chain for tamper evidence versus plain immutability: a chain proves no alteration after the fact and costs complexity and write ordering, while plain rules prevent but cannot prove."],
    p: ["A data fix run as a direct update changes posted amounts, and no ledger entry or log shows it.", "Privacy erasure requests conflict with retention law and are handled by nobody."],
    v: "As an application user and as an administrator, try to update and delete a posted ledger line; confirm both fail or are logged and flagged, and that verifying the hash chain over the table reports no break.",
    dep: ["transactional-store","identity-and-roles"]
  },
  "identity-and-roles": {
    s: "Authenticates users, assigns them roles and entity scopes, and answers every permission check in the system, from screen access to approval and posting rights.",
    d: "Users sign in through a company identity provider with multi-factor authentication. Roles bundle permissions by function; scopes restrict them by entity, department or account range. Checks run in every service and in the reporting store. Access reviews recertify who has what. Privileged and emergency access is logged. The difficulty is granularity: permissions fine enough for segregation of duties produce hundreds of roles, and users accumulate access as they change jobs.",
    k: ["Coarse job roles versus fine-grained permissions: coarse roles are easy to assign and over-grant, while fine permissions fit least privilege and become unmanageable.", "Central directory as the source of roles versus roles inside the ERP: central sources keep onboarding and exit consistent, while ERP roles are tailored and drift from HR facts."],
    p: ["A user who changed departments keeps old access and gains conflicting duties.", "A service account for an integration holds posting rights far beyond what the integration needs."],
    v: "Remove a user in the identity provider and confirm all sessions end, API tokens stop working, and an access review report shows no remaining roles; confirm another user cannot reach an entity outside their scope.",
    dep: ["entity-scope-and-tenancy"]
  },
  "encryption-and-masking": {
    s: "Protects data in transit and at rest and hides sensitive fields, such as bank accounts, tax numbers and salaries, from users who do not need to see them.",
    d: "Connections use TLS, and storage uses encryption with managed keys and rotation. Sensitive fields are encrypted individually, shown masked, and revealed only to authorized roles, with each reveal logged. Test and analytics copies are masked or scrambled. The hard parts are searching on encrypted fields, key management and recovery across years of archives, and ensuring that exports and logs do not carry the plain values around.",
    k: ["Field-level encryption versus disk or database-level only: field-level protects against insiders and database administrators and complicates search and reporting, while storage-level covers theft of media only.", "Mask in the application versus in the database: application masking is flexible and bypassed by direct queries, while database-level masking applies to every client."],
    p: ["A test environment refreshed from production carries real bank accounts to developers.", "Key rotation without re-encryption leaves old backups unreadable after the old key is retired."],
    v: "As a user without the right, open a vendor's bank account and confirm it is masked; as an authorized user reveal it and confirm the access is logged; inspect a database dump and a test copy and confirm no plain values appear.",
    dep: ["identity-and-roles","audit-trail"]
  },
  "batch-scheduler": {
    s: "Runs long and recurring jobs such as payment runs, depreciation, revaluation, consolidation and imports on schedules or on demand, with queues, dependencies, retries and logs.",
    d: "Jobs are defined with parameters, owner, schedule and dependencies, and are executed by workers that claim them from a queue, update status and write logs and outputs. Large jobs split into chunks that commit independently so a failure resumes rather than restarts. Resource limits keep jobs from starving interactive users. Each job must be idempotent: rerunning a failed job must not double postings, which is the hardest property to guarantee.",
    k: ["Chunked commits versus one transaction per job: chunks resume after failure and leave partial results visible meanwhile, while one transaction is all-or-nothing and holds locks and logs for a long time.", "Fixed windows at night versus continuous processing: windows keep daytime performance and delay results, while continuous processing keeps data fresh and competes with users."],
    p: ["A job rerun after a crash repeats the part that had committed and posts it twice.", "A silent failure in a nightly job is noticed only when the month-end report is wrong."],
    v: "Kill a large allocation job halfway, restart it, and confirm it completes with exactly one set of entries, the job log shows the resume point, and an alert was raised at the failure.",
    dep: ["transactional-store","posting-locks","identity-and-roles"]
  },
  "archival-retention": {
    s: "Moves old closed-period data to cheaper storage and deletes or holds records by legal rule, while keeping them retrievable for audit and legal requests.",
    d: "Closed periods past an age are moved from the live store to archive tables or object storage, with their documents and attachments, keeping identifiers and links resolvable. Retention classes set minimum and maximum periods by data type and jurisdiction, and legal holds suspend deletion. Archived data must remain readable after upgrades and still reproduce reported numbers. Difficulties are queries spanning archive and live data, and deletion rules that conflict between tax law and privacy law.",
    k: ["Archive to a queryable store versus to cold files: queryable archives allow audit questions and cost more, while cold files are cheap and need a restore process.", "Delete at the end of retention automatically versus review first: automatic deletion complies with privacy law and risks destroying evidence in a dispute, while review is safe and gets postponed."],
    p: ["Archived periods lose their schema version, and old documents cannot be opened after an upgrade.", "A legal hold is placed on a customer but the retention job still deletes their records."],
    v: "Archive a closed year, then run its trial balance and open a document with its attachment from the archive; confirm the figures equal those reported originally and that a record under legal hold survives the retention job.",
    dep: ["general-ledger","document-attachments","transactional-store","audit-trail"]
  },
  "decimal-arithmetic": {
    s: "Exact fixed-point arithmetic and defined rounding for every monetary calculation, so amounts never pick up binary floating-point error and totals agree however they are summed.",
    d: "Amounts are stored as integers of the minor unit or as decimals with explicit scale, and each currency has its own number of decimals. Operations specify rounding mode, usually half-up or the bankers' variant, and where rounding occurs: per line, per document or per total. Percentages, tax, allocation and conversion produce fractions that must be distributed so shares sum to the whole. The hard part is consistency: the same figure computed in the database, application and reports must agree to the cent.",
    k: ["Integers of minor units versus decimal types with scale: integers are fast and exact and awkward for fractions and high-precision rates, while decimals are flexible and easier to misuse.", "Round early at each step versus carry precision to the end: early rounding matches printed documents and accumulates error, while late rounding is accurate and may disagree with a customer's invoice."],
    p: ["A report computing in floating point is off by a cent against the ledger, and reconciliations never close.", "Allocating a total across lines by rounding each share leaves a remainder that no line carries."],
    v: "Allocate one hundred currency units across three equal receivers and confirm the shares sum to exactly one hundred with the remainder placed by a stated rule, and that the same figure matches in database, API and report.",
    dep: []
  },
  "double-entry-invariant": {
    s: "Every posting must balance: total debits equal total credits in each currency and ledger, which is the one property all other accounting integrity rests on.",
    d: "The rule is enforced at the narrowest point, the posting engine and the store, and checked continuously by reports. It constrains design everywhere: every business event must map to a balanced entry, rounding must go to an explicit account, and partial failures must not leave half an entry. Subledgers keep detail, but the ledger remains the sole place where balances change. The invariant cannot prove correctness, only consistency, since the right amounts can sit in the wrong accounts.",
    k: ["Enforce balance in the database versus in the posting service: database enforcement cannot be bypassed and limits batch designs, while service enforcement is flexible and trusted to every code path.", "Balance per document versus per batch: per-document checks isolate faults, while per-batch checks allow multi-document flows and hide the faulty one."],
    p: ["A code path that writes lines directly skips the check and produces a one-sided entry that surfaces at month end.", "Rounding differences silently dumped to a balancing line mask real calculation errors."],
    v: "At any moment, sum debits and credits over the whole ledger by currency and ledger; confirm they are equal, and run a nightly check that fails loudly on the first difference with the offending journal.",
    dep: ["posting-engine","general-ledger","journal-entries","decimal-arithmetic"]
  },
  "correction-by-reversal": {
    s: "Posted records are never edited or deleted: an error is fixed by a reversing entry and a new correct one, so the history of what was believed and when stays intact.",
    d: "This one rule shapes the whole design: posted documents are immutable, credit notes reference invoices, journals reverse by swapped lines, and status changes are appended. Reports can show original, corrected and net views. It simplifies audit and complicates user experience, since a typo costs two entries and some processes, like gapless numbering and tax filing, need rules for what may be reversed in a closed period. Master data are changed with history instead.",
    k: ["Reverse and reissue versus edit with a change log: reversal keeps the books themselves a complete history, while edits keep the document clean and rely on the log.", "Reversal dated at the original date versus at the correction date: original date fixes the period and may reopen it, while correction date keeps closed periods untouched and moves the effect."],
    p: ["A user deletes a draft that was already sent to a customer, and a gap appears in the sequence.", "A reversal posted without linking to the original makes both appear as separate activity."],
    v: "Post an invoice, reverse it and issue a corrected one; confirm that all three remain visible, the net effect equals the corrected invoice, and the reversal references the original.",
    dep: ["append-only-storage","journal-entries","audit-trail","period-controls"]
  },
  "period-and-effective-dating": {
    s: "Every figure belongs to a fiscal period and every rule, rate and price applies from a date, so results can be reproduced and compared as they were at any point.",
    d: "Transactions carry a document date, a posting date and a period; master data and rates carry effective dates; reports are run as of a date. Late events are handled by period controls and adjustments, not by changing history. It is hard because several dates mean different things, such as the delivery date, tax point and payment date, and a back-dated change must be traceable. Systems that overwrite instead of dating make old numbers impossible to reproduce.",
    k: ["Effective-dated rows versus overwrite with an audit log: dated rows answer what was true on a date directly and complicate queries, while overwrite is simple and needs reconstruction from the log.", "Bi-temporal tracking of valid time and recorded time versus valid time only: bi-temporal lets you reproduce what was reported then and costs storage and complexity."],
    p: ["A rate edited in place changes the value of last quarter's open items on rerun.", "Document date used as posting date puts a late invoice into a closed period."],
    v: "Run a report as of a past date after later changes to master data and rates, and confirm it returns exactly the figures first reported for that date.",
    dep: ["fiscal-calendars","period-controls","tax-codes","currencies-and-rates"]
  },
  "precision-and-rounding": {
    s: "Choosing how many decimals each currency and quantity carries, which operation rounds and how, and who absorbs the remainders, so all totals reconcile.",
    d: "Currencies differ in minor units, quantities and rates need more precision than prices, and tax law prescribes where rounding happens. Choices include storage scale, rounding mode, line versus total rounding, and allocation of remainders. They affect invoices, tax returns, conversions, costing and consolidation, and a single inconsistent choice produces differences that grow with volume. The decision has to be made once and applied everywhere, from the database to the reports.",
    k: ["More stored precision versus matching printed documents: higher precision reduces drift in costing and conversion, while printed precision matches what customers and authorities see.", "Rounding differences to a gain and loss account versus spreading them: a dedicated account makes them visible and measurable, while spreading hides them and complicates reversal."],
    p: ["Different layers round at different steps, and the same invoice has three totals.", "A currency with no decimals is handled with two, and amounts are off by a factor of one hundred in bank files."],
    v: "Compute a thousand multi-line invoices in the application, the database and the report layer, and confirm every total is identical to the minor unit in all three.",
    dep: ["decimal-arithmetic","currencies-and-rates","tax-determination"]
  },
  "authorization-everywhere": {
    s: "Every action, human or automated, must pass an explicit permission, limit and separation check, so no path through screens, files, APIs or batch jobs can skip a control.",
    d: "Controls are not features of screens but properties of operations. The same approval and limit must hold whether a document arrives through a form, an import, an integration or an extension. This pushes checks down into shared services and the posting path, and requires service identities, scoped tokens and logging for non-human actors. It is hard because each new channel is a chance to forget a check, and convenience features tend to create back doors.",
    k: ["Checks in a shared service layer versus in each interface: a shared layer guarantees coverage and couples every channel to it, while per-interface checks are tailored and inconsistent.", "Deny by default versus allow by default for new features: deny is safe and slows rollout, while allow is quick and exposes new paths until reviewed."],
    p: ["A bulk import path skips the approval rule that the screen enforces.", "A service account with broad rights approves its own generated payments."],
    v: "Attempt the same restricted action, such as posting above a limit, through a screen, an import, an API call and a batch job as the same user; confirm all four are refused identically and logged.",
    dep: ["identity-and-roles","approval-workflows","authority-limits","segregation-of-duties"]
  },
  "entity-scope-and-tenancy": {
    s: "Every row, permission, number sequence and report belongs to a legal entity or tenant, so data and rules are isolated by default and combined only through defined group processes.",
    d: "Each table carries an entity key, enforced by queries, security rules and database policies. Master data may be shared globally with per-entity extensions. Cross-entity access happens only in intercompany, consolidation and group reporting, with explicit permission. In hosted multi-tenant products the same idea applies one level higher, to isolation between customers. It is hard because one forgotten filter leaks data across a legal boundary, and shared data creates ownership questions.",
    k: ["Row-level entity key in shared tables versus a separate database per entity: shared tables make group reporting easy and need disciplined filtering, while separate databases isolate strongly and make consolidation a data movement problem.", "Global shared master data versus per-entity copies: shared data avoids duplicates and couples entities, while copies are independent and drift."],
    p: ["A report written without the entity filter shows another subsidiary's payroll to a local manager.", "A job runs under the wrong entity context and posts to another company's books."],
    v: "As a user scoped to entity A, query, report and call the API for entity B's documents and confirm each returns nothing or is denied, then run group reporting as an authorized user and see both.",
    dep: ["legal-entities","identity-and-roles","transactional-store"]
  },
}
);
