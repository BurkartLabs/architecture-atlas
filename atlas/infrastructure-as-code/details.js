// Details for the infrastructure-as-code plate, part 1: command line, run orchestration.
ATLAS.details("infrastructure-as-code", {
  "command-line-interface": {
    s: "The set of commands that initialize a working directory, validate, plan, apply, destroy, import and inspect state, all sharing one configuration loader and one state interface.",
    d: "Each command is a thin driver over the same core: load configuration, open the backend, build a graph, then run a plan or apply operation with a context holding options such as variable values, targets and parallelism. Commands read the working directory for configuration and a hidden data directory for installed providers, modules and backend settings. The hard part is that the surface grows by accretion: flags, environment variables and files can all set the same option, so precedence must be fixed and documented.",
    k: ["One binary with subcommands versus separate tools per task: a single entry point shares loading and flags, but every change to shared behavior touches every command.", "Flags, environment variables and files all accepted: pipelines can configure without editing files, at the cost of an order of precedence people must memorize."],
    p: ["A command run in the wrong directory or with a stale backend setting operates on the wrong state with no visible warning.", "Environment variables set for one tool leak into child provider processes and change behavior unexpectedly."],
    v: "In an empty directory run initialize, plan and apply against a trivial configuration, then confirm state lists the object and a second plan reports no changes.",
    dep: ["configuration-loader","state-manager","backend-abstraction"]
  },
  "interactive-approval": {
    s: "The prompt that shows a plan and requires a typed confirmation before apply proceeds, giving a human one last chance to catch an unintended change.",
    d: "When apply runs without a saved plan, it first produces a fresh plan, renders it, then waits for an explicit affirmative answer on the terminal. Anything else cancels with no changes. The prompt is skipped by an auto-approve flag or when a saved plan is supplied, since the plan was already reviewed elsewhere. It is simple but load-bearing: it is the only gate in a laptop workflow, and the plan it shows is computed again at apply time, so it can differ from one seen earlier.",
    k: ["Typed word versus single keypress: a full word resists reflexive confirmation, but slows legitimate runs and cannot be used in non-interactive shells.", "Show a fresh plan versus apply a reviewed one: a fresh plan is convenient, but what was approved may differ from what an earlier review saw."],
    p: ["An auto-approve flag copied from a pipeline script into an interactive habit removes the only protection against destroying production objects.", "Very long plans scroll past the summary, so approval is given without reading the destroy lines."],
    v: "Run apply on a change that deletes one object and answer anything but the confirmation word; confirm exit with no provider write calls logged and state unchanged.",
    dep: ["plan-renderer","plan-diff"]
  },
  "machine-readable-output": {
    s: "Structured output for plans, state, outputs and validation results, so scripts, policy engines and dashboards can read them without scraping human text.",
    d: "Commands can emit JSON for the plan, the state, output values and validation diagnostics, and a streaming form that emits one event per line during a run. Each document carries a format version so consumers can detect incompatible changes. A plan document includes prior and planned values, unknown markers, sensitivity flags and the reason for each action. The difficulty is keeping the schema stable while internals change, and not leaking sensitive values into a format designed to be piped into other systems.",
    k: ["A versioned stable schema versus a dump of internal structures: consumers survive upgrades, but internals must be translated and some detail is dropped.", "Whole-document output versus line-by-line event stream: documents are easy to parse after the fact, while streams let a UI show progress during a long apply."],
    p: ["Sensitive values emitted in plain form into a build log become permanently readable by everyone with log access.", "A consumer that ignores the format version silently misreads fields after an upgrade changes their meaning."],
    v: "Generate a plan as JSON, confirm the format version field is present, that unknown values are flagged rather than null, and that a value marked sensitive in configuration is flagged in the output.",
    dep: ["plan-diff","unknown-values","sensitive-values"]
  },
  "exit-status-codes": {
    s: "Distinct process exit codes for success, failure and success-with-changes, letting pipelines branch on whether a plan found anything to do without parsing text.",
    d: "A plan can exit zero when it finds no changes and a separate code when it finds changes, if asked with a detailed-exit-code option; failures always use a different nonzero code. Pipelines use this to open a pull request comment only when something changes, or to fail a scheduled run when drift appears. Diagnostics are written to a separate stream. The subtlety is that without the option, changes and no changes look identical to a script, and a crash and a policy failure can be indistinguishable if they share a code.",
    k: ["Three outcomes versus two: a distinct changes-present code enables drift alarms, but scripts written against two outcomes treat it as a failure.", "Plan failure and policy failure sharing a code versus separate codes: one is simpler to document, the other lets a pipeline route the two to different owners."],
    p: ["A scheduled drift job that only checks for exit zero never alerts, because the default code is the same with or without changes.", "Wrapper scripts that swallow the exit code with a pipe to a log command report success for a failed apply."],
    v: "Run plan with the detailed code option on an unchanged configuration and on one with a pending change, and confirm the two exit codes differ from each other and from a deliberately broken configuration.",
    dep: ["command-line-interface"]
  },
  "ci-automation": {
    s: "Running plan on every proposed change and apply on merge from a pipeline, with saved plans, pinned versions and non-interactive flags so runs are repeatable.",
    d: "A typical pipeline initializes with a cached provider directory, validates, formats, plans with the lock held and writes the plan file as an artifact, posts a summary to the review, then applies exactly that plan after approval. Credentials come from short-lived workload identity rather than stored keys. The difficulty is drift between the review-time plan and the merge-time apply: state may change in between, which is why saved plans carry a check that state has not moved since they were made.",
    k: ["Apply the saved plan versus re-plan at merge: the saved plan is exactly what was reviewed, but goes stale when state changes; a re-plan is fresh but unreviewed.", "Pipeline runs versus a managed run service: pipelines reuse existing tooling, while services add shared state, queues and approvals that pipelines must be built to provide."],
    p: ["Two merges applying concurrently from separate pipeline jobs fight over the lock, and the loser fails halfway through a deploy.", "Long-lived cloud keys stored as pipeline secrets are readable by anyone who can edit the pipeline definition."],
    v: "Open a change, confirm the pipeline posts a plan summary and uploads a plan artifact, merge it, and confirm the apply step consumed that artifact and a follow-up plan shows no changes.",
    dep: ["saved-plan-apply","exit-status-codes","provider-mirror-and-cache","state-locking"]
  },
  "provider-mirror-and-cache": {
    s: "A local cache or mirror of provider binaries so repeated initializations, and air-gapped networks, do not re-download large plugins from the public registry.",
    d: "Providers are large binaries fetched at initialization. A shared plugin cache directory stores each version once and links it into working directories. A mirror, filesystem or network, replaces the registry as the download source and can be the only source in restricted networks. The installer still verifies each package against checksums in the lockfile. It is hard because the cache is keyed by platform as well as version, so a lockfile generated on one machine type lacks the checksums another needs.",
    k: ["Shared cache versus per-directory install: a shared cache saves bandwidth and time, but concurrent runs can race writing to it.", "Network mirror versus bundled filesystem mirror: a network mirror is easy to update centrally, while a filesystem bundle works fully offline."],
    p: ["A lockfile created on one operating system fails verification on a pipeline runner of another type because checksums for that platform were never recorded.", "A mirror missing one version blocks every pipeline that pins it, with an error that looks like a network fault."],
    v: "Initialize two directories with a shared cache enabled and confirm the second performs no download. Then disable the registry and confirm initialization still succeeds from the mirror with matching checksums.",
    dep: ["module-installer","dependency-lockfile","provider-registry"]
  },
  "formatter-and-docs": {
    s: "Tools that rewrite configuration into canonical style and generate reference documentation from variable and output declarations, keeping diffs small and interfaces documented.",
    d: "The formatter parses configuration into a syntax tree that retains comments and whitespace, then rewrites spacing, alignment and indentation to a fixed style without changing meaning. It can run in check mode for pipelines. Documentation generators read variable, output and provider declarations, with their descriptions and types, and produce tables for a module's readme. The hard part is round-tripping: the syntax tree must preserve everything, including comments in odd places, or the tool corrupts files it was only meant to align.",
    k: ["One canonical style with no options versus configurable style: a fixed style ends arguments about formatting, but teams cannot adapt it to local conventions.", "Generated reference docs versus handwritten: generated tables never drift from code, but cannot explain intent or give examples."],
    p: ["Reformatting a whole repository in one change buries real edits in whitespace noise and breaks blame history.", "Generated docs committed by hand fall out of date the first time a variable is added without rerunning the generator."],
    v: "Run the formatter in check mode on a deliberately misaligned file, confirm it exits nonzero and names the file, then format it and confirm a following plan reports no changes.",
    dep: ["blocks-and-attributes","input-variables"]
  },
  "run-queue": {
    s: "The service component that accepts run requests, queues them per workspace, hands each to an isolated worker with credentials, and records the outcome.",
    d: "A run is a plan, an optional approval and an apply, bound to a configuration version and a workspace. The queue serializes runs per workspace so only one holds the state lock, and starts workers in clean, disposable environments with the right variables and provider credentials injected. Logs stream back and are stored. It is hard because runs are long and workers die: a lost worker may leave a lock held and an apply half done, so the service must detect abandonment and decide whether to resume, fail or force-unlock.",
    k: ["Strict per-workspace serialization versus parallel plans with serialized applies: strict order is simple and safe, while speculative plans in parallel give faster feedback.", "Disposable workers versus long-lived agents: clean environments prevent leakage between runs, at the cost of reinstalling providers every time."],
    p: ["A worker killed mid-apply leaves a stale lock and partial infrastructure, and the next queued run starts against unknown state.", "A burst of triggers fills the queue with runs that are obsolete by the time they start."],
    v: "Queue three runs on one workspace, confirm they execute one at a time in order, kill a worker mid-run, and confirm the run is marked failed and the lock is released or flagged.",
    dep: ["state-locking","plugin-launcher","credential-resolution"]
  },
  "vcs-triggers": {
    s: "Hooks from version control that start a plan when a change is proposed and an apply when it merges, tying infrastructure runs to reviewed commits.",
    d: "The service watches a repository path and branch for each workspace. A pull request starts a speculative plan whose result is posted back as a status check, and a merge to the tracked branch starts a real run. Each run records the commit it used, so any state change can be traced to a reviewed diff. It is difficult because one repository often holds many workspaces: a change to a shared module must trigger every dependent workspace, and path filters can miss indirect changes.",
    k: ["Speculative plans on proposals versus plans only on merge: early plans catch errors during review, but cost compute and may show results that change before merge.", "Branch per environment versus directories per environment: branches make promotion a merge, while directories keep all environments visible in one tree."],
    p: ["A change to a shared module that no path filter matches reaches production workspaces without ever being planned in them.", "A forked pull request running a plan with live credentials lets an outsider execute code in the worker."],
    v: "Open a pull request touching one workspace's directory, confirm a speculative plan runs and reports as a status check, then merge and confirm the run record shows the merge commit.",
    dep: ["run-queue","module-sources"]
  },
  "approval-gates": {
    s: "A required human or automated sign-off between the plan and the apply, with rules about who may approve and whether an approval survives a changed plan.",
    d: "After a plan finishes and policy checks pass, the run pauses in a pending state. Authorized users or teams review the rendered plan, cost estimate and policy results, then approve or discard. Rules can require two approvers, forbid self-approval or auto-approve low-risk workspaces. The apply uses the approved plan, not a new one. The hard cases are expiry and change: a plan approved on Friday may be stale on Monday, so the service must either apply the old plan with a state check or force a new review.",
    k: ["Always require approval versus auto-apply for trusted workspaces: universal review is safest, but teams drown in approvals for harmless changes.", "Approval bound to a specific plan versus to a commit: binding to the plan is exact, but any state change invalidates it and forces a repeat."],
    p: ["Approvers routinely approve from the summary line without reading destroy entries, so the gate becomes a formality.", "A pending run left overnight holds the workspace lock and blocks every later change to it."],
    v: "Produce a plan that deletes one object, confirm the run stops pending, approve as a second user and confirm the apply executes that exact plan and the audit log shows both identities.",
    dep: ["run-queue","access-control","plan-renderer","saved-plan-apply"]
  },
  "audit-log": {
    s: "A tamper-resistant record of who triggered, approved, changed and read what, including run outcomes, state versions and credential or policy changes.",
    d: "Every significant event, such as run created, plan finished, approval given, state version written and variable edited, is appended with actor, time, workspace and result. State versions link back to the run that wrote them, giving a chain from any infrastructure change to a commit and an approver. Logs are exported to external storage for retention. The difficulty is completeness and safety: the log must capture reads of sensitive variables and state as well as writes, and must never contain secret values itself.",
    k: ["Log reads and writes versus writes only: recording reads supports investigation of secret exposure, but multiplies volume.", "Store in the service versus stream to an external system: external storage is harder to alter by an administrator, while built-in storage is simpler to query."],
    p: ["Audit entries that include variable values or plan text copy secrets into a system with a much wider audience.", "A run applied from a laptop to shared state bypasses the service and leaves no entry at all."],
    v: "Make a change through the service and confirm the log shows trigger, approval, apply and the resulting state version, each with an actor, and that no variable value appears in any entry.",
    dep: ["run-queue","state-snapshots","access-control"]
  },
  "access-control": {
    s: "Rules for which people, teams and automated identities may read state, edit variables, plan, apply or administer each workspace and the credentials attached to it.",
    d: "Permissions are granted per workspace or project and layered into roles: read, plan, write, admin. State read access is separate and sensitive, since state may contain secrets. Service identities for pipelines are scoped to the workspaces they deploy. Credentials for providers are attached to the workspace, not handed to people, so users can trigger a change without ever holding the keys. The hard part is that plan-only rights still execute configuration, including data source calls, so they are not harmless.",
    k: ["Separate read-state and plan rights versus one read role: finer rights protect secrets in state, but administration becomes harder to reason about.", "Credentials held by the service versus by users: service-held credentials cannot leak from laptops, but make the service a high-value target."],
    p: ["Plan rights granted widely because plan seems read-only, when a plan runs arbitrary data source and external program calls.", "A team with variable edit rights can change a credential variable and redirect a run at another account."],
    v: "As a user with plan-only rights, start a plan successfully, then attempt an apply, a variable edit and a state download, and confirm each is denied and logged.",
    dep: ["run-queue","audit-log"]
  },
  "run-tasks-and-notifications": {
    s: "Hooks that call external services at defined points in a run, such as after plan or before apply, and notify people of outcomes through messages and webhooks.",
    d: "At configured stages the service posts run details to an external endpoint, waits for a pass or fail result and then continues or stops the run. Typical uses are security scanners, cost tools and ticket systems. Notifications are sent on events like needs-approval, failed or drift found. The mechanism is simple; the hazards are operational: an unreachable external check can block all deployments, and a webhook payload may carry plan data that includes sensitive values.",
    k: ["Blocking tasks versus advisory tasks: blocking enforces a rule, but makes an outside service's outage into a deployment outage.", "Push notifications versus a dashboard people check: notifications reach people quickly, but noisy channels train them to ignore them."],
    p: ["A scanner endpoint that times out fails every run in the organization at once.", "Notification payloads sent to a public chat channel expose resource names and internal addresses."],
    v: "Attach a blocking task that returns fail and confirm the run stops before apply with the task's message shown; then make the task pass and confirm the run proceeds and a notification arrives.",
    dep: ["run-queue","machine-readable-output"]
  },
});
