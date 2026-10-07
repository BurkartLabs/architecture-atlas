// Details for the electronic health records plate, part 2: orders and results, medications, decision support, scheduling.
ATLAS.details("health-records", {
  "order-entry": {
    s: "The screen and logic where a clinician selects, parameterizes and signs an instruction for a test, drug, procedure, diet or consult.",
    d: "Orders are chosen from a catalog that defines required questions, defaults, allowed routes and who may place them. The clinician signs, and the order becomes active and routes to the department that carries it out. Some orders are given verbally in emergencies and are entered by a nurse and countersigned later. Checks run at entry: duplicates, allergies, dose, patient status. It is hard because the catalog is large and constantly edited, and because speed pressures make clinicians pick the first match in a search list.",
    k: ["Free-form search versus curated favorites: search finds anything and invites the wrong item; favorites are quick and hide new options.", "Required questions versus minimal entry: questions give the performing department what it needs and add clicks that train people to click through."],
    p: ["Look-alike names in a picklist lead to an order for the wrong test or drug.", "An order entered on the wrong patient because two charts were open and the banner went unnoticed."],
    v: "Place a test order that requires a clinical question, confirm it cannot be signed without an answer, sign it and confirm the performing department's worklist shows it with the answer within the stated time.",
    dep: ["order-sets","order-routing","interaction-checking","clinician-authentication","encounter-model"]
  },
  "order-sets": {
    s: "Predefined bundles of orders for a condition or situation, such as admission for pneumonia or a post-operative day, which a clinician reviews and signs in one action.",
    d: "An order set is maintained by a committee and lists orders with defaults, optional items and conditional logic by weight, age or kidney function. Choosing the set pre-selects the standard care so the clinician removes or adds items. It is how evidence-based practice reaches the bedside, and how local variation shrinks. The cost is governance: sets age, specialties edit their own, and a default that looks reasonable gets signed without thought across thousands of patients.",
    k: ["Pre-checked defaults versus opt-in items: pre-checked drives adherence and spreads any mistake in the default.", "Central committee ownership versus departmental ownership: central keeps sets consistent and slow; departmental keeps them current and divergent."],
    p: ["A change to a shared set silently alters orders for every user who relies on it.", "An outdated set continues to recommend a drug dose that guidelines have since revised."],
    v: "Open a test order set for an adult with reduced kidney function and confirm renally adjusted doses are the defaults, then change the committee version and confirm users see a new version number and change log.",
    dep: ["order-entry","clinical-pathways","drug-knowledge-base","alert-governance"]
  },
  "order-routing": {
    s: "Moves a signed order to the performing department, tracks it through states such as received, in progress, resulted and cancelled, and shows the state to everyone who needs it.",
    d: "Each order type has a destination: the laboratory, imaging, pharmacy, nursing task list or an external provider. A state machine records acknowledgments from the receiver. Changes and cancellations must reach the performer even after the work started, which means negotiated outcomes (too late to cancel). The tracking view shows ordered but not yet collected, collected, in process and final. Problems are orders that vanish into an unmonitored queue, mismatched states between systems and verbal or paper orders that lack a record.",
    k: ["Receiver-confirmed state versus assumed delivery: confirmation reveals lost orders, and demands that every receiving system acknowledge reliably.", "Cancel as a request versus an immediate action: a request is honest about work already under way and leaves the sender unsure."],
    p: ["An order sent to a laboratory interface that was down is shown as active but never performed.", "A cancelled order is still performed because the cancel reached the lab after collection."],
    v: "Place an order, disconnect the receiving interface and confirm the order shows as undelivered within a defined time, then reconnect and confirm one delivery with a complete state history.",
    dep: ["order-entry","interface-engine","event-and-order-messages","observation-model"]
  },
  "laboratory-link": {
    s: "Sends test orders to the laboratory system and receives results, with units, reference ranges, flags and corrections, into the record as discrete values.",
    d: "The order carries test codes, the specimen type and the clinical question. Results return as preliminary, final or corrected, each with the performing lab, time and reference range for that patient. Microbiology results build up over days, from a culture to an identification to antibiotic sensitivity. Panels expand into components. Hard parts are mapping the lab's test codes to standard ones, units that differ between labs, results for a patient who has moved between locations, and corrected results that must reach the clinician who already acted on the first.",
    k: ["Store results as discrete values versus as text reports: discrete enables trends and rules and demands exact mapping; text is faithful and opaque.", "Show preliminary results versus wait for final: preliminary speeds decisions and risks acting on values that change."],
    p: ["Two labs report the same test in different units and the trend line shows a tenfold jump.", "A corrected result replaces the old value without notifying the clinician who treated on the earlier one."],
    v: "Send a corrected result for a test patient's potassium and confirm the chart shows the new value with a correction marker, the old value remains visible in history and the ordering clinician receives a notification.",
    dep: ["order-routing","interface-engine","terminology-mapping","observation-model","result-inbox"]
  },
  "imaging-link": {
    s: "Orders for radiology and similar studies and the return of reports and images or links to them, tied to the right patient and study.",
    d: "An order flows to a radiology scheduling and reporting system, which tracks the study through exam, interpretation and report. The record stores the report text, impression and often a link into an image viewer that retrieves pictures from a separate archive. Reports can have addenda and critical findings flagged. Hard parts: keeping patient identifiers aligned between the record, the scheduling system and the archive; incidental findings that need follow-up outside the original question; and ordering the right protocol for the question and the patient's kidney function or implants.",
    k: ["Link to the image archive versus copy images into the record: linking avoids duplication and depends on archive availability; copying is self-contained and heavy.", "Report as free text versus structured report: structure enables follow-up tracking and strains radiologist workflow."],
    p: ["An incidental nodule noted in the report body is never followed up, because no rule watches report text.", "Patient identifiers mismatched between systems orphan a study from the chart."],
    v: "Order a test study, complete it in the radiology system and confirm the final report and image link appear on the patient's chart, and that opening the link shows the same patient name and identifier.",
    dep: ["order-routing","document-and-image-store","interface-engine","critical-results","master-patient-index"]
  },
  "specimen-tracking": {
    s: "Labels and tracks each sample from collection at the bedside through transport and receipt in the laboratory, tying every tube to the patient and order.",
    d: "At collection, the collector scans the patient's wristband and prints labels for the ordered tubes, recording who collected what and when. Transport and receipt scans extend the chain. The system alerts on a sample not received or rejected for hemolysis or an insufficient volume, and asks for recollection. Wrong-blood-in-tube is the major risk: a correct label on the wrong patient's blood yields a perfectly formatted wrong result, which no later check can see except an unusual change from the previous values.",
    k: ["Bedside label printing with scans versus pre-printed labels: scanning ties identity to the moment of collection and needs working printers and scanners at every bed.", "Reject on any mismatch versus allow override: rejection protects patients and delays urgent samples."],
    p: ["Labels printed in advance for several patients are applied to the wrong tubes.", "A sample lost in transport is noticed only when someone asks about the result."],
    v: "Collect a test sample using a mismatched wristband and confirm collection is blocked, then collect correctly and confirm each scan event appears in the sample's history and the lab receives it as the same order.",
    dep: ["laboratory-link","order-routing","registration-and-check-in","workstation-management"]
  },
  "result-inbox": {
    s: "The clinician's queue of new results, messages and tasks that need review, with acknowledgment so a result is demonstrably seen by someone responsible.",
    d: "Results route to the ordering clinician, and to a covering person when the orderer is away or has left. Each item can be acknowledged, forwarded, acted on or sent as a message to the patient. Systems track unacknowledged items and escalate. The inbox is one of the largest contributors to clinician after-hours work, and its design decides whether abnormal results are caught. The hard problems are routing for results ordered by someone who has since moved, results arriving after discharge and the volume of normal results.",
    k: ["Route everything to the inbox versus only abnormal results: everything is safe and overwhelming; filtering reduces load and risks hiding an important normal.", "Orderer-owned results versus team-owned: orderer ownership is clear and breaks during absences; team ownership covers absence and diffuses responsibility."],
    p: ["Results for a clinician who left remain in a dormant inbox for months.", "Auto-filing normal results hides a trend that was individually normal each time."],
    v: "Mark the ordering clinician absent, finalize a test result and confirm it routes to the designated cover, and that an unacknowledged abnormal result escalates after the configured interval.",
    dep: ["laboratory-link","imaging-link","care-team","critical-results","secure-messaging"]
  },
  "critical-results": {
    s: "Detects results that need action within minutes and delivers them to a reachable responsible clinician, with proof of receipt and read-back.",
    d: "The laboratory or radiology flags a value beyond critical limits and the system attempts contact through a defined chain: the ordering clinician, then cover, then a supervisor. Delivery methods include a call, a page and a secure message. Each step records who was reached, when and what they acknowledged. Hard parts: finding the person actually responsible at 3 a.m., not alerting for every borderline value, and handling patients who have been discharged and need to be reached directly.",
    k: ["Phone call with read-back versus electronic acknowledgment: calls are certain and interrupt, electronic is auditable and may sit unseen.", "Fixed limits versus patient-specific limits: fixed limits are simple, but known chronic values cause constant false alarms."],
    p: ["The notification goes to a clinician who is off shift because the assignment was never updated.", "The chain ends after three failed pages with no escalation owner."],
    v: "Issue a critical test value for a patient and let the first contact time out, then confirm escalation to the next person in the chain, a recorded acknowledgment with time and a closed alert.",
    dep: ["laboratory-link","care-team","secure-messaging","access-audit-trail"]
  },
  "referrals-and-authorizations": {
    s: "Requests a visit or service from another provider, and obtains the insurer's approval where required, with status tracked until the visit happens and the report returns.",
    d: "A referral order names the specialty or provider, reason, urgency and attached records. An authorization request goes to the insurer through electronic transactions or portals and returns approved, denied or pending, often with a limited number of visits and an expiry date. The referral is tracked through scheduling, the visit and the consult report. Hard parts: closing the loop, because many referrals are never completed and nobody knows; payer rules that differ by plan; and sending the right attachments without sending everything.",
    k: ["Electronic authorization versus staff calling payers: electronic is traceable and not every payer supports every service; calls cover the gaps at high labor cost.", "Referral to a named provider versus to a pool: named is personal and breaks on absence; pooled spreads load and loses continuity."],
    p: ["An approved authorization expires before the appointment and the claim is denied.", "A referral with no completion tracking disappears for months and delays a cancer diagnosis."],
    v: "Create a test referral needing authorization, confirm the status progresses from requested to approved, a visit is booked within validity, and an unscheduled referral appears on the follow-up list after the target interval.",
    dep: ["order-entry","eligibility-verification","appointment-scheduling","document-exchange","coverage-model"]
  },
  "medication-list": {
    s: "The current record of what a patient takes, from all sources, and the reconciliation done at admission, transfer and discharge to keep it accurate.",
    d: "The list combines orders from this organization, prescriptions from outside, over-the-counter items and what the patient reports. Reconciliation compares the lists at every transition: what was taken at home, what is ordered in hospital and what should continue after discharge. Each drug is continued, changed or stopped, with a reason. The list is the foundation for interaction checks. It is hard because the truth lives with the patient, sources disagree, and the task is repeated at each transition by people with little time.",
    k: ["Single reconciled list versus separate home and inpatient lists: a single list is simple and loses the distinction between what was taken and what is ordered.", "Dispense history from pharmacies as a source versus patient interview only: dispense history exposes non-adherence, and shows fills that were never taken."],
    p: ["A drug stopped in hospital is silently resumed from the home list at discharge.", "An outdated list makes interaction checks run against medicines the patient no longer takes."],
    v: "Admit a test patient with a home list, reconcile with one drug stopped and one changed, and confirm the discharge list shows each decision with a reason and the stopped drug is not on the discharge prescriptions.",
    dep: ["e-prescribing","allergy-list","drug-knowledge-base","clinical-data-repository","encounter-model"]
  },
  "allergy-list": {
    s: "A coded list of a patient's allergies and intolerances with reaction and severity, which checks against every medication and some food and device orders.",
    d: "Entries record the substance, the reaction, severity and certainty, and whether it is an allergy or an intolerance. Substances are coded to drug classes so that a penicillin allergy can match related drugs. Entry requires care: free text cannot be checked, and an unverified label causes patients to be denied the best drug for years. Also needed are a way to record no known allergies, a review prompt at visits, and a way to delabel entries after testing.",
    k: ["Class-level matching versus exact drug matching: class-level matching catches cross-reactions and floods users with alerts for entries that were never real.", "Free-text allergy entry allowed versus coded only: free text is accurate for rare items and cannot be checked."],
    p: ["An allergy typed as free text bypasses every check at ordering time.", "A childhood rash recorded as penicillin allergy leads to years of inferior antibiotics."],
    v: "Record a coded penicillin allergy for a test patient, order a related drug and confirm a check fires with reaction and severity shown, then delabel it and confirm the history keeps the earlier entry.",
    dep: ["drug-knowledge-base","terminology-mapping","interaction-checking","longitudinal-chart"]
  },
  "e-prescribing": {
    s: "Creates and transmits prescriptions electronically to pharmacies, receives renewal requests and fill notices, and checks the choice against safety and coverage rules.",
    d: "The prescriber selects a drug, strength, route, quantity and directions and chooses a pharmacy. Checks run at entry, then the prescription is signed, sent through a network to the pharmacy's system and acknowledged. The pharmacy may reply with change requests, refill requests or a fill status. The network ties identity requirements to the prescriber's credentials, with stronger authentication for controlled drugs. Difficulties include ambiguous free-text directions, wrong-pharmacy selection and cancelations that arrive after dispensing.",
    k: ["Structured directions versus free-text sig: structured is checkable and constrains unusual regimens; free text is flexible and can be ambiguous.", "Default to patient's last pharmacy versus ask each time: default is faster and risks sending to a pharmacy the patient left."],
    p: ["A prescription sent to a closed pharmacy leaves the patient without a medication that evening.", "Ambiguous directions such as taking two tablets daily are interpreted differently by the pharmacist."],
    v: "Send a prescription for a test patient to a test pharmacy and confirm the pharmacy system receives matching drug, strength and directions, acknowledges it and the chart shows status through to filled.",
    dep: ["drug-knowledge-base","formulary-and-benefit-check","interaction-checking","controlled-substances","interface-engine"]
  },
  "drug-knowledge-base": {
    s: "The licensed reference data on drugs: names, strengths, interactions, dose ranges, contraindications and codes, which every medication check and order depends on.",
    d: "A drug content supplier delivers updates on a regular schedule, and the organization loads them into its own catalog, mapping its local products to the reference. The data feeds interaction, allergy, dose and duplicate checks. The organization decides which severities to show, and tailors the content. Hard parts: updates change check behavior overnight, local formulary and product mappings must be reapplied, and a mapping gap means a drug that exists but is checked against nothing.",
    k: ["Use supplier severities as shipped versus local tailoring: shipped is defensible and noisy; tailoring reduces alerts and takes local ownership of the risk.", "Apply updates automatically versus after local testing: automatic keeps content current and surprises; testing delays safety content."],
    p: ["A product with no mapped reference is silently skipped by all checks.", "A content update changes interaction severity and triples the alert volume the next morning."],
    v: "Order a test drug pair that interacts and confirm the check fires with the reference severity, then order an unmapped product and confirm a mapping-gap report lists it.",
    dep: ["terminology-service","record-database"]
  },
  "pharmacy-verification": {
    s: "A pharmacist's review of each medication order for appropriateness, dose and interactions before the drug is dispensed or made available for administration.",
    d: "New inpatient orders appear in a pharmacist's queue, ranked by urgency. The pharmacist sees the order, the patient's weight, kidney and liver function, allergies and other drugs, then verifies, changes with the prescriber or rejects. Verified orders flow to dispensing cabinets, compounding and the nurse's administration list. In emergencies orders are released before review and verified after. The hard parts are queue volume, missing data such as no weight on a dosing-by-weight order and the delays that verification adds when a patient needs a drug now.",
    k: ["Verification before administration versus after override: before catches errors and delays doses; after serves emergencies and accepts risk.", "Pharmacist reviews everything versus rules clear low-risk orders: review everything is thorough and slow; rules save time and rely on rule quality."],
    p: ["A dosing order without a recorded weight is verified using a default that is wrong for a small child.", "An unreviewed queue grows during a shift change and urgent orders wait."],
    v: "Enter a weight-based order for a test patient with no weight and confirm the pharmacist's screen flags the missing weight and blocks verification until it is supplied.",
    dep: ["order-entry","interaction-checking","medication-list","administration-and-barcode-check","observation-model"]
  },
  "administration-and-barcode-check": {
    s: "Records each dose given, checking the patient's wristband, the drug package and the order by scanning, so the right drug reaches the right person at the right time.",
    d: "A nurse sees due medications on a worklist, scans the wristband, then each package, and the system compares patient, drug, dose, route and time to the active order. A match allows documentation, a mismatch warns. The record then shows given, held or refused, with reasons. High-risk drugs may need an independent second check. Hard parts are workarounds that defeat the check, such as scanning labels copied or stuck onto surfaces, drugs without usable barcodes and doses prepared in the pharmacy or at the bedside.",
    k: ["Hard stop on mismatch versus warning with override: a hard stop prevents errors and can delay care when the data is wrong; warnings invite habituation.", "Scan every dose versus selected high-risk drugs: every dose is consistent and slow; selected scanning saves time and misses the rest."],
    p: ["Nurses scan a wristband photocopied on a clipboard rather than on the patient.", "A late dose is documented as given at the scheduled time, hiding a real delay."],
    v: "Scan a test patient's wristband and a package of the wrong drug and confirm a mismatch stops documentation, then scan the right one and confirm the dose, time and nurse appear in the record.",
    dep: ["pharmacy-verification","order-routing","medication-list","workstation-management"]
  },
  "controlled-substances": {
    s: "Extra rules for drugs with abuse potential: stronger prescriber authentication, quantity limits, program checks, witnessed waste and reconciliation of counts.",
    d: "Prescribing requires two-factor authentication under rules set by regulators and a check of a state or national monitoring program for the patient's prescribing history. In hospitals, dispensing cabinets log each removal, and any unused remainder is wasted with a witness. Counts are reconciled by shift, and discrepancies trigger investigation. Hard problems are diversion by staff, which shows up as statistical anomalies across many records, and patients with legitimate pain who suffer under blunt limits.",
    k: ["Mandatory program check on each prescription versus on a risk basis: mandatory is consistent and adds time to every visit; risk-based fits the work and misses cases.", "Hard quantity limits versus warnings: limits reduce supply and can strand patients with unusual needs."],
    p: ["Cabinet records and charted administrations are not compared, so diverted drugs go unseen.", "Authentication tokens shared among prescribers undermine the identity requirement."],
    v: "Prescribe a controlled test drug without the second factor and confirm refusal, then prescribe with it and confirm the program check result, the authentication event and the quantity limit all appear in the audit trail.",
    dep: ["e-prescribing","clinician-authentication","privacy-audit-analytics","administration-and-barcode-check"]
  },
  "formulary-and-benefit-check": {
    s: "Shows at ordering time which drugs a patient's plan covers, at what price tier and with what restrictions, and suggests covered alternatives.",
    d: "A real-time query to the pharmacy benefit manager, using the patient's coverage identifiers, returns coverage status, copayment, prior authorization needs and preferred alternatives. In hospitals, an internal formulary lists the drugs stocked and approved, with substitution rules. The aim is to avoid prescriptions that are rejected at the counter. The difficulties are stale or missing coverage data, quote accuracy, and prior authorizations that add days to the start of treatment.",
    k: ["Show coverage at ordering versus after signing: at ordering lets prescribers choose, and adds latency and noise to every prescription.", "Auto-substitute therapeutic alternatives versus suggest only: automatic saves money and removes prescriber control."],
    p: ["A benefit quote based on old coverage data sends the patient to a pharmacy counter with a surprise price.", "Auto-substitution to a formulary drug the patient previously failed on."],
    v: "Check a test drug against a test plan that requires prior authorization and confirm the order screen shows the restriction and a covered alternative before signing.",
    dep: ["coverage-model","eligibility-verification","drug-knowledge-base","e-prescribing"]
  },
  "alert-rules": {
    s: "Logic that watches entries and data for conditions such as duplicate tests, abnormal values or missing follow-up, and presents a warning or suggestion at the point of action.",
    d: "A rule has a trigger (order signed, result filed, chart opened), a condition on patient data and an action (interrupt, show a banner, add a suggestion, create a task). Rules are written by informaticists using local tools or imported from guideline sources. They run synchronously in the clinician's workflow, so they must be fast. The key problem is signal: every interruptive alert has a cost, and rules that fire often and are overridden teach people to ignore all of them.",
    k: ["Interruptive pop-up versus passive banner: pop-ups get attention and cause fatigue; banners are tolerable and often unseen.", "Rules in the record's engine versus an external service: internal is fast and tied to the schema; external is portable and adds latency and failure modes."],
    p: ["A rule built on a field that clinics use differently fires for the wrong patients.", "A slow rule adds seconds to every order signature."],
    v: "Trigger a test rule with a qualifying patient and with a non-qualifying one, confirm only the first sees the alert, and confirm the rule's logged response time is under its budget.",
    dep: ["observation-model","problem-list","medication-list","alert-governance","clinical-data-repository"]
  },
  "interaction-checking": {
    s: "Checks each new order against allergies, other drugs, kidney and liver function, age and pregnancy, and warns of dangerous combinations or doses.",
    d: "The check runs when an order is entered and again at verification, comparing the order with the patient's active medications, allergies and recent results using the drug knowledge base. Alerts carry a severity and the reason. Dose checks use weight, age and organ function, and can suggest an adjusted dose. The difficulty is precision. Interaction data is conservative, many pairs are harmless in practice and override rates exceed ninety percent, which means the few alerts that matter are lost among the rest.",
    k: ["Show all severities versus only the severe: all is comprehensive and ignored; severe-only is usable and misses moderate harms.", "Check against orders only versus against orders and recent patient-reported drugs: broader coverage requires the list to be trusted."],
    p: ["The check uses a weight entered months ago for a child who has grown.", "The patient's list contains the interacting drug under a local name the check cannot map."],
    v: "Order a drug that interacts with a test patient's active medication, confirm the alert names both drugs and severity, then overrides with a reason and confirm the reason is stored and reviewable.",
    dep: ["drug-knowledge-base","medication-list","allergy-list","observation-model"]
  },
  "clinical-pathways": {
    s: "Encoded care protocols for a condition, such as sepsis screening or stroke, that guide a team through steps, timing and decisions and track adherence.",
    d: "A pathway turns a guideline into logic: eligibility criteria, steps with target times, branching on findings and linked order sets and documentation. The system detects eligible patients, starts the pathway, prompts tasks and records the time each step was met. Reports compare actual care with the pathway. The hard part is encoding judgment: a protocol written for the average patient meets exceptions constantly, and clinicians need to deviate without fighting the system or losing the data on why.",
    k: ["Automatic enrollment from data versus clinician-initiated: automatic catches missed patients and creates false starts; clinician-initiated is accurate and depends on recognition.", "Strict step sequencing versus advisory timeline: strict ensures consistency; advisory respects judgment."],
    p: ["A criterion based on a lab value that is not yet resulted keeps eligible patients out.", "No way to record a justified deviation, so deviations appear as failures."],
    v: "Simulate a test patient meeting entry criteria and confirm the pathway starts, tasks appear on the right worklists with target times, and a missed target produces a recorded variance.",
    dep: ["order-sets","alert-rules","structured-capture","quality-measures"]
  },
  "risk-scores": {
    s: "Calculated or predicted scores, such as early warning of deterioration or readmission risk, shown to clinicians to focus attention and trigger actions.",
    d: "Scores are computed from vitals, labs, demographics and history, either by published formulas or by models trained on local or vendor data. Results are stored with the score, its inputs and a version of the logic. Thresholds start workflows, such as a rapid response call. Hard parts: missing inputs, drift when practice or populations change, models that perform worse on groups they were not trained on, and showing why a score is high so a clinician can judge it.",
    k: ["Published transparent formula versus trained model: a formula is explainable and less accurate; a model may predict better and is harder to audit.", "Alert at a low threshold versus a high one: low catches more deterioration and creates alarm load that staff stop answering."],
    p: ["A model validated elsewhere performs poorly on the local population and no one measures it.", "A score computed from incomplete vitals reads low and falsely reassures."],
    v: "Chart a set of deteriorating test vitals and confirm the score rises, shows the contributing inputs, crosses the threshold, triggers the defined task, and records the logic version used.",
    dep: ["flowsheets","observation-model","alert-rules","clinical-data-repository"]
  },
  "health-maintenance": {
    s: "Tracks what preventive care a patient is due for, such as screenings and vaccines, and prompts staff and patients to close the gaps.",
    d: "Rules based on age, sex, history and prior results decide when each item is due, overdue or satisfied. Satisfaction comes from orders, results, vaccine records and outside data, and clinicians may defer or mark as declined with a reason. Lists drive outreach and visit preparation. Hard parts: knowing when a test was done elsewhere, patients who are exempt for reasons not coded, and guidelines that differ between organizations and change often.",
    k: ["Satisfy only from structured data versus accept free text: structured is reliable and misses care done elsewhere; free text counts it and cannot be audited.", "Per-clinic rule sets versus one standard set: local fits practice and weakens comparison."],
    p: ["A screening done at another organization is not counted, so the patient is called to repeat it.", "A patient with a past hysterectomy keeps getting cervical screening reminders."],
    v: "Record a vaccine for a test patient, confirm the matching reminder becomes satisfied and the next due date is set, and a deferral with a reason removes it from the outreach list until the deferral expires.",
    dep: ["alert-rules","observation-model","document-exchange","quality-measures"]
  },
  "alert-governance": {
    s: "The review process and tooling that measure how often alerts fire and are overridden, and decide which to keep, change or retire.",
    d: "Dashboards show, per alert and per user group, firing counts, override rates, reasons given and actions taken. A clinical committee reviews the worst ones, edits logic and retires those that do no good. Changes are tested against past data before release. Without it, alerts accumulate like laws. The challenge is the lack of an outcome measure: an override can be correct or an error, and the only way to know is to look at what happened to patients afterward.",
    k: ["Retire alerts with low acceptance versus keep for safety reasons: retiring lowers fatigue and may remove a rare saving catch.", "Central committee versus local clinical owners: central scales and loses nuance; local fits and lets duplicates grow."],
    p: ["No one owns the committee, so reports are produced and never acted on.", "An alert disabled to reduce noise removes the only check for a rare danger."],
    v: "Pull the top ten alerts by override rate for last month, confirm each has a named owner and a decision on file, and replay a proposed change against last month's data to see how many firings it would remove.",
    dep: ["alert-rules","reporting-warehouse","access-audit-trail"]
  },
  "quality-measures": {
    s: "Computes the percentage of patients who received recommended care from recorded data, for regulators, payers and internal improvement.",
    d: "Each measure defines a population (the denominator), the care expected (the numerator) and exclusions. Logic runs over structured data in the warehouse or the record on a schedule and produces counts and lists of patients who fell short. Reports go to programs that pay or penalize based on results. The central problem is that measures read only what is structured: care that was delivered and documented in a note counts for nothing, so documentation habits become a payment issue.",
    k: ["Compute from structured fields versus abstracted review: structured is cheap and complete for its fields; abstraction captures reality at higher cost.", "Real-time measure status in the chart versus periodic reports: real-time lets teams act on gaps and requires fast computation."],
    p: ["The numerator relies on a field clinicians rarely use, so true performance is understated.", "Measure logic updates yearly and an old version is submitted by mistake."],
    v: "Run a measure over a test cohort with known answers and confirm denominator, numerator and exclusions match a hand count, and each failing patient can be listed with the missing item.",
    dep: ["reporting-warehouse","clinical-pathways","health-maintenance","payer-and-registry-feeds"]
  },
  "appointment-scheduling": {
    s: "Books patients into time slots with the right provider, room and equipment, while enforcing visit rules, referrals and overbooking policy.",
    d: "A visit type defines duration, who may perform it, required resources and who may book it. The engine finds slots that satisfy all constraints, books one atomically and generates reminders. Changes cascade, such as a canceled slot triggering a waitlist offer. Reports show utilization and no-shows. Hard problems are the combinatorics of multiple resources (a surgeon, a room, an anesthetist), double booking under concurrency and the pressure to overbook against expected no-shows.",
    k: ["Fixed slot lengths versus variable by visit type: fixed is simple and wastes time; variable fits the work and leaves odd gaps.", "Overbook against predicted no-shows versus never: overbooking raises use of capacity and creates waiting when everyone comes."],
    p: ["Two users book the same slot at once and both get confirmations.", "A visit booked for the wrong type has too little time and delays the whole day."],
    v: "Book the same test slot from two sessions simultaneously and confirm one confirmation, one refusal with alternatives, and a schedule showing exactly one patient.",
    dep: ["resource-templates","encounter-model","location-hierarchy","record-database"]
  },
  "resource-templates": {
    s: "Definitions of when each provider, room and device is available and for which visit types, including leave, holds and blocks.",
    d: "Templates repeat weekly with exceptions for holidays, leave and one-off changes. Slots can be reserved for certain visit types or released at a set time before the day. Changes to a template must handle existing bookings that conflict. Templates encode a clinic's real policy on access, so they are political. Difficulties are keeping them current as people move, tracking who changed what, and preventing a one-line edit from deleting weeks of capacity.",
    k: ["Central scheduling team controls templates versus clinic managers: central is consistent and slow; clinic control is fast and varies.", "Reserve slots for urgent needs versus keep all open: reserved slots protect access for the sick and appear as emptiness."],
    p: ["A template edit removes slots that already had bookings, without telling patients.", "Leave entered late keeps showing availability for a clinician who is away."],
    v: "Add leave to a test provider with existing bookings and confirm a conflict list appears, nothing is deleted silently, and new slots stop being offered for those days.",
    dep: ["appointment-scheduling","care-team","location-hierarchy","change-audit"]
  },
  "registration-and-check-in": {
    s: "Captures or verifies a patient's identity, demographics, coverage and consent at arrival, creating the encounter that everything else attaches to.",
    d: "Staff or kiosks find the patient, verify the identity with photo or a second identifier, update address and coverage, collect copayments and sign forms. Registration creates or confirms the encounter and may print wristbands. The master patient index search runs here, and so most duplicates and wrong-patient errors originate here. Hard parts: unconscious or unidentified patients, names that do not fit a single field, patients using a different name than their documents, and speed demands at busy desks.",
    k: ["Search-first with duplicates warned versus create-new-first: search-first avoids duplicates and slows the desk; create-first is quick and pollutes the index.", "Temporary identity for unknown patients versus waiting for identification: temporary enables care at once and requires a merge later."],
    p: ["A common-name patient is selected from a list by first name and the wrong chart is opened.", "A temporary identity is never merged and care is split across two charts."],
    v: "Register a test patient whose name and birth date match an existing one with a different address and confirm the system shows the candidate, requires a second identifier and logs the choice.",
    dep: ["master-patient-index","encounter-model","coverage-model","eligibility-verification","consent-capture"]
  },
  "admit-discharge-transfer": {
    s: "The events that place a patient in a hospital, move them between units and send them home, broadcast to every system that needs to know where the patient is.",
    d: "Each event updates the encounter and location and emits messages to departmental systems, pharmacy, billing, the bed board and the portal. Discharge triggers instructions, medication reconciliation and billing. Corrections matter: a cancelled admission or a wrongly recorded transfer must reverse in every downstream system. The difficulties are the long chain of subscribers that all must agree on the current location, events arriving out of order and the bed that is occupied in one system and empty in another.",
    k: ["ADT as the single source of location versus each system tracking its own: single source avoids conflicts and creates a dependency; local tracking is resilient and drifts.", "Publish events versus subscribers poll: events are timely and need reliable delivery; polling is simple and slow."],
    p: ["A cancelled discharge does not reach billing, which closes the account while the patient is still in a bed.", "A transfer message lost leaves the pharmacy sending drugs to the old unit."],
    v: "Admit, transfer and discharge a test patient and confirm every subscribing system shows the same location at each step, then cancel the transfer and confirm all revert.",
    dep: ["encounter-model","location-hierarchy","event-and-order-messages","bed-management","interface-engine"]
  },
  "bed-management": {
    s: "Tracks which beds are occupied, dirty, clean or blocked, predicts discharges and assigns incoming patients to suitable beds.",
    d: "The bed board combines ADT events, housekeeping status and unit rules about gender, isolation and acuity. Staff see current and forecast occupancy and manage the queue of patients waiting from the emergency department or the operating room. Predictions use expected discharge dates entered by teams. Hard parts: keeping housekeeping and cleaning status in step with real events, specific constraints such as isolation rooms and monitored beds, and the gap between a bed that is formally available and one that is staffed.",
    k: ["Automatic bed assignment versus coordinator decision: automatic is quick and misses unrecorded constraints; coordinators handle exceptions and become a bottleneck.", "Expected discharge entered by clinicians versus predicted by a model: clinician input is informed and often missing; models fill the gap and need trust."],
    p: ["A bed is shown available while still waiting to be cleaned, so a patient waits in a corridor.", "Isolation requirements are not on the board and an infectious patient shares a room."],
    v: "Discharge a test patient, mark the bed dirty, then clean, and confirm the board shows each status change within seconds and does not offer the bed to a patient needing isolation until it is suitable.",
    dep: ["admit-discharge-transfer","location-hierarchy","care-team","encounter-model"]
  },
  "waitlists-and-recalls": {
    s: "Lists of patients waiting for an appointment or due for a repeat visit, offered slots as they open and reminded when follow-up is overdue.",
    d: "A waitlist ranks patients by urgency and wait time and fills canceled slots by contacting the next eligible person. A recall list holds patients due for follow-up on a date derived from orders or visit instructions. Contact goes by phone, text or portal. The pain is the lists that grow without limit, ranking that must be fair and explainable and patients whose contact details are out of date.",
    k: ["Automatic offer to the first eligible versus staff call: automatic fills slots fast; staff handle nuance and cost time.", "Ranking by urgency only versus urgency and wait time: urgency protects the sick and starves the stable."],
    p: ["A recall created at discharge points to a date that nobody sees until after it has passed.", "Offers go to a number that belongs to someone else and disclose a medical appointment."],
    v: "Cancel a test appointment with two waitlisted patients and confirm the higher-ranked one is offered the slot first, the offer expires on time and then the next is offered.",
    dep: ["appointment-scheduling","referrals-and-authorizations","portal-accounts-and-proxy","clinical-pathways"]
  },
  "procedure-scheduling": {
    s: "Plans operating room and procedure suite time, staff, equipment and supplies for each case, and tracks the case through preparation, surgery and recovery.",
    d: "Cases are requested with a procedure, surgeon, estimated duration, equipment and implants. Block time reserved for services is released if unused. The day's schedule is adjusted as cases run long, emergencies arrive and equipment is unavailable. The record shows the time-out checks, staff and counts. Hard parts: estimating durations, coordinating many people and sterile supply, consent and pre-operative testing being complete before the patient arrives, and last-minute changes spreading through the day.",
    k: ["Block scheduling versus open scheduling: blocks give surgeons predictability and leave unused capacity; open maximizes use and creates competition.", "Surgeon-estimated durations versus historical averages: estimates include case detail and are optimistic; averages are realistic and generic."],
    p: ["A case starts without a signed consent or a required test because the checklist was not enforced.", "Implant availability is not checked until the day of surgery."],
    v: "Schedule a test case needing an implant and no signed consent and confirm the readiness list shows both items as outstanding and blocks the day-of check-in until resolved.",
    dep: ["appointment-scheduling","resource-templates","consent-capture","order-entry","location-hierarchy"]
  },
});
