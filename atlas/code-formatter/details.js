// Details for the code formatter plate, part 1: integration and configuration.
ATLAS.details("code-formatter", {
  "format-on-save": {
    s: "The editor setting that runs the formatter every time a file is saved, so style is applied continuously and never accumulates as a large pending change.",
    d: "The editor intercepts the save event, sends the buffer to the formatter, and replaces the buffer contents with the result before writing to disk. It may call a long-running service or spawn the command line with the buffer on standard input. The hard part is latency and edit races: the user keeps typing while the formatter runs, so the result must be applied as a minimal set of edits, or discarded if the buffer changed, and the cursor and undo history should survive.",
    k: ["Whole-buffer replacement vs minimal text edits: replacement is simple but resets cursor, folds and undo points; computing edits keeps editor state but costs a diff on every save.", "Format before the write vs after it: before keeps the saved file formatted, while after never delays the save but briefly leaves unformatted content on disk."],
    p: ["A slow formatter blocks the save, so users disable the feature and unformatted code reaches review.", "A result applied to an edited buffer overwrites newer keystrokes or lands at the wrong offsets."],
    v: "Save a deliberately misformatted file in the editor and confirm the buffer changes within a fraction of a second, the cursor stays on the same token, and one undo restores the pre-format text.",
    dep: ["formatting-service", "range-splice", "cursor-tracking"]
  },
  "formatting-service": {
    s: "A long-lived process or library that answers format requests from editors over a protocol, keeping parsers and configuration warm between requests.",
    d: "Spawning a process per save wastes time on startup and on loading configuration. A service keeps the process alive, receives the document text, its language and its path, and replies with edits or a full replacement. It typically speaks a standard language server protocol, so any editor can use it. It must resolve configuration per document path, handle unsaved buffers that have no file, and stay consistent when the editor and the disk disagree about content.",
    k: ["Resident service vs one process per request: resident is faster and can cache, but leaks memory and needs lifecycle management; per-request is simple and always fresh.", "Edits returned vs whole text returned: edits preserve editor state but require a diff step; whole text is trivial and shifts the diffing to the client."],
    p: ["A service that caches configuration keeps formatting with old settings after the config file changes.", "Unsaved buffers resolved against the wrong working directory pick up the wrong config or ignore rules."],
    v: "Start the service, format one document, edit the config file, format again without restarting, and confirm the second result reflects the new setting. Compare its output with the command-line output byte for byte.",
    dep: ["config-discovery", "language-dispatch", "printer-loop"]
  },
  "range-request": {
    s: "A request to format only a selection or a changed region, used when users want touched lines cleaned without reformatting the rest of a file.",
    d: "The editor or a version control hook sends a start and end offset. The formatter must widen that selection to complete syntax nodes, format them in context so the indentation matches the surroundings, and return edits confined to the region. It is hard because style depends on parents: a selected statement in a deeply nested call cannot be formatted in isolation without knowing its depth, and the output near the boundaries must join cleanly with unformatted neighbors.",
    k: ["Format only selected lines vs expand to whole nodes: exact lines respect the request, but only node expansion yields code that is valid and stable.", "Format the whole file then crop vs format the region only: cropping gives consistent style at extra cost, while region-only is fast but can disagree with a full run."],
    p: ["A range that splits a node produces output that is syntactically valid but unlike what a full format would give.", "Formatting a range then the whole file changes the range again, showing the range path is not idempotent with the full path."],
    v: "Select two lines in the middle of a nested block, format them, and confirm that only those statements changed and that formatting the entire file afterward changes nothing further in that region.",
    dep: ["range-expansion", "range-splice", "formatting-service"]
  },
  "on-type-formatting": {
    s: "Small, immediate adjustments triggered by typing a particular character, such as closing a block or ending a statement, instead of waiting for a save.",
    d: "The editor registers trigger characters. When one is typed, it asks the formatter to fix a narrow area: the line just finished, the block just closed. Because the code is mid-edit and often syntactically broken, the formatter works from error-recovered trees or from token-level rules rather than complete documents. The difficulty is restraint: edits that fire while a user is mid-thought, move the cursor, or fight their intended layout feel hostile, so rules are few and conservative.",
    k: ["Trigger-character edits vs full format on save: instant feedback is pleasant, but partial rules can disagree with the full formatter and cause churn on save.", "Tree-based vs token-based rules: trees are accurate but fail on broken code; tokens work on any text but guess at structure."],
    p: ["An on-type edit that disagrees with the full formatter makes every save change the line again.", "Adjustments that move the cursor or consume typed characters cause lost input."],
    v: "Type a closing delimiter in an incomplete file and confirm only the current line is re-indented, the cursor stays after the typed character, and a later full format leaves that line unchanged.",
    dep: ["formatting-service", "error-recovery"]
  },
  "pre-commit-hook": {
    s: "A version control hook that formats, or rejects, the files in a commit so unformatted code never enters history.",
    d: "The hook lists staged files, runs the formatter over just those, and either rewrites them and re-stages the result or fails the commit with a message. It must handle partially staged files, where the working tree differs from the index, without stashing away or mixing unrelated edits. It must also stay fast because it runs on every commit, which usually means formatting only changed files and relying on a result cache.",
    k: ["Rewrite staged files vs only check them: rewriting is convenient but can surprise users and mix formatting with partial staging; checking is safe but costs a manual step.", "Hook-only enforcement vs CI as the backstop: hooks give quick feedback yet are skippable and local; CI is authoritative but slow to tell the author."],
    p: ["Partially staged files get fully formatted and re-staged, committing changes the author deliberately left out.", "A slow hook trains developers to skip it with a bypass flag."],
    v: "Stage one hunk of a misformatted file, commit, and confirm the commit contains only the formatted staged hunk while the unstaged hunk remains untouched in the working tree.",
    dep: ["file-walker", "result-cache", "exit-status"]
  },
  "ci-check-mode": {
    s: "A read-only mode that exits with failure when any file would change, making formatting a merge requirement without letting automation rewrite code.",
    d: "The tool formats each file in memory, compares the result with the original, and reports every file that differs without writing. The exit status tells the pipeline pass or fail, and the report lists the files so authors know what to run locally. It uses exactly the same code path as the write mode, otherwise the check and the fix would disagree. Pinning the formatter version in CI matters, since a newer release can fail a previously passing check.",
    k: ["Check mode that fails the build vs a bot that pushes fixes: failing keeps authors in control and history clean; pushing fixes saves effort but needs write access and complicates review.", "Check all files vs only changed files: all files catch drift but cost time; changed files are fast and miss formatter upgrades."],
    p: ["A different formatter version in CI than on laptops makes the check fail for code that is correctly formatted locally.", "Check mode skips files that the write mode formats, so the gate passes while the tree is unformatted."],
    v: "Format a clean tree, introduce one misformatted file, run check mode, and confirm a nonzero exit status naming exactly that file and that the file bytes on disk are unchanged.",
    dep: ["file-walker", "exit-status", "diff-report", "option-set"]
  },
  "diff-report": {
    s: "Shows what the formatter would change as a unified diff or a list of lines, so authors can see the change before accepting it.",
    d: "After formatting in memory, the tool computes a line diff between the original and the result and prints it with file paths and context. It is used in check mode, in dry runs and in editor previews. The diff algorithm should favor readable hunks over minimal ones, because a formatter often moves blocks of indentation. Large outputs need limits so a repository-wide failure does not flood the log with thousands of lines.",
    k: ["Full diff vs file list only: a diff explains the failure and enables copy-paste fixes but is long; a list is terse and forces a local run to learn more.", "Minimal edit script vs human-oriented hunks: minimal diffs are smaller, while readable hunks keep re-indented blocks together."],
    p: ["Whitespace-only diffs hide the real change in the noise when a file's indentation shifts.", "Unbounded diff output overwhelms the build log and hides the first, most useful failure."],
    v: "Format a file whose only problem is one over-long call, run the report, and confirm the diff shows exactly the lines of that call, with correct file path and line numbers that match the file.",
    dep: ["printer-loop", "line-index"]
  },
  "blame-ignore-list": {
    s: "A file listing the commits that were pure reformatting, so blame and history tools can skip them and still show who really changed each line.",
    d: "After a mass reformat, every line is attributed to the formatting commit. Version control tools can read a list of commit identifiers to ignore when assigning blame, and hosting sites can read the same list. The team records the formatting commit there, ideally the very commit that adopted the formatter. It only works when the reformat is a separate commit containing nothing else, which is why adoption is done in isolation and why later formatter upgrades that change style are also listed.",
    k: ["Ignore list vs accepting broken blame: an ignore list restores history at the price of maintaining a file and local tool settings; skipping it leaves one author on every line.", "One adoption commit vs gradual reformatting on touch: one commit is easy to ignore; gradual changes mix style with logic and cannot be ignored."],
    p: ["A formatting commit mixed with a functional change cannot be listed, and its logic changes vanish from blame.", "Developers who never configure their local tool still see the formatting commit in blame."],
    v: "Run blame on a line that was only reindented by the adoption commit with the ignore list enabled, and confirm it names the author of the last real edit rather than the formatting commit.",
    dep: ["bulk-adoption"]
  },
  "bulk-adoption": {
    s: "The one-time reformat of an existing codebase, done as an isolated, mechanical commit so style change is separated from behavior change.",
    d: "Adoption runs the formatter on every file and commits the result alone. It needs a quiet moment, since open branches will conflict on every touched line, and a check that the change is behavior-neutral, usually by comparing syntax trees or build outputs before and after. Teams freeze merges, announce the date, run the tool, record the commit in the blame ignore list and turn on CI enforcement the same day. The risk is large and concentrated.",
    k: ["Big-bang reformat vs file-by-file on touch: big-bang ends the argument at once but disrupts every open branch; gradual avoids conflicts yet leaves a mixed codebase for years.", "Trusting the tool vs verifying equivalence: verifying costs a run of the equivalence check, but catches the rare formatter bug before it ships to everyone."],
    p: ["Open branches suffer conflicts on every reformatted line, and authors lose time resolving whitespace.", "A formatter bug that changes meaning is committed to hundreds of files before anyone looks."],
    v: "Compare the syntax trees of every file before and after the adoption commit and confirm they are identical apart from positions, and that a second run of the formatter over the result changes nothing.",
    dep: ["equivalence-check", "idempotence-check", "file-walker"]
  },
  "config-discovery": {
    s: "Finds the configuration that applies to a file by searching its directory and then its parents, so settings live next to the code they govern.",
    d: "For each input path the tool walks up the directory tree until it finds a config file, a project manifest section or an editor settings file, then stops at the repository root or a marker that says it is the top. Results are cached per directory so large trees do not repeat the walk. Complexity arises from precedence: command-line options, nested configs, environment variables and editor settings can all apply, and users need a deterministic rule for which wins.",
    k: ["Nearest config wins vs merge all configs up the tree: nearest is easy to explain but forces repetition; merging reduces repetition but makes the effective value hard to predict.", "Search from the file vs from the working directory: from the file is correct for editors and monorepos; from the working directory is simple but formats the same file differently depending on where it runs."],
    p: ["Two configs in different parents give one file different results depending on tool invocation directory.", "A stray config in a parent directory outside the repository silently changes the style of every project beneath it."],
    v: "Place different line widths in two nested folders and format an identical file in each; confirm the outputs differ accordingly, and that a command to print the resolved configuration shows the file it came from.",
    dep: ["option-set", "config-validation"]
  },
  "option-set": {
    s: "The small, fixed list of settings the formatter exposes, such as line width, indentation and quote style, each with a documented default.",
    d: "Each option adds a dimension to the output, and each must be handled by every layout rule that depends on it, so the test matrix grows multiplicatively. Mature formatters choose a few options that people feel strongly about, such as width and indentation, and refuse the rest. Options live in a typed table that provides defaults, parsing and help text, and the resolved values travel into the printer and rules as one immutable object, never as globals.",
    k: ["Few options vs many: few keeps output uniform across projects and the code simple; many wins adoption from teams with existing conventions but splits the community and multiplies bugs.", "Immutable options object vs ambient settings: an object makes each result a pure function of input and options; ambient state makes embedded and parallel runs unreliable."],
    p: ["An option interacts with another in a combination no test covers, producing invalid or unstable output.", "Adding an option to end one argument invites a dozen further requests."],
    v: "Enumerate every option and its documented values, run the golden corpus under each combination of one option at a time, and confirm each output is idempotent and each option changes at least one expected line.",
    dep: ["config-validation", "opinionated-defaults"]
  },
  "shared-editor-settings": {
    s: "Reads indentation and line ending preferences from a cross-tool editor settings file, so the formatter and editors agree without duplicate configuration.",
    d: "Many projects already declare indent style, indent size, end of line and final newline in a simple per-glob settings file honored by editors. The formatter reads those keys as defaults for matching options, with its own configuration taking precedence. It must translate vocabulary correctly, for example tab width versus indent width, and evaluate section globs in the documented order. The benefit is one source of truth; the risk is a silent override of an option that people thought they set explicitly elsewhere.",
    k: ["Honor shared settings vs ignore them: honoring avoids two files that must agree; ignoring keeps the formatter's behavior self-contained and easier to reason about.", "Settings as defaults vs as overrides: defaults let formatter config win and avoid surprises; overrides respect editor intent but can hide formatter configuration."],
    p: ["A mismatch between editor tab width and formatter indent width causes visibly misaligned continuation lines.", "A glob that matches more files than intended changes style for generated or vendored code."],
    v: "Set indent size in the shared file only, format a sample, and confirm the output uses that width; then set the formatter option explicitly and confirm it overrides the shared file.",
    dep: ["config-discovery", "option-set"]
  },
  "ignore-patterns": {
    s: "Glob rules, in files or comments, that exclude paths such as generated code, vendored libraries and fixtures from formatting.",
    d: "The walker consults ignore files that follow the same syntax as version control ignore files, plus the repository's own ignore list, before touching any path. Negation, directory-only patterns and nested ignore files must behave as users expect. Ignored files are skipped without being read, which saves time. An explicitly named ignored file is a policy question: some tools format it anyway, others refuse and report. The goal is that generated code is never rewritten, so regeneration produces no diffs.",
    k: ["Reuse version control ignore semantics vs a custom syntax: reuse is familiar and shared with other tools; a custom syntax can express formatter-only cases but needs documenting.", "Explicit path overrides ignore vs ignore always wins: overrides let editors format a buffer on demand; always-win keeps rules predictable but frustrates one-off needs."],
    p: ["Generated code that is formatted differs from the next regeneration, creating diff noise on every build.", "An overly broad pattern silently skips real source and the check passes with unformatted code."],
    v: "List files the tool would format versus the whole tree and confirm the ignored folders, including those excluded by negation and nested rules, are absent while every other source file appears.",
    dep: ["file-walker", "config-discovery"]
  },
  "per-path-overrides": {
    s: "Configuration blocks that apply different options to files matching a glob, such as wider lines for data files or a different indentation for one language.",
    d: "A config contains an ordered list of override blocks, each with a glob and a partial option set. The resolver applies the base options, then every matching block in order, so later blocks win. Overrides are how a single repository can hold several languages or legacy areas without separate tool runs. They are also where option sprawl begins, because each override creates a new style region that every contributor must know and that the test matrix must cover.",
    k: ["Order-based precedence vs specificity-based precedence: order is simple to implement and read in a file; specificity mimics stylesheets but is hard to predict for globs.", "Overrides in config vs per-directory config files: one file gives a single overview; per-directory files are local but scatter the style rules."],
    p: ["Two overlapping globs make results depend on block order that nobody remembers.", "Overrides added for a single stubborn file spread until the codebase has no single style."],
    v: "Resolve options for three files covering base, one matching override and two overlapping overrides, and confirm the printed effective values match the documented precedence for each.",
    dep: ["config-discovery", "option-set"]
  },
  "config-validation": {
    s: "Checks configuration files against a schema and fails with a precise message on unknown keys, wrong types and conflicting settings.",
    d: "Config is parsed from a structured text format, then every key is checked against the option table and its type and range. Unknown keys are errors rather than ignored, because a misspelled option otherwise looks like a formatter that disregards the setting. Errors name the file, the key and the allowed values. Deprecated options produce warnings with the replacement, which supports version upgrades. Validation also runs on editor-supplied settings, which often arrive from a different path with weaker typing.",
    k: ["Reject unknown keys vs ignore them: rejecting catches typos and version mismatches immediately; ignoring lets one config serve several tool versions but hides mistakes.", "Schema file vs hard-coded checks: a schema powers editor completion and documentation from one source; hard-coded checks avoid a separate artifact but drift."],
    p: ["A misspelled key is ignored and the team believes a setting is active when it is not.", "A config for a newer release fails to parse on an older pinned tool in CI with an unhelpful message."],
    v: "Feed configs with a typo in a key, a string where a number is required and a deprecated key; confirm three distinct messages naming the file and key, and a nonzero exit for the first two.",
    dep: ["option-set"]
  },
  "opinionated-defaults": {
    s: "The built-in style choices applied when nothing is configured, chosen so most projects can adopt the tool and stop debating formatting.",
    d: "Defaults encode the formatter's philosophy: a line width, an indentation unit, a quote preference, a trailing separator policy. They are the real product, since most users never change them. Choosing them is a social decision as much as a technical one: a default should reduce diff noise against common existing style, favor layouts that keep diffs small when code changes, and be defensible with an explanation. Once released, changing a default is a breaking change.",
    k: ["Strong opinions vs matching existing code: strong opinions give uniformity and end debate, but cost adoption where the code differs; matching existing style lowers friction and entrenches variation.", "Defaults frozen vs improved per release: frozen defaults protect users from churn; improving them lets the tool fix mistakes, at the cost of mass diffs on upgrade."],
    p: ["A default change in a minor release reformats thousands of lines for every user at once.", "A default that favors short lines in one construct generates tall, awkward code in another."],
    v: "Run the formatter with an empty configuration on the golden corpus and confirm output matches the committed snapshots, and that diff size on a typical one-line edit stays confined to the changed lines.",
    dep: ["option-set"]
  }
});
