// Details for the CRM plate, part 3: customization, records, data quality, integration.
ATLAS.details("crm", {
  "object-metadata": {
    s: "The catalog describing every object, field, relationship and setting in a tenant, which the rest of the platform reads to know what data exists and how it behaves.",
    d: "Standard and custom objects are rows in a metadata store: names, labels, field definitions with type, length, required and default, relationships, indexing flags and security settings. The query engine, UI, API, reports and validation all consult it, usually through a cache invalidated on change. Metadata also versions and deploys between environments. It is hard because every runtime path depends on it: a slow or stale metadata cache degrades the whole product, and a bad change affects live data.",
    k: ["Schema as data in a shared store vs real tables per tenant: shared metadata gives instant changes and one deployment, while per-tenant tables are simpler to query and slower to administer at scale.", "Cache metadata per server vs read each time: caching is fast, but invalidation across servers must be exact or users see different schemas."],
    p: ["A field deleted in one tenant remains in another server's cache and saves fail intermittently.", "Metadata growth from thousands of custom fields slows page rendering and API describe calls."],
    v: "Add a custom field and read it through the API and a report from different servers within seconds. Rename it, and confirm every layout, report and validation using it updates or flags the dependency.",
    dep: ["multi-tenancy","record-store","flexible-field-storage"]
  },
  "custom-fields": {
    s: "Customer-defined fields added to standard or custom objects, with types such as text, number, date, currency, checkbox and lookup, usable everywhere like built-in ones.",
    d: "An admin chooses a type and settings, and the platform allocates storage in the flexible field store, registers the field in metadata, adds it to layouts and makes it available to filters, reports and the API. Some types can be indexed or made unique. Changing a type later may require conversion or is refused. The difficulty is that fields are cheap to create and expensive to live with: they accumulate to hundreds per object and slow pages and queries.",
    k: ["Allow type changes vs create new and migrate: changes are convenient but risk data loss on conversion; a new field is safe but leaves integrations and reports to rewire.", "Limits on field count per object vs unlimited: limits protect performance and pressure admins to clean up, but hit real customers at awkward times."],
    p: ["A text field used for a number is converted to numeric, and rows with stray characters are lost.", "Hundreds of unused fields make list views and imports slow for everyone."],
    v: "Create a currency field and a unique text field, load data and query both through the API. Types round-trip exactly, the unique field rejects a duplicate, and the fields appear in a report without further work.",
    dep: ["object-metadata","flexible-field-storage","indexing-and-search","page-layouts-and-record-types"]
  },
  "object-relationships": {
    s: "Typed links between objects: lookups that point to another record, and parent-child relationships where the child depends on the parent for access and deletion.",
    d: "A lookup is an optional reference field to another object. A master-detail style relationship makes the parent control the child's ownership, sharing and deletion, and enables roll-ups. Many-to-many links are modeled with a junction object holding two references. Relationships define report joins and related lists. The hard parts are cascading behavior: deleting a parent can delete thousands of children, and sharing inherited from a parent affects the cost of every access check.",
    k: ["Parent-controlled children vs independent lookups: parent control gives roll-ups and simple security, but removes the child's own owner and makes reparenting heavy.", "Junction objects vs multi-select fields: a junction is queryable and carries data about the link, while a multi-select is easy to edit and impossible to report on well."],
    p: ["Deleting an account cascades to years of deals and activity that nobody meant to remove.", "A lookup to a record the user cannot see exposes its name unless the platform filters it."],
    v: "Create a parent with 5,000 children, delete the parent, and verify children are removed or blocked according to the relationship type. Restoring from the recycle bin brings the children back.",
    dep: ["object-metadata","formula-and-rollup-fields","sharing-rules","backup-and-retention"]
  },
  "page-layouts-and-record-types": {
    s: "Configuration that shows different fields, picklist values and processes to different users and kinds of record on the same underlying object.",
    d: "A record type groups a set of picklist values and a page layout for a class of records, such as new business and renewal deals. A user's profile, role and the record's type pick the layout. Layouts set field order, required status and read-only status, and related lists and buttons. The hard part is combinatorial: three profiles by four record types means twelve layouts, and each custom field must be added to every one that should show it.",
    k: ["Many record types vs one with dynamic visibility rules: record types are explicit and powerful for processes, while dynamic rules reduce layout count at the cost of logic scattered through pages.", "Layout-level read-only vs field-level security: layout settings are convenient but only hide the field in the UI, while field security applies to every access path."],
    p: ["A new field is added to one layout and invisible to the users who needed it.", "A record type set as default for a profile changes how integrations create records and breaks their picklist values."],
    v: "Open the same deal as two profiles with different record types. Each sees the intended fields and picklist values, and an API call that sets a value not valid for its record type is rejected.",
    dep: ["object-metadata","picklists","field-level-security","profiles-and-permission-sets"]
  },
  "picklists": {
    s: "Fields restricted to a managed list of values, which can depend on another field and be shared across objects, with controlled changes over time.",
    d: "Values have a label, API value, active status and order. Dependent picklists limit options based on a controlling field, such as state by country. Global value sets share one list across fields. Retiring a value usually deactivates it so history and old records remain valid. It is hard because the values appear in reports, automation, integrations and external systems by value, so renaming or deleting one is a data migration rather than an edit.",
    k: ["Strict picklists vs allowing free text: strict lists keep data countable and clean, but force admin work for every new value; free text is flexible and unreportable.", "Deactivate a value vs delete and replace: deactivation keeps history intact, but old records hold a value no longer offered and need cleanup."],
    p: ["Renaming a stage label changes the displayed text, and an integration matching on the old text silently breaks.", "An import with a value outside the list fails on every row, or lets in bad values if strictness is off."],
    v: "Deactivate a value in use. Existing records keep it, new records cannot choose it, the API rejects it on create, and a report grouped by the field still shows the retired value for old records.",
    dep: ["object-metadata","validation-rules","bulk-import-export"]
  },
  "validation-rules": {
    s: "Conditions checked on save that block a record from being written if the data breaks a business rule, with a message telling the user what to fix.",
    d: "A rule is a formula over the record's fields, related data and the current user, which returns true when the data is invalid. The save path evaluates all active rules after before-triggers and refuses the whole save on failure, with a message attached to the page or a field. Rules apply to the UI, API and imports alike unless bypassed for specific users. It is difficult because each rule is a constraint on every future writer, so one added for sales blocks an integration or a bulk load nobody remembered.",
    k: ["Enforce in the save path for all writers vs only in the UI: universal rules guarantee data quality, but surprise integrations; UI-only rules never block automation and miss back-door data.", "Bypass permission for integrations vs no exceptions: bypass keeps loads and syncs working, but opens a route around the rules."],
    p: ["A new required-field rule blocks an integration's existing writes and queues fail overnight.", "Rules referencing a field later deleted fail every save with an unhelpful formula error."],
    v: "Activate a rule requiring a close reason when stage is lost. A UI save, an API save and an import row without the reason all fail with the same message, and a save with the reason succeeds.",
    dep: ["formula-and-rollup-fields","object-metadata","record-triggers","bulk-import-export"]
  },
  "formula-and-rollup-fields": {
    s: "Fields whose values are computed rather than typed: formulas derive a value from the same or related records, and roll-ups summarize child records.",
    d: "A formula is an expression evaluated at read time from fields on the record and parents. A roll-up stores a sum, count, minimum or maximum over children and updates when children change. Cross-object formulas add joins to every read. Roll-ups need recomputation on child insert, update, delete and reparent. It is hard because formulas can be expensive to evaluate in lists and reports, and roll-up recalculation under bulk changes can lock the parent for a long time.",
    k: ["Formula evaluated at read vs value stored at write: read-time formulas are always right but cost each query; stored values are cheap to read and can go stale.", "Roll-up maintained per child change vs recalculated in batches: per-change keeps parents current but locks them under load, while batching is lighter and delays totals."],
    p: ["A formula referencing three levels of parents makes every list view slow and cannot be indexed.", "A bulk load of children into one parent causes lock contention and failures on the roll-up."],
    v: "Add a roll-up of open deal amount on an account and load 10,000 deals across accounts. Each parent's total equals a direct sum after the load, without lock errors, and deleting a deal updates it.",
    dep: ["object-relationships","query-engine","transactions-and-locking","object-metadata"]
  },
  "sandboxes-and-deployment": {
    s: "Copies of a tenant's configuration, and sometimes data, for building and testing changes, plus the mechanism for promoting those changes to production.",
    d: "A sandbox is created by copying metadata and optionally a sample or full set of data into a separate tenant. Changes are packaged as a set of metadata components, tested, validated against production for dependencies and deployed, either as a change set or from source control. Deployment orders components by dependency and can roll back on failure. The hard parts are drift between sandbox and production, and that data-dependent configuration, such as record IDs in flows, does not move with the metadata.",
    k: ["Source-controlled metadata deployment vs click-built change sets: source control gives review, diffs and repeatability, while change sets are accessible to administrators who do not use code tools.", "Full-copy sandbox vs partial data: full copies reproduce real behavior but expose customer data and take long to refresh; partial copies are fast and may miss the case."],
    p: ["Configuration hard-coded with record IDs works in the sandbox and points at nothing in production.", "Production edited directly by an administrator is overwritten by the next deployment from the sandbox."],
    v: "Change a field, flow and layout in a sandbox and deploy them. Validation runs first, the production metadata matches the sandbox afterward, and a deliberately failing component aborts the whole deployment with nothing applied.",
    dep: ["object-metadata","flow-builder","custom-code-hooks","multi-tenancy"]
  },
  "contacts": {
    s: "Records for the individual people a company deals with, holding names, roles, emails, phones and links to accounts, deals, activity and consent.",
    d: "A contact usually belongs to one primary account and may relate to others. It has several emails and phones, a role or title, and a lifecycle status. Interactions attach to it through the activity timeline. Contacts feed campaigns and sequences, and are matched against incoming mail. Hard parts are identity and change: people change employer, use several addresses and appear as leads and contacts at once, and each of these breaks the assumption that a person is one stable row.",
    k: ["One contact per person across employers vs a contact per employment: the first tracks a person's history across jobs, while the second keeps each account's view simple and loses the link.", "Multiple emails and phones as child records vs fixed fields: child records match more incoming mail and hold type and validity, at the cost of more joins."],
    p: ["A contact who changed jobs is cloned instead of moved, and activity splits across two records.", "Personal data in free-text fields escapes privacy export and deletion."],
    v: "Create a contact with two emails and two phones, relate them to two accounts, and confirm incoming mail from either address matches it, and that a privacy export includes every field about that person.",
    dep: ["accounts","record-store","contact-roles","privacy-requests"]
  },
  "accounts": {
    s: "Records for companies or other organizations being sold to, the anchor for contacts, deals, contracts and support history.",
    d: "An account has a name, domain, industry, size, addresses, owner and hierarchy links. Contacts and deals relate to it, and rollups summarize its revenue and open pipeline. Some systems model individuals as person-accounts for consumer sales. Ownership and territory commonly follow the account. The difficulty is identity: the same company appears under legal, trading and former names, with several subsidiaries, and duplicates here corrupt every report grouped by customer.",
    k: ["Business accounts only vs also person-accounts: person-accounts suit consumer selling in one model, but double the special cases in every query and permission.", "Account owner governs children vs each deal has its own owner: account control is simple and protects the relationship, while deal ownership is flexible and breeds conflicts."],
    p: ["Duplicate accounts split revenue history and two reps pursue the same customer.", "A renamed company loses its matches with incoming email domains and imported lists."],
    v: "Create an account with a domain and import 100 contacts with matching email domains. They link to the account, the roll-up of open pipeline equals the sum of its deals, and creating the same company again is flagged.",
    dep: ["record-store","duplicate-detection","account-hierarchies","record-ownership"]
  },
  "account-hierarchies": {
    s: "Links between accounts that express parent companies, subsidiaries and divisions, used to roll up revenue and pipeline and to apply access and territory rules.",
    d: "Each account may name a parent, forming a tree, sometimes also a separate ultimate-parent or a many-to-many partner relationship. Roll-ups sum children's deals into the parent. Territory and visibility rules can inherit from the parent. Imported company data may supply the tree. The difficulty is that real corporate structure is a graph that changes with acquisitions, and the tree in the CRM must handle moves and merges while staying cycle-free and with reasonable depth.",
    k: ["Single parent tree vs graph of relationships: a tree is simple to roll up and secure, while a graph models partners and joint ventures but defeats simple aggregation.", "Store the path on each node vs recursive queries: stored paths make subtree queries fast, but a move rewrites every descendant."],
    p: ["An acquisition moves a parent account and thousands of descendants' roll-ups recompute at once.", "A cycle created by editing two accounts breaks every report that traverses the tree."],
    v: "Build a three-level hierarchy, move a subsidiary to a new parent, and check both parents' roll-up totals change by that subsidiary's pipeline. Attempting to make a parent its own descendant is refused.",
    dep: ["accounts","formula-and-rollup-fields","data-enrichment","teams-and-territories"]
  },
  "leads": {
    s: "Records for people or companies not yet qualified as customers or contacts, with source, status and score, worked by sellers until converted or disqualified.",
    d: "A lead holds basic contact and company data, source and campaign, status, score and owner. It is created by forms, imports, events and manual entry, then routed, worked and either converted or closed out with a reason. Leads often hold data in one flat record before the structure of account, contact and deal exists. The hard part is the boundary with contacts: a known person who submits a form again is a lead, a contact, or both, and separate models create duplicates by design.",
    k: ["Separate lead object vs contacts with a lifecycle stage: a separate object keeps unqualified volume away from the customer data, while a single object avoids conversion and duplicates.", "Convert and delete the lead vs keep it linked: deleting is clean, while keeping the lead preserves source and history that reports need."],
    p: ["Lead statuses nobody uses make funnel reports show most leads stuck at new.", "Unconverted leads from years ago keep appearing in searches and sequences."],
    v: "Create a lead through a form, route it, work it to a qualified status and disqualify another with a reason. Funnel counts by status match the underlying records and disqualified leads are excluded from sequences.",
    dep: ["record-store","lead-routing","lead-capture-forms","duplicate-detection"]
  },
  "lead-conversion": {
    s: "The operation that turns a qualified lead into a contact, an account and optionally a deal, carrying over fields and history and matching existing records.",
    d: "Conversion offers to attach to an existing account or contact found by matching, or to create new ones. It maps lead fields to those on the new records, creates a deal, moves activity and campaign history, and marks the lead converted with links to the results. It runs in a transaction and fires triggers on each created record. The difficulty is mapping and duplicates: custom fields without a mapping are lost, and a poor match creates a second account for an existing customer.",
    k: ["Match to existing records automatically vs ask the user: automatic matching keeps data clean at volume, but a wrong match merges unrelated companies; asking is safe and slows each conversion.", "Mapped fields copied once vs kept linked: a copy is simple and independent, while links keep source data current and add complexity."],
    p: ["Custom lead fields with no mapping are dropped and the context from marketing is gone.", "Converting into an existing account of another team's territory reassigns it by accident."],
    v: "Convert a lead whose company already exists. It attaches to that account, creates a contact and a deal, moves its activity and campaign history, and the converted lead links to all three.",
    dep: ["leads","contacts","accounts","opportunities","duplicate-detection"]
  },
  "contact-roles": {
    s: "The role each contact plays in a deal or on an account, such as decision maker, influencer or champion, used to judge coverage of the buying group.",
    d: "A junction record links a contact to a deal with a role and a primary flag. Reports and gates use it to check that required roles are present. Attribution uses it to find which people's touches count. Roles can also be defined on accounts for the long-term structure. The difficulty is upkeep: roles are valuable only when current, reps often skip them, and a single person plays different roles in different deals.",
    k: ["Role stored on the deal link vs on the contact: per-deal roles model reality that a person can be a champion in one deal and a blocker in another; per-contact roles are simpler and wrong.", "Require roles at a stage vs encourage them: a gate gets the data and invites placeholder contacts; encouragement keeps flow and leaves most deals empty."],
    p: ["A placeholder contact named unknown satisfies the gate and ruins attribution.", "Roles are never updated after the first call and coverage reports show a map from months ago."],
    v: "Add a decision maker and an influencer to a deal. The coverage report shows both, the stage gate that requires a decision maker passes, and removing the contact makes the gate fail again.",
    dep: ["contacts","opportunities","stage-gates","campaign-attribution"]
  },
  "record-ownership": {
    s: "The single user or queue responsible for each record, which drives visibility, notifications, quotas, territory and who sees work to do.",
    d: "Every record has an owner field, set on creation and changed by assignment rules, transfers or imports. Owners get default access, and the role hierarchy and sharing rules build on it. Queues hold unowned work for a group. Transferring ownership may also move related records, tasks and open deals. It is hard because ownership is overloaded: it means responsibility, access, credit and reporting dimension at once, and changing it for one reason changes all four.",
    k: ["Single owner vs multiple owners: one owner is unambiguous for accountability and sharing, while teams need an extra mechanism for shared work.", "Ownership changes cascade to children vs do not: cascade keeps the relationship consistent, while keeping children avoids stealing deals from the people working them."],
    p: ["A mass transfer when a rep leaves reassigns open deals with their access and history and breaks quota credit.", "Records owned by deactivated users stay invisible to everyone except administrators."],
    v: "Transfer an account to a new owner with the cascade option. Child contacts and open deals move, closed deals and their credit do not, the previous owner loses access unless on the team, and each change is logged.",
    dep: ["role-hierarchy","sharing-rules","audit-and-access-logs","user-provisioning"]
  },
  "field-history": {
    s: "A log of changes to chosen fields on each record, recording who changed it, when, and the old and new value.",
    d: "Admins select fields to track per object. On every save, the platform compares old and new values for those fields and writes a row per change into a history table. The history appears on the record and feeds reports and snapshots. Large text and some types cannot be tracked, and volume is capped. It is hard because the tracked fields are chosen in advance, history grows without bound, and values are stored as they were, which may become unintelligible after a picklist is renamed.",
    k: ["Track selected fields vs track everything: selected is cheap and covers what the business reviews, but misses the field someone asks about later; everything is complete and expensive.", "History on the same store vs an append-only audit store: the same store is easy to query and delete from, while a separate one is tamper-resistant and a second system to run."],
    p: ["A needed field was never tracked, so its history is gone permanently.", "History rows for deleted records are removed with them or retained with personal data longer than policy allows."],
    v: "Track amount and stage on deals, then edit both several times. The history lists each change with user, time, old and new value in order, and deleting the deal follows the stated retention rule.",
    dep: ["record-store","object-metadata","change-history-and-audit","backup-and-retention"]
  },
  "input-normalization": {
    s: "Cleaning values as they are entered or imported: standard casing, phone and address formats, country and state codes, and trimmed whitespace.",
    d: "On save, format rules transform or validate values: phone numbers parsed into a canonical international form, addresses matched against reference data, email addresses lowercased, company suffixes standardized. Picklists for states and countries replace free text. Normalization runs in the UI, API and import alike. Hard parts are locale variety and reversibility: an automatic change can destroy information, such as a deliberate extension or unusual spelling, so the original is often kept beside the normalized form.",
    k: ["Normalize on write vs on read: normalizing on write makes matching and search simple and consistent, while on read keeps the original but repeats work everywhere.", "Keep the raw input beside the clean value vs overwrite: raw preserves evidence and allows reprocessing, but doubles fields and confuses users."],
    p: ["A phone parser that assumes one country corrupts numbers from others.", "Aggressive casing rules change names such as those with prefixes or internal capitals incorrectly."],
    v: "Save the same phone number typed in five formats and the same address with variant spellings. Each normalizes to one canonical value, and a search for any original form finds the record.",
    dep: ["record-store","validation-rules","indexing-and-search"]
  },
  "duplicate-detection": {
    s: "Finding records that probably describe the same person or company, at entry time to warn users and in the background to list existing duplicates for review.",
    d: "On save and on a schedule, the system builds match keys for each record and compares them with candidates through an index, scoring similarity across fields such as normalized name, email, phone and domain. High scores block or warn at creation; mid scores create a duplicate set for a person to review. Cross-object checks compare leads with contacts. The difficulty is precision: false positives annoy and block real work, false negatives let dirty data in, and the comparison must scale to millions of records.",
    k: ["Block at entry vs warn and allow: blocking prevents duplicates cleanly but stops legitimate similar records; warning keeps work flowing and relies on users to heed it.", "Real-time check vs nightly job: real-time prevents damage while the user is present, whereas batch scales better and finds what real-time rules missed."],
    p: ["Two real people at one company sharing a main phone line are flagged as duplicates and merged.", "Imports skip duplicate checks for speed and add thousands of copies in a single run."],
    v: "Seed a test set with known duplicate pairs and near-misses. The detector finds the labeled pairs with the intended precision and recall, and creating a record that matches an existing one warns the user at save.",
    dep: ["match-rules","input-normalization","indexing-and-search","async-job-queue"]
  },
  "match-rules": {
    s: "Configurable definitions of when two records are alike: which fields are compared, how exactly, and what combined score counts as a match.",
    d: "A rule lists comparisons per field, such as exact email, fuzzy name by edit distance or phonetic key, company by normalized name and domain, with weights and a threshold. Blocking keys narrow candidates so not every pair is compared. Rules differ by object and by action, such as blocking versus reporting. They need tuning against real data. The hard part is that good matching depends on the data's quirks, and a rule tuned on one tenant over- or under-matches on the next.",
    k: ["Exact keys vs fuzzy scoring: exact keys are fast and predictable but miss typos; fuzzy scoring finds them and costs more compute and tuning.", "Blocking keys to limit comparisons vs full pairwise: blocking makes millions of records feasible, but a pair that shares no key is never compared."],
    p: ["A name-only rule matches thousands of common names and floods the review queue.", "A rule using a field that is often blank never matches the records that most need it."],
    v: "Run a rule over a labeled sample of 1,000 record pairs. Measured precision and recall meet the stated targets, and tightening the threshold lowers false matches and raises misses in the expected direction.",
    dep: ["input-normalization","indexing-and-search","object-metadata"]
  },
  "merge-engine": {
    s: "The operation that combines duplicate records into one survivor, choosing field values, reparenting related records and keeping a trail so mistakes can be traced.",
    d: "A user or job picks a winner and, field by field, which value survives, often by rules such as most recent, most complete or from the trusted source. Child records, activities, deals, campaign history and consent move to the survivor, and the losers are deleted or marked merged with a pointer. External systems must be told. The difficulty is irreversibility and fan-out: a wrong merge combines two real customers, and merging touches every table that references the record.",
    k: ["Survivorship rules automatic vs reviewed by a person: automatic merges at volume, but a bad rule corrupts many records; review is slow and safer.", "Soft merge with a retained loser vs hard delete: soft merges allow unmerge and audit but leave records that must be hidden everywhere; hard deletes are clean and final."],
    p: ["Merging deletes the loser, and an integration holding its ID now points to nothing.", "Consent from the loser overrides the survivor's opt-out and re-enables email."],
    v: "Merge two accounts with contacts, deals and activity. All children point to the survivor, field choices follow the rules, a merge log lists what moved, and an external system receives the redirect from the old ID.",
    dep: ["duplicate-detection","record-store","object-relationships","webhooks-and-change-events","consent-and-preferences"]
  },
  "data-enrichment": {
    s: "Filling and refreshing record fields from external data sources: firmographics, job titles, verified emails, phone numbers and company hierarchies.",
    d: "A job sends identifying fields, such as domain or email, to a data provider and receives attributes with confidence and a date. Rules decide whether to fill only blanks, overwrite, or propose changes. Results can also supply a corporate hierarchy. Enrichment runs on creation, on schedule or on demand. The hard parts are cost per lookup, matching quality, overwriting values users corrected by hand, and the legal basis for holding the added personal data.",
    k: ["Fill blanks only vs overwrite: filling blanks respects user edits and leaves stale data, while overwriting keeps data fresh and destroys corrections.", "Enrich at creation vs on demand: at creation the data is there when needed and costs every lookup, while on demand is cheap and slower for the user."],
    p: ["A bad match enriches a record with another company's data and it looks authoritative.", "Enrichment overwrites a field that an integration owns and the two fight on every sync."],
    v: "Enrich 100 records from a test provider. Fill rates match the provider's response, fields edited by users are untouched when set to fill blanks, and each enriched value carries its source and date.",
    dep: ["accounts","contacts","api-credentials-and-limits","field-history"]
  },
  "stale-data-detection": {
    s: "Finding records that are likely out of date: bounced emails, disconnected numbers, contacts who left, and accounts with no activity for a long time.",
    d: "Signals include email bounces, verification services, no activity within a set window, failed mail delivery, job-change data and enrichment mismatches. Records are flagged, scored for freshness, and queued for review or archiving. Dashboards show data health by owner. The hard part is the cost of being wrong in both directions: removing an inactive but real prospect loses an opportunity, and keeping dead records ruins email reputation and reporting.",
    k: ["Automatic archiving vs flag for review: automatic keeps data clean at scale, while review avoids deleting a dormant customer who is about to return.", "Age by last activity vs by last verification: activity is cheap and wrong for people who simply have not been contacted, while verification is accurate and costs a check."],
    p: ["Email bounces are ignored, and sequences keep sending to dead addresses until the domain is blocked.", "An archive rule based on activity removes customers who buy once a year."],
    v: "Mark a set of test contacts as bounced and inactive. They are flagged with the right reason, excluded from sequences, and appear on the data-health report for their owner with a count that matches.",
    dep: ["contacts","email-sync","scheduled-automations","backup-and-retention"]
  },
  "bulk-import-export": {
    s: "Tools to load many records from files or other systems, and to extract them, with mapping, duplicate handling and a report of what failed.",
    d: "An import reads a file, maps columns to fields, validates and normalizes rows, checks for duplicates and loads in batches through the standard save path or a faster bulk path. Failed rows are returned with reasons, and a job id supports status and rollback. Export reads in pages, applying the user's access, and may be limited or logged. Hard parts are speed against rules, because bypassing validation is fast and dangerous, and being able to undo a load that went wrong.",
    k: ["Run all rules during import vs allow a bypass: full rules protect quality, but make big loads slow and fail on legacy data; bypass is fast and loads garbage.", "Upsert on an external ID vs always insert: upserts make loads repeatable without duplicates, but require a stable key from the source."],
    p: ["A mapping mistake loads a date into the wrong field across half a million records.", "Exports of the whole customer base by a single user leave with a departing employee."],
    v: "Import a file of 100,000 rows with 500 deliberately bad ones. The 99,500 good rows load, the bad ones are returned with reasons, rerunning the file creates no duplicates, and the batch can be identified for rollback.",
    dep: ["bulk-api","duplicate-detection","validation-rules","input-normalization","audit-and-access-logs"]
  },
  "rest-api": {
    s: "The public HTTP interface for creating, reading, updating, deleting and querying records and metadata, used by integrations, apps and the vendor's own clients.",
    d: "Resources map to objects and records and speak JSON. A query endpoint accepts a structured query language, with paging by cursor. Describe endpoints return object metadata so clients can adapt to custom fields. Requests are authorized with tokens carrying a user's permissions, run through the same validation, triggers and sharing as the UI, and counted against limits. It is hard because the API is a promise: customers build on it for years, so versions must be stable while the schema underneath is customer-defined.",
    k: ["Versioned API with long support vs continuous change: stable versions protect integrations, but multiply what the vendor must maintain.", "Same save path as the UI vs a special API path: one path means rules apply everywhere, while a special path could be faster and bypass logic."],
    p: ["A new required field breaks every integration that creates records without it.", "Clients that paginate by offset miss or duplicate records when data changes during the walk."],
    v: "Create, read, update and delete a record with a custom field through the API as a restricted user. Results match the UI, a forbidden field is absent or rejected, and a request over the limit gets a documented error with a retry hint.",
    dep: ["record-store","query-engine","api-credentials-and-limits","field-level-security","object-metadata"]
  },
  "bulk-api": {
    s: "An asynchronous interface for loading, updating or extracting hundreds of thousands of records in jobs of batches, instead of one request per record.",
    d: "A client creates a job naming the object and operation, uploads data in batches, and polls or is notified for results. The server splits work into chunks, processes them in parallel through the save path, and returns per-row success and failure. Bulk jobs run in a queue with fair scheduling across tenants. The difficulty is contention and ordering: parallel chunks on related records cause lock failures, and a job that fails halfway needs a safe way to resume without duplicating work.",
    k: ["Parallel chunks vs serial: parallel finishes faster, but increases lock conflicts on shared parents; serial is slow and predictable.", "Per-row results vs all-or-nothing: per-row lets good data through and needs the client to handle partial failure; all-or-nothing is simpler and stalls on one bad row."],
    p: ["Loading children of a few huge parents in parallel causes lock errors on most batches.", "A retry of a half-finished job without an external key creates duplicates."],
    v: "Load 1 million records by upsert on an external key in parallel batches, then rerun the same job. Row counts are unchanged by the rerun, failures are reported per row, and interactive users stay within normal response times.",
    dep: ["async-job-queue","record-store","transactions-and-locking","api-credentials-and-limits"]
  },
  "webhooks-and-change-events": {
    s: "Outbound notifications that tell other systems when a record is created, changed, deleted or merged, delivered by subscription with retry and replay.",
    d: "A subscriber registers an endpoint or a stream and the events it wants, filtered by object and fields. The change stream publishes each committed change, with changed fields and a sequence number. Delivery is at least once, with signed requests, exponential retry and dead-letter storage. Streams allow replay from a cursor within a retention window. The hard parts are order and duplication: receivers must tolerate repeated and out-of-order events, and a slow endpoint must not delay delivery to others.",
    k: ["Push webhooks vs pull streams: push is simple for receivers and needs endpoint availability, while pull lets consumers control pace and recover by replay.", "Send the full record vs only identifiers and changed fields: full payloads avoid a callback and may leak fields; identifiers are small and force a read."],
    p: ["An endpoint that is down beyond the retry window loses events permanently with no replay.", "Receivers that process events out of order overwrite newer data with older."],
    v: "Subscribe to deal changes, update a deal five times quickly and take the endpoint offline for a minute. All events arrive after recovery, signed, with sequence numbers, and replaying from a cursor returns the same set.",
    dep: ["change-event-stream","async-job-queue","api-credentials-and-limits","field-level-security"]
  },
  "connectors-and-ipaas": {
    s: "Prebuilt integrations and hosted workflow tools that move data between the CRM and other applications without custom programming.",
    d: "A connector authenticates to both sides, maps objects and fields, and runs on events or a schedule, with retry and error queues. Hosted platforms offer many connectors and visual flows. The mapping layer handles custom fields and picklists. Hard parts are the long tail of edge cases: rate limits, partial failure, loops where each side updates the other, and who is responsible when data is wrong after passing through three systems.",
    k: ["Prebuilt connector vs custom integration: prebuilt is fast to deploy and covers common cases, while custom handles the customer's real rules and costs development and upkeep.", "Hosted integration platform vs point-to-point code: a platform centralizes monitoring and credentials, at a recurring cost and one more system in the chain."],
    p: ["Two systems each updating the other loop endlessly, because neither recognizes its own change.", "An expired credential in a shared connector stops sync for the whole company without an alert."],
    v: "Connect the CRM to a test external system and change a record on each side. Each change appears on the other side within the sync interval, no loop occurs, and a forced failure lands in an error queue with the payload.",
    dep: ["rest-api","webhooks-and-change-events","field-mapping-and-transforms","api-credentials-and-limits"]
  },
  "erp-and-billing-sync": {
    s: "Exchange of customers, products, prices, orders, invoices and payment status between the CRM and the finance system that bills and recognizes revenue.",
    d: "When a deal is won, an order or subscription is created in the finance system from the account, contact and line items. Customer IDs link the two. Status flows back: invoiced, paid, overdue, so sellers see it. Catalog and price data usually flows the other way. Hard parts are authority and timing: accounts must exist before orders, finance owns the numbers after booking, and corrections on either side need a defined path.",
    k: ["Finance owns customer and price master vs CRM owns it: finance ownership is consistent for billing, while the CRM owning it gives sellers flexibility and a second copy to reconcile.", "Real-time order creation vs a batch handoff: real-time gives quick feedback, while batch is simpler to recover and allows review before booking."],
    p: ["A won deal edited after the order is created leaves the CRM and invoice amounts different.", "Customer records created independently in both systems have no shared key and cannot be linked."],
    v: "Close a deal won with three products. The finance system receives one order with the same lines and customer ID, the invoice status returns to the deal, and the totals reconcile for a sample of fifty orders.",
    dep: ["connectors-and-ipaas","opportunities","products-and-price-books","field-mapping-and-transforms","accounts"]
  },
  "external-data-virtualization": {
    s: "Showing data that lives in another system as if it were CRM records, read live when needed instead of copying it.",
    d: "An external object maps a remote table or API resource to a virtual object with fields, usable in lists, lookups and related lists. Queries are translated to the remote system, and results are never stored, or only cached briefly. This avoids duplication of large or sensitive data such as orders or usage. The difficulty is dependence: speed and availability are the remote system's, filtering and joining are limited to what it supports, and reports across CRM and external data are weak.",
    k: ["Virtualize vs copy: virtualizing avoids sync and stale data, but depends on the remote system's speed; copying is fast and complicates freshness and storage.", "Read-only vs writeable external objects: read-only is safe and simple, while writes give one screen for users and need two-system error handling."],
    p: ["A slow remote system makes the whole account page slow when a related list loads.", "Reports that join external data hit limits and return partial or no results."],
    v: "Create an external object over an orders table and add it as a related list on accounts. It shows current orders when opened, reflects a change in the source on refresh, and fails gracefully when the source is down.",
    dep: ["object-metadata","rest-api","api-credentials-and-limits","record-pages"]
  },
  "app-marketplace": {
    s: "A catalog and packaging system where third parties publish extensions that customers install into their tenant, with managed upgrades and permissions.",
    d: "A package bundles metadata, code and permission sets, versioned and namespaced to avoid collisions with the customer's own names. Installing validates dependencies, creates components and grants access. The vendor reviews for security and limits. Upgrades push new versions, and uninstalling removes components. Hard parts are trust and compatibility: an extension runs with access to customer data, and customizations by the customer can break an upgrade.",
    k: ["Managed packages with hidden code vs open source: managed packages protect the publisher and make upgrades safer, but customers cannot inspect them.", "Review all listings vs self-certification: review raises trust and slows publishing, while self-certification scales and shifts risk to customers."],
    p: ["An installed extension requests broad access and nobody on the customer side reviews it.", "An upgrade overwrites a field the customer customized."],
    v: "Install a test package into a sandbox. Its components, permissions and namespace appear as declared, an upgrade preserves the customer's data and customizations, and uninstalling leaves no orphan metadata.",
    dep: ["object-metadata","profiles-and-permission-sets","sandboxes-and-deployment","custom-code-hooks"]
  },
  "api-credentials-and-limits": {
    s: "The identity of each integration and the quotas applied to it: tokens, scopes, consent, and caps on requests, concurrency and data volume.",
    d: "Integrations authenticate with delegated tokens or service credentials issued after an admin or user grants scopes. Tokens expire and are refreshed or revoked. Each call is counted against daily request allowances and concurrency caps per tenant, user or app, and responses say how much remains. Expensive endpoints are priced higher. It is hard because limits protect the shared platform and the integrations break when exceeded, so the quota model must be both fair and predictable.",
    k: ["Per-tenant quota vs per-integration quota: tenant quotas are simple to explain, while per-integration quotas stop one runaway app from consuming everything.", "Hard cap vs throttle: a hard cap is strict and predictable and stops legitimate spikes; throttling degrades gracefully and hides the overage."],
    p: ["A long-lived token with admin scope is stored in a script and leaks.", "A looping integration consumes the daily allowance by morning and every other integration stops."],
    v: "Issue a token with read-only scope. A write is refused, usage counters decrease per call, exceeding the cap returns a documented error with remaining quota, and revoking the token ends access immediately.",
    dep: ["authentication-and-sso","tenant-isolation-and-limits","audit-and-access-logs"]
  },
  "field-mapping-and-transforms": {
    s: "The definitions that translate fields, values and identifiers between the CRM and other systems, including type conversion, defaults and lookups of related IDs.",
    d: "A mapping pairs each source field with a target field and rules: rename, convert type or unit, map picklist values, split or join, default when blank, resolve a foreign key by external ID. It runs inside connectors, imports and exports, and can be tested against sample data. Mappings include direction and ownership per field. It is hard because the two schemas evolve independently, and a silent mismatch such as a changed picklist or time zone corrupts data without an error.",
    k: ["Explicit mapping per field vs automatic by name: explicit mapping is verifiable and laborious; automatic works until the names coincidentally match and mean different things.", "Transform in the integration layer vs in each system: central transforms are consistent, while in-system ones stay near the data and spread across teams."],
    p: ["A picklist value added on one side has no mapping and rows fail or fall to a default.", "Timestamps without a zone shift by hours when passed between systems."],
    v: "Run a sample of records through the mapping both ways. Round-tripping returns the original values, unmapped picklist values are reported, and a date near midnight lands on the correct day in both systems.",
    dep: ["object-metadata","picklists","input-normalization"]
  },
});
