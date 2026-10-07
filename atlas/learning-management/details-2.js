// Details for the learning management plate, part 2: gradebook, communication, content, media.
ATLAS.details("learning-management", {
  "gradebook-grid": {
    s: "The spreadsheet-like view of every learner against every graded item, where instructors read, enter and adjust scores and see the calculated totals.",
    d: "The grid loads learners as rows and graded items as columns, with cells showing raw scores, status (missing, late, excused) and computed totals. Edits write scores and trigger recalculation of affected totals. Filters by section, group and status keep it usable. It must display only what the viewer may see, so assistants limited to a section see only their learners. It is hard at scale: thousands of cells with live recalculation, concurrent graders and a need for keyboard speed.",
    k: ["Loading the full grid vs paged or virtualized rows: full loads feel instant for small classes but fail on large ones; virtualization scales and complicates editing and totals.", "Recalculating totals on edit vs on a schedule: immediate totals keep the view honest, but cost a recalculation per keystroke during bulk entry."],
    p: ["Two graders editing the same cell overwrite each other without warning.", "An assistant restricted to one section can still see other sections' scores through an export from the grid."],
    v: "Open a 2,000-learner gradebook, edit one cell as two graders, and confirm the grid renders within the target, the second edit is flagged as a conflict and the learner's total updates once.",
    dep: ["grade-calculation","permission-model","relational-store","grade-overrides"]
  },
  "grading-schemes": {
    s: "Maps numeric scores to letter grades, pass or fail, or other display scales, with institution defaults and per-course changes.",
    d: "A scheme is an ordered list of thresholds and labels, such as 90 to 100 for the top grade, or competency levels. It converts a percentage to its display and often to grade points for the transcript. Courses choose or define their own. The display and the stored value are separate: the numeric score stays the truth. Hard issues are boundary handling and rounding, since 89.5 may or may not be a higher grade, and changes to a scheme after grades are posted.",
    k: ["Computing the label on read vs storing it: computing keeps labels consistent with scheme edits, but a later change rewrites grades learners have already seen.", "Institution-wide scheme vs per-course schemes: a shared scheme gives comparable transcripts; per-course flexibility fits different assessment styles and complicates reporting."],
    p: ["Rounding performed twice, once in calculation and once in display, moves a learner across a grade boundary.", "Editing a scheme after posting silently changes grades learners were told."],
    v: "Set a scheme with a 90 threshold, enter scores 89.49, 89.5 and 90, and confirm each lands on the label the documented rounding rule specifies, and the same on export.",
    dep: ["grade-calculation","relational-store"]
  },
  "category-weighting": {
    s: "Groups graded items into categories such as homework or exams and combines them using weights, drop-lowest rules and caps.",
    d: "Each category has a weight, optional drop-lowest or drop-highest counts and caps on points. The total is computed from category percentages combined by weight, with unweighted alternatives that sum points. Weights must be renormalized when categories are empty or ungraded items are excluded. Common confusion arises when learners see a total that treats missing work as zero and one that ignores it, so rules for what counts must be explicit.",
    k: ["Weighted categories vs total points: weights express course priorities flexibly, but total points are easier for learners to verify by hand.", "Treating ungraded as zero vs excluding it: zero shows the worst case and discourages optimism; excluding shows progress so far and may overstate the final grade."],
    p: ["A category whose items are all ungraded still carries weight, which drags the total to a number nobody expects.", "Drop-lowest applied to differently scaled items drops the wrong one."],
    v: "Build a course with homework at 30 percent and exams at 70, drop the lowest homework, enter known scores, and confirm the total equals a hand-computed value with and without ungraded items.",
    dep: ["grade-calculation","gradebook-grid"]
  },
  "grade-calculation": {
    s: "The engine that turns individual scores, categories, schemes, overrides and late penalties into a learner's current and final grade, reproducibly.",
    d: "The calculator takes raw scores and statuses and applies, in a defined order: excused handling, late penalties, drops, category weights, caps and then the scheme. It produces current grade and final grade, and ideally an explanation that shows each step. Results are cached and recalculated when inputs change. Order of operations and rounding determine outcomes, so they must be fixed and documented. It is hard because every rule interacts, and because decisions must be reproducible years later for disputes.",
    k: ["Pure function recalculated on demand vs incrementally updated totals: a pure function is easy to reason about and test, while incremental updates are fast and risk drift.", "Rounding at each step vs only at the end: end-only rounding is mathematically cleaner; per-step rounding matches what learners can compute from displayed values."],
    p: ["A change in rule order after a term starts gives different grades for the same scores.", "The cached total is not invalidated when an override is added, so the learner sees a stale grade."],
    v: "Recompute the grades of a frozen set of 500 learners from raw scores and rules, and confirm every result equals the stored grade, with the explanation listing each step applied.",
    dep: ["category-weighting","grading-schemes","late-policies","grade-overrides","grade-integrity"]
  },
  "grade-overrides": {
    s: "Lets an instructor set an exception to a calculated score or grade, such as excusing an item or substituting a final grade, with a reason on record.",
    d: "An override replaces a computed value for one learner. Excusing removes an item from the calculation; a score override replaces the stored score; a final grade override replaces the course result. Each stores who made it, when, why and the value replaced, and is visible in history. Overrides must survive recalculation without being lost or quietly hiding later score changes. The difficulty is governance: they bypass the rules, so they need permissions and reporting.",
    k: ["Override stored separately from the score vs overwriting the score: separate storage preserves the computed value and the audit trail, but makes every view decide which one to show.", "Open override rights for instructors vs restricted to a registrar role: open rights are flexible; restriction fits high-stakes final grades and slows corrections."],
    p: ["An override entered as a plain score is lost when the assignment is regraded.", "Final grade overrides made without reason let inconsistent treatment pass unnoticed."],
    v: "Override one learner's final grade with a reason, change an input score, and confirm the override remains, the computed grade also changes, and history shows who, when and why.",
    dep: ["grade-integrity","permission-model","audit-log","relational-store"]
  },
  "late-policies": {
    s: "Rules for penalizing or accepting late work: grace periods, percentage deductions per day, caps, and automatic zeros for missing items.",
    d: "A policy applies when a submission's time passes the due time as adjusted by overrides. The deduction is computed from the elapsed time, in whole hours or days, and from the score before penalty, and is stored separately so it can be shown and reversed. Missing-submission policies fill in zeros at a deadline. It is hard because of time zones, daylight saving shifts, excused lateness and the order in which penalties meet other rules.",
    k: ["Deducting a percentage of the raw score vs of the maximum points: raw-score deduction is intuitive and shrinks the penalty for weak work; maximum-points is uniform and harsher.", "Automatic missing zeros vs leaving blank until instructors act: automatic rules enforce policy consistently and punish technical failures that no one reviewed."],
    p: ["A due time stored without a time zone applies the penalty an hour early for learners across a daylight shift.", "A penalty baked into the score cannot be removed when an extension is granted later."],
    v: "Submit at 1, 25 and 49 hours after the due time under a 10 percent per day policy, and confirm deductions of 10, 20 and 30 percent are shown separately from the raw score.",
    dep: ["time-zones-and-deadlines","assignment-engine","grade-calculation"]
  },
  "grade-posting": {
    s: "Controls when scores and feedback become visible to learners, per item, with scheduled release and the ability to retract.",
    d: "Grades are stored as draft until posted. Manual posting releases all graded scores for an item at once; automatic posting releases each as it is saved. Posting triggers notifications and updates learner views and calculated totals. Posting policies may differ by assignment or section. The hard parts are consistency and reversibility: partial release misleads learners, hidden grades must not appear in totals or analytics, and retracting a posted grade needs a record.",
    k: ["Manual release of all grades at once vs automatic per-grade release: manual avoids comparisons mid-grading, while automatic gives faster feedback.", "Totals that include only posted grades vs all grades: posted-only avoids leaking hidden scores and shows learners numbers that change as work posts."],
    p: ["Unposted grades leak through a notification, an API response or the calculated total.", "Retracting a grade after notifying learners leaves them with email evidence of a score that no longer exists."],
    v: "Grade ten submissions without posting, view as a learner, and confirm no score, total or notification appears; post, and confirm all ten appear and the total updates once.",
    dep: ["gradebook-grid","notification-delivery","permission-model","rest-api"]
  },
  "final-grade-export": {
    s: "Delivers final course grades to the registrar's system, with identifiers, term and section mapping, status and a record of what was sent.",
    d: "At term end an instructor or administrator finalizes grades, locking them or marking them as submitted. The export maps each learner and section to the registrar's identifiers and writes grades by file or through a standards-based interface, reporting errors per record. It records what was sent and when. It is hard because identifiers diverge between systems, late changes occur after the export, and the registrar's scale or code set differs from the course's.",
    k: ["Push on finalize vs scheduled pull by the registrar: push is timely and fails at the worst moment; pull lets the registrar control timing and adds delay.", "Locking grades after export vs allowing changes with reissue: locking prevents drift between systems, but forces a formal correction process for genuine mistakes."],
    p: ["A learner whose identifier does not match is silently skipped and gets no grade on the transcript.", "A change made after export leaves the course and the registrar showing different grades."],
    v: "Finalize a course of 40 learners with two unmapped identifiers, run the export, and confirm 38 succeed, two appear in an error report, and the sent values match the course's final grades.",
    dep: ["roster-sync","grade-passback","audit-log","grading-schemes"]
  },
  "discussion-boards": {
    s: "Threaded conversations within a course, graded or ungraded, with moderation, subscriptions and optional group scoping.",
    d: "Topics hold threaded replies with rich text and attachments. Instructors can require a first post before reading others', limit edits, pin and lock threads, and grade participation with a rubric. Scoped to sections or groups, each sees its own conversation. Learners subscribe to threads and receive digests. It is hard because of moderation, notification volume, deeply nested read tracking and keeping graded participation tied to the right posts after edits and deletions.",
    k: ["Post-before-reading rules vs open reading: they force original thinking and frustrate learners, who may not understand why replies are hidden.", "Threaded vs flat display: threading keeps topics organized and makes long conversations hard to follow; flat is easy to read and loses structure."],
    p: ["A deleted post that was graded leaves the learner's participation grade without evidence.", "Notifying on every reply produces so much mail that learners turn notifications off entirely."],
    v: "Create a graded topic with post-first required, view as a learner who has not posted, and confirm replies are hidden, then post once and confirm replies appear and the post counts toward the grade.",
    dep: ["notification-delivery","group-workspaces","rubric-builder","search-index"]
  },
  "direct-messaging": {
    s: "Private messages between people in the system, scoped to courses and roles, with limits that stop learners from messaging anyone they like.",
    d: "A message store holds conversations among participants with read state and attachments. Recipients are chosen through a directory restricted by course membership and role: learners may reach instructors and classmates but not the whole institution. Messages can be forwarded to external email and replies come back. It is hard because of abuse handling, retention of messages that are also records, and the pressure to add reach (bulk messaging) that conflicts with privacy.",
    k: ["Messages stored in the system vs relayed by email: stored messages are searchable and retained in the course context, while email is familiar and escapes the system's controls.", "Open recipient search vs course-scoped search: open search is convenient but allows unwanted contact; scoping protects learners and complicates cross-course work."],
    p: ["A learner searches the directory and finds every enrolled student's name, because scope was applied only on the send step.", "Bulk messages from instructors reach people removed from the course last week."],
    v: "As a learner, search for a recipient outside any shared course and confirm no match is returned; message an instructor, and confirm a copy and a read marker appear for both sides.",
    dep: ["permission-model","notification-delivery","data-retention","course-roles"]
  },
  "group-workspaces": {
    s: "Sets of learners with their own space for discussion, files and collaborative documents, formed by instructors, self-signup or random assignment.",
    d: "Groups are organized into sets that can be applied to assignments and discussions. Formation can be manual, random, by self-signup with capacity, or imported. Each group may get a private area with files, pages and a discussion board. Membership changes during a term must propagate to group assignments and grades. The difficulty is scope: a group is another permission boundary, so every feature must decide what group members see and how group grades are assigned.",
    k: ["Self-signup vs instructor assignment: self-signup builds ownership and leaves stragglers; assignment is balanced and feels imposed.", "Group grade shared by all vs individually adjusted: a shared grade is simple and fosters free-riding disputes; individual adjustment is fair and adds labor."],
    p: ["Moving a learner between groups after a group submission orphans the submission from the new group.", "A group's private files remain visible to a learner after they leave the group."],
    v: "Create two groups, submit a group assignment as one member, move a member between groups, and confirm both groups' access and the submission credit follow the documented rule.",
    dep: ["sections-and-cohorts","permission-model","assignment-engine","file-repository"]
  },
  "calendar-service": {
    s: "Shows due dates, events and office hours from all courses in one calendar, with feeds that external calendar apps can subscribe to.",
    d: "Events come from assignment dates, quiz windows, instructor-created events and scheduled live sessions, each tied to a course, section or learner. The service merges them with visibility checks and renders by time zone. A subscription feed exposes the same data over a standard calendar format with a private token. It is hard because dates change often and external clients cache, because overrides give different learners different dates, and because time zones and recurring events are a classic bug source.",
    k: ["Derived events computed from items vs stored calendar rows: derivation never goes stale, but is expensive to query; stored rows are fast and must be synchronized on every edit.", "Subscription feeds with long-lived tokens vs authenticated access only: tokens work in any calendar app but cannot be revoked per device and can leak."],
    p: ["A feed that includes hidden or unpublished assignments tells learners about work they should not see yet.", "An event set for midnight shows the wrong day for learners in other time zones."],
    v: "Subscribe an external calendar app to a learner's feed, change an assignment due date, and confirm the app shows the new date, the override for that learner and no unpublished items.",
    dep: ["time-zones-and-deadlines","assignment-engine","term-and-schedule","permission-model"]
  },
  "live-sessions": {
    s: "Schedules and launches real-time classes with video, chat and screen sharing, usually through an integrated conferencing tool, and records attendance.",
    d: "An instructor schedules a session, which creates a calendar event and a meeting with an external conferencing tool through a launch protocol. Learners join with a signed link carrying their identity and role. Attendance and recordings flow back as events and files. It is hard because the conferencing component is outside the system, so identity, permissions and recordings must be handed across a boundary, and recordings need storage, captions and retention like any other media.",
    k: ["Embedded conferencing tool vs links to a separate service: embedding gives a uniform experience and identity, at integration cost; links are simple and lose attendance and role control.", "Automatic recording vs opt-in: automatic recording guarantees a copy for absent learners, but raises consent and retention obligations."],
    p: ["A shared join link spreads outside the class because it carries no per-learner identity.", "Recordings land in storage without captions, so deaf learners cannot use them."],
    v: "Schedule a session, join as a learner, leave early, and confirm the calendar shows the event, attendance records join and leave times, and the recording appears in the media library with captions queued.",
    dep: ["tool-launch-protocol","calendar-service","media-library","captions-and-transcripts"]
  },
  "package-importer": {
    s: "Accepts a content package, validates its manifest, extracts files and turns its structure into course items that can be launched and tracked.",
    d: "The importer unpacks an archive, reads the manifest that describes organizations, resources and sequencing, and creates items pointing at the stored files. It validates against the format version, rewrites paths, and records the declared completion and scoring behavior for the runtime. Large packages are imported in the background. It is hard because real packages violate the specification in many ways, vendors differ on interpretation, and a package is third-party code that will run in the learner's browser.",
    k: ["Strict validation vs tolerant import: strict rejection protects quality but blocks content that works in practice; tolerance serves users and hides latent defects.", "Hosting extracted files on the same origin vs a separate origin: same-origin is simple, while a separate origin prevents package script from reaching the session."],
    p: ["A package with path traversal in its archive writes files outside its folder.", "A package that declares complete on launch fills the gradebook with false completions."],
    v: "Import a valid package and a malformed one, and confirm the first launches with the right structure and the second is rejected or flagged with the manifest error, and neither writes outside its folder.",
    dep: ["file-storage","job-queue","runtime-api-adapter","standards-and-versions"]
  },
  "runtime-api-adapter": {
    s: "A browser-side bridge that lets packaged content report location, score and completion to the system using a standard in-page scripting interface.",
    d: "Older package standards expect the content to find a known object in a parent window and call functions such as initialize, set value and commit. The adapter implements that object, keeps a local copy of the learner's data model, and sends changes to the server on commit and on unload. It resumes attempts using the saved state. It is hard because it must accept sloppy content, deal with frames and popups, and cope with page unloads that give no time to save.",
    k: ["Committing on every set vs on explicit commit: frequent commits lose less on a crash, but multiply network calls; batching is efficient and loses data if content never commits.", "Mapping the data model to the gradebook automatically vs by instructor choice: automatic is simple, but trusts scores that content self-reports."],
    p: ["Content that never calls terminate loses its last bookmark when the learner closes the tab.", "A self-reported score of 100 is accepted as a grade without any server-side check."],
    v: "Play a package, answer two questions, close the tab abruptly, reopen, and confirm it resumes at the last location with saved score and status stored on the server.",
    dep: ["content-viewer","progress-tracker","grade-passback","standards-and-versions"]
  },
  "activity-statement-store": {
    s: "A store for actor, verb and object statements describing what a learner did, sent by content and tools in a standard format and queried later.",
    d: "Content and tools post statements such as a learner completed an activity with a score, over a web interface secured with credentials. The store validates structure, assigns identifiers, keeps statements immutable and supports queries by actor, verb, object and time, plus aggregate state documents. It can sit inside the system or be a separate service. The difficulty is volume and meaning: free-form vocabularies lead to inconsistent data, and privacy rules apply to every statement.",
    k: ["Immutable statements with voiding vs editable records: immutability gives an honest history and needs a convention for corrections; edits are tidy and destroy evidence.", "Shared vocabulary profiles vs free-form verbs: profiles make data comparable, while free-form is easy to emit and hard to analyze."],
    p: ["Identifying learners by email in statements sent to a third-party store exposes personal data outside the institution.", "Different tools using different verbs for completion make reporting count some work twice."],
    v: "Send statements from two tools for one learner, query by actor, and confirm both appear unmodified; void one and confirm it is excluded from queries while remaining retrievable by identifier.",
    dep: ["rest-api","relational-store","analytics-warehouse","privacy-consent"]
  },
  "cartridge-exchange": {
    s: "Exports and imports a whole course in a portable format that carries structure, pages, assessments and links between systems.",
    d: "A course is serialized as a package with a manifest, resources and optional sections for question banks, discussion topics and tool links. Import reads it and creates native items, mapping what the target supports and reporting what it could not. The format versions differ in what they cover, and vendors add extensions. It is hard because the models never align exactly: rubrics, release conditions and grading rules are often lost, so a round trip is lossy and the loss must be reported.",
    k: ["Standard core plus vendor extensions vs standard only: extensions retain fidelity between like systems, but break portability; standard-only is portable and flattens features.", "Silent best-effort import vs a report of what was dropped: a report adds friction but lets instructors fix what the import lost."],
    p: ["An import drops quiz questions of an unsupported type without telling the instructor.", "Absolute links inside exported pages point at the old system after migration."],
    v: "Export a course with pages, a quiz and a discussion, import it into a clean instance, and confirm structure and content match, with a report listing each feature that could not be carried over.",
    dep: ["package-importer","question-bank","file-repository","standards-and-versions"]
  },
  "file-repository": {
    s: "Stores uploaded and generated files per user, course and group, with folders, quotas, permissions and links that survive moves and copies.",
    d: "Files are stored in object storage with metadata in the database: owner, context, path, type, size, checksum and visibility. References from content use identifiers, not paths, so moving or copying a file does not break pages. Access is checked on each download through short-lived signed addresses. Virus scanning and type checks run on upload. It is hard because storage grows without bound, duplicates multiply across course copies, and permission checks must hold on direct links.",
    k: ["Deduplicating by checksum vs storing each copy: deduplication saves large amounts across copied courses, but complicates deletion since many items share one object.", "Signed expiring links vs proxying every download: signed links offload bytes to storage and can be shared during their life; proxying controls access fully and costs bandwidth."],
    p: ["A file's direct address works for anyone, because only the listing page checked permissions.", "Deleting a course deletes files that copies still refer to."],
    v: "Upload a file, share its link with a learner outside the course, and confirm access is denied; use the link as an enrolled learner after expiry and confirm a fresh link is required.",
    dep: ["file-storage","permission-model","relational-store","job-queue"]
  },
  "content-versioning": {
    s: "Keeps prior versions of pages, questions, rubrics and files so edits can be reviewed and reverted, and so past work refers to what it was graded against.",
    d: "Editable objects have a version history: each save creates a revision with author, time and content, and learner work records the revision it was based on. Instructors can compare and restore. Some items are frozen once used in graded work. It is hard because history multiplies storage, because an old revision may reference deleted files, and because deciding which revision a learner saw, or was graded under, must be exact for disputes.",
    k: ["Revision on every save vs on publish: every save loses nothing and bloats history; publish-time revisions are tidy and lose draft states.", "Learner work pinned to a revision vs always showing current: pinning keeps records truthful but confuses learners shown outdated text; current text is simple and rewrites history."],
    p: ["Restoring an old page revision brings back links to files that have since been deleted.", "Unlimited revision history for large pages fills the database with near-identical copies."],
    v: "Edit a page three times, restore the first revision, and confirm the content and attached references match the first version, and that the history shows the restore as a new revision with its author.",
    dep: ["relational-store","file-repository"]
  },
  "content-library": {
    s: "A shared collection of reusable lessons, media and assessments that departments and publishers offer, with search, licensing and updates.",
    d: "Library items carry metadata describing subject, level, license and owner, and can be discovered by search and added to courses by reference or by copy. Referenced items update when the owner revises them; copied items do not. Publisher content may arrive through licensed access tied to enrollment. It is hard because of licensing and ownership, because reference versus copy semantics surprise instructors, and because retiring an item must not silently break the courses using it.",
    k: ["Linking to the library item vs copying it: linking propagates fixes and corrections, but changes content under a running course; copying is stable and drifts from the source.", "Open sharing vs reviewed contribution: open sharing grows the library fast and fills it with duplicates and errors; review gives quality at a cost in speed."],
    p: ["Retiring a shared item breaks every course that links to it, with no warning to their instructors.", "Licensed publisher material stays accessible to learners after the license period ends."],
    v: "Add one item by link and one by copy, update the source, and confirm the linked item changes and the copy does not; retire the source and confirm the course shows a clear notice.",
    dep: ["file-repository","search-index","content-versioning","permission-model"]
  },
  "video-ingest": {
    s: "Accepts large video uploads reliably from browsers and capture tools, validates them and registers them for processing.",
    d: "Uploads are split into chunks and sent directly to object storage, with resumable sessions so a dropped connection continues rather than restarting. When complete, a media record is created in a pending state and a processing job queued. The service checks type and size, scans for malware and applies quotas. It is hard because files are large and connections are poor, because uploads can come from many sources (browsers, apps, capture devices), and because abandoned partial uploads accumulate.",
    k: ["Direct-to-storage chunked upload vs through the application server: direct upload keeps large streams off the application and requires careful signed-permission handling; proxying is simpler and a bottleneck.", "Accepting any container format vs a limited list: accepting more serves users and increases processing surprises."],
    p: ["Partial uploads left in storage consume quota and cost with no record of owner.", "A user can upload an enormous file because the size limit was checked only in the browser."],
    v: "Upload a 2 GB file, drop the connection at 40 percent, resume, and confirm the file completes once, a single media record exists and server-side limits reject an oversized file.",
    dep: ["file-storage","job-queue","transcoding-pipeline","media-library"]
  },
  "transcoding-pipeline": {
    s: "Converts uploaded video and audio into several resolutions and bitrates, plus thumbnails and audio-only tracks, ready for adaptive delivery.",
    d: "A worker pulls a job, probes the source, and produces a ladder of renditions segmented for streaming, along with poster images and waveform data. Jobs are parallel and long-running, so they report progress and can be retried. Output goes to storage and is registered with the media record. It is hard because compute is heavy and bursty, with a term-start flood of uploads, because source files are unpredictable, and because failure must leave a recoverable state rather than a broken video.",
    k: ["Full ladder of renditions up front vs on demand: precomputing is predictable at playback and costs storage and compute for videos nobody watches; on demand saves cost and adds first-view delay.", "Dedicated worker pool vs shared with other jobs: dedicated workers protect other work from video floods and sit idle off-peak."],
    p: ["A source with variable frame rate produces renditions with audio drifting out of sync.", "Retrying a failed job writes duplicate renditions that the player then lists twice."],
    v: "Submit a video with unusual frame rate and a second-long audio gap, and confirm all renditions play in sync, a thumbnail exists, and a forced worker failure ends in a retry that produces exactly one set of outputs.",
    dep: ["job-queue","file-storage","video-ingest","adaptive-streaming"]
  },
  "adaptive-streaming": {
    s: "Delivers video as short segments at several qualities, with the player switching between them as bandwidth changes, served from edge caches.",
    d: "The player reads a manifest listing renditions, requests segments over HTTP and measures throughput to pick the next quality. Segments are cached at edge servers; access is controlled by signed, expiring addresses or tokens so that only enrolled learners can play. Captions load as separate tracks. It is hard because access control must work with caching, because mobile networks change rapidly, and because analytics about what was watched must come from the player.",
    k: ["Signed segment URLs vs cookie or token checks at the edge: signing is simple and spreads to unauthorized users within its lifetime; edge checks are tighter and require edge logic.", "Aggressive quality switching vs conservative: aggressive switching maximizes quality and causes visible oscillation; conservative is smooth and may look worse than the connection allows."],
    p: ["Manifest URLs shared outside the course keep working because tokens never expire.", "A player without a lower rendition stalls on poor connections instead of degrading."],
    v: "Play a video while throttling the network, and confirm the player drops to a lower rendition without stalling, captions stay in sync, and an expired token receives a denial.",
    dep: ["transcoding-pipeline","file-storage","permission-model","captions-and-transcripts"]
  },
  "lecture-capture": {
    s: "Records classroom or desktop sessions on a schedule, combining camera, audio and slides, and publishes them to the right course automatically.",
    d: "Capture agents in rooms or on laptops are scheduled against the timetable. They record multiple sources, upload them, and the system matches each recording to a course and section using the schedule, then publishes under the instructor's rules. Recordings are processed for streaming and captioned. It is hard because of the physical world: devices fail, rooms change, and a recording with the wrong course attached publishes a lecture, or a private conversation, to the wrong audience.",
    k: ["Automatic publish after capture vs instructor review first: automatic is timely, but can publish mistakes or private moments; review delays access and protects instructors.", "Schedule-driven matching vs instructor-triggered recording: scheduling is hands-off and breaks when rooms change; manual start is reliable and depends on people remembering."],
    p: ["A recording is attached to the previous course in the room because the schedule was stale.", "A failed capture goes unnoticed until learners ask for the missing lecture."],
    v: "Record a scheduled session in a test room, and confirm it appears in the correct course within the target time, with captions queued and the instructor's visibility setting applied.",
    dep: ["video-ingest","term-and-schedule","media-library","captions-and-transcripts"]
  },
  "interactive-video": {
    s: "Adds questions, bookmarks and notes to video so that viewing can be assessed and tracked beyond play and pause.",
    d: "An author places interactions at timestamps: a question that pauses playback, a chapter marker, a note or a branching choice. Learner responses are saved, scored and sent to the gradebook, and viewing events record how much was actually watched. Rules can require correct answers before continuing. It is hard because player events are unreliable, seeking can skip content, and score reporting from client code can be forged.",
    k: ["Blocking questions that must be answered vs optional prompts: blocking ensures engagement and annoys; optional is gentle and gets ignored.", "Trusting client-reported watch time vs server-side segment accounting: client reports are simple and easily gamed; server accounting costs more and is harder to fake."],
    p: ["Learners seek past all questions and receive full credit, because completion counted a final timestamp reached.", "Re-encoding a video shifts timestamps and strands interactions on the wrong moment."],
    v: "Add three questions to a video, watch while skipping to the end, and confirm completion is not granted, and that answering them records scores that appear in the gradebook.",
    dep: ["adaptive-streaming","quiz-engine","activity-event-capture","grade-passback"]
  },
  "media-library": {
    s: "The catalog of an institution's or user's audio and video, with metadata, search, captions, sharing rules and embedding in courses.",
    d: "Each media item stores renditions, thumbnails, captions, owner, tags, visibility and usage across courses. Instructors search and embed items without copying them. Usage tracking shows where an item appears, so deletion is safe. Permissions can be per user, course or public. It is hard because storage cost grows fast, because ownership changes when instructors leave, and because embedding must respect enrollment while staying cacheable.",
    k: ["Central library with course embedding by reference vs files inside each course: reference shares storage and updates; per-course files are isolated and costly to store.", "Retention by age vs by usage: age-based cleanup is simple and deletes needed reference material; usage-based is accurate and needs reliable tracking."],
    p: ["An instructor leaves and their media becomes ownerless, so nobody can fix captions or delete it.", "Deleting an item used in an active course turns pages into broken video frames."],
    v: "Embed one item in two courses, search for it by caption text, delete it, and confirm the library warns about both usages and, after removal, both courses show an explicit unavailable notice.",
    dep: ["adaptive-streaming","captions-and-transcripts","search-index","permission-model"]
  }
});
