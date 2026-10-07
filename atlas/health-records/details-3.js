// Details for the electronic health records plate, part 3: revenue cycle, patient record and identity, encounter data model.
ATLAS.details("health-records", {
  "charge-capture": {
    s: "Turns services delivered into billable charges, either automatically from orders and documentation or by staff entry, so nothing performed goes unbilled and nothing unperformed is billed.",
    d: "Charges come from several sources: completed orders, administered drugs, procedure notes, supplies scanned in a procedure room and professional services entered by clinicians. Each charge maps to a catalog item with a price and code. Rules attach charges to the correct encounter and account and hold those missing information. The risks go both ways: missed charges lose revenue, and charges without a supporting record are a compliance problem. Hard parts include timing, because charges arrive days after the service, and keeping the catalog consistent with the clinical order catalog.",
    k: ["Automatic charge from clinical events versus manual entry: automatic is complete and ties billing to clinical accuracy; manual is flexible and misses items.", "Charge on order versus on completion: on order is early and bills for work later cancelled; on completion is accurate and later."],
    p: ["A cancelled order that had already generated a charge is billed to the patient.", "Services done in a different department are charged to the wrong encounter."],
    v: "Complete a test procedure with a scanned supply and confirm the charges appear on the right encounter with the right codes, then cancel an order before completion and confirm no charge remains.",
    dep: ["order-routing","encounter-model","fee-schedules","administration-and-barcode-check"]
  },
  "coding-assistance": {
    s: "Assigns standard diagnosis and procedure codes to an encounter from its documentation, through coder review, software suggestions or both.",
    d: "Coders or software read the notes, results and orders and select codes by rules that differ between settings and payers. Codes decide payment, risk adjustment and quality reporting. Language processing can propose codes, and coders confirm. Code sets are replaced yearly, and the rules for sequencing and specificity are intricate. Difficult parts: documentation that is clinically right and not codable, pressure to code for payment, and audits in which a payer may reclaim money paid years earlier.",
    k: ["Computer-assisted coding with human review versus full automation: assistance raises productivity and keeps accountability; full automation is cheap and risky on complex cases.", "Code from the problem list versus from the note: the list is structured and may be stale; the note is current and narrative."],
    p: ["Codes pulled from a copied-forward note describe a condition the patient does not have.", "A yearly code update is loaded late and claims go out with invalid codes."],
    v: "Code a test encounter with a known answer set and confirm primary diagnosis and procedures match the coder reference, with each code linked to its supporting text, and invalid codes are rejected.",
    dep: ["terminology-service","longitudinal-chart","documentation-queries","problem-list"]
  },
  "documentation-queries": {
    s: "Asks clinicians to clarify or complete documentation when it is ambiguous or conflicts with other data, so coding is accurate and the record is clear.",
    d: "A coder or specialist reviewing a chart finds a gap, such as a stated abnormal result with no diagnosis or a vague description, and sends a compliant, non-leading query to the author. The reply is added to the record as an addendum, and the coding updates. Queries are tracked for response time and outcome. The problem is balance: queries that lead the clinician to a more profitable answer are a compliance violation, and a flood of queries trains clinicians to ignore them.",
    k: ["Query during the stay versus after discharge: concurrent queries are answered while the patient is present and interrupt care; retrospective queries are calmer and depend on memory.", "Free-form query versus structured options: structured is quick to answer and can be seen as leading."],
    p: ["A query that suggests a specific diagnosis is flagged in audit as leading.", "Queries sit unanswered after clinicians leave, holding claims for months."],
    v: "Send a test query on a vague diagnosis, answer it with an addendum and confirm the original note is unchanged, the addendum is linked, the code updates and the query log shows response time.",
    dep: ["coding-assistance","signing-and-addenda","secure-messaging","change-audit"]
  },
  "eligibility-verification": {
    s: "Confirms with the insurer, before and during care, that a patient's coverage is active and what it covers, so billing starts with correct information.",
    d: "A transaction sends the subscriber identifiers and service type to the payer and receives active status, plan, deductible and copayment information. It runs at scheduling, registration and again before billing. The answer is stored with the encounter and used to determine the payer to bill. Hard parts: payers answering with different completeness, responses for the wrong plan when a patient has several, and coverage that changes between the check and the claim.",
    k: ["Check at scheduling versus at registration only: early checks catch problems when there is time to resolve them and may become stale; at registration is current and late.", "Batch overnight checks versus on demand: batch is efficient for a day's schedule and misses same-day bookings."],
    p: ["A check shows active coverage for a plan that does not cover the service and the claim is denied.", "Secondary insurance is never queried, leaving balance billed to the patient."],
    v: "Run a check for a test patient with lapsed coverage and confirm registration displays the lapse before the visit and offers self-pay, and that the response is stored on the encounter.",
    dep: ["coverage-model","interface-engine","registration-and-check-in"]
  },
  "claim-scrubbing": {
    s: "Assembles charges and codes into a claim and validates it against payer rules before submission, so it can be paid on the first attempt.",
    d: "The claim builder combines patient, coverage, provider, charges, diagnoses and procedures in the required format. A rules engine checks code pairs, required fields, authorization numbers, timing limits and payer-specific edits and routes failures to a work queue. Staff fix problems and release the claim. Payers publish edits that change often, and the organization adds lessons from past denials. The hard part is the volume of rules and the slow feedback: errors found at scrubbing cost minutes, and those found at denial cost weeks.",
    k: ["Block on any failed edit versus allow release with a warning: blocking raises first-pass payment rates and slows cash flow; warnings send more claims out that are likely to fail.", "Payer-specific rules versus generic rules: specific cuts denials and is expensive to keep current."],
    p: ["A new payer edit is missed and a week of claims is rejected.", "A fixed claim is resubmitted as new and treated as a duplicate."],
    v: "Submit a test claim with a missing authorization number and a bundled procedure pair, then confirm both are flagged before release and a corrected claim passes with no remaining edits.",
    dep: ["charge-capture","coding-assistance","coverage-model","fee-schedules","eligibility-verification"]
  },
  "claim-submission": {
    s: "Sends claims to payers electronically, tracks acknowledgments, and posts the remittance advice and payments back to the right accounts.",
    d: "Claims go through a clearinghouse or directly to the payer. Acknowledgments confirm syntax and acceptance; later the remittance arrives describing payment, adjustments and denial reasons per line, with a payment transfer that must be matched to the advice. Posting applies each amount to the right charge and sets the patient's responsibility. Difficulties: partial payments, payment reversals, claims lost without acknowledgment and reconciling the money received against what was posted.",
    k: ["Clearinghouse versus direct payer connections: a clearinghouse simplifies many payers and adds fees and another point of failure; direct is cheaper per claim and costs engineering.", "Auto-post remittances versus manual review: auto-posting is fast and propagates misapplied payments."],
    p: ["A payment applied to the wrong patient account leaves one overpaid and another sent to collections.", "Claims with no acknowledgment are assumed delivered and age silently."],
    v: "Submit a test claim, receive a matching remittance with an adjustment and a denied line, then confirm payment posts to the right charges, the adjustment is recorded and the denied line enters the worklist.",
    dep: ["claim-scrubbing","interface-engine","denial-management","statements-and-collections","payer-and-registry-feeds"]
  },
  "denial-management": {
    s: "Works the claims a payer refused or underpaid: finds the cause, corrects and resubmits or appeals, and feeds the cause back to prevent repeats.",
    d: "Denials arrive coded by reason and are grouped into work queues by type: missing information, medical necessity, authorization, timely filing and coding. Staff gather records, write the appeal and track deadlines, which can be as short as thirty days. Analytics rank causes by lost revenue. The value is upstream: each recurring denial points to a front-end process, a documentation habit or a rule that needs fixing. The challenge is that these fixes cross departments that do not otherwise talk.",
    k: ["Appeal everything above a threshold versus selective appeals: broad appeals recover more and use staff time at low yield; selective is efficient and leaves money.", "Fix at the source versus work each denial: source fixes eliminate the repeat and require cross-team change; case work is simple and endless."],
    p: ["An appeal deadline passes because the denial sat in an unassigned queue.", "Root causes are counted but never assigned, so the same denial returns monthly."],
    v: "Post a test denial for a missing authorization and confirm it routes to the authorization queue with a deadline, an appeal can be sent with the chart attached, and the cause is counted in the denial report.",
    dep: ["claim-submission","documentation-queries","referrals-and-authorizations","reporting-warehouse"]
  },
  "statements-and-collections": {
    s: "Bills patients for their share, takes payment, offers plans and hardship review, and escalates unpaid balances according to policy and law.",
    d: "After insurance pays, the remaining patient responsibility generates a statement with plain-language charges and options to pay. Accounts move through stages: reminders, payment plans, financial assistance screening and, finally, outside collection. Estimates before a service tell patients what they will owe. Regulations restrict timing and the collection actions that nonprofit hospitals may take. The hard parts are accuracy (a wrong balance destroys trust), unclear bills that patients do not understand and protecting patients eligible for assistance from collection.",
    k: ["Estimate before service versus bill after: estimates build trust and are frequently wrong; after-the-fact billing is exact and surprises patients.", "Early outsourcing of collections versus extended internal follow-up: outsourcing is cheap and aggressive; internal is gentler and costs staff."],
    p: ["A patient eligible for financial assistance is sent to collections because screening was skipped.", "A statement shows a balance that has been paid and not yet posted."],
    v: "Post insurance payment on a test account, confirm the patient balance and statement agree to the cent, then apply a payment plan and confirm the collection stage pauses.",
    dep: ["claim-submission","coverage-model","episodes-and-accounts","forms-and-payments"]
  },
  "fee-schedules": {
    s: "The prices charged and the contracted rates each payer pays, used to price charges, expect payment and detect underpayment.",
    d: "A master price list covers every service. Each payer contract defines allowed amounts, which may be a percentage of a government schedule, a fixed amount, a bundled rate or a rate by case type. The system calculates the expected payment on each claim and compares it to the remittance. Contracts change on anniversary dates, and effective dating decides which rate applies. The difficulties are modeling complex contract terms (carve-outs, stop-loss, bundled episodes) and updating thousands of rates correctly on one date.",
    k: ["Model contract terms in the system versus in a separate tool: in the system is integrated and rigid; separate tools model more and add a sync step.", "Single master price list versus per-department pricing: a master avoids inconsistency and ignores local reality."],
    p: ["A rate update with the wrong effective date underprices a month of services.", "Underpayments go undetected because expected payment is not computed."],
    v: "Price a test service under two payers, confirm each uses its contracted rate for the service date, then post a short payment and confirm it appears on the underpayment list.",
    dep: ["coverage-model","record-database"]
  },
  "master-patient-index": {
    s: "The registry that assigns each person one enterprise identifier and holds the demographics and local identifiers used to find the right patient.",
    d: "Each system that knows the person registers its identifier, name, birth date, sex, address and contact data. Search uses exact and fuzzy matching on names with phonetic and typo tolerance, plus the other fields. New registrations get a candidate list and scores. The index stores aliases, name changes and the history of what was linked. The challenge is that no field is reliable: names change, birth dates are wrong, people lack identifiers, and twins and family members share nearly everything.",
    k: ["Deterministic matching rules versus probabilistic scoring: deterministic is explainable and misses variants; probabilistic finds more and needs tuned thresholds.", "Enterprise identifier assigned centrally versus linked local identifiers: central is simple for users and harder to unwind; links are reversible and complex."],
    p: ["Twins registered with the same birth date and similar names are merged into one chart.", "An unmatched return visit creates a duplicate chart with no allergy history."],
    v: "Search for a test patient with a misspelled name and a transposed birth month and confirm the correct person ranks first with a score, a different person with the same name ranks lower and neither is auto-linked.",
    dep: ["record-database","directory-and-sso"]
  },
  "duplicate-detection-and-merge": {
    s: "Finds charts that belong to one person and combines them, or separates charts wrongly combined, preserving every entry and the ability to reverse.",
    d: "A background process scores pairs of records and queues the likely duplicates for review by data stewards. A merge links the charts, chooses surviving demographics and combines clinical content, which may involve reconciling conflicting allergy and medication lists. Reverse merges (unmerge) restore the originals. Downstream systems must be told, so that orders and results follow the surviving identity. Hard parts: the cost of a wrong merge, which exposes one patient's data to another and contaminates both charts, and propagation across every connected system.",
    k: ["Steward review of every merge versus auto-merge above a threshold: review is safe and creates backlogs; automation clears them and makes some wrong merges.", "Physically combine data versus link and present as one: combining is simple to read and difficult to undo; linking keeps independent history."],
    p: ["A wrong merge puts one person's allergies in another's chart and the unmerge cannot find the later entries.", "A merge in the record does not propagate and the laboratory still holds the old identifier."],
    v: "Merge two test charts, confirm all content appears under one identity with entry provenance retained, then unmerge and confirm each chart returns to its pre-merge content, including entries made after the merge.",
    dep: ["master-patient-index","versioning-and-corrections","interface-engine","change-audit"]
  },
  "longitudinal-chart": {
    s: "The single organized view of a patient's history across visits and settings, assembling problems, medications, results, notes and documents for the person reading it.",
    d: "The chart is a view over the repository organized by tabs and summaries rather than a file. Reviewers see the most recent items first with filters by type, author, department and time. Summaries pull the key facts: allergies, problems, current medications and recent results. Many components write to it and each owns its data. Difficulties: very large records where loading everything takes too long, information scattered across tabs where clinicians do not look and presenting the same fact consistently across modules.",
    k: ["Summary-first display versus full chronological view: summaries speed review and can hide the detail that matters; chronology is complete and slow.", "Load everything on open versus on demand: full load is simple and slow on large charts; on demand is fast and incomplete at first glance."],
    p: ["Critical information buried on a rarely opened tab goes unseen at the decision.", "A 20-year chart takes a minute to open and clinicians skip review."],
    v: "Open the chart of a test patient with ten thousand entries and confirm the summary appears within the stated time, filters by type work and each item opens with its author and date.",
    dep: ["clinical-data-repository","clinical-timeline","role-based-access","consent-enforcement"]
  },
  "clinical-data-repository": {
    s: "The consolidated store of structured clinical facts from every source in the record, kept in a form that serves the chart, rules and reports.",
    d: "Entries from documentation, orders, devices and interfaces are normalized into a model of patients, encounters, observations, medications and documents. It supports fast chart reads, rule evaluation and extraction to the reporting store. Every entry carries source, author, time of event and time of recording. The difficulties are consistent modeling of facts that arrive in different shapes, enormous growth over time, and keeping a stable read model as upstream systems and standards change.",
    k: ["One normalized model versus source-shaped stores joined at read: normalized gives consistency and demands mapping work; source-shaped is easy to load and slow to query.", "Event log as the source of truth versus mutable current-state tables: a log gives history and audit and costs query complexity."],
    p: ["Entries missing an event time sort at the time they were loaded and appear in the wrong place.", "A new source with a different model is loaded without mapping and fields look empty."],
    v: "Load a result from an interface and a documented finding from the chart for one patient and confirm both are queryable through the same model with source, author, event time and recording time.",
    dep: ["record-database","observation-model","terminology-mapping"]
  },
  "versioning-and-corrections": {
    s: "Keeps every earlier state of an entry and records who changed what and why, so the record can be corrected without losing what was believed at the time.",
    d: "An edit creates a new version linked to the old one and carries a reason. Entered in error is a status, not a deletion: the entry stays visible in history, marked, and removed from active views. The system can answer both what is true now and what the clinician saw at 2 p.m. on a given day. Downstream copies, such as portal views and external documents, must be told. The hard part is semantic: corrections cascade through results, orders and notes that referred to the corrected entry.",
    k: ["Immutable versions versus overwrite with an audit log: versions make time travel exact and cost storage and query complexity; overwrite is simple and reconstructs poorly.", "Correct in place with a marker versus a new linked entry: markers are readable; linked entries are explicit."],
    p: ["A retraction hides the original from active views but not from a report built before the change.", "A correction made without a stated reason cannot be explained in a later dispute."],
    v: "Enter a value, mark it entered in error with a reason and confirm active views hide it, history shows both versions with authors and times, and a query as of the earlier time returns the original.",
    dep: ["clinical-data-repository","change-audit","record-database"]
  },
  "terminology-mapping": {
    s: "Translates the many local and legacy codes used across departments into standard concepts, so data from different sources can be compared and checked.",
    d: "Each source has its own codes for tests, diagnoses and medications. Mapping tables link each to a standard concept with a relationship type: equivalent, narrower or broader. Stewards review new unmapped codes as they arrive. Data stores both the original and the mapped code. Hard parts: mappings are judgment calls and not always one-to-one, standards change which requires remapping, and old data keeps the mapping that was true when it was loaded.",
    k: ["Map at load time versus at query time: load-time is fast and fixes a decision in stored data; query-time can be revised and costs each read.", "Keep the original code with the mapped one versus replace: keeping allows remapping and doubles storage."],
    p: ["A broader mapping lumps two clinically different tests into one trend.", "New local codes appear daily and sit unmapped, so data is invisible to rules."],
    v: "Load a result with a new unmapped local code and confirm it appears on a stewards' list, is stored with its original code, and after mapping becomes visible to a rule keyed on the standard concept.",
    dep: ["terminology-service","clinical-data-repository"]
  },
  "sensitive-segments": {
    s: "Marks parts of the record, such as mental health, reproductive health, substance use treatment or HIV status, that carry extra legal protection and restrict who can see and release them.",
    d: "Segments are identified by the diagnosis, the note type, the author's service, the location or the order. Tagged content is hidden from general views, excluded from portal and external release unless consent or law permits, and shown with explicit access reasons otherwise. Rules differ by jurisdiction and by patient age. The difficulty is leakage by inference: a medication list, a billing line or an appointment name can reveal a diagnosis the note itself hides.",
    k: ["Tag automatically from codes versus tag manually by authors: automatic is consistent and over-tags; manual is precise and forgotten.", "Hide completely versus show with a restricted marker: hiding protects the patient and risks clinicians missing relevant data; markers warn and reveal existence."],
    p: ["A restricted diagnosis shows in a portal medication list through the drug name.", "A statement mailed to the policyholder lists a sensitive service."],
    v: "Tag a test note as restricted, open the chart as a user without that access and confirm the note is hidden, the drug it prompted does not disclose the diagnosis, and the portal and an export both omit it.",
    dep: ["consent-directives","role-based-access","consent-enforcement","patient-record-view","record-release"]
  },
  "record-release": {
    s: "Handles requests from patients, lawyers, insurers and other providers for copies of the record, applying legal authorization, scope limits and redaction.",
    d: "A request arrives with identification and authorization. Staff verify the requester's right to the data, select the legally required scope, exclude restricted segments, produce the copy and log the disclosure. Patients have a right to their own record in a set time and, in most places, in electronic form. Disclosures must be listed on request. The difficult parts are assembling a complete record from many modules, redacting by hand when tagging is incomplete and meeting short legal deadlines under high volume.",
    k: ["Self-service download for patients versus staff-mediated requests: self-service is fast and bypasses review of sensitive content; staff review is safe and slow.", "Release the full record versus the minimum asked: full is simple and discloses more than needed."],
    p: ["A release to an insurer includes psychotherapy notes that need separate authorization.", "A copy sent to the wrong requester because verification was by name only."],
    v: "Process a test request with authorization for one date range and confirm the copy covers only that range, restricted segments are excluded, and a disclosure entry lists recipient, purpose and date.",
    dep: ["longitudinal-chart","sensitive-segments","consent-enforcement","access-audit-trail"]
  },
  "retention-and-archival": {
    s: "Keeps records for the legally required period, moves old data to cheaper storage, and destroys it on schedule with proof, while keeping it readable.",
    d: "Retention periods vary by record type, patient age and jurisdiction, and may extend for minors, litigation or research. Old encounters can move to an archive that remains searchable but slower. When systems are replaced, the old data must stay readable, which leads to read-only legacy archives for decades. Destruction requires a documented process and legal hold checks. The hard parts: formats that become unreadable, keeping linked content (images, documents) with the record and ensuring that backups also respect the destruction decision.",
    k: ["Migrate old data into the new system versus keep a read-only legacy archive: migration gives one view and loses fidelity; an archive is faithful and awkward.", "Destroy at the earliest permitted date versus keep indefinitely: destroying limits breach and litigation exposure; keeping serves research and future care."],
    p: ["A legal hold is not applied, and scheduled destruction deletes evidence.", "An archive format that no tool can open after the vendor disappears."],
    v: "Run the retention job on a test set that includes an expired record and one under legal hold and confirm only the expired one is destroyed, with a destruction certificate and a note in the audit trail.",
    dep: ["document-and-image-store","record-database","backup-and-restore","versioning-and-corrections"]
  },
  "encounter-model": {
    s: "The representation of one contact between patient and organization, such as a clinic visit, inpatient stay or emergency visit, to which orders, notes and charges attach.",
    d: "An encounter has a class (outpatient, inpatient, emergency), a status, a time period, a location, participants and a reason. Inpatient stays may contain child encounters for each transfer or procedure. Most clinical data references an encounter, and so do charges. Different departments define encounters differently, so one stay might be one account to billing and five episodes to nursing. The problems are boundaries (when does an emergency visit become an admission) and moving content when an encounter is split or merged.",
    k: ["One encounter per stay with location history versus one per location: one per stay is simple for billing; per location matches clinical workflows and multiplies records.", "Allow documentation without an encounter versus require one: requiring keeps everything attributable and blocks ad hoc contacts such as phone calls."],
    p: ["An emergency visit converted to an admission leaves orders on the old encounter and billing on the new.", "Phone advice documented without an encounter is missed by charge and quality logic."],
    v: "Register an emergency visit, convert it to an inpatient admission and confirm orders, notes and charges all appear under the correct encounter with a link between the two and one continuous timeline.",
    dep: ["episodes-and-accounts","location-hierarchy","care-team","record-database"]
  },
  "episodes-and-accounts": {
    s: "Groups encounters into an episode of care and into the financial account and guarantor responsible for paying, which billing needs and clinicians seldom see.",
    d: "An episode ties related encounters together, such as a pregnancy, a cancer treatment course or a surgery and its follow-up. An account collects charges for billing, with a guarantor (the person responsible for payment), who may differ from the patient. One stay can span several accounts, such as hospital and professional. Rules decide which encounters join which account. The difficulty is that clinical and financial groupings do not match, and guarantor data goes stale with divorces, deaths and minors turning adult.",
    k: ["One account per encounter versus merging related ones: per encounter is traceable and fragments the bill; merging gives one statement and complexity in splitting payments.", "Guarantor stored on the account versus on the patient: on the account tracks each service; on the patient is easy to maintain."],
    p: ["A deceased guarantor continues to receive statements for a surviving dependent.", "Charges for a pregnancy episode split across accounts and are paid in the wrong order."],
    v: "Create an episode with three encounters and a guarantor change midway and confirm each charge lands on the account of its service date with the correct guarantor and the episode view shows all three.",
    dep: ["encounter-model","coverage-model","statements-and-collections","master-patient-index"]
  },
  "care-team": {
    s: "Records which clinicians and staff are responsible for a patient, in what role and for how long, used for routing results, messages and access decisions.",
    d: "Roles include primary physician, attending, nurse, consultant and covering clinician. Assignments come from registration, referrals, admission orders and handoffs, and have start and end times. Other modules read it: results route to the responsible clinician, messages go to the team, and access rules may allow access only for people on the team. Keeping it accurate is difficult. Shift changes, coverage arrangements and staff leaving make the list stale, and a stale list sends a critical result to someone who is not there.",
    k: ["Derive the team from activity versus explicit assignment: derived is current and noisy; explicit is accurate and needs upkeep.", "Individual responsibility versus team pools: individuals are accountable and break on absence; pools are resilient and diffuse."],
    p: ["A departed clinician remains the responsible party for a hundred patients' results.", "Coverage for a vacation is set in a calendar but not in the routing table."],
    v: "Assign cover to a test clinician for a week, route a result during that week and confirm it reaches the cover, then confirm routing returns to the original after the end date.",
    dep: ["encounter-model","location-hierarchy","directory-and-sso"]
  },
  "location-hierarchy": {
    s: "The model of the organization's sites, buildings, departments, units, rooms and beds, which scheduling, access, ordering and billing all reference.",
    d: "A tree or graph represents facilities down to the bed, with attributes such as type, capacity, services, opening hours and which legal entity owns it. Rules and defaults attach at different levels: an order set at a department, a printer at a room, a billing entity at a facility. Merges, openings and renamings are frequent in growing health systems. The difficulty is that the same place has several names across systems, and changes ripple everywhere.",
    k: ["Single hierarchy versus separate clinical and financial views: single is consistent and does not match how finance reports; separate views each fit their user and need mapping.", "Model beds individually versus unit capacity only: beds enable placement and need upkeep; capacity counts are simple and imprecise."],
    p: ["A renamed unit leaves old orders and defaults pointing at a name that no longer exists.", "A new site opens and its users inherit defaults from the wrong parent."],
    v: "Add a new test unit under a department, confirm it inherits the department's defaults and its own overrides apply, then retire it and confirm historical encounters still display its name.",
    dep: ["record-database"]
  },
  "observation-model": {
    s: "The common structure for measurements and findings, such as lab values, vitals and scores, with value, unit, time, method, status and source.",
    d: "Each observation has a coded concept, a value of a defined type, a unit, the time the thing was measured, the status (preliminary, final, corrected) and references to the patient, encounter and order. Panels group related observations. Reference ranges and interpretation flags are attached with the observation, since they depend on the performing lab and patient. A single model serves laboratory, vitals, devices, questionnaires and patient reports, which is both its value and its strain.",
    k: ["Single observation model for everything versus type-specific tables: single enables uniform tools and stretches to fit exotic cases; type-specific fits precisely and multiplies code.", "Store the unit as reported versus normalized: as reported is faithful; normalized allows trends and risks conversion errors."],
    p: ["A value with the wrong unit is stored without conversion and charts as a tenfold error.", "Observation time confused with result time shifts a trend."],
    v: "Store a value in two units from two sources, confirm both retain their reported unit, the trend view converts to one unit with the conversion shown and the status of each is visible.",
    dep: ["clinical-data-repository","terminology-service","record-database"]
  },
  "clinical-timeline": {
    s: "A time-ordered view of everything that happened to a patient, across encounters and data types, used for chart review and handoff.",
    d: "The timeline merges notes, orders, results, administrations and events into one chronology with filters and zoom. It uses the event time of each item, so late-filed results land where they belong. Reviewers use it for rounds, handoffs and investigations. The difficulty is the amount of data and the mixed granularity: a single day in intensive care contains thousands of items, and users need summaries that are not misleading about what was omitted.",
    k: ["Event time versus recording time as the sort key: event time shows what happened when; recording time shows what was known when, which matters in review of decisions.", "Aggregate by default versus show every item: aggregation is readable and hides detail; full detail is complete and overwhelming."],
    p: ["A late-filed result appears in the past with no sign that it was unavailable at the time.", "Filters left on from an earlier use hide the entries the reader needs."],
    v: "File a result three hours after its event time and confirm it appears at the event time with a late-filed marker, and the as-known-at view for the earlier time does not show it.",
    dep: ["clinical-data-repository","longitudinal-chart","versioning-and-corrections"]
  },
  "coverage-model": {
    s: "Describes a patient's insurance and other payment arrangements: plans, subscribers, order of payers, effective dates and benefit details.",
    d: "A person may have several coverages, ordered as primary, secondary and so on, each with a subscriber, member identifier, group, plan and dates. The encounter chooses which coverages apply, and that choice drives eligibility checks, authorization, claims and expected payment. Coverage changes often and is entered at the front desk, often from a card photograph. The main problems are wrong order of payers, retroactive terminations and different identifiers in the payer's and the organization's data.",
    k: ["Coverage attached to the patient versus to the encounter: on the patient is easy to maintain; per encounter is accurate for each service and repeated.", "Free-text plan names versus a controlled plan table: free text is quick at the desk and breaks rules; a table enables billing logic and needs maintenance."],
    p: ["Payer order reversed for a patient with two plans, and the primary never gets the claim.", "A retroactive termination leaves paid claims to be recouped months later."],
    v: "Register a test patient with two coverages, bill a visit and confirm the claim goes to the primary with the secondary receiving the remainder, then terminate the primary retroactively and confirm affected encounters are flagged.",
    dep: ["record-database","fee-schedules"]
  },
});
