// Details for the learning management plate, part 3: accessibility, enrollment, programs, integration.
ATLAS.details("learning-management", {
  "semantic-markup": {
    s: "Interface and content templates that use real headings, landmarks, labels and roles so assistive technology can navigate and announce them correctly.",
    d: "Every page template emits structure that a screen reader can use: one main landmark, ordered headings, labeled form controls, table headers and live regions for status changes. Custom widgets expose roles, names and states. Authored content passes through the editor, which encourages structure. It is hard because structure is lost silently: a styled paragraph looks like a heading but is not one, and dynamic updates in single-page screens change content without announcing it.",
    k: ["Native elements vs custom widgets with added roles: native elements are accessible for free and limited in styling; custom widgets look right and need constant testing.", "Enforcing structure in templates vs relying on authors: templates guarantee the shell, while content is only as good as the author's habits."],
    p: ["A modal dialog that does not trap or return focus leaves screen reader users lost behind it.", "Status messages such as saved or graded appear visually and are never announced."],
    v: "Navigate a course page, a quiz and the gradebook using only a screen reader, and confirm landmarks, headings, form labels and status updates are all announced and the task can be completed.",
    dep: ["keyboard-and-focus","accessibility-by-default"]
  },
  "keyboard-and-focus": {
    s: "Ensures every function is reachable and operable by keyboard, with visible focus, logical order and no traps, including in custom controls and embedded tools.",
    d: "All interactive elements take focus in reading order, show a visible indicator, and respond to standard keys. Composite widgets such as menus, grids and drag-and-drop offer arrow-key and alternative actions. Skip links bypass repeated navigation. Dialogs manage focus on open and close. It is hard because third-party content in frames has its own behavior, because rich widgets such as the gradebook grid need careful design, and because regressions appear whenever a team adds a new control.",
    k: ["Keyboard alternatives for drag-and-drop vs pointer-only with a fallback page: built-in alternatives serve everyone, and add design and test cost.", "Single tab stop with arrow-key navigation inside grids vs tabbing through every cell: a single stop is efficient and unfamiliar; full tabbing is predictable and slow."],
    p: ["A custom dropdown opens on hover only and cannot be reached by keyboard.", "Focus disappears after content reloads, returning to the top of the page."],
    v: "Complete enrolling, submitting an assignment and posting a grade with only a keyboard, and confirm focus is always visible, never trapped and ends in a logical place after every dialog.",
    dep: ["semantic-markup"]
  },
  "captions-and-transcripts": {
    s: "Provides synchronized captions, audio description and searchable transcripts for video and audio, from automatic and human sources.",
    d: "Media items can carry caption tracks in several languages. Speech recognition produces a first draft quickly; reviewers or vendors correct it, and instructors can upload their own. Transcripts are indexed for search and shown beside the player. Requests for human captions are queued with status. It is hard because automatic captions are wrong in subject-specific terms, because turnaround for human work is days, and because compliance requires captions before a learner needs them.",
    k: ["Automatic captions published immediately vs held for review: immediate publication helps learners now and may show errors; holding is accurate and delays access.", "Captions burned into video vs separate tracks: burned-in is simple and cannot be turned off, translated or searched; separate tracks are flexible."],
    p: ["Machine captions mangle technical vocabulary in a way that changes the meaning of a lecture.", "A caption track goes out of sync after the video is re-encoded or trimmed."],
    v: "Upload a lecture, confirm a machine caption track is generated, request a correction, and verify the corrected text is searchable and stays aligned after the video is trimmed.",
    dep: ["media-library","job-queue","search-index","transcoding-pipeline"]
  },
  "accessibility-checker": {
    s: "Scans authored content and course structure for accessibility problems, such as missing alt text or low contrast, and shows how to fix each.",
    d: "The checker runs inside the editor and across a whole course, parsing markup for known failures: images without descriptions, heading skips, tables without headers, poor contrast and unlabeled links. Findings point to the exact element, explain the problem and offer a fix. Course-level reports show counts and trends for departments. It is hard because automated checks find only a fraction of problems and can give false assurance, and because fixing needs human judgment.",
    k: ["Blocking publication on failures vs warning only: blocking forces fixes and frustrates instructors with false positives; warnings are gentle and are ignored.", "Checking at edit time vs in bulk reports: edit-time checks catch problems at the source; reports show the backlog of existing content."],
    p: ["Teams treat a clean checker report as proof of accessibility, though it cannot judge meaning of alt text.", "Scanned PDFs and images of text pass because there is no markup to check."],
    v: "Add an image without alt text, a skipped heading and a low-contrast link, run the checker, and confirm each is flagged at its element with a fix, and the course report counts three issues.",
    dep: ["rich-content-editor","semantic-markup","file-repository"]
  },
  "accommodations-engine": {
    s: "Applies per-learner adjustments such as extra time, extra attempts and alternate dates across quizzes and assignments, from an approved record.",
    d: "An accommodation is a rule attached to a learner, from the institution's disability or support office: a time multiplier, extra attempts, date shifts. The engine resolves it at runtime for each timed or dated item, combining with instructor overrides under defined precedence. Details of the reason are hidden from instructors; only the effect is visible. It is hard because the rule must apply everywhere without leaking sensitive status, and because stacking multipliers and overrides gives surprising results.",
    k: ["Central accommodation records applied automatically vs instructors entering overrides by hand: central records are consistent and need integration with the support office; manual entry is flexible and error-prone.", "Revealing the reason to instructors vs only the effect: effect-only protects privacy and can generate questions instructors cannot answer."],
    p: ["A learner's accommodation is set up on one quiz and forgotten on the next, because overrides were manual.", "A double time multiplier and an instructor extension combine to far more time than intended."],
    v: "Give a learner 1.5 times time, start a 60-minute quiz, and confirm the timer shows 90 minutes, instructors see an adjustment without the reason, and an extra instructor override combines under the documented rule.",
    dep: ["quiz-engine","assignment-engine","privacy-consent","relational-store"]
  },
  "localization-service": {
    s: "Translates the interface and formats dates, numbers, currencies and text direction for each user's language and region.",
    d: "Interface strings live in message catalogs keyed by identifier, with plural and gender rules. The user's language preference chooses the catalog, with fallbacks. Dates, times and numbers use locale formats; right-to-left languages mirror layouts. Course content is separate from interface translation and is usually authored in one language. It is hard because strings built by concatenation break grammar, because layouts overflow with longer words, and because translations lag the code.",
    k: ["Full-sentence message keys with parameters vs string concatenation: full sentences translate correctly and take effort to write; concatenation is quick and cannot be translated.", "Community or vendor translation vs machine translation: human translation is accurate and slower to update; machine translation covers everything and makes visible errors."],
    p: ["A partially translated interface mixes languages, and error messages fall back to a code.", "A date shown as 03/04 is read as different days by learners in different regions."],
    v: "Switch a test account to a right-to-left language and a language with complex plurals, and confirm layout mirrors, plural forms are correct, dates follow the locale and no raw message keys appear.",
    dep: ["time-zones-and-deadlines","relational-store","accessibility-by-default"]
  },
  "course-catalog": {
    s: "The browsable list of courses and programs offered, with descriptions, terms, prerequisites, capacity and the route to enroll.",
    d: "The catalog holds the offering: code, title, description, credits, term, instructors, prerequisites and seats. It differs from a course site, which is an instance with content. A catalog can come from the registrar or be authored directly. Search and filters help learners choose. It is hard because the relationship between catalog entries, sections and course sites is one-to-many and often unclear, and data from the student information system arrives late.",
    k: ["Catalog owned by the registrar and mirrored here vs authored here: mirroring keeps one source of truth and depends on sync quality; local authoring is flexible and diverges.", "Public catalog vs signed-in only: public listing aids discovery and marketing, but exposes capacity and instructor details."],
    p: ["A course site created before its catalog entry is orphaned and cannot receive enrollments.", "Capacity shown in the catalog is stale and learners enroll into full sections."],
    v: "Change a section's capacity in the registrar's feed, and confirm the catalog shows the new number within the sync interval and rejects a self-enrollment when full.",
    dep: ["roster-sync","term-and-schedule","search-index","relational-store"]
  },
  "enrollment-service": {
    s: "The authoritative record of who is in which course or section, in what role and state, with every change timestamped and attributable.",
    d: "An enrollment links a person, a course or section, a role and a state such as invited, active, completed, inactive or dropped. Changes arrive from roster sync, self-service, instructors and administrators, and each is recorded with its source. State drives access: dropped learners lose access, but keep records. Other services read enrollments constantly, so it is cached. It is hard because concurrent sources conflict and because access decisions depend on its freshness.",
    k: ["Soft state changes with history vs deleting rows: state changes preserve grades and audit trail and require every query to filter by state.", "One enrollment per person per course vs per section: course-level is simple and breaks section-specific dates; section-level is precise and multiplies rows."],
    p: ["A dropped learner keeps access because a cache is not invalidated after the roster sync.", "Two sources flip an enrollment between active and inactive on every sync cycle."],
    v: "Drop a learner through the roster feed, and confirm their access ends within the cache interval, their grades remain visible to staff, and the history shows source and time of the change.",
    dep: ["course-roles","relational-store","audit-log","permission-model"]
  },
  "self-enrollment-and-codes": {
    s: "Lets learners join courses themselves by browsing, using a join code, or following an invitation link, with optional approval and limits.",
    d: "Instructors or administrators open a course to self-enrollment, with a window, capacity and an optional code. The learner requests, and the system enrolls immediately or queues for approval. Invitations are signed links bound to an email or open to anyone with the link. It is hard because codes leak, because open enrollment invites abuse, and because identity must be established when anyone can sign up, which matters for certificates and records.",
    k: ["Shared join code vs per-person invitations: a shared code is easy to distribute and spreads widely; individual invitations are controlled and laborious.", "Immediate enrollment vs approval: immediate access is frictionless; approval protects capacity and eligibility and delays learners."],
    p: ["A join code posted on a public forum fills the course with unknown participants.", "Self-enrollment bypasses a prerequisite because the check only exists in the registrar flow."],
    v: "Open a course with a code and capacity of two, enroll three people, and confirm two are admitted, the third is rejected or waitlisted, and a wrong code is refused and logged.",
    dep: ["enrollment-service","waitlists-and-capacity","authentication","audit-log"]
  },
  "roster-sync": {
    s: "Keeps courses and enrollments in step with the student information system through scheduled or event-driven feeds and a defined mapping.",
    d: "Feeds deliver users, courses, sections and enrollments by file or by a standard web interface. The sync matches records through stable identifiers, applies creates, updates and deletes, and reports row-level errors. Full feeds reconcile; incremental feeds are faster. Mapping translates registrar roles and states into system ones. It is hard because identifiers change, files arrive late or out of order, and a bad feed can mass-drop thousands of learners at once.",
    k: ["Full snapshot feeds vs incremental changes: snapshots self-heal and are large and slow; increments are fast and a missed change persists until someone notices.", "Applying deletions automatically vs requiring review above a threshold: automatic keeps data current; a threshold guard prevents a broken feed from wiping a term."],
    p: ["A feed with a missing column drops every enrollment in the term.", "A learner whose identifier changes appears as a new person, with their grades left behind."],
    v: "Run a feed that removes 40 percent of enrollments, and confirm the threshold guard halts it for review, then run a normal feed and confirm adds, changes and removals apply with a per-row report.",
    dep: ["enrollment-service","directory-provisioning","term-and-schedule","audit-log"]
  },
  "sections-and-cohorts": {
    s: "Subdivides a course into sections or cohorts with their own roster, dates, graders and visibility, while sharing content.",
    d: "A section is a scoped group of enrollments within a course: separate meeting times, instructors, due dates and sometimes combined into one site with several others (cross-listing). Content and the gradebook are shared; dates and visibility can differ per section. Staff can be restricted to their section. It is hard because scope must be applied consistently across assignments, grades, discussions and messaging, and because cross-listing joins records from different registrar sections.",
    k: ["One course site for many sections vs one site per section: shared sites reduce duplication, and make section isolation a permission problem; separate sites isolate and double the maintenance.", "Section-specific due dates as overrides vs separate assignments: overrides keep one column in the gradebook, and make effective dates harder to follow."],
    p: ["A teaching assistant limited to one section sees learners from another through a discussion or export.", "Merging two sections mid-term duplicates a learner enrolled in both."],
    v: "Create two sections with different due dates and one restricted assistant each, and confirm each assistant sees only their section's learners in grades, discussions and exports, and due dates differ per section.",
    dep: ["enrollment-service","permission-model","assignment-engine","course-roles"]
  },
  "waitlists-and-capacity": {
    s: "Caps how many learners can join a section, queues the rest in order, and promotes people as seats open, with deadlines to accept.",
    d: "Each section has a seat limit. When it is full, requests join a waitlist ordered by time or priority. A freed seat triggers an offer to the next person with an expiry; if it lapses, the offer goes on. Holds and reserved seats for groups complicate counting. It is hard because seat counting must be exact under concurrent requests, because registrar systems own capacity in many institutions, and because fairness disputes are emotionally charged.",
    k: ["Atomic seat counting in the database vs advisory counts: atomic counts never oversell and serialize hot sections; advisory counts are fast and need cleanup.", "Automatic promotion vs manual: automatic is fair and prompt; manual lets staff apply priorities and delays learners."],
    p: ["Two simultaneous requests both take the last seat, because count and insert were separate steps.", "An expired offer is never passed on, so a seat stays empty while the waitlist grows."],
    v: "Fire 50 concurrent requests for 10 seats, and confirm exactly 10 enroll and 40 wait in order; drop one learner and confirm the first waiting person is offered the seat with an expiry.",
    dep: ["enrollment-service","notification-delivery","relational-store","scheduled-jobs"]
  },
  "term-and-schedule": {
    s: "Defines academic terms, their start and end dates, and the default availability, grading and archive dates of courses within them.",
    d: "A term sets the dates inside which courses are active: when instructors may prepare, when learners gain access, when submissions close and when courses become read-only. Courses inherit the dates, and sections or items may override them. Term changes move many things at once: access, calendars, notifications. It is hard because institutions run overlapping terms of different lengths, and because moving a term date in the middle of a term affects every dependent rule.",
    k: ["Course dates inherited from the term vs set per course: inheritance keeps a term consistent and makes late exceptions awkward; per-course dates are flexible and drift.", "Hard close at term end vs a grace period: a hard close protects records and blocks late legitimate work; a grace period is kind and keeps data mutable."],
    p: ["Changing a term end date silently extends access to hundreds of courses and nobody is told.", "Overlapping terms put a course in two terms, and its access follows whichever was read first."],
    v: "Shift a term's end date by a week, and confirm every inheriting course changes, courses with explicit overrides do not, and a report lists both groups.",
    dep: ["relational-store","scheduled-jobs"]
  },
  "course-roles": {
    s: "The roles a person can hold within a course, such as learner, instructor, assistant, designer or observer, each with its own permissions and visibility.",
    d: "A role is a named bundle of permissions applied in the scope of a course or section. Learners submit and view their own grades; instructors manage everything; assistants grade within their section; designers edit content without seeing grades; observers see a learner's progress read-only. Institutions define custom roles. It is hard because permissions must compose with account-level roles and sections, and because role names suggest meaning that the actual permission set may not match.",
    k: ["Fixed built-in roles vs fully configurable roles: fixed roles are easy to reason about and audit, while configurable roles fit local policy and invite dangerous combinations.", "Separate observer role vs sharing learner credentials: observer accounts give guardians visibility safely, and need their own enrollment and linking process."],
    p: ["A designer role that can edit quizzes can also change grades, because permissions were granted too broadly.", "An observer linked to the wrong learner sees someone else's grades."],
    v: "Assign each role to a test user in one course, and confirm a matrix of permissions, such as view grades, edit content and post announcements, matches the written role definition exactly.",
    dep: ["permission-model","relational-store"]
  },
  "learning-paths": {
    s: "Ordered or flexible sets of courses and activities that lead to a goal such as a program, onboarding or a professional certification.",
    d: "A path defines required and elective items, ordering rules, deadlines and the result of completion. Enrolling in a path enrolls the learner into each item as it becomes available. Progress aggregates from courses. Admins can assign paths to groups of employees by role or department and track completion. It is hard because a path spans courses with separate rules, because content changes under people mid-path, and because assignment rules must be re-evaluated when someone changes role.",
    k: ["Enrolling learners in all path courses up front vs as they unlock: up-front is simple and clutters; unlocking is tidy and requires an evaluator running as progress changes.", "Rule-based auto-assignment vs manual assignment: rules keep large populations current and surprise people with unexpected obligations."],
    p: ["A path references a retired course, so learners can never finish it.", "Auto-assignment rules re-run and assign duplicate paths to employees who already completed them."],
    v: "Assign a three-course path with an elective to a test group, complete two courses and the elective, and confirm path progress shows complete only after the required third item, and a role change updates assignment.",
    dep: ["completion-rules","enrollment-service","progress-tracker","release-conditions"]
  },
  "competency-framework": {
    s: "A structured set of skills or outcomes that courses and assessments are mapped to, so mastery can be tracked across contexts.",
    d: "Competencies are organized hierarchically and can be imported from standards bodies or authored. Assignments, quiz questions and rubric criteria align to them, and evidence of mastery accumulates with rules such as latest score, average or highest. Learners and advisers see a profile of mastery. It is hard because alignment takes sustained instructor effort, because rules for combining evidence are contested, and because the framework changes over time while old evidence must stay interpretable.",
    k: ["Mastery by most recent evidence vs average of all: most recent rewards growth and hides inconsistency; averaging is stable and penalizes early attempts.", "Imported standard framework vs locally authored: imported frameworks align with accreditation and may not match local courses; local ones fit and aren't comparable."],
    p: ["Alignments are never maintained after the first term, so mastery data reflects the old course design.", "Revising a competency invalidates the evidence already collected under its earlier meaning."],
    v: "Align one rubric criterion to a competency, grade three attempts, and confirm the learner's mastery profile shows the competency level computed by the configured rule, with each piece of evidence linked.",
    dep: ["rubric-builder","outcomes-reporting","relational-store","standards-and-versions"]
  },
  "completion-rules": {
    s: "Define what counts as finishing an item, module, course or path: viewed, scored above a threshold, all required items done, or a time spent.",
    d: "Each level has a rule composed from lower ones. A module may require all items; a course may require a passing grade and the capstone; a path may require three of five courses. The evaluator tests rules when progress or grades change and stores the result with a timestamp. Completion triggers certificates, access and notifications. It is hard because rules reference data that changes, because retroactive edits matter, and because completion events must fire exactly once.",
    k: ["Evaluating on change events vs on demand: events trigger actions promptly and risk missed or duplicated events; on-demand is simple and cannot trigger anything by itself.", "Time-spent criteria vs score criteria: time is easy to measure and meaningless as evidence; scores measure learning and need valid assessments."],
    p: ["A completion event fires twice and issues two certificates.", "A rule edited mid-term revokes completion from learners who already earned a certificate."],
    v: "Define a course as complete at 70 percent plus a capstone, score a learner 72 without the capstone, then submit it, and confirm completion triggers once, at the second step, with one timestamped record.",
    dep: ["progress-tracker","grade-calculation","relational-store","job-queue"]
  },
  "certificate-generation": {
    s: "Issues a verifiable document when a learner completes a course or program, with their name, date, title and a way to check authenticity.",
    d: "On a completion event the service fills a template with learner name, course, date, hours and a unique identifier, renders a document and stores it. A public verification page confirms the identifier, name and date. Templates are branded per organization and may carry signatures. It is hard because names must be correct and in the right script, because certificates are legal and compliance evidence, and because reissue and revocation after an error or fraud must be traceable.",
    k: ["Verification by public identifier page vs signed document alone: a public page enables checks by third parties and exposes some personal data; signed documents are private and harder to verify.", "Pre-rendered stored files vs rendered on request: stored files never change, and rendered documents follow template updates and can differ over time."],
    p: ["A name changed in the profile after issuing yields a certificate that no longer matches the record.", "A verification page reveals more personal information than the learner agreed to share."],
    v: "Complete a course, download the certificate, open its verification link as an anonymous visitor, and confirm it shows the name, course and date, and shows revoked after an administrator revokes it.",
    dep: ["completion-rules","file-storage","privacy-consent","transcript-records"]
  },
  "badge-issuing": {
    s: "Awards portable digital badges for skills or achievements, carrying metadata about criteria and evidence that learners can share elsewhere.",
    d: "A badge definition has an image, criteria and issuer. On meeting the criteria, the system creates an assertion tying the badge to the learner, with a date and optional evidence link, in an open, verifiable format. Learners place badges in a backpack or share links. Badges can expire or be revoked. It is hard because open formats leak identity if email is exposed, because criteria drift, and because the value of a badge depends on whether outsiders trust the issuer.",
    k: ["Hosted assertions verified by URL vs signed assertions: hosted verification is simple and depends on the issuer staying online; signing works offline and needs key management.", "Hashing the recipient identifier vs plain email: hashing limits harvesting and can be reversed for guessable addresses."],
    p: ["Badges awarded for attendance rather than demonstrated skill dilute the credential for everyone.", "Taking the issuer site down breaks every shared badge's verification."],
    v: "Earn a badge by meeting its criteria, share its link, and confirm an outside verifier sees the issuer, criteria and date, and that revoking it changes the link's result.",
    dep: ["completion-rules","certificate-generation","privacy-consent","standards-and-versions"]
  },
  "transcript-records": {
    s: "The permanent record of what each learner took, when, and with what result, kept for the institution or employer and available on request.",
    d: "The record collects completed courses, grades, credits, dates and credentials from final grades and completion events. It is read by learners, advisers and external parties through official transcripts, which are signed or sent through trusted channels. Corrections are controlled and logged. It is hard because it must outlive the courses and even the system, because it must be correct before it is official, and because disclosure to third parties needs consent.",
    k: ["Transcript as a separate immutable record vs a view over live course data: a separate record survives course deletion and needs reconciliation; a view is always consistent and is only as durable as the courses.", "Self-service downloads vs registrar-issued only: self-service is convenient and is hard to trust externally; issued transcripts are credible and slow."],
    p: ["Deleting a course for storage cost removes the evidence behind a transcript line.", "A late grade correction fails to reach the transcript, so it disagrees with the course."],
    v: "Finalize a course, request a transcript, then correct the grade, and confirm the transcript shows the correction with a dated entry and still includes the original change in history.",
    dep: ["final-grade-export","data-retention","audit-log","relational-store"]
  },
  "recertification": {
    s: "Tracks expiry of completions and credentials, reminds learners, and reassigns refresher training before a requirement lapses.",
    d: "Compliance training often expires after a period. Each completion carries an expiry date from its rule. A scheduler finds upcoming expiries, notifies learners and managers, and reassigns the course or an update module when due. Reports show who is overdue. It is hard because the due date depends on the old completion, because people are on leave or change roles, and because regulators ask for proof of status on any given past date.",
    k: ["Expiry counted from completion date vs from the previous due date: from completion drifts and is simple; from the due date keeps a fixed cycle and punishes early completion.", "Automatic reassignment vs manager approval: automatic keeps compliance up with less effort; approval allows exceptions and lets items slip."],
    p: ["A reminder sent only to the learner goes unseen while on leave, and the credential lapses.", "Changing the expiry period retroactively changes who appears compliant on past dates."],
    v: "Complete a one-year course, move the clock to 30 days before expiry, and confirm reminders go to the learner and manager, the course is reassigned, and a report shows status as of any past date.",
    dep: ["completion-rules","scheduled-jobs","notification-delivery","transcript-records"]
  },
  "tool-launch-protocol": {
    s: "A standard for embedding an external tool in a course: a signed launch message carrying who the user is, their role and the course context.",
    d: "The system acts as a platform; the external application is a tool. A launch is a browser redirect with a signed token containing the user's identifier, role, course and resource. The tool validates it, then shows its interface in a frame or window. Registration exchanges keys and endpoints, and can be per institution or per course. It is hard because of key rotation, cross-site cookie restrictions in frames, and the identity fields that must be shared minimally.",
    k: ["Sending names and emails in the launch vs opaque identifiers only: sending identity makes tools usable and spreads personal data; opaque identifiers protect privacy and prevent tools from showing names.", "Institution-wide tool registration vs per-course installation: institution-wide is easy to govern; per-course lets instructors adopt tools and bypasses privacy review."],
    p: ["Third-party cookies blocked in a frame make the tool fail to keep a session after launch.", "Reusing a launch token lets someone replay a stale link as the learner."],
    v: "Register a test tool, launch it as a learner and as an instructor, and confirm each sees the right role and course context, a replayed token is rejected, and no unrequested personal fields were sent.",
    dep: ["single-sign-on","standards-and-versions","privacy-consent","course-roles"]
  },
  "grade-passback": {
    s: "Lets an external tool send scores and comments back to the gradebook through a defined interface, tied to a specific line item.",
    d: "When a tool is launched from an assignment, the platform provides a line item address. The tool posts scores for a user, with a time and status, using a token scoped to that resource. The platform validates, stores the score and applies the same rules as any grade. It can also read the roster and existing results. It is hard because tools retry and send duplicates, because scoring scale and timestamps must be reconciled, and because a tool must never be able to write scores it does not own.",
    k: ["Tool-owned scores overwriting platform scores vs instructor-wins: overwrite keeps tool and gradebook in step; instructor-wins protects deliberate adjustments and tool results can be ignored.", "Per-score posting vs batch: per-score is immediate and chatty; batches suit large classes and delay feedback."],
    p: ["A tool retrying after a timeout posts the score twice, and late penalties count the later time.", "A tool with a broad token writes scores to assignments in other courses."],
    v: "Post a score from a tool for one learner, retry it, and confirm one grade results, an out-of-scope line item is rejected, and the gradebook shows the tool as the source.",
    dep: ["tool-launch-protocol","gradebook-grid","grade-calculation","authentication"]
  },
  "deep-linking": {
    s: "Lets an instructor choose content inside an external tool and place it in the course as a linked item, with a title and optional grading.",
    d: "From the editor or module builder, the platform launches the tool in a selection mode. The user picks resources, and the tool returns a signed message listing them with titles, URLs, optional line items and custom parameters. The platform creates items in the course. It is hard because selection results must be validated, because later launches must resolve the resource even after the tool changes, and because copying a course must carry the link to the same tool configuration.",
    k: ["Platform stores the returned link vs the tool resolves on launch: storing is fast and breaks when the tool moves content; resolving is flexible and relies on the tool.", "Creating gradebook columns automatically vs asking: automatic saves effort and clutters the gradebook with unwanted columns."],
    p: ["A copied course keeps links tied to the old course's tool context, so launches fail or show old data.", "Selected resource titles are rendered unsanitized and inject markup into the module list."],
    v: "Pick two resources from a tool inside the module builder, confirm both appear as items, copy the course, and confirm launching either item from the copy opens the right resource.",
    dep: ["tool-launch-protocol","module-sequencing","course-templates-and-copy","grade-passback"]
  },
  "rest-api": {
    s: "A documented web interface for reading and changing courses, users, enrollments, submissions and grades, secured with scoped tokens and rate limits.",
    d: "Resources are exposed over HTTP with JSON, paged lists, filtering and consistent errors. Authentication is by tokens with scopes tied to a user or an integration. Every call is authorized like a UI action. Rate limits protect shared capacity. Versioning controls change. It is hard because it exposes the same rules as the UI without letting callers bypass them, because bulk operations are common, and because breaking changes hurt institutions' own scripts.",
    k: ["Acting as a user via token vs service accounts with broad rights: user tokens inherit normal permissions and limits; service accounts are practical for sync and risky if leaked.", "Cursor paging vs offset paging: cursors are stable under changes and cannot jump; offsets are simple and skip or repeat rows when data changes."],
    p: ["An endpoint returns hidden grades because it checked course membership but not posting state.", "A script polling every learner's data exhausts the rate limit for the whole institution."],
    v: "Call the list endpoints as a learner token, an assistant token and an administrator token, and confirm each result matches what that user sees in the interface, and exceeding the rate limit returns a clear retry signal.",
    dep: ["authentication","permission-model","relational-store","standards-and-versions"]
  },
  "event-webhooks": {
    s: "Pushes notifications of events such as enrollment, submission or grade posted to subscribed external systems, signed and retried.",
    d: "Subscribers register an endpoint and event types. When events occur, the platform enqueues delivery with a signed body, sends it over HTTP, and retries with backoff on failure, then marks the endpoint unhealthy. Events carry identifiers, not full records, so receivers fetch current state. It is hard because delivery is at-least-once and unordered, because endpoints are slow or down, and because events are privacy-sensitive and must be filtered by the subscriber's rights.",
    k: ["Thin events with a fetch vs fat events with full payloads: thin events avoid leaking stale or excess data and cost an extra call; fat events are convenient and can disclose too much.", "At-least-once with idempotency keys vs best-effort: at-least-once is dependable and puts de-duplication on receivers; best-effort is simple and loses events."],
    p: ["Receivers process retried events twice and double-count enrollments.", "A permanently failing endpoint is retried forever and backs up the queue for everyone."],
    v: "Subscribe a test endpoint, post a grade, take the endpoint offline for a minute, and confirm the event is delivered once the endpoint returns, signed, with an identifier receivers can de-duplicate on.",
    dep: ["job-queue","authentication","rest-api","privacy-consent"]
  },
  "single-sign-on": {
    s: "Lets users sign in through the institution's identity provider using a federation standard, so one account reaches the whole system and linked tools.",
    d: "The system trusts an external identity provider through signed assertions or tokens. After authentication, it maps the asserted attributes to a local account, creating one on first sign-in if allowed, and starts a session. Logout may be single or local. Multiple providers per institution are common. It is hard because attribute mappings differ, because accounts must match existing ones by a stable key rather than a name, and because certificate and metadata expiry cause surprise outages.",
    k: ["Just-in-time account creation vs provisioning in advance: just-in-time is low-maintenance and creates accounts for anyone the provider vouches for; provisioning is controlled and requires a feed.", "Matching on email vs on a stable identifier: email is convenient and changes; identifiers are stable and require agreement with the provider."],
    p: ["An expired signing certificate locks every user out at once, usually at the start of a term.", "Matching by email links a new person to a former student's account."],
    v: "Sign in through a test identity provider as a new and an existing user, and confirm the existing account is matched by identifier, a new one is created per policy, and rotating the certificate does not interrupt service.",
    dep: ["authentication","directory-provisioning","account-hierarchy","standards-and-versions"]
  },
  "directory-provisioning": {
    s: "Creates, updates and deactivates user accounts from the institution's directory or student system, keeping identities and attributes current.",
    d: "A provisioning feed delivers people with identifiers, names, emails, affiliations and status. The service applies them to accounts, merges duplicates, and deactivates people who left. Standard schemas for user lifecycle exist for web-based provisioning. Accounts keep data after deactivation. It is hard because identity is messy: people have multiple roles, name changes, duplicate records and accounts at several institutions, and a wrong merge combines two people's records.",
    k: ["Automatic merge of duplicates vs manual review: automatic merging keeps data clean and risks combining two people; review is safe and slows onboarding.", "Deactivating on departure vs deleting: deactivation preserves records and access history; deletion limits retained personal data and loses grades."],
    p: ["Two students with the same name and birthday are merged, and each sees the other's grades.", "A provisioning error deactivates staff accounts during exams."],
    v: "Provision a new user, update their name, and deactivate them through a feed, and confirm the account is created, updated in place, loses access on deactivation and keeps its grades and history.",
    dep: ["account-hierarchy","audit-log","relational-store","data-retention"]
  },
  "plugin-framework": {
    s: "Lets institutions and vendors add features, question types, reports and integrations through defined extension points without changing the core.",
    d: "Plugins declare what they extend: a new activity type, a report, a block on the dashboard or an authentication method. The framework loads them, provides an API for data and permissions, and isolates failures. Versioning ties plugins to compatible core releases. It is hard because plugins run with a lot of trust, because upgrades break them in ways the core team cannot test, and because quality varies widely across a large ecosystem.",
    k: ["In-process plugins vs out-of-process extensions over a web interface: in-process plugins are powerful and fast and can crash or compromise the host; out-of-process are safer and limited.", "A stable extension API with deprecation cycles vs free access to internals: stability helps plugin authors and slows core change; open internals allow anything and break constantly."],
    p: ["A plugin written for the previous release fails silently after an upgrade, and a feature stops working.", "A plugin queries the database directly and bypasses permission checks."],
    v: "Install a test plugin adding a question type, use it in a quiz, then upgrade the core and confirm the plugin either runs or is disabled with a visible compatibility message, never failing silently.",
    dep: ["permission-model","rest-api","standards-and-versions","relational-store"]
  }
});
