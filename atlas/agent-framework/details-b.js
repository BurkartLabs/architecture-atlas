// Details for the agent framework plate, part 2: multi-agent coordination, the loop, prompts and context.
ATLAS.details("agent-framework", {
  "agent-roles": {
    s: "Named agent configurations, each with its own instructions, tools, model and permissions, so that different jobs get narrow, specialized workers.",
    d: "A role bundles a system prompt, a tool subset, a model choice, limits and an output contract. Splitting work by role keeps each prompt short, each tool list small and each permission set minimal. Roles are defined as data so they can be versioned and tested alone. The difficulty is that role boundaries are conventions the model may ignore: a reviewer role told not to edit still edits if the edit tool is in its list, so real separation must come from the tool and permission layer.",
    k: ["Many narrow roles vs one general agent: narrow roles are cheaper, safer and easier to evaluate, but add handoffs and coordination failures; one generalist has a simpler flow and a crowded prompt.", "Role boundaries enforced by prompt vs by tool access: prompts are free to write but advisory; tool access is enforced but needs per-role configuration."],
    p: ["Role prompts duplicate shared rules and drift apart as each is edited separately.", "A role is given a tool for convenience that breaks its intended separation, such as a reviewer with write access."],
    v: "Attempt a forbidden action in each role, such as a reviewer writing a file, and confirm the tool layer refuses it regardless of what the prompt says.",
    dep: ["system-prompt","tool-allowlists","model-gateway"]
  },
  "delegation-and-handoff": {
    s: "Transfers part of a task, or control of a conversation, from one agent to another along with the context the receiver needs.",
    d: "Delegation hands a subtask to a worker and waits for its result; handoff transfers ownership of the conversation, so the receiver talks to the user from then on. Each carries a message, selected context and sometimes constraints or a budget. The receiver runs its own loop and returns a result or an error. The hard part is context: passing everything wastes tokens and leaks information, while passing too little forces the receiver to guess or ask again.",
    k: ["Pass full history vs pass a brief: full history is complete but expensive and may expose data the receiver should not see; a brief is cheap but loses details.", "Delegation as a tool call vs a separate framework mechanism: a tool call reuses the loop and traces, while a dedicated mechanism can enforce budgets and permissions at the boundary."],
    p: ["A worker is given a vague instruction and returns a polished answer to a different question.", "Handoffs chain between agents with each assuming another owns the next step, and the user's request goes unanswered."],
    v: "Delegate a subtask with a stated budget and confirm the trace shows the exact context passed, the worker's own spans nested under the delegating call, and the budget enforced.",
    dep: ["agent-roles","agent-messaging","context-assembler","cost-budgets"]
  },
  "orchestrator-worker": {
    s: "A pattern in which one coordinating agent plans and dispatches subtasks to worker agents, then combines what they return.",
    d: "The orchestrator decomposes the goal, starts workers with limited instructions and tools, tracks their status and decides what to do with their results, including retrying or reassigning. Workers are usually stateless between tasks and run in parallel. This keeps the orchestrator's context small, since it sees summaries, not worker transcripts. The difficulty is that the orchestrator becomes the bottleneck and the single point of misunderstanding: a wrong decomposition produces confident parallel waste.",
    k: ["Dynamic orchestrator vs fixed dispatch: a model orchestrator adapts to the task but spends tokens and can misdirect; fixed dispatch is cheaper and predictable but handles only anticipated tasks.", "Workers return summaries vs full outputs: summaries keep the orchestrator's context small, but lose detail it might need to judge quality."],
    p: ["Workers each spawn further workers, and fan-out multiplies cost without any limit.", "The orchestrator accepts a worker's claim of success without checking, and passes bad intermediate results downstream."],
    v: "Dispatch five workers on a task and confirm the trace shows each with its own budget and result, the orchestrator's context contains summaries only, and total spend stays under the parent limit.",
    dep: ["delegation-and-handoff","result-aggregation","task-decomposition","cost-budgets"]
  },
  "shared-workspace": {
    s: "A common store of files, notes or structured records that several agents read and write, so they can coordinate without passing everything in messages.",
    d: "The workspace may be a filesystem, a document store or a key-value board. Agents post findings, claim tasks and read each other's artifacts. This cuts message volume and gives a durable record of intermediate work. It also creates shared mutable state: concurrent writes conflict, readers see half-finished work, and one agent's mistake becomes another's input. Access rules per role and versioning of entries are what keep it usable.",
    k: ["Shared mutable workspace vs message passing only: a workspace avoids copying large artifacts and survives restarts, but needs concurrency control; messages are isolated and simple but heavy.", "Versioned append-only entries vs overwrite in place: append-only preserves history and avoids lost updates, at the cost of more storage and reading the latest version."],
    p: ["Two agents edit the same file and the later write silently erases the earlier one.", "An agent reads a note that was written by another agent from untrusted web content and treats it as an instruction."],
    v: "Have two agents write to the same record at once and confirm both writes survive as versions, or that one gets a conflict error, with no silent loss.",
    dep: ["workspace-filesystem","run-locking","permission-model"]
  },
  "agent-messaging": {
    s: "The channel agents use to send each other typed messages: requests, results, questions and status, with delivery and ordering rules.",
    d: "Messages carry a sender, recipient, correlation id, type and payload, and travel over in-process calls, a queue or a network protocol. The framework logs every message so traces show who told whom what. Typed message schemas, not free text, let receivers validate input. Hard problems are the usual distributed ones plus a new one: a receiver that is a language model may misread, ignore or be manipulated by message content, so messages from other agents need the same suspicion as user input.",
    k: ["Synchronous request-reply vs asynchronous queue: request-reply is simple to reason about but blocks the caller; queues decouple and allow retries but need correlation and timeouts.", "Free-text messages vs typed schemas: free text is flexible between agents; schemas are checkable and traceable but cost design effort per interaction."],
    p: ["A message is retried after a timeout and processed twice because the receiver has no idempotency check.", "Agent output is trusted as instructions by the next agent, so one injected string spreads through the group."],
    v: "Send a message to an agent that is down and confirm it is queued, delivered once on recovery with the same correlation id, and appears in the trace of both sides.",
    dep: ["idempotency-keys","trust-boundaries","run-journal"]
  },
  "result-aggregation": {
    s: "Combines outputs from several workers into one result, resolving duplicates, disagreements and gaps before it is used or shown.",
    d: "Aggregation can be concatenation, a merge by key, a vote across redundant attempts, or a synthesis step in which a model reads all results and writes one answer. Workers return structured results with confidence and evidence where possible so the merge is mechanical. A failed or missing worker needs a rule: wait, proceed without it, or fail. The difficulty is that a synthesis model tends to smooth over disagreement, hiding that two workers contradicted each other.",
    k: ["Mechanical merge vs model synthesis: merging by key is exact and cheap but only works on structured results; synthesis handles prose but can drop conflicts.", "Wait for all workers vs proceed on a quorum: waiting is complete but one slow worker delays everything; a quorum is fast but ignores late, possibly important, results."],
    p: ["Redundant workers agree because they share the same flawed source, and the vote creates false confidence.", "A failed worker's error text is merged in as if it were a result."],
    v: "Inject a contradiction between two workers and confirm the final result either flags the disagreement or resolves it by a stated rule, and cites which worker supplied each claim.",
    dep: ["structured-output-parser","orchestrator-worker","llm-judges"]
  },
  "agent-loop": {
    s: "The central cycle that builds a prompt, calls the model, executes the tool calls it returns, appends the results, and repeats until it should stop.",
    d: "Each iteration assembles context, makes one model call, and inspects the response. If the response requests tool calls, the dispatcher runs them and their results become new messages; if it contains a final answer, the loop ends. Everything else is wrapped around this: checkpoints after each turn, budget checks before each call, guardrails on both sides. It looks trivial, and the difficulty is all in the edges: malformed calls, partial failures, runaway repetition, interruption and resumption at any point.",
    k: ["Model-driven loop vs code-driven control flow: letting the model choose the next action is flexible but unbounded; code-driven flow is predictable but cannot adapt.", "One tool call per turn vs several: single calls are simpler to trace and approve; several cut round trips but need independence checks."],
    p: ["A tool result is appended to the transcript but the checkpoint is written before it, so a resume repeats the call.", "The loop has no turn limit and a confused model alternates between two tools indefinitely."],
    v: "Run a task needing three tool calls and verify the trace shows exactly four model calls, three tool executions with matching ids, a checkpoint per turn, and a clean terminal event.",
    dep: ["context-assembler","model-gateway","tool-call-dispatcher","stop-conditions","checkpoint-store"]
  },
  "turn-controller": {
    s: "The code inside the loop that decides, before each model call, whether the run may continue and with what settings.",
    d: "Before each turn it checks budgets, deadlines, cancellation, pending approvals and the turn counter, then selects model, temperature and available tools for that turn. After the call it routes the response: tool calls to the dispatcher, a final answer to completion, malformed output to repair. It is where policy is applied to the loop. Concentrating these checks in one place makes them testable. The hazard is that checks scattered across components get skipped on some code path.",
    k: ["Central controller vs checks spread through components: central is auditable and consistent, but grows into a large special-case function; scattered checks are local but easy to omit.", "Per-turn tool set changes vs a fixed set: restricting tools by phase improves safety and focus, but it invalidates prompt caches and confuses the model if it expects a tool."],
    p: ["A new code path, such as resume from checkpoint, skips the budget check and runs unlimited.", "The controller changes the available tools mid-run and the model keeps calling one it no longer has."],
    v: "Set a one-dollar budget and a task that would cost more. Confirm the controller stops the run before the first call that would exceed it and records which limit triggered.",
    dep: ["cost-budgets","latency-budgets","stop-conditions","model-routing"]
  },
  "stop-conditions": {
    s: "The rules that end a run: a final answer, a turn or time limit, a goal check, an explicit stop tool, an error, or a person's cancellation.",
    d: "Completion is detected from a response with no tool calls, a call to a dedicated finish tool carrying structured output, or a successful goal check. Limits end runs on turns, tokens, wall-clock time, cost or repeated identical actions. Each condition produces a distinct terminal status, so callers can tell success from timeout. The difficulty is that stopping early abandons work and stopping late burns money, and a model's own claim that it is done is the weakest signal.",
    k: ["Finish tool with structured result vs plain final message: a finish tool gives a parseable result and a clear signal, but the model may call it early; a plain message is natural and ambiguous.", "Hard limits vs soft warnings to the model: hard limits guarantee termination, while warnings let the agent wrap up gracefully but may be ignored."],
    p: ["A run hits the turn limit and reports success, because the terminal status was not distinguished.", "The limit is counted in model calls but the real cost driver is tokens, so runs stay under the limit and exceed the budget."],
    v: "Trigger each stop reason in a test run and confirm each ends with a distinct status code and message in the stored run record, and that only the genuine finish is labeled success.",
    dep: ["structured-output-parser","run-state","loop-detection"]
  },
  "tool-call-dispatcher": {
    s: "Takes the tool calls in a model response, validates and authorizes each, runs it, and returns paired results to the loop.",
    d: "For each requested call it looks up the tool, validates arguments against the schema, checks permissions and approval policy, executes it with timeout and limits, and captures the result or error. Results are matched to calls by id and returned in a consistent shape. Independent calls may run together. It is the choke point where the model's text becomes action, so every safety check should be enforced here, in code, not requested in the prompt.",
    k: ["Execute calls in the order given vs reorder for parallelism: order is simple and matches the model's intent; reordering saves time but can break hidden dependencies.", "Return errors to the model vs abort the run: returning lets the model correct itself, while aborting is safer for errors that indicate an attack or a fault."],
    p: ["An unknown tool name is silently ignored, and the model never learns its call did nothing.", "A tool throws an exception that is not caught, and the whole run fails instead of reporting an error result."],
    v: "Send a response with one valid call, one unknown tool and one invalid argument. Confirm each gets a matching result id, with two clear error messages and one execution.",
    dep: ["tool-registry","argument-validation","permission-model","approval-gates","tool-timeouts-and-retries"]
  },
  "parallel-tool-execution": {
    s: "Runs several independent tool calls from one model response at the same time to cut latency, then returns all results together.",
    d: "When a model requests multiple calls in one turn, the executor starts them concurrently under a concurrency limit and waits for all, or for those required. Results are returned in a stable order with their ids. It reduces wall-clock time for lookups and fetches. The difficulty is independence: the model may emit calls that depend on shared state or on each other's side effects, and writes to the same resource can race. Failures in one call must not discard the others.",
    k: ["Parallelize everything vs only tools marked read-only: all-parallel is fastest but risks races; read-only parallelism is safe by construction but leaves speed on the table for writes.", "Wait for all vs return on first failure: waiting gives complete information; failing fast saves time when one failure invalidates the rest."],
    p: ["Two parallel calls edit the same file and one result overwrites the other.", "A slow tool holds up the whole turn because no per-call timeout applies."],
    v: "Issue three calls of two seconds each and confirm the turn takes about two seconds, with all three results present, correctly matched, and a failed one reported without cancelling the others.",
    dep: ["tool-call-dispatcher","tool-timeouts-and-retries","resource-limits"]
  },
  "observation-formatting": {
    s: "Turns raw tool results and errors into the text the model reads on its next turn, with consistent structure, limits and labels.",
    d: "Raw results can be large, binary, nested or full of noise. The formatter selects fields, renders them compactly, marks the source and call id, truncates with a note, and writes errors so the model can act on them: what failed, why, and what to try. Consistent formatting helps the model parse results and lets the framework mark them as untrusted data. The difficulty is deciding what to leave out, since the omitted detail may be the one needed.",
    k: ["Terse summarized results vs full raw output: summaries save context and focus the model but may hide the key fact; raw output is complete and costly.", "Error text for the model vs error text for the developer: model-facing errors should say how to recover, while developer details belong in the trace, not the prompt."],
    p: ["A stack trace with file paths and internal names is fed back to the model and leaks into the user's answer.", "Truncation cuts a table in the middle, and the model reads the partial rows as the complete result."],
    v: "Return a ten-thousand-row result and confirm the model sees a bounded, labeled excerpt with a count of what was omitted, while the full result is retrievable from the trace.",
    dep: ["result-truncation","tool-call-dispatcher","prompt-injection-defense"]
  },
  "reflection-step": {
    s: "A pass in which the agent, or a second model, critiques its own draft or action history and decides whether to revise before finishing.",
    d: "After producing an answer or completing steps, a critique call reviews the work against the goal and criteria and returns specific issues. If it finds issues, the loop continues with that feedback in context, up to a limit. Reflection improves output where errors are visible in the text. It is weaker when the same model with the same blind spots judges its own work, and each round adds cost and latency with diminishing returns.",
    k: ["Self-critique by the same model vs a separate critic: self-critique is cheap and simple but shares blind spots; a separate critic with different instructions or a different model finds more but costs more.", "Fixed number of reflection rounds vs until the critic is satisfied: fixed rounds bound cost; open-ended rounds can reach better output or loop on stylistic nitpicks."],
    p: ["The critic approves everything, so the reflection step adds cost and no quality.", "Repeated critique rewrites a correct answer into a worse one by chasing vague feedback."],
    v: "Seed a draft with a factual error the critic can detect and confirm that the revised output fixes it, while a correct draft passes through unchanged after one critique.",
    dep: ["llm-judges","agent-loop","stop-conditions"]
  },
  "system-prompt": {
    s: "The standing instructions that define the agent's role, rules, tone, tools and output format, placed at the start of every model call.",
    d: "It states who the agent is, what it may and may not do, how to use tools, how to format answers, and how to handle uncertainty. It is assembled from fixed text plus per-run parts such as date, user name and enabled features. Because it is read first on every call, it dominates cost in short runs and is the main target for prompt caching. The difficulty is that instructions are advisory: models follow them statistically, so anything that must always hold needs enforcement in code.",
    k: ["One long detailed prompt vs a short prompt with tools and retrieval for detail: long prompts keep everything available but cost tokens each turn and dilute attention; short ones are cheap and need reliable retrieval.", "Rules as prose vs as examples: prose is compact and general; examples show the exact behavior but fix the model to their pattern."],
    p: ["Contradictory rules accumulate from successive fixes, and the model follows whichever it notices.", "Secrets or internal policies are placed in the prompt and then repeated to a user who asks."],
    v: "Run a fixed test set of requests against the prompt and confirm each required behavior, such as refusing a listed action or using a stated format, holds in every case, not a typical case.",
    dep: ["prompt-templates","prompt-versioning"]
  },
  "prompt-templates": {
    s: "Parameterized prompt text with named slots filled at run time, so wording is stored apart from code and variables are inserted consistently.",
    d: "A template defines static text and placeholders for user input, retrieved passages, tool lists and run settings, with rules for escaping and delimiting inserted content. Separating templates from code lets prompt authors iterate and lets the framework version, test and diff them. Rendering must keep untrusted text clearly delimited. The difficulty is that small wording or whitespace changes alter model behavior, and a missing variable can silently render as empty text and degrade answers without any error.",
    k: ["Templates as data files vs prompts built in code: files can be reviewed, versioned and edited without a release; code gives type checking and conditional logic.", "Strict rendering that fails on a missing variable vs lenient rendering: strict surfaces mistakes at once; lenient keeps running with a quietly broken prompt."],
    p: ["User text containing template syntax is expanded as a placeholder and injects content.", "A variable renders as the word null or an empty string and the model works with a broken instruction."],
    v: "Render every template with a representative and an empty input set and confirm no unfilled placeholder remains, and user content containing delimiter strings stays inside its delimited block.",
    dep: ["prompt-versioning"]
  },
  "context-assembler": {
    s: "Builds the exact message list for each model call from instructions, tool descriptions, history, memory and retrieved material, in a defined order and size.",
    d: "On every turn it collects parts from their sources, orders them (stable parts first for caching, recent turns last), enforces the window budget, and labels each part by origin and trust. It decides what to drop or compress when space runs out. It is the single place where the model's view is decided, so it is where context bugs originate: missing results, stale facts, duplicated history. Logging the assembled prompt in the trace is the only reliable way to debug a bad answer.",
    k: ["Assemble from scratch each turn vs append to a growing transcript: rebuilding allows pruning and refresh but breaks prefix caching; appending is cheap and cache friendly but only grows.", "Fixed section order vs relevance-ordered content: fixed order is predictable and cacheable, while relevance order places the best material where models attend most."],
    p: ["The assembled prompt differs from what the developer assumed and nobody can see it, so a failure is blamed on the model.", "Retrieved content is placed with the same authority as instructions, and a document can override the rules."],
    v: "Pick one turn from a stored trace and rebuild its prompt from stored inputs. Confirm the rebuilt text equals what was sent, token for token, and that each section is labeled with its source.",
    dep: ["system-prompt","history-compaction","memory-retrieval","tool-catalog-in-prompt","context-window-budgeting"]
  },
  "context-window-budgeting": {
    s: "Allocates the model's limited input tokens among instructions, history, retrieved material and room for the reply, and decides what yields when over budget.",
    d: "Each section gets a reserved or capped share, measured with the model's own tokenizer. When the total exceeds the limit, an eviction policy chooses what to shrink: old tool results first, then history summaries, then retrieved passages, never the system prompt or the latest turn. The output allowance is reserved first, since a full window leaves nothing for the answer. It is hard because token counts must be exact and the right allocation changes by task.",
    k: ["Fixed per-section shares vs dynamic allocation by need: fixed shares are predictable and easy to debug; dynamic use of space is efficient but makes behavior depend on what else is present.", "Evict oldest first vs lowest value first: oldest-first is simple, but may drop a key early instruction; value ranking keeps important content and needs a scoring method."],
    p: ["Counting characters instead of tokens leads to rare overflows that fail at the worst moment.", "Evicted tool results are not noted in the prompt, and the model refers to data it can no longer see."],
    v: "Fill the window to the limit with a long history and confirm the call succeeds, the reserved output space is intact, and the prompt records what was evicted.",
    dep: ["tokenizer-and-counting","history-compaction","generation-parameters"]
  },
  "history-compaction": {
    s: "Replaces older parts of the transcript with shorter summaries or extracted facts so long runs fit the context window without losing what matters.",
    d: "When history passes a threshold, a compaction step selects older turns and replaces them with a summary, keeping recent turns verbatim, along with the goal, plan state and key decisions. Tool results may be reduced to references the agent can reload. It makes multi-hour runs possible. It is lossy by nature: a summary written without knowing what will matter later can drop the exact detail needed, and repeated summarization of summaries compounds the loss.",
    k: ["Summarize old turns vs drop them with references to stored content: summaries preserve gist at a cost of one more model call; references are exact but need the agent to ask again.", "Compact at a fixed threshold vs when a task phase ends: thresholds are simple but cut mid-thought; phase boundaries are cleaner and need phase detection."],
    p: ["The summary omits a constraint the user stated early, and later steps violate it.", "Compaction happens just before a checkpoint, and resuming loads the shortened history while the journal still shows the full one, so the two disagree."],
    v: "Run a long task that states a constraint in the first message. After compaction, ask for an action the constraint forbids and confirm the agent still refuses it.",
    dep: ["conversation-store","working-memory","model-gateway"]
  },
  "tool-catalog-in-prompt": {
    s: "The descriptions and schemas of available tools as the model sees them, selected and worded for each turn.",
    d: "The model chooses tools from names, descriptions and parameter schemas it is shown, so these are prompt text and matter as much as instructions. The catalog may be filtered by role, task or retrieval when there are many tools, since long lists lower accuracy and cost tokens. Descriptions state what a tool does, when to use it, and what it returns. The difficulty is that overlapping or vague descriptions cause wrong tool choice, and the schema that validates arguments is not always the one that best explains them.",
    k: ["Show every tool vs retrieve a relevant subset: showing all is simple and consistent for caching; retrieval scales to hundreds of tools but can omit the right one.", "Detailed descriptions with examples vs terse ones: detail improves correct use and costs tokens on every turn; terse is cheap and invites misuse."],
    p: ["Two tools have near-identical descriptions and the model alternates between them unpredictably.", "A description claims a tool can do something it cannot, and the agent plans around the missing capability."],
    v: "For each tool, run requests that should and should not select it, and confirm selection accuracy per tool. Confirm the catalog the model saw is recorded in the trace.",
    dep: ["tool-registry","tool-schemas","context-window-budgeting"]
  },
  "prompt-versioning": {
    s: "Tracks each version of prompts, templates and tool descriptions so a given run can be tied to the text it used, compared and rolled back.",
    d: "Prompts are stored with version ids, change notes and the evaluation results they were released with. Each run records the versions it used. Rollout can be gradual, with a share of traffic on the new version. Because a one-word edit can change behavior across the whole system, prompts are treated as code: reviewed, tested against the evaluation set and deployed deliberately. The difficulty is that behavior depends on the prompt, the model version and the tool set together, so versions must be pinned as a set.",
    k: ["Prompts in the code repository vs in a managed registry: the repository gives review and atomic releases with code; a registry allows changes without deploying but separates prompt from the tests that cover it.", "Immutable versions vs editable drafts: immutability makes runs reproducible; editable drafts are faster to iterate and hide what actually ran."],
    p: ["A prompt is edited in production and the next day's regression has no version to point at.", "A prompt is promoted after testing on one model version, then the model is upgraded and behavior shifts."],
    v: "Pick any past run and retrieve the exact prompt, template and tool description versions it used from its record. Replay with them and confirm the inputs match the original.",
    dep: ["offline-eval-runner","model-version-pinning"]
  },
});
