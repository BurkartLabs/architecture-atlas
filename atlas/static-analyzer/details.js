// Details for the static analyzer plate, part 1: surfaces, triage, result formats.
ATLAS.details("static-analyzer", {
  "editor-diagnostics": {
    s: "Findings shown as underlines and a problem list inside the editor while code is being typed, usually through a language-server connection with a reduced rule set.",
    d: "The analyzer runs as a long-lived process that receives file-change notifications, re-analyzes the open files and their immediate dependents, and publishes diagnostics with ranges and messages. Only fast, mostly local checks run on each edit; heavier checks run on save or are left to CI. Results must be withdrawn the moment the code changes, so stale markers do not mislead. The hard part is latency: a check that takes two seconds feels broken at keystroke speed, so the editor path needs its own budget.",
    k: ["Run on every edit vs run on save: per-edit feedback catches mistakes early but forces a tiny rule set; on-save permits deeper checks at the cost of delayed feedback.", "Share the CI rule set vs maintain a lighter editor set: sharing avoids surprises at merge time, but a lighter set keeps typing responsive and creates drift to manage."],
    p: ["Diagnostics from a previous version of the buffer stay on screen after the code changed, so developers fix lines that are no longer wrong.", "The editor analyzes with different include paths than the build, so it reports errors that CI never sees."],
    v: "Type a known null dereference into an open file and confirm the underline appears within the latency budget, then undo the edit and confirm the marker disappears without saving.",
    dep: ["parser-frontend","analysis-configuration","fact-cache"]
  },
  "ide-quick-fixes": {
    s: "Editor actions attached to a diagnostic that apply a suggested edit, suppress the finding, or open the rule's documentation, so a developer resolves a finding without leaving the file.",
    d: "When a diagnostic is selected, the editor asks the analyzer for code actions covering that range. The analyzer answers with edits from the fix model plus generic actions such as suppress-this-line. Edits are returned as text changes against a specific document version, and the editor applies them as one undoable step. It is hard because the file may have changed since the diagnostic was produced, so the version check must refuse stale edits rather than apply them to the wrong text.",
    k: ["Offer only safe fixes in the quick menu vs offer every candidate: a short menu builds trust, while a long one exposes edits that need human judgment.", "Compute fixes with the diagnostic vs on demand: eager fixes make the menu instant but cost time on every run; lazy computation delays only the click."],
    p: ["A fix computed against an older buffer version applies at shifted offsets and corrupts unrelated code.", "A generic suppress action is easier to pick than the real fix, so findings are silenced rather than resolved."],
    v: "Trigger a finding with a known fix, invoke the quick fix, and confirm the file changes exactly as the rule's documentation shows and that one undo restores the original text.",
    dep: ["fix-suggestions","text-edit-model","editor-diagnostics","suppression-comments"]
  },
  "command-line-driver": {
    s: "The executable that reads configuration, discovers files, runs the engine and writes results to the terminal and to files, forming the common entry point for scripts and CI.",
    d: "It parses arguments, loads layered configuration, builds the file and target list, invokes the engine with the selected rules, and renders results as text for people and structured logs for machines. It sets exit codes that tell a pipeline whether to proceed. It also exposes subcommands for listing rules, validating configuration and printing version information. Hard parts are predictable behavior across environments: the same invocation must give the same findings on a laptop and in CI, including when run from a different working directory.",
    k: ["One binary for every surface vs separate tools: a single driver keeps behavior identical, but accumulates flags and startup cost that editor use cannot afford.", "Fail on any finding vs fail on new findings only: strict failure is simple to explain, while new-only gating lets legacy code coexist with enforcement."],
    p: ["Behavior depends on the current directory, so the same command analyzes different files from a subfolder.", "Errors in the analyzer itself exit with the same code as findings, so a crashed run looks like a clean one or a bad change."],
    v: "Run the same command from two different working directories on a fixed checkout and confirm identical result files, then break a rule's configuration and confirm a distinct non-zero exit code for tool error.",
    dep: ["analysis-configuration","scope-and-path-filters","sarif-style-log","exit-codes-and-gates"]
  },
  "pre-commit-hook": {
    s: "A check run on staged changes before a commit is created, giving the fastest feedback outside the editor and blocking the worst mistakes locally.",
    d: "The hook asks version control for the staged file list, runs a restricted rule set on those files, and rejects the commit when blocking findings appear. To stay within a few seconds it analyzes only the changed files with cached facts and skips whole-program rules. It must analyze the staged content, not the working tree, since the two can differ. The difficulty is respect for developer time: a slow or flaky hook is bypassed with a flag, and then provides nothing.",
    k: ["Block the commit vs warn only: blocking guarantees nothing bad is committed from that machine, but pushes developers toward bypassing; warnings are ignored under deadline.", "Analyze staged content vs working tree: staged content is correct for the commit but needs extra plumbing; the working tree is simple and wrong when files are partly staged."],
    p: ["The hook analyzes unstaged edits, passes, and then a different version is committed.", "Installing the hook is manual and per clone, so coverage is uneven and the team assumes it is universal."],
    v: "Stage a file with a seeded violation while leaving a clean version unstaged in the working tree, run the commit, and confirm it is rejected with a message naming the staged line.",
    dep: ["diff-scoped-analysis","command-line-driver","rule-selection-profiles"]
  },
  "pull-request-annotations": {
    s: "Findings attached to the exact changed lines of a pull request, either as inline comments or as a check result, so review sees problems in context.",
    d: "A CI job analyzes the proposed change, compares results with the target branch, and posts only findings on added or modified lines or findings the change introduces. It maps each result location to the diff's line numbering, which differs from the file's, and updates or retires comments when new commits arrive. It reports a pass or fail status that merge rules can require. The hard problem is noise: repeated or already-known findings on every push train reviewers to ignore the bot.",
    k: ["Comment only on changed lines vs on the whole file: changed-lines-only keeps the review focused, but misses an old bug that the change makes reachable.", "Inline comments vs summary check: inline comments are read in context, but a large batch overwhelms the thread; a summary is quiet and gets less attention."],
    p: ["The same finding is re-posted after every push, creating duplicate threads that bury human review.", "Line mapping errors place a comment on the wrong line after the branch is rebased."],
    v: "Open a pull request that adds one known violation and edits one clean line; confirm exactly one comment on the violating line, none elsewhere, and that it resolves after the fix is pushed.",
    dep: ["diff-scoped-analysis","finding-fingerprints","baselines","sarif-style-log","result-locations"]
  },
  "trend-dashboard": {
    s: "A view of findings over time by team, rule and severity, used to see whether quality is improving and which rules or areas generate the most work.",
    d: "Result logs from each run are ingested into a store keyed by repository, commit and fingerprint. The dashboard derives open counts, introduction and fix rates, age of findings and rule noise measures such as the share dismissed as false. It joins ownership data so counts land on the people who can act. The hard part is metric honesty: counts move because rules change, scans widen or baselines reset, not only because code improved, so every chart needs the rule and scope version behind it.",
    k: ["Count all findings vs count only new ones: totals show the backlog but dwarf daily movement; new-only shows regressions but hides debt.", "Per-team targets vs repository-wide ones: team targets create ownership, but invite gaming such as bulk suppression."],
    p: ["A new rule pack is enabled and the chart shows a spike that is read as a quality collapse.", "Counts are used as performance targets, and developers suppress findings to meet them."],
    v: "Ingest two runs where one finding is fixed and one introduced, and confirm the dashboard shows one fixed and one new, with the same fingerprint carried across if code merely moved.",
    dep: ["finding-fingerprints","ownership-mapping","sarif-style-log","rule-metadata-catalog"]
  },
  "finding-deduplication": {
    s: "Collapses findings that describe the same underlying problem, arising from several paths, several rules or repeated runs, into one entry with all the evidence attached.",
    d: "Dedup groups results by rule, location and a normalized description of the cause, and keeps the best representative, such as the shortest trace. It works within a run, where one sink may be reached from many sources, and across runs and tools, where overlapping rules report the same defect. Merging requires a notion of same: too loose hides distinct bugs, too strict floods the list. The hard cases are findings that share a sink but need different fixes.",
    k: ["Group by sink vs by source: grouping by sink matches one fix point, but hides separate unsafe origins; by source shows every entry point and multiplies entries.", "Merge across rules vs keep each rule's finding: merging cuts noise, but loses per-rule metrics and suppressions tied to specific rules."],
    p: ["Two distinct bugs on one line merge, and fixing one closes both entries.", "Duplicate findings from overlapping rule packs are counted twice, inflating the backlog and the apparent defect rate."],
    v: "Seed one sink reachable from three sources and confirm one finding with three traces; seed two different rule violations on one line and confirm two separate findings remain.",
    dep: ["finding-fingerprints","code-flow-traces","result-locations"]
  },
  "finding-fingerprints": {
    s: "A stable identity for each finding that survives edits, moves and reformatting, so history, suppression and baselines attach to the same problem across runs.",
    d: "A fingerprint hashes the rule id, the file or logical unit, and normalized content such as the text of the flagged statement or its nearest named context, avoiding line numbers. When code is edited nearby the fingerprint stays; when the flagged logic changes, it changes and the finding counts as new. Some tools add a counter for identical lines. The hard problem is the trade between stability and sensitivity: too sensitive and every refactor resurrects old findings, too tolerant and a real change goes unseen.",
    k: ["Hash by content vs by location: content survives code motion but collides on identical lines; location is exact but breaks on any insertion above.", "Include enclosing function name vs omit it: including it separates repeated idioms, but renaming a function re-opens every finding inside it."],
    p: ["A formatter run changes whitespace, fingerprints shift, and the whole baseline reappears as new findings.", "Identical statements in one file collide, so fixing one is reported as the finding having moved."],
    v: "Insert fifty lines above a known finding and reformat the file; confirm the finding keeps its fingerprint. Then change the flagged expression and confirm the fingerprint changes.",
    dep: ["result-locations","rule-metadata-catalog"]
  },
  "severity-and-confidence": {
    s: "Two separate ratings on each finding: how bad the issue is if real, and how likely the tool is to be right, used to rank, filter and gate.",
    d: "Rules carry a default severity reflecting impact, and the engine may add a confidence from evidence such as how many assumptions the path required or whether a sanitizer was only possibly present. Teams map the pair to actions: block on high and likely, report on high and unlikely. Configuration can override both per rule or per path. Mixing them is the usual error: a severe, uncertain finding and a minor, certain one need opposite handling, and one scalar hides that.",
    k: ["Separate severity and confidence vs one score: two axes allow better routing, but need more explanation and more configuration than one number.", "Static rule severity vs context-adjusted severity: fixed values are predictable; adjusting by exposure or data sensitivity is more accurate and harder to audit."],
    p: ["Every rule ships as high severity, so ranking carries no information and developers sort by file name.", "Confidence values are not calibrated, so a label of high is wrong as often as medium."],
    v: "Sample fifty findings per confidence level and have an expert label them; confirm high-confidence findings are confirmed at a clearly higher rate than low-confidence ones.",
    dep: ["rule-metadata-catalog","path-sensitivity","rule-selection-profiles"]
  },
  "suppression-comments": {
    s: "Inline markers that tell the analyzer a specific finding on a specific line is accepted, with a reason, so it stops being reported without being deleted from history.",
    d: "A comment names a rule, may include a justification and an expiry, and applies to the next line or a bounded block. The engine matches suppressions against findings after analysis and records them as suppressed in the result log, with the reason, rather than dropping them. Policy can require a reason, forbid suppressing certain rules, and flag suppressions that match nothing. The hard parts are scope and drift: a suppression that covers more than intended hides new bugs, and one that outlives its code is clutter.",
    k: ["Inline comments vs a central file: inline is next to the code and reviewed with it, but spreads across files; central is auditable and detached from the code it describes.", "Require a reason vs allow bare suppressions: reasons make review meaningful, but invite boilerplate text that says nothing."],
    p: ["A block suppression is left open, and later code added inside it is never analyzed for that rule.", "Suppressions for removed code or fixed bugs stay forever, and the count of suppressions is no longer a useful measure."],
    v: "Add a suppression with a reason, confirm the finding is absent from the alert list but present in the result log as suppressed with that reason, then delete the flagged code and confirm an unused-suppression warning.",
    dep: ["result-locations","rule-metadata-catalog","ownership-mapping"]
  },
  "baselines": {
    s: "A snapshot of the findings that exist today, used so a team can adopt a rule on legacy code and be held only to not adding new violations.",
    d: "The baseline stores the fingerprints of accepted findings, taken at one commit. Later runs subtract matching fingerprints and report only the rest. Baselines can be per rule, per directory or per repository, and can be refreshed when debt is paid down. They are the practical way to introduce a strict rule without a month of cleanup. They are hard because they depend on fingerprint stability and because a baseline that is never shrunk becomes a permanent exemption.",
    k: ["Baseline all existing findings vs only existing in untouched files: all is simplest and loosest; the narrower form pushes cleanup onto any file a developer touches.", "Store the baseline in the repository vs in the service: in the repository it is reviewed and versioned, but merge conflicts occur; in the service it is easy to reset without anyone noticing."],
    p: ["Fingerprint drift after a tool upgrade makes old findings look new and blocks every pull request.", "The baseline is regenerated to make a failing build pass, silently accepting the new problems."],
    v: "Create a baseline, add one new violation, and confirm only the new one is reported; then upgrade the engine version on the same code and confirm no baselined finding reappears.",
    dep: ["finding-fingerprints","sarif-style-log","rule-versioning"]
  },
  "false-positive-feedback": {
    s: "A path for developers to mark a finding as wrong, with a reason, which feeds rule maintenance and sometimes analysis tuning rather than only hiding that one finding.",
    d: "Dismissals are captured at the surface where the finding appears, with a category such as not reachable, sanitized elsewhere, or test code. They are aggregated per rule to produce a measured false-positive rate and queued for rule owners. Some systems learn per-project hints from them. The difficulty is signal quality: a dismissal may mean wrong, not worth fixing, or too busy, and treating all as false positives teaches the wrong lessons and lets bad rules look good.",
    k: ["Structured reason categories vs free text: categories can be counted and routed automatically but force a fit; free text is richer and unusable at scale.", "Feed dismissals into automatic suppression vs only to humans: automation reduces repeats quickly but can silence true bugs; humans are slower and safer."],
    p: ["Dismissals as noise and as false-positive claims are counted together, so a useful rule appears broken.", "Feedback goes to a queue nobody owns, and developers learn that reporting changes nothing."],
    v: "Dismiss three findings of one rule as false and confirm the rule's dashboard shows three, with reasons, and that the rule owner is notified once a threshold is crossed.",
    dep: ["suppression-comments","rule-metadata-catalog","ownership-mapping","finding-fingerprints"]
  },
  "sarif-style-log": {
    s: "A versioned, tool-neutral JSON schema for runs, rules and results, so any analyzer can write findings and any viewer, gate or dashboard can read them.",
    d: "A log holds one or more runs, each naming the tool and its rules and listing results with a rule id, level, message, locations, optional traces and fingerprints. Artifacts are listed once and referenced by index. Extensible property bags carry tool-specific data without breaking readers. Producers must emit valid logs even for failed runs, recording tool notifications beside findings. The hard parts are fidelity and size: logs for large repositories reach hundreds of megabytes, and every consumer reads the optional fields differently.",
    k: ["Strict schema validation vs lenient readers: strict validation catches producer bugs early, but one malformed field can discard a whole run.", "One large log vs many shards: one file is simple to archive; shards stream and parallelize but need a defined merge."],
    p: ["Two tools populate optional fields differently, so a viewer shows missing locations or traces for one of them.", "A crashed run writes no log at all, which downstream systems read as zero findings."],
    v: "Validate the output of a run against the published schema, load it in a second independent viewer, and confirm the result count and first location match the tool's own report.",
    dep: ["result-locations","code-flow-traces","rule-metadata-catalog","finding-fingerprints"]
  },
  "result-locations": {
    s: "The representation of where a finding is: file, region, and logical context, expressed so it can be mapped to editors, diffs and later versions of the file.",
    d: "A location carries a file identifier relative to a repository root, a region given as line and column or as character offsets, and optional logical names such as function or class. Columns and offsets depend on encoding and on how tabs and line endings are counted, so the model states its convention. Locations may have related locations that give context. The hard part is agreement: if the analyzer, the editor and the diff viewer count columns differently, annotations land on the wrong text.",
    k: ["Line and column vs byte or character offsets: line and column read well to humans but vary with tab and encoding handling; offsets are exact and meaningless without the file.", "Relative to the repository root vs absolute paths: relative paths make logs portable between machines but need a base to resolve them."],
    p: ["Windows and Unix line endings produce different line counts, so a stored location points one line off after checkout on another system.", "Absolute build-machine paths in logs make results unmatchable on any other machine."],
    v: "Produce a finding on a file containing tabs, non-ASCII characters and mixed line endings, and confirm the editor highlights exactly the flagged expression in each case.",
    dep: ["source-snapshot-access"]
  },
  "code-flow-traces": {
    s: "A step-by-step path through the code that shows how a finding arises, from the source or first cause to the point of failure, with a note at each step.",
    d: "A trace is an ordered list of locations with messages, optionally grouped into threads or nested to show calls and returns. The engine builds it from the path or taint propagation it used, trimming loops and uninteresting steps. Viewers present it as an expandable path in the code. A good trace is what makes a finding believable in a few seconds. It is hard because the engine's internal reasoning does not always correspond to a path a human can follow, especially after summaries abstract many steps into one.",
    k: ["Full path vs summarized path: full paths are verifiable but long; summaries are readable but hide steps where the explanation may be wrong.", "Shortest path vs most informative: shortest is cheap to compute, but the longer path through the sanitizer-looking code is often the one a developer needs."],
    p: ["A trace passes through summarized callees with no visible steps, so the reader cannot check why the data survived.", "A trace shows a path that the real program cannot take, because path conditions were dropped."],
    v: "Pick a taint finding crossing three function calls and confirm the trace lists a step in each function, in order, with each step's location opening the correct line.",
    dep: ["flow-path-reconstruction","result-locations","procedure-summaries"]
  },
  "rule-metadata-catalog": {
    s: "The table of every rule the tool can report: id, short and full description, default severity, tags, help text and references, shipped with results so viewers can explain a finding.",
    d: "Each rule has a stable id, a name, a rationale, examples of bad and good code, links to standards, default level and tags such as security or style. Results refer to rules by id, and the log includes the metadata of the rules used. Documentation is generated from the same source so it cannot drift. Ids must never be reused for a different meaning. The hard part is stability: renaming or splitting a rule invalidates suppressions, baselines and dashboards that refer to the old id.",
    k: ["Stable opaque ids vs descriptive names: opaque ids survive renames; descriptive names are readable but become lies when a rule changes.", "Generate docs from metadata vs hand-written pages: generation stays in sync, but the text is constrained by the schema."],
    p: ["A rule is split in two and the old id is reused, so suppressions silently apply to a different check.", "Help text describes how to fix the issue in a language the user is not using."],
    v: "List all rule ids in a result log and confirm each resolves to a catalog entry with a description and example, and that a deprecated id still resolves to a pointer to its replacement.",
    dep: []
  },
  "result-merging": {
    s: "Combines result logs from several tools, shards or runs into one consistent set, resolving overlap, differing rule ids and different location conventions.",
    d: "Monorepo shards and multi-tool pipelines each emit logs, and a merge step concatenates runs, remaps artifact indexes, normalizes paths and removes duplicates using fingerprints. It maintains a mapping from other tools' rule ids to canonical ones when they report the same class of issue. It also merges tool notifications so a failed shard is visible in the combined result. The hard parts are provenance and correctness: a merged log must still say which tool produced what, and a missing shard must not be mistaken for a clean one.",
    k: ["Keep each tool's runs separate vs flatten into one: separate runs preserve provenance and per-tool metrics; flattening is simpler for viewers and loses origin.", "Rule id mapping table vs treating ids as distinct: mapping reduces duplicates but must be maintained; distinct ids are always right and noisy."],
    p: ["One shard fails and the merged log is published as complete, so the gate passes on partial results.", "Path normalization differs between shards, so identical files appear under two names and every finding is reported twice."],
    v: "Merge logs from three shards where one has a recorded failure, and confirm the combined log has all findings, no duplicates and a visible failure notification that makes the gate fail.",
    dep: ["sarif-style-log","finding-fingerprints","monorepo-sharding","finding-deduplication"]
  },
  "exit-codes-and-gates": {
    s: "The policy that turns results into a pass or fail signal for a pipeline: which severities, rules and finding ages block a merge or release, and what the process returns.",
    d: "A gate evaluates the filtered result set against thresholds, such as no new high-severity findings, and maps the outcome to a process exit code and a check status. It distinguishes findings from tool failure, so an analysis crash is never reported as pass. Gates can differ by branch, so release branches are stricter than feature branches. They are hard because they are policy, not mechanics: thresholds that block too often are bypassed, and thresholds that never block are decoration.",
    k: ["Block on new findings only vs on all findings: new-only is adoptable on old code; all findings enforces cleanup but blocks unrelated work.", "Fail closed vs fail open on tool errors: fail-closed never ships unanalyzed code and blocks on infrastructure problems; fail-open keeps flow and hides outages."],
    p: ["A tool timeout exits with the same code as a clean run, and unanalyzed code is merged.", "A gate is relaxed during a deadline and never tightened again."],
    v: "Run the gate against a result log with a new blocking finding, with only baselined findings, and with a recorded tool failure; confirm fail, pass, and fail with a distinct error code, respectively.",
    dep: ["severity-and-confidence","baselines","rule-selection-profiles"]
  },
  "soundness-versus-precision": {
    s: "The foundational tradeoff: a sound analysis never misses a real bug of its class but reports false alarms, a precise one reports few false alarms but may miss bugs.",
    d: "Every design choice moves along this axis: how loops are approximated, whether unknown calls are assumed harmless, how pointers are merged, whether dynamic features are modeled. Fully sound analysis of real programs is either unaffordable or drowned in false alarms, so practical tools choose where to be unsound and say so. Choices are made per rule class: memory safety proofs lean sound, style checks lean precise. The hard part is that the choice is invisible in results unless the tool documents its assumptions.",
    k: ["Sound with alarms vs precise with misses: soundness supports claims of absence and costs reviewer time; precision keeps trust and cannot certify anything.", "Global setting vs per-rule choice: a global choice is easy to explain, but per-rule choice matches the cost of a miss to the rule's importance."],
    p: ["A clean report is read as proof of no bugs, when the analysis ignored reflection, assembly or generated code.", "Soundness assumptions are undocumented, so users cannot tell what a clean result actually excludes."],
    v: "Run the tool on a suite of programs with known seeded bugs and record misses and false alarms by category, then confirm the documented assumptions explain each miss.",
    dep: []
  },
  "false-positive-budget": {
    s: "The rate of wrong findings a team will tolerate before it stops reading results, treated as a hard design constraint that bounds which rules and analyses can ship.",
    d: "Adoption studies and experience suggest developers abandon a tool when a large share of what it shows is wrong, so each rule is judged on its measured precision and cost per true finding, not only recall. Budgets drive choices such as shipping a rule only in a high-confidence mode, or at advisory level. They are enforced by measuring rule precision on real code, tracking dismissals, and retiring rules that exceed the budget. It is hard because precision measured on a benchmark differs from precision on the team's own code.",
    k: ["Measure precision per rule vs per tool: per-rule data lets bad rules be fixed or removed; a tool-wide figure hides them in an average.", "Ship noisy rules as advisory vs not at all: advisory shows value to eager users but trains others to skim; withholding is safe and slows detection."],
    p: ["A new high-recall rule is enabled for everyone and the first week's noise teaches developers to ignore the tool.", "Precision is estimated from the rule author's chosen examples, which flatter the rule."],
    v: "Sample a fixed number of findings per rule from a recent real-code run, have two reviewers classify them independently, and confirm every enabled rule meets the stated precision threshold.",
    dep: ["false-positive-feedback","severity-and-confidence","rule-testing-corpus"]
  },
  "scalability-and-cost": {
    s: "The budget of time and memory a run may use, set by where it executes and how often, which determines what analyses are affordable at all.",
    d: "Editor runs have milliseconds, pull requests minutes, nightly scans hours. Cost grows with code size, and some analyses grow worse than linearly with context depth or pointer precision. The architecture answers with incremental reuse, summaries, parallelism, scoping and fallbacks to cheaper analysis when a budget is exceeded. Cost must be tracked per rule and per phase so regressions are noticed. The hard part is that a few pathological functions or libraries can dominate the total, and their cost depends on code shape, not size.",
    k: ["Fixed budget with degraded precision vs unbounded run: a fixed budget gives predictable pipelines, but results vary with code shape; unbounded runs are exact and sometimes never finish.", "Pay for depth everywhere vs adaptively: uniform depth is simple; adaptive spends effort where findings are likely and complicates reproducibility."],
    p: ["One generated file with a huge function consumes the whole timeout, so the entire repository gets no results.", "Cost grows quietly release over release until the run no longer fits in the pipeline."],
    v: "Record wall time and peak memory per phase on a fixed reference repository for each release and confirm they stay within the stated budget, with a hot-spot report naming the slowest functions.",
    dep: ["resource-budgets","incremental-solver","parallel-scheduler"]
  },
  "language-semantics-coverage": {
    s: "How much of the language and its runtime the analysis models: dynamic features, concurrency, foreign calls, generated code and the standard library.",
    d: "Every unmodeled feature is a gap: reflection, dynamic code loading, inline assembly, macros that generate code, threads, callbacks registered through frameworks, and calls into native libraries. The tool either models each feature, approximates it, or ignores it and records the assumption. Framework-heavy code needs models of how the framework invokes user code, or entry points are missed. The hard part is knowing what is missing: gaps produce silent misses rather than errors.",
    k: ["Model a feature precisely vs approximate conservatively: precise models find more but cost effort per feature; conservative ones are cheap and raise false alarms.", "Hand-written framework models vs inferring them: hand-written are accurate and need upkeep with each framework version; inference is automatic and brittle."],
    p: ["Code reached only through a framework callback is never analyzed because no entry point reaches it.", "A language upgrade adds syntax the frontend parses but the analysis treats as no-op."],
    v: "Write test programs exercising each listed feature with a seeded bug behind it, and confirm each is either found or reported in the tool's documented list of unmodeled constructs.",
    dep: ["library-models","multi-language-frontend","call-graph-construction"]
  },
  "determinism-and-reproducibility": {
    s: "The property that the same code, configuration and tool version always produce the same findings in the same order, regardless of machine, thread count or timing.",
    d: "Gates, baselines and fingerprints all assume results repeat. Nondeterminism creeps in through parallel scheduling order, hash-map iteration, time-based budgets that cut analysis at different points, and differences in file discovery order. The engine fixes iteration orders, makes budgets count work rather than wall time, and sorts output. Results record tool version, rule versions and configuration hash. It is hard because performance work, especially parallelism, tends to trade determinism away.",
    k: ["Work-count budgets vs wall-clock timeouts: counting work is reproducible but varies by hardware speed in practice; wall-clock limits are simple and make results machine-dependent.", "Sorted canonical output vs completion order: canonical output is diffable; completion order is cheaper and makes logs differ between runs."],
    p: ["A finding appears on some CI runs and not others, so developers rerun until it passes.", "Output ordering differs between operating systems and every comparison between runs shows noise."],
    v: "Run the same commit and configuration ten times on different machines and thread counts, and confirm byte-identical result logs apart from recorded timestamps.",
    dep: ["parallel-scheduler","resource-budgets","analysis-configuration"]
  },
  "analyzing-untrusted-code": {
    s: "Treating the code under analysis as hostile input to the analyzer: parsing and processing it must not execute it, exhaust the machine or leak data.",
    d: "Analysis parses arbitrary files, may invoke the build to learn compiler flags, and loads dependencies. Each step can be abused: build scripts execute code, crafted inputs trigger parser crashes or exponential behavior, and symlinks escape the checkout. The analyzer runs in a sandbox with limited filesystem and network access, enforces size and depth limits, and avoids running project code. Plugins and rule packs from outside are a second trust boundary. It is hard because learning real build settings usually means running the build.",
    k: ["Run the real build to capture flags vs reconstruct from build files: running is accurate and executes project code; reconstruction is safe and may disagree with reality.", "Sandbox per run vs shared worker: per-run isolation contains damage and costs startup time; shared workers are fast and carry state between projects."],
    p: ["A pull request from a fork changes a build script that runs in the analysis job with access to secrets.", "A crafted deeply nested file makes the parser run out of stack and takes down the shared analysis service."],
    v: "Feed the analyzer a corpus of malformed, oversized and deeply nested files and symlink loops inside a sandbox, and confirm bounded time and memory, no escape, and an error result instead of a crash.",
    dep: ["resource-budgets","build-command-capture","plugin-loader","source-snapshot-access"]
  },
});
