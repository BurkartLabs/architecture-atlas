// Details for the version control plate, part 1: hosting server, hooks and signing, history-editing workflows.
ATLAS.details("version-control", {
  "repository-storage-layout": {
    s: "How the server arranges many repositories on disk or in a storage service: directory scheme, object storage placement, and the mapping from a project name to its repository.",
    d: "Each hosted repository is usually a bare repository: object database and references but no working tree. The server maps account and project names to a storage path, often hashed or numbered so renames do not move data. Large installations spread repositories across storage nodes and keep a routing table. Writes to one repository must be serialized on a single node, while reads can come from replicas. The difficulty is that repositories vary by orders of magnitude in size, so placement by count alone produces hot and idle nodes.",
    k: ["Path derived from the project name vs path derived from a stable internal id: names are readable but renames move data; ids make renames cheap but need a lookup table.", "Bare repository per project vs shared object store with thin repositories: isolation is simple, while sharing saves space but couples failure and deletion."],
    p: ["Placing repositories by count rather than size fills one storage node with the few giant repositories.", "Renaming a project without updating the routing table leaves old clone URLs pointing at nothing or at a different project."],
    v: "Create a project, push a commit, rename the project, and confirm the old URL redirects and a fresh clone of the new name returns the same commit identifier.",
    dep: ["object-database-abstraction", "reference-namespace"]
  },
  "network-endpoints": {
    s: "The listeners that accept clone, fetch and push over SSH and HTTP, authenticate the caller, and hand the request to the repository's upload and receive programs.",
    d: "An HTTP endpoint speaks the smart protocol over request and response bodies, often behind a reverse proxy; an SSH endpoint runs a restricted command per connection. Both start a short-lived process that reads the repository and streams a pack. A discovery request returns refs and capabilities, then one or more data requests follow. Streaming responses can run for minutes, so timeouts, buffering and compression settings in front proxies matter. Concurrency is the hard part: each clone may spend significant CPU and memory building a pack.",
    k: ["Process per request vs long-lived worker pool: processes isolate failures and memory, while pools save startup cost but share heap growth.", "Terminating TLS at a proxy vs in the service: proxies simplify certificates and limits, but can buffer or time out large streaming packs."],
    p: ["A proxy buffering the whole response turns a streamed clone into a memory spike and a timeout.", "Unbounded concurrent pack generation lets a few automated clients exhaust CPU and starve interactive users."],
    v: "Clone a multi-gigabyte repository over each transport while watching server memory, and confirm the first bytes arrive within seconds and memory stays flat during the stream.",
    dep: ["transport-layer", "authentication", "access-control"]
  },
  "authentication": {
    s: "Establishes who is connecting, using SSH keys, tokens, passwords with a second factor, or delegated single sign-on, and maps the result to an account.",
    d: "Over SSH the server looks up the offered public key and maps it to an account or a deploy identity. Over HTTP it accepts a bearer token, basic credentials carrying a token as the password, or a session. Automated systems use scoped, expiring tokens or per-repository deploy keys. The result is an identity attached to the request for the rest of its life. The hard part is that interactive and automated callers have different needs: people want browser sign-in, build machines want long-lived but narrow credentials that can be revoked quickly.",
    k: ["Long-lived tokens vs short-lived tokens with refresh: long-lived are easy for automation but a leak persists; short-lived limit damage but need renewal logic.", "Per-user keys vs per-repository deploy keys: user keys follow the person's permissions, while deploy keys limit blast radius but multiply credentials to manage."],
    p: ["A token with account-wide scope pasted into a build log hands over every repository the person can write.", "Offboarding that disables the account but leaves its deploy keys and tokens active keeps access alive."],
    v: "Revoke a token and confirm the next fetch using it fails within the documented delay, while a second token for the same account keeps working.",
    dep: ["credential-helpers"]
  },
  "access-control": {
    s: "Decides whether an authenticated identity may read, write or administer a repository, using roles, teams, inherited group permissions and visibility settings.",
    d: "Permissions combine repository visibility, the caller's role in the project and its parent groups, team membership and per-branch rules. The check runs at connection time for reads and again per reference update for writes. Because history is copied wholesale on clone, read access is all or nothing at repository granularity; per-path secrecy is not available inside one repository. Auditing records who read and wrote. The difficulty is inheritance: one change to a group can silently grant or remove access across thousands of repositories.",
    k: ["Coarse repository-level permissions vs finer path-level rules: coarse matches the data model and is enforceable, while path rules can only be advisory since clones carry all objects.", "Inherited group roles vs explicit per-repository grants: inheritance scales management, but makes the effective permission hard to explain."],
    p: ["Treating path restrictions as confidentiality: anyone who can clone can read every path in history.", "Granting a broad group write access to inherit onto a new sensitive repository by default."],
    v: "As a read-only user, clone succeeds and a push is rejected with a permission error; add the user to a write team and confirm the same push now succeeds and appears in the audit log.",
    dep: ["authentication"]
  },
  "protected-refs-and-push-rules": {
    s: "Server-enforced constraints on reference updates: no force pushes to protected branches, required review, signed commits, file-size or file-name limits, and message formats.",
    d: "On each push the receiving side checks every proposed reference update against rules for that name pattern. Rules can forbid deletion and non-fast-forward updates, require that changes arrive through a review service, and inspect the incoming commits for size, path or signature policy. Checks run before references move, so a rejection leaves the repository unchanged. Inspecting objects needs a quarantine area where received objects live until the update is accepted. The difficulty is cost: rules that scan every new commit make large pushes slow.",
    k: ["Rules enforced in the service vs in repository hooks: service rules are visible and administrable in a UI, while hooks are flexible but live in files only administrators see.", "Reject at push vs warn and flag later: rejecting stops bad data entering, but blocks emergency fixes without an override path."],
    p: ["A rule that walks all history for a new branch rather than only new commits makes first pushes time out.", "No bypass for incident response, so people disable the rule entirely and forget to restore it."],
    v: "Attempt a force push to a protected branch and confirm rejection with the reference unchanged and the quarantined objects discarded; then push a normal fast-forward and confirm acceptance.",
    dep: ["server-hooks", "access-control", "push-and-receive", "signature-verification"]
  },
  "merge-request-service": {
    s: "Review workflow layered on the repository: a proposed change between two refs, discussion, required approvals and checks, and a server-side merge that records the result.",
    d: "A merge request stores the source and target references, the merge base and a diff computed on demand. The service keeps hidden references so the exact head of each revision remains fetchable even after a force push. When conditions are met it creates the merge, rebase or squash result on the server in a scratch area, then updates the target reference atomically with an expected-old-value check. The hard part is staleness: the target moves while review is open, so mergeability and check results must be recomputed.",
    k: ["Merge, squash or rebase on completion: merge keeps full history, squash gives one commit per change, rebase gives linear history but rewrites commit identifiers.", "Storing revisions under hidden refs vs recomputing from branch tips: hidden refs preserve review history after force pushes, at the cost of extra references to manage."],
    p: ["Checks that passed on an old target tip are treated as valid after the target changed.", "Squash merging discards authorship detail and signature on individual commits without telling reviewers."],
    v: "Open a request, push a follow-up commit, force push the branch, and confirm every earlier revision remains viewable and the final merge updates the target with the expected parent commits.",
    dep: ["three-way-content-merge", "ref-transactions", "protected-refs-and-push-rules", "recursive-merge-strategy"]
  },
  "forks-and-shared-objects": {
    s: "Server-side copies of a repository that share one object store with their parent, so a fork costs almost no space but still has its own references and permissions.",
    d: "A fork is a new repository whose alternates file points at a common object pool. Objects pushed by any member go into the pool, while references stay private to each fork. Reads of an object consult the fork then the pool. Maintenance must treat the pool as the owner of shared data: removing an object from the pool breaks every fork that reaches it. The hard part is security and cleanup: a fork can reach objects another fork pushed, and deleting a repository must not delete anything another still needs.",
    k: ["Shared pool vs full copy per fork: sharing saves storage and clone time, while copies isolate deletion and make a private fork truly private.", "Pool-wide garbage collection vs per-fork collection: pool-wide sees all references and is safe, but is slower and needs coordination."],
    p: ["Pruning a fork's objects without consulting the pool's other members deletes data they reference.", "Objects pushed to a private fork become guessable through a public parent that shares the pool."],
    v: "Fork a repository, push a commit to the fork, and confirm the pool size grew by only that commit while the parent's references and fetchable history are unchanged.",
    dep: ["alternates", "garbage-collection", "access-control"]
  },
  "replication-and-backup": {
    s: "Keeping extra copies of each repository on other nodes or sites, with consistent replication of references and objects, to survive hardware loss and to spread read load.",
    d: "A write is accepted on one primary, then replicated by running fetch operations on secondaries or by streaming the same pack and reference updates. A voting step can require a majority of replicas to agree on a reference value before a push is acknowledged. Backups are point-in-time copies of both objects and references. They must capture references and objects consistently: references copied before objects can name missing data. The hard part is the window between acknowledgment and replication, where a failover can lose the latest push.",
    k: ["Synchronous replication before acknowledging vs asynchronous after: synchronous loses nothing on failover but makes pushes slower; asynchronous is fast and risks a short loss window.", "Copying files vs fetching into the replica: file copy is fast but can capture a torn state; fetch is consistent and verified but costs CPU."],
    p: ["Backing up the reference files first and the object store later produces a backup with references pointing at missing objects.", "Failing over to a replica that lagged behind and silently dropping the last pushes."],
    v: "Push a commit, kill the primary immediately, promote a replica, and confirm the commit identifier is present, fsck reports no missing objects, and clients can fetch it.",
    dep: ["repository-storage-layout", "fetch-client", "ref-transactions", "object-integrity-check"]
  },
  "client-hooks": {
    s: "Scripts a developer's repository runs before and after local operations such as commit, merge, rebase and push, able to modify a message or abort the operation.",
    d: "Hooks are executable files looked up by event name in a hooks directory, or in a directory set by configuration. The command receives details through arguments, environment variables or standard input, and a nonzero exit from a pre-event hook aborts the operation. Typical uses are formatting and lint checks before commit, message templates, and tests before push. Hooks are not versioned with the repository and not copied by clone, so teams distribute them through a managed directory or a tool. The weak point is that they are bypassable by design.",
    k: ["Hooks as local convenience vs as policy: local hooks give instant feedback but are skippable, so policy that matters must also be enforced on the server.", "Shared hooks directory in the repository vs per-clone copies: a shared directory stays in sync, but running scripts from fetched content needs explicit opt-in for safety."],
    p: ["A slow pre-commit check that runs the full test suite gets bypassed with the skip flag and never comes back.", "Relying on client hooks to block secrets, then finding they were never installed on a new machine."],
    v: "Install a pre-commit hook that exits nonzero, attempt a commit, and confirm it is refused with no new commit object; then commit with the bypass option and confirm it succeeds.",
    dep: ["commit-objects", "index-file-format"]
  },
  "server-hooks": {
    s: "Scripts or in-process checks the receiving repository runs around a push: before objects are accepted, per reference update, and after references move.",
    d: "On a push, a pre-receive step sees all proposed updates and may reject the whole push. An update step runs once per reference. A post-receive step runs after references have moved and drives notifications, builds and mirror updates. Received objects sit in a quarantine directory during the pre-checks, so rejection leaves nothing behind. Environment variables name the quarantine path so hooks can read new objects. The difficulty is latency: the user is waiting on the connection, and slow checks risk timeouts.",
    k: ["Check in pre-receive vs after the fact in post-receive: pre-receive prevents bad data but adds push latency; post-receive is fast but can only react.", "One script per event vs a hook runner with several checks: a runner is composable and reportable, but is one more component that can fail the whole push."],
    p: ["A hook that runs a full-repository scan on every push times out on large repositories.", "A post-receive notification failing and leaving no record, so downstream systems silently miss updates."],
    v: "Push to a repository whose pre-receive hook rejects a banned file name and confirm the push fails with the hook's message and the new objects are absent from the object store afterward.",
    dep: ["push-and-receive", "ref-transactions", "object-database-abstraction"]
  },
  "commit-and-tag-signing": {
    s: "Attaching a cryptographic signature to a commit or tag object so readers can verify the author's key, using the same hash that already names the object.",
    d: "The signing step serializes the object without the signature, passes it to an external signing program or key, and embeds the result as a header in the commit, or in the body of an annotated tag. Because the identifier hashes the entire object, including the signature, a valid signature also pins the whole history behind that commit. Formats include detached message signatures and signatures made with the same keys people use for remote login. The hard part is that signing only covers that single object: rewriting the commit invalidates it.",
    k: ["Sign every commit vs sign only tags and merges: every commit gives per-change attribution but friction on rebases; tags give release trust with little effort.", "Web-of-trust keys vs keys already used for transport login: trust-web is expressive but unfamiliar; login keys reuse existing tooling with simpler trust."],
    p: ["Rebasing signed commits silently drops or invalidates signatures, and nothing warns the author.", "Signing the commit but not the tag that release tooling actually checks."],
    v: "Create a signed commit, amend its message, and confirm verification passes on the original identifier and fails on the amended commit, which carries no signature.",
    dep: ["commit-objects", "tag-objects", "content-addressing"]
  },
  "signature-verification": {
    s: "Checking embedded signatures against a set of trusted keys when showing history, merging, fetching or accepting a push, and reporting good, bad, expired or unknown key.",
    d: "The verifier extracts the signed payload and the signature, runs the external verification program, and maps its status to a result: good with trusted key, good with unknown key, bad signature, expired or revoked key. Results can be displayed in logs, required before a merge, or enforced on the server for a protected branch. Verification cost is per object, so verifying a long range is slow. The hard part is that a valid signature proves a key signed the data, not that the key belongs to the person claimed.",
    k: ["Verify at read time vs verify at push time: read-time shows current key status, while push-time stops unsigned data entering at the cost of server work.", "Reject unknown keys vs warn: rejection is strict and secure but blocks new contributors until their key is registered."],
    p: ["Accepting a good signature from a key nobody has vouched for as proof of identity.", "Key expiry or rotation making old but legitimate commits display as untrusted."],
    v: "Verify a range containing one correctly signed commit, one tampered commit and one signed by an unregistered key, and confirm each is reported with a distinct status.",
    dep: ["commit-and-tag-signing", "key-trust-and-distribution"]
  },
  "key-trust-and-distribution": {
    s: "How signing keys are published, associated with identities, rotated and revoked, so that a verifier can decide whether a good signature should be believed.",
    d: "A host stores public keys uploaded by each account and can show a verified mark when a commit's signing key is registered to the committer's email. Organizations may instead keep an allowed-signers list in the repository or a configuration file, naming keys per identity. Revocation requires updating that list and deciding what happens to commits signed before the date. The hard part is binding an identity to a key without a central authority, and handling a compromised key whose past signatures remain valid.",
    k: ["Host-managed key registry vs repository-held allowed-signers file: the registry is convenient but trusts the host; the file travels with history but must itself be protected.", "Time-bounded key validity vs permanent trust: time bounds limit exposure after compromise, but require a trusted timestamp to judge old commits."],
    p: ["Removing a leaked key from the registry without a cutoff date, so attackers' backdated commits still verify.", "An allowed-signers file editable by anyone who can push, so an attacker adds their own key."],
    v: "Register a key, sign a commit, see it marked verified; revoke the key and confirm new signatures are rejected while the earlier commit is reported as signed before revocation.",
    dep: ["signature-verification", "access-control"]
  },
  "rebase-engine": {
    s: "Replays a sequence of commits onto a new base by applying each one's change in turn, producing new commits and then moving the branch to the result.",
    d: "The engine finds the commits unique to the branch, then for each one performs a three-way merge between the commit, its parent and the new tip, and writes a commit with the same message and author but a new identifier and parent. Progress is stored in a state directory so a conflict can pause the operation and a later continue or abort can resume or restore it. Commits that become empty can be dropped. Hard parts are repeating conflicts across replays and keeping state correct after a crash.",
    k: ["Rebase vs merge to integrate: rebase gives linear history and cleaner bisection but rewrites identifiers; merge preserves what happened and is safe for shared branches.", "Replay each commit vs squash first: replay preserves granularity and may conflict repeatedly; squash conflicts once and loses intermediate states."],
    p: ["Rebasing a branch others have already based work on forces them to recover divergent copies.", "Aborting without cleaning state directories so later commands report a rebase still in progress."],
    v: "Rebase a three-commit branch onto a moved target and confirm the new commits have the same patches and messages with fresh identifiers, and the old tip is still reachable through the reflog.",
    dep: ["three-way-content-merge", "commit-objects", "rebase-todo-list", "ref-transactions", "reflog"]
  },
  "rebase-todo-list": {
    s: "The editable script of operations a rebase will perform, one line per commit, letting the user reorder, drop, squash, edit or reword before the replay starts.",
    d: "The engine writes a list of verbs and abbreviated commit identifiers, opens it in the user's editor, then reads the edited result as instructions. Verbs include pick, drop, reword, edit to pause, squash and fixup to combine with the previous commit, and exec to run a command. A fixup commit created earlier with a reference to its target can be auto-ordered. The list is stored in the state directory and rewritten as steps complete, which makes crash recovery possible. The hard part is parsing and validating hand-edited input.",
    k: ["Editing a text script vs an interactive tool: a script is simple, scriptable and works over any terminal; a graphical tool is friendlier but harder to automate.", "Abbreviated identifiers vs full ones: short ones are readable, but risk ambiguity as the repository grows."],
    p: ["Deleting a line instead of marking it drop silently loses a commit unless the drop-on-missing check is enabled.", "Reordering commits that touch the same lines creates conflicts the author did not anticipate."],
    v: "Reorder two commits and mark a third as fixup in the todo list, run it, and confirm the resulting history order and a single combined commit match the edited script.",
    dep: ["rebase-engine", "commit-objects"]
  },
  "cherry-pick-and-revert": {
    s: "Applies the change introduced by one existing commit onto the current branch, or applies its inverse to undo it, creating a new commit either way.",
    d: "Cherry-pick runs a three-way merge using the chosen commit's parent as the base, the current head as one side and the chosen commit as the other. Revert is the same operation with the base and the commit swapped. For a merge commit the user must name which parent counts as the mainline. Multiple commits can be applied in sequence, reusing the same state machinery as rebase. The hard part is that the change is textual: if the surrounding code differs, the result can apply cleanly yet be wrong.",
    k: ["Cherry-pick vs merging the branch: cherry-pick brings only one change but produces a duplicate with a different identifier; merging carries everything and keeps ancestry.", "Revert a merge by choosing a mainline vs undoing its content by hand: the first is automatic but later re-merging the branch needs the revert itself reverted."],
    p: ["Cherry-picking a fix to release and main separately, then seeing the same conflict again at the next merge.", "Reverting a merge and then merging the branch again: the changes do not return because history says they were merged."],
    v: "Cherry-pick one commit onto another branch, confirm the patch is identical but the identifier differs, then revert it and confirm the tree matches the state before the pick.",
    dep: ["three-way-content-merge", "commit-objects", "merge-base-computation"]
  },
  "stash": {
    s: "Saves uncommitted changes to the index and working tree as special commits and restores a clean tree, so work in progress can be set aside and reapplied later.",
    d: "A stash is a commit whose tree records the working files, with one parent being the current head and another recording the index state; optionally a third commit holds untracked files. A reference points at the latest stash, and its reflog is the stack of older entries. Applying a stash performs a three-way merge between the stash, its base and the current tree. Because it reuses commits it is stored in the object database and survives restarts. The difficulty is conflicts at apply time and stashes forgotten for months.",
    k: ["Stack of stashes vs temporary branch: the stack is quick and tidy but anonymous; a branch is named and shareable but heavier to manage.", "Including untracked and ignored files vs tracked only: including more saves everything, but can sweep up large or generated files."],
    p: ["Dropping a stash by mistake, then discovering its commit remains only as an unreachable object until pruned.", "Applying a stash onto a very different base produces conflicts that leave the stash and tree both half-used."],
    v: "Modify tracked and untracked files, stash them, confirm the tree is clean, then apply and confirm file contents and index state match the saved copy exactly.",
    dep: ["commit-objects", "three-way-content-merge", "reflog", "status-engine"]
  },
  "bisect": {
    s: "Binary search over history to find the first commit that introduced a change in behavior, driven by a person or an automated test labeling commits good or bad.",
    d: "The user names one known-good and one known-bad commit. The tool computes the set of commits between them, chooses a commit that splits the remaining candidates as evenly as the graph allows, checks it out, and asks for a verdict. Because history is a graph rather than a line, the midpoint is chosen by counting ancestors, not by position. A test script can run unattended and signal good, bad or skip. Hard parts are untestable commits and flaky tests that corrupt the search.",
    k: ["Manual verdicts vs scripted run: manual handles visual bugs but is slow; scripted runs scale but need a deterministic test with clear exit codes.", "Linear commit count vs graph-weighted midpoint: weighting by reachable commits gives fewer steps on branchy history, with more graph computation."],
    p: ["A flaky test marks a good commit bad and sends the search to the wrong place without any warning.", "Commits that do not build must be skipped, and too many skips leave the answer as a range of candidates."],
    v: "Seed a regression in one known commit of a hundred, run bisect with a script, and confirm it identifies that exact commit in about seven checkouts.",
    dep: ["history-traversal", "revision-ranges", "checkout-and-switch", "commit-graph-file"]
  },
  "linked-worktrees": {
    s: "Additional working directories attached to one repository, each with its own checked-out branch, index and HEAD, while sharing a single object database and references.",
    d: "The main repository keeps a records directory with one entry per linked worktree, holding that tree's HEAD, index and lock state; the linked directory has a small file pointing back to it. Objects, branches, tags and configuration are shared, so commits made in one are visible to the others at once. A branch can be checked out in only one worktree at a time to prevent two indexes diverging. The hard part is cleanup: deleting the directory by hand leaves a stale record that must be pruned.",
    k: ["Linked worktrees vs separate clones: linked ones share storage and fetch once, but share lock domain and fate; clones are fully independent but duplicate everything.", "One branch per worktree rule vs allowing duplicates: the rule prevents conflicting updates, at the cost of occasionally needing a detached HEAD."],
    p: ["Removing a worktree directory manually leaves a record that blocks reuse of that branch until pruned.", "Per-worktree references such as HEAD being read from the shared location by tools that assume one working tree."],
    v: "Add a worktree on a second branch, commit in it, and confirm the commit appears from the main directory without fetching, and the same branch cannot be checked out twice.",
    dep: ["symbolic-refs-and-head", "index-file-format", "object-database-abstraction"]
  },
  "conflict-resolution-reuse": {
    s: "Records how a conflict was resolved and automatically applies the same resolution when an identical conflict reappears, as in repeated rebases or re-merges.",
    d: "When a merge stops with conflicts, the tool hashes the conflicting regions to form a key and stores the pre-image. After the user resolves and commits, it saves the post-image under that key. Next time the same conflict text appears, the stored resolution is applied and staged. This is what makes long-lived topic branches rebased many times bearable. Entries expire after a configurable age. The hard part is that the key depends on exact text, so a small change nearby breaks the match.",
    k: ["Automatic reuse vs asking each time: reuse saves repeated effort but can silently apply a resolution that no longer fits the surrounding change.", "Local cache vs shared cache: sharing spreads one person's work across a team, but also spreads a wrong resolution."],
    p: ["A recorded resolution applied after the code around it changed, hiding a real semantic conflict.", "Cache entries accumulating for conflicts that will never recur, until expiry removes them."],
    v: "Resolve a conflict during a merge, abort, repeat the same merge, and confirm the conflicted file is already resolved identically and staged with no manual edit.",
    dep: ["conflict-representation", "three-way-content-merge", "index-file-format"]
  },
  "patch-series-exchange": {
    s: "Turns commits into email-shaped patch files carrying message, author and diff, and applies such files as commits on another repository, without any shared connection.",
    d: "Formatting produces one file per commit with headers for author, date and subject and the diff below, numbered into a series with an optional cover letter. Applying reads each file, rebuilds the commit using the headers, and applies the diff, falling back to a three-way merge using blob identifiers recorded in the patch. This is the review model of mailing-list projects, and also a way to move work between unrelated repositories. The hard part is lossy formats: signatures, binary changes and renames survive only with extra options.",
    k: ["Patch files vs fetching a branch: patches work anywhere and are easy to review inline, but lose commit identity and ancestry; fetch preserves both.", "Apply with three-way fallback vs strict apply: fallback resolves more series, but may produce conflicts instead of a clean refusal."],
    p: ["Mail clients re-wrapping or altering whitespace so the patch no longer applies.", "Applying a series onto a different base than the author used and getting subtle merge differences."],
    v: "Format three commits, apply them to a clone of the parent state, and confirm the resulting trees are identical while the commit identifiers differ.",
    dep: ["diff-output-and-patch-apply", "three-way-content-merge", "commit-objects"]
  },
});
