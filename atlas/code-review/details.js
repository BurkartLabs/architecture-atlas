// Details for the code review plate, part 1: storage, diff computation, change model, stacks.
ATLAS.details("code-review", {
  "change-store": {
    s: "The durable record of every change, its revisions, votes, state and metadata, kept in a database separate from the repository content it points at.",
    d: "Each change is a row or document keyed by a stable identifier, with child records for revisions, votes, labels, reviewers and state transitions. Revisions store object identifiers into the repository rather than file contents. Reads dominate, and most are lists filtered by user and state, so storage is shaped around those queries. Writes must be atomic across several records, such as a new revision that also clears votes. The hard part is keeping this store consistent with the repository it references.",
    k: ["Metadata in a database versus metadata inside the repository: a database gives fast queries and transactions, while repository storage gives replication and offline access but slow, awkward queries.", "One row per change versus an append-only event log: events give a perfect history and audit, at the cost of rebuilding current state for every read."],
    p: ["A revision recorded in the store whose commit was never durably written to the repository leaves a change that cannot be shown.", "Long-lived changes accumulate thousands of records, and list queries that load them whole become slow."],
    v: "Create a change, push three revisions, then restart every service and confirm the page shows all three revisions with their votes and that each revision's commit exists in the repository.",
    dep: ["repo-access"]
  },
  "repo-access": {
    s: "The layer that reads and writes repository content for review: resolving revisions to commits, reading file blobs, creating server-side commits and keeping review refs.",
    d: "Review needs content at exact revisions, so the platform talks to repository storage through a narrow interface: fetch a tree, read a blob, compute a merge base, create a commit from a rebase or suggestion, and update a named ref. Each revision is pinned by a ref so garbage collection cannot delete it after the author force-pushes. The challenge is cost and locking: many reviewers read the same hot repository while merges write to it.",
    k: ["Pinning every revision with a ref versus relying on branches: pinning keeps old revisions readable forever, but multiplies refs and slows operations that enumerate them.", "Server-side commit creation versus client-only commits: server commits enable one-click rebase and suggestions, but the platform must then author and sign commits in the user's name."],
    p: ["Unpinned revisions disappear after garbage collection and take the comments anchored to them with them.", "A slow repository operation holding a lock blocks merges for unrelated changes in the same repository."],
    v: "Push a revision, force-push over its branch, run repository garbage collection, then open the old revision's diff and confirm it still renders from the pinned ref.",
    dep: []
  },
  "comment-store": {
    s: "Persistent storage for comments, threads, drafts and their anchors, tuned for reading all comments of one change quickly and for writes from many people at once.",
    d: "Comments are rows holding author, text, thread parent, anchor (revision, file, range) and resolution flag. The common read loads every comment on one change; the common write adds one. Drafts are stored separately and visible only to their author until published. Retention is long, since a comment may be read years later during an incident. The hard part is the volume on busy changes and keeping thread state consistent when two people reply or resolve at once.",
    k: ["Comments in the same store as changes versus a dedicated store: one store makes transactions simple, while a dedicated one scales independently for a write-heavy, append-mostly workload.", "Storing anchors as line numbers versus content fingerprints: line numbers are cheap and exact, but fingerprints help re-anchor after edits."],
    p: ["Drafts stored in the public table with a visibility flag leak into notifications or search when one query forgets the filter.", "Deleting a comment that others replied to breaks the thread unless a tombstone remains."],
    v: "Have two users reply to the same thread at the same moment and confirm both replies persist in order, then publish a draft and confirm it appears for others only after publishing.",
    dep: ["change-store"]
  },
  "search-index": {
    s: "A secondary index over changes, comments and people that answers filtered queries such as open changes where I am a reviewer, without scanning the primary store.",
    d: "Documents are built from change events: title, description, author, reviewers, labels, state, paths touched and sometimes comment text. A query planner turns the user's query language into index lookups with sorting and paging. Updates arrive asynchronously, so the index lags the primary store by a short time. The hard part is permission filtering at query time and keeping the index repairable, since it is derived data that can drift.",
    k: ["Eventually consistent index versus querying the primary store: the index scales and supports rich text queries, but a change just updated may not appear, confusing authors.", "Indexing comment bodies versus metadata only: body search finds old discussions, at several times the index size and a larger leak surface."],
    p: ["A missed event leaves a change permanently absent from dashboards until a full reindex runs.", "Results filtered for permissions only after paging return short or empty pages for users who can see little."],
    v: "Open a change, add yourself as a reviewer and confirm it appears in your incoming list within the stated lag; delete the index, rebuild it, and confirm counts match the primary store.",
    dep: ["change-store","event-stream"]
  },
  "permissions-model": {
    s: "The rules deciding who may see, comment on, approve or merge each change, derived from repository access, groups and per-project settings.",
    d: "Permissions attach to repositories, branches and paths and are granted to users or groups with inheritance from parent projects. Each request is checked against the viewer's effective groups, resolved through the identity provider. Private changes and security fixes can narrow visibility further. The difficulty is evaluating the rule cheaply on every list row, and keeping group membership current so a person who left stops seeing code promptly.",
    k: ["Inherited project-level grants versus explicit per-change access: inheritance is simple to administer, but one broad grant exposes sensitive changes unless a narrower override exists.", "Cached group membership versus live lookups: caching keeps pages fast, but revocation takes as long as the cache lifetime."],
    p: ["A search or notification path that skips the permission check leaks titles or diffs of private changes.", "Granting review rights on a fork's changes to the target project's maintainers without scoping lets forks probe protected data."],
    v: "Remove a user from a group and confirm that within the documented delay they can no longer open a restricted change by URL, find it in search, or receive notifications about it.",
    dep: ["repo-access"]
  },
  "audit-log": {
    s: "A tamper-evident record of who did what to which change and when, covering approvals, overrides, merges, permission changes and deletions.",
    d: "Every state-changing action emits a structured record with actor, target, action, previous and new values, source address and time. Records are appended to storage that ordinary administrators cannot edit, and are retained for compliance periods. Readers include security teams and auditors looking for bypassed policy. The challenge is completeness, since any code path that writes state without logging creates a blind spot, and volume, since reads are not logged but every vote is.",
    k: ["Logging at the action API versus at the database layer: API logs carry intent and context, database logs catch every write including ones bypassing the API.", "Full before and after values versus action names only: values make investigations possible, but also copy sensitive text into a second store."],
    p: ["An override performed through an internal tool that writes directly to the store leaves no audit entry.", "Logs kept in the same database as the data they audit can be altered by whoever can alter the data."],
    v: "Perform an override merge, a permission change and a comment deletion, then query the log and confirm each appears with actor, target and values, and that editing the log fails.",
    dep: ["event-stream"]
  },
  "event-stream": {
    s: "An ordered feed of everything that happens to changes, which notifications, search, checks, analytics and webhooks all consume instead of polling the main store.",
    d: "State changes are written to the store and published as events in one transactional step, usually through an outbox table that a relay reads. Consumers track their own position and process at their own speed. Events carry identifiers, not full objects, so consumers fetch current state. Ordering is per change. The hard parts are at-least-once delivery, which means consumers must tolerate duplicates, and replaying history to rebuild a derived store.",
    k: ["Transactional outbox versus publishing after commit: the outbox never loses an event, while publish-after-commit is simpler but drops events if the process dies between the two steps.", "Thin events versus full snapshots: thin events are small and stay valid, but force consumers to read back, while snapshots let consumers work alone but go stale."],
    p: ["Consumers that assume exactly-once delivery send duplicate emails or create duplicate checks.", "One slow consumer without its own position and backlog limit forces the stream to retain data indefinitely."],
    v: "Kill a consumer, generate a hundred events, restart it and confirm it processes all hundred once each in per-change order without manual intervention.",
    dep: ["change-store"]
  },
  "scaling-and-replication": {
    s: "How the platform spreads load and survives failure: read replicas, sharding by repository, caches, and the rules for failing over without losing votes or comments.",
    d: "Reads far outnumber writes, so replicas and caches serve lists and diffs. Writes are routed to one primary per shard, usually sharded by repository or project so one repository's merges do not slow others. Diff and blob reads are cached by content identifier, which never changes. Failover must preserve acknowledged writes. The difficulty is hot spots: one enormous repository or a mass automated change can overwhelm a shard while others idle.",
    k: ["Sharding by repository versus by change identifier: repository shards keep related reads local, but one huge repository becomes a hot spot that cannot be split.", "Reading from replicas versus the primary: replicas absorb load, but a user who just commented may not see it on the next page load."],
    p: ["A read-your-writes violation after commenting makes people post duplicate comments.", "Failover to a replica with lag silently drops the last seconds of votes that users believed were saved."],
    v: "Fail the primary during a write load and confirm no acknowledged vote or comment is missing afterward, and measure page latency on a repository with the busiest change history.",
    dep: ["change-store","comment-store"]
  },

  "diff-algorithms": {
    s: "The core procedures that compute a minimal or readable set of added and removed lines between two versions of a file.",
    d: "Most review tools use a shortest-edit-script algorithm over lines, or a variant that anchors on unique lines to produce patches humans find more natural. Input files are first normalized: line endings, trailing whitespace and encoding. Output is a list of hunks with context. The problem is that minimal is not the same as readable: an algorithm can match a closing brace to the wrong block, producing a diff that is correct and confusing.",
    k: ["Shortest edit script versus anchoring on unique lines: shortest is optimal in size, while anchoring produces more intuitive hunks on code with repeated lines.", "Computing at request time versus ahead of time: on demand avoids wasted work, but a slow diff on a large file delays the page for every viewer."],
    p: ["Different clients using different diff algorithms show reviewers different hunks than the author saw locally.", "Quadratic worst cases on files with many repeated lines stall workers without a time limit."],
    v: "Diff two versions of a file with many repeated closing braces and confirm hunks align with the logical blocks edited, and that a time-limited run on a pathological file returns a coarser diff instead of hanging.",
    dep: ["repo-access"]
  },
  "intraline-diff": {
    s: "Highlights exactly which words or characters changed inside a modified line, so a reviewer can see a one-token change in a long line.",
    d: "After line-level matching pairs a removed line with an added one, a second pass compares the pair at word or character level and marks the differing spans. Tokenization follows code boundaries where possible so identifiers are not split in the middle. Spans are returned with the diff and rendered as emphasis within each side. It is hard because pairing is a guess: when a block of lines changes at once, matching the wrong lines produces noisy highlights.",
    k: ["Character-level versus word-level granularity: characters show every edit, but word level reads better on code and avoids confetti highlighting.", "Pairing lines by position versus by similarity: position is cheap, while similarity handles inserted lines in a block but costs more and can pair unrelated lines."],
    p: ["Highlighting nearly everything on a heavily rewritten line gives no information and hides the real change.", "Splitting within multi-byte characters corrupts the display."],
    v: "Change one identifier in a long line and confirm only that identifier is highlighted on both sides, including when the line contains multi-byte characters.",
    dep: ["diff-algorithms"]
  },
  "move-and-rename-detection": {
    s: "Recognizes that a file was renamed or a block of code moved, and shows it as a move with edits rather than a full delete and a full add.",
    d: "Rename detection compares deleted and added files by content similarity above a threshold and pairs them, even when the path changed. Block move detection looks for runs of lines removed in one place and added in another and marks them. This keeps a refactor that moves code reviewable. The hard parts are cost, since comparing every deleted file with every added file is quadratic, and thresholds: too low pairs unrelated files, too high misses a rename with edits.",
    k: ["Similarity threshold set high versus low: high gives exact, trustworthy pairs but misses renames with many edits; low pairs more and sometimes wrongly.", "Detecting in the diff view versus recording moves in the revision: view-time detection needs no author effort, but cannot tell intent and can differ between tools."],
    p: ["A rename plus heavy edit shown as a delete and an add loses the comment history on that file.", "Detection limits on huge changes silently turn off and every moved file appears as new."],
    v: "Rename a file with ten percent of its lines edited and confirm it appears as one renamed file with only the edits as hunks, and that comments on the old path carry over.",
    dep: ["diff-algorithms","comment-carryover"]
  },
  "whitespace-handling": {
    s: "Options and defaults for ignoring or marking whitespace changes, so reindenting does not bury the real edit.",
    d: "The diff engine can compare lines exactly, ignore trailing spaces, ignore differences in amount of whitespace, or ignore it all. A reviewer toggles this per view. The comparison runs on normalized text, then results map back to the original lines so display and comments still refer to real lines. It is hard because meaning can depend on whitespace in some formats, and because comments anchored while viewing one mode must also work in another.",
    k: ["Ignoring whitespace by default versus showing it: ignoring helps reindent reviews, but hides changes that matter in whitespace-sensitive formats.", "Normalizing before diffing versus filtering the output: normalizing is faster, but filtering keeps original line mapping exact for comments."],
    p: ["A change that breaks a whitespace-sensitive file passes review because the view hid it.", "A comment placed in ignore-whitespace mode lands on a line that does not exist in exact mode."],
    v: "Reindent a block and confirm the ignore-whitespace view shows no changes, the exact view shows all lines, and a comment made in the first view is visible at the right line in the second.",
    dep: ["diff-algorithms"]
  },
  "three-way-and-range-diff": {
    s: "Comparisons beyond two files: diffing a change against its base merged with the target, and comparing two revisions of the same change.",
    d: "A plain diff of a change against the branch tip includes other people's commits. A three-way view uses the merge base so only the author's edits show. Comparing revision two to revision three of the same change must separate what the author changed in response to review from what changed because of a rebase. Range comparison matches commits between revisions and diffs the diffs. The difficulty is that a rebase can alter every line context without altering intent.",
    k: ["Diff against merge base versus against current target tip: merge base shows the author's work only, while tip shows what will land and conflicts.", "Diffing the diffs versus diffing the results: diff of diffs ignores rebase noise, but is harder to compute and to display."],
    p: ["Comparing revisions across a rebase shows hundreds of unrelated lines and hides the one fix in them.", "Reviewing against the tip instead of the merge base pulls other people's commits into the review."],
    v: "Rebase a change onto a newer target and edit one line, then compare the two revisions and confirm only that line appears, not the rebased files.",
    dep: ["diff-algorithms","repo-access"]
  },
  "binary-and-generated-files": {
    s: "Handling of files that are not text or not written by hand: binaries, images, lockfiles, vendored code and generated output.",
    d: "Binary files get a size and type summary and, for images, a visual comparison. Generated and vendored files are recognized by path patterns or header markers and collapsed by default so they do not bury the real change. Some systems verify that the generated output matches its source by regenerating it. The difficulty is deciding what to hide: collapsing a generated file reduces noise, but a malicious edit placed there can slip through.",
    k: ["Collapse generated files by default versus show everything: collapsing keeps reviews focused, but hides the place an attacker would put a payload.", "Trusting a marker in the file versus path rules: markers follow the file, while path rules are controlled by repository owners and harder to forge."],
    p: ["Hand edits to a generated file are hidden by the collapse and later overwritten on the next generation.", "A lockfile change that swaps a dependency source is skipped because the file is collapsed."],
    v: "Add a generated file, a vendored directory and an image to one change and confirm the first two are collapsed with their size shown, the image is compared visually, and a mismatch with regenerated output is flagged.",
    dep: ["diff-algorithms"]
  },
  "syntax-aware-diff": {
    s: "A diff that compares parsed structure instead of lines, so moved functions, reformatting and reordered members are understood as such.",
    d: "Files are parsed into syntax trees and the diff matches nodes between versions, reporting insertions, deletions and moves at the level of functions or expressions. Output can be mapped back to lines for display and comments. It handles formatting changes that line diffs show as full rewrites. It is hard because it needs a parser for every format, must cope with files that do not parse, and has to produce a display people accept as faithful to the source.",
    k: ["Tree matching versus line matching: trees understand moves and reformatting, but need a parser per format and cost far more per file.", "Replacing the line diff versus supplementing it: replacing is cleaner, while supplementing keeps a familiar fallback when parsing fails or disagrees."],
    p: ["A parser that accepts slightly different syntax than the real compiler shows a diff that hides a real change.", "Files that fail to parse silently fall back, so reviewers cannot tell which view they are looking at."],
    v: "Reorder two methods and reformat a file, then confirm the structural view reports a move and no content change, and that a file with a syntax error falls back to the line diff with a visible notice.",
    dep: ["diff-algorithms"]
  },
  "diff-cache": {
    s: "A cache of computed diffs keyed by the content identifiers of both sides and the options used, since the same pair is requested by every reviewer.",
    d: "Because commits are immutable, a diff between two content identifiers with fixed options never changes, which makes it ideal to cache. The key includes algorithm version, whitespace mode and rename thresholds. Entries live in memory and in a shared store, and are often computed ahead of time when a revision is pushed. The difficulty is the key: omitting an option serves wrong results, and including too much fragments the cache.",
    k: ["Precomputing on push versus computing on first view: precomputing makes the first reviewer fast, but wastes effort on changes nobody opens.", "Caching whole diffs versus per-file diffs: per-file entries are reused across revisions where the file is unchanged, at the cost of more keys."],
    p: ["Changing the diff algorithm without bumping the version in the key serves stale diffs that disagree with fresh ones.", "Caches filled during a mass change push evict useful entries."],
    v: "Open the same revision pair twice and confirm the second load hits the cache; change the whitespace option and confirm a different entry is used and returns different output.",
    dep: ["diff-algorithms","repo-access"]
  },

  "change-model": {
    s: "The central data structure: one proposed change with an identity, an author, a target branch, a series of revisions and attached discussion.",
    d: "A change is distinct from a branch or a commit. It outlives its commits, since the author may amend, rebase and push many times, and review state belongs to the change as a whole. The model records the target branch, the source, the current revision, the set of reviewers, labels and state. Models differ on whether the unit is a branch with commits, or a single commit amended in place. The choice shapes everything that follows.",
    k: ["One change per branch versus one change per commit: per branch is familiar and groups related commits, while per commit gives finer review and cleaner history.", "A change as a mutable record versus a sequence of immutable snapshots: snapshots make comparison and audit simple, at the cost of more storage and more states to reason about."],
    p: ["Tying review state to a branch name loses it when the branch is renamed or recreated.", "Allowing the target branch to change after approval carries approvals to a place nobody reviewed."],
    v: "Open a change, amend and push five times, rename the source branch, and confirm there is still one change with five revisions and all discussion attached.",
    dep: ["change-store"]
  },
  "patch-sets": {
    s: "The numbered revisions of a change, each an immutable snapshot of the proposed code, so every comment and vote refers to exactly what was reviewed.",
    d: "Each push creates a new patch set, recorded with its commit, parent commits, timestamp and author. Earlier patch sets stay readable. Votes and comments are attached to a specific patch set, which is what lets the platform say what an approval covered. Patch sets can be created by server operations such as rebases and applied suggestions as well as by pushes. The hard part is volume: an active change can have hundreds, and each must stay cheap to load.",
    k: ["A new patch set on every push versus batching: every push gives exact history, while batching reduces noise but loses the intermediate states that reviewers saw.", "Server-created patch sets labeled separately versus mixed in: labeling shows what the author did versus what the platform did, at the cost of a more complex timeline."],
    p: ["A reviewer approving patch set three while the page shows patch set five believes they approved the latest code.", "Pushing on every save floods reviewers with notifications and obscures the meaningful revisions."],
    v: "Approve patch set two, push patch set three, and confirm the page states the approval applies to patch set two and shows the difference between them.",
    dep: ["change-model","repo-access"]
  },
  "change-ids": {
    s: "Stable identifiers that tie successive commits to the same change, so a rewritten commit is recognized as a new revision, not a new change.",
    d: "Two schemes exist. A footer in the commit message carries a generated identifier that survives amending and rebasing, and the server uses it to match a push to an existing change. Alternatively the server assigns the identifier and the branch or pull request number carries the identity. The footer scheme needs a client hook and fails if the footer is lost. The branch scheme is simpler but ties identity to a name. Either way, identity must survive history rewriting.",
    k: ["Footer in the commit message versus server-assigned number: the footer works with plain pushes and is portable, but depends on client hooks and copying it correctly.", "Matching by identifier versus by content similarity: identifiers are exact, while similarity needs no setup but can attach a push to the wrong change."],
    p: ["Squashing commits that carry different identifiers leaves a change that is silently orphaned or merged into the wrong one.", "Copy-pasting a commit message to start new work reuses the footer and overwrites an unrelated change."],
    v: "Amend a commit message, rebase and split it, pushing each time, and confirm each push either updates the intended change or is rejected with a clear error, never creating a duplicate silently.",
    dep: ["change-model"]
  },
  "lifecycle-states": {
    s: "The states a change moves through, such as open, in review, approved, merged, abandoned, and the rules for which transitions are allowed and by whom.",
    d: "A state machine records the current state and each transition with its actor and time. Open changes are active; merged is terminal and reflects a real change on the target; abandoned frees the author and can usually be restored. Some platforms derive states like approved from votes instead of storing them. Each transition triggers side effects: notifications, check cancellation, branch cleanup. The hard part is races, such as an abandon arriving during a merge.",
    k: ["Stored states versus states derived from facts: stored states are easy to query and show, while derived states cannot drift from votes and checks but cost more to compute.", "Merged detected from the repository versus set by the platform: detection catches merges done outside the tool, while platform-set is simpler but misses them."],
    p: ["A change merged by command line outside the tool stays open forever because nothing marks it merged.", "Allowing restore of an abandoned change after its branch was deleted produces a change with nothing to show."],
    v: "Merge a change from outside the platform by pushing the same commit to the target, and confirm the platform marks it merged within the documented time and closes its checks.",
    dep: ["change-model","event-stream"]
  },
  "draft-and-wip": {
    s: "A way to mark a change as not ready, so it can be pushed and tested without pulling reviewers or allowing a merge.",
    d: "A work-in-progress flag suppresses reviewer notifications, may hide the change from review queues, and blocks merge until cleared. Authors use it to run checks early or to get a single opinion before formal review. Marking ready triggers the notifications that were held. Some platforms keep drafts private to the author until published. The challenge is that the flag changes the meaning of several other features, and people forget to clear it.",
    k: ["Visible work in progress versus fully private drafts: visible lets colleagues comment early, while private gives space to experiment but hides work from the team.", "A flag versus a title prefix convention: a flag is enforceable by rules, while a prefix is flexible but easy to forget and parse wrongly."],
    p: ["A change left in work-in-progress for weeks is invisible to reviewers who filter it out.", "Marking ready sends notifications to every reviewer at once, including those added only as drafts."],
    v: "Push a change as work in progress and confirm it triggers checks but sends no review requests and cannot merge; mark it ready and confirm requests go out once.",
    dep: ["lifecycle-states","notification-rules"]
  },
  "descriptions-and-metadata": {
    s: "The title, description, linked items, labels and other fields an author supplies to explain a change, and how they relate to the commit message.",
    d: "The description says what changed and why, and is what reviewers read first. It may come from the commit message, a template, or an editable field. Metadata includes labels, target release, linked issues and testing notes. Templates prompt authors for required information. The hard part is synchronization: when the description and the commit message are separate, they drift, and the merged history records the one nobody read.",
    k: ["Description derived from the commit message versus separate: derived keeps one source of truth, while separate lets authors edit prose freely but diverges from history.", "Required template fields versus freeform: required fields raise quality, but encourage filler text entered only to pass the rule."],
    p: ["A description edited after approval changes what reviewers believed they were approving without any new revision.", "Template fields filled with placeholders pass validation and give future readers nothing."],
    v: "Edit the description after approval and confirm the change records the edit in its timeline, and that a required field left empty blocks marking the change ready.",
    dep: ["change-model"]
  },
  "patch-set-comparison": {
    s: "The view and computation that show what changed between two patch sets of the same change, which is how reviewers find out whether their feedback was addressed.",
    d: "A reviewer who already read patch set two wants only the difference to patch set four. The platform diffs the two snapshots, and when a rebase intervened, uses a comparison that removes rebase noise. Comments from the earlier patch set are shown against the new code where they still apply. It is the feature that makes repeated review tolerable, and it depends on the diff, anchoring and rebase components agreeing.",
    k: ["Comparing snapshots versus comparing author edits: snapshots are exact and simple, while author-edit comparison hides rebases but needs the more complex range diff.", "Defaulting to the latest-versus-last-viewed pair versus latest-versus-base: last-viewed saves time, but surprises reviewers who expected the whole change."],
    p: ["Rebase noise makes the comparison show the whole change, so reviewers stop using it and reread everything.", "Defaulting to last viewed hides changes made while the reviewer had the page open."],
    v: "Review patch set two, have the author push a rebase plus one fix as patch set three, and confirm the comparison shows only the fix with the earlier comments next to it.",
    dep: ["patch-sets","three-way-and-range-diff","comment-carryover"]
  },

  "stacked-changes": {
    s: "A series of small dependent changes, each reviewed on its own but built on the one before it, so large work lands as pieces a person can understand.",
    d: "Each change in the stack targets the one below as its base, so its diff shows only its own edits. The platform records the order and presents the stack as a list with status per entry. Review proceeds in parallel, and merging runs bottom up. When a lower change is edited or merged, everything above must be rebased. It is hard because one edit at the bottom triggers a cascade of new revisions, checks and notifications.",
    k: ["Server-tracked stacks versus branches chained by convention: tracked stacks give status and one-click restack, while branch chains work with any tool but break easily.", "Merging the whole stack together versus piece by piece: together is atomic but blocks on the slowest, while piece by piece lands early work but exposes partial states."],
    p: ["Editing the bottom change invalidates approvals and rerun checks for every change above it, and reviewers are flooded.", "Merging the middle of a stack first leaves the changes above targeting a base that no longer exists."],
    v: "Create a stack of three, amend the bottom, and confirm the platform restacks the others automatically, shows each one's own diff only, and merges them bottom up on request.",
    dep: ["change-dependencies","rebase-engine"]
  },
  "change-dependencies": {
    s: "The directed graph recording which changes depend on which, used to order merges, propagate rebases and warn when a dependency is not ready.",
    d: "Edges come from explicit declarations or are inferred from parent commits. The graph is queried to find everything above a change and everything below it, and to check cycles. Merge rules consult it: a change cannot merge while a dependency is open unless they merge together. Cross-repository dependencies are possible when changes in two repositories must land as a unit. The difficulty is keeping the graph right when commits are reordered, split or dropped.",
    k: ["Inferred from commit parents versus declared explicitly: inferred needs no author effort, while explicit survives rewrites and works across repositories.", "Blocking merge on any open dependency versus warning only: blocking prevents broken main, but stalls changes behind unrelated delays."],
    p: ["A dependency left pointing at an abandoned change blocks its dependents indefinitely with a confusing message.", "Cycles introduced by reordering commits break graph walks that assume a tree."],
    v: "Declare a dependency, abandon the lower change and confirm the upper one shows a clear blocked reason; attempt to create a cycle and confirm it is rejected.",
    dep: ["change-model","change-store"]
  },
  "rebase-engine": {
    s: "The server-side component that replays a change's commits onto a new base, producing a new revision without the author running anything locally.",
    d: "Given a change and a new base, the engine applies each commit on top of the base using a three-way merge, in a temporary workspace that is never the main repository. On success it creates new commits and a new patch set; on conflict it reports the files involved. It runs for one-click rebase, for restacking, and before merge when the policy requires a linear history. The hard parts are doing it fast on large repositories and not corrupting the repository when it is interrupted.",
    k: ["Server-side rebase versus author-only rebase: server-side removes friction and keeps changes current, but creates commits the author did not write or sign.", "Replaying commit by commit versus merging the net result: replaying preserves each commit but conflicts repeatedly, while net result conflicts once and loses structure."],
    p: ["A rebase that succeeds textually can still break the build, since nothing ran the tests on the result.", "Concurrent rebases of the same change produce two competing patch sets."],
    v: "Advance the target with an unrelated edit, trigger the rebase, and confirm a new patch set appears with the same author edits, a new parent, and checks restarted.",
    dep: ["repo-access","conflict-detection"]
  },
  "conflict-detection": {
    s: "Determining whether a change can be applied to its target branch without textual conflicts, and keeping that answer current as the branch moves.",
    d: "The platform attempts a trial merge of the change with the target tip in a temporary workspace and records the result: clean, conflicting files, or unknown. It reruns when either side moves, usually triggered by events on the target branch. For performance, results are cached by the pair of commits. A clean result only means no overlapping edits, not that the code works. The challenge is the number of changes to recheck after each merge to a busy branch.",
    k: ["Recomputing on every target update versus lazily on view: eager keeps lists accurate, but costs a trial merge for every open change on every merge.", "Reporting conflicts early versus only at merge time: early lets authors fix them while context is fresh, at the price of constant churn in status."],
    p: ["A stale conflict flag tells authors to fix a conflict that no longer exists, or hides a new one.", "Trial merges on huge repositories saturate the same workers that serve diffs."],
    v: "Edit the same line on the target and in an open change, and confirm the change shows a conflict naming the file within the documented delay; revert the target edit and confirm the flag clears.",
    dep: ["repo-access","event-stream"]
  },
  "conflict-resolution": {
    s: "The ways a conflict gets resolved: the author rebases locally, edits in the browser, or a tool proposes a merge result that a person checks.",
    d: "The simplest path is the author rebasing locally and pushing a new revision. Some platforms offer a web editor showing conflict markers, which creates a new revision with the resolution. The resolution is itself code that needs review, since a bad resolution can drop the other side's work. Good tools show the resolution as a diff against both parents. The challenge is that reviewers see only the result, not what the author discarded.",
    k: ["Local resolution versus browser resolution: local has full tooling and tests, while the browser is convenient for small conflicts but cannot run the code.", "Reviewing the resolution as a normal diff versus a combined diff: a normal diff is familiar but hides what came from the other side, while a combined diff shows both and is harder to read."],
    p: ["A resolution that quietly discards the target side's change goes unnoticed because the diff against the base looks normal.", "Browser resolutions skip the local test run and break the build."],
    v: "Resolve a conflict in the browser, push, and confirm a new patch set appears, checks run on the result, and the comparison view shows what was taken from each side.",
    dep: ["conflict-detection","patch-sets"]
  },
  "backport-and-cherry-pick": {
    s: "Copying a merged or open change onto another branch, such as a release branch, as a new change that tracks its origin.",
    d: "The platform creates a new change on the chosen branch containing the same edits, using a cherry-pick in a temporary workspace. It links the new change to the original and, optionally, copies approvals or reviewers. Conflicts on older branches are common and need a human. Backports are tracked so a team can see which fixes reached which releases. The hard part is deciding how much review the copy needs, since the code was approved but in another context.",
    k: ["Carrying over approvals versus requiring fresh review: carrying saves effort for clean copies, but approval was for different surrounding code.", "Automatic backport on a label versus manual request: automatic is quick and consistent, while manual lets a person judge whether the fix is safe for the older branch."],
    p: ["A clean cherry-pick that depends on an earlier unbackported change compiles but behaves wrongly.", "Lost links between original and copy leave no way to know whether a release has the fix."],
    v: "Label a merged change for a release branch and confirm a linked change appears there with the same edits, and that the original lists it as a backport.",
    dep: ["rebase-engine","change-model"]
  }
});
