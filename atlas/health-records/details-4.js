// Details for the electronic health records plate, part 4: consent, access control and audit, downtime, platform, cross-cutting concerns.
ATLAS.details("health-records", {
  "consent-capture": {
    s: "Records what a patient has agreed to, such as treatment, information sharing, research or photography, with the exact text signed, the signer and the time.",
    d: "Consents are captured on paper scanned in, on a tablet with a signature or through the portal. Each is stored as a structured record: type, scope, text version, signer (patient or representative and their authority), start and end dates and witness. Some are per encounter (surgery), others standing (sharing with an exchange). The hard parts are capacity and authority (who may consent for an incapacitated adult or a minor), language and understanding, and expiry.",
    k: ["Structured consent record versus scanned form only: structured can be enforced by software; scanned is legal evidence and invisible to rules.", "Opt-in versus opt-out for sharing: opt-in respects choice and yields low participation; opt-out keeps data flowing and surprises patients."],
    p: ["A consent signed for one procedure is read as covering a different one.", "Consent by a representative is recorded without the document proving authority."],
    v: "Capture a test consent with a representative signer and confirm the record stores the form version, signer, relationship, dates and an image of the signature, and shows as active on the patient's consent summary.",
    dep: ["document-and-image-store","encounter-model","master-patient-index"]
  },
  "consent-directives": {
    s: "The machine-readable form of a patient's choices: which categories of data may go to which people or organizations for which purposes, with exceptions and expiry.",
    d: "A directive says things like: share everything with my primary care clinic, nothing about mental health with other organizations, and allow emergency access. It is stored as a policy with subjects, data categories, purposes and an effect (permit or deny). It must combine with law, which may override the choice in emergencies or for public health reporting. Conflicts between directives, legal rules and organizational policy need defined precedence. The problem is that patient choices are rich and systems need simple outcomes.",
    k: ["Fine-grained categories versus few presets: fine-grained respects choice and is hard to understand and administer; presets are usable and coarse.", "Deny-by-default versus permit-by-default: deny protects and blocks care; permit enables care and may disclose against wishes."],
    p: ["A patient's restriction is recorded in one module and not applied by an interface that serves another organization.", "Two directives that conflict resolve differently in different components."],
    v: "Record a directive denying one category to one organization, query as that organization and confirm the category is withheld, then query as another and confirm it is released.",
    dep: ["consent-capture","sensitive-segments","terminology-service"]
  },
  "consent-enforcement": {
    s: "The check at every read, query and disclosure that applies the patient's directives and legal rules to the data about to be shown or sent.",
    d: "A policy decision point receives the requester, purpose, patient and data categories and returns permit, deny or permit with redaction. Policy enforcement points sit in the chart, the portal, the interfaces, the API and exports. All must call the same logic or results diverge. Decisions are logged. The difficulties are performance, since the check happens on every item, consistent categorization of data so policy can act on it, and emergency or legally mandated overrides that require evidence and review.",
    k: ["Central decision service versus embedded checks in each module: central is consistent and a performance and availability risk; embedded is fast and diverges.", "Filter at query time versus at write time into separate stores: query time is flexible and costs every read; separate stores are fast and duplicate data."],
    p: ["One export path was never wired to the policy check and releases restricted data.", "Cached decisions continue to permit access after the patient withdrew consent."],
    v: "Withdraw sharing consent for a test patient and confirm that within the stated time the portal, an external query and a bulk export each stop returning the restricted data, and each denial is logged.",
    dep: ["consent-directives","role-based-access","access-audit-trail","sensitive-segments","terminology-service"]
  },
  "advance-directives": {
    s: "Records the patient's wishes about life-sustaining treatment, such as resuscitation status, and their named decision-maker, so teams see them at the moment they matter.",
    d: "Documents such as a living will, a durable power of attorney for health care and resuscitation orders are scanned or entered as structured data. Code status appears in the chart banner and on handoff lists, and carries as an order with defined scope. The record must stay current: patients change their minds, and orders from another setting (an out-of-hospital form) may or may not be honored. The difficulty is clarity under stress: an ambiguous banner or a stale status can lead to unwanted resuscitation or a withheld one.",
    k: ["Structured order with a banner versus scanned document only: structured is visible at once and may oversimplify; documents carry nuance and are hard to find.", "Review at every admission versus on change only: review keeps it current and adds a conversation; on change is light and relies on updates."],
    p: ["A superseded directive remains displayed in the banner after the patient changed it.", "A directive from another organization is on file but never linked to the status."],
    v: "Set a test patient to do-not-resuscitate, confirm the banner, handoff list and wristband print show it, then reverse it and confirm every display changes and the history shows who changed it and why.",
    dep: ["order-entry","consent-capture","document-and-image-store","longitudinal-chart"]
  },
  "secondary-use-controls": {
    s: "Rules and approvals for using records beyond care, such as research, teaching, analytics and sharing with partners, including who approves, what is allowed and how data is limited.",
    d: "Requests go to a review body that approves a purpose, data set and duration. Approved users get data through a controlled environment, often a de-identified or limited data set, and cohort tools show counts without row-level access. Patient consent or opt-out is applied before data is released. The challenge is that re-identification is easier than people expect, and that secondary projects tend to expand beyond their approved scope without a new approval.",
    k: ["Controlled analysis environment versus released extracts: an environment keeps data in place and limits tools; extracts are convenient and leave your control.", "Honor patient opt-out for all uses versus only for research: broad respect builds trust and shrinks data sets and biases samples."],
    p: ["An approved extract is copied to a laptop and the project outlives its approval.", "Combining two released data sets re-identifies patients in a small group."],
    v: "Request a test cohort under an approved protocol and confirm opted-out patients are absent, only approved fields appear, counts below the small-cell limit are suppressed and the access is logged against the protocol.",
    dep: ["deidentification","consent-enforcement","reporting-warehouse","access-audit-trail"]
  },
  "deidentification": {
    s: "Removes or transforms identifying details from records so they can be used for analytics and research with limited privacy risk.",
    d: "Rule-based methods strip direct identifiers such as names, contact data and record numbers, and generalize dates and locations. Free text needs language processing to find names and dates inside the narrative, which never finds everything. Linked pseudonyms let analysts follow a patient over time without knowing who. Statistical methods measure the residual risk of identification. The hard parts are free text, rare conditions and small populations where the combination of age, place and diagnosis points to one person, and a trade-off between privacy and usefulness.",
    k: ["Remove identifiers by rules versus statistical risk assessment: rules are simple to audit and may leave unique combinations; statistics measures risk and needs expertise.", "Consistent pseudonyms across data sets versus fresh per release: consistent allows linkage and increases re-identification risk."],
    p: ["Names inside free-text notes survive because the tool only processes structured fields.", "Exact dates retained for convenience enable matching with public records."],
    v: "Run de-identification on a test set seeded with known names and dates in notes and structured fields, then search the output for every seeded value and confirm none remain.",
    dep: ["clinical-data-repository","reporting-warehouse","encryption-and-keys"]
  },
  "clinician-authentication": {
    s: "Proves who is using a workstation or app before access, using credentials, badges, biometrics and a second factor, and ties each action to that person.",
    d: "Users sign in with a directory identity, plus a card tap, a code or a biometric. Shared workstations need fast re-authentication that does not make people share sessions. Signing legal entries and prescribing controlled drugs require stronger proof. Service accounts and external apps authenticate by other means. The tension is between security and speed on a ward: if signing in takes forty seconds, people leave sessions open, share logins or tape passwords to monitors, and the audit trail then names the wrong person.",
    k: ["Badge tap with PIN versus password with a code: tap is fast on shared stations and weaker if cards are lent; passwords are standard and slow.", "Step-up authentication for signing versus session login only: step-up proves the signer at the cost of interruption."],
    p: ["A workstation left signed in lets the next person act under the first person's name.", "Biometric enrollment fails for gloved hands and staff fall back on shared credentials."],
    v: "Sign in on a shared test workstation with a badge and PIN, sign a note and confirm the audit shows that user and that a different user cannot sign on that session without authenticating.",
    dep: ["directory-and-sso","session-handling","access-audit-trail"]
  },
  "role-based-access": {
    s: "Grants permissions according to a person's job and context, such as which screens, patients, record sections and actions they can use.",
    d: "Roles such as physician, nurse, registrar and coder map to permission sets over functions (view, order, sign) and data (sections, sensitive categories). Context narrows it: department, location, shift and patient relationship. Roles are assigned from the directory and HR data and reviewed periodically. The challenge is the number of roles: real jobs do not fit neat templates, so role counts grow into hundreds, and users collect permissions from earlier jobs.",
    k: ["Few broad roles versus many narrow ones: broad roles are easy to manage and violate minimum necessary; narrow roles fit and become unmanageable.", "Static assignment versus attributes evaluated per request: static is simple and rigid; attribute rules adapt and are harder to explain."],
    p: ["A person who changed departments keeps the access from the old role for years.", "A new function ships with default access for every role."],
    v: "Assign a test user a registrar role and confirm they can register but cannot open clinical notes, then move them to another role and confirm the old permissions end the same day.",
    dep: ["directory-and-sso","relationship-based-access","access-audit-trail"]
  },
  "relationship-based-access": {
    s: "Limits access to patients with whom the user has a documented care relationship, such as being on the team, scheduled, or covering, instead of the entire database.",
    d: "A relationship is established by assignment, a scheduled visit, an order, a consult request, a unit census or an explicit search of a patient on the user's own unit. The system checks it at chart open. Without a relationship, the user is blocked or must state a reason and break the glass. It reduces curiosity browsing but depends on accurate care team data and breaks down when work crosses units, such as float staff and consultants. The hard part is calibration: relationships too narrow block care, too broad give no protection.",
    k: ["Block without a relationship versus allow with a reason and review: blocking protects and delays care; reason-and-review is smooth and relies on after-the-fact audit.", "Relationship expires on discharge versus lasts for a window afterward: expiry minimizes access and blocks follow-up work such as results and billing."],
    p: ["Consultants without a formal consult order cannot open the chart they were asked to review.", "Relationship windows so long that they cover almost everyone."],
    v: "Open a test patient's chart as a clinician with no relationship and confirm they are stopped and offered a reason prompt, then add them to the care team and confirm access without a prompt.",
    dep: ["care-team","role-based-access","break-the-glass","encounter-model"]
  },
  "break-the-glass": {
    s: "A controlled emergency override that lets a user open a record they would normally be blocked from, after stating a reason, with the access flagged for review.",
    d: "The user sees a warning that the access will be reviewed, chooses a reason such as emergency care or covering for a colleague, and gains time-limited access. The event is recorded with a high flag and sent to a privacy officer's queue. Reviewers check whether the reason was plausible. Patients may be notified. The design problem is that it must be fast enough for an emergency and rare enough to mean something: if users click through it daily, review queues drown and the control becomes decoration.",
    k: ["Reason picklist versus free text: picklists are quick and weak evidence; free text is detailed and slows an emergency.", "Review every override versus a sample: every override is thorough and costs staff; sampling is cheap and misses misuse."],
    p: ["Overrides are so common that reviewers stop reading them.", "No one reviews the queue and misuse goes on for years."],
    v: "Break the glass on a test restricted chart with a stated reason and confirm access is granted for the limited time, the event appears in the review queue within minutes and is closed with a reviewer decision.",
    dep: ["relationship-based-access","access-audit-trail","privacy-audit-analytics","session-handling"]
  },
  "session-handling": {
    s: "Manages how long a sign-in lasts, how a user locks and resumes, and how several clinicians share one workstation without losing context or leaking it.",
    d: "Sessions time out after inactivity and lock the screen, usually hiding patient data first. Fast user switching preserves the previous user's work in progress while requiring new authentication. Roaming sessions follow users between workstations. The session carries the active patient, and every action is stamped with user and workstation. The difficulty is wrong-patient risk: switching users or patients with stale screens, multiple charts open in tabs and a session that survived the person who started it.",
    k: ["Short timeout versus long: short timeouts protect and interrupt care; long ones are convenient and leave records exposed.", "Allow multiple patient charts open at once versus one at a time: multiple is efficient and invites wrong-patient actions; one is safe and slow."],
    p: ["A banner showing the wrong patient is overlooked after two charts were opened side by side.", "A roaming session remains active on a workstation the user left."],
    v: "Leave a test session idle past the timeout and confirm the screen locks with no patient data visible, switch users and confirm the first user's draft is preserved but unreadable by the second.",
    dep: ["clinician-authentication","application-tier","workstation-management"]
  },
  "access-audit-trail": {
    s: "A tamper-evident record of every view, search, print, export and change of patient data, with who, what, when, where and why.",
    d: "Every access emits an event with user, patient, data touched, action, workstation and the reason or relationship. Events flow to a store separate from the clinical database, which clinical administrators cannot edit. The trail serves patient requests for an accounting of access, breach investigations and regulators. It is large: a hospital produces billions of events a year, so retention, indexing and cost are real issues. The harder problem is completeness: components that skip logging leave blind spots.",
    k: ["Log reads as well as writes versus writes only: logging reads supports privacy review and multiplies volume enormously; writes only is cheap and cannot show who looked.", "Separate append-only store versus the application database: separate is tamper-resistant and a second system to run."],
    p: ["A reporting tool queries patient data directly and leaves no audit events.", "Log retention shorter than the period in which breaches are discovered."],
    v: "Open, print and export a test patient's data as a test user and confirm three distinct events appear in the audit store within a minute with user, patient, action and workstation, and that an administrator cannot alter them.",
    dep: ["record-database","application-tier","encryption-and-keys"]
  },
  "privacy-audit-analytics": {
    s: "Analysis over the access trail that finds suspicious patterns, such as looking up coworkers, neighbors, celebrities or family members, and routes them to privacy staff.",
    d: "Rules and models compare access events with data: same surname, same address, same employer, a patient with no care relationship, a VIP flag, unusual volume or hours. Hits are scored and presented to a privacy officer with context, who contacts the user or manager and records the outcome. Patients and employees can request audits. The challenge is false positives (family members legitimately in the same hospital), the work of reviewing and the culture and policy around discipline.",
    k: ["Rule-based detection versus anomaly models: rules are explainable and miss unknown patterns; models find more and are hard to justify to the accused.", "Proactive review of all hits versus complaint-driven: proactive deters and costs staff; complaint-driven is cheap and catches little."],
    p: ["A review team overwhelmed by alerts closes them without reading.", "Analytics lack employee-to-patient links, so coworker lookups are invisible."],
    v: "Have a test user open the chart of a test patient who shares their surname and address and confirm a ranked alert reaches the privacy queue with the access details, and closing it records the outcome.",
    dep: ["access-audit-trail","directory-and-sso","reporting-warehouse"]
  },
  "change-audit": {
    s: "Records every change to clinical content and system configuration: what was changed, by whom, the before and after values and the reason.",
    d: "Clinical changes (edits, corrections, deletions-as-status, merges) log the entry, the user and the content versions. Configuration changes to order sets, rules, templates and security settings log similarly. The log supports legal disputes, safety investigations and the question of who altered a result. It is integrated with versioning, and it needs to show a coherent story across many entries made in one action, such as a merge touching thousands of records.",
    k: ["Log at the field level versus at the entry level: field-level shows exactly what changed and is bulky; entry-level is compact and requires comparing versions.", "Include system-initiated changes versus user actions only: including them explains automatic edits and adds noise."],
    p: ["A bulk correction by an administrator is logged as one line with no list of records.", "Configuration changes made directly in the database bypass the log."],
    v: "Change a test order set and correct a test result, then confirm each shows before and after values, user, time and reason in the audit, and a direct database edit is detected by the integrity check.",
    dep: ["record-database","versioning-and-corrections","access-audit-trail"]
  },
  "downtime-viewer": {
    s: "A read-only copy of key chart data on separate machines, so clinicians can see allergies, medications, problems and recent results when the main system is unavailable.",
    d: "The viewer receives a continuous feed of patient summaries and keeps them on local servers or workstations that do not depend on the main system, the network or the database. It shows the minimum needed for safe care and is clearly marked as possibly out of date. It is protected like the main record. The difficulty is keeping it fresh, keeping it working, since a tool used only in outages decays, and giving it the same access control as the real thing without depending on the directory that may also be down.",
    k: ["Continuously updated copy versus periodic snapshot: continuous is current and depends on a feed; snapshots are simple and stale by hours.", "Show a minimal data set versus everything: minimal is quick and secure; everything helps and enlarges the exposure of a stolen device."],
    p: ["The viewer stopped updating weeks ago and nobody noticed until the outage.", "Authentication depends on the directory that is also down, so no one can open it."],
    v: "Disconnect the main system in a test environment, open the viewer for a test patient and confirm allergies, medications and last results appear with the data-as-of time, and a login works without the main directory.",
    dep: ["failover-and-replication","clinical-data-repository","clinician-authentication"]
  },
  "downtime-reports": {
    s: "Printed or locally stored schedules, medication lists and census reports, plus paper order and documentation forms, used while the system is down.",
    d: "Reports are generated on a schedule, often every few hours, and printed on the units or saved on local machines: who is in which bed, what is due, current orders and allergies. Paper forms mirror the order and charting screens and carry patient labels printed ahead of time. During downtime staff write on them. The problems are the age of the report at the moment of failure, volume (printing hundreds of pages), and the discipline to switch quickly, since paper habits have faded.",
    k: ["Frequent print schedule versus on-demand printing at outage: scheduled copies are ready and wasteful; on-demand is current and unavailable when the system is down.", "Paper forms that mirror the screens versus simple generic forms: mirroring eases reconciliation and requires maintenance as screens change."],
    p: ["The last printed report is six hours old and omits a new allergy.", "Forms are out of stock, or outdated, on units that haven't needed them for years."],
    v: "Check a unit in a drill: find the latest report, confirm its print time is within the schedule, locate current forms and label stock, and confirm a nurse can chart a dose on paper from them.",
    dep: ["downtime-viewer","medication-list","admit-discharge-transfer"]
  },
  "downtime-reconciliation": {
    s: "Entering what was done on paper during an outage into the record afterward, with the original times and authors preserved and conflicts resolved.",
    d: "After recovery, staff enter orders, administrations and notes from paper forms, marking them as late entries with the real event time and the person who did the work. Orders given verbally on paper are entered and verified, and duplicates caused by repeated orders are cancelled. Paper is scanned and kept. Barcode and system checks that were skipped are noted. The hard parts: volume entered under time pressure, and judging which medications were really given so a dose is neither repeated nor omitted.",
    k: ["Enter everything back as discrete data versus scan paper only: data entry restores trends and rules and costs hours; scanning is quick and invisible to checks.", "Enter during recovery by the original staff versus by a separate team: original staff know the details and are busy; a team is efficient and guesses."],
    p: ["A dose given on paper is given again after recovery because the entry was delayed.", "Late entries are stamped at entry time and appear to have occurred after the outage."],
    v: "After a test outage, enter a paper-documented dose with its real time and confirm the record shows event time and entry time separately, flags it as downtime entry and the next scheduled dose accounts for it.",
    dep: ["downtime-reports","administration-and-barcode-check","versioning-and-corrections","outside-documents"]
  },
  "failover-and-replication": {
    s: "Keeps a second copy of the database and application ready to take over in another room or site, with defined limits on lost data and recovery time.",
    d: "Data is replicated continuously to a standby at another site, either synchronously (no loss, slower writes) or asynchronously (small loss, faster). Failover can be automatic or by operator decision. Applications and interfaces must reconnect and replay queues. Capacity at the second site must carry the whole load. The difficulty is the split-brain case where both sites think they are primary, failover paths that are rarely exercised and fail at the first real use, and dependencies such as directories and certificates that are not replicated.",
    k: ["Synchronous versus asynchronous replication: synchronous loses nothing at the cost of latency and distance limits; asynchronous is fast and can lose recent entries.", "Automatic versus manual failover: automatic is quick and can make wrong decisions in partial failures; manual is deliberate and slow."],
    p: ["Failover works for the database while the interface engine still points at the old site.", "The standby site lacks capacity and falls over under real load."],
    v: "Fail the primary in a scheduled test, confirm the standby serves clinicians within the recovery target, the last committed entry is present and interfaces reconnect, then fail back with no data difference.",
    dep: ["record-database","application-tier","interface-engine","directory-and-sso"]
  },
  "backup-and-restore": {
    s: "Periodic copies of data kept offline and protected, with tested procedures to restore the record to a point in time after corruption, deletion or attack.",
    d: "Full and incremental backups of databases, documents, configuration and keys are written to separate media and sites, with some copies immutable so that an attacker or mistake cannot erase them. Restores are rehearsed to measure how long recovery really takes. Backups protect against what replication does not: replicas copy corruption and deletions faithfully. Hard parts are restore time at scale, consistency across databases and files, encrypted backups whose keys are lost and ransomware that waits and corrupts the backups first.",
    k: ["Immutable offline copies versus online backups: immutable resists attack and costs convenience; online is quick to restore and exposed.", "Frequent point-in-time recovery versus daily snapshots: point-in-time minimizes loss and takes storage and operations; daily is simple and loses a day."],
    p: ["Backups were never test-restored, and the first restore reveals missing data.", "Encryption keys stored only in the system that was lost."],
    v: "Restore last night's backup into an isolated environment, confirm record counts and a sample of entries match production at that time, and record the elapsed time against the recovery target.",
    dep: ["record-database","document-and-image-store","encryption-and-keys"]
  },
  "downtime-drills": {
    s: "Rehearsals and communication plans that make the switch to paper, the recovery and the return to normal work in practice, not only on a plan.",
    d: "A drill takes a unit or whole site off the system for a set time while staff follow the procedure: how to learn about an outage, who declares it, where forms and reports are, how to give medications and how to return. Communications use channels that do not depend on the failed system, such as overhead page or radios. Results are reviewed and the plan changed. The central problem is that real outages are rare, so skills and supplies decay between them, and many staff have never worked on paper.",
    k: ["Announced drills versus surprise drills: announced are safe and prepared; surprise shows real readiness and risks disruption.", "Whole-site exercises versus unit-level: whole-site tests dependencies and is costly; unit-level is frequent and misses coordination."],
    p: ["The only copy of the downtime plan is stored on the system that is down.", "Staff do not know who can declare downtime, and entry on paper starts an hour late."],
    v: "Run a one-hour drill on a test unit and confirm staff learn of it by the planned channel, find forms and reports within minutes, complete reconciliation afterward and a written review lists changes with owners.",
    dep: ["downtime-reports","downtime-reconciliation","downtime-viewer"]
  },
  "application-tier": {
    s: "The servers that run the record's logic and serve sessions to clinicians, handling load balancing, caching and the many interactive and background workloads.",
    d: "Clients connect through a gateway to application servers that run business logic, call the database and talk to interfaces. Interactive sessions need response times of a second or less; batch jobs (billing runs, reports, rules over populations) run in the background and must not slow them. Sessions may be remote desktops, web apps or mobile clients. The challenge is that the workload is bursty around shift changes and that one expensive request, such as a big report, can slow everybody.",
    k: ["Remote desktop sessions versus web or native clients: remote sessions are controlled and heavy on servers; clients scale and need device management.", "Separate interactive and batch servers versus shared: separation protects response time and wastes capacity."],
    p: ["A report scheduled at shift change starves interactive users at the busiest minute.", "Cached data on one server shows an outdated value after another server changed it."],
    v: "Run the peak-hour test load of simulated clinicians while a heavy report executes and confirm chart open times stay within the target and the report completes without blocking sign-ins.",
    dep: ["record-database","directory-and-sso","encryption-and-keys"]
  },
  "record-database": {
    s: "The transactional database holding the live record, designed for many small reads and writes, strict consistency and decades of history.",
    d: "Writes must be durable before the clinician sees confirmation, and reads must reflect them at once. The schema supports encounters, observations, orders and documents, with indexes tuned to chart review patterns. The database is large, often tens of terabytes, and carries long-running reports, which are therefore directed to replicas. Upgrades and schema changes must happen while people depend on it every hour. Hard problems are contention on popular rows (a unit census), growth that outpaces hardware and noisy neighbors among workloads.",
    k: ["Single large database versus sharding by facility: single is consistent and simple to query; sharding scales and complicates cross-facility views.", "Online schema change versus maintenance windows: online keeps care going and is complex; windows are simple and need downtime."],
    p: ["A long query on the primary blocks writes and the chart hangs.", "Storage fills during a holiday and writes stop."],
    v: "Commit an entry, kill the database process immediately, restart it and confirm the entry is present, then measure p95 time for a chart read under the peak test load.",
    dep: ["encryption-and-keys"]
  },
  "document-and-image-store": {
    s: "Storage for large files linked to the record: scanned documents, images, audio, waveforms and attachments, served on demand and kept for the retention period.",
    d: "Files are stored in a separate system from the database, referenced by identifier, with metadata for patient, type and time. Access control and audit apply to files as to data. Tiered storage moves older items to cheaper media. Files must be retrievable years later in a readable format, so open formats and migration plans matter. The problems are the size of the store, ensuring that a link never points to a missing file and that a file cannot be reached by guessing its address.",
    k: ["Store files in the database versus in object storage with references: in the database is transactional and heavy; object storage scales and the two can disagree.", "Convert to a standard format at ingest versus keep the original: conversion ensures future readability and loses fidelity."],
    p: ["A file whose database reference was deleted becomes an unreachable orphan that still holds patient data.", "Direct links to files bypass the record's access checks."],
    v: "Upload a test scanned document, retrieve it through the chart, then request its direct storage address without credentials and confirm it is refused, and delete the reference and confirm the file is flagged.",
    dep: ["encryption-and-keys","access-audit-trail"]
  },
  "reporting-warehouse": {
    s: "A separate copy of record data reshaped for analysis, so operational reports, measures and research queries never slow the live system.",
    d: "Data is extracted from the record, usually nightly or in near real time, cleaned, mapped to standard concepts and loaded into a store designed for large scans and aggregations. Dashboards, quality measures, financial reports and research cohorts read from it. Access rules apply here too, and de-identified views serve research. The difficulties are definitions (every department defines a readmission differently), latency between the live record and the report, and re-applying corrections and merges to history so numbers do not silently change.",
    k: ["Near real-time feed versus nightly batch: near real-time supports operations and costs more to run; nightly is simple and a day stale.", "Warehouse model by clinical concept versus by report: concept models are reusable and slower to build; report models are quick and fragment."],
    p: ["Two reports of the same measure differ because they use different definitions.", "A merge in the live record is not reflected, so one patient counts as two."],
    v: "Reconcile one day's counts of admissions and results between the warehouse and the record, confirm they agree to the exact number, and show that a correction made today appears in the next load.",
    dep: ["clinical-data-repository","terminology-mapping","encryption-and-keys"]
  },
  "directory-and-sso": {
    s: "The central identity store of staff accounts, groups and credentials, with single sign-on so one login opens the record and related tools.",
    d: "Accounts are created from human resources events, assigned to groups and disabled on departure. Applications trust sign-in assertions from the directory instead of keeping passwords. Provisioning also handles contractors, students and visiting clinicians, with expiry. Service accounts for interfaces are tracked separately. The hard parts: timely deprovisioning (a day's delay lets a former employee in), accounts shared by departments, and making the system survive when the directory is down, because every sign-in depends on it.",
    k: ["Provision from HR events versus manual requests: HR-driven is timely and trusts HR data quality; manual is flexible and slow.", "Single sign-on to everything versus separate sign-in for the record: single sign-on is convenient and extends one compromise; separate is stronger and annoying."],
    p: ["A departed clinician's account stays active for months because a contractor's was never in HR.", "An outage of the directory blocks all sign-ins."],
    v: "Terminate a test employee in the HR system and confirm the directory disables the account, active sessions end and sign-in to the record fails within the stated time.",
    dep: ["encryption-and-keys"]
  },
  "encryption-and-keys": {
    s: "Protects stored and transmitted data with encryption, and manages the keys that unlock it through creation, rotation, access control and recovery.",
    d: "Connections between clients, servers, interfaces and external parties use encrypted transport with certificates. Databases, files, backups and laptops are encrypted at rest. Keys live in a dedicated service or hardware module, with separation between those who administer systems and those who hold keys. Certificates expire and rotate on a schedule. The common failure is operational: an expired certificate stops an interface and a lost key makes backups worthless, and encryption at rest does little against a legitimate but over-privileged account.",
    k: ["Disk-level encryption versus field-level encryption: disk-level is transparent and protects only against stolen media; field-level protects against insiders and costs searching and performance.", "Automatic key rotation versus manual: automatic reduces exposure and can break dependent systems; manual is controlled and forgotten."],
    p: ["An expired certificate on an interface stops results overnight.", "Keys for archived backups are lost when staff leave."],
    v: "Rotate a test encryption key, confirm old data is still readable and new data uses the new key, then check that all certificates expiring within sixty days appear on the renewal list.",
    dep: []
  },
  "workstation-management": {
    s: "Keeps the clinical computers, tablets, scanners, printers and badge readers configured, patched and working, since the software is only as usable as the device in front of the patient.",
    d: "Devices are enrolled in a management system that installs updates, applies security settings and monitors health. Shared workstations on wheels, wall-mounted units and personal phones each have different rules. Peripherals (wristband printers, barcode scanners, signature pads) must be present and working at the point of care, or safety checks are skipped. The difficulties are patching without disrupting care, equipment that does not work with updates and a shortage of devices at the bedside.",
    k: ["Locked-down managed devices versus bring-your-own phones: managed is secure and costly; personal is convenient and needs containers and policy.", "Patch on a fixed schedule versus on risk: fixed is predictable and delays urgent fixes; risk-based is quick and disruptive."],
    p: ["A scanner driver update stops barcode checks on one ward without notice.", "Printers jammed or out of label stock lead to unlabeled specimens."],
    v: "Walk a test unit, confirm each workstation, scanner and printer reports healthy to the management system, and deploy a test patch to one device group and confirm the barcode check still works.",
    dep: ["directory-and-sso","encryption-and-keys"]
  },
  "patient-safety": {
    s: "Every design choice is judged by whether it can harm a patient: wrong-patient entries, missed results, confusing screens and alert fatigue are failures of the system, not of users.",
    d: "Safety is treated as a property of the whole socio-technical system. Hazards are logged, analyzed for cause and traced to design: look-alike names, defaults that get signed, unclear banners. Clinical safety reviews gate changes, and incident reports feed back into configuration. The record can both prevent harm (checks, reconciliation) and cause it (copy-forward, misleading displays). The hard part is that harms appear rarely and indirectly, and the usual metrics, such as alert counts, do not measure them.",
    k: ["Hard stops versus advisory warnings: hard stops prevent a known error and block legitimate exceptions; advisories respect judgment and are overridden.", "Safety review before every change versus after incidents: before is slow and prevents; after is quick and learns from harm."],
    p: ["A configuration change made for convenience removes a safety check no one remembered.", "Incidents are reported and never traced back to the screen that contributed."],
    v: "Pick five recent incident reports and trace each to a design factor, a configuration change or a decision with an owner, then confirm each led to a recorded change or a documented decision not to change.",
    dep: ["alert-governance","administration-and-barcode-check","duplicate-detection-and-merge","critical-results"]
  },
  "identity-and-matching": {
    s: "Every record, message and result depends on knowing which person it belongs to, and no source offers an identifier reliable enough to settle it.",
    d: "Identity is established at registration, carried on wristbands and labels, matched across systems and repaired when wrong. Errors enter through names, birth dates, shared addresses, newborns, unconscious patients and typing mistakes, then spread through every interface. Methods include probabilistic matching, a second identifier at each step, barcode scanning and stewards who clean up. Wrong identity is the most damaging data error: it causes wrong-patient treatment and wrong disclosure.",
    k: ["Strict identification at each step versus trust the first match: strict catches errors and slows work; trust is fast and propagates mistakes.", "Universal person identifier versus local matching: universal is accurate and a political and privacy question; local is flexible and error-prone."],
    p: ["A single wrong-patient registration spreads through every downstream system within minutes.", "Merged identities that are later separated leave results attached to the wrong person."],
    v: "Measure the duplicate rate and the rate of wrong-patient events from a sample of charts, and confirm each interface carries at least two identifiers and the scan check blocks a mismatched wristband.",
    dep: ["master-patient-index","duplicate-detection-and-merge","registration-and-check-in","specimen-tracking"]
  },
  "privacy-and-minimum-necessary": {
    s: "Each person should see only what the job needs, patients decide some of who else sees their data, and every access is traceable, which pulls against the need for fast, complete information in care.",
    d: "Privacy is applied at four points: who may open a chart, which parts they see, where data may go and how access is reviewed. Rules come from law, organization policy and patient choice, and vary by region and category. Controls (roles, relationships, consent, restricted segments, audit) must work together at every entry point, including exports and APIs. The hard part is that care is time-sensitive and unpredictable, so blocking access has a safety cost that a database breach does not have.",
    k: ["Prevent access up front versus permit and audit: prevention protects and delays care; audit is smooth and acts after the harm.", "Enforce policy once centrally versus in each module: central is consistent; modules are fast and diverge."],
    p: ["A new reporting tool is added without applying the access rules that protect the chart.", "Staff learn that the audit is never reviewed and browse freely."],
    v: "Attempt access to one test patient through every entry point (chart, portal, API, export, report) as a user who should not see it, and confirm each denies and logs the attempt.",
    dep: ["consent-enforcement","role-based-access","access-audit-trail","sensitive-segments"]
  },
  "provenance-and-legal-record": {
    s: "The record is also evidence: it must show what was known, who entered it and when, what changed afterward, and it must stay the same document for decades.",
    d: "Every entry carries its author, event time, entry time, source and signature, and later changes are linked versions, never overwrites. The legal record is defined by policy: which views and documents count, and what is produced in a dispute. The system must reproduce what a clinician saw at a past moment. Challenges include copied text without attribution, entries from devices and interfaces without a human author, migrations that lose metadata and printed copies that differ from the screen.",
    k: ["Immutable versioned history versus current-state storage with logs: versioned supports as-of reconstruction and more storage; logs are compact and harder to reconstruct from.", "Define the legal record narrowly versus include all data: narrow is simple to produce; broad is complete and costly in disputes."],
    p: ["A migration drops author and time metadata and the record can no longer show who wrote what.", "A printed record omits an addendum that appears on screen."],
    v: "Pick a test entry corrected twice, produce the legal-record output as of a date between the corrections and confirm it shows the version, author and time that were current on that date.",
    dep: ["versioning-and-corrections","signing-and-addenda","change-audit","clinical-timeline"]
  },
  "standards-and-terminology": {
    s: "Data is useful beyond one system only if both sides share formats and meanings, but standards are loose, extended locally and revised constantly.",
    d: "Message formats, document formats, resource APIs, code systems for diagnoses, procedures, labs and drugs, and value sets together form the vocabulary. Each system implements its own subset with local extensions, so conformance does not equal interoperability. Terminology is a service with releases, mappings and retirement rules. The cost of weak standards falls on integration teams, who spend years on mapping, and on clinicians who see unmatched or duplicated data.",
    k: ["Adopt a standard strictly versus extend for local needs: strict improves exchange and fits local work poorly; extending serves local work and fragments exchange.", "Map to a standard at the edge versus store native codes: edge mapping keeps the core clean and loses nuance; native keeps nuance and spreads codes."],
    p: ["Two systems both claim conformance and still cannot exchange medication lists.", "A code system update changes meaning and old data silently shifts."],
    v: "Send a test patient summary to an independent implementation and confirm the receiver displays and codes the diagnoses, medications and allergies correctly with no manual mapping.",
    dep: ["terminology-service","interface-engine","terminology-mapping","resource-api"]
  },
  "availability-and-downtime": {
    s: "The system is used around the clock for decisions that cannot wait, so planned maintenance, failures and attacks all need a tested plan for care to continue.",
    d: "Availability is designed in layers: redundant hardware and sites, failover, backups, read-only viewers, paper procedures and recovery order. Targets for recovery time and data loss are set by clinical risk, not by cost. Planned upgrades are scheduled to avoid peaks and sometimes need downtime. Interdependencies (directory, network, certificates, interfaces) fail together in ways diagrams hide. Ransomware makes the plan a real exercise.",
    k: ["High availability everywhere versus tiered by criticality: everywhere is simple to describe and costly; tiering is efficient and needs clear priorities.", "Fail over automatically versus stop and decide: automatic is quick and can fail wrongly; decide is deliberate and slow."],
    p: ["Planned maintenance during a busy period goes wrong and extends into a clinical shift.", "Recovery proceeds in the wrong order, and the application starts before its database is consistent."],
    v: "Run a scheduled exercise that takes down the primary site, then confirm clinicians reach the viewer, the standby takes over within the target, paper procedures are used and the reconciliation closes with no lost entries.",
    dep: ["failover-and-replication","backup-and-restore","downtime-viewer","downtime-drills"]
  },
});
