// Details for the dependency scanner plate, part 1: developer surfaces, remediation, policy.
ATLAS.details("dependency-scanner", {
  "cli-scanner": {
    s: "A local command that scans a directory or image and prints findings, usable by a developer at a terminal and by any pipeline that can run a program.",
    d: "The command discovers manifests and lockfiles under a path, builds the inventory, matches it against a local or remote advisory source and prints a table or machine-readable report with an exit status. It is the reference implementation of the scan: other surfaces often wrap it. It must start fast, work without an account, and behave identically on a laptop and in a pipeline. The hard parts are database freshness at startup, stable output formats that scripts can depend on, and exit codes that distinguish findings from failures to scan.",
    k: ["Bundled local database vs live lookup: offline and fast, but results age until the next update; live lookups are fresh but fail without a network.", "Human table by default vs structured output by default: friendly at a terminal, but scripts parsing text break whenever wording changes."],
    p: ["Exiting zero when a lockfile could not be parsed reports a clean scan for a project that was never examined.", "Output formats changed between releases silently break dashboards and gates built on parsing them."],
    v: "Run the scanner on a fixture project with one known-vulnerable pinned dependency and confirm it lists that advisory and exits nonzero, then on a corrupt lockfile and confirm a distinct error exit.",
    dep: ["match-engine", "manifest-parsers", "lockfile-parsers"]
  },
  "ci-integration": {
    s: "Runs scans inside build pipelines on each change or on a schedule, publishing results and optionally failing the build according to policy.",
    d: "A pipeline step installs or invokes the scanner, points it at the checked-out source or built artifact, uploads results to the platform and reports a status. Two modes matter: change-triggered scans that judge what a change introduces, and scheduled scans of the default branch that catch advisories published after code merged. It reads credentials for private registries from the pipeline's secret store. Difficulty comes from variety: many pipeline systems, ephemeral workers with cold caches, forks that must not receive secrets, and scan time that is added to every build.",
    k: ["Scan on every change vs scan on a schedule: per-change catches introductions immediately, while scheduled scans are the only way to see newly published advisories on unchanged code.", "Blocking vs advisory step: blocking enforces policy but makes the scanner an outage source for every team."],
    p: ["A scanner service outage fails every build org-wide when the step is blocking with no timeout or fallback.", "Running with secrets on builds from forked contributions can expose registry credentials."],
    v: "Open a change that adds a dependency with a known advisory and confirm the pipeline reports the finding with its package and fixed version; then merge it and confirm the scheduled scan still lists it.",
    dep: ["cli-scanner", "build-gates", "result-store"]
  },
  "pull-request-checks": {
    s: "Reports on a proposed change what it adds or fixes: new vulnerable dependencies, newly resolved advisories and license problems, as a status and inline comments.",
    d: "The check scans the change's head and the target branch, diffs the two inventories and findings, and reports only the difference. It posts a pass or fail status and a short summary, sometimes annotated on the manifest line that introduced the package. Reviewers see consequences at the moment of decision, when removal is cheapest. The hard part is attribution: a transitive package may appear because of one changed line far away, and comments must stay brief enough that people read them.",
    k: ["Report only the delta vs report everything: the delta keeps comments relevant to the change, but hides pre-existing risk the author is now touching.", "Inline annotations vs one summary comment: inline places advice at the cause, but a lockfile rewrite can flood a review with hundreds of notes."],
    p: ["Comparing against a stale target branch reports old findings as new and teaches authors to ignore the check.", "A lockfile regenerated wholesale makes every transitive package look newly introduced."],
    v: "On a branch that bumps one direct dependency to a version with a known advisory, confirm the check names the new finding and the manifest line, and lists no findings that exist on the target branch.",
    dep: ["baseline-diffing", "dependency-graph", "build-gates"]
  },
  "ide-plugin": {
    s: "Shows vulnerable or disallowed dependencies in the editor beside the manifest line that declares them, with suggested versions, before the change is committed.",
    d: "The plugin watches manifest and lockfile edits, asks a local scanner process or the service for findings on the changed inventory, and renders diagnostics and quick fixes in the editor. It gives the earliest feedback in the lifecycle and is the cheapest place to avoid adding a bad package. It has a tight latency budget measured in a second or two while typing. The hard parts are partial or syntactically invalid manifests mid-edit, avoiding network calls on every keystroke and keeping its results consistent with what the pipeline later says.",
    k: ["Local scan vs service call: local is private and fast but needs a synced database; the service is fresh and shared but leaks dependency names and needs connectivity.", "Diagnostics on every edit vs on save: immediate feedback is helpful, but it burns resources and flickers while a version is half typed."],
    p: ["An editor that disagrees with the pipeline about the same dependency makes developers distrust both.", "Sending every edit to a remote service discloses unreleased dependency choices to a third party."],
    v: "Type a known-vulnerable version into a manifest in the editor, and confirm a diagnostic appears on that line within two seconds naming the advisory and offering the lowest fixed version.",
    dep: ["match-engine", "manifest-parsers", "upgrade-planner"]
  },
  "findings-dashboard": {
    s: "A shared view of current findings across projects, with filtering, trends, ownership and status, used by security teams and engineering managers rather than by individual developers.",
    d: "The dashboard reads from the result store and presents findings by project, team, severity, age and status, with trends over time and exports for audit. It answers organizational questions: how many critical findings are open, who owns them, which are past deadline, and whether the backlog is shrinking. It needs consistent identity of a finding across scans so history is not lost. It is hard because aggregate numbers hide quality problems: a count that rises because a database improved looks the same as one that rises because risk did.",
    k: ["Per-scan snapshots vs tracked finding lifecycles: snapshots are simple, but lifecycles are required to compute age, time to fix and reopened issues.", "Raw counts vs risk-weighted views: counts are easy to explain and easy to game, while weighted views depend on a model people must trust."],
    p: ["Charting findings counts without separating new advisories from new code attributes database changes to team behavior.", "Project renames or moved repositories split a finding's history and reset its age."],
    v: "Fix one critical finding in a project and confirm the dashboard marks it resolved with a fix time, the open count drops by one, and an unrelated project's counts do not change.",
    dep: ["result-store", "finding-fingerprints", "sla-tracking"]
  },
  "ticket-integration": {
    s: "Creates and updates work items in an issue tracker for findings that need human action, and closes them when a later scan shows the finding is gone.",
    d: "Rules decide which findings produce tickets, usually by severity, owner and age. The integration creates one ticket per finding or per grouped fix, links back to the evidence, and synchronizes status in both directions: a closed ticket does not close the finding unless a scan confirms it. It maps projects to queues through ownership data. The hard part is volume and idempotency: a rescan must update the existing ticket rather than file a duplicate, and bursts of new advisories can flood a team's tracker.",
    k: ["Ticket per finding vs ticket per fix: per-finding is traceable, but one upgrade resolving twenty findings should be one work item, not twenty.", "Scan-confirmed closure vs manual closure: confirmed closure keeps data honest, but tickets stay open when a rescan is delayed."],
    p: ["Non-idempotent creation files a fresh duplicate ticket on every scan until the tracker is unusable.", "Auto-closing on ticket status lets a finding disappear without any change to the code."],
    v: "Trigger two consecutive scans of a project with one qualifying finding and confirm exactly one ticket exists, linked to the finding; fix the dependency and confirm it closes after the next scan.",
    dep: ["ownership-routing", "finding-fingerprints", "api-and-webhooks"]
  },
  "api-and-webhooks": {
    s: "Programmatic access to scans, findings and policies, plus event notifications, so other systems can start scans, read results and react to changes.",
    d: "A versioned request interface exposes projects, scans, findings, policies and SBOMs with authentication, pagination and filtering. Webhooks send signed events such as a new critical finding or a failed gate to chat, ticketing or automation. Customers build gates and reports on top, so the contract is a product. It is hard because of change over time: finding schemas evolve, large result sets need stable pagination while data changes, and webhook delivery needs retries, ordering rules and replay protection.",
    k: ["Strict versioned contract vs evolving schema: versions let integrations survive, but each one is a maintenance burden for years.", "At-least-once webhooks vs exactly-once claims: at-least-once is achievable with retries, so consumers must deduplicate by event identifier."],
    p: ["Offset pagination over a result set that changes during iteration skips or repeats findings.", "Unsigned webhooks let anyone who learns the endpoint forge a clean report or trigger actions."],
    v: "Call the findings endpoint with a stored page cursor while new findings are added and confirm no item is skipped or repeated, and that a webhook with a tampered body fails signature verification.",
    dep: ["result-store", "multi-tenancy"]
  },
  "upgrade-planner": {
    s: "Works out the smallest set of version changes that removes a vulnerability while satisfying every constraint in the dependency graph, and explains what else must move.",
    d: "Given a finding, the planner reads the advisory's fixed versions, the project's constraints and the registry's published versions, then searches for a version of the vulnerable package that is allowed by all dependents. If a direct dependency pins an old version, the plan may require upgrading a different package, adding an override, or noting that no fix exists. It ranks candidates by distance from the current version and by risk of breakage. Hard because the search is a constraint-solving problem that depends on each ecosystem's resolution rules.",
    k: ["Minimal version bump vs latest version: minimal reduces breakage, but leaves the project one release from the next advisory.", "Override of a transitive version vs upgrading the parent: an override fixes now without waiting, but forces a combination the parent was never tested with."],
    p: ["Planning from advisory data without resolving against the real graph proposes versions the project cannot install.", "Suggesting a fixed version that is yanked or itself vulnerable sends developers in circles."],
    v: "For a project where the vulnerable package is transitive, request a plan and confirm it names a version set that resolves cleanly in a fresh install and removes the finding on rescan.",
    dep: ["transitive-resolution", "fixed-version-resolution", "registry-client", "range-evaluation"]
  },
  "automated-upgrade-prs": {
    s: "Opens pull requests that apply planned upgrades on a schedule or when an advisory appears, with release notes, risk context and the tests the project already runs.",
    d: "A bot creates a branch, edits the manifest and lockfile through the ecosystem's own tool, pushes it and opens a request that cites the advisory, fixed version, changelog excerpt and compatibility signals. Project tests run as usual, so the result is a reviewable, tested change. It must limit its own volume with rate limits and respect branch naming and review rules. Difficulties include conflicts when several updates touch one lockfile, stale requests when newer versions appear, and permission to write to repositories safely.",
    k: ["Bot opens requests directly vs proposes in a dashboard: direct is convenient and visible, but floods repositories and requires write credentials.", "Rebase on conflict vs close and recreate: rebasing preserves discussion, while recreation is simpler and always current."],
    p: ["Unlimited open requests per repository bury maintainers and are collectively ignored.", "A bot with broad write credentials is a high-value target and a path for supply chain abuse."],
    v: "Publish an advisory against a pinned dependency in a test repository and confirm a request appears with the right version, advisory link and passing tests, then merge it and confirm the finding closes.",
    dep: ["upgrade-planner", "lockfile-regeneration", "ci-integration", "grouped-updates"]
  },
  "grouped-updates": {
    s: "Combines related upgrades into one change, grouped by package family, ecosystem, severity or schedule, so reviewers handle a batch rather than a stream of single-package requests.",
    d: "Grouping rules cluster pending updates by shared dependency, release family, update type or time window, then produce a single branch that applies them together and runs the tests once. It trades granularity for attention: twenty patch updates become one weekly review. Security fixes are often kept separate so they can ship immediately. It is hard because a group fails if any member fails, so the planner must isolate the member that broke, and groups must not mix updates that need different review depth.",
    k: ["Large weekly batch vs individual changes: batching cuts review load, but a failing member blocks everything and complicates rollback.", "Security fixes grouped vs separated: separation allows rapid release of urgent fixes, at the cost of more changes for maintainers."],
    p: ["One breaking member in a group of thirty makes the whole request fail and nobody investigates which.", "Grouping security fixes with routine bumps delays urgent patches until the weekly review."],
    v: "Enable grouping on a repository with five pending patch updates and confirm one change contains all five, with a failing member identified by name when one is made to break the build.",
    dep: ["upgrade-planner", "automated-upgrade-prs"]
  },
  "lockfile-regeneration": {
    s: "Rewrites a lockfile after a version change by running the ecosystem's own resolver, so the committed result is exactly what a developer's tool would produce.",
    d: "Instead of editing lockfile text, the automation invokes the package manager in a controlled environment with the changed manifest, the project's registry configuration and, where possible, the same tool version used by the team. It then commits only the resulting differences. This guarantees a valid lockfile, including hashes and integrity data that hand edits would break. It is hard because of environment sensitivity: tool version differences, platform-specific optional dependencies and private registry access change the output, and a different resolver version can rewrite the entire file.",
    k: ["Run the real package manager vs reimplement resolution: the real tool is authoritative, but needs each tool installed and executing project-controlled scripts.", "Minimal lockfile change vs full re-resolve: minimal limits risk, but may leave other stale or vulnerable versions."],
    p: ["Running with a different tool version rewrites the whole lockfile and produces an unreviewable change.", "Running install scripts from the project's dependencies in the automation environment can execute untrusted code."],
    v: "Change one version and regenerate, then confirm the lockfile diff touches only that package and its dependents, and that a clean install from it passes the project's integrity checks.",
    dep: ["lockfile-parsers", "private-registry-config", "scan-sandbox"]
  },
  "breaking-change-detection": {
    s: "Estimates whether an upgrade will break the project by comparing release metadata, version-bump type, changelogs, API surface and signals from other projects that already upgraded.",
    d: "Signals include whether the version change is a major, a declared breaking-change note, removed or changed public symbols detected by comparing the two releases, and how often other consumers' builds failed after the same upgrade. It outputs a confidence or label shown on the upgrade request and used to decide between automatic merge and human review. It is hard because version numbers are only a promise, many breakages live in behavior rather than signatures, and aggregate signals from other users depend on privacy and enough data.",
    k: ["Semantic version trust vs measured API diff: version numbers are free to read but often wrong; diffing is expensive and still misses behavior changes.", "Crowd signals vs project-specific signals: crowd data reflects real outcomes, but your usage of the package may be unusual."],
    p: ["Treating a minor version as safe automatically merges a behavioral change that breaks production.", "Low confidence labels shown without reasons are ignored or blindly trusted."],
    v: "Upgrade across a release known to remove a public function the project calls, and confirm the request is labeled likely breaking and names the removed symbol.",
    dep: ["registry-client", "call-graph-builder", "maintenance-signals"]
  },
  "fix-verification": {
    s: "After a fix is applied, rescans and tests to confirm the vulnerable version is gone from the resolved graph and nothing else regressed, before the finding is closed.",
    d: "Verification runs the same inventory and matching on the changed source or the rebuilt artifact, checks that the advisory no longer matches, that no new advisory was introduced by the fix, and that the project's tests pass. For images it rescans the new build rather than trusting the manifest. It closes the loop so a finding closed means the vulnerable component is not shipped. It is hard because source and artifact can disagree: a lockfile fix does not help if the deployed image was never rebuilt.",
    k: ["Verify in source vs verify in the built artifact: source is fast, but only the artifact proves what ships.", "Close on merge vs close on deploy: merge is easier to detect, while deploy is when users are actually protected."],
    p: ["Closing findings when the pull request merges, before any deployment, leaves production vulnerable while reports say fixed.", "A fix that pulls in a different vulnerable version is reported as resolved because only the original advisory was rechecked."],
    v: "Merge a fix and confirm the finding stays open until a rescan of the rebuilt image shows the fixed version, and that the verification record lists the artifact digest scanned.",
    dep: ["incremental-scanning", "match-engine", "layer-extraction", "result-store"]
  },
  "policy-language": {
    s: "A declarative way to state which findings are acceptable, which block, and what happens next, evaluated the same way everywhere the scanner runs.",
    d: "Policies are written as rules over finding fields such as severity, exploit status, reachability, package, license, age and project tags, with actions like warn, block, assign and require approval. They are stored in version control or the platform, tested against sample findings and applied identically in editors, pipelines and dashboards. Policy has to be explainable: every decision should name the rule that produced it. Hard because rules interact, order or precedence must be defined, and a small edit can silently block or release hundreds of projects.",
    k: ["General-purpose policy engine vs purpose-built rule format: general engines reuse tooling and skills, while a purpose-built format is easier for security teams to read and validate.", "Policy as code in repositories vs central console: code gets review and history, a console is easier for non-engineers but harder to audit."],
    p: ["Rolling out a stricter rule without a dry run suddenly blocks every build in the organization.", "Overlapping rules with unclear precedence produce decisions nobody can explain."],
    v: "Evaluate a policy against a stored set of sample findings and confirm each decision lists the matching rule, then change one threshold and confirm a dry run reports exactly which projects would change status.",
    dep: ["severity-thresholds", "risk-ranking"]
  },
  "severity-thresholds": {
    s: "The cutoffs that map a finding's score or category to a response, such as fail the build above high, warn on medium, and ignore informational.",
    d: "Thresholds apply to base severity, adjusted risk or a combination, and can differ by environment, project tier and finding age. A common form is block on critical and high with a fix available, warn otherwise. Thresholds are the simplest policy lever and the most disputed. Hard because a number is a coarse summary: the same score can describe very different exposure, so many programs combine the threshold with exploit evidence or reachability, and give newly published findings a grace period.",
    k: ["Block only when a fix exists vs block regardless: requiring a fix avoids stranding teams, but unfixed critical flaws then never gate anything.", "One global threshold vs per-tier thresholds: global is easy to explain, tiered matches real risk but invites arguments about tiers."],
    p: ["A threshold that blocks on findings with no available fix halts all releases with no way to comply.", "Tuning thresholds until the build passes hides the real risk in exceptions nobody tracks."],
    v: "Set the block threshold to high and scan fixtures with one high and one medium finding, confirming only the high one fails the build and the report states the threshold that applied.",
    dep: ["base-severity-score", "risk-ranking"]
  },
  "build-gates": {
    s: "The enforcement points that stop a build, merge or release when policy says a finding is unacceptable, and record why.",
    d: "A gate evaluates the current findings against policy at a defined point: pull request merge, artifact publication or deployment. It returns pass, warn or fail with a reason and a link to the evidence, and logs the decision for audit. Gates are the only place where scanning changes outcomes. Hard because blocking must be dependable and predictable: results must be deterministic for the same input, wait for slow scans with a clear timeout behavior, and offer a defined path for emergency release without disabling the control.",
    k: ["Fail closed vs fail open on scanner errors: closed is safest, but turns scanner outages into delivery outages.", "Gate at merge vs at deploy: merge gives early feedback, while deploy catches advisories published after merge."],
    p: ["A flaky or slow gate trains teams to rerun until it passes, which erodes its meaning.", "A permanent bypass flag added for emergencies becomes the default in busy teams."],
    v: "Merge a change that introduces a blocking finding and confirm the gate fails with the rule and finding named; then disable the scanner service and confirm the configured fail-closed or fail-open behavior occurs.",
    dep: ["policy-language", "severity-thresholds", "exceptions-and-waivers", "result-store"]
  },
  "exceptions-and-waivers": {
    s: "Time-limited, justified, approved decisions to accept a finding that policy would otherwise block, tracked so they expire and are reviewed.",
    d: "An exception names the finding or advisory, the project and scope, a reason, an approver and an expiry. While active, the gate treats the finding as accepted but still reports it. At expiry the exception lapses and the gate blocks again unless renewed. Exceptions are the pressure valve that lets policy be strict. Hard because they accumulate: without expiry and review they become a permanent allowlist, and a broad exception on a package name can mask a later, different advisory for the same package.",
    k: ["Exceptions scoped to one finding vs one package: finding scope is precise, but package scope reduces paperwork and hides new advisories.", "Self-approval vs separate approver: self-approval is quick, but removes the check that exceptions exist to provide."],
    p: ["An exception without an expiry silently accepts risk indefinitely after the reason has gone.", "A waiver on a package version range keeps applying to new advisories it was never evaluated for."],
    v: "Create an exception expiring in one minute for a blocking finding, confirm the gate passes with the finding still listed as accepted, then wait past expiry and confirm the gate fails again.",
    dep: ["policy-language", "finding-fingerprints", "ownership-routing"]
  },
  "sla-tracking": {
    s: "Measures how long each finding has been open against a deadline set by severity and context, and escalates findings that are overdue.",
    d: "Each finding gets a clock starting when it was first detected or first became applicable, and a due date from policy, for example a few days for exploited critical issues and weeks for lower severity. The tracker reports compliance rates, escalates to owners and managers as deadlines approach, and pauses clocks only under defined conditions such as no fix available. Hard because the start time must be defined carefully: using the advisory date, the scan date and the date a project adopted the package give very different answers.",
    k: ["Clock from advisory publication vs from first detection: publication is fairer to the scanner's coverage gaps, detection is fairer to owners who could not have known.", "Pause when no fix exists vs keep running: pausing avoids impossible deadlines, but may hide long-lived exposure."],
    p: ["Resetting the clock when a finding is rescanned or a project is renamed makes old exposure look new.", "Counting compliance only on closed findings hides the oldest ones that never close."],
    v: "Introduce a finding with a three-day deadline, advance the test clock past it, and confirm the finding is flagged overdue, the owner is notified, and the compliance rate falls accordingly.",
    dep: ["finding-fingerprints", "ownership-routing", "result-store"]
  },
  "ownership-routing": {
    s: "Maps each project or component to the team responsible for it so findings, tickets and escalations reach someone who can act.",
    d: "Ownership data comes from repository metadata, code ownership files, a service catalog or manual assignment, and is resolved to a team and contact at the time of a finding. Routing uses it to assign tickets, notify channels and report by team. Without it, findings go to a security queue that cannot fix them. Hard because ownership drifts: teams reorganize, repositories are inherited, and shared libraries have many consumers, so the same finding needs different owners per affected application.",
    k: ["Owner from repository metadata vs a central catalog: metadata lives with the code and stays current, while a catalog gives one authoritative answer across ecosystems.", "Route to the library owner vs each consumer: library owners fix once, but consumers decide when to upgrade."],
    p: ["Stale ownership data sends findings to a team that no longer exists and nobody notices.", "Findings with no owner are dropped from reports instead of being surfaced as a gap."],
    v: "Change the owning team in the source of record and confirm new findings route to the new team within one scan cycle, and that a project with no owner appears on an explicit unowned list.",
    dep: ["api-and-webhooks", "result-store"]
  },
  "admission-control": {
    s: "A runtime check at deployment time that refuses to run an image or artifact whose recorded scan results violate policy or are missing.",
    d: "When something is about to be deployed, an admission component looks up the artifact by digest, finds its latest scan and attestation, evaluates policy and allows or denies. It closes the gap where code passes a pipeline gate but is deployed later, rebuilt elsewhere or pulled from an unscanned source. It is a hard real-time dependency: it adds latency to every deployment, must handle scans that are old or absent, and must not become a single point of failure for the platform.",
    k: ["Require a fresh scan vs accept any recorded scan: fresh catches newly published advisories, but blocks rollbacks to older artifacts during incidents.", "Fail closed vs fail open when the service is unreachable: closed is safer, but can prevent emergency fixes from deploying."],
    p: ["Evaluating by tag rather than digest lets a mutable tag point to an unscanned image after the check.", "Blocking rollback to the last known-good version during an incident, because its scan is old, makes outages worse."],
    v: "Deploy an image by digest whose scan has a blocking finding and confirm denial with the reason; deploy the same image after an approved exception and confirm admission with the exception recorded.",
    dep: ["policy-language", "result-store", "exceptions-and-waivers"]
  },
});
