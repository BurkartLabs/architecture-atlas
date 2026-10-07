// Details for the electronic health records plate, part 1: patient portal, interoperability, clinical documentation.
ATLAS.details("health-records", {
  "portal-accounts-and-proxy": {
    s: "Patient logins, identity proofing and delegated access, so a parent, caregiver or adult child can act for a patient within rules the patient or the law sets.",
    d: "An account is linked to one patient record only after identity proofing, such as an activation code handed over in person or a verified document check. Proxy relationships are separate grants with a scope (view, message, schedule), an expiry and, for minors, rules that change at defined ages. Authentication uses passwords plus a second factor, with account recovery that must not become the weak path. The hard parts are adolescent confidentiality, where a parent may lose access to some content at an age that differs by region, and revoking access immediately when a custody or abuse situation changes.",
    k: ["Proof at the desk versus remote proofing: in-person codes are strong but slow patient sign-up; remote checks scale and add a fraud and exclusion risk.", "Single proxy grant versus per-category grants: simple grants are easy to explain, but granular scopes are needed for adolescents and sensitive categories."],
    p: ["A proxy grant that outlives a divorce or protective order exposes a record to the person it was meant to exclude.", "Account recovery through email alone lets a mailbox compromise become a record compromise."],
    v: "Create a proxy for a test minor, age the patient past the cutoff in a test clock, and confirm the proxy loses access to the restricted categories while the audit trail shows the change.",
    dep: ["master-patient-index","directory-and-sso","access-audit-trail"]
  },
  "patient-record-view": {
    s: "The portion of the chart patients can read online: results, medications, visit summaries, immunizations and notes, released on rules that balance transparency with clinical judgment.",
    d: "The view is a filtered projection of the record, not a copy. Each item type has a release rule: results may appear immediately, after a delay so the clinician can call first, or only after review. Notes are shown unless the author marks harm or confidentiality exceptions. Coded content is translated into plain language, and units and reference ranges are shown beside values. Hard problems are the sheer volume of lab data patients cannot interpret, content about third parties inside a note, and keeping the projection consistent when the clinician later corrects or retracts the underlying entry.",
    k: ["Immediate release versus delayed release of results: immediate respects patient access rights and speed, but patients may learn serious findings alone before any explanation.", "Release by data type versus by individual item: type rules are predictable, while item overrides catch exceptions at the cost of clinician work."],
    p: ["A corrected result that stays displayed in its old form in the portal leads a patient to act on a retracted value.", "Notes quoting a family member or abuse report get released because the exclusion flag was never set."],
    v: "Sign a result with a one-day release delay and confirm it is absent from a test patient's portal until the delay elapses, then correct it and confirm the portal shows the corrected value with a correction marker.",
    dep: ["portal-accounts-and-proxy","longitudinal-chart","consent-enforcement","observation-model"]
  },
  "secure-messaging": {
    s: "Asynchronous messages between patients and the care team, routed to the right pool of staff and filed in the chart when they contain clinical content.",
    d: "A patient picks a category (question, refill, billing) that decides which pool receives the message. Staff triage it from a shared queue, reply, forward to a clinician or convert it into an order or a visit. Messages are stored with the encounter context, so that advice given by message is part of the record. The system sends a notification outside the portal that says only that a message exists. It is hard because patients expect responses like chat while staff treat it as unpaid work, and because urgent symptoms sometimes arrive in a queue nobody is watching.",
    k: ["Pooled queues versus messages addressed to one clinician: pools survive absences and leave, but patients lose a named person who knows them.", "Auto-reply with emergency guidance versus none: guidance covers risk at the cost of alert fatigue and lower perceived service."],
    p: ["Messages sent to a clinician on leave sit unread because the routing rule keyed on the individual.", "Notification emails that include message text leak clinical information to an unsecured inbox."],
    v: "Send a test message with the category set to urgent while the recipient is marked absent and confirm it lands in the covering pool within the stated time and appears in the chart.",
    dep: ["portal-accounts-and-proxy","care-team","longitudinal-chart","access-audit-trail"]
  },
  "self-scheduling": {
    s: "Lets patients book, move and cancel visits and complete check-in steps remotely, within rules about visit types, eligibility and slot visibility set by each clinic.",
    d: "The portal asks the scheduling engine for slots and filters them by visit type, patient status (new or established), referral requirements and the clinician's published template. Booking holds a slot atomically, then confirms it. Before arrival the patient can verify demographics and insurance, sign forms, answer questionnaires and pay a copayment. Hard parts are exposing only what the clinic wants public, preventing no-show abuse and double booking, and writing answers into structured fields instead of free text that registration staff must retype.",
    k: ["Show all slots versus a curated subset: full availability lowers calls, but clinics hold slots back for urgent and complex cases.", "Hold the slot during booking versus check at confirm: holds prevent a lost race and cause phantom unavailability if abandoned."],
    p: ["A visit type left open to self-booking lets patients take long procedure slots for problems needing a short visit.", "Edits to demographics at e-check-in overwrite verified data without review."],
    v: "Book the last available slot from two test accounts at the same instant and confirm exactly one succeeds, the other is offered alternatives, and the slot count matches on the clinic's schedule.",
    dep: ["appointment-scheduling","resource-templates","eligibility-verification","portal-accounts-and-proxy"]
  },
  "refill-requests": {
    s: "A patient-initiated request to renew a prescription, sent to the prescriber's queue with the medication, pharmacy and last-fill information already attached.",
    d: "The patient picks from the active medication list, and the request arrives in a queue with prior orders, last visit date, recent results and refill protocol checks. Protocols can let a nurse or pharmacist approve routine renewals within limits, such as no changes for twelve months and a monitoring test within range. The approved prescription is routed to the pharmacy electronically. Difficult cases are controlled substances, which cannot follow the routine path, and medications the patient no longer takes but never removed from the list.",
    k: ["Protocol-based approval by non-prescribers versus prescriber-only: protocols cut physician workload, but the protocol limits must be maintained and audited.", "Request from the active list only versus free text: list requests are structured and checkable, while free text catches medicines the list misses."],
    p: ["A refill approved against a stale medication list restarts a drug the patient stopped for side effects.", "Requests sent to the wrong pharmacy because the preferred one changed and the record was not updated."],
    v: "Submit a refill for a test medication that is due for a lab check and confirm the request is flagged for prescriber review, not auto-approved, and a routine medication follows the protocol path.",
    dep: ["medication-list","e-prescribing","controlled-substances","secure-messaging"]
  },
  "forms-and-payments": {
    s: "Online intake questionnaires, signed consents and bill payment, so administrative work is finished before the visit and answers land in the record as data.",
    d: "Forms are defined once and rendered on the portal, kiosks and tablets. Responses either create structured entries (history, medications, screening scores) or attach as documents, and some require a clinician to accept them before they change the chart. Payment accepts a card or bank transfer against an open account balance and posts the result to patient accounts. The hard parts are proof of who signed, form versions that must remain readable years later, and keeping card data out of the clinical system by handing it to a separate payment service.",
    k: ["Direct entry into the chart versus a staged review queue: direct entry saves time but lets unverified answers overwrite clinical data.", "Hosted payment page versus embedded fields: hosting reduces security scope, while embedding gives a smoother experience."],
    p: ["A form edited after patients signed it leaves signatures pointing at text they never saw.", "Payment posted to the wrong guarantor account when a family shares a login."],
    v: "Complete a consent form from a test portal account and confirm a signed, versioned document appears in the chart with timestamp and signer, and the form's text at that version can be re-displayed.",
    dep: ["consent-capture","statements-and-collections","structured-capture","document-and-image-store"]
  },
  "patient-generated-data": {
    s: "Readings and answers that patients produce outside the clinic, such as home blood pressure, glucose, symptom diaries and wearable summaries, brought into the record with their source marked.",
    d: "Data arrives through manual entry, a connected device service or a questionnaire. Each value carries its source and device, and is stored apart from clinician-verified observations until a person accepts it. Thresholds can create tasks for the care team, but high-frequency data needs summarizing or it floods the chart. The difficulty is trust and workload: devices differ in accuracy, patients enter implausible values, and nobody is watching a feed overnight, so an alert threshold can promise monitoring that does not exist.",
    k: ["Store raw readings versus daily summaries: raw preserves detail and volume, summaries keep the chart readable and lose the spikes.", "Auto-merge into vitals versus a separate patient-reported section: merging helps trends while risking confusion over which values clinicians measured."],
    p: ["An alert rule on home readings creates an expectation of overnight monitoring that the service does not provide.", "Duplicate uploads from two apps double-count the same reading."],
    v: "Submit an out-of-range reading from a test device and confirm it appears flagged as patient-reported, creates one task for the right team, and does not appear in the clinician-verified vitals table.",
    dep: ["observation-model","flowsheets","device-integration","clinical-pathways"]
  },
  "interface-engine": {
    s: "The integration hub that receives, validates, transforms, routes and monitors messages between the record and every connected system, with queues, retries and replay.",
    d: "Each connection has an inbound channel that parses the transport, a mapping step that translates codes and field layouts, a router that decides destinations, and an outbound channel with delivery tracking. Messages are persisted before acknowledgment so a failure does not lose them, and errors go to a queue where staff can fix and resend. Hard parts: senders that deviate from the standard in local ways, ordering (an update arriving before the create), duplicate delivery, and a single stuck message that blocks everything behind it on the channel.",
    k: ["Strict validation versus lenient acceptance: strict rejects bad data early and breaks connections that technically work; lenient keeps flowing but admits garbage.", "Strict ordering per patient versus parallel processing: ordering avoids stale overwrites, while parallel throughput masks head-of-line blocking."],
    p: ["A mapping change tested on sample messages breaks on a rare code and silently drops results.", "Replaying a queue after an outage resends old updates that overwrite newer data."],
    v: "Stop a downstream system, send fifty messages and confirm they queue in order, then restart it and confirm all fifty arrive once, in order, with the delivery log showing each retry.",
    dep: ["event-and-order-messages","terminology-service","application-tier","record-database"]
  },
  "event-and-order-messages": {
    s: "Event-style messages in a widely used delimited format that announce patient admissions, orders, results and charges between departmental systems and the record.",
    d: "A sender emits a message when something happens: a patient is admitted, a lab result is final, a charge is posted. Messages are made of segments and fields whose meaning depends on the message type and the version, with extensions for local needs. Acknowledgments confirm receipt, not business success. The standard is permissive, so two compliant systems still disagree about field usage. The difficulty is semantics: whether a message is a new fact or an update, how to cancel or correct a previous one, and how to represent a result that replaces an earlier result.",
    k: ["Event notification versus full-state messages: events are small and ordered concerns, while full state is idempotent and costly.", "Local extension fields versus waiting for the standard: extensions ship now and fragment interoperability."],
    p: ["Treating a correction as a new result produces two results where one should be retracted.", "A cancel message processed before its original leaves a phantom order."],
    v: "Send an admission, a transfer and a discharge for one test patient and confirm the location history shows three ordered entries, then resend the transfer and confirm no duplicate entry appears.",
    dep: ["interface-engine","admit-discharge-transfer","order-routing","terminology-mapping"]
  },
  "document-exchange": {
    s: "Packaging a patient's summary, discharge letter or visit note as a structured document that another organization can receive, display and partly import.",
    d: "A document is a signed, time-stamped snapshot with a header (patient, author, custodian, type) and sections holding narrative and optionally coded entries. It is sent point to point, published to a registry that other organizations query, or fetched on demand. Receivers display it and may reconcile parts such as medications and allergies into their own record. The hard parts are consistent coding across senders, huge documents with little value, and deciding what to import as data, because imported errors become the receiving system's own.",
    k: ["Import discrete entries versus display-only: import enables checking and trends, but amplifies sender errors and creates ownership questions.", "Push on events versus pull on demand: push puts data where it is needed, while pull avoids sending to places that never read it."],
    p: ["Medication lists imported from a summary overwrite locally reconciled lists.", "Documents with no stated patient identifiers are matched to the wrong chart."],
    v: "Generate a summary for a test patient, open it in an unrelated viewer and confirm the header, medications and allergies render, then import it into a second test system and confirm provenance is shown.",
    dep: ["longitudinal-chart","terminology-service","cross-organization-lookup","consent-enforcement"]
  },
  "resource-api": {
    s: "A web API exposing patients, observations, medications and other clinical items as individually addressable resources, for apps, portals and partner systems.",
    d: "Each resource type has a defined shape, search parameters and a version. Clients read and search over HTTP with authorization scopes tied to a patient or a user, and write only where the server allows. Apps can launch inside the clinician's workflow with the current patient already in context. Hard parts: the standard defines shapes, not behavior, so servers differ on search and required fields; scopes need to map onto real access rules; and a single app request can be a very expensive query against a record built for other shapes.",
    k: ["Read-only API versus read-write: read-only limits risk to the record, while write enables workflows and demands validation and attribution.", "Fine scopes per resource versus coarse scopes: fine scopes follow minimum necessary and strain app developers and user consent screens."],
    p: ["An app granted patient-wide read scope retrieves sensitive categories the user never meant to share.", "Unbounded search queries from an app slow down clinician screens sharing the same database."],
    v: "Register a test app with one scope, request a resource outside that scope and confirm refusal, request an allowed one and confirm the call appears in the audit trail with the app identity.",
    dep: ["observation-model","consent-enforcement","role-based-access","access-audit-trail","terminology-service"]
  },
  "terminology-service": {
    s: "A shared service holding the code systems and value sets used for diagnoses, procedures, labs and medications, and translating between local and standard codes.",
    d: "Code systems are loaded in releases that arrive on a fixed schedule. The service answers lookups, validates codes against value sets and maps local codes (such as an in-house lab test) to standard ones. Other components call it rather than carrying their own copies. Hard parts: releases retire and redefine codes, so old records must still be interpreted as of their own date; a mapping may be one-to-many; and a lookup on every field of every message needs caching without serving stale data.",
    k: ["Central service versus local copies in each module: central ensures consistency, while local copies work during outages and drift apart.", "Pre-coordinated codes versus composed expressions: simple codes are easy to search, while composition expresses more and is harder to compare."],
    p: ["Loading a new release overwrites mappings that clinicians reviewed by hand.", "A code retired mid-year is rejected by validation on records dated before the retirement."],
    v: "Look up a retired code with a date before and after its retirement and confirm the service answers differently, then map a local test code and confirm the downstream message carries the standard code.",
    dep: ["record-database","terminology-mapping"]
  },
  "cross-organization-lookup": {
    s: "Finds which other organizations hold records for a patient and retrieves them on demand under agreed trust and consent rules.",
    d: "A query carries demographics and the purpose of use. A regional or national index returns the list of organizations that have matching patients, and the requester then fetches documents from each. Responses are filtered by each holder's consent and sensitivity rules. Hard parts are matching without a universal identifier, so wrong matches and misses are both likely, plus latency during a clinic visit, trust agreements among organizations and deciding whether a retrieved record becomes a copy kept locally or is shown and discarded.",
    k: ["Query-based retrieval versus pushing records to a shared repository: query keeps data with its owner, while a repository speeds access and concentrates risk.", "Probabilistic match with a threshold versus manual confirmation: automation is fast; a wrong match exposes a stranger's record."],
    p: ["A match on name and birth date alone links two different people and shows one's record to the other's clinician.", "A slow remote responder holds a clinician's screen open until timeout."],
    v: "Query for a test patient present at two simulated organizations and confirm both are found, a patient with a sensitive-data restriction returns only permitted documents, and each retrieval is logged with its purpose.",
    dep: ["master-patient-index","document-exchange","consent-enforcement","access-audit-trail"]
  },
  "device-integration": {
    s: "Takes readings and results directly from bedside monitors, infusion pumps and laboratory analyzers, so values reach the chart without retyping.",
    d: "Devices speak vendor and standard protocols over serial, network or wireless links, often through a gateway that associates each device with the patient and location it serves. Values arrive as a stream, and the gateway filters, timestamps and validates them. Nurses typically review before the values become charted observations. The central problems are association (the right device on the right patient, especially after bed moves), clock differences, artifact in the signal and long-lived devices that cannot be updated.",
    k: ["Automatic charting versus nurse validation: automatic saves effort, validation catches artifact and wrong-patient values at a time cost.", "Streaming every sample versus periodic snapshots: streams show events and fill storage, snapshots are small and miss spikes."],
    p: ["A monitor left associated with a discharged patient files readings in the next patient's chart.", "Mismatched device and server clocks reorder values in the flowsheet."],
    v: "Move a test monitor from one bed to another and confirm the old association ends, new values file under the new patient only, and a value with a failed validity flag lands in the review queue.",
    dep: ["observation-model","flowsheets","location-hierarchy","interface-engine"]
  },
  "payer-and-registry-feeds": {
    s: "Scheduled and event-driven reports to insurers, public health agencies and disease or quality registries, in the formats each one requires.",
    d: "Each recipient defines a data set, format and timing: immunization submissions, notifiable disease reports, cancer and trauma registries, birth and death records, and quality program uploads. The system selects qualifying records, formats them, sends them and tracks acknowledgments and rejections. Many require abstraction by trained staff before a case is complete. It is hard because the formats and rules vary by jurisdiction and change often, and because a rejected submission may only surface weeks later.",
    k: ["Automated extraction versus abstraction by staff: automation scales and misses context that only a reader of the chart can supply.", "Real-time submission versus nightly batches: real-time speeds public health response and couples the clinic workflow to the recipient's uptime."],
    p: ["A change in a recipient's required field silently turns every submission into a rejection nobody reads.", "A report includes patients who opted out under local rules."],
    v: "Record a reportable test condition and confirm a report is generated, submitted, acknowledged and linked to the case, then force a rejection and confirm it appears on a work queue the same day.",
    dep: ["interface-engine","quality-measures","clinical-data-repository","consent-enforcement"]
  },
  "bulk-export": {
    s: "Extracts of records for a whole population or cohort, in standard formats, for analytics, transfers to another system and patient or regulator requests.",
    d: "An authorized client requests an export for a group, and the server prepares files asynchronously and publishes them for download. The server applies the same access, consent and de-identification rules as for single reads, but over millions of rows. Exports also support migration when an organization changes vendors, which exposes every shortcut taken in the data model. The hard parts are query load on the production database, ensuring a complete and consistent snapshot, and proving that nothing excluded by policy left with the files.",
    k: ["Export from the production database versus a replica: production is current but at risk of slowing clinicians; a replica lags and is safe.", "Include all history versus current state: full history supports audit and migration and multiplies size."],
    p: ["A large export run during clinic hours slows the chart for everyone.", "Exported files stored on a shared drive outlive the project they were made for."],
    v: "Export a ten-patient test cohort that includes one opted-out patient and one restricted category, then confirm the opted-out patient is missing, the restricted data is absent and the export log names requester and purpose.",
    dep: ["reporting-warehouse","consent-enforcement","deidentification","access-audit-trail"]
  },
  "note-templates": {
    s: "Reusable note layouts with auto-filled fields and shortcuts that let clinicians document a visit quickly while pulling in current data from the chart.",
    d: "A template defines sections and dynamic elements that pull medications, results or vitals at the time of writing. Shortcut phrases expand into longer text, and defaults can be set per specialty or user. Pulled data is a snapshot at that moment and does not update afterward. The result is faster documentation and a risk of copied-forward text: long notes full of stale or unverified statements, where it is hard to see what the clinician actually decided. The difficulty is giving speed without letting notes lose their meaning.",
    k: ["Rich auto-population versus a blank note: auto-population saves time and invites unreviewed content; blank notes are slow and more deliberate.", "Copy-forward permitted versus blocked: copying keeps continuity in long stays and spreads outdated findings."],
    p: ["A template default that records a normal exam gets signed on a patient who was never examined that way.", "Smart text pulls an old allergy list after it was changed, and the note disagrees with the chart."],
    v: "Write a note from a template for a test patient, change the patient's medication list afterward and confirm the signed note keeps the original snapshot while a new note reflects the change.",
    dep: ["structured-capture","signing-and-addenda","observation-model","medication-list"]
  },
  "structured-capture": {
    s: "Entry of findings as coded fields, picklists and scores instead of free text, so other components can search, trend and apply rules to what was recorded.",
    d: "Fields are bound to coded concepts and units. Entry screens use discrete controls, and some convert phrases typed in narrative into candidate codes for the author to confirm. Structured entries feed decision support, quality reports and billing, which is why organizations push for them. The cost falls on the clinician, who sees the screen designed for the database instead of for the conversation. The hard parts are choosing a level of granularity that people will actually complete and handling the case where no option fits.",
    k: ["Discrete fields everywhere versus targeted structure: full structure gives computable data at the price of clinician time; targeted structure fits what is actually used.", "Allow free-text fallback versus forbid it: fallback keeps notes honest and defeats the data goal."],
    p: ["A required field with no right answer is filled with whatever clears the screen, and the data looks reliable but is not.", "Different clinics use the same field to mean different things."],
    v: "Record a coded finding for a test patient and confirm a search for the code returns the patient, a rule keyed on it fires, and the entry shows the unit, author and time.",
    dep: ["observation-model","terminology-service","clinical-data-repository"]
  },
  "dictation-and-transcription": {
    s: "Turns spoken clinician narration into text for the record, through speech recognition, human editors or a combination, with the author signing the result.",
    d: "Audio is captured on a device or phone line and sent to a recognition engine, a transcriptionist for editing, or both. The draft returns to the author's inbox, and the clinician reviews, corrects and signs it. Specialized vocabularies and speaker adaptation raise accuracy. Some systems listen in the room and draft the whole note from the conversation. The difficulty is the review step: errors that read plausibly, such as a dropped negative or a wrong drug name, pass an author who skims and become the permanent record.",
    k: ["Recognition with clinician review versus human transcription: recognition is cheaper and quicker, while the clinician absorbs correction work and risk.", "Draft from ambient audio versus dictation: ambient saves keystrokes and puts a recording and a drafting step in the room."],
    p: ["A dropped negation changes the meaning of a sentence and goes unnoticed through signing.", "Audio files stored longer than policy allows become an unplanned patient record."],
    v: "Dictate a test sentence containing a negation and a drug name, then confirm the draft is routed to the author, the signed text matches intent and the audio is deleted per the retention rule.",
    dep: ["signing-and-addenda","note-templates","document-and-image-store"]
  },
  "problem-list": {
    s: "The maintained list of a patient's current and resolved conditions, which clinicians, rules and billing all read as the summary of what is wrong.",
    d: "Entries are coded diagnoses with onset, status and who added them. Anyone on the care team may be allowed to add, but removing or resolving needs a judgment. The list drives reminders, risk models, order checking and often the coding of visits. It decays unless someone owns it: duplicates, outdated entries and vague entries accumulate. The hard design question is shared ownership across specialists, each of whom sees the list through the lens of their own area and none of whom is responsible for the whole.",
    k: ["Open editing by any clinician versus a designated owner: open editing keeps the list current in busy teams and lets noise grow.", "Coded entries only versus free text: coded works for rules and billing, while free text states nuance the code lacks."],
    p: ["A resolved condition left active keeps triggering reminders and warnings for years.", "A sensitive diagnosis on the problem list is visible in portal summaries to a proxy."],
    v: "Add a diagnosis for a test patient, confirm a rule keyed to it fires, resolve it, and confirm the rule stops while history still shows when it was active and who resolved it.",
    dep: ["structured-capture","terminology-mapping","sensitive-segments","alert-rules"]
  },
  "flowsheets": {
    s: "Time-series tables of measurements such as vital signs, intake and output, pain scores and assessments, recorded repeatedly across a stay.",
    d: "Rows are measurable concepts and columns are times. Values come from nurses, devices or patient entry, each with its own author and timestamp, and can be corrected without erasing the original. Groups of rows are shown together for a unit or specialty, and graphs show trends. Flowsheet data feeds early-warning scores and charting views. The scale is the issue: an intensive care unit may record thousands of values per patient per day, which makes retrieval, display and legal retention a performance and storage problem.",
    k: ["Row-per-value storage versus packed series: row-per-value makes corrections and audits direct, while packed series are compact and complicate edits.", "Custom flowsheets per unit versus a standard set: local rows suit workflow and break shared reporting."],
    p: ["Two units record the same measurement under different rows, so a trend line splits in half.", "A time entered as the recording time rather than the measurement time shifts values and triggers a false score."],
    v: "Chart a blood pressure with a measurement time one hour before entry, then correct it and confirm the graph plots the measurement time, the original value remains in history and the audit shows both entries.",
    dep: ["observation-model","device-integration","versioning-and-corrections","risk-scores"]
  },
  "signing-and-addenda": {
    s: "The act that makes an entry part of the legal record: authentication of the author, locking of content, cosignature where required, and later additions that never overwrite the original.",
    d: "A draft is editable and invisible or marked as draft to other readers. Signing records the author, time and the exact content version, and locks it. Trainees need cosignature by a supervisor, and some entries are signed by multiple parties. Later changes are addenda or amendments linked to the original, with their own author and time. Hard parts are orphaned drafts that were never signed, rules for entries made on behalf of someone else and showing readers which version was seen when a decision was made.",
    k: ["Lock on signing versus allow quiet edits: locking preserves the legal record and requires addenda for every change, which feels slow.", "Co-signature before release versus after: before is safer for trainees and delays information others need."],
    p: ["Hundreds of unsigned drafts left by departing clinicians leave care undocumented in the legal record.", "An addendum shown apart from the note leaves readers acting on the uncorrected text."],
    v: "Sign a test note, attempt to change it directly and confirm refusal, add an addendum and confirm both show together with distinct authors and times and the original content hash is unchanged.",
    dep: ["versioning-and-corrections","change-audit","clinician-authentication","longitudinal-chart"]
  },
  "outside-documents": {
    s: "Scanned paper, faxes and received files from other organizations, indexed to the right patient and encounter and made searchable.",
    d: "Documents arrive through scanners, fax services, email gateways and exchange channels. Staff or software classify each one by type, match it to a patient and attach it to an encounter or the chart section where it belongs. Text recognition makes some searchable. Reviewed documents can be summarized into structured data on purpose. The problems are volume, the manual indexing backlog, wrong-patient attachment from handwritten or missing identifiers, and unreviewed documents that contain results someone is expected to act on.",
    k: ["Index at the front desk versus in a central team: front desks know the patient and are interrupted; central teams are efficient and further from context.", "Keep image only versus extract text and data: image only is accurate and unsearchable; extraction enables search and brings recognition errors."],
    p: ["A fax matched to the wrong patient puts one person's diagnoses in another's chart.", "Documents sit in an unindexed queue while they contain a result needing action."],
    v: "Scan a test document with a patient label, confirm it is attached to the right chart with type and date, then scan one with a missing identifier and confirm it goes to a review queue instead of a chart.",
    dep: ["document-and-image-store","master-patient-index","result-inbox","longitudinal-chart"]
  },
  "care-plans": {
    s: "Shared goals, interventions and responsibilities for a patient across a team and over time, used mainly for long-term and complex conditions.",
    d: "A plan lists the problems being addressed, measurable goals, planned interventions and who owns each one, with target dates and progress. Teams from different organizations may contribute, and the patient may see and edit parts. Tasks generated from the plan show on worklists and reminders. It is hard to keep a plan alive: most are written once and not updated, they overlap with pathways and orders, and shared authorship across organizations raises questions about who may change what.",
    k: ["Plan as structured goals and tasks versus a narrative document: structure drives worklists and tracking, narrative is faster and goes stale.", "One plan per patient versus per condition: one avoids conflicts and becomes crowded; per condition stays focused and fragments."],
    p: ["A goal that nobody owns never gets reviewed, and the plan quietly lapses.", "Contradictory plans from two specialties give a patient conflicting instructions."],
    v: "Create a plan with a goal and a task for a test patient, complete the task as the owner and confirm the goal's progress updates, the other team member sees it and the audit trail names both people.",
    dep: ["problem-list","clinical-pathways","care-team","structured-capture"]
  },
});
