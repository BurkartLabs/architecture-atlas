// Details for the code review plate, part 2: approvals and rules, checks, merging, comments.
ATLAS.details("code-review", {
  "approval-model": {
    s: "How a reviewer's judgment is recorded and counted: who may approve, what an approval covers, and how many are needed.",
    d: "An approval is a record by one reviewer against one patch set, with a value such as approve, comment or request changes. Rules count approvals from eligible people, perhaps requiring one from each ownership area. Request-changes may block merging until the same person withdraws it. The model must say whether approvals expire when code changes. It is hard because people read approval differently: some mean the code is correct, others only that the approach is acceptable.",
    k: ["Approval bound to a patch set versus to the change: bound to a patch set is precise and safe, while bound to the change is convenient but covers code the reviewer never saw.", "Request-changes as a hard block versus advisory: a block forces resolution, but one absent reviewer can stall a change indefinitely."],
    p: ["A reviewer who left the team still holds a blocking vote nobody can clear without an override.", "Counting approvals without checking eligibility lets people outside the area approve code they do not own."],
    v: "Have an eligible and an ineligible user each approve, and confirm only the eligible approval counts toward the requirement and the page shows which requirement each approval satisfies.",
    dep: ["patch-sets","permissions-model"]
  },
  "votes-and-labels": {
    s: "Named, typed signals attached to a change, such as code review, verified and security, each with its own allowed values and rules.",
    d: "A label is a category of judgment with a set of values, such as minus two to plus two, or pass and fail. Each has a defined set of people who may vote and a function that combines votes: any block wins, maximum wins, or a count. Labels let different concerns, such as correctness and legal approval, be tracked separately. The challenge is configuration sprawl, since each label adds states people must understand.",
    k: ["Many labels for separate concerns versus one approval: many labels model real policy exactly, but confuse authors who must satisfy each of them.", "Numeric scales versus binary values: scales express degrees of confidence, but binary values are unambiguous and easier to enforce."],
    p: ["Labels copied between projects with different meanings make a vote carry different weight in each.", "A label whose combine function is misconfigured lets one vote override several blocks."],
    v: "Cast the maximum and the blocking value on a label from two reviewers and confirm the combined result follows the configured function and is shown on the page with its voters.",
    dep: ["approval-model"]
  },
  "protected-targets": {
    s: "Rules attached to target branches or paths, such as release branches, that require review before anything may land there.",
    d: "A protected target names branches by pattern and attaches requirements: minimum approvals, required checks, linear history, no direct pushes. The platform refuses direct updates to the branch outside the merge path. Patterns allow a rule for every release branch. Special accounts may be exempt. It is hard because protection is only as strong as its coverage: a new branch matching no pattern, or a path that bypasses the platform, is unprotected.",
    k: ["Pattern-based rules versus per-branch rules: patterns cover new branches automatically, but a broad pattern can catch branches that should stay open.", "Blocking direct pushes at the platform versus in the repository server: the platform is simple to configure, while repository-level hooks are harder to bypass."],
    p: ["A branch created with a name that matches no pattern accepts unreviewed pushes to code that gets released.", "Administrators exempt from rules merge their own changes without review and nobody notices."],
    v: "Attempt a direct push to a protected branch and confirm it is rejected with the missing requirement named, then create a new release branch and confirm it is covered automatically.",
    dep: ["repo-access","permissions-model"]
  },
  "submit-requirements": {
    s: "The declared conditions a change must satisfy to be submitted, shown as a checklist that says what is satisfied and what is missing.",
    d: "Each requirement is a named predicate over the change: has an owner approval, has a passing required check, has no unresolved threads, description present. The platform evaluates all of them and shows each as satisfied, unsatisfied or not applicable, with a reason. Requirements can apply by branch, path or author. Showing them explicitly is what lets an author act without guessing. The hard part is keeping the list understandable as rules accumulate.",
    k: ["Explicit named requirements versus a single yes or no: names let authors see what to fix, but add configuration surface and more states to render.", "Requirements fixed by the platform versus configured per project: fixed ones are consistent, while configured ones fit local policy but drift between projects."],
    p: ["A requirement that evaluates slowly delays the page, so authors stop looking at the checklist.", "A message such as not satisfied with no reason leaves the author asking an administrator."],
    v: "Open a change missing an approval and a check and confirm each requirement is listed with its status and a specific reason, and that satisfying one changes only its own entry.",
    dep: ["rule-evaluation"]
  },
  "rule-evaluation": {
    s: "The engine that reads votes, ownership, check results and change facts and decides which requirements are met, re-running when any input changes.",
    d: "The engine takes a snapshot of facts about a change and applies each rule, producing a result and an explanation. It is invoked on every event that could alter an input: a vote, a push, a check result, a label edit. Results are cached on the change and used by the list views, so evaluation must be deterministic and fast. The hard part is ordering: when inputs change in quick succession, an older result must not overwrite a newer one.",
    k: ["Evaluating on each event versus on demand: event-driven keeps lists current and cheap to read, while on demand never stores stale results but is slow for lists.", "Rules as code versus a fixed rule set: code can express anything, but can loop or run slowly and needs sandboxing."],
    p: ["Two events processed out of order leave the stored result saying a change is submittable when a new push already invalidated it.", "A rule that calls an external service makes evaluation depend on that service being up."],
    v: "Fire a vote and a new push at the same instant, and confirm the final stored result reflects the push, and a merge request made before re-evaluation finishes is rejected.",
    dep: ["votes-and-labels","check-aggregation","owner-resolution"]
  },
  "stale-approval-dismissal": {
    s: "Dropping or flagging approvals when the code they covered has changed, so a late edit cannot ride on an earlier review.",
    d: "On each new patch set, the platform decides whether existing approvals still hold. Strict mode clears all of them. Smarter modes keep approvals when the new patch set is a trivial rebase, with an identical diff, or a message-only change, and clear them otherwise. Comparing diffs of diffs makes this decision. It is hard because strict clearing trains people to rubber-stamp quickly, while lenient rules let meaningful changes through.",
    k: ["Clear all approvals versus keep for trivial changes: clearing is safest, but forces re-approval after harmless rebases and breeds reflexive approving.", "Dismissing at push time versus at merge time: at push time is visible early, but at merge time compares against exactly what will land."],
    p: ["Treating a rebase as trivial when it pulled in a conflicting resolution lets changed code merge with the old approval.", "Silent clearing leaves authors puzzled about why a green change became blocked."],
    v: "Approve a change, push a rebase with an identical diff and confirm the approval stays; push a one-line code edit and confirm it is cleared and the page says why.",
    dep: ["approval-model","three-way-and-range-diff"]
  },
  "self-approval-prevention": {
    s: "Rules that stop an author from satisfying review requirements for their own change, including through helper accounts or a pushed co-author's vote.",
    d: "The platform excludes the author's votes from required counts, and may also exclude the person who pushed the latest revision or the author of commits in it. Without this, an author with the right permission can approve and merge alone. Some policies allow it in small teams. Detection can extend to accounts linked to the same person. The difficulty is defining author: one person can push, another can have written the code, and a bot can do both.",
    k: ["Excluding the author only versus excluding anyone who contributed commits: author-only is simple, but a co-author can approve code they wrote.", "Strict separation versus an emergency exception: strict is clean, while an exception keeps outages fixable but must be logged and rare."],
    p: ["A shared service account that pushes and approves defeats the rule.", "Pushing a trivial commit onto a colleague's change to claim authorship breaks a count of independent reviewers."],
    v: "Have the author vote approve on their own change and confirm it is shown but does not count; add a second person's commit and confirm that person's approval is also excluded.",
    dep: ["approval-model"]
  },
  "overrides-and-bypass": {
    s: "A controlled way to merge when a rule cannot be satisfied, such as during an outage, with a recorded reason and visible to the people who care.",
    d: "A privileged user can submit despite unmet requirements, supplying a reason. The platform records who, what rule was bypassed and why, notifies owners and writes to the audit log. Teams may require two people or a time limit. The mechanism exists because strict policy with no exit causes people to invent worse bypasses, such as pushing directly. The challenge is making it available in an emergency and unattractive in the ordinary case.",
    k: ["A logged override versus no override: an override handles real emergencies, while none is purer but encourages out-of-band pushes that leave no trace.", "Individual bypass permission versus a request approved by a second person: individual is fast, while a second approver prevents abuse but delays the emergency."],
    p: ["Overrides used routinely because the real rule is too strict show up as an alert nobody reads.", "An override that does not rerun required checks merges code that is broken."],
    v: "Perform an override with a reason and confirm the merge succeeds, the change page shows the bypass, owners are notified and the audit log entry names the rule skipped.",
    dep: ["rule-evaluation","audit-log"]
  },
  "policy-as-code": {
    s: "Keeping review rules in versioned configuration in the repository or a policy repository, so changes to policy are themselves reviewed.",
    d: "Rules, ownership and label definitions are expressed in files that the platform reads from a known location. A change to those files goes through review like any other, usually with an extra approver. The platform loads the configuration for the target branch at evaluation time, and validates it before accepting. Policy as code provides history and review for policy. The hard part is bootstrapping and trust: a change that weakens its own rule should not be judged by the weakened rule.",
    k: ["Configuration read from the target branch versus from the change: reading the target branch stops a change from rewriting its own rules, but delays rule updates to merge time.", "Repository files versus settings in a database: files give review and history, while a database gives immediate effect and guards against a broken file locking everyone out."],
    p: ["A syntax error merged into the policy file leaves rules unevaluable and the platform either blocks all merges or allows all.", "A change that edits ownership and is approved by the owners it just added approves itself."],
    v: "Submit a policy change that removes a required reviewer and confirm it is evaluated under the old rules, needs the policy owners, and that an invalid file is rejected before merge.",
    dep: ["rule-evaluation","repo-access"]
  },

  "check-registration": {
    s: "How an automated system declares itself to the platform: its name, what it checks, which changes it applies to and whether it can block merging.",
    d: "A check is registered per project or repository with an identifier, display name, permissions and a scope pattern. Registration says who may post results for it, so one tool cannot impersonate another. It also states whether the check is required. Apps or service accounts hold credentials to post. The challenge is governance: many checks accumulate, owners change, and a check that nobody maintains still blocks every merge.",
    k: ["Central registration versus checks announcing themselves: central registration controls what can block merging, while self-announcing is easy to adopt but lets any tool add noise.", "Checks scoped by path versus run on everything: scoping saves compute and clutter, but a missed pattern lets a change skip a check it needed."],
    p: ["A retired check that remains required blocks every merge until an administrator removes it.", "A check name reused by a different tool gives old results new meaning."],
    v: "Register a check scoped to one directory, push changes inside and outside it, and confirm the check appears only on the first, and that a result posted with the wrong credential is rejected.",
    dep: ["permissions-model"]
  },
  "check-triggering": {
    s: "Starting automated checks when a patch set is created or changes state, by event to the external system or by the platform calling it.",
    d: "On a new patch set the platform emits an event; the continuous integration system receives it, queues a run against the exact commit, and reports back. Some designs have the platform call the system directly. Triggers may depend on paths touched, labels or draft state, to avoid running expensive checks on early work. The hard parts are loss and duplication: a missed event leaves a change with no result, and a replayed one starts a second run.",
    k: ["Push events versus polling by the CI system: events are quick and efficient, while polling is slower but recovers from missed events.", "Running checks on the change itself versus on the merge result: the change alone is faster and independent, but only the merged result shows whether it works with the target."],
    p: ["A webhook failure leaves a change without checks and nothing tells the author to retry.", "Triggering on every push for work-in-progress changes burns compute on code nobody has asked to review."],
    v: "Push a patch set and confirm a check run starts on that exact commit within the stated time; drop the event delivery and confirm a recovery path starts the run.",
    dep: ["event-stream","webhooks"]
  },
  "check-results-api": {
    s: "The interface through which external systems post status, summaries, logs links and per-file annotations for a given revision.",
    d: "A result is a record keyed by change, patch set and check identifier, with state (queued, running, passed, failed), summary text, a link, and optional annotations anchored to lines. Posting is idempotent and last-write-wins by timestamp. The platform shows results on the page and in lists. The difficulty is validating untrusted input from many tools, bounding size, and keeping a result tied to the revision it ran on when new ones are pushed.",
    k: ["Results tied to a patch set versus to the change: tied to a patch set is accurate and prevents old results validating new code, but multiplies records.", "Free-form summaries versus structured fields: free-form is flexible, while structured fields allow filtering and aggregation."],
    p: ["A late result for an old patch set overwrites the status shown for the new one.", "Unbounded annotations from a noisy tool slow the page for everyone."],
    v: "Post a failing result for patch set two after patch set three exists and confirm it is attached to patch set two only, and that the current requirement still shows patch set three as unchecked.",
    dep: ["check-registration","patch-sets"]
  },
  "check-aggregation": {
    s: "Combining many individual check results into one status for the change, following the rules for required, optional and skipped checks.",
    d: "A change may have dozens of checks across systems. Aggregation reads the latest result per check for the current patch set and applies a policy: all required must pass, optional failures are shown but ignored, missing required checks count as pending. It produces the summary used in lists and by the rule engine. The hard part is semantics: skipped, cancelled, timed out and neutral each need a defined meaning.",
    k: ["Missing means pending versus missing means ignored: pending is safe and blocks, while ignored lets a check silently never run.", "Latest result only versus any pass: latest is correct for current code, while any pass would let a retry mask a real failure."],
    p: ["Treating cancelled as passed lets a change merge after a superseded run was cancelled, with no run on its code.", "Combining across patch sets shows green from a previous revision."],
    v: "Make one required check fail, one optional check fail and one required check never report, and confirm the summary is failed or pending with each named, and the optional failure shown but not blocking.",
    dep: ["check-results-api","required-vs-advisory"]
  },
  "required-vs-advisory": {
    s: "The distinction between checks that block merging and checks that only inform, and the process for promoting one to the other.",
    d: "Required checks gate merging; advisory ones appear for information. New checks usually start advisory so their false-positive rate can be measured, and are promoted once trusted. The setting can differ by branch, so release branches require more. The classification is a policy, held in configuration. The difficulty is social: once a check is required, the team that owns it holds the merge pipeline hostage when it breaks.",
    k: ["Start advisory then promote versus required from the start: advisory measures noise before it can hurt, but delays value and can be ignored forever.", "Per-branch requirements versus one set: per-branch fits risk, but more configuration to keep correct."],
    p: ["An advisory check that always fails trains reviewers to ignore all red marks.", "Promoting a flaky check to required stalls all merges."],
    v: "Promote an advisory check to required and confirm changes that fail it become unmergeable with the check named, while changes already merged are unaffected.",
    dep: ["check-registration"]
  },
  "check-reruns": {
    s: "Letting people restart a check on the same revision, and rules for when the platform restarts it automatically.",
    d: "A rerun creates a new attempt for the same patch set, replacing the displayed result when it finishes. Authors use it after infrastructure failures; reviewers use it to test for flakiness. The platform may keep attempts as history and rate limit them. Automatic reruns can follow a failure classified as infrastructure. The hard part is incentive: rerun until green is cheap, and it hides real intermittent defects.",
    k: ["Unlimited manual reruns versus a cap: unlimited removes friction from infrastructure failures, but invites rerolling until a flaky test passes.", "Recording every attempt versus keeping the last: all attempts expose flakiness, while last-only is simpler and hides it."],
    p: ["A green rerun on a deterministic failure hides a real race that appears in production.", "Reruns that start while the previous attempt is still running produce two results racing to be the latest."],
    v: "Fail a check, rerun it, and confirm the new attempt replaces the displayed result while the history lists both attempts with their outcomes.",
    dep: ["check-triggering","check-results-api"]
  },
  "flaky-check-handling": {
    s: "Detecting checks or tests that sometimes fail without a code cause, and keeping them from blocking merges while someone fixes them.",
    d: "The platform or the CI system compares outcomes for the same commit or across commits to spot intermittent failures. A flaky test can be quarantined, shown but not blocking, and ticketed to its owner. Retries within a run may mask failures that are tracked separately. Data comes from the check results API. It is hard because quarantine reduces the gate's strength, and a defect hidden by a quarantine stays hidden.",
    k: ["Automatic retries versus failing fast: retries keep merges flowing, but hide intermittent defects that users will hit.", "Quarantining flaky tests versus deleting them: quarantine keeps the signal and the reminder, but a quarantine list tends to grow and never shrink."],
    p: ["A quarantine with no owner or deadline becomes permanent and the test never runs for real again.", "Classifying a real race condition as flaky ships it."],
    v: "Run one test commit twice with different outcomes and confirm it is flagged, shown as non-blocking, and an owner is notified with the failure history.",
    dep: ["check-aggregation","check-reruns"]
  },

  "merge-strategies": {
    s: "The ways a change joins the target branch: a merge commit, a squash into one commit, or a rebase that replays its commits in order.",
    d: "A merge commit preserves the author's commits and shows when they joined. A squash combines all into one commit with a fresh message, producing a linear history where each entry is a reviewed unit. A rebase replays commits one by one, keeping them but rewriting their identity. Projects choose one, or allow authors to choose. The strategy decides history shape, what bisecting finds and how revert works.",
    k: ["Squash versus preserving commits: squash gives one reviewed unit per entry and an easy revert, but loses the author's intermediate steps and blame detail.", "Merge commits versus rebase: merge commits record the true history and avoid rewriting, while rebase gives a straight line that is easier to read and bisect."],
    p: ["Squashing a stack's pieces together destroys the small units reviewers approved separately.", "A rebase merge rewrites commit identifiers, so references to the old commit in other systems stop resolving."],
    v: "Merge three equivalent changes with each strategy and confirm the resulting history shape matches the project's rule, and that reverting each produces the expected tree.",
    dep: ["repo-access","rebase-engine"]
  },
  "mergeability": {
    s: "The computed answer to whether a change can be merged right now: rules satisfied, no conflicts, up to date as policy requires.",
    d: "Mergeability combines the submit requirements, conflict status and any requirement that the change be rebased on the current tip. It is shown on the page and enforced at the moment of merging, which rechecks everything because the target may have moved. Lists use a cached value for speed. The challenge is that cached and enforced values can disagree, and that the answer depends on facts changing from several systems.",
    k: ["Recomputing at merge time versus trusting the cached value: recomputing is correct, while the cache is fast but may show mergeable for a change that now conflicts.", "Requiring up to date with the target versus allowing behind: up to date avoids surprises, but forces constant rebases on busy branches."],
    p: ["A mergeable badge in a list followed by a refusal on click makes people distrust the tool.", "Requiring up to date on a busy branch causes a race where each rebase is invalidated by another merge."],
    v: "Make a change mergeable, advance the target with a conflicting commit, and click merge; confirm it refuses with the reason rather than merging.",
    dep: ["submit-requirements","conflict-detection"]
  },
  "merge-queue": {
    s: "A serialized line of approved changes that each get tested against the current target plus every change ahead of them before landing.",
    d: "Instead of merging directly, an approved change joins a queue. The queue builds a temporary branch combining the target tip and the queued changes in order, runs required checks on it, and merges each if green. A failure ejects that change and rebuilds those behind it. This keeps the target always green even when two individually passing changes conflict semantically. It is hard because queue throughput is limited by check time and failures cascade.",
    k: ["Queue with speculative parallel builds versus one at a time: parallel raises throughput, at the cost of wasted work when an earlier entry fails.", "Queue versus checking the change alone before merging: queue guarantees the combination was tested, while alone is cheaper but allows semantic conflicts to reach the target."],
    p: ["One slow or flaky check at the front of the queue stalls every change behind it.", "A bad entry restarts all later builds, so a flaky failure costs far more than one run."],
    v: "Queue two changes that each pass alone but fail together and confirm the second is ejected with the combined failure, while the target never goes red.",
    dep: ["mergeability","check-triggering","rebase-engine"]
  },
  "auto-merge": {
    s: "Merging a change automatically as soon as every requirement is satisfied, so the author need not return to press the button.",
    d: "An author enables auto-merge on a change. When the rule engine reports it submittable after an approval or check result, the platform performs the merge as the author or a service identity. Any new patch set or lost approval cancels it. It reduces idle time between approval and landing, which is often longer than review itself. The difficulty is safety: merging while nobody watches means a late change in state must be noticed.",
    k: ["Auto-merge canceled by any new revision versus kept: canceling is safe, while keeping saves effort but could merge code nobody reviewed.", "Merging as the author versus as a service identity: the author is accountable and permission-correct, while a service identity is stable but hides who initiated it."],
    p: ["A new push after enabling auto-merge merges unreviewed code if the cancellation is only on approval removal.", "Auto-merge on a change that targets a branch being frozen for release lands code during the freeze."],
    v: "Enable auto-merge, approve and wait for checks, and confirm it merges without a click; repeat but push a new revision before the check finishes and confirm it cancels.",
    dep: ["mergeability","rule-evaluation"]
  },
  "merge-message-generation": {
    s: "Producing the final commit message at merge: the title, description, trailers for reviewers and links, built from the change's metadata.",
    d: "For squash and merge commit strategies, the platform composes a message from the change title and description, possibly appending approver and issue references as trailers. Authors may edit it at merge time. Conventions can be enforced by a validator. The message becomes permanent history, so quality matters long after the change is forgotten. The challenge is that stale or auto-assembled text, such as a concatenation of every intermediate commit message, can be noise.",
    k: ["Using the description versus concatenating commit messages: the description is written for the final result, while concatenation keeps detail but includes fixup noise.", "Adding reviewer trailers versus omitting: trailers record accountability in history, but are redundant with platform data that can be lost."],
    p: ["The description edited after approval becomes the permanent record without anyone reviewing the new text.", "Long concatenated messages containing temporary notes or secrets are frozen into history."],
    v: "Merge a squash change with three fixup commits and confirm the message is the description with trailers, contains none of the fixup lines, and passes the project's message validator.",
    dep: ["descriptions-and-metadata","merge-strategies"]
  },
  "post-merge-actions": {
    s: "What the platform does after a successful merge: close linked items, notify, start deployment checks, update dependents and clean up.",
    d: "A merge event triggers consumers: the issue tracker closes linked items, dependents in a stack are rebased and retargeted, release notes are updated, and post-merge pipelines run on the new tip. Some checks run only after merge because they are too expensive beforehand. Failures of post-merge checks should be tied back to the change that caused them. The hard part is attribution and reaction when a merge turns the branch red.",
    k: ["Post-merge verification versus only pre-merge: post-merge catches integration issues in expensive tests, but a failure is already on the shared branch.", "Auto-reverting on post-merge failure versus alerting: reverting restores green quickly, but can revert innocent changes and surprises authors."],
    p: ["Post-merge failures with no link to the originating change leave nobody responsible.", "Closing linked items on merge, before the fix is deployed, tells users it is fixed when it is not."],
    v: "Merge a change linked to an issue and confirm the issue closes, the dependent change is retargeted, and a failing post-merge check appears on the original change's page.",
    dep: ["event-stream","tracker-linking"]
  },
  "revert-and-rollback": {
    s: "Undoing a merged change by creating a new change that reverses it, with links back to the original and the same review path.",
    d: "A revert is a new change containing the inverse of a merged one, created by one action from the original's page. It keeps the original in history and links both ways. Policies may allow a faster review for reverts of broken changes. When later changes touched the same code, the revert conflicts and needs manual work. The hard part is dependence: reverting one change in a stack or a series can break its neighbors.",
    k: ["Revert as a new change versus resetting the branch: a revert is auditable and safe for shared history, while resetting rewrites it and breaks everyone's clones.", "Expedited review for reverts versus normal: expedited restores service sooner, but a bad revert can compound an incident."],
    p: ["Reverting an earlier change in a dependent series leaves the rest compiling but wrong.", "A revert merged without rerunning the required checks introduces a new break during an incident."],
    v: "Merge a change, then merge another that touches the same lines, revert the first, and confirm the conflict is reported with both changes named and the revert links to the original.",
    dep: ["merge-strategies","change-model"]
  },
  "branch-cleanup": {
    s: "Deleting the source branch and temporary refs after merging or abandoning, so the repository does not fill with dead branches.",
    d: "On merge, the platform optionally deletes the source branch, removes temporary refs used for merge queues and previews, and keeps the pinned revision refs so history stays readable. Forks are not cleaned by the platform. Settings can apply per project. The difficulty is what must never be deleted: a branch another change targets, or the target of a stack, and refs that comments and revisions depend on.",
    k: ["Deleting the branch automatically versus keeping it: deleting reduces clutter, but breaks people who still build on it.", "Keeping all temporary refs versus expiring them: keeping is simple, but ref counts grow until repository operations slow down."],
    p: ["Deleting a branch that another open change uses as its base closes or orphans that change.", "Never cleaning queue refs makes ref advertisement slow for every fetch."],
    v: "Merge a change with its branch and confirm the branch is gone, the pinned revisions are still readable, and a dependent change has been retargeted rather than closed.",
    dep: ["repo-access","stacked-changes"]
  },

  "inline-comments": {
    s: "Comments attached to a specific line or range of a file in a specific revision, the main way reviewers give detailed feedback.",
    d: "A reviewer selects a line or range in the diff and writes a comment. The record stores the revision, side of the diff, path and range, plus text and author. The comment appears in context for everyone, and replies form a thread. Comments on deleted lines attach to the base side. It is hard because the same code appears in many revisions and views, and the comment must be shown correctly in all of them.",
    k: ["Anchoring to a revision versus to the file as it moves: revision anchors are exact, while following the file needs re-anchoring but keeps the comment visible.", "Comments on either side of the diff versus the new side only: both sides allow remarks about removed code, but double the cases in display and carryover."],
    p: ["A comment placed on the base side appears on the wrong line when the view is switched.", "Long ranges that include collapsed context hide the commented text."],
    v: "Comment on an added line, a deleted line and a multi-line range, then reopen the change from a different view mode and confirm each comment appears at the same code.",
    dep: ["comment-store","comment-anchoring"]
  },
  "comment-anchoring": {
    s: "The representation that ties a comment to a place in code, precise enough to show it correctly and stable enough to find that place again later.",
    d: "An anchor records the revision, file path, side and range, often with surrounding text. When a different revision is displayed, the platform maps the anchor through the diff between revisions, or searches for the stored text. It must handle renamed files, moved blocks and edits that change the anchored text. The challenge is the failure mode: a comment anchored in the wrong place misleads, while a comment that cannot be placed loses its context.",
    k: ["Line-number anchors versus content-based anchors: line numbers are cheap and exact in one revision, but content anchors survive shifts and can mis-place on repeated code.", "Showing an unplaceable comment at file level versus hiding it: showing keeps feedback visible, but without the context it was written for."],
    p: ["Content matching on a common line such as a closing brace places the comment on the wrong block.", "Anchors not updated after a rename leave comments attached to a path that no longer exists."],
    v: "Comment on a line, insert ten lines above it in the next revision, and confirm the comment follows the line; delete the line and confirm the comment is shown as outdated with its original text.",
    dep: ["comment-store","diff-algorithms"]
  },
  "comment-carryover": {
    s: "Showing earlier comments against newer revisions where the code still applies, and marking them outdated where it does not.",
    d: "When a new patch set arrives, each open thread is re-anchored using the diff between the revision it was written on and the new one. If the lines survive, the thread appears in place; if they changed, it is flagged as possibly addressed; if they are gone, it moves to an outdated list. Authors see what they still must handle. It is hard because rebases shift context and an automatic guess can wrongly mark feedback as handled.",
    k: ["Mark as outdated when lines change versus keep open: outdated reduces visual clutter, but hides feedback the edit did not actually address.", "Computing carryover at push time versus at view time: push time makes views fast, while view time adapts to which two revisions are compared."],
    p: ["A thread marked outdated because the line moved gets forgotten, though nothing was fixed.", "Carryover across a large rebase attaches comments to unrelated lines that happen to match."],
    v: "Leave comments, push a revision that fixes one, changes the context of another and ignores a third, and confirm each is shown respectively as outdated, moved with its code and still open.",
    dep: ["comment-anchoring","three-way-and-range-diff"]
  },
  "thread-resolution": {
    s: "The open or resolved state of each discussion thread, who may change it, and whether unresolved threads block merging.",
    d: "A thread starts open. Either the commenter or the author can mark it resolved, depending on policy, and replying may reopen it. Rules may require all threads resolved before merge. The page shows counts of unresolved threads and lets reviewers jump between them. The cultural challenge is ownership: if authors resolve their own threads, reviewers lose control, and if only reviewers can, a change stalls when one is away.",
    k: ["Author can resolve versus only the commenter: author-resolves moves work along, but reviewers lose the ability to insist.", "Resolved threads blocking merge versus advisory: blocking ensures feedback is handled, while advisory avoids deadlock over minor remarks."],
    p: ["Authors bulk-resolving threads to unblock a merge without addressing them make the count meaningless.", "A resolved thread that receives a late reply stays hidden and the reply is never read."],
    v: "Resolve a thread, reply to it, and confirm it reopens and appears in the unresolved count; with the blocking rule on, confirm merge is refused until it is resolved again.",
    dep: ["inline-comments","comment-store"]
  },
  "draft-comments-and-batching": {
    s: "Saving comments privately as drafts and publishing them together as one review, so the author gets a complete set instead of a trickle of notifications.",
    d: "While reading, a reviewer's comments are stored as drafts visible only to them. On submitting the review, all drafts publish at once together with an overall verdict and message, producing a single notification. Drafts persist across sessions and devices. It lets a reviewer change their mind before anyone sees it. The hard part is lifecycle: drafts must follow the code through new patch sets, and abandoned drafts must be findable.",
    k: ["Batching comments into one review versus publishing each immediately: batching reduces notification noise and lets reviewers revise, but delays feedback the author could act on now.", "Drafts stored on the server versus the browser: server drafts follow the user between devices, while browser storage is simpler and can be lost."],
    p: ["A draft written on an old patch set is published against code that has since changed.", "Reviewers forget unpublished drafts and the author waits indefinitely for feedback that exists only privately."],
    v: "Write three drafts on two files, close the browser, reopen on another device and confirm all three are there; publish and confirm the author receives one notification with all three.",
    dep: ["comment-store","notification-rules"]
  },
  "general-comments": {
    s: "Comments on the change as a whole or on a file, not on a line: design questions, summaries, and discussion that does not belong to specific code.",
    d: "General comments sit on the change's timeline and may also anchor at file level. They carry the discussion about approach and approvals. They are stored like inline comments but without a range. Timelines interleave them with patch set creation, votes and check results, forming the change's history. The challenge is that important decisions end up in a long timeline with no summary, and are hard to find later.",
    k: ["A single timeline for everything versus separate discussion and activity: one timeline gives a complete story, while separation keeps decisions findable.", "Allowing general comments to carry blocking votes versus only inline: general votes capture design objections, but unblocking is vaguer without a line to resolve."],
    p: ["A design objection raised in a long timeline is buried and missed by reviewers who arrive later.", "A decision recorded only in chat never reaches the change."],
    v: "Post a general comment, a file-level comment and an inline comment, and confirm the timeline shows all three in order alongside the patch set events.",
    dep: ["comment-store"]
  },
  "markup-and-mentions": {
    s: "Text formatting in comments, code blocks, links to other changes and files, and mentions that pull a named person into the discussion.",
    d: "Comments are written in a lightweight markup rendered to sanitized HTML. References to other changes, issues or commits turn into links, and typing a person's name triggers a lookup. A mention can add them as a reviewer or send a notification. Rendering must be safe, since comments are untrusted input shown to many people. The challenge is permission: a mention must not reveal a private change's existence to someone without access.",
    k: ["Rich markup versus plain text: markup supports code and lists, but adds sanitization work and rendering differences between web and email.", "Mention adds a notification only versus adds as reviewer: notification-only is gentle, while adding as reviewer creates an obligation the person did not agree to."],
    p: ["Incomplete sanitization of rendered markup lets a comment run script in other reviewers' sessions.", "Autolinking a private change in a public project leaks its title."],
    v: "Post a comment with a code block, a link to another change and a mention, and confirm all render correctly, the mentioned person is notified, and a script tag in the text is shown as text.",
    dep: ["comment-store","permissions-model"]
  },
  "reactions-and-acknowledgments": {
    s: "Lightweight responses to comments, such as acknowledgment or agreement marks, that avoid a reply whose only content is thanks.",
    d: "A reaction is a small record of user, comment and a symbol from a fixed set. Some platforms treat an acknowledgment as marking the thread done, allowing a reviewer's remark to be closed without a message. Reactions count in the display but typically do not notify. They reduce the volume of trivial replies. The question is semantics: an acknowledgment can mean seen, agreed or fixed, and tools disagree about which.",
    k: ["Reactions as decoration versus as state: decoration is harmless and free, while state lets an acknowledgment resolve work but needs clear meaning.", "Notifying on reactions versus staying quiet: quiet avoids noise, but an author may never learn a reviewer saw their reply."],
    p: ["An acknowledgment read by the author as agreement when the reviewer meant only seen leads to a merge without the fix.", "Reactions added by a bot at scale clutter every thread."],
    v: "Add an acknowledgment to a comment and confirm it shows with the user's name, does not send an email, and changes the thread state only if the configured policy says it should.",
    dep: ["comment-store"]
  }
});
