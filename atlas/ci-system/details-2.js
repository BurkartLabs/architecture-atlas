// Details for the continuous integration plate, part 2: triggers and scheduling.
ATLAS.details("ci-system", {
  "push-and-pr-triggers": {
    s: "Creates runs from pushes, review requests and tags, deciding which revision is built: the branch tip or a simulated merge of the change into its target.",
    d: "Events from the code host are mapped to run contexts: branch pipeline, change-request pipeline, tag pipeline. For a change request the system may build the head revision or a temporary merge of the head into the target, which tests what would result after merging. Both can run for the same push, so rules must prevent duplicates. The hard part is what is being tested and for whom: a merged-result build is more truthful, but depends on the target at that moment, so results can change without a new push.",
    k: ["Build the head versus the simulated merge result: head is stable and repeatable but can pass while the merge breaks; merge results are more realistic and can change with no new commit.", "One pipeline per push versus separate branch and change-request pipelines: separate pipelines allow different rules and risk duplicated work and confusing statuses."],
    p: ["A push to a branch with an open change starts two pipelines that both report the same status context, so the last to finish wins.", "A merge preview built against an old target hash gets reported against the new one."],
    v: "Push to a branch with an open change request and confirm exactly one pipeline runs for the intended context, with its revision and target recorded and displayed in the run header.",
    dep: ["webhook-receiver", "conditional-rules"]
  },
  "path-filters": {
    s: "Starts or skips pipelines and jobs based on which files a change touches, so documentation edits do not run a full test suite.",
    d: "The planner computes the changed file list between the base and the head, then matches it against patterns declared on jobs or pipelines. A match includes the job; no match skips it. The base matters: for a branch push it may be the previous tip, which for a first push or force push needs a fallback, and for a change request it is the merge base. It is hard because path rules encode dependency knowledge by hand: a library change must trigger the services that use it, and nothing checks the patterns stay true.",
    k: ["Coarse path rules versus true dependency analysis: path rules are simple and drift from reality; dependency-aware selection is correct and needs a build graph.", "Skip the whole pipeline versus skip individual jobs: skipping everything saves most but leaves required checks unreported; per-job skipping keeps the checks visible."],
    p: ["A change to a shared configuration file matches no job's pattern, so nothing tests it.", "A force push computes the changed files against a commit that no longer exists and runs everything or nothing."],
    v: "Change only a documentation file and confirm the test job is skipped with a visible reason while required statuses still report; then change a source file and confirm the job runs.",
    dep: ["conditional-rules", "push-and-pr-triggers"]
  },
  "affected-target-selection": {
    s: "Uses the build graph to compute which targets a change can affect, so large repositories build and test only those and everything that depends on them.",
    d: "Given the changed files, a tool maps them to build targets, then walks reverse dependencies to find every target that could change behavior. The result is a list passed to the build and test jobs, or used to generate a dynamic pipeline. It needs an accurate, queryable graph of the whole repository. The difficulty is soundness: missed edges silently skip needed tests, while conservative graphs select nearly everything. Changes to build rules or global configuration must invalidate everything, which is easy to forget.",
    k: ["Precise selection versus run everything periodically: precise saves most compute and trusts the graph; a full periodic run catches missed dependencies later, after they have shipped.", "Compute from file diff versus from build-system queries: file diffs are simple and approximate; queries are exact and require the build tool to be fast."],
    p: ["Undeclared dependencies, such as a test reading a file at runtime, are invisible to the graph and never trigger.", "Selection computed against the wrong base after a rebase tests too little."],
    v: "Change a low-level library and confirm the selected set includes every transitive consumer, then change a leaf and confirm only its own targets run; compare to a full build on a sample to find any missed selection.",
    dep: ["path-filters", "dynamic-pipeline-generation"]
  },
  "scheduled-triggers": {
    s: "Starts runs on a calendar schedule, such as nightly full builds, long test suites and dependency audits, independent of any push.",
    d: "A scheduler evaluates cron-like expressions in a declared time zone and creates runs against a chosen branch with preset variables. Schedules are stored as settings, owned by a user or service identity whose permissions apply to the run. Nightly runs run costly suites that are too slow for every change. The difficulties are time and ownership: daylight-saving shifts skip or repeat times, a schedule owned by a departed user stops working, and schedules clustered at midnight create a thundering herd on shared capacity.",
    k: ["Fixed time versus after-idle triggers: fixed time is predictable and creates peaks; idle-based avoids contention and makes the run time vary.", "Schedule owned by a person versus a service identity: personal ownership gives a clear accountable owner, but breaks when they leave; a service identity is stable and needs its own governance."],
    p: ["A schedule left pointing at a deleted branch fails every night with nobody watching.", "Many schedules set for the same minute saturate the queue and delay developers' runs."],
    v: "Create a schedule one minute ahead and confirm a run starts within the minute on the right branch and identity, then confirm that a failure notifies the owning team rather than a person.",
    dep: ["metadata-database", "chat-and-email-notifications"]
  },
  "pipeline-chaining": {
    s: "Starts one pipeline from the completion of another, in the same repository or across repositories, passing data along, so a library change can build its consumers.",
    d: "A job in the upstream pipeline calls the API or a trigger keyword to create a downstream run, optionally waiting for it and mirroring its status. Variables and artifact references can be passed. Teams use chaining for multi-repository integration, for release pipelines and to keep one large definition manageable. It is hard because the dependency lives outside any single file: fan-out becomes hard to see, permissions across repositories must be explicit, and a loop between pipelines can run forever.",
    k: ["Wait for the downstream result versus fire and forget: waiting gives one honest status and holds a runner or slot; fire and forget is cheap and loses the connection between failure and cause.", "Trigger by explicit calls versus subscribe to events: explicit is traceable in the file; subscriptions decouple repositories and make the chain hard to read."],
    p: ["A cycle of pipelines triggering each other consumes the whole fleet until a depth limit stops it.", "Downstream runs under the upstream's token give a library repository rights over its consumers."],
    v: "Change a library, confirm the consumer's pipeline starts with a link to the upstream run, and the upstream status reflects the consumer's result; then create a loop and confirm a depth limit ends it with an error.",
    dep: ["control-plane-api", "job-token-permissions"]
  },
  "manual-and-api-triggers": {
    s: "Lets a person or script start a run with chosen parameters, or approve a held job, for releases, rebuilds and operations that must not run automatically.",
    d: "A manual run is created from the interface or API with a branch, variables and sometimes a chosen job. Manual jobs inside a pipeline wait until someone clicks play, subject to permission checks. Automation uses trigger tokens scoped to a project. These are the sanctioned way to run something dangerous or expensive on demand. The challenge is accountability and guardrails: who may supply which variables, whether a replay uses the old or new definition, and recording who started it for the audit trail.",
    k: ["Replay with original inputs versus fresh definition: replay reproduces a past result and may run stale or vulnerable steps; a fresh run uses current code and may not reproduce the problem.", "Free-form parameters versus a declared list with types: free-form is flexible and error-prone; declared parameters validate and document inputs."],
    p: ["A trigger token with broad scope stored in another system lets anything holding it start production jobs.", "Manual runs started by a person whose rights were later removed still carry the old identity's access."],
    v: "Start a run through the API with a declared parameter and confirm the run records the caller, the parameters and the revision, and that a caller without permission is refused and logged.",
    dep: ["control-plane-api", "access-control", "audit-log"]
  },
  "fork-contribution-policy": {
    s: "Decides what pipelines may do for changes from forks or unknown contributors: run nothing, run without secrets, or run fully after a maintainer approves.",
    d: "A change from a fork carries code written by someone outside the trust boundary. The policy picks a tier: do not run until approved, run with a read-only token and no secrets, or run fully. Many systems start two kinds of run: one on untrusted code without privileges, and a later privileged workflow triggered by the result. Mistakes here are the commonest route to secret theft, because a privileged job that checks out and executes the fork's code hands that code the secrets.",
    k: ["Approval before any run versus run unprivileged immediately: approval is safest and delays contributors; unprivileged runs give fast feedback and cannot test anything needing secrets.", "Split untrusted build and privileged follow-up versus a single job: splitting contains risk but needs safe handoff of results; one job is simple and dangerous."],
    p: ["A privileged follow-up job that executes artifacts from the fork's run gives the fork author the secrets.", "Approving a run once and not rechecking after the author pushes new commits lets a later malicious change through."],
    v: "Open a change from a fork that prints an environment variable named for a secret and confirm the run either waits for approval or prints nothing, and that new pushes require approval again.",
    dep: ["trust-tiers", "secret-scoping"]
  },
  "merge-queue": {
    s: "Serializes approved changes, testing each against the target plus the changes ahead of it, so the default branch stays green without every author rebasing by hand.",
    d: "When a change is approved it joins an ordered queue. The system builds a temporary branch of the target plus the changes ahead, runs required checks, and merges if they pass. It tests several entries in parallel speculatively, assuming those ahead will pass. If one fails, it is removed and those behind are rebuilt without it. This keeps main green at scale. It is hard because it multiplies CI load, depends on accurate required checks, and failures of unrelated flaky tests eject innocent changes.",
    k: ["Speculative parallel testing versus one at a time: speculation raises throughput and wastes work when something fails; serial testing is simple and limits merges per hour.", "Batching several changes into one test run versus individual runs: batching saves compute and requires bisection when it fails; individual runs isolate blame and cost more."],
    p: ["A flaky test failing in the queue ejects a good change and forces everything behind it to rebuild.", "Required checks configured only for the pull request context never run on the queue's temporary branch."],
    v: "Enqueue three approved changes, one of which breaks a test in combination with another, and confirm the breaking one is removed with a failing result while the others merge in order and the target is never red.",
    dep: ["merge-gates", "job-queue", "flaky-test-detection"]
  },
  "run-state-machine": {
    s: "The defined set of states a run and each job pass through, and the legal transitions between them, so every component agrees on what pending, running or failed means.",
    d: "Jobs move through created, waiting, queued, assigned, running and then a terminal state: succeeded, failed, cancelled, skipped or timed out. The run's state is derived from its jobs. Transitions are made by the scheduler and runners using compare-and-set updates so that two writers cannot disagree. Every transition publishes an event for status reporting, dashboards and notifications. It is hard because failures happen between states: a runner that vanishes leaves a job running forever unless a watchdog moves it to a terminal state.",
    k: ["Explicit state machine with guarded transitions versus ad hoc flags: guarded transitions prevent impossible states and need careful design of retries; flags are quick and breed contradictions.", "Derive run state from jobs versus store it separately: deriving avoids disagreement and costs recomputation; stored state is fast to read and can drift."],
    p: ["A terminal state being overwritten by a late runner update flips a failed job to success.", "No state for a job that is lost, rather than failed, makes infrastructure faults look like code failures."],
    v: "Kill a runner process mid-job and confirm the job moves to a terminal infrastructure-failure state within the timeout, emitting one event, and that a late report from the dead runner is rejected.",
    dep: ["metadata-database", "event-bus"]
  },
  "dag-resolver": {
    s: "Computes which jobs are ready to run by tracking dependencies as jobs finish, and decides what happens downstream of a failed or skipped job.",
    d: "At planning the resolver builds the graph, checks for cycles and records the rule for each edge, such as on success or always. After each terminal transition it re-evaluates dependents: those whose needs are all satisfied become ready, those with an unsatisfiable need are skipped. For large matrices this must be incremental rather than rescanning the graph. The subtlety is semantics under partial failure, allowed failures and manual jobs, where a downstream job might correctly run, wait for a person or be skipped.",
    k: ["Incremental readiness tracking versus rescan on every event: incremental scales to large graphs and is harder to make correct; rescanning is simple and slow.", "Treat allowed failure as success for dependents versus as failure: treating it as success keeps pipelines moving and hides problems; treating it as failure is strict and blocks on known-bad jobs."],
    p: ["A job waiting on a manual predecessor holds the run open indefinitely with no timeout.", "Resolver and scheduler disagreeing on a job's state leads to a job that is both ready and not queued."],
    v: "Run a graph with a failed job, an allowed-failure job and a manual job and confirm each downstream job lands in the documented state, and the final run result matches the rules.",
    dep: ["stages-and-dependency-graph", "run-state-machine"]
  },
  "job-queue": {
    s: "The ordered store of jobs waiting for a runner, with their requirements, priority and age, from which runners or the scheduler take the next job.",
    d: "Ready jobs are placed in a durable queue, often in the metadata database or a dedicated broker, keyed by pool, labels and priority. A runner asks for work, or the scheduler pushes it, and the job is leased for a period with a heartbeat: if the lease expires the job returns to the queue. The queue must hold tens of thousands of entries and support filtering by capability. The difficulties are exactly-once-ish semantics, since a job must not run twice concurrently, and starvation of jobs with unusual requirements.",
    k: ["Pull by runners versus push by a scheduler: pull is simple, tolerates restarts and firewalls and spends polling; push is faster to match and needs to know each runner's address and state.", "Database table queue versus dedicated broker: a table gives transactional consistency with the run state and limits throughput; a broker scales and needs reconciliation with the database."],
    p: ["A lease timeout shorter than a runner's pause during garbage collection duplicates a running job.", "Jobs requiring rare labels sit unnoticed forever because no runner will ever match."],
    v: "Enqueue a job with a rare label and no matching runner and confirm it is shown as waiting with the reason and age; then start a matching runner and confirm it is leased once and runs once.",
    dep: ["metadata-database", "run-state-machine"]
  },
  "runner-matching": {
    s: "Pairs each queued job with a runner that meets its requirements for architecture, operating environment, hardware, labels and trust level.",
    d: "Jobs declare tags or requirements, such as a machine architecture, a GPU, a minimum memory or a network zone. Runners advertise capabilities and the pool they belong to. The matcher selects among runners that satisfy all requirements, prefers ones with warm caches or images, and obeys restrictions such as protected runners being usable only by protected branches. It is hard because matching is a constraint problem under load: strict tags cause starvation while loose ones place sensitive jobs on shared machines.",
    k: ["Free-form tags versus a typed capability model: tags are easy and typo-prone; typed capabilities catch errors and cost design effort.", "Prefer cache-warm runners versus first available: warm placement cuts job time and uneven load; first available spreads load and wastes cache."],
    p: ["A typo in a tag makes a job wait forever without any error.", "Untrusted jobs allowed on a runner that also serves protected branches can plant files read by later jobs."],
    v: "Submit one job requiring a GPU and one requiring protected status and confirm each is assigned only to a runner that satisfies the requirement, and a job with an unknown tag is flagged unschedulable.",
    dep: ["job-queue", "trust-tiers", "specialized-hardware-pools"]
  },
  "priority-and-fairness": {
    s: "Rules for who goes first when capacity is short: priority classes for critical work, and fair sharing so no project or user starves the rest.",
    d: "Queues apply priority, such as release jobs ahead of nightly ones, and a fairness policy between tenants, typically weighted fair queuing or per-project share limits. Aging raises the priority of old jobs. Interactive developer feedback is usually ranked above scheduled and low-value batch work. The challenge is policy: each team believes its work is urgent, and priorities that are free to set are all set to maximum. Preemption of running jobs is rarely allowed, so priority only affects the next free slot.",
    k: ["Strict priority versus weighted fair share: strict priority guarantees urgent work and can starve everything else; weighted share protects every tenant and delays emergencies.", "Priority set by users versus assigned by policy: user-set is flexible and inflated; policy-assigned is consistent and needs agreement."],
    p: ["Strict priority with no aging lets a steady stream of high-priority jobs starve a release job indefinitely.", "One team's matrix expansion floods the queue and doubles everyone else's wait."],
    v: "With capacity for four jobs, submit one hundred jobs from one project and five from another and confirm the second project's jobs start within a bounded wait rather than behind all one hundred.",
    dep: ["job-queue", "capacity-quotas"]
  },
  "concurrency-limits": {
    s: "Caps how many jobs or pipelines may run at once for a project, environment or resource, protecting shared systems and enforcing mutual exclusion for deployments.",
    d: "Limits can be per project, per runner pool, per named resource group or per environment. A group of concurrency one makes deployments to production run one at a time. When the limit is reached further jobs wait in the queue, or older runs are replaced by newer ones. The system must hold and release the lock reliably, including when a job crashes. It is hard because locks interact with cancellation and with retries, and waiting jobs hold their place in other ways, such as occupying a queue slot.",
    k: ["Queue behind the running job versus cancel the older one: queuing runs every deploy in order and delays newest; replacing shows only the latest and may skip an intermediate version.", "Limit per project versus per shared resource: per project is easy to apply; per resource protects what is really scarce, such as a test environment."],
    p: ["A lock not released when a runner dies blocks every later deployment until someone clears it.", "Cancelling a deployment mid-way releases the lock and leaves the environment half updated."],
    v: "Start two deployments to one environment at once and confirm the second waits, runs only after the first reaches a terminal state, and that killing the first releases the lock within the watchdog timeout.",
    dep: ["job-queue", "timeouts-and-watchdog"]
  },
  "superseded-run-cancellation": {
    s: "Automatically cancels runs made obsolete by a newer push to the same branch or change, so capacity goes to the revision that matters.",
    d: "When a new run starts for the same branch or change request, the scheduler marks earlier non-terminal runs as superseded and cancels their jobs, stopping running ones through the runner. Deployments and runs that publish artifacts are usually exempt. It saves large amounts of compute on busy repositories. The difficulty is cancelling safely: a job in the middle of a release step should finish, and a newer run that is itself failing should not cancel a good older result needed for a merge.",
    k: ["Auto-cancel on new push versus let everything finish: cancelling saves compute and discards partial results someone might want; finishing is wasteful and gives complete data.", "Interruptible versus uninterruptible jobs: marking deploys as uninterruptible protects consistency and needs authors to label them correctly."],
    p: ["Cancelling the older pipeline that had already passed leaves no result if the newer one is red.", "A cancelled job that never receives the stop signal keeps running and consuming a runner."],
    v: "Push twice quickly to one branch and confirm the first run's running jobs receive a stop signal and end cancelled, the second proceeds, and a deployment job in the first run is left to finish.",
    dep: ["run-state-machine", "runner-agent"]
  },
  "retry-policy": {
    s: "Rules for automatically rerunning failed jobs, separating infrastructure failures that are safe to retry from code failures that should be reported.",
    d: "A job can declare a retry count and the conditions it applies to, such as runner system failure, script timeout or specific exit codes. The scheduler creates a new attempt, keeps all attempts linked and reports the outcome of the final one with history. Retrying infrastructure faults hides platform flakiness from developers, which is useful and dangerous. The hard question is safety: retrying a non-idempotent step, such as a publish, can duplicate it, and blanket retries convert genuinely flaky tests into permanent noise.",
    k: ["Retry only infrastructure failures versus retry test failures too: infrastructure retries remove irrelevant noise; test retries hide flakiness and hurt trust in green results.", "Automatic retries versus a manual retry button: automatic keeps flow and masks problems; manual forces a decision and costs a person's attention."],
    p: ["Retrying a publish step after a timeout that actually succeeded creates a duplicate release.", "Unlimited retries on a broken runner image consume capacity while the platform problem goes unnoticed."],
    v: "Kill the runner under a job with retry enabled for infrastructure failure and confirm a second attempt runs, both attempts are visible in history with reasons, and a script failure in the same job is not retried.",
    dep: ["run-state-machine", "failure-and-retry-semantics"]
  },
  "timeouts-and-watchdog": {
    s: "Limits on how long a job may wait or run, and a supervisor that detects dead runners, so nothing stays in a running state forever.",
    d: "Each job has a maximum duration, enforced by the runner and independently by the control plane, which also tracks heartbeats from each assigned runner. When a heartbeat is missed for a period, the watchdog marks the job as failed for infrastructure reasons, frees any lock and requeues if policy allows. There are also queue-wait timeouts and whole-run limits. It is hard to choose values: too short kills legitimately long builds, too long hides hangs and burns money, and clocks and network partitions make dead and slow look the same.",
    k: ["Control-plane enforcement versus runner-side only: control-plane enforcement works when the runner is dead; runner-side is precise and fails with the runner.", "Per-job timeout from author versus platform default: author-set fits each job and may be set to unlimited; a platform ceiling bounds cost and is eventually hit by a legitimate job."],
    p: ["A partition makes a healthy job look dead, so it is requeued and runs twice concurrently.", "The default timeout applied to a job waiting on a manual approval fails every release over a weekend."],
    v: "Block a job's network to the control plane and confirm it is declared lost after the heartbeat limit, requeued once, and that the original, when reconnected, is told to stop.",
    dep: ["run-state-machine", "runner-agent"]
  },
});
