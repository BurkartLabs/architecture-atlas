// Details for the agent framework plate, part 6: model access, state and checkpoints, cross-cutting concerns.
ATLAS.details("agent-framework", {
  "model-gateway": {
    s: "The single interface through which all model calls pass, adding routing, retries, usage accounting, logging and policy in one place.",
    d: "Every component calls the gateway with a provider-neutral request: messages, tools, parameters and metadata. The gateway picks the model, applies rate limits and fallbacks, translates the request through a provider adapter, streams the reply, records usage and trace data, and returns a normalized response. Centralizing calls gives one place to enforce budgets and redaction and to change providers. The risk is that the neutral format loses provider-specific features or becomes the lowest common denominator.",
    k: ["A thin pass-through vs a gateway that owns policy: pass-through is simple and spreads policy across callers; an owning gateway is consistent and becomes critical infrastructure.", "In-process library vs separate service: a library has no network hop and ties policy changes to application releases; a service centralizes control across applications and adds latency and a dependency."],
    p: ["Some code paths call the provider directly and bypass accounting, redaction and limits.", "The normalized response drops a provider field, such as a refusal reason, that callers needed."],
    v: "Search the codebase for direct provider calls and confirm none exist. Make one call and confirm usage, model version, latency, and policy decisions appear in a single trace record.",
    dep: ["provider-adapters","rate-limit-manager","token-accounting","trace-capture"]
  },
  "provider-adapters": {
    s: "Translators between the framework's neutral request and each model provider's wire format, tool-call dialect, streaming events and error codes.",
    d: "Each adapter maps messages, tool definitions and parameters to the provider's request, parses streaming deltas into a common event form, normalizes tool-call and finish reasons, and maps provider errors into the framework's classes. It also declares capabilities: maximum context, supported structured output features, image input and parallel tool calls. Differences are subtle, such as how tool results are placed or how system text is handled, and they change the behavior of the same prompt.",
    k: ["Own adapters vs a third-party compatibility layer: own adapters expose each provider's features and need upkeep; a compatibility layer is quick and lags new features and hides differences.", "Declared capabilities vs probing at runtime: declared capabilities are explicit and can be wrong; probing is accurate and costs calls."],
    p: ["A tool result is formatted differently by two adapters, and the same prompt behaves differently on each.", "The adapter ignores an unsupported parameter without warning, so the caller believes it applied."],
    v: "Run one conformance suite against every adapter covering tool calls, streaming, errors, truncation and parameters, and confirm identical normalized outputs for equivalent provider responses.",
    dep: ["generation-parameters","response-parser"]
  },
  "generation-parameters": {
    s: "Settings that shape each model call: temperature, sampling limits, maximum output tokens, stop sequences, reasoning effort and tool-choice mode.",
    d: "Parameters are set per agent, step and call. Low temperature favors consistency for extraction and tool use; higher values add variety for drafting. Maximum output tokens must leave room for tool calls and structured output, or answers are cut off mid-object. Tool-choice mode can require a tool, forbid tools or let the model decide. Reasoning effort trades quality for latency and cost. The difficulty is that providers differ in what they support, and low temperature does not make outputs deterministic.",
    k: ["Low temperature for all agent steps vs per-step tuning: uniform low values are consistent and can make planning repetitive; per-step tuning improves each step and needs evaluation.", "Higher reasoning effort by default vs on hard steps only: default high effort improves quality and raises cost and latency everywhere; selective effort needs a signal for difficulty."],
    p: ["A maximum token limit set too low truncates structured output, and downstream parsing fails intermittently.", "A forced tool-choice setting is left on after the first turn, so the agent can never produce a final answer."],
    v: "Call with the output limit set below the needed length and confirm the response reports a length stop reason that the framework treats as an error, not as a finished answer.",
    dep: []
  },
  "tokenizer-and-counting": {
    s: "Counts tokens exactly for a given model's vocabulary so prompts, budgets and truncation decisions match what the provider will measure.",
    d: "Each model family tokenizes text differently, so counts must use the right tokenizer or the provider's counting endpoint. The framework counts before sending to fit the window, to estimate cost, and to split or truncate text. Messages add structural overhead tokens and tool definitions count too. Images and files have their own cost formulas. The difficulty is drift: model changes alter tokenization, and approximate counts such as characters divided by four fail exactly where limits are tight.",
    k: ["Local tokenizer vs provider counting endpoint: local is fast and free and can lag a model update; the endpoint is exact and adds a call and latency.", "Safety margin on counts vs exact limits: a margin avoids rare overflow and wastes some window; exact limits use all space and fail on small miscounts."],
    p: ["Counts exclude tool definitions and message framing, and prompts overflow by a few hundred tokens.", "A different model family's tokenizer is used for an estimate, and code-heavy text is miscounted by a wide margin."],
    v: "Compare local counts to provider-reported usage for fifty varied prompts, including code and non-English text, and confirm the difference stays within the configured margin.",
    dep: ["model-version-pinning"]
  },
  "response-parser": {
    s: "Reads the model's reply into a normalized structure of text, tool calls, reasoning blocks, finish reason and usage.",
    d: "It consumes a complete or streamed reply and produces typed parts: text segments, tool calls with ids and parsed arguments, and metadata. It handles partial tool-call arguments during streaming, multiple calls in one reply, refusals and stop reasons such as length or content filter. The loop depends on this output being reliable. The difficulty is edge cases: truncated arguments, calls with invalid JSON, empty replies and text mixed with calls, each of which needs a defined action.",
    k: ["Parse streams incrementally vs wait for the full reply: incremental parsing shows progress sooner and handles partial states; waiting is simpler and slower.", "Reject malformed tool calls vs attempt to repair: rejecting returns a clear error to the model; repair saves a turn and risks wrong arguments."],
    p: ["A reply that stopped for length is parsed as complete, and a half-written tool call is executed.", "An empty reply is treated as a final answer and shown to the user as a blank."],
    v: "Feed recorded replies covering a normal call, parallel calls, truncated arguments, a refusal and an empty reply, and confirm each yields the expected parts and finish reason.",
    dep: ["provider-adapters"]
  },
  "model-version-pinning": {
    s: "Fixing the exact model version each agent uses, so that behavior changes only when someone changes it on purpose and tests the change.",
    d: "Configuration names a specific dated model version rather than a moving alias, and each trace records the version served. Upgrades go through the evaluation gate and a staged rollout. Providers retire versions on a schedule, so pins have an expiry that must be planned for. Pinning prevents surprise regressions from silent updates. The difficulty is the opposite risk: pinned versions are deprecated, leaving little time for migration, and prompts tuned to one version may degrade on its successor.",
    k: ["Pin exact versions vs follow an alias to the latest: pinning is stable and requires scheduled migrations; aliases improve automatically and change behavior without notice.", "Upgrade all agents together vs one at a time: together is simple and risks wide breakage; one at a time localizes problems and takes longer."],
    p: ["An alias is used in one agent's configuration, and its behavior changes after a provider update.", "A pinned version is retired with short notice and no evaluation has been run on its replacement."],
    v: "Check that every configured agent names an exact version, and that traces from the past week show only the pinned version for each. Run the gate on a candidate version and confirm results are stored with it.",
    dep: []
  },
  "run-state": {
    s: "The complete serializable record of where a run is: messages, plan, tool results, counters, pending approvals and variables.",
    d: "State is a typed structure that the loop reads and updates each turn. Because it is serializable, it can be saved, moved between workers, inspected and edited. It excludes live objects such as connections and open files, which are rebuilt on resume. A clear schema separates what the model sees from bookkeeping such as budgets and retry counts. The difficulty is discipline: state that accumulates in memory outside the structure is lost on crash, and a growing state is slow to save every turn.",
    k: ["One state object vs state split by owner: one object is simple to checkpoint and every component can corrupt it; split state limits access and needs coordinated saves.", "Store results inline vs by reference: inline is complete and bloats every checkpoint; references keep state small and need the referenced store to be consistent."],
    p: ["A component keeps a counter in a local variable, and it resets to zero after resume.", "The state holds a client object that cannot be serialized, and checkpointing fails only in production."],
    v: "Serialize state at every turn of a test run, reload each into a fresh process, and confirm the next turn behaves identically to the uninterrupted run.",
    dep: ["state-schema-migration"]
  },
  "checkpoint-store": {
    s: "Durable storage of run state snapshots, written at turn boundaries so a run can resume, fork, rewind or be inspected.",
    d: "After each turn, or at defined points, the loop writes the state with a version and a link to its predecessor. Resume loads the latest, fork copies an earlier one into a new run, and rewind selects a past one to continue from. Writes must be atomic with respect to side effects, or a crash leaves state saying a call has not happened when it has. Storage must handle size, retention and concurrent access. This component makes long runs, approvals and recovery possible at all.",
    k: ["Checkpoint every turn vs at selected boundaries: every turn minimizes lost work and costs storage and write latency; boundaries are cheap and lose more on crash.", "Full snapshots vs deltas: snapshots are simple to restore and large; deltas are compact and need replay or compaction to restore."],
    p: ["The checkpoint is written before the tool result is recorded, and a resume runs the tool again.", "Old checkpoints are never deleted and storage cost grows with every run."],
    v: "Kill the worker at random points across fifty runs and confirm each resumes from its latest checkpoint to a correct final result with no repeated side effect.",
    dep: ["run-state","durable-execution","idempotency-keys"]
  },
  "durable-execution": {
    s: "A runtime that persists each step's progress so a run survives crashes, restarts and long waits, resuming on any worker.",
    d: "The run is split into steps whose results are recorded; on restart the runtime replays the record and continues from the first unfinished step. Waiting for a person or a timer costs nothing, since no process holds the run. It provides retries, timers and exactly-once step semantics for the framework's own bookkeeping. The difficulty is determinism: code that is replayed must make the same decisions on replay, so the model call, time and random values must be recorded and fed back instead of recomputed.",
    k: ["Adopt a workflow engine vs build checkpointing into the loop: an engine gives timers, retries and visibility ready-made and imposes its programming model; in-loop checkpoints are lighter and cover less.", "Replay recorded results vs re-execute steps: replay is exact and requires deterministic orchestration code; re-execution is simple and repeats side effects."],
    p: ["Orchestration code reads the current time directly, and replay takes a different path from the original.", "A code change reorders steps while runs are in flight, and replay fails on their old records."],
    v: "Start a run that waits for approval, restart every worker, approve an hour later, and confirm the run continues without repeating its earlier model and tool calls.",
    dep: ["run-journal","checkpoint-store"]
  },
  "run-journal": {
    s: "An append-only log of every event in a run, in order: inputs, model responses, tool calls and results, decisions and state changes.",
    d: "The journal is the source of truth for what happened. State can be rebuilt by replaying it, traces and audit entries derive from it, and a durable runtime uses it to resume. Each event has a sequence number and a content reference. Writes occur before the effects they describe where possible. It differs from a trace in purpose: the journal must be complete and consistent enough to reconstruct state, while traces may be sampled. The difficulty is size and ordering across parallel branches.",
    k: ["Event-sourced journal as the primary store vs state snapshots with a log on the side: event sourcing gives exact history and rewind and needs replay logic; snapshots are simple and lose the path taken.", "Write before the effect vs after: before records intent and can leave unfinished entries to reconcile; after is accurate and loses events on a crash."],
    p: ["Events from parallel branches are written without a global order, and replays diverge.", "Large tool results are inlined, and the journal grows beyond what can be replayed quickly."],
    v: "Rebuild a run's final state by replaying only its journal into an empty state, and confirm it equals the stored state exactly, including pending approvals and counters.",
    dep: ["run-state"]
  },
  "state-schema-migration": {
    s: "Versioning of the saved state format and the conversion of old checkpoints so runs paused before an upgrade can resume after it.",
    d: "Each saved state carries a schema version. When the framework changes the state shape, a migration converts old versions to the new one on load, and tests cover each past version. Paused runs may wait days, so releases must stay compatible with whatever is in storage. The alternative is draining runs before deployment. The difficulty is that the model-visible parts matter as well: changing how history is rendered changes behavior on resume.",
    k: ["Migrate on load vs bulk migrate in storage: on-load is lazy and keeps old code paths alive; bulk migration is clean and needs a maintenance window and a plan for failures.", "Backward-compatible additions only vs free changes with migrations: additive changes need no migration and accumulate clutter; free changes are tidy and risk missing a version."],
    p: ["A field is renamed and old checkpoints load with a silent default, so a pending approval is lost.", "Migrations are tested only on the previous version, and older checkpoints fail after two releases."],
    v: "Keep a fixture checkpoint from every released schema version, load each with the current code, and confirm all resume to a correct final result.",
    dep: []
  },
  "run-locking": {
    s: "Ensures only one worker advances a given run at a time, and that duplicate triggers or resumes cannot run it twice.",
    d: "A lock or lease on the run id is taken before each turn, with expiry and renewal so a crashed worker's hold ends. A version counter on the state rejects stale writes. Resume requests arriving from approvals, timers and users are serialized. Without it, two workers execute the same tool calls and write conflicting state. The difficulty is leases: a worker paused by a long call may lose its lease and still act, so side effects need fencing tokens or idempotency.",
    k: ["Pessimistic lease vs optimistic version check: leases prevent duplicate work and need renewal and expiry handling; version checks are simple and discard work after the conflict.", "Short lease with renewal vs long lease: short leases recover fast from crashes and need reliable renewal; long leases are easy and delay recovery."],
    p: ["A worker stalls past its lease, a second worker takes over, and the first then completes its tool call as well.", "An approval and a timeout arrive together, and both resume the run."],
    v: "Resume the same run from two workers at once and confirm exactly one proceeds, the other is rejected or waits, and the final state has no duplicated turn.",
    dep: ["run-state","idempotency-keys"]
  },
  "level-of-autonomy": {
    s: "How much the agent may do without a person: from suggesting actions, to acting with approval, to acting alone within limits.",
    d: "Autonomy is a policy per task type and risk level, not a global setting. It determines which approval gates exist, which budgets apply, how long a run may go unattended, and what happens on uncertainty. More autonomy yields more value per person-hour and larger consequences for each error. It should rise with measured reliability on a specific task, backed by evaluation and the ability to undo. Setting it by enthusiasm instead of evidence is the usual mistake.",
    k: ["Autonomy by task risk vs one global mode: per-risk policy matches control to consequence and takes classification work; a global mode is simple and wrong for most tasks.", "Approve actions vs review outcomes afterward: approving before is safe and slow; reviewing after is fast and only suits actions that can be undone."],
    p: ["Autonomy is raised after a good week of demos, without evaluation on the tasks that raise it.", "Approval requirements are removed for speed, and an irreversible action later runs unreviewed."],
    v: "For each task type, check that the configured autonomy has a recorded evaluation result and a documented undo path, and that raising it requires a change reviewed against the evaluation gate.",
    dep: ["approval-gates","permission-model","regression-gates"]
  },
  "trust-boundaries": {
    s: "Where text and authority come from, and the rule that text from untrusted sources is data and never gains the authority to instruct.",
    d: "A model reads instructions and data in one stream, so the framework must track provenance outside the model: user messages, system rules, tool results, retrieved documents and other agents' output each carry a trust level. Capabilities should depend on that level, for example no outbound messages after reading a web page unless approved. The boundaries cross every layer: prompts, memory, retrieval, tools, multi-agent messages and sandboxes. They are drawn once, in design, and enforced in code.",
    k: ["Enforce boundaries by structure vs by prompt warnings: structural limits hold when the model is fooled; prompt warnings reduce the rate of failure and give no guarantee.", "One agent with all capabilities vs split agents by trust level: one agent is simple and exposes every capability to any injected text; splitting contains risk and adds coordination."],
    p: ["Memory written from a web page is later read back as if it were user instructions.", "Another agent's output is passed on as an instruction without label, and carries the originator's injected text."],
    v: "Trace a planted instruction from each untrusted source through the system and confirm that, in each case, the permitted actions were fixed before the content arrived and the attempt appears in the audit log.",
    dep: ["prompt-injection-defense","permission-model","context-assembler"]
  },
  "nondeterminism": {
    s: "The fact that the same input can produce different runs, which means testing, debugging and guarantees must be statistical and supported by recorded evidence.",
    d: "Sampling, provider-side changes, tool results that vary and concurrent ordering all make runs differ. Low temperature reduces and does not remove it. The consequences are everywhere: tests need repeated runs and thresholds, bugs need traces to reproduce, durable runtimes must record model outputs for replay, and retries may behave differently from the first attempt. Design for it instead of fighting it, by making steps idempotent, recording outcomes, and putting deterministic checks around model decisions.",
    k: ["Constrain variation with low temperature and fixed flows vs accept it and measure: constraining improves repeatability and may reduce quality and flexibility; measuring keeps flexibility and requires statistical evaluation.", "Record and replay outputs vs regenerate on resume: recording gives exact recovery and storage cost; regenerating is cheap and may take a different path than the original."],
    p: ["A test passes once and is treated as proof, then fails on the next run.", "A resume regenerates a model decision, and the new choice contradicts an action already taken."],
    v: "Run the same task twenty times and report the success rate with its spread, not a single outcome, and confirm each failure can be reproduced or inspected from its recorded trace.",
    dep: ["trace-replay","durable-execution","offline-eval-runner"]
  },
  "context-economy": {
    s: "The principle that the context window is the scarcest resource: everything shown to the model costs tokens, time and attention, and must earn its place.",
    d: "Every component competes for the window: instructions, tool descriptions, history, memory, retrieved text and tool outputs. Attention degrades as context grows, so more is not better. This drives design choices across the system: compact tool results, retrieval instead of preloading, subagents that return summaries, compaction, and keeping details by reference. It also decides cost and latency, since both grow with context. Treat each token added as a choice with an owner.",
    k: ["Load context up front vs fetch on demand: up front is simple and available and costs tokens on every turn; on demand is lean and requires the agent to know what to ask for.", "Isolate work in subagents vs one shared context: isolation keeps each context small and loses cross-task detail; one context is coherent and fills quickly."],
    p: ["Tool outputs are appended in full each turn until the useful instructions are far from the end and ignored.", "Each team adds its own section to the system prompt, and it grows until it is both costly and contradictory."],
    v: "Measure tokens by prompt section across a representative run and confirm every section is attributable to an owner and a measured benefit. Remove one and confirm the evaluation score does or does not change.",
    dep: ["context-window-budgeting","history-compaction","result-truncation"]
  },
  "cost-latency-quality": {
    s: "The three-way trade-off that sets model choice, loop depth, retrieval volume and verification effort for each task.",
    d: "Better answers usually come from larger models, more steps, more context and more checking, each of which raises cost and delay. Different tasks sit at different points: an interactive assistant weighs latency heavily, a background research task weighs quality, a high-volume classifier weighs cost. The framework should expose these as explicit settings, measure all three on the same evaluation, and route by task. Choosing without measurement leads to expensive defaults or cheap failures.",
    k: ["Optimize for one metric per surface vs a single global setting: per-surface tuning fits real needs and multiplies configurations; a global setting is simple and wrong for the extremes.", "Spend on verification vs on a stronger model: verification catches errors cheaply when checks exist; a stronger model helps when no good check exists."],
    p: ["A default of the strongest model everywhere makes costs unsustainable once usage grows.", "Cost is cut by a cheaper model without measuring quality, and users leave before the dashboard shows it."],
    v: "Plot cost, latency and quality for each configuration on the same evaluation set, and confirm the chosen settings per task type sit on the best frontier for its stated priority.",
    dep: ["model-routing","cost-budgets","latency-budgets","offline-eval-runner"]
  },
  "observability-by-default": {
    s: "The rule that every model call, tool call and decision is recorded from the first prototype, because a system whose reasoning is invisible cannot be debugged or trusted.",
    d: "Agent failures are rarely errors; they are plausible wrong choices, visible only in the exact prompt and response. So tracing is built into the gateway, loop and dispatcher, not added later, and the same records feed debugging, evaluation, cost accounting, audit and replay. This requires decisions made early about schema, redaction, retention and access, since adding them after launch means missing data for the failures that already happened.",
    k: ["Record everything with redaction vs record minimal metadata: full records enable diagnosis, evaluation and replay and need privacy controls; minimal records are cheaper and leave failures unexplained.", "Own trace format vs adopt an open convention: own format fits agent concepts precisely; an open convention plugs into existing monitoring and may fit agents imperfectly."],
    p: ["Tracing is added after launch, and the first serious incident has no data.", "Traces are available only to engineers, so product and safety reviewers cannot inspect the behavior they are responsible for."],
    v: "Pick a random live run from last week and reconstruct, from stored records alone, every prompt the model saw, every tool call and result, its cost, and the permission decisions made.",
    dep: ["trace-capture","span-model","audit-log","run-journal"]
  },
});
