// Details for the agent framework plate, part 5: error recovery, evaluation and tracing, budgets.
ATLAS.details("agent-framework", {
  "retry-policy": {
    s: "The rules for repeating a failed model or tool call: how many times, how long to wait, which errors qualify and what changes between attempts.",
    d: "A policy maps error classes to actions: retry with exponential backoff and jitter for rate limits and timeouts, retry with a changed input for malformed output, and never retry for permission or validation failures. Attempts are capped per call and per run, and each is traced. A shared policy keeps behavior consistent across components. The hard part is interaction: retries at the tool layer, loop layer and provider layer multiply, so one outage can produce dozens of calls.",
    k: ["Retries at one layer vs at every layer: one layer is predictable; retries at several layers recover more failures and multiply load during an outage.", "Retry identically vs retry with feedback: identical retries fix transient faults; feedback, such as the validation error, fixes model mistakes and costs more tokens."],
    p: ["Nested retries turn a one-minute outage into a flood of requests that extends it.", "A retry repeats a model call at full temperature and returns a different answer, so the second attempt contradicts earlier tool calls."],
    v: "Inject a transient failure for three calls, then recovery. Confirm the trace shows spaced attempts with jitter, success on the fourth, and total attempts across layers stay under the configured cap.",
    dep: ["error-classification","idempotency-keys"]
  },
  "error-classification": {
    s: "Sorts failures into classes such as transient, rate-limited, invalid input, permission denied, model error and tool bug, so each gets the right response.",
    d: "Raw errors from providers, tools and the framework are mapped to a small set of classes with a flag for whether the cause is retryable, whether the model should see it, and whether a person must be told. Classes drive retry, fallback and escalation decisions, and are reported in metrics. The difficulty is that real errors are inconsistent: the same condition appears as different codes and messages across providers, and a misclassified error turns a retryable fault into a hard failure or the reverse.",
    k: ["Classify by status code vs by message content: codes are stable and coarse; message matching is finer and breaks when wording changes.", "Show the model the error vs hide it: showing enables self-correction and can leak internals; hiding is safe and removes the model's chance to adapt."],
    p: ["A permission error is classed as transient and retried until the budget is gone.", "New provider error codes fall into an unknown class that defaults to fatal, and a harmless change ends runs."],
    v: "Feed a table of real captured errors from each provider and tool through the classifier and confirm each lands in the expected class, with unknown errors going to a visible default and a metric.",
    dep: ["provider-adapters"]
  },
  "fallback-models": {
    s: "Alternate models or providers used when the primary is down, rate-limited, too slow, or fails a quality check.",
    d: "A fallback chain lists substitutes in order. The gateway switches on specific failures, not on any error, and the trace records the switch. The substitute may need a different prompt format, tool-call dialect or context limit, so each is configured and tested. It improves availability and can lower cost. The difficulty is that a weaker model may quietly produce worse results at a critical step, and behavior differs enough that a run begun on one model may break when continued on another.",
    k: ["Switch mid-run vs only at run start: mid-run switching maximizes availability and risks inconsistent behavior; switching at start is consistent and fails runs that begin during an outage.", "Equivalent quality fallback vs degraded but cheap fallback: equivalent models keep quality at higher cost; degraded fallbacks keep service up and need to be labeled to users."],
    p: ["The fallback's context limit is smaller, and a long history fails on switch.", "Fallback activates silently for weeks because of a misconfigured primary, and quality drops without anyone noticing."],
    v: "Block the primary model in a test and confirm runs complete on the fallback, the switch and reason appear in the trace and metrics, and a long-history run fits or is compacted for the smaller window.",
    dep: ["model-gateway","error-classification","provider-adapters"]
  },
  "tool-failure-handling": {
    s: "What the loop does when a tool call fails: report it to the model, retry, use an alternative, mark the step failed or stop the run.",
    d: "Failures are returned to the model as clear error results, including a hint at recovery when one exists, so it can fix arguments or choose another approach. The framework bounds how many consecutive failures are tolerated and escalates when the same call fails repeatedly. Partial success, such as three of five records written, must be reported exactly. The difficulty is that models often paper over failures, claiming success or moving on, so important failures need structural handling, not a request for honesty.",
    k: ["Let the model decide how to react vs framework-defined handling per tool: model decisions adapt to context and are inconsistent; framework handling is predictable for critical tools.", "Fail the whole run on any write failure vs continue with remaining steps: failing is safe and wasteful; continuing makes progress and may build on a broken base."],
    p: ["The tool returns an empty result on failure instead of an error, and the model treats it as no matches.", "The agent summarizes a partly failed batch as complete."],
    v: "Make one of five batch writes fail. Confirm the model receives an error naming the failed item, the plan marks it failed, and the final answer lists the failure.",
    dep: ["tool-call-dispatcher","error-classification","plan-progress-tracker"]
  },
  "loop-detection": {
    s: "Notices when an agent is repeating the same actions or making no progress, and intervenes before the budget is spent.",
    d: "Detectors look for identical tool calls with identical arguments, repeating cycles of calls, outputs that stop changing, long runs without new facts, and token use without state change. On detection the framework adds a corrective message, forces a replan, changes the model or tools, or stops and escalates. Thresholds are tuned per task. The difficulty is distinguishing a loop from legitimate polling or iterative refinement, and a false positive stops valid work.",
    k: ["Exact repetition detection vs progress measurement: exact matching has few false positives and misses near-repeats; measuring progress catches more and needs a definition of progress.", "Warn the model first vs stop immediately: a warning allows recovery and costs more turns; stopping saves money and loses work."],
    p: ["The agent varies one argument slightly each time, so exact repetition detection never triggers.", "A legitimate polling loop is cut off because it repeats the same status check."],
    v: "Script a model that repeats one failing call. Confirm a warning appears at the first threshold, a forced replan at the second, and a stop with escalation at the third, with each recorded in the trace.",
    dep: ["run-state","stop-conditions","replanning"]
  },
  "rollback-and-compensation": {
    s: "Undoes or counteracts the effects of earlier steps when a later step fails, by restoring state or running a compensating action.",
    d: "Where effects are reversible, the framework restores a snapshot of files or database state. Where they are not, a compensating action is registered with each step, such as deleting a created record or sending a correction, and run in reverse order on failure. External effects like sent messages cannot be undone and are recorded so a person can handle them. It is hard because few real actions have clean inverses and the agent may not know the full extent of what it changed.",
    k: ["Snapshot restore vs per-step compensation: snapshots are simple and cover only state the framework controls; compensation reaches external systems and must be written for each tool.", "Automatic rollback vs ask a person first: automatic undo limits damage quickly and can destroy partial work worth keeping; asking is slower and keeps judgment with a person."],
    p: ["A compensating action deletes a record that another run has since started using.", "Rollback covers the workspace but not the emails sent earlier in the same run."],
    v: "Run a three-step task whose third step fails. Confirm steps one and two are compensated in reverse order, final state equals the starting state, and an irreversible step is listed as not undone.",
    dep: ["workspace-filesystem","run-journal","idempotency-keys"]
  },
  "failed-run-triage": {
    s: "Collects failed and stuck runs, groups them by cause, and routes them to retry, a fix or a person with their evidence attached.",
    d: "Runs that ended in error, timeout, budget stop or escalation go to a queue with their trace, failure class and last state. Grouping by failure signature shows which problem hits most runs. Operators can retry from a checkpoint, edit and resume, or close. Findings feed evaluation datasets and prompt fixes. The difficulty is volume and attribution: many failures are model behavior rather than bugs, and without grouping each is investigated separately.",
    k: ["Automatic retry of failed runs vs manual review: automatic retry recovers transient failures at the risk of repeating a deterministic fault; manual review is accurate and slow.", "Group by error text vs by trace pattern: error text is easy to cluster and shallow; trace patterns find root causes and need more analysis."],
    p: ["Failed runs are only logged and nobody looks, so a regression runs for weeks.", "A retry from the start repeats side effects that the first attempt already completed."],
    v: "Fail a hundred test runs across three causes and confirm triage groups them into three clusters, links each to its trace, and offers resume from the last checkpoint.",
    dep: ["trace-capture","checkpoint-store","error-classification"]
  },
  "idempotency-keys": {
    s: "Unique identifiers sent with side-effecting calls so that a repeated request is recognized and has its effect only once.",
    d: "The framework derives a key from the run, step and call, stable across retries and resumes, and passes it to tools and services that support deduplication. The receiver stores the key with the result and returns the stored result on repeats. This makes retries and crash recovery safe. It requires cooperation from the receiving system. Where a service has no such support, the framework must check state first or avoid retrying. Key scope and lifetime need care to avoid both duplicates and false matches.",
    k: ["Key derived from call content vs generated per attempt: content-derived keys are stable and merge legitimately repeated identical actions; per-attempt keys are unique and defeat deduplication.", "Dedupe in the framework vs in the target service: framework dedupe works everywhere and cannot see the service's state; service dedupe is authoritative and not widely available."],
    p: ["The key includes a timestamp, so every retry looks like a new request.", "Two different legitimate actions with the same arguments share a key and the second is dropped."],
    v: "Send the same keyed write twice, including once after killing the worker mid-call. Confirm the target system holds exactly one effect and both calls return the same result.",
    dep: ["run-journal","tool-schemas"]
  },
  "trace-capture": {
    s: "Records every model call, tool call, decision and state change of a run, with inputs, outputs, timing and cost, for debugging and evaluation.",
    d: "Instrumentation in the loop, gateway and dispatcher emits spans with parent links to a collector, which stores them with the full prompt and response bodies, subject to redaction. Traces show what the model saw and why it acted as it did, which is otherwise unknowable. Sampling and retention are set by cost and privacy. The difficulty is volume and sensitivity: full prompts are large and often contain personal data, and dropping them removes the evidence needed when something goes wrong.",
    k: ["Record full payloads vs metadata only: full payloads allow replay and diagnosis and are large and sensitive; metadata is cheap and cannot explain a bad answer.", "Sample traces vs keep all: keeping all is complete for debugging rare failures; sampling controls cost and loses the one run that mattered."],
    p: ["Traces are written asynchronously and a crash loses the final spans, which describe the failure.", "Prompts with secrets are stored in plain text in a store with broad access."],
    v: "Run a task with two tool calls and confirm the trace holds every model call with exact prompt and response, each tool call with arguments and result, durations, token counts and cost, linked in one tree.",
    dep: ["span-model","sensitive-data-filter","run-journal"]
  },
  "span-model": {
    s: "The schema that structures a trace as nested timed spans with typed attributes for model calls, tools, retrievals, guardrails and agent handoffs.",
    d: "Each span has an id, parent, type, start and end, status and attributes specific to its type: model name and token counts for model calls, arguments and result for tools, query and hits for retrieval. A common schema lets different tools display and query traces and lets evaluation attach scores to spans. Following an open tracing convention helps integration with existing observability systems. The difficulty is deciding the right granularity and keeping attribute names stable once dashboards depend on them.",
    k: ["Agent-specific span types vs generic spans with attributes: typed spans make agent views and evals easy and need schema upkeep; generic spans fit existing tools and put structure in conventions.", "One trace per run vs per turn: per run shows the whole story and can become enormous; per turn is small and needs links to follow a run."],
    p: ["Parent links are lost across a handoff, and delegated work appears as an unrelated trace.", "Attribute names change between releases, breaking saved queries and alerts."],
    v: "Run a delegating task and confirm that the worker's spans are nested under the delegating call, every span has a type and status, and a query by tool name returns all of that tool's calls.",
    dep: []
  },
  "eval-datasets": {
    s: "Curated sets of tasks with expected outcomes or grading criteria, used to measure an agent's quality before and after changes.",
    d: "Examples come from real traces, written scenarios and known failures. Each has an input, initial state, and either a reference outcome, a programmatic check on the final state, or a rubric for a grader. The set is versioned and split by capability so results show what improved. Agents need state, not just text: an example may include a seeded workspace or mock services. The difficulty is coverage and drift: sets go stale as the product changes, and small sets give noisy scores.",
    k: ["Outcome checks on final state vs scoring the transcript: state checks are objective and need an environment per example; transcript scoring is easy and rewards plausible talk.", "Small curated set vs large sampled set: curated sets are meaningful and expensive to build; sampled sets are broad and less precise per case."],
    p: ["Examples copied from traces contain the answer in the input, so the score measures lookup, not skill.", "The set is used to tune the prompt and then to report quality, so the reported score is overfit."],
    v: "Run the same agent version on the set five times and confirm run-to-run variation is reported, each example's pass or fail traces to its checks, and a held-out part exists untouched by tuning.",
    dep: ["trace-capture","production-to-eval-pipeline"]
  },
  "offline-eval-runner": {
    s: "Executes the agent against an evaluation dataset in a controlled environment and records outcomes, scores, cost and latency per example.",
    d: "The runner provisions each example's environment, runs the agent with pinned model, prompt and tool versions, applies graders, and writes results with traces. Repeated runs per example measure variance. Mock or recorded services make runs repeatable and cheaper. Results are compared against a baseline. The difficulty is determinism and cost: model outputs vary, external services change, and a large set run many times is expensive, so runs must be parallel, resumable and budgeted.",
    k: ["Live services vs mocked or recorded ones: live runs reflect reality and vary and cost more; mocks are repeatable and drift from real behavior.", "One run per example vs several: one run is cheap and noisy; several quantify variance and multiply cost."],
    p: ["Examples share a workspace and one run's files affect the next.", "A result of improvement is reported from one run, and it disappears on repetition."],
    v: "Run the set twice on an unchanged agent and confirm per-example differences are within the reported variance, and a run killed midway resumes without repeating finished examples.",
    dep: ["eval-datasets","llm-judges","model-version-pinning","environment-images"]
  },
  "llm-judges": {
    s: "Models used to grade agent outputs or traces against a rubric when no exact check exists, with calibration against human labels.",
    d: "A judge receives the task, the output or trace and a rubric, and returns a score and reasons. Pairwise comparison and reference answers improve reliability. Judges are validated by comparing their scores to human judgments on a sample. They enable scaling evaluation to open-ended work. They carry known biases: preference for longer or more confident text, for their own model family's style, and for the first option shown. Judge prompts and models are versioned as part of the evaluation.",
    k: ["Rubric scoring vs pairwise comparison: rubric scores are absolute and drift; pairwise comparisons are more consistent and only rank candidates.", "Same model family as the agent vs a different one: the same family is convenient and favors its own style; a different family reduces self-preference and adds integration."],
    p: ["The judge never gets validated against people and its scores are trusted by default.", "Verbose answers score higher regardless of correctness."],
    v: "Grade two hundred outputs labeled by people and confirm the agreement rate against a target, check score shift when answer order is swapped, and confirm known-bad outputs receive low scores.",
    dep: ["generation-parameters","model-gateway"]
  },
  "regression-gates": {
    s: "Automatic checks in the release process that block a change to prompts, tools or models if evaluation scores drop beyond a threshold.",
    d: "A gate runs the evaluation set on the candidate, compares results with the current production baseline, and fails the change if any capability regresses beyond its allowed margin or if cost or latency rise too far. It covers prompt edits, tool changes, model upgrades and framework releases. Thresholds account for run-to-run variance. The difficulty is statistical: small sets with noisy scores produce false alarms and missed regressions, so gates need enough repetitions and per-capability limits.",
    k: ["Block on any drop vs on drops beyond a margin: any drop is strict and flags noise; a margin tolerates variance and lets small real regressions accumulate.", "Gate on aggregate score vs per-capability scores: aggregates are simple and hide a collapse in one area; per-capability gates catch it and are more often failed."],
    p: ["A model upgrade improves the average and breaks refusal behavior, which the aggregate score hides.", "Teams bypass a noisy gate routinely, so it no longer protects anything."],
    v: "Submit a prompt change that is deliberately worse on one capability and confirm the gate blocks it, naming the capability, the baseline score, the candidate score and the margin.",
    dep: ["offline-eval-runner","prompt-versioning","model-version-pinning"]
  },
  "online-monitoring": {
    s: "Continuous measurement of live runs: success rates, failure classes, latency, cost, guardrail hits and sampled quality scores, with alerts.",
    d: "Metrics are derived from traces and the run journal and shown on dashboards by agent version, tool and user segment. Alerts fire on shifts in failure rate, cost per run, loop detections or approval denials. A sample of live runs is scored by judges or reviewers. It finds problems that offline sets miss: new user behavior, tool changes and provider drift. The difficulty is defining success, since a run that finished without error can still have failed the user.",
    k: ["Technical metrics only vs also outcome signals such as user corrections: technical metrics are objective and easy; outcome signals reflect real quality and are sparse and ambiguous.", "Alert on thresholds vs on change from baseline: thresholds are simple and need constant tuning; baseline comparison adapts and lags on gradual drift."],
    p: ["Dashboards show completion rate, which stays high while answers become worse.", "Provider-side model changes alter behavior with no deployment on the team's side, and nothing alerts."],
    v: "Inject a tool outage and a prompt regression in a staging environment and confirm alerts fire within the target delay with the affected agent version and failure class identified.",
    dep: ["trace-capture","span-model","token-accounting"]
  },
  "trace-replay": {
    s: "Re-executes a recorded run from its trace, using recorded model and tool outputs or a changed component, to reproduce and diagnose behavior.",
    d: "Replay feeds recorded responses in place of live calls so the exact control flow reruns, or swaps one part, such as a new prompt or model, while keeping the recorded tool results. It can resume from any checkpoint. This turns a user's bad run into a repeatable test. The difficulty is that a changed component produces different calls the recording lacks, so replay diverges, and tool results recorded at one time may no longer be true.",
    k: ["Strict replay of recordings vs live re-execution: strict replay is exact and tests only the framework; live re-execution tests the whole system and cannot reproduce the original conditions.", "Replay from the start vs from a checkpoint: from the start proves the full path; from a checkpoint is fast and relies on the saved state being complete."],
    p: ["The replay uses current prompt versions instead of those recorded, and does not reproduce the original behavior.", "Recorded tool results include secrets that the replay environment now exposes to developers."],
    v: "Replay a recorded run in strict mode and confirm every model and tool call matches the recording and the final output is identical. Replay with a changed prompt and confirm the first divergence is reported.",
    dep: ["trace-capture","checkpoint-store","prompt-versioning"]
  },
  "production-to-eval-pipeline": {
    s: "Turns real failures and user corrections from live runs into evaluation examples, so the test set grows from actual use.",
    d: "Candidate runs are selected from escalations, thumbs-down feedback, edits by users, guardrail hits and judge-flagged traces. A person or process cleans each into an example: strips personal data, fixes the expected outcome, and captures the initial state. Approved examples enter the dataset with provenance. This closes the loop between production and development. The difficulty is privacy and labeling effort, and avoiding a set dominated by the loudest failure.",
    k: ["Sample failures only vs sample successes too: failures target known weaknesses and skew the set; successes keep it balanced and detect regressions in what works.", "Automatic conversion vs human-reviewed examples: automatic scales and adds noisy or leaky examples; review ensures quality and limits throughput."],
    p: ["Examples keep real customer data because the redaction step was skipped for speed.", "The set accumulates near-duplicates of one frequent failure and reports its fix as a broad improvement."],
    v: "Flag ten live failures and confirm each produces a reviewed example with redacted input, an expected outcome and a link to its source trace, and that duplicates are merged.",
    dep: ["trace-capture","sensitive-data-filter","eval-datasets","failed-run-triage"]
  },
  "token-accounting": {
    s: "Counts input, output and cached tokens per call, step and run, converts them to cost, and attributes them to users, agents and tools.",
    d: "The gateway records provider-reported usage on every call, and the loop aggregates across calls and child runs. Counts are priced by model and token class, including cached and reasoning tokens. Attribution lets teams see which agent or customer drives spend. Totals feed budgets, dashboards and billing. The difficulty is completeness: failed and retried calls still cost, streamed calls may report usage late or not at all if interrupted, and parallel workers must add up to the parent's total.",
    k: ["Use provider-reported usage vs count locally: reported usage matches the bill and arrives after the call; local counts are available before it and may differ slightly.", "Attribute per run only vs per step and tool: per run is simple; per step shows where the cost is and adds instrumentation."],
    p: ["Retried and cancelled calls are not counted, and the dashboard shows less than the invoice.", "Child agent costs are not rolled up, and a delegating run looks cheap."],
    v: "Run a task with two retries and one delegated worker, then compare the framework's total to the provider invoice for those calls. Confirm they agree within the pricing rounding.",
    dep: ["model-gateway","tokenizer-and-counting","trace-capture"]
  },
  "cost-budgets": {
    s: "Spending limits per call, run, user and period, checked before each model call and enforced by stopping or degrading the run.",
    d: "Limits are set in money or tokens at several levels and checked by the turn controller using accounting totals plus an estimate for the next call. Exceeding a soft limit may switch to a cheaper model or warn; a hard limit ends the run with a clear status. Child runs receive a slice of the parent's budget. Budgets make costs predictable for autonomous systems. The difficulty is that cost is known only after a call, so a single large call can overshoot, and ending a run midway can leave work half done.",
    k: ["Stop at the limit vs finish the current step first: stopping is exact and can leave inconsistent state; finishing the step overshoots slightly and ends cleanly.", "Per-run budgets vs per-user budgets: per-run budgets contain one runaway; per-user budgets control total spend and let one run starve the others."],
    p: ["Retries and parallel workers each check the budget separately and together exceed it.", "A budget stop returns a generic error, and users cannot tell whether to retry with more budget."],
    v: "Set a run budget below the cost of the task and confirm the run stops before exceeding it, reports a distinct budget status with the amount spent, and leaves state resumable.",
    dep: ["token-accounting","stop-conditions","run-state"]
  },
  "latency-budgets": {
    s: "Deadlines for a run and its steps, with decisions to parallelize, shorten or skip work so an answer arrives in time.",
    d: "A request carries a total deadline, which is divided among model calls and tools. The controller tracks remaining time, picks faster models or fewer retrieval results when time is short, runs independent calls in parallel, and streams partial results. At the deadline it returns the best available answer or a timeout status. Interactive uses need seconds, background runs need hours, so budgets are set per surface. The difficulty is that model latency varies widely and grows with output length.",
    k: ["Strict deadline vs best-effort with streaming: a strict deadline gives a predictable response and sometimes a partial answer; best-effort is complete and unpredictable for the user.", "Faster smaller model under time pressure vs always the best model: switching keeps response time and lowers quality for those requests; always the best has uniform quality and slow tails."],
    p: ["Deadlines are enforced on model calls but not tools, so a slow tool blows through the limit.", "Tail latency is measured by averages, and the slowest one percent of runs go unseen."],
    v: "Set a ten-second deadline with a tool that takes twelve seconds and confirm the run returns at about ten seconds with a labeled partial result, and the late tool call is cancelled.",
    dep: ["turn-controller","parallel-tool-execution","streaming-output"]
  },
  "model-routing": {
    s: "Chooses which model handles each call, using cheaper models for easy steps and stronger ones for hard steps, based on task, context and budget.",
    d: "Routing rules or a small classifier pick by step type (planning, extraction, summarizing), input size, required tool use and remaining budget. Easy, high-volume steps such as classification go to small fast models, and open-ended reasoning goes to larger ones. Routing can also escalate on failure. It can cut cost and latency greatly. The difficulty is that the cheap model's failure is often quiet, so routing needs evaluation per step type to show where downgrading is safe.",
    k: ["Static routing by step type vs dynamic by difficulty: static is predictable and easy to evaluate; dynamic uses stronger models only when needed and adds a classifier's errors.", "Escalate after a failure vs route up front: escalating saves cost when the cheap model usually works; routing up front avoids the wasted attempt for known-hard cases."],
    p: ["The router sends an extraction step to a small model whose output format drifts, and downstream parsing fails sometimes.", "Routing decisions are unlogged, and cost and quality changes cannot be traced to them."],
    v: "Evaluate each step type on both models and confirm the quality difference is within tolerance where routed down. Confirm the trace records the chosen model and the reason for every call.",
    dep: ["model-gateway","eval-datasets","cost-budgets"]
  },
  "prompt-caching": {
    s: "Reuses the computed state for an unchanged prompt prefix across calls, cutting cost and latency on repeated long contexts.",
    d: "Providers cache the processing of a prompt prefix and bill and answer faster when the next call starts with the same tokens. Frameworks exploit it by ordering context from stable to changing: system prompt, tools, early history, then newest turns, and by marking cache breakpoints. Because loops resend a growing prefix every turn, the savings are large. The difficulty is fragility: any change in the prefix, even a timestamp or a reordered tool list, misses the cache, and caches expire after short periods.",
    k: ["Stable ordered prefix vs per-turn tailored context: a stable prefix gets cache hits and less relevance tuning; tailored context is better per turn and loses the discount.", "Cache aggressively vs keep prompts fresh: caching cuts cost and keeps stale content in view; fresh prompts are accurate and expensive."],
    p: ["A current timestamp at the top of the system prompt invalidates the cache on every call.", "Tool definitions are reordered between calls, and the whole prefix misses."],
    v: "Run a multi-turn task and confirm from provider usage fields that the cached token share rises after the first turn, and that changing one early word drops it to zero.",
    dep: ["context-assembler","token-accounting","provider-adapters"]
  },
  "rate-limit-manager": {
    s: "Tracks provider quotas for requests and tokens and queues, delays or sheds calls so that many concurrent runs stay within them.",
    d: "A shared limiter keeps token buckets for each model and key, estimates a call's tokens before sending, and queues work by priority. It honors retry-after hints and spreads load over keys or regions. Interactive runs have priority over background ones. Without it, concurrent agents trip provider limits together and every run slows with retries. The difficulty is estimation and fairness: output length is unknown before the call, and one tenant's burst must not starve others.",
    k: ["Client-side limiter vs rely on provider errors: a client limiter avoids errors and needs accurate quota knowledge; relying on errors is simple and wastes calls and time.", "Priority queues vs first come first served: priorities protect interactive work and can starve background work; first come first served is fair and slow for users."],
    p: ["Each worker process has its own limiter, and together they exceed the shared quota.", "Token estimates ignore output, and a burst of long generations exhausts the quota."],
    v: "Launch more concurrent runs than the quota allows and confirm none receive rate-limit errors, interactive runs finish first, and queue wait time appears in each run's trace.",
    dep: ["model-gateway","token-accounting","retry-policy"]
  },
});
