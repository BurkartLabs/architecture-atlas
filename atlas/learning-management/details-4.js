// Details for the learning management plate, part 4: analytics, accounts and compliance, platform, cross-cutting.
ATLAS.details("learning-management", {
  "activity-event-capture": {
    s: "Records learner and instructor actions, such as views, submissions and logins, as structured events with stable identifiers for later analysis.",
    d: "Components emit events with actor, verb, object, context and time. The collector validates them, adds session and course identifiers, and writes to a stream or queue rather than the main database, so tracking never slows a page. Events are batched toward the warehouse. Client events come from the player and viewers over a web interface. It is hard because volume is large, because clients are unreliable and clocks differ, and because every event is personal data with rules about use.",
    k: ["Asynchronous event stream vs writing to the transactional database: a stream protects page latency and can lose or delay events; direct writes are consistent and slow the product.", "Capturing everything vs a defined event catalog: capture-all preserves options and stores unused noise; a catalog keeps data meaningful and misses unplanned questions."],
    p: ["Client-sent timestamps from badly set clocks place events in the wrong week.", "A new feature ships without events, leaving a blind spot nobody notices until reports are requested."],
    v: "Perform a scripted learner session of login, view, quiz submit and logout, and confirm each event arrives once in the store with correct identifiers and ordering within the target delay.",
    dep: ["job-queue","analytics-warehouse","privacy-consent","time-zones-and-deadlines"]
  },
  "analytics-warehouse": {
    s: "A separate store that combines events, grades, enrollments and course structure into modeled tables for reporting without loading the live system.",
    d: "Extract jobs copy data from the transactional database and event stream into dimensional tables: learners, courses, terms, items, with facts for activity, scores and completions. Identifiers are pseudonymized where analysts do not need names. Refreshes are nightly or incremental. Data is also exported to institutional warehouses. It is hard because the live schema changes, because late-arriving data corrects history, and because access must follow privacy rules at the row level.",
    k: ["Separate warehouse vs reporting on read replicas: a warehouse allows heavy joins and history, but duplicates data and lags; replicas are fresh and strain the live schema.", "Pseudonymized learner keys vs real identifiers: pseudonyms reduce exposure, and make follow-up with an at-risk learner require a controlled lookup."],
    p: ["A schema change in the live system silently breaks the nightly load and reports stop updating.", "Analysts join on names across systems and publish wrong numbers."],
    v: "Change a grade and add an enrollment in the live system, run the refresh, and confirm the warehouse shows both within the stated lag, and row counts reconcile to the source.",
    dep: ["activity-event-capture","relational-store","scheduled-jobs","student-record-privacy"]
  },
  "at-risk-alerts": {
    s: "Flags learners whose activity, grades or pace suggest they are falling behind, and routes the alert to instructors or advisers with suggested actions.",
    d: "Rules or models run over recent activity and grade data: no login for a week, missed assignments, falling scores, or deviation from pace. Output is a list per course and a notification to an adviser. Interventions are logged so effect can be measured. It is hard because predictions are noisy, because flags can stigmatize, and because incorrect alerts train staff to ignore them. Fairness across groups needs to be checked, and learners should know the data is used.",
    k: ["Transparent rules vs trained models: rules are explainable to staff and learners, while models find subtler patterns and are harder to justify and audit.", "Alerting the learner directly vs only staff: direct alerts empower learners and may discourage them; staff-only keeps control and delays the learner's awareness."],
    p: ["A model trained on past cohorts flags groups unfairly because of historical patterns in the data.", "An alert on week one fires for every learner who has not yet used the system, and is ignored from then on."],
    v: "Seed a test course with a learner who stops logging in and misses two assignments, and confirm an alert reaches the adviser within a day naming the reasons, and that an intervention can be logged.",
    dep: ["analytics-warehouse","notification-delivery","privacy-consent","scheduled-jobs"]
  },
  "course-reports": {
    s: "Standard and custom reports on participation, grades, submissions and content use for instructors and administrators, with scoped access and export.",
    d: "Reports query the warehouse or the live store and are filtered to what the viewer may see. Instructors see their sections; administrators see departments and terms. Output is on-screen charts, tables and exports in standard tabular formats. Large exports run as background jobs. It is hard because reports must obey permissions exactly, because definitions vary (what counts as active), and because exports leave the system's controls.",
    k: ["Predefined reports vs a self-service query builder: predefined reports are consistent and limited; a builder is flexible and produces conflicting definitions of the same measure.", "Reports on live data vs a nightly snapshot: live data answers now and loads production; snapshots are cheap and one day old."],
    p: ["An export includes learners from sections the requester cannot access, because filters ran on screen only.", "Two reports show different active-user counts because each defines active differently."],
    v: "Run the participation report as an instructor, an assistant restricted to one section, and an administrator, and confirm each result includes exactly the learners that role may see and exported files match the screen.",
    dep: ["analytics-warehouse","permission-model","job-queue","student-record-privacy"]
  },
  "outcomes-reporting": {
    s: "Reports mastery of competencies and learning outcomes across courses and programs, for accreditation and curriculum review.",
    d: "Evidence aligned to outcomes, from rubric scores and assessments, is rolled up per learner, course and cohort. Reports show distribution by performance level and trends across terms. Departments use them to find where outcomes are weakly taught. It is hard because aggregation hides the decisions behind it: which evidence counts, how it is scaled, and which sample was assessed. Programs need data that stays comparable as courses change.",
    k: ["Sampling work for review vs assessing all learners: sampling is cheap and enough for program review; full assessment supports individual mastery and costs more.", "Rolling up by average vs by distribution of levels: averages are compact and obscure the failing group; distributions show it and are harder to compare."],
    p: ["A rubric edit between terms makes the trend line compare unlike things without notice.", "Small sections make percentages swing wildly and invite wrong conclusions."],
    v: "Align three assignments to one outcome across two terms, run the roll-up, and confirm level distributions match counts from the underlying rubric scores, with the evidence list reachable.",
    dep: ["competency-framework","analytics-warehouse","rubric-grading","course-reports"]
  },
  "account-hierarchy": {
    s: "Organizes the institution into nested accounts such as university, college and department, with settings, roles and courses inherited down the tree.",
    d: "Each account holds courses, users, branding, grading defaults and authentication settings. Children inherit unless they override. Administrators are granted rights at a level and apply below it. Large deployments host many independent institutions in one system, so the top level is a tenant boundary. It is hard because inheritance has to be predictable, because moving a course between accounts changes who administers it, and because tenant isolation errors expose one institution's data to another.",
    k: ["Deep hierarchy with inherited settings vs flat accounts with groups: hierarchy mirrors organizations and makes effective settings hard to trace; flat is simple and loses delegation.", "Shared database with tenant keys vs one database per tenant: shared is efficient and one query bug away from a leak; separate databases isolate and multiply operations."],
    p: ["A query missing the tenant filter returns another institution's learners.", "A setting changed at the top silently overrides the department's intentional choice."],
    v: "Create two tenants with similar course codes, query as an administrator of one, and confirm no record from the other appears in lists, search, exports or direct identifier access.",
    dep: ["permission-model","relational-store","authentication"]
  },
  "authentication": {
    s: "Verifies who is signing in, using passwords, federated sign-in and multi-factor checks, and issues and ends sessions.",
    d: "Local accounts store salted, slow password hashes, with lockout, reset and optional second factor. Federated sign-in delegates to an external provider. Sessions are server-tracked or token-based with idle and absolute timeouts. API access uses scoped tokens. It is hard because exams cause sign-in storms, because shared lab computers leave sessions open, and because account recovery is the easiest path for an attacker.",
    k: ["Server-side sessions vs stateless tokens: server sessions can be revoked at once and need shared storage; tokens scale easily and remain valid until they expire.", "Strong mandatory second factor vs optional: mandatory protects staff who can change grades and raises support load; optional is easy and leaves the weakest accounts open."],
    p: ["A password reset link sent to a stale email lets a former student take over an account.", "Long idle timeouts leave a signed-in session on a shared lab computer."],
    v: "Sign in, idle past the timeout, and confirm the session ends; reset a password and confirm old sessions are revoked, lockout triggers after repeated failures, and a second factor is demanded for staff.",
    dep: ["relational-store","account-hierarchy"]
  },
  "permission-model": {
    s: "The rules that decide what each person can see or do in each account, course, section and item, evaluated on every request.",
    d: "Permissions are granted to roles in a scope; a request is allowed if the user holds a role in the relevant scope with the permission, subject to item-level conditions such as published state, dates and section. Checks must be applied uniformly in the UI, API, exports and search. Results are cached per request. It is hard because many features need their own conditions, because bypass paths such as exports and notifications are forgotten, and because debugging why someone can or cannot see something is painful.",
    k: ["Central permission checks vs per-feature logic: central checks are consistent and auditable, and must express every feature's conditions; per-feature logic is flexible and diverges.", "Deny by default vs allow by default for new features: deny is safe and slows feature work; allow ships fast and leaks."],
    p: ["A new export path forgets the section restriction and shows all learners.", "Cached permissions outlive a role change, so a removed assistant keeps access for hours."],
    v: "For a matrix of roles and items, such as unpublished, section-restricted and past-due, compare allowed and denied actions across UI, API and export against an expected table, and confirm they agree everywhere.",
    dep: ["course-roles","account-hierarchy","relational-store","audit-log","student-record-privacy"]
  },
  "data-retention": {
    s: "Policies that decide how long courses, submissions, recordings and logs are kept, and the jobs that archive, anonymize or delete them.",
    d: "Policies attach durations and actions to data classes: submissions kept seven years, recordings one year, logs 90 days. Jobs find data past its period and archive, anonymize or delete it, leaving tombstones for references. Legal holds suspend deletion. Learners and regulators may request erasure or export. It is hard because data is spread across the database, object storage, backups and the warehouse, and because grades and transcripts may legally have to be kept while other personal data must go.",
    k: ["Deleting vs anonymizing: deletion fully removes the person and breaks aggregates; anonymization preserves statistics and may be reversible with other data.", "Per-class policies vs one global period: per-class matches legal requirements and is complex to administer; a global period is simple and wrong for some data."],
    p: ["Deletion removes the database row but leaves files in object storage and the warehouse.", "A retention job deletes records under legal hold because the hold was recorded elsewhere."],
    v: "Set a short retention on a test class of data, age records past it, run the job, and confirm rows, files and warehouse copies are gone, held records remain, and the job logs what it removed.",
    dep: ["scheduled-jobs","file-storage","analytics-warehouse","audit-log","privacy-consent"]
  },
  "privacy-consent": {
    s: "Records what personal data is collected, who it is shared with and what the learner agreed to, and enforces those choices across features and integrations.",
    d: "The system holds notices, consent records and data-sharing settings per tool and per feature. Before sending data to an external tool or enabling monitoring, it checks the policy. Learners and parents of minors have different rights. Requests to see or delete data flow through a process. It is hard because rules vary by place and age, because consent has to be specific and revocable, and because integrations can quietly leak more fields than the agreement allows.",
    k: ["Institution-level agreement with tools vs per-learner consent: institution agreements are practical and rest on legal bases; per-learner consent gives control and is hard to run at scale.", "Minimal default fields sent to tools vs full profile: minimal limits harm and breaks tools that want names; full profile is convenient and violates minimization."],
    p: ["A newly installed tool receives every learner's email before any review took place.", "Revoked consent is recorded, but the nightly export still includes the learner."],
    v: "Withdraw a learner's consent for a monitoring tool, start an exam, and confirm the tool is not launched with their data, an alternative path is offered and the withdrawal appears in the consent record.",
    dep: ["tool-launch-protocol","relational-store","audit-log","student-record-privacy"]
  },
  "audit-log": {
    s: "An append-only record of significant actions: grade changes, permission changes, logins, exports and deletions, with who, what, when and from where.",
    d: "Services write audit entries with actor, action, target, before and after values, time and source. Entries are stored apart from ordinary data, protected against edit, and searchable by administrators. Grade history and enrollment changes use the same mechanism. It is hard because the volume is large, because it must be written in the same transaction as the change or it can be missed, and because logs themselves hold sensitive data that needs its own access rules.",
    k: ["Writing audit in the same transaction vs asynchronously: same transaction guarantees the record and adds latency; asynchronous is fast and can lose entries on a crash.", "Logging full before and after values vs only identifiers: full values explain disputes and store sensitive data again; identifiers are leaner and require history elsewhere."],
    p: ["A change path written later forgets to emit audit entries, so gaps appear in exactly the new feature.", "Administrators can edit or delete audit rows, which makes the log useless as evidence."],
    v: "Change a grade, a role and an enrollment, then search the log and confirm three entries with actor, before and after values and time exist, and that no account can alter them.",
    dep: ["relational-store","permission-model","grade-integrity"]
  },
  "relational-store": {
    s: "The transactional database holding courses, users, enrollments, items, submissions and grades, with the integrity and consistency the rest of the system assumes.",
    d: "A relational database stores structured records with constraints and transactions. Schemas model courses, sections, enrollments and items as tables with foreign keys. Hot paths such as the gradebook and dashboard rely on indexes and sometimes denormalized summaries. Replicas serve reads. Migrations change the schema online. It is hard because load is extreme and periodic, because large tables of events and submissions grow quickly, and because migrations during a term must not lock the system.",
    k: ["Single primary with read replicas vs sharding by institution: replicas are simple and cap write scale; sharding scales and complicates cross-institution features and operations.", "Normalized schema vs denormalized summaries: normalization keeps data consistent; summaries make dashboards fast and need maintenance."],
    p: ["A long-running report query on the primary slows grading during a deadline.", "A migration that locks a large table takes the system down mid-term."],
    v: "Run a deadline-load test at ten times the usual rate while a migration adds a column to a large table, and confirm p95 latency stays in budget and no request is blocked by the migration.",
    dep: ["backup-and-restore","deadline-load-spikes"]
  },
  "file-storage": {
    s: "Object storage for uploaded files, submissions, media and exports, durable and cheap per byte, accessed through signed requests.",
    d: "Objects are stored by key in buckets with replication across failure domains. The application never exposes keys directly: it issues short-lived signed addresses for reads and writes. Lifecycle rules move cold data to cheaper tiers or delete it. A CDN fronts popular media. It is hard because storage is the largest cost in media-heavy deployments, because deletes must reach every copy, and because access control must hold at the object level.",
    k: ["Direct signed uploads vs proxy through the application: signed uploads scale and need strict constraints on what can be written; proxying controls everything and consumes bandwidth.", "Tiered cold storage for old terms vs everything hot: tiering saves cost and makes old submissions slow to open; hot storage is simple and expensive."],
    p: ["A bucket misconfigured as public exposes submissions to anyone with the address.", "Lifecycle rules delete objects still referenced by a course copy."],
    v: "Upload through a signed address, attempt to read it without one, and attempt to write a larger or different type than the signature allowed, and confirm only the permitted operation succeeds.",
    dep: ["backup-and-restore"]
  },
  "search-index": {
    s: "A full-text index over courses, pages, discussions, files and people that respects permissions and returns relevant results quickly.",
    d: "Content changes are queued and indexed asynchronously into a search engine, with text extracted from documents and transcripts. Queries apply the user's visibility as filters so results never show hidden items. Ranking considers recency, course and role. It is hard because permission filters change as enrollments change, because indexing lags editing, and because the index duplicates sensitive text that must also be deleted on retention.",
    k: ["Permission filters at query time vs per-user indexes: query-time filters are flexible and cost latency on large result sets; per-user indexes are fast and huge.", "Near-real-time indexing vs batch: near-real-time shows new content quickly and loads the engine; batch is cheap and stale."],
    p: ["Search results reveal titles of unpublished or restricted items.", "Deleted content stays searchable because the index delete event was lost."],
    v: "Create a discussion post in a restricted section, search as a learner in another section and as a member, and confirm only the member finds it, within the indexing delay, and it vanishes from search after deletion.",
    dep: ["job-queue","permission-model","relational-store"]
  },
  "job-queue": {
    s: "A durable queue and pool of workers for slow or deferred work such as conversion, imports, notifications and grading, with retries and visibility.",
    d: "Producers enqueue jobs with a type, payload and priority; workers pull, run and report outcome. Failed jobs retry with backoff and land in a dead-letter set after limits. Queues are separated by type so a flood of video jobs cannot starve notifications. Operators see depth, age and failures. It is hard because jobs must be idempotent as delivery repeats, and because deadline spikes produce enormous queues that must drain in time.",
    k: ["Separate queues per workload vs one shared queue: separate queues isolate floods and need more configuration; one queue is simple and lets bulk work block urgent work.", "At-least-once delivery with idempotent jobs vs exactly-once attempts: at-least-once is achievable and demands idempotency; exactly-once claims are fragile."],
    p: ["A retried job sends a notification or issues a certificate twice.", "A poison job crashes workers repeatedly and blocks the queue behind it."],
    v: "Enqueue 10,000 mixed jobs, kill a worker mid-run, and confirm all jobs finish, none runs its side effect twice, failures reach the dead-letter set, and urgent jobs keep their latency target.",
    dep: ["relational-store","deadline-load-spikes"]
  },
  "scheduled-jobs": {
    s: "Time-based tasks that open and close terms, release grades, send reminders, refresh analytics and enforce retention without human action.",
    d: "A scheduler triggers tasks by cron-like rules and by per-record due times, such as opening an assignment at 8 a.m. in the course's time zone. Due-time tasks are stored in a table and polled, with leases so only one worker takes each. Missed runs catch up. It is hard because exactly-once timing across many nodes is difficult, because time zones and daylight shifts move schedules, and because some tasks (releasing grades) are irreversible once run.",
    k: ["Polling a due-time table vs one timer per record: polling is simple, scales and gives a granularity of seconds; per-record timers are precise and hard to recover.", "Catch-up of missed runs vs skip: catch-up preserves correctness after downtime and can fire a flood at once; skipping is calm and drops obligations."],
    p: ["Two scheduler nodes both run the grade release and send every notification twice.", "A daylight-saving change makes a scheduled job run an hour early or not at all."],
    v: "Schedule an assignment to open at a time in a daylight-saving transition zone and stop the scheduler for ten minutes across it, then confirm it opens exactly once at the right local time after recovery.",
    dep: ["relational-store","job-queue","time-zones-and-deadlines"]
  },
  "notification-delivery": {
    s: "Sends messages to learners and staff by email, push and in-app channels according to preferences, with batching and delivery tracking.",
    d: "Features emit notification intents with recipient, type and content. The service applies preferences, quiet hours and digests, renders templates, and hands messages to channel providers. Delivery results and bounces are recorded. Deadline reminders and grade postings arrive in bursts. It is hard because email deliverability needs care, because over-notification causes learners to opt out of everything, and because a message must never contain a hidden grade or reveal a course a recipient lost access to.",
    k: ["Immediate messages vs digests: immediate messages suit urgent items and flood; digests reduce volume and delay time-sensitive information.", "Rendering content at send time vs at queue time: send-time rendering uses current data and permissions; queue-time is simple and can deliver stale or no-longer-permitted content."],
    p: ["Reminder emails sent for an assignment that was later hidden reveal its existence.", "A burst on the hour overwhelms the mail provider and delays everything for hours."],
    v: "Trigger a reminder for 5,000 learners at once with 200 opted out, and confirm exactly 4,800 deliveries within the target, opt-outs respected, and bounces recorded against each address.",
    dep: ["job-queue","permission-model","relational-store","deadline-load-spikes"]
  },
  "backup-and-restore": {
    s: "Regular copies of the database and files, with a tested procedure to restore the whole system or one course to a chosen point in time.",
    d: "The database uses continuous log archiving plus periodic full copies, enabling restore to any moment. Object storage uses versioning and cross-region replication. Course-level restore extracts a single course from a backup into a new one. Retention of backups must match privacy rules. It is hard because the recovery time and point objectives are tight in term, because a restored course must reconcile with changes since, and because backups hold data that retention rules say to delete.",
    k: ["Whole-system restore only vs course-level restore: whole-system is simple and unsuitable for one instructor's mistake; course-level handles the common case and needs tooling.", "Long backup retention vs short: long retention helps with late-discovered errors and conflicts with erasure promises; short is compliant and leaves no recourse."],
    p: ["A backup that has never been restored turns out to be unusable when needed.", "Restoring a course restores deleted learners' personal data that had been erased."],
    v: "Delete a test course at noon, restore to 11:55 into a fresh course, and confirm content, submissions and grades match, then time a full restore against the stated recovery objective.",
    dep: []
  },
  "deadline-load-spikes": {
    s: "Traffic is dominated by synchronized deadlines, exam starts and term openings, so capacity must be planned for a few minutes, not the daily average.",
    d: "Thousands of learners submit in the last five minutes before midnight, start a quiz at the same second, or sign in when a term opens. The same data is read and written by everyone at once. Design responses include queueing work, accepting uploads without processing them, autosave, caching and rate limits, and elastic capacity where available. The decision shapes every layer: any feature with a deadline is a potential spike, and the failure mode is learners blamed for lateness caused by the system.",
    k: ["Over-provision for peak vs scale on demand: over-provisioning is reliable and expensive for idle months; on-demand saves cost and may not scale in the seconds that matter.", "Accept first, process later vs process inline: accepting first keeps the deadline experience smooth and defers errors; inline gives instant results and fails under load."],
    p: ["A system that is up on average falls over at 11:59 p.m. every Sunday.", "Autoscaling reacts in minutes to a spike that lasts four."],
    v: "Replay a synthetic burst of 20,000 submissions and quiz starts in two minutes against a production-sized environment, and confirm no submission is lost, receipts are issued and latency stays within budget.",
    dep: []
  },
  "student-record-privacy": {
    s: "Learner records are legally protected educational data, so who can see, share and keep them is decided centrally and enforced everywhere.",
    d: "Grades, submissions, activity and identity data are personal data with legal limits on disclosure, especially for minors. The decision shapes every layer: permissions, exports, notifications, search, analytics and tool launches must apply one policy. It includes pseudonymization for analytics, minimal fields for integrations, consent records, and retention. The failure mode is leaking through a side path, such as an export, a notification or a shared report, rather than through the main screen.",
    k: ["Central policy engine vs rules in each feature: central rules are consistent and demand every feature call them; per-feature rules are fast to write and diverge.", "Minimization by default vs convenience: minimal data limits harm in a breach and breaks features that wanted names; convenience helps users and widens exposure."],
    p: ["A new export, notification or integration ships without the privacy check, because the main screen was the only thing tested.", "Analytics data pseudonymized in name stays re-identifiable through rare attributes."],
    v: "Trace each place one learner's grade can appear, including UI, API, email, search, export, analytics and tool launch, as unauthorized users, and confirm every path withholds it.",
    dep: []
  },
  "grade-integrity": {
    s: "Every grade must be explainable and reproducible later: how it was computed, who changed it and what it was before.",
    d: "Grades are legal and financial records, and are disputed. The decision shapes storage and computation: raw scores are immutable inputs, computation is deterministic and versioned, overrides are separate with reasons, and every change is audited. Late policy, regrades and corrections must leave the previous state recoverable. Failure modes are silent recalculation that changes published grades, rule edits mid-term and caches that disagree with the source.",
    k: ["Derive grades from raw inputs every time vs store final results: deriving is auditable and consistent; stored results are fast and can drift from inputs.", "Freezing rules at term start vs allowing edits: freezing gives stability and prevents correcting real mistakes; edits are flexible and change published outcomes."],
    p: ["A rule change recomputes last term's grades after they were exported to the registrar.", "No record exists of the old value after a bulk regrade."],
    v: "Pick a learner's final grade from a closed term, recompute it from stored raw scores, overrides and the rule version in force, and confirm it equals the grade the registrar holds.",
    dep: []
  },
  "time-zones-and-deadlines": {
    s: "Every date has a defined zone and meaning, because whether work was late depends on whose clock and which day it is.",
    d: "Due dates are stored in universal time with the course's zone, displayed in the viewer's zone, and computed against server time, never client time. The decision shapes assignments, quizzes, the calendar, late policies, schedulers and reports. It covers daylight-saving transitions, midnight deadlines, exchange of dates with external systems and per-learner overrides. The failure modes are a deadline an hour early for some learners and disputes about timestamps that cannot be settled.",
    k: ["Course zone as the authority vs the learner's zone: course zone gives one shared deadline and surprises travelers; learner zone feels natural and produces different effective deadlines.", "Deadline at midnight vs at a mid-day time: midnight is customary and encourages all-night work and load spikes; a daytime cutoff reduces both."],
    p: ["A due time displayed in the browser's zone differs from the zone penalties use.", "Daylight saving shifts a recurring deadline, so one week has 25 hours."],
    v: "Set a deadline of 11:59 p.m. in the course zone, view it from three zones across a daylight shift, submit one second either side, and confirm display, lateness and the calendar all agree.",
    dep: []
  },
  "standards-and-versions": {
    s: "The system depends on many interoperability standards, each with versions and vendor variations, so compatibility is managed deliberately and not assumed.",
    d: "Content packages, tool launch, roster and grade exchange, event statements, badges and sign-in all follow standards that evolve. The decision shapes importers, adapters and the API: which versions to support, how strictly to validate, how to detect what a counterpart supports, and how long to keep old behavior. The failure modes are an upgrade that breaks a vendor tool, a certified feature that passes tests and fails in practice, and unreadable archived content.",
    k: ["Supporting many versions vs only the latest: many versions retain customers and multiply testing; latest-only is lean and strands legacy content.", "Strict conformance vs tolerance of real-world quirks: strict conformance is testable and rejects what works elsewhere; tolerance serves users and spreads nonstandard behavior."],
    p: ["A tool certified against one version fails after a minor platform update changes optional fields.", "Content created years ago can no longer be imported because its format version was dropped."],
    v: "Run the conformance suite for each supported standard version against the current build and a set of real vendor packages and tools, and confirm results match the published support matrix.",
    dep: []
  },
  "accessibility-by-default": {
    s: "Accessibility is a requirement of every feature and every piece of content, not a separate feature, because exclusion is a legal and educational failure.",
    d: "Learners with disabilities must be able to complete every task, including quizzes with time limits and video content. The decision shapes component libraries, templates, authoring tools, media processing and testing: structure and focus handled centrally, captions on every video, accommodations applied by the platform, and checks in the build. Failure modes are inaccessible third-party tools, content authors bypassing structure, and a feature that works with a mouse only.",
    k: ["Built into shared components vs added per feature: shared components fix it once and constrain design; per-feature work is flexible and uneven.", "Automated checks vs manual testing with assistive technology: automation scales and finds a fraction of problems; manual tests find real barriers and cost time."],
    p: ["A new interactive feature ships with a mouse-only interaction because nobody tested with a keyboard.", "A vendor tool launched in a frame is unusable with a screen reader, yet is required for the course."],
    v: "Have users of screen readers and keyboard-only navigation complete the core tasks of enrolling, reading, submitting and checking grades, and confirm each succeeds without help.",
    dep: []
  }
});
