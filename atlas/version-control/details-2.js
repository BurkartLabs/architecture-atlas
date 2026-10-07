// Details for the version control plate, part 2: history queries, diff, merge.
ATLAS.details("version-control", {
  "revision-expressions": {
    s: "The small language that names commits and trees: abbreviated identifiers, branch and tag names, ancestor and parent suffixes, date and reflog selectors, and path lookups.",
    d: "A parser resolves each expression to an object identifier by trying, in order, an exact identifier, a reference name through a fixed search path, and a unique abbreviation. Suffixes then walk the graph: parent number, nth ancestor, peel to a tree, or look up a path inside it. Selectors read the reflog by position or by time. Abbreviations must stay unique, so their minimum length grows with object count. The difficulty is ambiguity: a name can be both a branch and a tag, and a short prefix can start matching two objects tomorrow.",
    k: ["Short abbreviations vs full identifiers in scripts: short ones are readable but may become ambiguous as objects accumulate; full ones are stable and safe.", "Fixed reference search order vs requiring a full name: the order is convenient but lets a same-named tag shadow a branch."],
    p: ["Saving an abbreviated identifier in documentation, which later matches two objects and errors.", "A branch and a tag with the same name, so a script silently resolves to the wrong one."],
    v: "Resolve a parent-of-parent expression, a date selector and a path lookup on one commit, and confirm each prints the expected full identifier and file content.",
    dep: ["reference-namespace", "object-database-abstraction", "reflog", "commit-objects"]
  },
  "history-traversal": {
    s: "Walks the commit graph from starting points through parent links in a defined order, with a priority queue by date or by topology, feeding every history command.",
    d: "A walk keeps a queue of commits to visit, marks each as seen, and pushes parents. The default order is by commit date, which is approximate because dates can be wrong; topological order guarantees children before parents; generation numbers allow cutoff without reading old commits. Each step needs the commit's parents and date, which come from the commit-graph file when present or from decompressing the object otherwise. The hard part is cost: on a large repository, loading millions of commit objects dominates the time.",
    k: ["Date-ordered walk vs topological walk: date order streams results early and is cheap, but can show a parent before its child when clocks are skewed; topological order is exact but needs more bookkeeping.", "Reading commit objects vs a precomputed graph file: objects are always current; the file is much faster but must be kept up to date."],
    p: ["A commit with a wrong date confusing date-ordered cutoffs and dropping results that should appear.", "Walking the whole history to answer a question limited to the last few weeks."],
    v: "Time a full history walk on a large repository with and without the commit-graph file, and confirm identical output order with a large reduction in elapsed time.",
    dep: ["commit-objects", "commit-graph-file", "object-database-abstraction"]
  },
  "revision-ranges": {
    s: "Set expressions over history such as commits reachable from one point but not another, symmetric difference, and merge-base-relative ranges, selecting which commits a command covers.",
    d: "A range is a list of included and excluded starting points. The walk marks everything reachable from an exclusion as uninteresting, propagating that mark down through parents, and returns the rest. The two-dot form means reachable from the right but not the left; the three-dot form means reachable from either side but not both. Limiting by count, date or author composes with these. The difficulty is efficiency: marking uninteresting commits correctly requires the walk to go far enough down that it does not return commits already covered.",
    k: ["Two-dot vs three-dot ranges: two-dot answers what is new on one side, three-dot shows divergence from both, and the two read differently for diff than for log.", "Stop early on uninteresting commits vs walk exhaustively: early stop is fast but depends on dates or generation numbers being trustworthy."],
    p: ["Using the wrong dot form with diff and reviewing changes from the wrong base.", "A skewed commit date causing the early stop to end too soon and list commits that are already covered."],
    v: "On a diverged pair of branches, list each side's two-dot range and the three-dot range, and confirm the three-dot result equals the union of the two exclusive sets.",
    dep: ["history-traversal", "merge-base-computation", "revision-expressions"]
  },
  "pathspec-matching": {
    s: "The pattern syntax limiting a command to certain paths: literals, wildcards, directory prefixes, exclusions and magic prefixes controlling case, root anchoring and attribute filters.",
    d: "A pathspec is parsed into a list of patterns, each with flags for literal or glob matching, case sensitivity, top-of-tree anchoring and exclusion. Matching runs against slash-separated paths relative to the repository root, not the shell's current directory unless specified. It is used by add, diff, log, checkout and sparse selection. A separate fast path handles pure literal prefixes so tree walks can skip whole directories. The hard part is shell expansion: unquoted wildcards expand before the tool sees them, giving different results from the quoted form.",
    k: ["Tool-side glob matching vs shell expansion: tool-side matching sees deleted and unstaged paths and is consistent; shell expansion only sees files that exist on disk.", "Prefix-only fast path vs full pattern evaluation: the fast path prunes trees quickly, but any wildcard forces a slower walk."],
    p: ["Unquoted wildcards expanding in the shell and silently ignoring paths that are only in history.", "An exclude pattern listed first with no positive pattern selecting nothing at all."],
    v: "Run log with a quoted directory glob and an exclusion, and confirm it lists commits touching included paths, including files since deleted, and none touching only the excluded path.",
    dep: ["tree-objects", "sparse-checkout"]
  },
  "history-simplification": {
    s: "Prunes the commit graph to the commits that explain how a set of paths reached its current state, dropping side branches that did not change them.",
    d: "While walking, each commit's tree is compared with its parents for the selected paths. If it equals one parent, the walk follows only that parent and drops the commit; a merge identical to one side takes that side. Modes control how aggressively to cut, and how to show merges that combined differing versions. Parent rewriting then connects the surviving commits into a readable graph. The difficulty is correctness versus cost: the default can hide a branch whose change was reverted by a merge, and fuller modes cost more.",
    k: ["Default simplification vs full history for the paths: the default is short and readable but can omit a side branch that mattered; full history is complete but noisy.", "Rewriting parents vs listing commits flat: rewriting shows structure, but a rewritten graph does not match the real parent links."],
    p: ["Concluding a change never existed because the default mode followed only the side that matched the final tree.", "Combining path-limited log with rename following and expecting renames across merges to be tracked."],
    v: "Create a branch that changes a file and a merge that discards it; confirm the default log omits the branch while the full-history mode shows the change and its merge.",
    dep: ["history-traversal", "pathspec-matching", "tree-and-index-diff"]
  },
  "blame": {
    s: "Attributes each line of a file to the commit that last changed it, following lines backward through edits, moves and optionally renames and copies across files.",
    d: "Blame starts with the final file and assigns all its lines to the newest commit. For each commit it diffs against the parent: lines unchanged are passed to the parent, lines added stay with the commit. Passing continues until every line is attributed. With copy detection the tool also searches other files changed in the same commit for the same text. A list of ignored revisions skips mass reformatting commits. The hard part is cost: each step needs a diff, and files with long histories need thousands of them.",
    k: ["Line-based diffs vs token-aware attribution: lines are cheap and predictable, but whitespace or reformatting changes take blame away from the real author.", "Following copies across files vs same file only: copy detection finds true origin but multiplies diff work."],
    p: ["A bulk reformatting commit becoming the blamed change for every line, hiding real authorship.", "Trusting blame as intent: the last committer may only have moved the line."],
    v: "Reformat a file in one commit, then run blame with the ignore-revision list containing it, and confirm lines are attributed to the earlier commits that wrote them.",
    dep: ["myers-diff", "history-traversal", "rename-and-copy-detection", "commit-graph-file", "path-change-filters"]
  },
  "content-search": {
    s: "Searches for text across the working tree, the index or any commit's tree, and across history for commits whose diff adds or removes a given string or pattern.",
    d: "Tree search reads blobs from the selected snapshot and applies a pattern with options for fixed strings, patterns, word boundaries and path limits; it can run in parallel over files. History search, often called the pickaxe, runs a diff for each commit and checks whether the count of a string changed, which finds when code was introduced or removed. A regular-expression variant matches changed lines. The hard part is cost: history search must produce diffs for every commit in the range, so it is slow without path limits.",
    k: ["Searching a snapshot vs searching history: a snapshot is fast and answers what exists now; history search answers when it changed and costs a diff per commit.", "Fixed string vs pattern: fixed strings are fast and predictable, patterns express more but are slower and easy to get wrong."],
    p: ["Running a history-wide search with no path limit on a large repository and waiting minutes.", "Searching only the working tree and missing matches that exist in staged or committed content."],
    v: "Add a distinctive string in one commit and remove it in a later one; confirm history search lists exactly those two commits, and snapshot search finds it only in the earlier tree.",
    dep: ["tree-objects", "blob-objects", "history-traversal", "myers-diff"]
  },
  "log-output-formats": {
    s: "Formats commit lists as one-line summaries, full messages, graph drawings, custom templates or machine-readable records, with optional diffs, statistics and decorations.",
    d: "After the walk selects commits, a formatter expands placeholders for identifiers, author, dates, subject and body, and refs pointing at each commit. A graph renderer assigns each commit a column and draws parent lines. Optional diff output appends a patch or a summary of files and line counts. A machine format uses delimiters safe against content so scripts can parse it. Pager and color handling follow the terminal. The hard part is stability: scripts that parse human-oriented output break when it changes.",
    k: ["Human-oriented output vs a stable machine format: the first is readable and evolves; the second is safe for scripts and less pleasant.", "Graph drawing vs plain lists: graphs show structure but get wide and misleading for large histories."],
    p: ["Parsing default output in automation and breaking after a formatting change or a locale difference.", "Putting newline-containing fields inside delimiters that can occur in commit messages."],
    v: "Produce a custom format with identifier, author and subject for a range, parse it with a script, and confirm the record count equals the commit count even with multi-line messages.",
    dep: ["history-traversal", "commit-objects", "tree-and-index-diff"]
  },
  "myers-diff": {
    s: "The default line-diff algorithm: finds a shortest edit script between two sequences by exploring diagonals of an edit graph, with cost proportional to input size times edit distance.",
    d: "Both files are split into lines and lines hashed to integers. The algorithm searches for the shortest path through a grid where moving right deletes a line, down inserts one and diagonals match. It proceeds in rounds of increasing edit count, tracking the furthest reachable point on each diagonal, and recovers the path by dividing at a middle snake. Frequent short lines such as braces are discarded from the search and added back after. The hard part is readability: the shortest script can pair unrelated lines.",
    k: ["Minimal edit script vs a human-friendly one: minimal is mathematically smallest, but may align braces and blank lines in confusing ways.", "Heuristic cutoffs on huge inputs vs always optimal: cutoffs bound the time on large files, at the cost of a larger diff."],
    p: ["Diffs that shift a function boundary because identical closing lines matched in the wrong place.", "Very large generated files taking seconds to diff when edit distance is high."],
    v: "Diff two versions of a file differing by a single insertion, and confirm the output reports exactly one added hunk; then diff two unrelated files and confirm it terminates within the cutoff.",
    dep: ["blob-objects"]
  },
  "patience-and-histogram-diff": {
    s: "Alternative line-diff algorithms that anchor on unique or rare lines first, producing output that tends to match how a person would describe the change.",
    d: "Patience matches lines that occur exactly once in both files, keeps the longest increasing run of those pairs as anchors, and recurses on the regions between. Histogram extends this by counting occurrences and choosing the lowest-frequency matching line as the anchor, falling back to the base algorithm where nothing is rare. Both avoid matching common lines like braces or blank lines across unrelated blocks. They are selected by configuration and used by merges as well. The hard part is that they can produce longer scripts than the minimal one.",
    k: ["Anchor on unique lines vs minimal script: anchors give stable and readable hunks, but not always the shortest diff.", "Histogram vs patience: histogram handles files with few unique lines and runs faster, while patience is simpler and more predictable."],
    p: ["Files with no unique lines falling back to a plain algorithm and surprising people who expected the new one.", "Different algorithms in diff and merge giving a displayed change that differs from what merge saw."],
    v: "Diff a file where a function is moved above another using minimal and histogram settings, and confirm the histogram output shows one moved block while the minimal one interleaves unrelated lines.",
    dep: ["myers-diff"]
  },
  "rename-and-copy-detection": {
    s: "Infers that a file was moved or copied by matching deleted and added paths on content similarity, because the object model records only trees, not moves.",
    d: "After a tree diff lists additions and deletions, exact matches pair up by identical blob identifier. Remaining pairs are scored by similarity: the files are broken into chunks, and the share of common chunk bytes is computed. Pairs above a threshold become renames, and the same process finds copies when allowed. A cap on candidates avoids a quadratic blow-up. The inference is repeated every time a diff or merge is requested, not stored. The hard part is cost and ambiguity on large changes or many near-identical files.",
    k: ["Detect renames at diff time vs record them at commit time: detection needs no metadata and works on any history, but is heuristic and costs work each time.", "Low similarity threshold vs high: low finds heavily edited moves but pairs unrelated files; high is cautious and misses real renames."],
    p: ["A file renamed and heavily rewritten in one commit is shown as delete plus add, so history and blame stop.", "Large refactors hitting the candidate limit, after which detection is silently turned off."],
    v: "Move a file and edit ten percent of it in one commit; confirm diff reports a rename with the similarity score, then rewrite most of it and confirm it reports an add and a delete.",
    dep: ["tree-and-index-diff", "blob-objects", "tree-objects"]
  },
  "word-and-moved-line-diff": {
    s: "Refinements that show changes inside lines by word or character, and mark blocks of lines that moved rather than being deleted and added separately.",
    d: "Word diff tokenizes changed lines by whitespace or a regular expression and diffs the tokens, then prints the result inline with markers or color. Moved-line detection scans removed and added blocks for identical text, then colors matched blocks differently from true additions and deletions, ignoring whitespace changes if asked. Both run after the line diff, only on changed regions, so the cost is limited. The hard part is tokenization: the right word boundary differs for prose, code and data, and ignored whitespace can hide real changes.",
    k: ["Word-level vs line-level display: word level shows exactly what changed in a long line, but is noisier for large rewrites.", "Ignoring whitespace changes vs showing them: ignoring reduces noise from reformatting but can hide meaningful changes in whitespace-sensitive formats."],
    p: ["Ignoring whitespace in a file where indentation carries meaning, and approving a behavior change that did not show.", "A word regex that splits on punctuation, producing unreadable fragments in code."],
    v: "Change one word in a long line and move a ten-line block elsewhere; confirm word diff highlights only the word and moved-line mode marks the block as moved, not as added and removed.",
    dep: ["myers-diff", "patience-and-histogram-diff"]
  },
  "binary-and-textconv-diff": {
    s: "Handles files that are not line-oriented text: reports binary changes as a size or hash change, or converts content to readable text through a filter before diffing.",
    d: "A file is treated as binary if it contains a null byte near the start or an attribute marks it so. The diff then says the files differ, or emits a binary delta if requested. A text conversion filter named by attributes can run a program that turns a document, image metadata or archive listing into text, and the diff operates on that output. Results can be cached by blob identifier. The hard part is that conversion filters are external programs run on untrusted content, and a slow one makes every diff slow.",
    k: ["Opaque binary change vs converted text: opaque is cheap and honest, but gives reviewers nothing; conversion gives insight but depends on an external program.", "Binary patch support vs refusing: binary deltas let patches round-trip but are large and unreviewable."],
    p: ["A conversion filter that is missing on another machine so diffs differ per developer.", "A text file with a stray null byte being treated as binary and losing line diffs."],
    v: "Commit a changed image and a changed document with a text conversion rule; confirm the first shows a binary notice and the second shows a readable line diff produced by the filter.",
    dep: ["attributes", "blob-objects", "tree-and-index-diff"]
  },
  "diff-output-and-patch-apply": {
    s: "Writes diffs in unified, statistical and raw forms, and applies a patch to a working tree or index, with whitespace handling and rejection of hunks that do not fit.",
    d: "The unified format lists changed files with hunks of context lines, an extended header with mode and blob identifiers, and rename or binary notes. Apply parses it, locates each hunk by line number and context, tolerating an offset, and writes the result; with the index option it also stages. If a hunk fails, it can leave a reject file or fall back to a three-way merge using the blob identifiers in the header. The hard part is fuzzy matching: too lenient and a hunk lands in the wrong place.",
    k: ["Strict context matching vs fuzzy offsets: strict is safe but fails on small drift; fuzzy applies more but can place a change in the wrong block.", "All-or-nothing apply vs partial apply: all-or-nothing leaves the tree untouched on failure; partial gets work done but needs cleanup."],
    p: ["Fuzzy offsets applying a hunk to a similar but different function.", "Whitespace stripping at apply time changing file contents compared to the patch author's version."],
    v: "Generate a patch, modify the target file so hunks shift by a few lines, apply it, and confirm correct placement; then make a hunk impossible and confirm a clean failure leaves files unchanged.",
    dep: ["myers-diff", "three-way-content-merge", "index-file-format"]
  },
  "tree-and-index-diff": {
    s: "Compares two trees, a tree and the index, or the index and the working tree, by walking sorted entries in parallel and skipping subtrees with identical identifiers.",
    d: "Both sides are sorted lists of name, mode and identifier, so a merge-style walk finds additions, deletions, mode changes and modifications. When two subtree entries have the same identifier, the entire subtree is skipped without being read, which makes comparing two commits cost proportional to the change, not the repository size. Working tree comparisons use the stat cache first, and hash content only when it looks changed. The hard part is that sorting rules treat directories as if their names ended in a slash, which must match exactly.",
    k: ["Identifier-based subtree skipping vs full content comparison: skipping is dramatically faster, and relies on the hash being collision resistant.", "Stat-based shortcuts for the working tree vs hashing every file: stat checks are fast but can be fooled, while hashing is exact and slow."],
    p: ["Incorrect directory sort order causing entries to be paired wrongly and reported as deletes plus adds.", "A tool changing a file while preserving its size and timestamp, so the stat shortcut misses it."],
    v: "Compare two commits that differ in one file of a ten-thousand-file repository and confirm only the path to that file is read, as seen in the object read counters.",
    dep: ["tree-objects", "index-file-format", "stat-cache"]
  },
  "merge-base-computation": {
    s: "Finds the best common ancestor or ancestors of two commits, the reference point from which both sides' changes are measured in a three-way merge.",
    d: "The walk paints commits reachable from each side with a different color and finds the first commits colored both. The merge bases are those not reachable from another candidate. In history with criss-cross merges there can be several equally good bases, and the merge strategy decides how to combine them. Generation numbers from the commit graph file let the walk stop earlier. The result drives merge, rebase onto, three-dot ranges and fork-point detection. The hard part is multiple bases and shallow history that hides the true ancestor.",
    k: ["Single best ancestor vs all independent bases: one base is simpler and cheaper, but wrong for criss-cross history; all bases give correct results at higher cost.", "Fork-point detection using the reflog vs graph ancestor: the reflog finds where a branch really started after upstream rewrites, but only on the local clone."],
    p: ["Shallow clones lacking the true ancestor and reporting an unrelated histories error or a wrong base.", "Assuming one merge base and discarding the others in tooling around merges."],
    v: "Build a criss-cross history and confirm the tool reports two merge bases; then run the same query on a shallow clone and confirm it reports the boundary instead of a wrong answer.",
    dep: ["history-traversal", "commit-graph-file", "commit-objects"]
  },
  "three-way-content-merge": {
    s: "Combines two edited versions of a file against their common ancestor, accepting changes made on only one side and flagging regions where both sides changed differently.",
    d: "The merge diffs base against each side to get two lists of changed regions, then walks them together. A region changed on one side is taken. A region changed identically on both is taken once. A region changed differently overlaps and becomes a conflict, with the three versions kept. Adjacent but not overlapping changes may merge or conflict depending on context rules. Line granularity is typical; some modes refine inside the conflict. The hard part is semantics: textual agreement does not mean the program is still correct.",
    k: ["Line-based merge vs structure-aware merge: line merges are language independent and predictable but blind to meaning; structured merges handle moves and reformatting but need a parser per format.", "Treat adjacent changes as conflicts vs merge them: conservative flags more but never combines unrelated edits."],
    p: ["A clean merge that compiles but breaks behavior because two changes interact.", "The diff algorithm choice causing the same pair of edits to conflict under one setting and merge cleanly under another."],
    v: "Merge two branches that edit different lines of one file and confirm a clean result with both edits; edit the same line on both and confirm a conflict showing base, ours and theirs.",
    dep: ["myers-diff", "patience-and-histogram-diff", "conflict-representation", "merge-base-computation"]
  },
  "recursive-merge-strategy": {
    s: "The default strategy for handling multiple merge bases: merge the bases into a virtual ancestor first, then use that as the base for the real three-way merge.",
    d: "When two commits have several merge bases, the strategy merges them pairwise, recursively, building an in-memory commit that stands for the combined ancestor. Conflicts inside that virtual merge are left in place as markers and used as content, so the outer merge is still well defined. Modern implementations run on trees without touching the working directory, then write results, which is faster and safer. Rename detection runs once across the whole merge. The hard part is predictability: the virtual ancestor can hold conflict markers.",
    k: ["Virtual ancestor vs choosing one base: the virtual base resolves criss-cross history more accurately, at the cost of extra merge work and harder explanations.", "In-memory merge then write vs modifying the working tree as it goes: in-memory is faster and leaves no half state on failure."],
    p: ["Conflict markers from the virtual ancestor surviving into the final result and confusing reviewers.", "Large directory renames on one side moving new files on the other side into the renamed directory unexpectedly."],
    v: "Merge two branches from a criss-cross history and confirm the result differs from a single-base merge only where the bases disagreed, and that the working tree is untouched until the merge succeeds.",
    dep: ["merge-base-computation", "three-way-content-merge", "tree-level-merge", "rename-and-copy-detection"]
  },
  "tree-level-merge": {
    s: "Merges the directory structure itself: additions, deletions, renames and mode changes on both sides, including cases such as a file on one side and a directory on the other.",
    d: "Before content is merged, the three trees are walked together by path. Entries unchanged on one side take the other. Entries with different changes are classified: modify and delete, add and add with different content, rename and edit, directory and file name clash. Rename detection maps a moved path on one side onto edits on the other, optionally moving whole directories. Each conflict class has a defined result and is recorded in the index with stages. The hard part is the large number of structural conflict kinds.",
    k: ["Directory rename inference vs treating files individually: inference carries new files into moved directories but can guess wrong; per-file handling is literal and may strand files.", "Case-sensitive path compare vs the platform's: sensitive is exact, but misses clashes that appear on case-folding file systems."],
    p: ["A file added on one side into a directory the other side renamed, landing in a surprising place.", "Two paths that differ only in case merging cleanly and then colliding on checkout on case-insensitive disks."],
    v: "Rename a directory on one branch and add a file inside the old directory on another; confirm the merge reports the rename inference and places the file where the setting dictates.",
    dep: ["tree-objects", "rename-and-copy-detection", "conflict-representation", "index-file-format"]
  },
  "conflict-representation": {
    s: "How an unresolved merge is stored: three staged versions of each conflicted path in the index and, in the file, textual markers delimiting the competing contents.",
    d: "For a conflicted path, the index holds up to three entries at stages one, two and three, for the base, ours and theirs, rather than the normal stage zero. Resolving writes a stage zero entry and removes the others. In the working file the merge writes marker lines around the two sides, optionally with the base between them. Tools read the staged entries to open three-way viewers. Commit is refused while any path has a nonzero stage. The hard part is that markers are only text: they can be committed by accident.",
    k: ["Markers in files vs structured conflict objects: markers work with any editor and tool, but are ambiguous and can be committed; structured records are safe but need tool support.", "Showing the base in markers vs two-sided only: base makes the conflict understandable at the cost of longer output."],
    p: ["Committing a file that still contains marker lines because no check looked for them.", "File content that already contains marker-like lines being mistaken for conflicts."],
    v: "Produce a conflict, list the index with stages and confirm three entries for the path; resolve and add it and confirm one stage zero entry remains and the commit is allowed.",
    dep: ["index-file-format", "blob-objects"]
  },
  "merge-drivers-and-strategies": {
    s: "Pluggable control over merging: strategies that choose how histories combine, options that favor one side, and per-path drivers that merge particular file types with custom programs.",
    d: "Strategies include the default, one that keeps only the current tree while recording the merge, and one for several parents at once, which refuses to proceed if conflicts occur. Options such as preferring one side on conflicts or ignoring whitespace tune content merges. Attributes bind a path pattern to a driver, which receives the three versions as temporary files and writes the result and an exit status. Drivers suit generated files or structured formats. The hard part is that custom drivers are code run during every merge.",
    k: ["Built-in strategy options vs custom drivers: options are portable and need nothing installed; drivers handle special formats but must exist on every machine.", "Prefer-one-side options vs manual resolution: preferring a side is fast but silently discards the other side's changes in conflicts."],
    p: ["Using the keep-ours strategy and believing the other branch's changes were merged when only the history link was.", "A driver defined in attributes but not in local configuration, so it is skipped on other machines."],
    v: "Configure a driver for a generated lockfile pattern, merge two branches that both changed it, and confirm the driver ran and produced a file that passes the format's own validator.",
    dep: ["three-way-content-merge", "attributes", "recursive-merge-strategy"]
  },
  "merge-commit-creation": {
    s: "Finishes a successful merge by writing a commit with two or more parents, a generated message and the merged tree, or fast-forwarding when no new commit is needed.",
    d: "If the current head is an ancestor of the other side, the branch can simply move forward to it with no merge commit. Otherwise a commit is written whose parents are the current head and the merged head, with a message listing the merged branch. Policies can require a merge commit even when fast-forward is possible, or refuse any non-fast-forward. The command records pending merge state in files so a conflicted merge can resume. The hard part is state: an interrupted merge leaves files that later commands must respect.",
    k: ["Always create a merge commit vs fast-forward when possible: always-merge keeps a record of the integration; fast-forward keeps history linear.", "Fast-forward only vs allowing merges: fast-forward only guarantees linear history but forces rebasing before integration."],
    p: ["Fast-forwarding a long-lived branch and losing the record that it ever existed as a separate line.", "Stale merge state files making a later unrelated commit become an unintended merge commit."],
    v: "Merge a branch that is ahead of the current one and confirm no new commit and a moved reference; merge a diverged branch and confirm a commit with two parents and the merged tree.",
    dep: ["commit-objects", "three-way-content-merge", "ref-transactions"]
  },
});
