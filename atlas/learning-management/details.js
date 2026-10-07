// Details for the learning management plate, part 1: learner experience, authoring, assessment.
ATLAS.details("learning-management", {
  "learner-dashboard": {
    s: "The learner's landing page: upcoming work across every enrolled course, recent grades, announcements and a way back into whatever they were doing last.",
    d: "The dashboard queries many courses at once and merges their due items, new grades and unread messages into one ordered list. It reads from per-course services or a denormalized summary table, filtered by the learner's enrollments and each item's visibility rules. Because it is the first page after sign-in, it is the heaviest read in the system on the first morning of a term. The difficulty is correctness at scale: a hidden assignment or an unposted grade must never leak into this aggregate view.",
    k: ["Live aggregation per request vs a precomputed summary: live data is always fresh but multiplies queries by course count; summaries are fast but can show stale or since-hidden items.", "One merged to-do list vs per-course cards: a merged list serves deadlines best, while cards preserve course context but bury urgent items."],
    p: ["A summary that ignores release conditions shows learners work they cannot yet open, or titles of hidden items.", "Learners enrolled in a hundred sections time out the dashboard because it queries each course serially."],
    v: "Enroll a test learner in 30 courses with mixed hidden and visible assignments, load the dashboard, and confirm only visible items appear, sorted by due date, within the latency target.",
    dep: ["course-home","permission-model","relational-store","calendar-service"]
  },
  "course-home": {
    s: "The entry page for a single course: its syllabus or landing content, the module list, announcements and links to tools, shaped by the viewer's role.",
    d: "The course home composes a layout chosen by the instructor, such as modules, a syllabus, a recent-activity feed or a custom page. Each block is rendered after checking the viewer's course role and each item's publish state, dates and restrictions. Navigation entries for tools such as grades or discussions are shown only if enabled for the course. It is hard because the same URL must render differently for learners, instructors, observers and unpublished-course previews without leaking draft material.",
    k: ["Instructor-chosen home layouts vs a fixed layout: flexibility suits varied teaching styles, but inconsistent navigation across courses raises support load for learners.", "Hiding disabled tools vs showing them as unavailable: hiding is cleaner but leaves users unsure why a tool they heard about is missing."],
    p: ["Unpublished course content appears in a preview mode that learners can reach by guessing a URL.", "Custom home pages with embedded scripts or heavy media make the most visited page slow."],
    v: "Open the same course as learner, instructor and observer, and confirm each sees exactly the blocks and navigation their role allows, with draft items visible only to instructors.",
    dep: ["module-navigator","course-roles","permission-model","course-builder"]
  },
  "module-navigator": {
    s: "Presents a course's ordered units and their items, and applies sequencing and release rules so learners see where they are and what comes next.",
    d: "Modules are an ordered tree of items: pages, files, assignments, quizzes, links and external tools. The navigator loads the tree, evaluates each item's publish state and release conditions for the viewer, and marks completion from the progress tracker. Previous and next controls follow instructor-defined order, skipping hidden items. Large courses make the tree expensive to evaluate per learner, and edits during a term must not renumber or break links learners already have.",
    k: ["Strictly linear navigation vs open browsing: linear paths enforce pedagogy and make progress meaningful, but frustrate learners who want to review or skip ahead.", "Evaluating conditions on every page view vs caching per learner: live evaluation is always right but expensive; caches go stale when grades or dates change."],
    p: ["Reordering items mid-term changes what the next button does, and learners lose their place.", "A deleted item leaves dangling links in modules and pages with no explanation to the learner."],
    v: "Build a three-module course with one locked item, walk it as a learner using only next and previous, and confirm the locked item is skipped or explained and completion marks update.",
    dep: ["module-sequencing","release-conditions","progress-tracker","content-viewer"]
  },
  "content-viewer": {
    s: "Renders a content item inside the course frame: pages, documents, embedded media or an external tool, with consistent controls and tracking.",
    d: "The viewer picks a renderer by item type. Pages render sanitized rich text; documents convert to a browser-viewable form; media goes to the player; packaged content and external tools load in an isolated frame. It records views and time on page as events. The difficulty is isolation and compatibility: third-party content runs script, so frames need sandbox attributes and message channels, while old content expects behaviors browsers no longer permit.",
    k: ["Rendering foreign content in a sandboxed frame vs inline: the sandbox contains hostile or buggy script, but breaks features that need the parent page, such as full-screen or cross-frame messaging.", "Server-side document conversion vs the browser's native viewer: conversion gives uniform results but costs compute and can distort layout."],
    p: ["Unsanitized instructor-authored markup lets one user run script in other learners' sessions.", "A tracked frame that loses its connection mid-lesson silently discards the learner's progress."],
    v: "Open a page, a document, a video and a packaged lesson in one course and confirm each renders in its frame, a script in the page body does not execute, and a view event appears for each.",
    dep: ["package-importer","runtime-api-adapter","adaptive-streaming","activity-event-capture"]
  },
  "progress-tracker": {
    s: "Records which items each learner has viewed, submitted or completed, and turns those records into the progress indicators learners and instructors see.",
    d: "Completion comes from rules attached to items: viewed, marked done, submitted, scored above a threshold or reported complete by a package. The tracker stores one state per learner per item and recomputes module and course percentages when states change. Several writers update it: the viewer, the grading path and external content. That makes ordering the problem, because a late event must not undo a completion, and instructors changing a rule mid-term force a recomputation across everyone.",
    k: ["Storing item states and deriving percentages vs storing percentages: derived values stay consistent after rule changes but cost a recomputation; stored values are fast and drift.", "Learner self-marking vs system-detected completion: self-marking is simple and easily gamed; detection is trustworthy only where content can report it."],
    p: ["Changing a completion rule after the term starts silently moves learners from complete to incomplete.", "Out-of-order events from a mobile client overwrite a newer state with an older one."],
    v: "Complete three of five items with different rule types, change one rule, and confirm each learner's percentage matches a hand calculation both before and after recomputation.",
    dep: ["completion-rules","relational-store","activity-event-capture","enrollment-service"]
  },
  "mobile-and-offline": {
    s: "Native or progressive apps that give learners access on phones and tablets, including cached content and queued submissions when the connection is poor.",
    d: "The client authenticates, then syncs a bounded set of courses: item metadata, text, downloadable files and queued actions. Reads come from a local store; writes such as discussion posts or draft answers are queued and replayed with idempotency keys. Push notifications bring learners back. The difficulty is conflict and trust: a quiz taken offline cannot be allowed to bypass time limits, and a learner's cached copy may outlive a permission change or a withdrawn item.",
    k: ["Offline writes with later sync vs online-only actions: queuing serves poor connectivity, but conflicts and rule checks (deadlines, attempts) must be resolved after the fact.", "Full course download vs on-demand streaming: downloads work without signal but use storage and cache content the institution may need to revoke."],
    p: ["A submission made offline just before a deadline syncs after it, and the system cannot say which time to trust.", "Cached content stays readable after a learner is dropped from the course."],
    v: "Download a course, switch the device to airplane mode, read a page, queue a discussion reply, reconnect, and confirm the reply appears once, with the original timestamp recorded.",
    dep: ["rest-api","single-sign-on","content-viewer","notification-delivery"]
  },
  "course-builder": {
    s: "The instructor's workspace for creating a course shell, enabling tools, setting dates and arranging items before and during a term.",
    d: "The builder manages the course's settings, navigation, dates, grading options and enabled features, and links to editors for pages, assignments and quizzes. Changes can be draft or published, and some apply immediately to enrolled learners. It reads and writes the same data learners see, so every edit has a visibility consequence. Concurrent editing by co-instructors and assistants, and the interplay of settings such as term dates versus assignment dates, make it deceptively complex.",
    k: ["Draft and publish states per item vs immediate edits: staged changes protect learners from half-finished material, at the cost of instructors forgetting to publish.", "Course-level date defaults vs per-item dates: defaults make term setup fast, but overrides create schedules nobody can explain."],
    p: ["An instructor edits a live assignment's points and every submitted grade silently changes meaning.", "Two co-instructors save over each other because the editor has no conflict detection."],
    v: "Create a course, publish one item and leave one draft, add a learner, and confirm the learner sees only the published item; edit as two instructors at once and confirm the second save is flagged.",
    dep: ["module-sequencing","rich-content-editor","permission-model","relational-store"]
  },
  "module-sequencing": {
    s: "Defines the order of units and items in a course and the rules about the order in which learners may move through them.",
    d: "Sequence is stored as an ordered tree with explicit positions, plus optional prerequisites between items or modules. Instructors drag items to reorder; the service rewrites positions atomically and keeps links stable by using item identifiers rather than positions. Required items, ordered completion and mastery paths are layered on top as rules. Reordering a populated course is hard because learners hold partial progress, and a change to prerequisites can strand learners who no longer meet them.",
    k: ["Explicit position fields vs fractional or linked-list ordering: explicit positions are easy to read and rewrite whole lists on each move; fractional keys cut writes but need occasional rebalancing.", "Rules on items vs rules on modules: item rules are precise but numerous; module rules are easier to explain but coarse."],
    p: ["Reordering concurrently from two sessions produces duplicate or missing positions.", "Adding a prerequisite after learners passed the item strands those already past it."],
    v: "Reorder five items from two browser sessions at once and confirm the stored order is a valid permutation with no duplicates, and that item links still resolve.",
    dep: ["release-conditions","relational-store"]
  },
  "rich-content-editor": {
    s: "A browser editor for instructors to write pages, instructions and feedback with formatting, images, math, links and embedded media.",
    d: "The editor produces structured markup that the server sanitizes against an allowlist of elements and attributes before storing. It supports pasting from word processors, equation entry, embedded media from the library and links to other course items by identifier. Output must be accessible: headings, alt text and table headers. It is hard because pasted markup is messy, because the same content is rendered in many places, and because every convenience feature widens the injection surface.",
    k: ["Allowlist sanitization on save vs on render: sanitizing on save stores clean data cheaply but cannot protect against later rule changes; on render is safer but costs time.", "Stored markup vs a structured document model: markup is simple and portable, while structure allows reliable transformation but demands conversion tooling."],
    p: ["Pasting from a word processor brings hidden styles and empty headings that break accessibility.", "Links by URL instead of identifier break whenever a course is copied."],
    v: "Paste content with inline script, nested tables and an image missing alt text, save, and confirm the script is removed, the markup is valid and the accessibility checker flags the image.",
    dep: ["accessibility-checker","media-library","file-repository","semantic-markup"]
  },
  "course-templates-and-copy": {
    s: "Copies a course or a template into a new shell for the next term, remapping internal links and dates while leaving out people and their work.",
    d: "A copy job walks the course's items and settings, creates new records and builds a map from old identifiers to new ones. Links inside pages, module items, rubrics and quiz references are rewritten through that map. Dates shift by an offset. Learner submissions, grades and enrollments are excluded. It runs as a background job because large courses take minutes, and it fails in ways that matter: partial copies, items pointing back at the source course, and settings that do not copy.",
    k: ["Selective copy with an identifier map vs a raw database clone: mapping lets you choose items and avoid carrying learner data, but every reference type must be handled explicitly.", "Shifting all dates by one offset vs resetting them: shifting keeps relative schedules, but term breaks and holidays land on wrong days."],
    p: ["A link to the source course's file survives the copy, so deleting the old course breaks the new one.", "A copy that fails halfway leaves a visible, half-populated course that instructors publish."],
    v: "Copy a course containing quizzes, rubrics and cross-links, delete the source, and confirm every link and reference in the copy resolves, no learner data is present and dates are offset.",
    dep: ["job-queue","file-repository","question-bank","rubric-builder"]
  },
  "question-bank": {
    s: "A reusable store of questions with their answers, tags and statistics, from which quizzes draw fixed or random sets.",
    d: "Questions are stored with type, text, answer keys, feedback, tags and difficulty, and can be shared at course, department or institution level. Quizzes reference questions or draw random subsets by tag. Editing a question that is already used raises the question of whether past attempts change. Item statistics, such as how many learners got it right, feed back into revision. Hard parts are versioning, permission to share, and keeping answer keys from reaching learners.",
    k: ["Quizzes referencing bank questions vs copying them in: references allow central fixes, but a later edit changes what past learners were asked; copies freeze history and diverge.", "Random draw by tag vs fixed order: random draws reduce sharing of answers but make exams unequal in difficulty."],
    p: ["Editing a correct answer mid-exam changes the key for learners already finished and produces inconsistent scores.", "Exporting a bank with answers to the wrong audience leaks the whole exam."],
    v: "Edit a question after 50 attempts exist and confirm earlier attempts still show the text and key they were graded against, while new attempts use the revised version.",
    dep: ["content-versioning","question-types","permission-model","relational-store"]
  },
  "rubric-builder": {
    s: "Lets instructors define criteria, performance levels and point values that graders apply to assignments, and learners see before they submit.",
    d: "A rubric is a table of criteria, each with levels, descriptions and points, optionally with ranges or weights. It is attached to assignments, discussions or outcomes. Graders select a level per criterion and may add comments; the total becomes the score. Rubrics can be shared and reused. The complexity is in how they interact with scoring: whether points are rubric-derived or free, how a changed rubric affects graded work, and how criteria map to outcomes.",
    k: ["Rubric-derived scores vs free-form scores with rubric as guidance: derived scores are consistent and auditable, while free scores let graders account for the whole work at a cost to consistency.", "Editable rubrics after use vs locked once graded: editing lets instructors fix errors but changes the basis of existing grades."],
    p: ["Changing point values on a used rubric leaves old scores that no longer add up.", "A rubric with ranges lets two graders interpret one level differently."],
    v: "Grade three submissions with a four-criterion rubric, then view them as learner and instructor, and confirm criterion selections, comments and the summed score match across both views.",
    dep: ["content-versioning","relational-store"]
  },
  "release-conditions": {
    s: "Rules that make an item available only after a date, a prior completion, a score or group membership, evaluated per learner.",
    d: "A condition set is attached to a module item or module: available from a date, after finishing another item, with at least a given score, or for a specific section or group. The evaluator takes learner state from progress and grades, and returns available, locked with reason, or hidden. Conditions can be combined and nested. They are hard because they depend on data that changes, because evaluation happens on many pages, and because circular rules lock everyone out.",
    k: ["Locked-with-reason vs fully hidden: showing the lock explains the path to learners, but reveals titles and structure of material meant to stay secret.", "Evaluating at view time vs precomputing on state change: view-time is always accurate; precomputing is fast but requires reliable invalidation."],
    p: ["Two items that each require the other make both permanently unavailable, and nothing detects it.", "A conditional item that is hidden from learners still appears in their calendar or notifications."],
    v: "Set an item to require 80 percent on a quiz, score a learner 75, then 85, and confirm it stays locked with the reason and unlocks right after the second score posts.",
    dep: ["progress-tracker","grade-calculation","sections-and-cohorts","term-and-schedule"]
  },
  "assignment-engine": {
    s: "Defines assignments, their dates, submission types, points and attempt rules, and manages the lifecycle from published work to graded result.",
    d: "An assignment holds instructions, a submission type (file, text, link, media, none), points, dates for availability, due and close, group settings and a grading method. It creates a submission slot for each learner or group, and per-learner overrides alter dates or attempts. The engine mediates between learners, graders and the gradebook. It is hard because overrides, extensions and group work multiply the cases that deadline and score logic must handle.",
    k: ["Per-learner overrides on one assignment vs separate copies: overrides keep one gradebook column and one set of instructions, but make effective dates harder to audit.", "Individual vs group submission: group work reflects real tasks, but makes grading attribution and late rules contested."],
    p: ["An extension set for one learner is applied to a section because overrides were keyed to the wrong scope.", "Changing the submission type after submissions exist hides or invalidates the work already handed in."],
    v: "Create an assignment with an override giving one learner two extra days, then submit as both learners after the base due date, and confirm only the overridden learner is marked on time.",
    dep: ["submission-handling","late-policies","sections-and-cohorts","relational-store"]
  },
  "submission-handling": {
    s: "Receives learner work as files, text or media, stores it immutably with a timestamp and receipt, and tracks attempts.",
    d: "Uploads stream into object storage with size and type checks, then a submission record is created linking the files, attempt number, learner or group, and server time. A receipt is shown to the learner. Later resubmission creates a new attempt without overwriting the earlier one. Background jobs scan files, extract text and queue similarity checks. The hard part is the deadline hour: thousands of concurrent uploads, flaky networks, and disputes that turn on a timestamp.",
    k: ["Server-side timestamp at upload completion vs at upload start: completion is simple but penalizes slow connections; start-time recording favors learners, and demands a trustworthy record of it.", "Immutable attempts vs overwrite: immutability supports disputes and history at the cost of more storage and a rule for which attempt counts."],
    p: ["A large upload that fails at 99 percent right at the deadline leaves no submission and no evidence.", "File names with unusual characters break downloads or collide in bulk export for graders."],
    v: "Upload a file, then lose the connection partway through a second one, and confirm the first has a receipt, the second has no submission, and the learner sees a clear error and both server times.",
    dep: ["file-storage","assignment-engine","job-queue","time-zones-and-deadlines"]
  },
  "similarity-check": {
    s: "Compares submitted text against other submissions and external sources to flag overlap for instructor review.",
    d: "After a submission is stored, a job extracts text and sends it, or a fingerprint of it, to an internal index or an external comparison service. The service returns matched passages and a percentage. Results attach to the submission as a report for the instructor, not a verdict. Privacy and rights are the hard issues: sending student work outside the institution needs consent and contract terms, and quoted or cited material produces false flags that need instructor judgment.",
    k: ["External comparison service vs an in-house index: external services have large corpora, but send student work to a third party; in-house is private but limited to your own submissions.", "Showing the score to learners vs instructors only: learner visibility enables self-correction, but invites gaming of a single percentage."],
    p: ["Treating the overlap percentage as proof misjudges properly quoted or boilerplate text.", "Repeatedly rerunning the check on resubmissions exhausts an external quota before the deadline passes."],
    v: "Submit two documents sharing a known paragraph, and confirm the report highlights exactly that passage with a link to the matching submission, visible to the instructor only.",
    dep: ["submission-handling","job-queue","privacy-consent","tool-launch-protocol"]
  },
  "quiz-engine": {
    s: "Runs timed or untimed quizzes: selecting questions, enforcing attempt limits and time, saving answers continuously and submitting for grading.",
    d: "A quiz attempt is created when a learner starts, drawing a fixed or random question set from the bank and recording a start time and deadline. Answers are saved as the learner goes, so a crash does not lose them. At submit or timeout, the attempt is closed and handed to grading. Accommodations alter time and attempts per learner. It is hard because many learners start at the same instant, and because time rules must hold even when the client clock or connection does not.",
    k: ["Server-enforced timers vs client timers: server enforcement is trustworthy but complicates connection loss; client timers feel smooth and can be tampered with.", "Autosave on every answer vs on submit: autosave survives crashes but multiplies write load at the worst moment."],
    p: ["A learner's laptop sleeps mid-exam and the clock keeps running with no autosaved answers.", "All learners starting at the scheduled hour overwhelm the service, so the first questions fail to load."],
    v: "Start a 10-minute quiz, answer half the questions, close the browser, reopen after two minutes, and confirm answers are restored and the remaining time reflects the elapsed server time.",
    dep: ["question-bank","question-types","accommodations-engine","relational-store","auto-grading"]
  },
  "question-types": {
    s: "The set of question formats a quiz supports, each with its own display, answer capture and scoring rules.",
    d: "Common types are multiple choice, multiple answer, true or false, short text, numeric with tolerance, matching, ordering, fill-in-the-blank, formula with generated values, and essay. Each type defines how it renders, what the learner's response looks like, how it is scored automatically and whether it needs a human. A plugin point lets institutions add types. The difficulty is partial credit, answer normalization and accessibility of interactive types such as drag and drop.",
    k: ["Many specialized types vs few general ones: specialized types score precisely and render well, but multiply code and accessibility work; general types are simple and make scoring ambiguous.", "Strict string matching vs normalized or pattern matching: normalization forgives case and spacing, but may accept answers the instructor considers wrong."],
    p: ["A numeric question without a tolerance marks a correct rounded answer wrong.", "A drag-and-drop type with no keyboard path locks out learners who cannot use a pointer."],
    v: "Answer each supported type with a correct, a partially correct and a wrong response, and confirm each is scored as designed, and that every type can be completed using only a keyboard.",
    dep: ["keyboard-and-focus","plugin-framework"]
  },
  "auto-grading": {
    s: "Scores objective answers and, for code or structured tasks, runs checks automatically and records the score, feedback and the rule applied.",
    d: "On submission, the grader compares responses with keys using each type's scoring rule, applies partial credit and penalties, and writes a per-question and total score. For programming or file-based tasks, an isolated runner executes tests against the submission with resource and time limits and returns results. Scores flow to the gradebook. It is hard because keys change after the fact, because runners must contain untrusted code, and because regrading must be repeatable and explain what changed.",
    k: ["Immediate scoring vs deferred release: immediate feedback aids learning, but reveals answers to learners still waiting to take the exam.", "Regrade by rerunning with the new key vs adjusting scores directly: rerunning is consistent and traceable, while direct adjustment is quick and loses the reason."],
    p: ["A submitted program that loops forever or reads other learners' files, because the runner was not isolated.", "A corrected answer key regrades some attempts and not others, and no one can say which."],
    v: "Submit an attempt, correct one answer key, run a regrade, and confirm affected scores change, unaffected ones do not, and the history shows the old and new score with the reason.",
    dep: ["quiz-engine","question-types","grade-calculation","job-queue"]
  },
  "rubric-grading": {
    s: "The grader's interface for scoring submissions against a rubric, with inline annotation, comments and media feedback.",
    d: "Graders open a submission beside its rubric, mark criteria, annotate the document in place and add comments, sometimes audio or video. Work can be assigned to graders by section or anonymized so identity is hidden. Draft grades stay private until posted. Moderation workflows can have a second grader review. It is hard because grading is high-volume and repetitive, so speed matters, and because annotations must render consistently on documents converted from many formats.",
    k: ["Anonymous grading vs named grading: anonymity reduces bias, but blocks accommodation context and makes follow-up with the learner indirect.", "Single grader vs moderated double marking: moderation improves fairness for high-stakes work and doubles the labor."],
    p: ["Grader comments saved as drafts are visible to learners because the posting state was not checked.", "An annotation layer is anchored to page coordinates, then drifts when the document is reconverted."],
    v: "Grade a submission anonymously with one annotation and one rubric comment, post it, and confirm the learner sees the annotation, comment and score, while the grader's identity rules are respected.",
    dep: ["rubric-builder","submission-handling","grade-posting","file-storage"]
  },
  "peer-review": {
    s: "Assigns learners to review each other's work using a shared rubric, collects the reviews and feeds them into grades.",
    d: "After a submission deadline, the allocator assigns each learner a number of peers, balancing load and avoiding self or friend pairs and keeping reviewers anonymous. Reviewers complete rubrics by a review deadline. The system may weight scores, detect outliers and let instructors adjust. Reviewing counts as its own graded work. It is hard because assignments must be fair when learners drop or skip, and because abusive or lazy reviews need detection.",
    k: ["Random allocation vs instructor-curated pairing: random is cheap and fair on average, but can pair weak reviewers with the hardest submissions.", "Averaging peer scores vs treating them as advisory: averaging scales to large classes, while advisory scores keep accountability with the instructor at more cost."],
    p: ["A learner who never submits leaves reviewers with nothing to review and their own tasks unmet.", "A review that reveals the author's name breaks the anonymity the design promised."],
    v: "Run a peer round with ten learners, three reviews each, where two skip submitting, and confirm everyone still receives three reviews, no one reviews their own work, and reviewers stay anonymous.",
    dep: ["assignment-engine","rubric-builder","grade-calculation","job-queue"]
  },
  "proctoring-hooks": {
    s: "Extension points that let a quiz require a secure browser, identity check or monitoring service before and during an exam.",
    d: "A quiz can require a lock-down client, flagged by request headers or a launch token, or launch an external proctoring tool before the attempt begins. During the attempt, events such as focus loss or copy are sent to the quiz engine and to the monitoring service, which returns flags afterward. Instructors review flags with evidence. Privacy, consent, accessibility and false positives are the hard parts, since monitoring can penalize learners with disabilities or poor connections.",
    k: ["Automated flagging vs human review of recordings: automation scales but produces false positives; human review is fairer and slow and costly.", "Lock-down client vs open-book design: lock-down limits cheating at a cost to access and privacy; redesigning assessments avoids the arms race."],
    p: ["Treating an automated flag as a finding penalizes learners whose environment, not behavior, triggered it.", "Recordings kept beyond the retention period expose sensitive images of learners' homes."],
    v: "Launch a proctored quiz with a monitoring tool, trigger a focus-loss event, and confirm the flag appears with a timestamp for review, and that recordings are deleted at the retention limit.",
    dep: ["quiz-engine","tool-launch-protocol","privacy-consent","data-retention","accommodations-engine"]
  }
});
