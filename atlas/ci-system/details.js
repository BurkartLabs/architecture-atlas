// Details for the continuous integration plate, part 1: integrations, visibility, pipeline definition.
ATLAS.details("ci-system", {
  "webhook-receiver": {
    s: "The endpoint that accepts change events from the code host, authenticates them, records them durably and acknowledges quickly so the sender does not time out or retry.",
    d: "The code host posts a signed HTTP request for every push, review update, comment and tag. The receiver checks the signature against a shared secret, extracts a delivery id, writes the raw payload to a queue or table and returns success within a few seconds. Parsing and run creation happen afterward, off the request path. The difficulty is the delivery contract: events can arrive twice, out of order, or not at all during an outage, so the receiver must deduplicate and the system needs a way to resynchronize.",
    k: ["Acknowledge first, process later: the sender never times out and bursts are absorbed by a queue, at the cost of failures surfacing asynchronously with no response to carry them.", "Trust the event body versus refetch current state from the host: refetching avoids acting on stale or reordered data but spends API quota and adds a dependency."],
    p: ["Verifying the signature against a parsed and re-serialized body instead of the raw bytes rejects valid events or accepts forged ones.", "Without delivery-id deduplication, a sender retry after a slow response starts the same pipeline twice."],
    v: "Replay one captured delivery twice and confirm exactly one run is created, then send one with a wrong signature and confirm it is rejected with no run and an audit entry.",
    dep: ["event-bus", "metadata-database"]
  },
  "commit-status-reporting": {
    s: "Posts the state of each job or pipeline against the exact revision under review, so the review page shows pending, passing or failing without anyone opening the CI system.",
    d: "As jobs change state the system calls the code host's status interface with the revision id, a stable context name, a state, a short description and a link back to the run. Each context name is what branch rules later require. The reporter must handle rate limits, retries and ordering so a late pending update does not overwrite a final result. It is hard because the status is keyed by revision and name: renaming a job orphans the old required context, and pending statuses can stay forever after a crash.",
    k: ["One status per job versus one rolled-up status per pipeline: per-job gives precise blocking and detail but floods the page and ties rules to job names; rollup is stable but hides which part failed.", "Report on state change versus poll and reconcile: events are timely, while reconciliation repairs updates lost to errors and costs periodic API calls."],
    p: ["A renamed job leaves the old required status pending forever and the change can never merge.", "Reporting against a branch name instead of the revision attaches results to a commit that has since moved."],
    v: "Push a commit with one failing job and confirm the review page shows that context failing with a working link, then push a fix and confirm the new revision shows success while the old one keeps its failure.",
    dep: ["forge-app-identity", "run-state-machine"]
  },
  "check-annotations": {
    s: "Attaches structured findings, such as a lint error or failed assertion, to specific files and lines on the review page, so feedback appears where the code is.",
    d: "Jobs emit results in a defined format, or a parser extracts them from tool output. The reporter converts each into an annotation with a path, line range, severity and message, and submits them in batches to the host's checks interface, which usually limits count per request and per run. Annotations are tied to a revision and replaced on the next run. The hard parts are mapping tool paths from the build container to repository-relative paths, deduplicating repeated findings, and staying under the per-run limit without hiding the important ones.",
    k: ["Annotating only changed lines versus all findings: changed-line filtering keeps noise down and focuses authors on their own work, but hides existing problems the change interacts with.", "Parsing free-form logs versus requiring a structured report: parsing works with any tool but is brittle, while structured output is exact but needs each tool configured."],
    p: ["Paths relative to the container's build directory fail to match files in the repository, so annotations silently attach nowhere.", "Hundreds of low-severity annotations hit the per-run cap and crowd out the one error that blocks merge."],
    v: "Introduce a known lint violation on line 40 of a changed file and confirm exactly one annotation appears on that file and line in the review page, with the correct severity.",
    dep: ["commit-status-reporting", "test-result-ingestion"]
  },
  "merge-gates": {
    s: "The rules that make selected CI results mandatory before a change can merge: required checks, required freshness against the target branch and who may override.",
    d: "The code host holds branch protection that lists required contexts, whether the branch must be current with its target, and who can bypass. CI supplies the results; the host enforces them at merge time. Some teams add a gate service that evaluates richer conditions, such as required results from specific paths. What makes it hard is aligning names and conditions: a path-filtered job that never runs leaves a required check forever pending, and a stale approval after new pushes can let untested code through.",
    k: ["Require the branch to be up to date versus allow stale merges: up-to-date guarantees tested combinations but forces rebases and repeated runs; stale merges are faster but can break the target branch.", "Gate on a fixed list of named checks versus a single aggregate check: a list is explicit but needs rule edits for every new job; an aggregate adapts automatically but is one more thing to keep correct."],
    p: ["A required job skipped by a path filter never reports, so the gate waits forever or, if misconfigured, treats absence as success.", "Administrator bypass used routinely turns the gate into a suggestion."],
    v: "On a protected branch, open a change with a failing required check and confirm the merge button is blocked with the failing context named, then confirm it unblocks only after a passing run on the latest revision.",
    dep: ["commit-status-reporting", "access-control"]
  },
  "review-comment-bot": {
    s: "A service identity that posts summaries into review threads: coverage deltas, benchmark changes, preview links and instructions to rerun, so authors do not need to open the CI interface.",
    d: "After a run, a job or the control plane composes a short message and posts it as a comment through the code host's interface, usually updating one existing comment rather than adding new ones. The body links to logs, reports and any deployed preview. It acts under the integration's own identity with minimal rights. The challenge is restraint and safety: comments are public to everyone on the repository, so they must never contain secrets or private data, and noisy bots train people to ignore them.",
    k: ["Edit a single sticky comment versus post per run: editing keeps threads clean, but loses history and does not notify; new comments notify but bury the discussion.", "Comment from the job versus from a trusted control plane process: job-side is simple but gives untrusted code a write token, while control-plane posting needs a result handoff and more machinery."],
    p: ["Echoing build output into a comment can publish a secret that log masking missed.", "Posting from a job triggered by a fork with a write token lets the fork author spam or impersonate."],
    v: "Push three commits to one change and confirm the review page still has a single bot comment, updated each time with the latest revision's summary and working links.",
    dep: ["forge-app-identity", "job-token-permissions"]
  },
  "forge-app-identity": {
    s: "The credentials and permissions CI uses to talk to the code host: installable app tokens with narrow scopes, instead of a human's personal token shared by every pipeline.",
    d: "The CI system registers as an application with a declared permission set, such as read contents, write statuses and write comments. For each installation it exchanges a signing key for short-lived tokens, optionally restricted to one repository. Tokens are cached until near expiry and refreshed. The difficulty is blast radius and rotation: the signing key is a high-value secret, repository access must follow team changes, and a token given to a job must be narrower than the one the control plane holds.",
    k: ["App installation tokens versus a service user's long-lived token: app tokens are scoped, auditable and short-lived, but need key management and token minting; a service user is simple and a standing liability.", "One broad app versus one app per capability: separate apps limit damage when one is compromised, but multiply setup and permission reviews."],
    p: ["A personal token of a departed employee used by pipelines stops them all on the day the account is disabled.", "Handing the control plane's full-scope token to jobs lets any job rewrite other repositories."],
    v: "List the app's installations and permissions, mint a token for one repository, and confirm a write to a different repository is rejected while a status write to the target succeeds.",
    dep: ["secret-store", "access-control"]
  },
  "pipeline-dashboard": {
    s: "The overview page of current and recent runs per repository and branch, showing state, duration and who triggered them, with links into each job.",
    d: "It reads run and job metadata from the control plane's API, usually with live updates over a long-lived connection or polling, and renders a list or board. Filters narrow by branch, author, status and time. The page is the first place people go when a change is red, so it must load fast on repositories with a million past runs: pagination, indexed queries and precomputed summaries matter more than visual polish. Permissions apply per row, since private repositories must not leak run existence.",
    k: ["Push updates versus periodic polling: push shows state changes immediately but requires connection fan-out and reconnect handling; polling is simpler and cheaper for rarely watched pages.", "Query the primary store directly versus a denormalized read model: direct is always correct but slows with history; a read model is fast and can lag or drift."],
    p: ["Unbounded history queries without an index make the page time out for the busiest repositories first.", "A dashboard that shows stale running state after the control plane lost a job misleads people into waiting."],
    v: "Trigger a run on a repository with a large history and confirm it appears in the list within seconds, updates state live through completion, and the page loads under a second with the history present.",
    dep: ["control-plane-api", "access-control"]
  },
  "run-graph-view": {
    s: "A visual graph of a run's jobs and dependencies with per-job state and timing, showing what ran in parallel, what waited and what was skipped.",
    d: "The view draws the resolved dependency graph for one run, coloring each node by state and showing queue time, run time and retries. It lets people click through to logs and see the critical path, the chain of jobs that determined total duration. The data comes from the same job records the scheduler uses. It is hard to make legible at scale: a matrix expansion can produce hundreds of nodes, so grouping, collapsing and showing skipped jobs with the reason they were skipped matter.",
    k: ["Show the planned graph versus the executed one: planned shows what should happen and exposes skipped jobs, while executed shows only what ran and is simpler to compute.", "Group matrix jobs into one node versus show every expansion: grouping stays readable, but a single failing cell is harder to find without drilling in."],
    p: ["Hiding jobs skipped by rules leaves people unable to tell whether a missing result means pass or never ran.", "Critical path computed from end times alone ignores queue wait and blames the wrong job."],
    v: "Open a run with a three-stage dependency and a ten-cell matrix and confirm the graph shows correct edges, queue versus run time per node, a highlighted critical path, and a reason on each skipped job.",
    dep: ["stages-and-dependency-graph", "run-state-machine"]
  },
  "run-history-search": {
    s: "Searches past runs and jobs by branch, author, status, duration, job name or log text, to answer questions such as when a test first started failing.",
    d: "Run and job metadata is indexed in the database or a search engine, with fields for repository, revision, trigger, result and timing. Log search requires indexing or scanning stored logs, which is far larger. Common questions are bisection-like: find the first failing run of a job, or every run where a message appeared. The difficulty is volume and retention: logs are expensive to index, and results shown must respect both access rules and the retention horizon after which evidence is gone.",
    k: ["Index log text versus search metadata only: text search finds root causes across runs, at storage and indexing cost far above the metadata; metadata-only is cheap and answers fewer questions.", "Keep full history versus aggregate old runs: full history supports forensics but grows without bound; aggregation bounds cost and loses detail."],
    p: ["Searching only retained logs makes a regression older than the retention window look like it never happened.", "A search index that ignores repository permissions exposes private job output."],
    v: "Search for an exact error string known to have appeared in a log last week and confirm the matching runs are returned with the job and line, and that a user without repository access sees none of them.",
    dep: ["metadata-database", "log-storage", "access-control"]
  },
  "trend-analytics": {
    s: "Aggregates run data over time into duration percentiles, queue wait, failure and flake rates, and capacity use, so teams see slowdowns and regressions before they hurt.",
    d: "A batch or streaming job rolls up job events into time series by repository, job name, branch and runner pool. Typical views are median and tail duration, time waiting in queue, pass rate, retry rate and cost. Teams use them to pick what to optimize and to detect that the pipeline itself got slower. The challenge is attribution: a duration change may come from the code, the cache hit rate, the runner type or queue contention, so dimensions must be recorded with each sample.",
    k: ["Track percentiles versus averages: percentiles show the tail developers actually feel but need more storage and care; averages are cheap and hide the long waits.", "Compute on demand versus precompute rollups: on demand allows any question but is slow at scale; rollups are fast and fix the questions in advance."],
    p: ["Mixing queue wait and run time in one duration number makes a capacity problem look like a slow test.", "Excluding cancelled and timed-out jobs from failure rate hides the worst failures."],
    v: "Inject a one-minute delay into one job, run it ten times, and confirm the dashboard shows that job's median rising by about a minute with queue wait unchanged.",
    dep: ["metadata-database", "event-bus"]
  },
  "chat-and-email-notifications": {
    s: "Sends alerts about results that need a person: broken default branches, failed scheduled runs and repeatedly failing jobs, to the right channel or owner.",
    d: "Subscribers register rules, such as notify the author of a failed run on the default branch or notify a team channel when a nightly run fails. The notifier listens for run completion events, applies the rules, and posts to a messaging channel or mail system with a link and a one-line cause. Most of the work is deciding who must know. Too many alerts are muted, and the signal that matters, a broken main branch, is lost; duplicate alerts for one root cause make it worse.",
    k: ["Notify on every failure versus on state transitions: every failure is complete but noisy; transitions from passing to failing and back are quiet but miss failures that never recovered.", "Notify the author versus a team channel: authors act fastest on their own change, while shared failures on the default branch need a visible owner."],
    p: ["A flaky job notifying on every failure trains people to ignore the channel before a real break arrives.", "Alerts without the failing job and first error line force a click-through to learn if it matters."],
    v: "Break the default branch deliberately and confirm one message reaches the channel with the failing job and first error, and that the next failure of the same job does not repeat it until it recovers.",
    dep: ["event-bus", "run-state-machine"]
  },
  "badges-and-embeds": {
    s: "Small status images and embeddable widgets that show the latest result of a branch or job, for readme files, status screens and external pages.",
    d: "A public or token-protected URL returns an image generated from the most recent finished run of a given repository and branch, usually as a vector graphic with caching headers. Embeds show a miniature run list or a coverage figure. They depend on a cheap read path, since they are fetched by every viewer of the page they sit on. The difficulty is privacy and caching: a badge for a private repository must not leak its state, and aggressive proxy caching shows a failed branch as green for hours.",
    k: ["Public badges versus authenticated: public is easy to embed and reveals build state of the repository; authenticated protects it but cannot be shown on unauthenticated pages.", "Long cache lifetime versus short: long reduces load on the control plane but shows stale results; short is accurate and puts a read-heavy path on the API."],
    p: ["Badges derived from the latest run of any trigger show a pull request's failure as the default branch's status.", "Caching proxies serving a badge for hours after the build breaks give false confidence."],
    v: "Fail a build on the default branch and confirm the badge URL, fetched fresh, switches to failing within the documented cache lifetime, while the badge of a private repository returns nothing without a token.",
    dep: ["control-plane-api", "access-control"]
  },
  "cli-and-public-api": {
    s: "The programmatic surface for people and automation: trigger runs, fetch status, download artifacts and logs, and manage settings from a terminal or script.",
    d: "A versioned HTTP API exposes runs, jobs, artifacts, variables and runners, with token authentication and scoped permissions, and a command-line client wraps it. Scripts use it to trigger deployments, wait for results, and fetch artifacts. Because other systems build on it, compatibility matters: fields cannot disappear without notice. It is hard because it is the way to bypass the interface's guardrails, so rate limits, scopes and audit entries must apply equally to every caller.",
    k: ["Stable versioned API versus evolve freely: versioning lets integrations survive upgrades but means maintaining old behavior; free evolution is faster and breaks scripts.", "Long-lived personal tokens versus short-lived scoped ones: long-lived are convenient for scripts and a risk when leaked; short-lived tokens need an exchange step but limit exposure."],
    p: ["A script polling a run status in a tight loop exhausts rate limits shared by other users of the token.", "Tokens with full rights embedded in scripts and shared in logs become de facto admin credentials."],
    v: "Using a token with only read scope, fetch a run's status and download an artifact, then attempt to trigger a run and confirm it is refused with a permission error that is also recorded in the audit log.",
    dep: ["control-plane-api", "access-control", "audit-log"]
  },
  "pipeline-as-code": {
    s: "The declarative file in the repository that states which jobs run, in what order, on what environment and under what conditions, versioned with the code it builds.",
    d: "A file, typically in a human-readable data format, lists stages, jobs, scripts, images, dependencies and rules. The system reads the version from the revision being built, so a branch can change its own pipeline and old revisions rebuild with their original definition. The file is parsed, validated and expanded into a job graph before anything runs. The hard part is power: the more it can express, the more it resembles a program, with all the testing, reuse and security problems that implies, including a pull request being able to alter how it is tested.",
    k: ["Definition in the repository versus configured in the CI interface: in-repo is reviewable, versioned and reproducible, but lets a change alter its own checks; interface settings are centrally controlled and drift away from code.", "Declarative data versus a general programming language: data is analyzable and safe to validate, while code expresses complex logic and is harder to reason about."],
    p: ["A pull request that edits the pipeline to skip tests passes its own checks unless the trusted definition is used for gating.", "Deep logic in the configuration format grows into an untestable pseudo-language."],
    v: "Change a job's script in a branch, push, and confirm that run uses the new script while a rerun of an older revision still executes its original definition.",
    dep: ["config-validation", "object-store"]
  },
  "config-validation": {
    s: "Checks a pipeline definition for syntax, schema and semantic errors before any job starts, and reports them where the author sees them.",
    d: "On each event the system fetches the file, expands includes, validates against a schema, and checks semantics: referenced jobs and stages exist, there are no dependency cycles, variables resolve, and rules are well formed. It produces either a plan or a located error, ideally posted as a status on the revision so mistakes do not become silent failed runs. A dry-run or lint endpoint lets editors check ahead of pushing. The hard part is validating values that only exist at runtime, such as variables from protected settings or conditions on dynamic data.",
    k: ["Fail the whole pipeline on any error versus run the valid parts: failing is predictable and safe; partial runs give feedback sooner and can mask a broken job as absent.", "Static validation only versus validate by simulating the run: static is fast and cannot see runtime values, while simulation catches more at the cost of complexity and drift."],
    p: ["A syntax error produces a run with no jobs and no failure, which reads as green.", "Validation that expands remote includes at check time can differ from what the run later resolves."],
    v: "Introduce a dependency cycle and an unknown job reference in a pipeline file and confirm the run is rejected before queuing, with a status on the revision naming both problems and their line numbers.",
    dep: ["pipeline-as-code", "stages-and-dependency-graph"]
  },
  "stages-and-dependency-graph": {
    s: "The model of which jobs must finish before others start: coarse ordered stages, explicit job needs, or both, resolved into a directed acyclic graph.",
    d: "Stages give a simple sequence: all jobs in one stage finish before the next begins. Explicit dependencies let a job start as soon as the specific jobs it needs complete, giving better parallelism. The resolver builds a graph, rejects cycles, and computes which jobs are ready. Outputs may flow along edges as artifacts. What makes this hard is behavior when a node fails or is skipped: whether downstream jobs run, are skipped or are cancelled, and how a conditional job affects those that depend on it.",
    k: ["Stages versus explicit dependencies: stages are easy to read and cause idle waiting on the slowest job; explicit edges maximize parallelism and demand careful thought about every edge.", "Fail-fast versus run-independent-branches-to-completion: fail-fast frees capacity sooner and shows less information; running on gives full results from one run."],
    p: ["A dependency on a job skipped by a rule leaves the downstream job waiting forever or running without its input.", "Using stages to guard ordering that really depends on artifacts hides missing edges until the pipeline is reshaped."],
    v: "Define jobs A, B needing A, and C independent, fail A, and confirm B is marked skipped with a reason, C completes, and the run's final state is failed.",
    dep: ["pipeline-as-code"]
  },
  "variables-and-parameters": {
    s: "Named values that flow into jobs from the pipeline file, repository or group settings, the trigger and the system itself, with a defined order of precedence.",
    d: "Variables come from several scopes: predefined ones such as revision and branch, values in the file, project and organization settings, and values supplied at manual or API trigger time as parameters. When names collide, a documented precedence decides. They are injected into the job environment and into expressions that drive rules. It is tricky because some values are secret, some are protected to certain branches, and expansion order matters: a variable referencing another can be resolved by the control plane or by the shell, with different results.",
    k: ["Expand in the control plane versus in the job's shell: control-plane expansion works in rules and is predictable, while shell expansion is flexible and behaves differently across shells.", "Allow overrides at trigger time versus fix values in the file: overrides support one-off runs and parameterized releases; fixed values keep runs reproducible."],
    p: ["A user-supplied trigger variable overriding a protected one lets an unprivileged person change deployment behavior.", "A variable that is unset silently expands to empty and turns a path into the root directory."],
    v: "Define the same variable at project and job scope with different values, run a job that prints it, and confirm the job-scope value wins; then trigger with an override and confirm the documented precedence.",
    dep: ["pipeline-as-code", "secret-scoping"]
  },
  "conditional-rules": {
    s: "Expressions that decide whether a job is created, runs automatically, waits for a human or is skipped, based on branch, event type, changed paths and variables.",
    d: "Each job carries rules evaluated against the event context when the run is planned. Outcomes include always, never, on success of earlier jobs, manual, or delayed. Rules can also set variables and allowed failure for that case. Evaluating them at plan time decides the graph shape, so a mistake changes what is tested. It is hard because rules multiply: combinations of branch, source and path conditions become unreadable, and a job that does not exist is easy to mistake for a job that passed.",
    k: ["Rules at plan time versus conditions checked inside the job's script: plan-time rules save runner time and show intent in the graph; in-script checks are flexible and consume a runner just to exit.", "First-match-wins versus all-match rules: first-match is predictable and order-sensitive; all-match is composable but surprising when two rules disagree."],
    p: ["Overlapping rules skip the test job on exactly the branch that releases.", "A job excluded by path rule is treated as passing by a required-check gate."],
    v: "For a job limited to the default branch and changes under one directory, push changes in each combination and confirm the job appears only for the right one, with a visible skipped reason elsewhere.",
    dep: ["variables-and-parameters", "stages-and-dependency-graph"]
  },
  "templates-and-includes": {
    s: "Reusable pieces of pipeline definition, such as shared jobs and organization-wide templates, pulled into many repositories and versioned.",
    d: "A pipeline can include files from the same repository, another repository or a catalog, optionally with parameters. The included content is merged into the definition before validation. Organizations use it to standardize build, scan and deploy steps and to enforce required jobs. The risks are coupling and surprise: an update to a shared template changes every consumer at once, and merge rules decide whether a repository can override or remove an inherited job, so the template author must decide how strict to be.",
    k: ["Pin includes to a version versus follow the latest: pinning makes runs reproducible and delays fixes; following the latest propagates fixes and breaks everyone together.", "Overridable templates versus enforced ones: overridable keeps teams autonomous and lets them drop required steps; enforced guarantees policy and blocks legitimate exceptions."],
    p: ["An unpinned shared template edited on a Friday breaks hundreds of repositories before anyone can react.", "A repository defining a job with the same name as an inherited one silently replaces the security scan."],
    v: "Update a pinned shared template and confirm consumers on the old pin still produce the old job set while one moved to the new pin shows the change, and that an attempted override of an enforced job is rejected.",
    dep: ["pipeline-as-code", "config-validation"]
  },
  "matrix-expansion": {
    s: "Expands one job definition into many by combining values of declared dimensions, such as platform and version, so the same steps run across a grid.",
    d: "The author lists dimensions and values; the planner creates a job per combination, each with its own variables, and may add or exclude specific cells. Each cell is scheduled independently, can fail independently and is reported separately. The costs add up quickly: three dimensions of five values is 125 jobs. Controls include maximum parallelism, fail-fast across the matrix, and deciding which cells are required to merge. Naming is hard: required checks refer to job names, which now depend on parameter values.",
    k: ["Full cross product versus hand-chosen combinations: the product catches interactions and wastes compute; chosen cells are cheap and miss an untested combination.", "Fail-fast across the matrix versus run all cells: fail-fast saves cost and hides which other cells would also fail; running all gives the whole picture on every failure."],
    p: ["Adding a value to one dimension doubles cost without anyone noticing until the bill or queue time rises.", "Cell names that change with values make required-check rules reference jobs that no longer exist."],
    v: "Declare two dimensions of three and two values with one excluded cell and confirm exactly five jobs are created, each with the right variables and a distinct name in the run view and statuses.",
    dep: ["stages-and-dependency-graph", "variables-and-parameters"]
  },
  "dynamic-pipeline-generation": {
    s: "Lets one job produce the definition of further jobs at runtime, so the shape of the pipeline can depend on repository contents or earlier results.",
    d: "A generator job runs a script that writes a pipeline file, which the system loads and runs as a child pipeline or appended jobs. Monorepos use it to emit one job per changed package, and tools use it to split tests by measured duration. The generated definition goes through the same validation as any other. It is hard to debug because the real pipeline never exists in the repository, the generator is itself untrusted code, and a bug in it can produce an empty or enormous graph.",
    k: ["Generate at runtime versus keep static definitions with rules: generation adapts to repository structure automatically but hides the graph from review; static is explicit and requires manual upkeep.", "Child pipelines versus appending to the parent: children isolate failures and variables but add reporting layers; appending keeps one graph and is more complex to implement."],
    p: ["A generator that emits zero jobs reports success, so the change merges untested.", "Limits on generated size missing lets a bad script queue thousands of jobs."],
    v: "Change files in one of three packages and confirm the generator emits exactly that package's jobs, the generated file is saved as an artifact for inspection, and an empty result fails the run rather than passing it.",
    dep: ["pipeline-as-code", "config-validation", "affected-target-selection"]
  },
});
