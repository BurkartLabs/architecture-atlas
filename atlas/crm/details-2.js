// Details for the CRM plate, part 2: pipeline, activities, marketing handoff, automation.
ATLAS.details("crm", {
  "opportunities": {
    s: "The record for a potential sale: an account, an expected amount, a close date and a stage, with products, contacts and activity attached.",
    d: "An opportunity belongs to one account, has one owner, sits in one pipeline and stage, and carries an amount and expected close date. Amount may be typed or summed from product lines. Changing stage can set probability, forecast category and required fields. Closing as won or lost freezes the outcome and often triggers downstream steps such as a contract or order. It is hard because everything else, forecasts, commissions and reports, trusts these few fields, and reps edit them under pressure.",
    k: ["Amount typed by the rep vs summed from line items: typing is fast and flexible, while rollups are consistent and auditable but require products on every deal.", "One record per deal vs separate records for new and renewal revenue: simpler to see in one place, but mixes behaviors that forecasts and reports must separate."],
    p: ["Close dates pushed repeatedly keep a dead deal inflating the pipeline for quarters.", "Deleting a lost opportunity removes the very data that win-loss analysis needs."],
    v: "Create a deal, add two products, advance it through every stage and close it won. Amount equals the product sum, each stage change appears in history, and the closed amount shows in that period's report.",
    dep: ["accounts","pipelines-and-stages","record-store","custom-fields"]
  },
  "pipelines-and-stages": {
    s: "The ordered steps a deal moves through, each with a name, default probability and forecast category, configurable per sales process or product line.",
    d: "A pipeline is a set of stages with a type (open, won, lost), a probability, a category mapping and an order. Different sales processes, such as new business and renewals, use different pipelines tied to record types. Stage changes are recorded with timestamps so time-in-stage and conversion can be computed. The hard part is change: renaming, merging or deleting a stage touches open deals, reports, forecasts and automation that refer to it by name or value.",
    k: ["Several pipelines vs one pipeline with record types: separate pipelines fit different processes cleanly, while a single one simplifies cross-team reporting.", "Fixed probability per stage vs per-deal probability: fixed values are predictable and rollup-friendly, but ignore what the rep knows about this deal."],
    p: ["Deleting a stage that open deals use breaks reports and automation that filter on it.", "Probabilities nobody recalibrates drift away from the real win rate and the weighted pipeline lies."],
    v: "Move a deal across stages and run the stage duration report. Time in each stage equals the history timestamps, and renaming a stage updates deals, reports and forecast mapping without losing history.",
    dep: ["picklists","object-metadata","field-history","opportunities"]
  },
  "stage-gates": {
    s: "Rules that stop a deal from entering a stage until required information or approvals exist, such as a budget confirmed or a decision maker identified.",
    d: "A gate is a set of conditions evaluated when a stage value changes: required fields filled, a contact role present, a quote approved, a custom check passed. Failure blocks the save with a message naming what is missing, or routes to an approval. Gates encode the company's sales method, and are usually built from validation rules and approval processes. The difficulty is balance: strict gates cause rep workarounds, such as typing placeholder values, which pass the gate but destroy data quality.",
    k: ["Hard block vs warning: blocking guarantees the data exists but encourages junk values; warnings keep reps moving but leave gaps nobody fixes.", "Gates at every stage vs only at late stages: early gates slow qualification, and late gates find missing information when the deal is already forecast."],
    p: ["Reps enter a single character to satisfy a required field and the gate protects nothing.", "A gate checking a field the integration user cannot edit blocks automated stage updates."],
    v: "Attempt to move a deal into a stage requiring a decision-maker role without one. The save is refused with a message naming the missing role, and adding the role lets the same change succeed.",
    dep: ["validation-rules","pipelines-and-stages","contact-roles","approval-processes"]
  },
  "products-and-price-books": {
    s: "The catalog of what is sold and the lists that price it, by segment, region, currency or customer, from which deal line items are chosen.",
    d: "Products have codes, families and attributes. A price book lists a price for each product in a currency and may have tiers or effective dates. A deal selects one price book and adds line items with quantity, discount and date. Prices may be overridden under limits. The hard parts are the volume of combinations in complex catalogs, keeping prices consistent with the billing or ERP system that actually invoices, and that changed prices must not alter historical deals.",
    k: ["Catalog owned by the CRM vs imported from the billing system: ownership gives control in one place, but a second source of pricing will drift unless it is the one synchronized.", "Copy price onto the line item vs reference the live price: copies preserve history, while references update automatically but rewrite the past."],
    p: ["A price change in billing is not reflected in the CRM and quotes go out at the old price.", "Deleting a retired product breaks reports on historical deals that included it."],
    v: "Change a list price, then open an old closed deal and a new quote. The old deal keeps its original price, the quote shows the new one, and the CRM catalog matches the billing system's for sampled products.",
    dep: ["opportunities","erp-and-billing-sync","record-store"]
  },
  "quotes-and-proposals": {
    s: "A priced offer generated from a deal's line items, with terms, discounts, validity and a document the customer can accept, versioned as it changes.",
    d: "A quote copies line items from the deal, applies pricing rules, discount limits and tax, and goes through approval if limits are exceeded. A document is generated from a template and sent for signature. Several quote versions may exist per deal, with one marked primary and syncing back to the deal amount. The difficulty is rules: configuration, bundling and volume discounts interact, and a mispriced quote is a contract problem.",
    k: ["Rules engine in the CRM vs a dedicated pricing service: inline rules are simple to deploy, but complex bundles and approvals outgrow them.", "One primary quote synced to the deal vs free-floating quotes: sync keeps forecast amount honest, but only works if teams agree which quote is primary."],
    p: ["A discount approved on a quote version is silently carried to a later version that exceeds the limit.", "A template change alters the wording of already-sent quotes when they are regenerated."],
    v: "Create a quote with a discount over the limit. It cannot be sent until approved, the approved version generates a document matching its line items, and setting it primary updates the deal amount.",
    dep: ["products-and-price-books","approval-processes","opportunities","contracts-and-renewals"]
  },
  "deal-teams-and-splits": {
    s: "Records of who else worked on a deal and how credit for its value is divided among them for quota and compensation.",
    d: "A deal team lists users and their roles, such as engineer or partner manager, with access levels to the deal. Splits allocate percentages of the amount, which must total a set value, to people, either as overlays that add to the deal or as shares of it. Credit feeds quota attainment and commission. The difficulty is that splits move money: each change needs an audit, rollups must handle partial credit, and team membership affects sharing.",
    k: ["Splits summing to 100 percent vs allowing overlay credit above 100: a strict total keeps revenue honest, while overlays reflect how companies actually credit specialists.", "Team access derived from membership vs set separately: automatic access is simpler, but gives every added person the same visibility."],
    p: ["Splits not updated when a deal amount changes leave credit not equal to the amount.", "Removing a team member from a deal leaves them credited in attainment reports for the past period."],
    v: "Add two team members with 60 and 40 percent splits, change the deal amount, and confirm each person's credited amount recalculates, totals stay at 100 percent, and the change is in the audit log.",
    dep: ["opportunities","sharing-rules","forecast-rollups","audit-and-access-logs"]
  },
  "contracts-and-renewals": {
    s: "Records of signed agreements with term, value and renewal date, and the process that creates a renewal deal ahead of expiry.",
    d: "A contract links an account, the products sold, a start and end date, and terms. As the end date approaches, automation creates a renewal deal, copies line items, and assigns it to an owner. Amendments create new versions or co-term the contract with additions. Hard parts are modeling mid-term upgrades and co-terminating, keeping the contract aligned with the billing system's subscription, and ensuring someone owns each renewal long before the date.",
    k: ["Contract as a record of the CRM vs a mirror of the billing subscription: the CRM version is flexible but can drift, while a mirror is accurate but limits what sellers can model.", "Auto-create renewal deals early vs near the end date: early creation gives time to forecast, though it fills pipeline with low-probability renewals."],
    p: ["A mid-term upsell created as a separate deal leaves two contracts with different end dates for one customer.", "Renewal automation skips accounts with no owner and the renewal is never worked."],
    v: "Set a contract to end in 90 days. A renewal deal is created on schedule with the same products, assigned to the account owner, and its link to the contract appears on both records.",
    dep: ["opportunities","accounts","scheduled-automations","erp-and-billing-sync"]
  },
  "win-loss-analysis": {
    s: "Capture and analysis of why deals are won or lost, including reasons, competitors and decision factors, used to improve process and positioning.",
    d: "On closing, the rep records a reason from a controlled list and optionally competitors, a lost-to name and notes. Reports then show win rate by segment, source, size, stage reached and competitor. Reasons are picklists so they can be counted. The difficulty is honesty and consistency: reps pick the easiest reason, \"price\" dominates, and unrecorded reasons leave analysis with nothing but amounts.",
    k: ["Required reason on close vs optional: required captures every outcome but yields shallow answers; optional yields better detail on fewer deals.", "Rep-entered reasons vs buyer interviews: entry is cheap and universal, interviews are slower and often more truthful."],
    p: ["A catch-all reason such as other makes up most losses and tells nothing.", "Deleting lost deals as clutter erases the denominator for win rates."],
    v: "Close ten deals with reasons and competitors. A win-rate report by competitor counts exactly those, and no deal closed lost lacks a reason when the field is required.",
    dep: ["opportunities","picklists","report-builder","stage-gates"]
  },
  "tasks-and-reminders": {
    s: "Dated to-do items attached to records and assigned to users, with due dates, priorities and reminders, forming each seller's daily work list.",
    d: "A task holds a subject, due date, owner, status and the records it relates to. Tasks come from users, from automation, from sequences and from prompts. A work-list view shows today's and overdue items. Reminders notify by app or email at a set time. The hard parts are recurrence, time zones and reassignment, and the overwhelming volume that automation can create: thousands of auto-generated tasks make the list useless.",
    k: ["Tasks as ordinary records vs a lightweight separate model: ordinary records support reporting, sharing and automation, but carry the cost of every other record.", "Automation creating tasks freely vs a per-user limit: freedom ensures follow-up, while limits protect the list from noise."],
    p: ["A recurring task completed late creates its next occurrence in the past, and it appears instantly overdue.", "A rule that creates a task per new lead floods owners during an import."],
    v: "Create a task due tomorrow in another time zone. It appears in the owner's list on the correct local day, a reminder fires on time, and completing it moves it to the record's timeline.",
    dep: ["record-triggers","record-ownership","activity-timeline","push-notifications"]
  },
  "calendar-sync": {
    s: "Two-way exchange of meetings between the CRM and users' calendars, so events appear in both and are logged against the right customer records.",
    d: "A connector uses the calendar provider's API or standard calendar protocol with delegated authorization from each user. It receives change notifications or polls, matches attendees to contacts and leads, and creates activity records for meetings. Edits and cancellations propagate back. Recurring events, time zones, private meetings and shared calendars multiply the cases. The hard part is trust: a bad sync that deletes or changes someone's real calendar is damaging.",
    k: ["Two-way sync vs one-way import: two-way keeps both consistent but may modify real calendars; one-way is safer and loses edits made in the CRM.", "Sync every event vs only those with known external attendees: capturing everything is complete but logs private meetings; filtering to customers reduces both noise and risk."],
    p: ["A deleted occurrence in a recurring series removes the whole series in the other system.", "Expired authorization silently halts sync and meetings stop being logged."],
    v: "Create a meeting with a known contact in the calendar, then reschedule it. The CRM shows one activity at the new time linked to the contact, and a private meeting with no customer is not logged.",
    dep: ["call-and-meeting-logging","email-matching","capture-privacy","api-credentials-and-limits"]
  },
  "email-sync": {
    s: "Continuous copying of a user's sent and received business email into the CRM, so conversations with customers are on their records without manual logging.",
    d: "A connector authorizes to each mailbox through the mail provider's API or an IMAP-style protocol, reads new messages incrementally by cursor, and hands them to matching. It stores headers, bodies and sometimes attachments, deduplicates messages seen by several users, and removes what privacy rules exclude. It handles thread grouping and bounces. The difficulty is scale and privacy: many mailboxes, throttled provider APIs, and a mailbox full of personal mail that must never enter the CRM.",
    k: ["Read the whole mailbox and filter vs only messages with known contacts: whole-mailbox reads catch new contacts but touch private mail; contact-only is safer but misses first contact.", "Store full bodies vs metadata only: full bodies enable search and insight but copy sensitive content and add storage and retention burdens."],
    p: ["Revoked mailbox authorization stops sync without anyone noticing, and the timeline quietly goes stale.", "The same message shared among several users appears several times on the account."],
    v: "Send and receive messages with a known contact and with a personal contact. Only the first appears on the contact's timeline within the sync interval, once, in the right thread, and the second is not stored.",
    dep: ["email-matching","capture-privacy","api-credentials-and-limits","async-job-queue"]
  },
  "email-matching": {
    s: "The logic that decides which contact, lead, account and deal an email or meeting belongs to, based on addresses, domains, threads and context.",
    d: "Participants' addresses are looked up against contact and lead emails, with alias and secondary-address tables. When nothing matches, the domain may map to an account. The matched person's open deals or cases select the related record, using thread history or recent activity. Rules decide ambiguity, such as one address on two contacts. The difficulty is wrong attachment: a message filed under the wrong deal or an internal-only thread logged at a customer erodes trust.",
    k: ["Exact address match only vs domain and fuzzy inference: exact is precise but misses new colleagues; inference finds more but misfiles messages from shared domains.", "Auto-associate to the most recent open deal vs ask the user: automatic is invisible when right and misleading when wrong, while prompting adds work to a hundred messages a day."],
    p: ["Messages from free-mail domains get attached to an unrelated account that has that domain.", "Forwarded or distribution-list messages are attached to the forwarding employee as if they were a customer."],
    v: "Send messages from a known contact, an alias of that contact, a new colleague at a known domain, and a shared mailbox. The first two attach to the contact, the third proposes the account, and the fourth is left unmatched.",
    dep: ["contacts","accounts","leads","opportunities","match-rules"]
  },
  "email-templates-and-tracking": {
    s: "Reusable email bodies with merge fields, and the tracking of opens, clicks and replies for messages sent from within the CRM.",
    d: "A template holds subject and body with placeholders filled from the record and sender. Sent messages go through the user's mailbox or a service and are logged. Tracking inserts an invisible image and rewritten links, and records events when they load. Replies are detected through threading. The hard parts are accuracy and consent: privacy features in mail clients make open counts unreliable, and tracking may require consent in some jurisdictions.",
    k: ["Send from the user's own mailbox vs a bulk sending service: the first has better trust and deliverability, while the second scales but risks the domain's reputation.", "Open tracking vs reply and click only: opens are a weak signal inflated by prefetching, while replies are strong but rarer."],
    p: ["A template with an empty merge field sends a message beginning with a blank name.", "Mail privacy features open every message automatically and the tracking reports engagement that never happened."],
    v: "Send a templated message to a test mailbox. Placeholders are filled from the record, the message appears in the timeline, a click on its link is recorded once, and a reply is threaded under it.",
    dep: ["email-sync","consent-and-preferences","contacts","activity-timeline"]
  },
  "call-and-meeting-logging": {
    s: "Recording that a call or meeting happened, who attended, what was discussed and what follows, either manually or from telephony and conferencing integrations.",
    d: "A log entry has type, time, duration, participants, linked records, outcome and notes. Telephony or conferencing integrations create entries automatically from call records, with optional recording and transcript attached. Outcomes can drive next steps and tasks. The hard parts are completeness, because manual logging depends on discipline, and matching participants by phone number, which has many formats and is often shared.",
    k: ["Automatic capture vs manual logging: automatic is complete and unbiased, while manual notes carry the rep's own summary and next steps that machines miss.", "Store recordings in the CRM vs link to the telephony system: linking avoids storage cost and retention conflicts, but depends on that system staying available."],
    p: ["Phone numbers in local formats do not match and calls are attached to no one.", "Recording retention differs from CRM retention, and recordings outlive the records they describe."],
    v: "Place a call to a known contact through the integrated phone. A log entry appears with correct duration, the contact and open deal linked, and the rep's note and next-step task saved against it.",
    dep: ["contacts","input-normalization","activity-timeline","connectors-and-ipaas","backup-and-retention"]
  },
  "capture-privacy": {
    s: "The rules deciding which captured email, calendar and call data is stored, who can see it and which parts stay private to the person who produced it.",
    d: "Settings define excluded domains and addresses, internal-only filtering, sensitive keywords, and visibility levels such as only the owner, the account team or everyone. Messages and meetings can be marked private by the user before or after capture. Capture applies the rules before storage, since later removal is too late. The difficulty is that the rules protect two parties, employees and customers, and cut against the value of shared history.",
    k: ["Private by default vs shared by default: private respects employees and law, while shared makes the timeline complete for the team.", "Filtering before storage vs hiding after: pre-filtering never stores what should not exist, while hiding keeps data that others, such as admins, may still reach."],
    p: ["A filter added after the fact hides new mail but leaves years of already-captured private messages.", "Administrators see all captured mail, which the employees were told they would not."],
    v: "Mark a domain as excluded and send mail to it. It is never stored. Set a message to owner-only and confirm a teammate with record access cannot see it while the owner can.",
    dep: ["email-sync","sharing-rules","privacy-and-consent","audit-and-access-logs"]
  },
  "sequences": {
    s: "A timed series of emails, calls and tasks that a seller enrolls a contact in, stopping automatically when the person replies or books a meeting.",
    d: "A sequence defines steps with delays and channels. Enrolling a contact schedules step one, and a scheduler creates tasks or sends mail from the seller's mailbox at each step. Replies, bounces, meetings or unsubscribes end enrollment. Limits cap daily sends per user. The hard parts are deliverability, since bulk mail from personal mailboxes harms reputation, and exclusion rules so a person already in a deal or opted out is never enrolled.",
    k: ["Send from each seller's mailbox vs a shared sending domain: personal mail looks genuine and replies reach the seller, while volume on one mailbox can get it blocked.", "Automatic steps vs manual tasks: automation scales, while manual tasks keep calls personal but depend on the rep doing them."],
    p: ["A contact replies on another channel and keeps receiving steps because only mailbox replies stop the sequence.", "A contact on two sequences gets overlapping messages from two sellers."],
    v: "Enroll a contact in a three-step sequence, reply to step one from the contact's address, and confirm enrollment stops and later steps are cancelled. Enroll an opted-out contact and confirm it is refused.",
    dep: ["email-templates-and-tracking","scheduled-automations","consent-and-preferences","tasks-and-reminders","async-job-queue"]
  },
  "lead-capture-forms": {
    s: "Web forms and intake channels that create leads in the CRM from visitors' submissions, with source, campaign and consent recorded.",
    d: "A form posts fields to an endpoint that validates, normalizes and creates a lead or updates an existing contact, storing source, campaign parameters and the consent given. Hidden fields carry tracking values. Behind the form, anti-abuse checks reject bots. Other channels include chat, events and list uploads. The hard parts are abuse, since public endpoints get spam and fake submissions, and deciding whether a submission becomes a new record or an update to an existing person.",
    k: ["Create a new lead each time vs match and update: creating is simple but breeds duplicates; matching keeps one record but must decide which fields to overwrite.", "Synchronous creation vs queue: synchronous gives instant routing, while queueing absorbs traffic spikes and delays assignment slightly."],
    p: ["A public endpoint without rate limits is flooded with fake leads that route to sales.", "Consent text shown to the visitor is not stored with the lead, so it cannot be proved later."],
    v: "Submit the form twice with the same email and different campaign values. One person exists, both submissions are in history with their sources and consent text, and an obviously automated submission is rejected.",
    dep: ["leads","duplicate-detection","consent-and-preferences","input-normalization","rest-api"]
  },
  "lead-scoring": {
    s: "A numeric value on a lead from fit (who they are) and engagement (what they did), used to decide when sales should see it and in what order.",
    d: "Rules add points for fit such as title, company size and industry, and for behavior such as visits, replies and downloads, and subtract for inactivity or poor fit. Models can replace the hand-set weights. When a score passes a threshold, the lead becomes qualified and is routed. Scores are recomputed as behavior arrives. The hard part is calibration: thresholds chosen once go stale, scores diverge between marketing and sales views, and models learn from sales behavior that was itself biased.",
    k: ["Separate fit and engagement scores vs one number: two scores tell sales whether a lead is a good company or just an active visitor, but a single number is easier to sort.", "Hand-tuned rules vs learned model: rules are explainable and immediate, while models adapt but need enough outcome data and need monitoring."],
    p: ["A threshold nobody revisits sends sales too many low-quality leads and they stop trusting any score.", "Scores that never decay keep an inactive lead at the top for years."],
    v: "Replay last quarter's leads through the scoring. Leads above the threshold convert to opportunities at a clearly higher rate than those below, and a lead with no activity for the decay period loses its engagement points.",
    dep: ["leads","marketing-sync","record-triggers","win-loss-analysis"]
  },
  "lead-routing": {
    s: "Rules that decide which seller or queue receives each new lead, based on territory, segment, source, capacity or round-robin order.",
    d: "On creation or qualification, an engine evaluates ordered rules against lead fields: country and state, company size, product interest, source. It selects an owner, queue or team, optionally applying round-robin or load-based balance and respecting working hours and absences. A match to an existing account can route to that account's owner. The difficulty is fairness and speed together: assignment must be instant, consistent when run twice, and fix itself when people leave or territories change.",
    k: ["Territory rules vs round-robin: territories give owners a predictable patch and relationships, while round-robin spreads volume evenly but ignores fit.", "Route to the existing account owner vs the new lead's territory: the first protects relationships, though it can send leads to a rep who is not selling that product."],
    p: ["Rules evaluated in an unclear order assign the same lead differently on a re-run.", "A departed rep remains in the rotation and leads sit with a deactivated user."],
    v: "Create fifty test leads across territories and sources. Each is assigned according to the documented rule order, round-robin counts are even within one, and a lead for a known account goes to that account's owner.",
    dep: ["leads","teams-and-territories","record-ownership","record-triggers","accounts"]
  },
  "handoff-sla": {
    s: "The agreed time within which sales must act on a handed-off lead, and the rules that reassign or recycle leads that nobody works.",
    d: "When a lead becomes qualified or is routed, a timer starts. If the owner does not log a first activity or change status before it expires, an escalation reassigns it, notifies a manager or returns it to marketing for nurture. Rejection reasons and recycling states are recorded. Reports show response times by team. The hard part is cultural: the SLA measures sellers, so definitions of first touch and qualification are disputed, and gaming them is easy.",
    k: ["Automatic reassignment on a timer vs manager review: automatic ensures nothing sits, but may take a lead from a rep who was already working it by phone.", "Count any activity as touch vs a qualifying conversation: any activity is easy to measure and to game, while qualified contact is meaningful but harder to detect."],
    p: ["Reps log meaningless tasks to stop the SLA clock, and the metric reports fast response to leads nobody called.", "Recycled leads return to nurture without a reason and marketing cannot fix what it cannot see."],
    v: "Route a lead and take no action. At the SLA limit it is reassigned and the manager is notified; a lead worked in time is not. The response-time report matches the timestamps.",
    dep: ["lead-routing","escalations-and-sla-timers","leads","report-builder"]
  },
  "campaigns-and-members": {
    s: "Records for marketing programs and the list of contacts and leads who were targeted, responded or attended, with a status for each.",
    d: "A campaign has a type, dates, budget and parent hierarchy. Members join with a status such as sent, responded or attended, and each status is flagged as a response or not. Responses can create leads and update lead and contact fields. Roll-up fields count members and costs. The difficulty is scale and cleanliness: campaigns carry hundreds of thousands of members, and statuses fed from outside systems arrive in bulk and out of order.",
    k: ["Campaign members as rows on a join object vs tags on the contact: rows keep history per campaign and support status, while tags are lighter but lose when and why.", "Campaign hierarchy with roll-ups vs flat campaigns: hierarchy shows program totals, but roll-up calculation adds cost and complexity."],
    p: ["Importing a million members in one run locks the object for other users.", "Status values added outside the defined list break responded-versus-sent counts."],
    v: "Add 100 contacts to a campaign, mark 20 as responded, and check that the roll-up counts and response rate equal 100, 20 and 20 percent, and that responders show the campaign in their history.",
    dep: ["contacts","leads","marketing-sync","bulk-api","formula-and-rollup-fields"]
  },
  "campaign-attribution": {
    s: "The models that decide how much credit each marketing touch gets for a deal, such as first touch, last touch or a weighted split across touches.",
    d: "Each opportunity is linked to the contacts involved, and each contact's campaign responses before the deal's creation or close are collected. A model weights them: all to the first, all to the last, even across all, or a time-decay or position-based split. Credited revenue is stored per campaign for reports. The hard part is that attribution is an argument encoded as math: incomplete tracking, offline touches and multi-person buying groups mean any model is an approximation.",
    k: ["Single-touch vs multi-touch: single-touch is simple and explainable but credits one touch for a journey, while multi-touch spreads credit and needs complete tracking to mean anything.", "Compute at deal close vs recompute continuously: close-time results are stable, while continuous recomputation reflects late-arriving touches and changes the past."],
    p: ["Opportunities without contact roles get no attribution, so the model reports less marketing influence than exists.", "Changing the model retroactively changes last year's reported campaign return."],
    v: "Create a deal with three contacts and four touches across two campaigns. The credited amounts under a chosen model sum to the deal amount, and switching models changes the split but not the total.",
    dep: ["campaigns-and-members","contact-roles","opportunities","report-builder"]
  },
  "marketing-sync": {
    s: "Two-way exchange of leads, contacts, scores, campaign responses and unsubscribes between the CRM and a separate marketing automation system.",
    d: "A connector maps leads and contacts between the two systems, pushes records qualified for sales, and brings back activity, scores and campaign membership. Each side may own certain fields. Changes are exchanged on a schedule or by events with a retry. Sync loops, conflicting edits and matching by email are the main problems, and a unsubscribe or opt-out that fails to cross the boundary is a legal one.",
    k: ["Event-driven sync vs scheduled batch: events keep systems close within seconds but are harder to replay; batches are simple and recoverable but lag.", "Single owner per field vs last-write-wins: ownership prevents ping-pong edits, while last write is simpler but overwrites good data with stale."],
    p: ["An unsubscribe in one system does not reach the other, and people keep getting mail.", "Records deleted on one side are recreated by the next sync from the other."],
    v: "Qualify a lead in marketing, opt a contact out in the CRM, and change a phone number on each side. The lead arrives in the CRM, the opt-out reaches marketing, and each field follows its stated owner.",
    dep: ["connectors-and-ipaas","field-mapping-and-transforms","webhooks-and-change-events","leads","consent-and-preferences"]
  },
  "consent-and-preferences": {
    s: "The record of what each person agreed to, by channel and purpose, with when and where, and the preference center where they change it.",
    d: "Consent is stored per person, channel, purpose and source, with timestamp, wording version and evidence such as the form that captured it. Sending paths check consent before email, sequences or calls. Preference changes and withdrawals propagate to marketing and other systems. The hard part is that consent is evidence, not a flag: regulators ask when and how it was given, and a boolean opt-in that overwrites its history cannot answer.",
    k: ["Consent as a history of events vs a current status field: history proves compliance and supports re-consent, while a single flag is simple and wrong when audited.", "Central consent service vs per-system flags: one source prevents mixed states, but every connected system must call it and honor changes."],
    p: ["An import overwrites opt-outs with opted-in values from a purchased list.", "Consent recorded for one purpose, such as newsletters, is used to justify another."],
    v: "Withdraw email consent for a contact. All sending paths refuse them immediately, the marketing system reflects it within the sync interval, and the record shows the original grant and the withdrawal with times.",
    dep: ["contacts","change-event-stream","privacy-and-consent","field-history"]
  },
  "workflow-rules": {
    s: "Declarative if-then rules that run when a record is created or edited and perform actions such as updating a field, sending an email or creating a task.",
    d: "A rule names an object, an entry condition and a set of immediate or time-delayed actions. When a save commits, the engine evaluates enabled rules against the changed record and runs matching actions. Actions run as a system user or the editor. Rules are ordered or independent. The difficulty is interaction: one rule's field update fires another rule or a trigger, and in a large customized system nobody can predict the cascade.",
    k: ["Declarative rules vs code: rules let administrators change behavior without developers, while complex logic or loops eventually need the power of code.", "Run after commit vs inside the transaction: after-commit actions cannot block a save, while in-transaction actions can roll it back but make saves slower and riskier."],
    p: ["Two rules updating each other's fields loop until a recursion limit stops the save.", "A rule that emails on every update floods customers when a bulk change touches thousands of records."],
    v: "Create a rule setting a priority when amount exceeds a limit. Saving a large deal sets the field once, saving a small one does not, and bulk-updating 10,000 deals produces 10,000 correct results without a loop.",
    dep: ["record-triggers","object-metadata","async-job-queue","automation-run-history"]
  },
  "record-triggers": {
    s: "The hooks that fire before or after a record is inserted, updated, deleted or restored, so automation and custom code can react to a save.",
    d: "The save path publishes events at defined points: before validation, after validation, after commit. Subscribers include workflow rules, flows, custom code and integrations. Triggers receive batches of records for efficiency and must be idempotent, since failures retry. A defined order of execution resolves who runs first. The hard parts are cascades, where an automation's own update fires more triggers, and bulk operations, since logic written for one record at a time is slow on thousands.",
    k: ["Before-save hooks vs after-save: before can change the record cheaply without another write, while after sees the committed result and can touch other records.", "Batch handlers vs per-record: batching keeps bulk loads fast, but the code must avoid per-record queries that scale with batch size."],
    p: ["A trigger doing a query per record fails with limit errors on the first large import.", "Order of execution between customer triggers and platform rules is undocumented to the person debugging it."],
    v: "Update 5,000 records in one operation with a trigger attached. It runs per batch rather than per record, stays within resource limits, and a failure inside it rolls back the whole save with a clear error.",
    dep: ["transactions-and-locking","object-metadata","change-event-stream","custom-code-hooks"]
  },
  "scheduled-automations": {
    s: "Automation that runs at set times or intervals over a set of records, such as nightly cleanup, renewal creation or reminders for unchanged deals.",
    d: "A schedule holds a time, a record selection and actions. At the time, a job selects matching records, processes them in batches and records the result. Time-based workflow actions defer work from a record change to a later time and re-check the condition. The hard parts are volume, because a nightly job over millions of records competes with users, and drift: record selections defined once go stale, and nobody notices a job that quietly selects nothing.",
    k: ["Time-based actions queued per record vs a periodic scan: queued actions fire precisely, but are hard to inspect or change; scans are transparent and simple but only as fine as their interval.", "Run all tenants at midnight vs spread load: simple for customers to reason about, while spreading avoids a daily load spike on shared infrastructure."],
    p: ["A scheduled job selecting on a field that was later deleted fails every night and nobody is notified.", "A job started before a reorg runs for hours on stale ownership."],
    v: "Schedule a job to create tasks for deals unchanged for 30 days. It runs at the set time, selects exactly the stale deals, creates one task each and shows its counts in run history; a failure raises an alert.",
    dep: ["async-job-queue","query-engine","tenant-isolation-and-limits","automation-run-history"]
  },
  "approval-processes": {
    s: "A defined chain of approvers that a record must pass, such as discounts, large deals or contract terms, with submit, approve, reject and recall steps.",
    d: "On submission the record is locked or flagged, and a request goes to approvers named by user, role, hierarchy or field. Steps can be sequential or parallel, with entry criteria, delegation and timeouts. Approval or rejection runs actions and unlocks the record. History keeps who decided and when. The hard parts are dead ends, where an approver is absent or deactivated, and recalls and edits mid-flight that invalidate what was approved.",
    k: ["Lock the record during approval vs allow edits: locking guarantees what was approved is what ships, while allowing edits keeps work moving but needs re-approval when key fields change.", "Hierarchy-based approvers vs named users: hierarchy follows org changes automatically, while named users are explicit but break when people move."],
    p: ["A request waits indefinitely because the approver is on leave and no delegate was set.", "A rep edits the discount after approval, and the shipped quote differs from what was approved."],
    v: "Submit a discount over the limit. It goes to the manager, the record is locked, approval unlocks it and logs approver and time, and changing the discount afterward forces a new approval.",
    dep: ["role-hierarchy","record-triggers","field-history","escalations-and-sla-timers"]
  },
  "flow-builder": {
    s: "A visual editor and engine for multi-step automations with branches, loops, record lookups and screens, replacing hand-written code for many customer processes.",
    d: "A flow is a graph of elements: get records, decisions, assignments, loops, create or update, call an action, show a screen. It can start on a record change, a schedule, an API call or a user click. The engine interprets the graph, bundles database operations and enforces limits. Flows can be versioned and activated. The difficulty is that they are programs without programmer tooling: testing, debugging, version control and performance are all weaker than for code.",
    k: ["Visual flows vs custom code: flows let administrators build quickly and are inspectable, but get unwieldy, are hard to diff and hit limits sooner.", "Interpreted graph vs compiled code: interpretation allows live editing and versioning, at lower speed for heavy loops."],
    p: ["A loop that queries inside each iteration exhausts limits in production but works on test data.", "Two flows editing the same record in the same save overwrite each other's changes."],
    v: "Run a flow with a loop over 200 child records using a batch of 1,000 parent saves. It completes within limits, the debug trace shows each branch taken, and a deliberately bad record fails with an error naming the element.",
    dep: ["record-triggers","automation-run-history","query-engine","sandboxes-and-deployment"]
  },
  "escalations-and-sla-timers": {
    s: "Timers that start when something happens and fire an action if no response occurs by a deadline, such as reassigning an idle lead or alerting a manager.",
    d: "A timer holds a start event, a duration measured in business hours with a calendar and holidays, a stop condition and an action on expiry. Milestones chain several timers. The engine stores due times and a scheduler wakes to evaluate them, so a million timers cost an index scan, not a million sleeping threads. The difficulty is correctness over time: business hours across time zones, pausing while waiting on the customer, and timers on records that change owner.",
    k: ["Business-hours calendars vs wall-clock durations: calendars match promises made to customers, but require per-team schedules and handle holidays and zones.", "Poll due times periodically vs schedule per timer: polling is simple and cheap in bulk but fires with some jitter; per-timer scheduling is exact but costly."],
    p: ["A timer that is never stopped on resolution escalates cases that are already closed.", "Daylight saving changes move a deadline by an hour and breach reports disagree with the promise."],
    v: "Start a four-business-hour timer on Friday afternoon. It expires on Monday at the correct local time, pausing on a waiting-for-customer status extends it, and closing the record cancels it before it fires.",
    dep: ["scheduled-automations","record-triggers","async-job-queue","approval-processes"]
  },
  "custom-code-hooks": {
    s: "A sandboxed place where customers or partners run their own code on records, in response to saves, API calls or user actions, within strict limits.",
    d: "Code is uploaded or edited in the platform, compiled and stored as metadata, then invoked from triggers, flows, buttons and API endpoints. It runs on shared infrastructure, so the platform imposes per-execution limits on queries, rows, memory, time and calls out. Tests are required before deployment to production. The hard parts are isolating tenants from each other and from the platform, and limits that make code behave differently at ten records than at ten thousand.",
    k: ["Strict per-execution limits vs generous ones: strict limits protect other tenants and force efficient code, but make legitimate large operations fail.", "In-platform code vs external services called by webhook: in-platform code is transactional and close to data, while external services are unconstrained but not part of the save."],
    p: ["Code that passes with test data hits row or query limits on a real customer's volume.", "Callouts to slow external services hold a transaction open and block users."],
    v: "Deploy code that processes a batch of 5,000 records. It finishes under every limit, a seeded failure rolls back only that transaction, and the limit counters in the debug log show usage below each cap.",
    dep: ["tenant-isolation-and-limits","record-triggers","sandboxes-and-deployment","rest-api"]
  },
  "automation-run-history": {
    s: "The log of each automation execution, with inputs, actions taken, errors and timing, so admins can find why a record changed or a rule failed.",
    d: "Every rule, flow, trigger and scheduled job writes an entry with what triggered it, the record, the outcome and elapsed time. Failures include a message and a stack or element name. Entries are searchable by record and by automation, retained for a set time, and sampled when volume is high. Alerts go to owners on repeated failure. The hard part is volume and overlap: one save may run a dozen automations in sequence, and a flat log hides which caused which.",
    k: ["Log every execution vs only failures: complete logs answer why a field changed, but cost storage and slow hot paths; failure-only logs are cheap and miss silent wrong behavior.", "Show the cascade as a trace vs separate entries: a trace explains the order of events, while flat entries are simple to store and query."],
    p: ["An automation fails nightly for a month because errors go to an unread mailbox.", "A short log retention removes the evidence before anyone investigates a data change."],
    v: "Change a field on one record that fires three automations, one failing. The run history shows all three in order for that record, the failed one with its error and the user and time, and an alert is sent to its owner.",
    dep: ["workflow-rules","flow-builder","audit-and-access-logs","async-job-queue"]
  },
});
