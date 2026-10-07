// Details for the code hosting forge plate, part 1: web interface, pull requests, issues, docs.
ATLAS.details("code-forge", {
  "repo-browser": {
    s: "The pages that list a repository's files, branches, tags and commit history at any revision, built from tree and commit objects read from the repository service.",
    d: "A request names a repository, a revision and a path. The web tier resolves the revision to a commit, reads the tree at that path through the repository service, and renders entries with their latest-changing commit. That last column is the expensive part: finding the last commit that touched each entry means walking history. Results are cached by commit and path, since objects at a commit never change. Branch and tag pickers need ref listings that stay fast with hundreds of thousands of refs.",
    k: ["Computing last-commit per entry on demand vs precomputing it: on-demand is simple but slow on deep history; precomputed needs a job per push and extra storage.", "Resolving names at request time vs pinning to commit ids in URLs: names are friendly, while commit-id URLs are permanent and cache perfectly."],
    p: ["A branch and a file with the same name make ambiguous URLs, so the page shows the wrong thing or fails.", "Listing a directory with tens of thousands of entries without paging exhausts memory or times out."],
    v: "Open a directory in a repository with long history and confirm the last-commit column appears within a second on a second visit, then push a commit touching one file and confirm only that row's commit changes.",
    dep: ["object-database","repository-routing","cache-layer","ref-advertisement"]
  },
  "file-viewer-and-blame": {
    s: "Displays one file at one revision with syntax coloring, line links, and per-line authorship that shows which commit last changed each line.",
    d: "The viewer fetches the blob, detects whether it is text, binary or generated, and renders text with token coloring. Blame assigns each line to the commit that introduced it by walking history backward and tracking line movement through diffs, including renames and optionally moved blocks. It is hard because blame cost grows with history depth, large files multiply it, and the results are only valid for one exact commit, so they are cached by blob and commit.",
    k: ["Blame computed per request vs materialized on push: per request is always correct but slow for old, busy files; materializing spends storage and job time on files nobody opens.", "Following renames and copies vs plain line tracking: following gives truthful authorship but multiplies diff work and can attribute lines to unexpected files."],
    p: ["Huge or minified files rendered inline freeze browsers; viewers need size cutoffs and a raw fallback.", "Blame across a mass reformatting commit blames everything on one author unless the system supports ignore lists."],
    v: "Open blame on a file where a known line was changed three commits ago and confirm it names that commit; rename the file in a new commit and confirm older lines still blame to their original commits.",
    dep: ["object-database","cache-layer","markup-rendering"]
  },
  "diff-renderer": {
    s: "Produces and displays the differences between two commits or trees, including renamed files, large diffs and syntax-aware side-by-side views, within strict size limits.",
    d: "Diffs are computed by the repository service as patch text with rename detection, then parsed into hunks and rendered with inline word-level highlights. Because a single commit can touch thousands of files, the renderer paginates, collapses generated or very large files, and loads them lazily. Whitespace-ignoring and move-detecting modes change the algorithm. The hard parts are limits and consistency: a diff must be cheap enough to compute for any commit, and identical in the web view, the API and review comments anchored to lines.",
    k: ["Computing diffs on the fly vs caching them by commit pair: caching saves repeated work, but the key space is large and rarely reused for unusual comparisons.", "Hard size limits with a fallback to raw patch download vs rendering everything: limits protect servers, but users hit a wall on big refactors."],
    p: ["Rename detection on huge changes is quadratic and can pin a CPU unless it has a similarity budget.", "Line anchors computed against one diff mode do not match another mode, so review comments appear on the wrong line."],
    v: "Render a commit that renames one file and edits another, and confirm the rename is shown as a rename with the edit hunks. Then open a ten-thousand-file commit and confirm the page loads within its limit with large files collapsed.",
    dep: ["object-database","compare-engine","cache-layer"]
  },
  "markup-rendering": {
    s: "Converts README files, comments and descriptions from markup text to safe HTML, resolving links to commits, users and issues along the way.",
    d: "Source text goes through a parser, then a sanitizer that allows a safe subset of tags and attributes, then a pass that turns references like mentions, issue numbers and commit ids into links. Relative links and images in repository files are resolved against the revision being viewed. Rendering runs in a separate worker or process because user text is untrusted and parsers have worst-case inputs that take minutes. Output is cached by content hash.",
    k: ["Sanitizing after rendering vs restricting the markup language: post-sanitizing is robust against parser quirks, while a restricted language gives fewer features but fewer surprises.", "Rendering at write time and storing HTML vs rendering on read: stored HTML is fast to serve but goes stale when rendering rules change."],
    p: ["A sanitizer that allows one extra attribute becomes a script injection into every viewer's session.", "Pathological nested input makes a parser run for minutes and ties up web workers without a time limit."],
    v: "Submit a comment containing a script tag, an event-handler attribute and a nested-list bomb, and confirm the script and handler are stripped and the page renders within the time limit while normal links still resolve.",
    dep: ["cache-layer","cross-references"]
  },
  "web-editor": {
    s: "Lets users edit files, create branches and open changes entirely in the browser, turning a form submission into a real commit with the right author and parent.",
    d: "The editor loads a file at a commit, lets the user change it, and on save creates a commit through the repository service without a working directory: it writes a new blob, tree and commit and updates a reference. If the user lacks write access, it forks automatically and opens a pull request. The edit records the base commit it started from so that concurrent changes are detected at save, not silently overwritten. Larger editors add a full workspace backed by a short-lived container.",
    k: ["Server-side commit creation vs a client-side working copy: server-side needs no download and works anywhere, but is limited to simple edits and one file or small sets at a time.", "Auto-forking for non-writers vs refusing: forking lowers the barrier to contribute but creates many stray forks."],
    p: ["Saving against a stale base without checking silently discards another person's newer commit.", "Line-ending or encoding normalization by the form rewrites an entire file and produces a huge, meaningless diff."],
    v: "Open a file, push a different change to the same branch from a terminal, then save in the browser and confirm the editor reports a conflict instead of overwriting; save a clean edit and confirm a commit appears with the user's identity.",
    dep: ["receive-pack","branch-protection","fork-networks","object-database"]
  },
  "notifications-center": {
    s: "A per-user inbox of events that need attention, such as mentions and review requests, with read state, filtering and delivery by email and push.",
    d: "Events produced by comments, reviews, pushes and checks pass through a subscription model that decides who cares: authors, assignees, mentioned users and watchers. Each recipient gets a notification row with a reason and a thread key so related events collapse. Delivery channels are separate consumers with their own preferences and batching. The hard parts are volume and correctness: a popular repository can create millions of rows per day, and a user must never be notified about something they can no longer see.",
    k: ["Writing a row per recipient at event time vs computing recipients on read: per-recipient rows make reads trivial but multiply writes for popular repositories.", "Grouping by thread vs listing every event: grouping reduces noise but loses the order of individual events."],
    p: ["Permission is checked at event time but not at delivery, so a user removed from a private repository still gets its titles by email.", "Watching a large repository by default floods inboxes until users disable it."],
    v: "Mention a user in a pull request comment and confirm one inbox entry with the reason mention and one email; then remove them from the private repository and confirm further comments produce no notification.",
    dep: ["notification-fanout","teams-and-roles","metadata-database"]
  },
  "dashboards-and-feeds": {
    s: "Personalized home pages and activity streams showing what changed in the repositories, people and organizations a user follows.",
    d: "A feed is a merge of events from many sources, ordered by time and filtered by what the viewer may see. Systems build feeds either at read time by querying each source, or at write time by pushing events into per-user timelines. The home view also shows the user's open pull requests, assigned issues and failing checks, each a query over metadata. The difficulty is fan-out: following thousands of repositories or being followed by many users makes either strategy expensive.",
    k: ["Fan-out on write vs on read: write fan-out gives instant reads but costs storage and burst work for popular sources; read fan-out is cheap to store but slow for heavy followers.", "Showing all events vs ranking them: ranking raises relevance but makes the page hard to explain and test."],
    p: ["Events from a repository made private later remain in old timelines unless they are filtered at read time.", "A single bot account generating thousands of events a day drowns real activity in feeds."],
    v: "Follow two repositories, push to each, and confirm both events appear in order on the home feed; make one repository private to a non-member viewer and confirm its events disappear on the next load.",
    dep: ["metadata-database","cache-layer","repository-visibility","job-queue"]
  },
  "pull-request-model": {
    s: "The record that ties a source branch, a target branch and a discussion together, with its own lifecycle of open, merged and closed states and a history of revisions.",
    d: "A pull request stores the repository pair, branch names, the commits currently on it, labels, reviewers, check results and merge state. Pushes to the source branch update it, and the system must record each revision so that review comments attach to a specific version. It also keeps hidden references to the head and merge commits so they survive branch deletion. The hard part is that its state is derived from repository data that changes outside the forge's control, so everything must be recomputable.",
    k: ["Storing the commit list vs deriving it from branch tips: stored lists support history and force-push tracking, derived lists cannot drift but cannot show what was replaced.", "Hidden references for each revision vs trusting branch names: hidden refs keep objects reachable after deletion at the cost of retained storage."],
    p: ["A force-push rewrites history and orphans review comments unless revisions are recorded and comments anchored to them.", "Deleting the source branch makes objects unreachable and garbage collection removes a still-open proposal's commits."],
    v: "Open a pull request, force-push a rewritten branch, then delete the branch, and confirm the pull request still shows both revisions and its comments, and the head commit can still be fetched by its hidden reference.",
    dep: ["metadata-database","compare-engine","object-database","reference-transactions"]
  },
  "compare-engine": {
    s: "Computes what a branch would add to its target: the merge base, the commits unique to the source, and the combined diff, for display and for mergeability.",
    d: "Given two commits, it finds their merge base by walking the commit graph, lists commits reachable from one but not the other, and produces the diff from base to source. Three-dot and two-dot comparisons give different answers and users confuse them. For forks the two commits live in different repositories, so objects must be shared or fetched across. It leans on a precomputed commit graph, because walking raw objects on a large repository takes seconds.",
    k: ["Diff from merge base vs diff against target tip: merge-base shows only the proposal's changes; target tip shows what the file would look like but includes unrelated target changes.", "Computing on demand vs caching by commit pair: caching saves repeated walks, but both tips change constantly."],
    p: ["Criss-cross histories have more than one merge base and different tools pick different ones, so the displayed diff and the actual merge disagree.", "Comparisons across a fork network without shared object storage require copying objects first."],
    v: "Compare a branch against a target that has since advanced and confirm the commit list contains only the branch's own commits and the diff does not show the target's newer changes.",
    dep: ["commit-graph-and-bitmaps","object-database","fork-networks"]
  },
  "review-threads": {
    s: "Line-anchored comments and reviews on a proposed change, with resolution state, replies and an overall verdict of approve, request changes or comment.",
    d: "A comment records the commit, file, line or range and side of the diff it was made on. When the branch updates, the system maps old positions onto new ones by diffing the revisions, marking comments outdated if their lines changed. Reviews bundle many comments with one verdict and submit atomically. Threads can be resolved and reopened. The hard problem is anchoring: line numbers shift, files move and diffs differ by mode, so anchors need a stable definition.",
    k: ["Anchoring to commit and line vs to content: commit and line is exact and cheap, content anchoring survives edits but is ambiguous when text repeats.", "Pending reviews submitted as a batch vs immediate comments: batching reduces notification noise but hides work in progress and can be lost if never submitted."],
    p: ["After a rebase, comments land on unrelated lines instead of being marked outdated.", "A verdict recorded against an old head still counts as an approval for code that changed afterward."],
    v: "Comment on a specific line, push a commit that edits that line and another that does not, and confirm the first marks the thread outdated while the second leaves it attached to the same text.",
    dep: ["diff-renderer","pull-request-model","metadata-database","notification-fanout"]
  },
  "status-checks": {
    s: "Results reported by external systems against a specific commit, such as build and test outcomes, which gate merging and appear next to the change.",
    d: "An external service posts a state for a commit and a named context: pending, success, failure or error, with a link to details. The forge stores the latest state per context and commit, aggregates them on the pull request, and treats named contexts as required by branch rules. Richer check APIs add annotations on lines and rerun requests. The challenge is that results attach to commits, not branches, and arrive asynchronously, so merging must account for a result that has not yet arrived.",
    k: ["Required checks by name vs by integration identity: names are simple to configure but anyone with write access can post a result with that name; identity binding prevents spoofing at the cost of setup.", "Latest-state-wins vs keeping history: latest is simple and compact, while history shows flakiness at the cost of storage."],
    p: ["A check that never reports leaves a pull request waiting forever with no signal explaining why.", "Renaming a job in the build system makes the old required context permanently missing and blocks every merge."],
    v: "Require a check, push a commit, and confirm merging is blocked while pending; post success for that commit from the authorized integration and confirm it unblocks, then post success from a different identity and confirm it is ignored.",
    dep: ["rest-api","branch-protection","metadata-database","webhook-dispatch"]
  },
  "mergeability-engine": {
    s: "Decides whether a pull request can be merged now by combining conflicts, required reviews, required checks and branch rules into one answer with reasons.",
    d: "Conflict detection attempts a trial merge in a scratch area of the repository, storing the resulting commit if clean. Policy evaluation then checks approvals, code owner reviews, required statuses, linear history requirements and the actor's permissions. The result is cached and recomputed when any input changes: new push, new review, new status, or a push to the target branch. It is costly because every update to a busy target branch invalidates trial merges for every open pull request against it.",
    k: ["Eager trial merges on every target change vs lazy on view: eager keeps answers instant but burns CPU on pull requests nobody looks at; lazy is cheap but shows unknown at first view.", "One combined verdict vs separate reasons: a verdict is simple for automation, while reasons make blocked states fixable by users."],
    p: ["A cached clean verdict is shown after the target branch advanced and now conflicts, so the merge fails at click time.", "Policy checked in the web layer but not again at the final ref update lets a race bypass required reviews."],
    v: "Open a clean pull request, push a conflicting change to the target, and confirm the status flips to conflicted within the expected delay with the conflicting paths listed; then attempt the merge through the API and confirm it is refused.",
    dep: ["compare-engine","branch-protection","status-checks","code-owners","job-queue"]
  },
  "merge-strategies": {
    s: "The ways a change can land on the target: a merge commit, a squash into one commit, or a rebase that replays commits, each producing different history and different commit ids.",
    d: "The forge performs the merge on the server in a temporary state, creates the resulting commits with the right author and committer, and updates the target reference with an expected old value so concurrent updates fail cleanly. Squash and rebase create new commit ids, so signatures from the original commits are lost and the forge must map the old branch to the new commits to show it as merged. Repositories choose which strategies are allowed.",
    k: ["Squash vs merge commit vs rebase: squash gives tidy history but loses individual commits and signatures; merge commit preserves everything but clutters history; rebase is linear but rewrites ids.", "Server-side merge vs requiring local merge: server-side is convenient and auditable but limited to what the forge can automate."],
    p: ["After a squash merge, a branch that continues from the old commits shows spurious conflicts and duplicate changes.", "Updating the target without an expected old value overwrites a commit pushed a second earlier."],
    v: "Merge three pull requests with each strategy and confirm history shape matches the strategy, each pull request shows merged, and a deliberately racing push to the target causes the merge to fail rather than lose the push.",
    dep: ["reference-transactions","object-database","signed-commit-verification","receive-pack"]
  },
  "merge-queue": {
    s: "Serializes approved changes into a line, testing each against the result of those ahead of it so the target branch never receives a combination that was not tested.",
    d: "When a change joins the queue, the forge creates a temporary branch containing the target plus all queued changes ahead of it plus this one, and asks the build system to test that combination. If it passes and its predecessors land, the target moves forward. If one fails, it is removed and later entries are rebuilt without it. Batching tests several changes together. The difficulty is throughput versus certainty: each failure cascades into retesting and the queue's latency is bounded by build time.",
    k: ["Testing speculative stacks vs testing sequentially: speculative stacks overlap builds for speed but waste work on any failure; sequential is cheap and slow.", "Batching changes vs one per build: batching amortizes build cost but needs bisection to find the culprit on failure."],
    p: ["A flaky test ejects innocent changes and every ejection triggers rebuilds of everything behind them.", "A temporary branch left after a forge crash blocks the next queue run until cleaned up."],
    v: "Queue three changes where the second has a failing test and confirm the second is ejected, the first and third land in order, and the target branch history never contained an untested combination.",
    dep: ["mergeability-engine","status-checks","merge-strategies","job-queue"]
  },
  "auto-merge": {
    s: "Lets an author mark a pull request to merge itself the moment all required reviews and checks pass, so nobody has to return and click.",
    d: "The forge records the intent, the strategy and the user who enabled it. A listener on review and check events re-evaluates mergeability for flagged pull requests and, when satisfied, performs the merge as that user with normal permission checks. New pushes can cancel the intent so that unreviewed code cannot ride an earlier approval. It is a small feature with sharp edges around identity: the merge must be attributed and authorized as of the moment it happens, not when it was requested.",
    k: ["Cancel on new push vs keep the setting: canceling is safer because the merged code was not what was approved; keeping is convenient but risky.", "Merge as the enabling user vs as a bot: user attribution is accurate but dies if the user loses access; a bot is stable but obscures who asked."],
    p: ["The enabler loses repository access and the merge fails silently, leaving a pull request nobody expects to be stuck.", "Auto-merge enabled before a required review is added can merge without it if rules are not re-read at merge time."],
    v: "Enable auto-merge on a pull request waiting for one check, report the check as success, and confirm it merges within seconds with the enabler named; repeat with a new push before success and confirm the setting is cleared.",
    dep: ["mergeability-engine","status-checks","merge-strategies","webhook-dispatch"]
  },
  "issue-model": {
    s: "The record for a unit of work or a bug report: title, body, author, assignees, state, and a timeline of every change and comment on it.",
    d: "An issue is a numbered row scoped to a repository, with a body and an append-only timeline of events: comments, label changes, assignments, references from other items and commits. Numbers are allocated per repository and shared with pull requests so that references are unambiguous. Edits keep history. Closing can be driven by commit messages merged to the default branch. The hard parts are number allocation without gaps or races under concurrent creation, and keeping the timeline consistent when many events arrive at once.",
    k: ["A shared number sequence for issues and pull requests vs separate sequences: shared makes references like a bare number unambiguous, at the cost of one hot counter per repository.", "Append-only timeline events vs mutable fields: events preserve audit and support replay, but queries for current state need derived columns."],
    p: ["Two simultaneous creations allocate the same number if the counter is read then written without a lock.", "Moving an issue to another repository breaks all references to its old number unless redirects are kept."],
    v: "Create fifty issues concurrently from separate clients and confirm the numbers are unique and consecutive; close one with a commit message and confirm the timeline records the commit as the cause.",
    dep: ["metadata-database","cross-references","job-queue"]
  },
  "labels-and-milestones": {
    s: "Lightweight classification: colored labels that tag items by type or area, and milestones that group items under a goal and due date with progress.",
    d: "Labels are scoped to a repository or organization and attached to issues and pull requests through a join table. Milestones hold a title, due date and counts of open and closed items, which are maintained incrementally or computed on read. Both are used in filters, boards and automation. They look trivial but become hot paths: filtering a large repository by several labels and a milestone needs indexes designed for those combinations, and renames must propagate without breaking saved filters.",
    k: ["Organization-wide labels vs per-repository: shared labels give consistent reporting but make any change high-impact; per-repository is flexible and drifts.", "Maintained progress counters vs computed counts: counters are instant but can drift after bugs; computed is exact and costs on large milestones."],
    p: ["Deleting a label silently removes it from thousands of items with no way to restore the association.", "Counters updated in a job fall behind and the milestone shows ninety percent done when it is not."],
    v: "Attach a label to two hundred items, rename it, and confirm every filter URL using it still works; close five items in a milestone and confirm the progress figure matches a direct count.",
    dep: ["issue-model","metadata-database","issue-and-pr-search"]
  },
  "project-boards": {
    s: "Kanban-style views over issues and pull requests, with columns driven by status fields or rules, drag-and-drop ordering and automation that moves cards.",
    d: "A board is a saved view over items with custom fields, grouped by a field such as status. Cards store a position within a column, usually as a fractional rank so that moving one card changes one row. Automation rules move cards when items open, close or merge. Boards can span repositories and organizations, so each card must be filtered by what the viewer can see. The hard parts are ordering under concurrent drags and the cost of views over many thousands of items.",
    k: ["Fractional ranks vs integer positions: fractions make a move a single write but eventually need rebalancing; integers are simple but a move rewrites many rows.", "Boards stored as views over live items vs copies of items: views never drift but depend on the query's cost; copies are fast and can disagree with the source."],
    p: ["Two people dragging cards in the same column produce duplicate positions and an unstable order.", "A card for an item in a private repository leaks its title to board viewers who lack access to that repository."],
    v: "Move a card between two positions from two sessions at once and confirm both orders converge to one; view the board as a user with no access to one repository and confirm its cards are hidden.",
    dep: ["issue-model","labels-and-milestones","repository-visibility","metadata-database"]
  },
  "templates-and-forms": {
    s: "Repository-defined starting text or structured forms for new issues and pull requests, so reporters supply the information maintainers need.",
    d: "Templates live in the repository as files at known paths and are read from the default branch when someone starts a new item. Plain templates prefill the body; form templates define fields, required inputs and dropdowns that are rendered as a form and serialized back into the body. Because the definition is versioned with the code, it changes through normal review. The difficulty is that templates are user-supplied configuration parsed by the server, so malformed files need clear errors and limits.",
    k: ["Templates stored in the repository vs in settings: in-repository templates are reviewable and versioned but readable only by those with source access; settings are private to admins but invisible to history.", "Structured forms vs free text: forms give consistent data for automation but frustrate reporters whose problem does not fit."],
    p: ["A template with a syntax error silently falls back to a blank form and maintainers lose their required fields.", "Reading templates from the contributor's branch rather than the default branch lets a pull request change its own rules."],
    v: "Commit a form template with a required field, open the new-issue page and confirm the form renders; submit it empty and confirm refusal, then break the file's syntax and confirm a visible error rather than a blank form.",
    dep: ["issue-model","object-database","markup-rendering"]
  },
  "cross-references": {
    s: "Automatic links between items, commits and people, created when text mentions an issue number, commit id or user, and shown on the referenced item's timeline.",
    d: "When any text is saved, a parser extracts references and records them as typed edges from source to target. The target's timeline shows that it was mentioned and where. Keywords in commit messages or pull request descriptions can close items on merge. References are checked against the author's permission: a reference to a private item must not reveal its existence to the target's viewers. The graph of references must also be updated when text is edited or deleted.",
    k: ["Parsing at write time and storing edges vs resolving at render time: stored edges allow backlinks and notifications, but must be updated on every edit; render-time is simpler and cannot show backlinks.", "Auto-closing by keyword vs explicit link only: keywords are convenient and sometimes close the wrong item when text is ambiguous."],
    p: ["A mention of a private issue from a public repository leaks its title through the visible backlink.", "A closing keyword in a commit that is later reverted still closes the item and nobody reopens it."],
    v: "Reference an issue from a commit, a comment and a pull request in different repositories and confirm three backlinks appear on its timeline; reference a private item from a public one and confirm no title is shown to outsiders.",
    dep: ["issue-model","metadata-database","teams-and-roles"]
  },
  "discussions": {
    s: "Threaded forums attached to a repository for questions, ideas and announcements that are not tied to a specific change, with categories and accepted answers.",
    d: "A discussion is like an issue but with a category, nested replies and an optional marked answer, and no workflow of open and closed states. It reuses authentication, notifications, reactions and markup rendering. Moderation tools lock threads, hide comments and convert discussions to issues. Its scaling profile differs from issues: threads are long, replies nest, and the content is largely read by anonymous visitors, so caching and spam control matter more than workflow.",
    k: ["Separate model from issues vs a variant of issues: a separate model fits forum behavior at the cost of duplicated features; a variant reuses code but bends the issue workflow.", "Nested replies vs a flat list: nesting suits conversations but is hard to render and paginate; flat is simple and loses context."],
    p: ["Public threads attract spam at a rate that overwhelms a small maintainer team without rate limits and new-account restrictions.", "Converting a discussion to an issue drops replies unless the timeline is mapped."],
    v: "Post a question, reply in a nested thread, mark an answer and confirm it is pinned at the top; convert the discussion to an issue and confirm all replies carry over with their authors.",
    dep: ["issue-model","markup-rendering","abuse-and-spam-controls","metadata-database"]
  },
  "wikis": {
    s: "Editable documentation pages attached to a repository, usually stored as a separate repository of text files so they get history, clones and offline editing.",
    d: "Each project's wiki is a second repository holding markup files; page titles map to file names, and edits made on the web create commits. Because it is a real repository, it can be cloned, edited locally and pushed, which makes permissions and hooks apply. A page view reads the latest file, renders it, and builds navigation from file names. The challenge is that it is a repository with none of the safeguards of the main one: no review, and arbitrary people may be allowed to edit.",
    k: ["Wiki as a repository repository vs rows in the database: a repository gives history, forks and offline work, but search, permissions and renames are harder; rows are easy to query and lose that portability.", "Editable by anyone with read access vs by writers only: open editing encourages contribution and invites vandalism."],
    p: ["Page names containing slashes, dots or case differences collide on case-insensitive file systems and overwrite each other.", "A vandalized page is reverted in history but remains in search results until the index updates."],
    v: "Create a page in the browser, clone the wiki repository and confirm the file exists with that commit; push an edit from the clone and confirm the web page shows the new text.",
    dep: ["bare-repository-layout","markup-rendering","receive-pack","code-search-index"]
  },
  "pages-hosting": {
    s: "Serves static sites built from a repository branch or a build artifact at a stable address, with custom domains and certificates.",
    d: "A publish step takes a directory from a branch or a workflow's artifact, stores it as an immutable bundle, and points a hostname at it. Requests are served by a separate fleet that looks up the bundle by hostname, reads files from object storage with caching and returns them. Custom domains require verification that the owner controls the name and automated certificate issuance. The hard parts are isolation, since user-authored content must not run on the forge's origin, and the domain-takeover risk when a name is left dangling.",
    k: ["Serving from a separate domain vs a subpath of the main one: a separate registrable domain isolates cookies and scripts from the forge; a subpath is simpler and risks session theft.", "Immutable bundles per publish vs serving the branch live: bundles are fast and atomic to swap but cost storage and a build step; live is simple and slow."],
    p: ["A deleted repository's custom domain remains pointed at the service and another account claims it.", "Publishing partial uploads serves a mix of old and new files during the swap if it is not atomic."],
    v: "Publish a site, then publish a second version and fetch a page repeatedly during the swap, confirming every response is entirely old or entirely new; confirm the site's scripts cannot read the forge's session cookie.",
    dep: ["blob-object-store","apps-and-oauth","repository-visibility","cache-layer"]
  },
  "releases": {
    s: "Named snapshots of a project: a tag, release notes and attached files such as installers, presented as the official downloadable versions.",
    d: "A release links a tag to notes and a set of assets uploaded to the blob store. Source archives are generated on demand from the tag and cached, and must be byte-stable so checksums published by consumers stay valid. Drafts and pre-releases hide or flag a version. Release creation fires events that trigger packaging pipelines. The hard parts are stability of generated archives across forge upgrades, and large uploads that need resumability and virus or policy checks.",
    k: ["Generating source archives on demand vs storing them: on demand costs no storage and risks changing bytes between runs; stored archives are stable and cost space.", "Mutable releases vs immutable once published: mutability allows fixing mistakes but breaks consumers relying on the checksum; immutability is safer and less forgiving."],
    p: ["Upgrading the archive code changes compression output and invalidates every published checksum for source tarballs.", "Deleting and recreating a tag with the same name makes consumers pull different content under the same version."],
    v: "Download the source archive for a tag twice a day apart and confirm identical checksums; create a release with a one-gigabyte asset over a flaky connection and confirm the upload resumes and the final hash matches.",
    dep: ["blob-object-store","object-database","webhook-dispatch","large-file-pointers"]
  },
  "package-registry": {
    s: "Hosts built packages and container images in the formats of common ecosystems, using the forge's accounts and repository permissions for publish and download.",
    d: "Each ecosystem has its own wire protocol, so the registry exposes protocol-specific adapters over a common store of content-addressed blobs and a metadata index of names, versions and dependencies. Authentication maps tokens to forge permissions. Packages are linked to a repository for ownership and visibility. The difficulty is breadth and immutability: every protocol has quirks, and consumers expect a published version never to change, even though uploads can fail halfway and cleanup must not remove blobs still referenced.",
    k: ["Adapter per ecosystem vs a single generic API: adapters work with existing client tools; a generic API is simpler for the forge and requires custom clients.", "Shared blob store across versions and packages vs separate per package: sharing deduplicates layers, while garbage collection needs reference counting."],
    p: ["Garbage collection races an in-progress upload and deletes a blob that is about to be referenced.", "Name confusion between a private and a public package lets a build pull an attacker's version of an internal name."],
    v: "Publish a package version, attempt to publish the same version again with different content and confirm refusal; install the original from a clean client using only a repository-scoped token.",
    dep: ["blob-object-store","access-tokens","repository-visibility","metadata-database"]
  },
  "snippets": {
    s: "Small standalone pieces of code or text with their own address and history, shared outside any project repository.",
    d: "A snippet is a tiny repository with one or more files, a title, and a visibility of public, secret link or private. Because each is a repository, it can be cloned and versioned like any other, but the system treats it as a lightweight object: no pull requests, no issues, only comments. Large numbers of small repositories stress the storage layer in a different way from a few large ones. Secret snippets are unlisted but reachable by anyone with the link.",
    k: ["Each snippet as a real repository vs a database row: repositories give versioning and cloning at the cost of per-object file and replication overhead; rows are cheap and lose history.", "Secret link visibility vs real access control: links are easy to share and cannot be revoked per person."],
    p: ["Treating an unlisted snippet as private leads people to paste credentials into it, and search engines or shared links expose them.", "Millions of tiny repositories create filesystem inode pressure and slow maintenance scans."],
    v: "Create a secret snippet and confirm it is absent from the user's public profile and search but loads from its link without signing in; clone it and push a second revision to confirm history is kept.",
    dep: ["bare-repository-layout","repository-visibility","markup-rendering","secret-scanning"]
  },
  "attachment-storage": {
    s: "Stores images and files that users drop into comments and descriptions, serving them with permission checks tied to the item that embeds them.",
    d: "An upload goes to the blob store under a random key and returns a URL embedded in the text. Serving checks that the viewer may see the parent item, or issues a short-lived signed address. Uploads are validated by size and type, and images are re-encoded to strip metadata and neutralize malicious payloads. The difficulty is access: a public-looking URL for a private item's image can become a permanent leak, and deleting an item should delete its files.",
    k: ["Unguessable public URLs vs permission-checked proxies: unguessable URLs scale and cache easily but cannot be revoked; a proxy enforces access and adds load.", "Re-encoding uploaded images vs storing them as is: re-encoding removes location metadata and exploits at a compute cost and some quality loss."],
    p: ["A private repository's screenshot URL pasted into a public chat remains readable forever because the key is the only secret.", "Orphaned files accumulate after items are deleted if there is no reference-based cleanup."],
    v: "Upload an image with location metadata into a private issue, fetch it as a non-member and confirm refusal, then fetch the stored file as a member and confirm the location metadata has been removed.",
    dep: ["blob-object-store","repository-visibility","markup-rendering"]
  },
});
