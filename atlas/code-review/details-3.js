// Details for the code review plate, part 3: people, suggestions, display, interface, notifications, analytics.
ATLAS.details("code-review", {
  "reviewer-assignment": {
    s: "Choosing who is asked to review a change: the author's picks, suggestions from history, owners required by rule and automatic assignment.",
    d: "Reviewers get on a change by several routes: the author adds them, rules add required owners, a mention adds them, or an assigner picks someone based on file history and workload. Each reviewer record says whether the review is required or optional. Adding triggers a request notification. The hard part is the mix: when many routes add people, nobody knows whose approval counts, and the author ends up asking everyone.",
    k: ["Author chooses versus platform assigns: author choice uses knowledge of who cares, while automatic assignment spreads load and prevents favorites.", "Many reviewers versus few: many give coverage, but each assumes someone else is looking and the review gets shallower."],
    p: ["A change with eight reviewers gets no thorough review because each expects another to do it.", "Required reviewers added by rule but never notified leave the change waiting silently."],
    v: "Open a change touching two owned directories and confirm the owners are added as required reviewers, receive a request, and that the page shows who is required versus optional.",
    dep: ["owner-resolution","review-requests-and-reminders"]
  },
  "code-owners": {
    s: "Declarations of who is responsible for which paths, used to require their approval for changes there.",
    d: "Ownership is declared in files near the code, mapping path patterns to people or teams. The platform finds the owners of every file a change touches and requires approval from at least one owner of each area. Files can nest, and some formats allow different owners for different kinds of change. Ownership turns review from a general courtesy into a guarantee that the people who know the code have seen it.",
    k: ["Ownership files in the repository versus a central service: files travel with the code and are reviewed, while a service can enforce across repositories but is distant from the code.", "One owner per area versus many: one is accountable but a bottleneck, many is resilient but diffuses responsibility."],
    p: ["Ownership files that go stale name people who left, so approvals are impossible or random.", "Overly broad root ownership means every change needs the same few people."],
    v: "Change files in two owned areas and confirm approval from one owner of each is required, that approval from a non-owner does not satisfy it, and the page names the missing owners.",
    dep: ["repo-access"]
  },
  "owner-resolution": {
    s: "Computing, for a given change, which owners apply to each file and which combination of approvals satisfies the ownership requirement.",
    d: "The resolver reads ownership files at the target branch, matches each changed path to the most specific pattern, expands teams to members, and finds a minimal set of approvers covering all paths. It also knows which owners have already approved. Results feed the rule engine and the reviewer suggestions. It is hard because the covering problem is combinatorial for large changes, and because ownership at the target may differ from ownership in the change.",
    k: ["Resolving from the target branch versus from the change: the target prevents a change from granting itself ownership, but lags legitimate ownership edits.", "Most specific match wins versus union of matches: most specific is predictable, while union is stricter but demands approvals from distant owners."],
    p: ["A change that edits ownership files and is approved by newly added owners approves itself if resolution reads the change's own files.", "Very large changes make resolution slow enough to delay the page."],
    v: "Change files with nested ownership and confirm the resolver picks the most specific owners per file, outputs the smallest covering set of approvers, and updates when one approves.",
    dep: ["code-owners","team-resolution"]
  },
  "load-balanced-assignment": {
    s: "Picking reviewers by recent workload and expertise so review effort is spread and no single expert becomes the bottleneck.",
    d: "The assigner takes candidates from ownership and file history, filters out those unavailable, and scores them by how many reviews they currently have open and have done recently. It picks one or several, round-robin or weighted. Teams use it to turn shared ownership into concrete requests. The hard part is fairness versus fit: the least busy person may be the least familiar, and a pure load balance ignores expertise.",
    k: ["Round robin versus weighted by load: round robin is predictable and easy to explain, while weighted adapts to real queues but is harder to trust.", "Assign one primary versus notify a whole team: one primary creates ownership of the response, while notifying all lets anyone pick it up but invites diffusion."],
    p: ["Assigning to someone with no context produces rubber-stamp approval.", "Load measured by count of open reviews treats a one-line change and a ten-thousand-line change alike."],
    v: "Open ten changes in an owned area with three eligible people and confirm assignments are spread roughly evenly, skip anyone marked away, and prefer people who touched those files.",
    dep: ["owner-resolution","availability-and-delegation"]
  },
  "attention-set": {
    s: "An explicit list of whose turn it is on each change, so each person sees only the changes where the next move is theirs.",
    d: "The platform tracks, per change, the people who need to act: the reviewer when asked or when the author replies, the author when feedback arrives. Actions update the set automatically, such as replying removing the replier and adding the other party. Dashboards sort by it. It replaces guesswork about who is waiting for whom. The hard part is getting the automatic rules right, since a wrong entry either hides a change someone must act on or nags someone who need not.",
    k: ["Automatic attention updates versus manual only: automatic saves effort and matches common flows, but errs in unusual cases that people must correct by hand.", "A per-person turn marker versus a change-level status: per-person is accurate with several reviewers, but is more state to display and explain."],
    p: ["A reviewer removed from the set by an unrelated comment never sees the author's reply.", "Setting attention on everyone on every comment recreates the noise it was meant to remove."],
    v: "Have the author reply to a reviewer's comment and confirm the reviewer enters the set and the author leaves; have the reviewer approve and confirm the change leaves both lists.",
    dep: ["change-store","event-stream"]
  },
  "review-requests-and-reminders": {
    s: "The explicit ask to review and the follow-ups when nothing happens, including nudges to reviewers and escalation when a change stays idle.",
    d: "Adding a reviewer sends a request through the notification system. If no activity follows within a period, a reminder goes to the reviewer, then possibly to the author or a lead. Reminders respect working hours and availability. Authors can also nudge manually. The aim is to cut the wait, which dominates review time. The difficulty is calibration: too few reminders and changes stall, too many and people mute them.",
    k: ["Automatic reminders versus manual nudges: automatic is consistent and shortens waits, while manual nudges carry social context and fewer false pings.", "Escalating to a manager versus the author only: escalation unblocks stalled work but can feel punitive and distort behavior."],
    p: ["Reminders sent to a person on leave pile up and are ignored when they return.", "Reminders firing on changes already abandoned or merged erode trust in the system."],
    v: "Request a review, leave it idle past the reminder period and confirm one reminder is sent within working hours; then approve it and confirm no further reminders arrive.",
    dep: ["notification-rules","availability-and-delegation"]
  },
  "team-resolution": {
    s: "Expanding a group or team reference into the people who belong to it, using the identity provider, and keeping that mapping fresh.",
    d: "Ownership and review rules often name teams. The platform queries the identity or directory service for members, caches the result and refreshes it periodically or on change events. Nested teams expand recursively. Resolution is used for assignment, for approval eligibility and for notifications. The difficulty is staleness and cycles: a person added to a team should be able to approve soon, and nested groups can reference each other.",
    k: ["Cached membership versus live lookups: cached is fast and survives directory outages, while live is current but slows every evaluation.", "Nested team expansion versus flat membership: nested mirrors the organization, but needs cycle checks and makes who counts harder to see."],
    p: ["A person who left a team keeps approval rights until the cache refreshes.", "A directory outage makes every team-based rule evaluate to nobody and blocks merges."],
    v: "Add a user to a team in the directory and confirm they become eligible to approve within the refresh period; remove them and confirm the opposite, including when nested.",
    dep: ["permissions-model"]
  },
  "availability-and-delegation": {
    s: "Recording that a reviewer is away and routing their reviews elsewhere, so absence does not stall changes.",
    d: "People set status such as out of office with dates, sometimes imported from a calendar. The assigner skips them, reminders are paused, and pending requests can be handed to a delegate. Some rules allow a delegate's approval to count in place of the owner's. The hard part is trust and clarity: delegation changes who is accountable, and authors need to see why the person they asked has not responded.",
    k: ["Importing availability from calendars versus asking people to set it: calendars are accurate without effort, but expose private schedules and misfire on meetings.", "Delegate approval counts versus informational only: counting keeps work moving, but lets an unnamed delegate satisfy an ownership rule."],
    p: ["Requests sent to someone who is away sit unseen while the page shows nothing amiss.", "A delegate with broad rights approves areas they do not know."],
    v: "Mark a reviewer away with a delegate, request their review, and confirm the request goes to the delegate, the page shows why, and the original reviewer is not reminded.",
    dep: ["team-resolution"]
  },

  "suggested-edits": {
    s: "Comments that carry a concrete replacement for the lines they point at, so the author sees the exact proposed edit, not a description of it.",
    d: "A reviewer selects lines and writes replacement text in a structured block inside the comment. The platform stores it as a patch against that revision and renders it as a diff in the comment. Suggestions turn small nitpicks into one click. They are stored with the revision they apply to and become invalid when the lines change. It is hard because a suggestion is code written without running it.",
    k: ["Suggestion as a structured patch versus free text: a patch can be applied exactly, while free text is flexible but needs the author to retype.", "Allowing multi-file suggestions versus single range: multi-file is powerful for renames but harder to display and apply atomically."],
    p: ["A suggestion written against line numbers of an old patch set lands on the wrong code when applied.", "Whitespace lost in rendering makes an applied suggestion differ from what was shown."],
    v: "Make a suggestion replacing three lines, view it as a diff in the comment, and confirm the stored patch matches the displayed one character for character, including indentation.",
    dep: ["inline-comments","diff-algorithms"]
  },
  "apply-suggestions": {
    s: "Applying a suggestion with one action, which creates a new revision containing the edit and credits the suggester.",
    d: "On apply, the platform checks the suggestion still matches the lines in the latest revision, creates a commit on the change's branch with the edit, and records a new patch set. The commit lists the suggester as co-author. If lines have moved, application fails with an explanation. Applied suggestions resolve their thread. It removes a round trip, but runs without the author's local build and tests.",
    k: ["Applying as a new commit versus amending: a new commit is transparent and easy to undo, while amending keeps history tidy but rewrites what reviewers saw.", "Allowing application only by the author versus anyone with write access: author only keeps control, while broader access speeds simple fixes."],
    p: ["Applying a suggestion that does not compile and merging without running checks breaks the build.", "Applying on top of a newer local edit that was not pushed overwrites the author's work."],
    v: "Apply a suggestion and confirm a new patch set is created with the edit, the commit credits the suggester, checks rerun and the thread is resolved; apply one whose lines changed and confirm it refuses.",
    dep: ["suggested-edits","rebase-engine","patch-sets"]
  },
  "linter-annotations": {
    s: "Findings from style and static analysis tools, shown as comments or marks on the exact lines they refer to.",
    d: "A tool analyzes the revision and posts findings through the check results API, each with a path, range, severity and message. The review page overlays them on the diff, usually distinguishing them from human comments and filtering to the lines the change touched. Authors fix them before humans look, saving reviewer time on mechanical points. The difficulty is noise: findings on code the author did not write, or a rule the team disagrees with, drown real signals.",
    k: ["Showing findings only on changed lines versus on whole files: changed lines keep focus on the author's work, but hide a real problem that the change exposes elsewhere.", "Blocking on errors versus informational only: blocking enforces standards, but false positives halt merging."],
    p: ["Hundreds of low-severity findings on a large change bury the one that matters.", "Findings anchored to a line number of a previous patch set point at the wrong code."],
    v: "Push a change with a known style violation and confirm the finding appears on that line with severity, nothing appears on untouched lines, and it disappears after the fix.",
    dep: ["check-results-api","comment-anchoring"]
  },
  "bot-comments": {
    s: "Comments written by automated accounts, such as coverage summaries and dependency notices, displayed distinctly from human review.",
    d: "Bots use service credentials to post comments and sometimes votes. The platform labels them, may collapse them by default, and prevents their votes from counting for ownership unless explicitly allowed. Bots may update a single comment instead of adding new ones each run. The challenge is volume and trust: ten bots on every change create a wall of text, and a bot's approval can turn into a loophole.",
    k: ["Editing one bot comment versus posting new ones: editing keeps the page tidy, but hides history and does not notify.", "Bots allowed to vote versus comment only: voting lets automation gate or approve safe changes, but expands what a compromised token can do."],
    p: ["A bot posting a new comment on every push fills the timeline until humans stop reading it.", "A bot with approval rights and a leaked token approves anything."],
    v: "Push three revisions and confirm the coverage bot updates its single comment rather than adding three, is labeled as automated, and its vote is excluded from human approval counts.",
    dep: ["check-results-api","permissions-model"]
  },
  "auto-fix-proposals": {
    s: "Automatic proposals for fixing mechanical problems such as formatting or simple lint violations, offered as a suggestion or a pushed revision.",
    d: "A tool computes a fix, such as running a formatter, and the platform presents it as a suggested edit or, with the author's consent, applies it as a new patch set. The proposal is tied to the revision it was computed from and discarded when the code changes. It saves authors the manual round trip for deterministic corrections. The hard part is authority: a bot that pushes commits to the author's branch must not be able to push something harmful.",
    k: ["Proposing as a suggestion versus pushing directly: a suggestion keeps the author in control, while pushing is fastest but changes their branch uninvited.", "Fixing in the review tool versus in a pre-commit hook: the hook prevents the problem at the source, while review fixing catches those who skipped it."],
    p: ["A formatter version mismatch between the bot and the project reformats unrelated lines.", "An auto-pushed commit invalidates approvals and restarts all checks for a trivial change."],
    v: "Push unformatted code and confirm a fix is offered tied to that patch set, applying it yields a formatted revision with approvals handled per policy, and a new push discards the offer.",
    dep: ["suggested-edits","apply-suggestions"]
  },
  "assisted-review": {
    s: "Model-generated review feedback or summaries, offered as comments or descriptions that a human accepts, edits or dismisses.",
    d: "A model reads the diff and its context and produces a summary of the change, potential defects or questions. Output is posted as clearly marked comments or a draft for the reviewer to adopt. It does not hold approval authority. Quality depends on the context supplied and on filtering out low-value remarks. The challenge is precision: a wrong remark costs the author time, and confident wrong remarks erode trust in all feedback.",
    k: ["Posting automatically versus on request: automatic gives broad coverage, but spends author attention on every change, while on request spends it only where wanted.", "Surfacing only high-confidence findings versus everything: high confidence preserves trust, but misses subtle issues a human would want raised."],
    p: ["Authors accept a plausible but wrong suggestion because it came with confident wording.", "Sending proprietary code to an external model without approval breaches the project's rules."],
    v: "Run it on a change with a seeded defect and a clean change, and confirm the defect is flagged with a line reference, the clean change gets no spurious comments, and every comment is marked as generated.",
    dep: ["bot-comments","review-api"]
  },

  "diff-views": {
    s: "The ways of showing a diff: side by side or unified, with controls for what to compare and how much context to display.",
    d: "Side by side aligns old and new text in two columns, with blanks where lines were added or removed. Unified interleaves them in one column. The view takes a computed diff and renders it with line numbers, markers and any comments or annotations. Reviewers switch modes and choose the base to compare against. It is hard because every overlay, such as comments, highlights and expansion, must align across both layouts and across very long files.",
    k: ["Side by side versus unified: side by side is easier for modifications, while unified fits narrow screens and long additions.", "Rendering the whole file versus windowing: windowing keeps memory low, but breaks in-page search and jumping to a line not yet drawn."],
    p: ["Long lines in side-by-side mode force horizontal scrolling that hides the changed part.", "Windowed rendering breaks the browser's find-in-page, so reviewers miss matches."],
    v: "Open a change with a long file, toggle both views, and confirm line numbers, comments and highlights match in each, and that find-in-page locates text in a part not yet scrolled to.",
    dep: ["diff-algorithms","intraline-diff","inline-comments"]
  },
  "syntax-highlighting": {
    s: "Coloring code by token type in the diff, which makes structure readable and requires recognizing the format of each file.",
    d: "A tokenizer identifies the format from the file name or content and labels tokens as keywords, strings, comments and so on. The page applies styles per token. For diffs it must highlight each side separately yet keep alignment, and handle partial files, since a hunk may start inside a multi-line string or comment. It runs on the server or in the browser. The challenge is cost on big files and correctness in the middle of a construct.",
    k: ["Highlighting in the browser versus on the server: the browser spares server load, but costs time on weak devices and varies by version.", "Highlighting hunks alone versus whole files: hunks are cheap but misread constructs that began above, while whole files are correct but heavier."],
    p: ["A hunk starting inside a block comment is colored as code and looks wrong or misleading.", "Highlighting a megabyte-long line freezes the page."],
    v: "View a hunk that begins inside a multi-line string and confirm it is colored as a string, and open a file with a very long line and confirm the page stays responsive.",
    dep: ["diff-views"]
  },
  "file-navigation": {
    s: "The tools for moving through a change: the file tree, per-file summaries, jump to next comment, and keyboard shortcuts.",
    d: "A change may touch hundreds of files. A tree shows paths with counts of added and removed lines, comment counts and viewed marks. Reviewers jump between files and between unresolved threads. Ordering matters: tests next to the code they test, or the most important files first. Keyboard shortcuts let experienced reviewers work without the mouse. The difficulty is orientation in a large change, where the tool should help a person decide where to look first.",
    k: ["Alphabetical order versus ordering by importance: alphabetical is predictable, while importance ordering helps reviewers but needs a heuristic that can be wrong.", "A file tree versus a flat list: a tree shows structure, while a flat list is easier to scan for a single known file."],
    p: ["A file buried among hundreds with a security-relevant edit is never opened.", "Keyboard shortcuts that collide with browser or assistive technology bindings make the page unusable for some people."],
    v: "Open a change with two hundred files and confirm the tree loads quickly, shows counts, jumping to the next unresolved thread works across files, and shortcuts do not trigger while typing a comment.",
    dep: ["diff-views","thread-resolution"]
  },
  "viewed-state": {
    s: "Per-reviewer marks that a file has been read, which persist across visits and reset when the file changes in a new revision.",
    d: "As a reviewer finishes a file they mark it viewed. The platform stores a record per user, file and content identifier, so the mark disappears automatically if the file changes. The tree shows progress. It helps with large changes where a reviewer works over several sessions and wants to see only what remains. The challenge is the reset rule: marks should clear for edits but survive a rebase that left the file's diff unchanged.",
    k: ["Resetting when the file changes versus when the patch set changes: per file keeps progress through unrelated pushes, but needs a comparison of file contents.", "Per user marks versus a shared review state: per user matches how people work, while shared marks tell the team what has been covered but invites false confidence."],
    p: ["Marks not cleared after an edit let a reviewer skip a changed file believing it was read.", "Marks lost after every rebase force reviewers to start over."],
    v: "Mark three files viewed, push a revision editing one of them and rebasing the others, and confirm only the edited file reverts to unviewed.",
    dep: ["file-navigation","patch-set-comparison"]
  },
  "large-diff-handling": {
    s: "The behavior when a change is too big to render at once: limits, partial loading, warnings and tools for splitting the review.",
    d: "Computing and rendering tens of thousands of lines can exceed time and memory limits. The platform sets thresholds, loads files lazily or on request, truncates diffs of huge files and warns reviewers. Some systems encourage splitting, refusing to display changes above a limit. The result must be honest about what is not shown. It is hard because silently omitting content is dangerous, and refusing to show it blocks legitimate large refactors.",
    k: ["Hard limit versus graceful truncation: a limit forces smaller changes, but blocks legitimate mechanical refactors, while truncation allows them but hides part of the change.", "Loading files on demand versus all at first: on demand keeps the page fast, but approvals can be given without opening everything."],
    p: ["A truncated file diff with no visible notice is approved though the hidden part contains the defect.", "Approving a change that the reviewer could only partially load gives false assurance."],
    v: "Open a change with fifty thousand changed lines and confirm the page loads within budget, shows which files were truncated or not loaded, and that approval warns when files remain unviewed.",
    dep: ["diff-cache","viewed-state"]
  },
  "context-expansion": {
    s: "Revealing unchanged lines around a hunk, so a reviewer can read the surrounding code without leaving the review.",
    d: "Diffs show a few lines of context by default. A reviewer clicks to expand above or below a hunk, or to see the whole file. The page fetches the extra lines from the revision's blob and aligns them with the existing hunks. Comments may be placed on expanded lines. It is cheap in concept, but depends on reading file content for the right revision on either side, and keeping line mappings correct when the two sides differ.",
    k: ["Fetching context on demand versus sending with the diff: on demand keeps responses small, but each expansion adds latency.", "A fixed amount of context versus function-aware context: fixed is predictable, while function-aware shows the enclosing definition but needs parsing."],
    p: ["Expanding on the wrong side shows lines from the base while the reader thinks they are new.", "Comments placed on expanded lines have no stored anchor if context was not part of the diff."],
    v: "Expand context above a hunk on both sides and confirm the lines match the file at each revision, line numbers continue correctly, and a comment placed on an expanded line persists.",
    dep: ["diff-views","repo-access"]
  },
  "rich-previews": {
    s: "Rendering non-text files and structured documents, such as images, diagrams and documents with markup, in a form a reviewer can judge.",
    d: "For images the page shows old and new side by side, in a swipe or overlay, with size and dimension changes. For documents with markup it renders both versions, and may show changes within the rendered text. Previews are produced by sandboxed converters, since the file is untrusted. Large or unusual formats fall back to a download link. The difficulty is safety and fidelity: a preview must not run the file's code, and must match what users will see.",
    k: ["Rendering previews in the review tool versus linking to a deploy preview: in tool is quick and always available, while a deploy preview shows true behavior but needs infrastructure.", "Sandboxed conversion versus client rendering: server conversion isolates risk and is consistent, but costs compute and delay."],
    p: ["A crafted image or document that exploits a converter compromises the review service.", "A rendered preview that differs from production hides a visual regression."],
    v: "Change an image and a markup document and confirm both are shown old versus new, a malformed file is rejected without crashing the converter, and the converter has no network or file access.",
    dep: ["binary-and-generated-files","diff-views"]
  },

  "change-lists": {
    s: "Filtered lists of changes, such as incoming reviews, my open changes and everything in a project, with status shown at a glance.",
    d: "Each row shows title, author, age, size, reviewers, check status and requirement status. Lists come from the search index with sorting and paging, and are grouped into sections. They are the starting point of every session, so they must load fast and be right about what needs action. The challenge is density: the row must carry enough signals to choose what to open, without becoming a wall of badges.",
    k: ["Grouping by who must act versus by state: grouping by turn directs work, while state grouping is neutral and predictable.", "Live updating lists versus manual refresh: live is current but moves rows under the cursor, while manual is stable but can be stale."],
    p: ["A list showing a change as approved, when a new push has cleared approvals, sends authors to merge a refused change.", "Rows moving under the pointer cause misclicks on the wrong change."],
    v: "Open the incoming section with a hundred changes, confirm the first page loads within budget, each row's status matches its page, and a new push updates the row's check and approval status.",
    dep: ["search-queries","attention-set","rule-evaluation"]
  },
  "review-page": {
    s: "The single page for one change, combining description, status, requirements, timeline, files and diffs.",
    d: "It loads the change record, the current patch set, the submit requirements, check results and the comment threads, and then the diffs for chosen files. Actions available depend on the viewer: vote, reply, rebase, merge. The page updates as others act. Most review time is spent here, so latency matters more than anywhere else. The challenge is fanning out to many backends for one view without slowing it down.",
    k: ["One aggregate request versus many small ones: one request is simple to cache and reason about, while many allow progressive display but cause waterfalls.", "Server-rendered first view versus client-rendered: server rendering shows content sooner, while client rendering makes later interaction smoother."],
    p: ["A slow check status service delays the whole page unless it loads separately.", "Stale data after another reviewer's action leads to conflicting votes or duplicate comments."],
    v: "Load a change with fifty comments and twenty checks and confirm the description and status appear within the page budget, diffs load next, and another user's comment appears without a reload.",
    dep: ["change-store","comment-store","submit-requirements","diff-views"]
  },
  "search-queries": {
    s: "A query language and its parser that lets people ask for sets of changes by author, reviewer, state, label, path and age.",
    d: "Queries combine operators and values with boolean logic, such as open changes where I am a reviewer and checks have failed. The parser converts them into index queries. Saved queries drive dashboards. Terms resolve names to identities, expanding groups. It is hard because users learn it once and rely on it for months, so semantics must stay stable, and because every operator adds work to the index.",
    k: ["A structured query language versus free text: structure is precise and saveable, while free text is easy to start with but ambiguous.", "Operators computed from the index versus filtered afterward: from the index is fast, while post-filtering allows any condition but pages poorly."],
    p: ["Changing an operator's meaning breaks saved dashboards that teams rely on.", "A query with a very broad term returns pages of results the user cannot see, because permissions are filtered afterward."],
    v: "Run a query combining state, reviewer and failed checks, and confirm results match a manual scan of the primary store, and that a malformed query returns an error naming the bad term.",
    dep: ["search-index"]
  },
  "personal-inbox": {
    s: "A per-person view assembling what needs that person's action: reviews waiting, own changes with feedback, and approved changes ready to merge.",
    d: "The inbox merges several queries, sorted by urgency and attention state, and hides changes where nothing is expected of the viewer. It can be the default landing page, and can feed a digest or a mobile app. Users customize sections. The aim is to turn the stream of events into a short to-do list. The difficulty is correctness: a missing item is a lost review, and an item that cannot be cleared becomes a permanent nag.",
    k: ["A fixed set of sections versus user-defined queries: fixed sections work out of the box, while custom queries fit varied workflows but can be misconfigured.", "Showing everything that touches me versus only what needs action: everything gives awareness, while action-only keeps the list short and trustworthy."],
    p: ["A change that the viewer cannot clear, because the author never acts, stays on their list for weeks.", "A section built on a stale index misses a review requested a minute ago."],
    v: "Have a colleague request a review and push feedback on your change, and confirm both appear in the right sections within seconds and leave when you act.",
    dep: ["change-lists","attention-set"]
  },
  "command-line-client": {
    s: "A terminal tool for creating, updating, listing and checking out changes, so the whole review loop can run from the author's repository.",
    d: "The client pushes a branch or commit in a form that creates or updates a change, with options for reviewers, labels and work-in-progress. It can list incoming changes, fetch a change's code, and apply a revision locally. It talks to the review API or to special refs on the repository server. It is popular with heavy users and with automation. The challenge is parity: features that exist only on the web page cannot be used from scripts.",
    k: ["Special refs on the repository server versus an API: refs reuse the existing transport and credentials, while an API is richer but needs separate authentication.", "A dedicated client versus plain pushes with options: a client is friendlier, but another tool to install and keep current."],
    p: ["Pushing to the wrong ref publishes work in progress to the target branch if protection is missing.", "A client version that differs from the server's expectations creates changes with missing identifiers."],
    v: "From a clean checkout, create a change with a reviewer from the command line, amend and update it, list incoming changes and check out another person's revision, and confirm each matches the web page.",
    dep: ["review-api","change-ids"]
  },
  "editor-integration": {
    s: "Plugins that show review comments, status and diffs inside an editor, so feedback can be addressed where the code is.",
    d: "The plugin uses the review API to fetch threads for the checked-out change and displays them at the matching lines, mapping through local edits. It can reply, resolve, and refresh checks. Reviewers can also read changes with full code navigation, which a browser diff lacks. It makes responding to feedback faster. The challenge is anchoring: the local file differs from the reviewed revision, so threads must be placed through the same mapping the server uses.",
    k: ["Using the editor's native diff versus the platform's view: native has code navigation and local tools, while the platform view matches what colleagues see.", "Read-only feedback versus full actions: read-only is simple and safe, while full actions save switching but multiply the permissions and states to handle."],
    p: ["Threads displayed at the wrong lines after local edits lead people to change the wrong code.", "A plugin holding a long-lived token on a laptop widens the damage if it is stolen."],
    v: "Check out a change with comments, edit the file locally, and confirm threads remain on the right code; reply from the editor and see the reply on the review page.",
    dep: ["review-api","comment-anchoring"]
  },

  "notification-rules": {
    s: "The logic deciding who is told about which events, and by what route, based on role, preferences and the nature of the event.",
    d: "Each event, such as a new patch set, comment, vote or merge, is matched to interested people: author, reviewers, mentioned users and watchers of the project or path. Per-user settings narrow this by event type and by whether the person is in the attention set. The rules produce messages for the delivery layer. The challenge is volume: too many notifications are muted wholesale, which defeats the system, while too few leave people unaware they are needed.",
    k: ["Notify by role and attention versus by every event: by attention is targeted and quiet, while by every event is complete but swamps people.", "Defaults tuned per organization versus global: organizational defaults fit local culture, but make support harder and new users confused."],
    p: ["A person who watches a busy project gets thousands of messages and turns notifications off entirely.", "A rule bug that skips the author when a bot comments hides feedback on their change."],
    v: "Generate each event type on a test change and confirm the author, reviewers, a mentioned user and a watcher receive exactly the messages their settings allow, and nobody else does.",
    dep: ["event-stream","attention-set"]
  },
  "delivery-channels": {
    s: "The routes messages take to people: email, chat, mobile push and in-page indicators, each with its own format and failure behavior.",
    d: "A message is rendered per channel, with the right amount of text and links. Email can carry replies back into the review, parsed to create comments. Chat integrations post to channels or direct messages. Delivery is queued with retry and rate limits. The difficulty is identity and threading: a reply by email must map to the right comment on the right revision, and messages for one change should group together.",
    k: ["Replying by email versus only through the page: email replies are convenient, but need parsing quoted text and verifying the sender.", "Chat messages with actions versus links only: actions let people respond in place, while links are simpler and avoid acting from a context without the diff."],
    p: ["An email reply parsed with its quoted history posts the whole thread as a new comment.", "Delivery failures swallowed silently leave reviewers unaware that a request was never sent."],
    v: "Trigger a comment and confirm each configured channel delivers one correctly formatted message, an email reply becomes a comment on the right thread, and a failed delivery is retried then reported.",
    dep: ["notification-rules"]
  },
  "digests-and-batching": {
    s: "Combining several notifications into one summary message or delaying them briefly, to reduce interruptions.",
    d: "Events for the same change arriving within a short window are merged into one message. Users can ask for a periodic digest of everything pending rather than instant messages. Batching also applies to a reviewer's published review, delivering all drafts together. A holding window delays the first message slightly to allow coalescing. The tradeoff is latency against noise, and the batching logic must not drop events or reorder them in confusing ways.",
    k: ["A short holding window versus immediate sending: a window cuts the number of messages, but delays urgent ones by seconds or minutes.", "A digest versus instant messages for low-priority events: digests reduce interruptions, but make slow review the default."],
    p: ["A digest that arrives hours after a blocking comment lets the author build on code that must change.", "A batching bug that drops events when the window flushes during a deploy loses notifications."],
    v: "Post five comments within the holding window and confirm one message lists all five in order; switch a user to daily digest and confirm a single summary arrives at the set time.",
    dep: ["notification-rules","delivery-channels"]
  },
  "webhooks": {
    s: "Outbound HTTP calls to subscribed endpoints when events occur, so other systems can react to review activity.",
    d: "Subscribers register a URL, a secret and the event types they want. On an event the platform posts a signed JSON payload, retries on failure with backoff, and records delivery attempts. Receivers verify the signature and acknowledge quickly. Webhooks start checks, update dashboards and feed chat. The challenge is reliability: receivers are down, slow or misconfigured, and the sender must not block or leak internal addresses through requests to arbitrary URLs.",
    k: ["Signed payloads with a shared secret versus mutual authentication: signing is simple and widely supported, while mutual authentication is stronger but harder to set up.", "Thin payloads versus full objects: thin ones stay small and current, while full payloads let receivers act without calling back."],
    p: ["A webhook to an internal address lets a user probe the network from the platform's servers.", "Unbounded retries to a dead endpoint pile up and slow delivery to healthy ones."],
    v: "Subscribe to merge events, merge a change, and confirm one signed delivery arrives with a valid signature; take the receiver down and confirm bounded retries appear in the delivery log.",
    dep: ["event-stream","permissions-model"]
  },
  "tracker-linking": {
    s: "Connecting changes to work items by references in descriptions or commit messages, with updates flowing both ways.",
    d: "References such as an item identifier are parsed from the title, description and commit messages and turned into links. The tracker shows the changes attached to an item and their state, and the review page shows the item. On merge the platform can transition the item. Resolution requires knowing which tracker and project a reference means. It is hard because references are free text: a typo links the wrong item, and a number that looks like one links nothing.",
    k: ["Parsing free-text references versus an explicit field: parsing needs no extra step but misparses, while an explicit field is accurate but easy to skip.", "Closing the item on merge versus on release: on merge is immediate, but tells users a fix exists before it is deployed."],
    p: ["A mistyped identifier links to an unrelated item and closes it on merge.", "Visibility mismatch exposes a private item's title on a public change."],
    v: "Reference an item in a description, confirm the link and a reverse link appear, merge the change, and confirm the item transitions according to configuration and not before.",
    dep: ["descriptions-and-metadata","webhooks"]
  },
  "review-api": {
    s: "The programmatic interface to everything the page can do: read changes, post comments and votes, manage reviewers, trigger rebases and merges.",
    d: "A versioned HTTP interface with authentication by token, returning structured data and accepting the same operations as the web interface. The page itself is often a client of it. Rate limits protect the service, and pagination handles large results. Bots, command-line clients, editor plugins and checks all depend on it. The challenge is compatibility: external tools hold copies of its behavior for years, so changes must be additive.",
    k: ["Page and API sharing one interface versus separate: shared ensures parity and tests it daily, while separate lets each evolve but drifts.", "Granular token scopes versus all-or-nothing: scopes limit damage from a leaked token, but add configuration burden."],
    p: ["A breaking change to a response shape silently breaks bots that parse it.", "An endpoint missing the permission check that the page applies exposes private changes."],
    v: "Using a read-scoped token, list changes, fetch one, and attempt to post a comment; confirm the first two succeed, the write is refused, and a private change is not visible to an unauthorized token.",
    dep: ["permissions-model","change-store","comment-store"]
  },

  "review-latency-metrics": {
    s: "Measurements of how long review takes: time to first response, time between rounds, time from approval to merge and total lifetime.",
    d: "Events from the stream are folded into per-change timelines, and durations computed between defined points, excluding time in work-in-progress or when the author owed an action. Results are reported as distributions by team, size and time period. These show where waiting happens. The hard part is definition: time to first review depends on whose clock counts, and averages hide the long tail that actually frustrates people.",
    k: ["Medians and percentiles versus averages: percentiles show the tail that hurts, while averages are simple but hide outliers.", "Counting wall-clock time versus working time: working time is fairer across time zones, but needs calendars and is easy to get wrong."],
    p: ["Counting time when the ball was in the author's court blames reviewers for the author's delay.", "Publishing per-person numbers leads to rushed, shallow reviews."],
    v: "Replay a recorded set of events with known timings and confirm computed first-response and lifetime values match a hand calculation, excluding periods in work-in-progress.",
    dep: ["event-stream","lifecycle-states"]
  },
  "queue-views": {
    s: "Dashboards of the current backlog: how many changes wait for review, how old they are, and where they are stuck.",
    d: "Views group open changes by who must act, age, and blocking reason, such as awaiting reviewer, failing checks or unresolved conflict. They give leads a picture of flow today rather than history. They read from the search index or a reporting store. Aging buckets show items nobody is touching. The challenge is making the view actionable: a number without the list behind it cannot be acted on.",
    k: ["Live queries on the primary index versus a periodic snapshot: live is current, while snapshots allow history and trends with less load.", "Counting by change versus by lines of code waiting: changes are easy to explain, but lines reflect the real size of the load."],
    p: ["A backlog chart that counts abandoned changes as waiting inflates the apparent problem.", "A view without links to the changes cannot be turned into action."],
    v: "Create changes in each blocking state and confirm the view buckets them correctly, ages them from the right event, and each count links to the list of changes behind it.",
    dep: ["search-index","attention-set"]
  },
  "review-quality-signals": {
    s: "Indicators of whether review is catching problems, such as comments per change, post-merge reverts and defects traced to changes with little review.",
    d: "The platform correlates review activity with later outcomes: changes approved with no comments, changes reverted soon after merge, incidents linked to a change. It does not judge individual comments. Results guide process, such as where to require a second reviewer. The hard part is causation: low comment counts may mean excellent code, and heavy comments may mean a poor author or a thorough reviewer.",
    k: ["Outcome-based signals versus activity counts: outcomes track what matters, but arrive late and are sparse, while activity is instant but easy to game.", "Reporting at team level versus individual: team level guides process, while individual level creates pressure that distorts reviewing."],
    p: ["Rewarding comment counts produces nitpicking and discourages approving good code.", "Linking incidents to changes by timing alone blames innocent changes."],
    v: "Merge a change with a seeded defect that is reverted later, and confirm it appears in the revert signal with its review history, while a change with no reverts does not.",
    dep: ["post-merge-actions","review-latency-metrics"]
  },
  "workload-reports": {
    s: "Reports of review effort by person and team: how many reviews each handles, how big, and who is overloaded.",
    d: "Counts and sizes of reviews completed and pending are aggregated per person over periods, and compared to team capacity. Leads use it to rebalance assignment and to notice a single expert reviewing half the code. The data comes from the event stream and requires careful identity handling across renamed accounts. The difficulty is use: workload data shown to a manager can turn into a performance measure.",
    k: ["Counting reviews versus counting effort by size: counts are simple, while size-weighted effort is fairer but depends on a rough proxy.", "Visible to the whole team versus to leads only: team visibility encourages balance, while lead-only avoids public comparison."],
    p: ["Treating the busiest reviewer as the best leaves them overloaded and the rest untrained.", "Merged identities after renames double count or lose a person's history."],
    v: "Complete reviews of known size for three users and confirm the report shows their counts and size-weighted effort, flags the overloaded one, and attributes renamed accounts correctly.",
    dep: ["review-latency-metrics","load-balanced-assignment"]
  },
  "bottleneck-detection": {
    s: "Automatic identification of where review stalls, such as a single owner, a slow check or a path nobody picks up.",
    d: "Analysis runs over a window of history and reports concentrations: reviewers who appear on most waiting changes, checks whose duration dominates the wait, directories with long first-response times. It produces a short list of causes with evidence rather than a dashboard of everything. Reports go to team leads. The hard part is acting on it: the finding may be organizational, such as too few owners, which a tool cannot fix.",
    k: ["Rule-based detectors versus statistical outliers: rules are explainable and actionable, while outliers find unexpected patterns but need interpretation.", "Reporting continuously versus a periodic review: continuous catches problems sooner, but produces alerts that teams learn to ignore."],
    p: ["A flagged slow check that is in fact the necessary integration test prompts removing coverage.", "Findings with no owner never get acted on and are reported again each week."],
    v: "Seed history where one owner holds most waiting changes and one check takes most of the lead time, and confirm both are reported with the supporting changes and durations.",
    dep: ["queue-views","check-aggregation"]
  },

  "history-rewriting": {
    s: "Whether authors may amend, rebase and force-push after review begins, and how every feature copes when the code under a comment changes identity.",
    d: "Allowing rewrites keeps history clean and lets authors fix review feedback in place, but invalidates the assumption that a commit identifier is stable. The platform must then pin each revision, map comments through diffs, decide whether approvals survive, and compare revisions across rebases. Forbidding rewrites makes all this simple, at the cost of noisy history and merge commits. The choice affects the change model, anchoring, approvals, diffs and the merge strategy.",
    k: ["Immutable revisions with rewrites allowed versus append-only branches: rewrites give clean final history, but every feature must handle changing identity.", "Server-side rebase versus author-only: server-side removes friction, but the platform then creates history on behalf of people."],
    p: ["Features designed assuming stable commit identifiers fail silently after a force-push.", "Allowing rewrites after approval without invalidation merges code nobody reviewed."],
    v: "Force-push a rewritten branch after approval and comments, and confirm every revision, comment and approval is still readable, mapped correctly and invalidated according to policy.",
    dep: ["patch-sets","comment-carryover","stale-approval-dismissal"]
  },
  "consistency-and-races": {
    s: "How concurrent actions are ordered: votes, pushes, merges and rule evaluation all race, and the platform must still show and enforce one coherent state.",
    d: "At any moment a reviewer may vote on a patch set that the author is replacing, while checks finish and another person merges. The platform needs atomic updates against a version of the change, optimistic concurrency, and merges that recheck rules at the instant of writing to the repository. Without discipline, stale pages cause approvals on the wrong code or merges that bypass a just-added block.",
    k: ["Optimistic versioning with retries versus locking each change: versioning scales and avoids stuck locks, but makes users retry and handle conflicts.", "Strongly consistent rule checks at merge versus trusting cached results: strong checks prevent bad merges, but cost latency and load at the busiest moment."],
    p: ["A vote accepted for a patch set that was replaced a moment earlier counts toward the wrong code.", "Two merges to the same target interleaving without a lock produce a target that never passed checks."],
    v: "Fire a vote, a new push and a merge request at one change simultaneously a thousand times, and confirm each outcome is consistent: no merge of unapproved code, no vote attached to the wrong revision.",
    dep: ["rule-evaluation","change-store","merge-queue"]
  },
  "trust-and-permissions": {
    s: "Who is trusted with what: code from forks and strangers is untrusted input, yet the platform runs checks on it and shows it to privileged people.",
    d: "Authors may be outside the organization, and their code, descriptions, comments and file names are all untrusted. Checks that run their code must not hold secrets; rendered content must be sanitized; permissions must be enforced on every path, including search, notifications and the API. Roles such as author, reviewer, owner and administrator each need precise rights. A single missing check anywhere leaks private code or lets an author approve their own work.",
    k: ["Running checks on untrusted changes with no secrets versus requiring approval first: no secrets is safe and fast, but limits what such checks can test, while approval-first gives full access after a human looks.", "Fine-grained roles versus few roles: fine roles match real duties, but are hard to audit and configure correctly."],
    p: ["A check that runs a fork's code with repository secrets exposes them to any contributor.", "A permission applied on the page but not in the API or search leaks private changes."],
    v: "As an outside contributor, submit a change that tries to read a secret in a check, and confirm none is available; query search, API and notifications for a private change and confirm all deny.",
    dep: ["permissions-model","check-triggering","markup-and-mentions"]
  },
  "scale-and-latency": {
    s: "The budgets for page time, diff computation and queue freshness, and how one huge repository or mass change can break them for everyone.",
    d: "Review is interactive: pages must open in a second or two, even for changes with thousands of files or hundreds of comments. That demands caches keyed by immutable content, precomputation on push, lazy loading, and limits on what any one request can cost. A few extreme cases, such as automated mass changes or a monorepo, dominate load. Budgets must be chosen per feature and enforced, or the slowest piece sets the experience for all.",
    k: ["Precomputing at push versus computing at view: precomputing makes viewing fast, but wastes work and increases delay before a change appears.", "Hard limits on size versus degrading gracefully: limits protect the service predictably, while graceful degradation helps users but risks hiding content."],
    p: ["A mass automated change opening thousands of changes at once saturates workers and delays everyone's pages.", "Timeouts without fallbacks produce blank pages instead of a coarser diff."],
    v: "Push a change with five thousand files and a thousand comments and measure time to first content and to full diff; confirm limits and fallbacks engage and other users' page times stay within budget.",
    dep: ["diff-cache","scaling-and-replication","large-diff-handling"]
  },
  "human-attention": {
    s: "Review is limited by people's time and focus; the design question is how the platform spends that attention, rather than how much work it records.",
    d: "Every notification, badge, required check and mandatory approval spends a reviewer's attention, and attention is scarcer than compute. Good design routes work to the right person at the right time, keeps changes small, hides noise and makes the state obvious. Poor design creates fatigue, so reviews become rubber stamps and notifications are muted. Many features, from the attention set to stale approval rules, are really attention management.",
    k: ["Strict gates that demand many approvals versus lighter gates with trust: strict gates reduce risk per change, but stretch attention thin and encourage superficial approval.", "Optimizing for review speed versus review depth: speed reduces waiting and context loss, but pressure to be fast lowers the chance of catching defects."],
    p: ["Requiring approvals from many people trains each of them to assume the others looked.", "Treating response time as the key metric rewards quick approvals over careful ones."],
    v: "Measure, for a sample of changes, the number of notifications and approvals required against comments made and defects caught after merge, and confirm adding a gate does not raise approvals with no comments.",
    dep: ["attention-set","notification-rules","review-latency-metrics"]
  },
  "extensibility-and-api": {
    s: "How outside tools extend the platform: the API, webhooks, checks and bots through which most of its value is delivered, and the compatibility burden that follows.",
    d: "Much of what makes review useful lives outside the core: tests, linters, deployers, assistants and dashboards. They attach through the API, events and the checks interface. Each integration is an obligation, since external tools depend on stable behavior, and each carries permission and rate limit decisions. A platform with a narrow, stable, well-versioned surface can grow capability without being rewritten, while an unstable one breaks its ecosystem with every change.",
    k: ["A small stable API versus a broad one tracking the page: small is easy to keep compatible, while broad exposes every feature but locks internal structure in place.", "Plugins running inside the platform versus external tools: in-process plugins are powerful and fast, but can crash or slow the whole service."],
    p: ["An undocumented field that a popular tool relies on is removed in a routine cleanup and breaks many teams.", "A plugin with unbounded access to storage becomes a security and stability risk."],
    v: "Run an older version of a popular integration against the current release and confirm it still works; remove a deprecated field in a test build and confirm a compatibility test fails.",
    dep: ["review-api","webhooks","check-results-api"]
  }
});
