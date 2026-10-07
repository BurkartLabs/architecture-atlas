// Details for the agent framework plate, part 1: surfaces, human oversight, planning.
ATLAS.details("agent-framework", {
  "chat-and-api-surface": {
    s: "The interface through which people or programs submit goals and receive progress: a chat window, a request-response API, or an event stream.",
    d: "A chat surface renders messages, tool activity and approval prompts to a person. An API surface accepts a goal plus options, returns a run identifier, and lets the caller poll or subscribe for results. Both translate their input into the same internal run request. The hard part is representing a long, partly autonomous run honestly: intermediate steps, pending approvals, partial results and failure all need a wire format that clients can render without guessing, and that stays compatible as the framework adds step types.",
    k: ["Synchronous request-response vs asynchronous run handle: synchronous is simple for short tasks but breaks on timeouts; a handle supports long runs but forces every client to implement polling or subscription.", "Rich typed event stream vs final text only: events let interfaces show progress and approvals, but they commit the framework to a public event schema that is expensive to change."],
    p: ["A client that only understands final answers hides a pending approval, so the run appears hung while it waits for a person.", "Event types added without versioning break older clients that crash on an unknown step type."],
    v: "Submit a goal that triggers a tool call and an approval. Confirm the client receives, in order, a run id, the tool-call event, the approval request, and a final result event, and renders each.",
    dep: ["session-manager","streaming-output","request-authentication"]
  },
  "event-and-schedule-triggers": {
    s: "Starts runs from outside events such as webhooks, queue messages, file arrivals and timers, rather than from a person typing a request.",
    d: "A trigger maps an external event to a run request: it extracts the goal and parameters from the payload, picks the agent configuration, and deduplicates repeated deliveries. Schedules fire runs at intervals. Triggered runs have no person watching, so they carry stricter permissions and budgets by default. The difficulty is that event sources deliver at least once and out of order, and the payload is often attacker-influenced text that becomes part of the prompt.",
    k: ["Event payload as the prompt vs payload as structured data in a fixed template: raw text is flexible but injectable; templated fields are safer but need a mapping per event type.", "Fire-and-forget vs wait for completion before acknowledging the event: acknowledging early loses events when the run fails; waiting ties up the source's delivery timeout."],
    p: ["Duplicate webhook deliveries start two runs that both perform the same side effect.", "A trigger granted the same permissions as an interactive user lets one crafted email cause actions nobody reviewed."],
    v: "Deliver the same event twice with the same delivery id and confirm exactly one run starts. Deliver an event whose text contains instructions and confirm the run's permissions did not change.",
    dep: ["request-authentication","session-manager","cost-budgets"]
  },
  "session-manager": {
    s: "Ties requests to a conversation or task identity, loading its history and settings at the start of each run and saving them when it pauses or ends.",
    d: "A session holds the transcript, user identity, selected agent configuration, granted permissions and links to long-term memory. On each new message it loads the session, takes a lock so two runs do not interleave, starts or resumes a run, and writes the result back. Sessions can be branched, expired or shared. It is hard because sessions grow without bound, concurrent messages arrive while a run is still working, and what counts as the same conversation differs by surface.",
    k: ["One run per session at a time vs concurrent runs on one session: serializing is simple and consistent, but queues a user's second message behind a long run.", "Server-held session state vs client-supplied history: server state is authoritative and smaller on the wire, while client state is stateless to scale but can be tampered with."],
    p: ["Two messages arriving together both load the same history, and the later write silently drops the other's turn.", "Sessions never expire, so storage and the amount of history sent to the model grow without limit."],
    v: "Send two messages to one session within the same second and confirm the saved transcript contains both turns in a defined order, with no lost update.",
    dep: ["conversation-store","run-locking","run-state"]
  },
  "request-authentication": {
    s: "Establishes which person or service is calling and which tenant, role and quotas apply, before any model call or tool runs on their behalf.",
    d: "Credentials arrive as tokens, session cookies or signed webhook payloads and are verified at the edge. The resulting identity is attached to the run and becomes the principal for permission checks, memory scoping and billing. A key design point is that tools act with the caller's authority, not the framework's, so the identity must travel with every tool call. Delegated and service-to-service cases need care so an agent cannot exceed the human who started it.",
    k: ["Tool calls as the end user vs as a service account: end-user identity respects existing access rules, but needs token delegation; a service account is easy but gives every user the agent's full reach.", "Verifying at the edge only vs re-verifying inside the framework: edge checks are cheap, but internal components can then be reached by anything inside the network."],
    p: ["A shared service credential lets a user read another tenant's data by asking the agent for it.", "A long run outlives its token, and tool calls start failing midway with authorization errors the model misreads as bad arguments."],
    v: "Run the same request as two users with different access, ask each for a document only one may read, and confirm the other receives a denial from the underlying tool, not a model refusal.",
    dep: ["permission-model","credential-broker"]
  },
  "streaming-output": {
    s: "Delivers model text, tool activity and status to the client incrementally as the run progresses, instead of waiting for the final answer.",
    d: "The model gateway emits token deltas, and the loop adds events for tool starts, tool results and state changes. A streaming layer merges them into one ordered stream, buffers for slow consumers, and ends with a terminal event. Partial structured output needs special handling because a half-complete JSON object is not parseable. Streaming makes agents feel responsive, but it exposes text before output guardrails have judged it, and it complicates cancellation.",
    k: ["Stream tokens immediately vs hold until the output filter passes: immediate streaming gives low perceived latency but may show content that is later retracted.", "Server-sent events vs bidirectional sockets: events are simpler and proxy-friendly, while sockets allow the client to interrupt on the same channel."],
    p: ["A client disconnect is not noticed, so the run keeps spending tokens for a viewer who left.", "Events from parallel tool calls arrive interleaved without ids, and the interface attaches results to the wrong call."],
    v: "Start a run with two parallel tool calls, drop the client mid-run, and confirm the server cancels or parks the run within its configured delay and logs which events were never delivered.",
    dep: ["model-gateway","agent-loop","output-guardrails"]
  },
  "approval-gates": {
    s: "Pauses a run before a risky action and waits for a person to approve, edit or reject it, then continues from exactly that point.",
    d: "A policy decides which tool calls need approval, by tool, arguments, cost or target. When one triggers, the loop saves state, records the pending call with a human-readable description, and stops without holding a process open. The approver's decision, possibly with edited arguments, is delivered back as an event that resumes the run. It is hard because the approval must show what will actually happen, not the model's description of it, and the world may change while waiting.",
    k: ["Approve each action vs approve a plan up front: per-action review is safe but fatiguing and gets rubber-stamped; plan approval is cheaper but covers steps the agent may later vary.", "Allow edits to the proposed call vs approve or reject only: editing is more useful, but needs re-validation of the changed arguments."],
    p: ["Approval prompts are shown so often that reviewers approve everything without reading, which is no control at all.", "The pending call is approved days later against changed data, and executes a stale decision."],
    v: "Trigger a call that needs approval and kill the worker. Confirm that approving later resumes the run on another worker, executes the call once with the approved arguments, and records the approver.",
    dep: ["permission-model","checkpoint-store","interrupt-and-resume","audit-log"]
  },
  "plan-review": {
    s: "Shows a proposed multi-step plan to a person before execution so they can correct the approach while it is still cheap to change.",
    d: "The agent produces a plan in a structured form with steps, tools it expects to use, and expected side effects. The interface renders it and lets the person reorder, delete or annotate steps, or reject it with feedback. The accepted plan is stored as the contract the run follows, and the progress tracker reports against it. The difficulty is that plans are written before the agent has seen what it will find, so they are often wrong in details, and a rigid plan blocks adaptation.",
    k: ["Binding plan vs advisory plan: binding gives predictability and a clear audit, but forces another review whenever the agent must deviate; advisory is flexible but weakens what the approval means.", "Review before any action vs review after a read-only exploration phase: exploring first gives better plans but runs tools before anyone has approved anything."],
    p: ["A plan reads well but names steps too vaguely for the reviewer to know what will change, so approval is meaningless.", "The agent silently departs from the approved plan and nothing flags the difference."],
    v: "Approve a plan, then provoke a situation where step three is impossible. Confirm the run stops or requests re-approval, and does not continue with an unapproved substitute.",
    dep: ["plan-representation","approval-gates","replanning"]
  },
  "interrupt-and-resume": {
    s: "Lets a person or another system halt a running agent at a safe point, change its instructions or state, and continue without losing progress.",
    d: "An interrupt is a signal checked between loop turns, not in the middle of a tool call. It saves a checkpoint and parks the run. Resume loads the checkpoint, optionally with an injected message, an edited state field or a changed plan, and continues. The same mechanism serves cancellation, approvals and human takeover. The hard part is the in-flight work: a tool call already sent to an external system cannot be recalled, so interrupts are cooperative and need a defined answer for partial effects.",
    k: ["Interrupt only between turns vs inside tool calls: between turns is clean and consistent, but a long tool call delays the stop; inside calls is prompt but leaves partial effects.", "Resume with the same state vs allow state editing: editing enables correction by a person, but can create states the loop never produces and cannot handle."],
    p: ["Cancellation kills the process while a payment call is in flight, and nobody knows whether it completed.", "An edited state breaks an invariant, such as a tool result missing for a recorded call, and the next model call is rejected."],
    v: "Interrupt a run during a long tool call, edit one state field, resume, and confirm the run finishes with the edit visible in its next prompt and no repeated side effects.",
    dep: ["checkpoint-store","run-state","turn-controller"]
  },
  "clarification-requests": {
    s: "Lets the agent ask a person a question when the goal is ambiguous or information is missing, instead of guessing and proceeding.",
    d: "Clarification is typically a special tool the model can call, whose result is the person's answer. Calling it pauses the run like an approval, with the question and any options stored. The framework decides when asking is allowed: unattended runs must not block forever, so they use a default, a timeout or escalation. The difficulty is calibration. A model that asks too often is useless, and one that never asks makes confident wrong assumptions.",
    k: ["Ask-a-person as a tool vs a loop-level state: a tool is simple and the model chooses when to ask, but cannot be enforced; a loop state lets the framework require questions at defined points.", "Block until answered vs proceed with a stated assumption: blocking is correct but stalls; assumptions keep moving but need to be shown and revisable."],
    p: ["An unattended run asks a question no one will see, and waits indefinitely while holding a lock.", "The question is vague, such as asking which one, and the answer cannot be mapped back to the pending decision."],
    v: "Give an ambiguous goal and confirm the run pauses with one specific question and options, resumes with the answer in context, and does not re-ask the same thing.",
    dep: ["interrupt-and-resume","tool-registry","escalation-to-a-person"]
  },
  "escalation-to-a-person": {
    s: "Transfers a stuck, risky or failed run to a human with the context needed to take over, instead of failing silently or retrying forever.",
    d: "Triggers include repeated failures, a guardrail block the agent cannot resolve, a low-confidence flag, a budget limit or an explicit user request. The framework packages the goal, the transcript, completed and pending steps, and the reason for escalation, and routes it to a queue or person. The person can finish the work, fix and resume the run, or close it. It is hard because the handoff is only useful if the human can see what the agent did and what state it left the world in.",
    k: ["Escalate early on any uncertainty vs only after exhausting recovery: early escalation is safe but floods people; late escalation wastes budget and may leave partial changes.", "Hand over the transcript vs a generated summary: a transcript is complete but long; a summary is quick to read but can omit the detail that matters."],
    p: ["Escalations go to a shared queue with no owner, and runs wait unseen for days.", "The summary states the task was completed because the agent believed it, while a tool had actually failed."],
    v: "Force a tool to fail permanently and confirm a human-visible escalation appears with the failing call, the error, completed steps and a link to resume the run.",
    dep: ["failed-run-triage","run-journal","interrupt-and-resume"]
  },
  "task-decomposition": {
    s: "Breaks a goal into smaller subtasks that can be attempted, checked and, where independent, run in parallel.",
    d: "Decomposition is done by a model call that proposes subtasks, by fixed rules for known task types, or implicitly as the model chooses its next action. A good split yields subtasks with clear inputs, outputs and completion checks. It matters because model reliability drops on long chains: each step compounds error, and decomposition is how verification points are inserted. It is hard because bad splits are plausible, and the right granularity depends on tool cost and context size.",
    k: ["Decompose up front vs on demand: up-front plans are reviewable and parallelizable but rest on assumptions; on-demand adapts to findings but has no overview and can wander.", "Fine-grained vs coarse subtasks: fine steps are easier to verify and retry, but multiply model calls and lose the shared context a larger step would keep."],
    p: ["Subtasks overlap, and two workers modify the same file or record in conflicting ways.", "A subtask is stated without its completion criterion, so the agent decides it is done after one plausible attempt."],
    v: "Give a goal with three independent parts and confirm the plan lists them with distinct outputs, runs them in parallel where allowed, and marks each complete only when its check passes.",
    dep: ["plan-representation","agent-loop","subgoal-verification"]
  },
  "plan-representation": {
    s: "The data structure that holds a plan: steps, order, dependencies, status and expected outputs, in a form the loop, the interface and the tracker all share.",
    d: "Plans are stored as an ordered list, a dependency graph or a tree, with each step carrying an id, description, assigned tools or agent, status, result reference and retry count. Keeping the plan as structured state, not free text in the prompt, lets code check progress, render it, edit it and replan around finished work. The prompt shows the model a compact rendering. The challenge is keeping it consistent as the model changes the plan during execution.",
    k: ["Structured plan in state vs free-text plan in the transcript: structure lets code enforce and display it; free text is flexible but can drift from what was actually done.", "Linear list vs dependency graph: lists are easy for models to produce and read, while graphs express parallelism but are more often malformed."],
    p: ["The plan in state and the plan the model believes it is following diverge after several edits.", "Step ids are regenerated on each replan, breaking links from results and approvals to steps."],
    v: "Modify a plan mid-run and confirm that completed steps keep their ids and results, new steps get new ids, and the rendered view matches the stored structure exactly.",
    dep: ["run-state"]
  },
  "plan-progress-tracker": {
    s: "Maintains which plan steps are pending, running, done or failed, and tells the loop and the interface what remains.",
    d: "As the loop completes tool calls and subgoal checks, the tracker updates step status and links results. It tells the loop what to do next, tells the prompt what has been finished so the model does not redo it, and feeds progress display and stop conditions. In parallel plans it also records which steps are ready because their dependencies finished. The difficulty is that completion is judged by a model's claim unless an independent check is attached.",
    k: ["Model-reported completion vs externally verified completion: model reports are cheap and always available, but verified status is the only kind that can be trusted for stop decisions.", "Tracker in the prompt only vs tracker in durable state: prompt-only is simple but is lost on compaction or restart; durable state costs a storage write each step."],
    p: ["A step is marked done after a tool returned an error the model glossed over, and later steps build on nothing.", "After history compaction the summary drops the status list, and the agent restarts finished steps."],
    v: "Force a step's tool to fail and confirm the tracker marks it failed, not done, blocks dependents, and the next prompt shows that status explicitly.",
    dep: ["plan-representation","subgoal-verification","run-state"]
  },
  "replanning": {
    s: "Revises the remaining plan when results contradict its assumptions, a step fails, or the goal changes.",
    d: "A replan is triggered by a failed step, a verification mismatch, new user input or a loop-detection signal. The planner gets the original goal, what has been done and the new facts, and produces an updated plan for the remainder, ideally keeping completed work. Frameworks limit how many replans are allowed. The difficulty is knowing when to repair a step and when to abandon the approach, and avoiding cycles where each replan reintroduces the step that just failed.",
    k: ["Replan only on failure vs replan periodically: failure-only is cheap and stable, but misses slowly drifting plans; periodic replanning adapts better and spends tokens every time.", "Patch the plan vs regenerate it: patching preserves history and ids, while regeneration can fix structural errors but discards context."],
    p: ["The planner proposes the same failed approach again because failure reasons were not included in its input.", "Unbounded replanning consumes the budget while producing no actions."],
    v: "Make step two permanently impossible and confirm the run produces a different plan that includes a note about the failure, stops after the configured replan limit, and escalates.",
    dep: ["plan-representation","plan-progress-tracker","loop-detection"]
  },
  "subgoal-verification": {
    s: "Checks that a completed step actually achieved its stated outcome, using evidence other than the model's own claim.",
    d: "Verification runs a deterministic check where possible (a test passes, a record exists, a file has the expected shape), or asks a separate model or person to judge. It happens at step boundaries and again at the end. Failed checks feed back as observations or trigger retries and replans. It is the main defense against compounding errors in long runs. The difficulty is that many real outcomes have no cheap programmatic check, and model graders share blind spots with the agent they judge.",
    k: ["Deterministic checks vs model-graded checks: deterministic are reliable and cheap but need task-specific code; model grading applies anywhere but can be fooled by confident text.", "Verify every step vs only at milestones: every step catches errors early but adds latency and cost; milestones are cheaper but let errors build up."],
    p: ["The verifier only reads the agent's summary, so a wrong claim is confirmed by the same wrong claim.", "A strict check fails on harmless variation, and the agent loops fixing a non-problem."],
    v: "Introduce a deliberate silent failure, such as a write that did nothing, and confirm the verification step detects it from the system's actual state rather than from the agent's report.",
    dep: ["llm-judges","tool-registry","plan-progress-tracker"]
  },
  "fixed-workflow-graphs": {
    s: "A predefined graph of steps in which model calls, tool calls and conditions are wired by code, trading the model's freedom for predictability.",
    d: "Nodes are model calls, tool calls, code, or sub-agents, and edges are fixed or conditional on a node's structured output. Runs follow the graph with loops allowed under bounds. This suits tasks with known structure: it is easier to test, cheaper and more consistent than an open loop. The difficulty is that real inputs leave the graph's assumptions, and a rigid graph handles the unexpected case poorly, so many systems embed small open loops at selected nodes.",
    k: ["Fixed graph vs open agent loop: a graph is predictable, testable and cheap per run, but fails on inputs it was not designed for; an open loop adapts and is harder to bound.", "Graph definition in code vs in declarative data: code is flexible and type-checked, while data can be edited and visualized by non-programmers but needs its own validation."],
    p: ["A conditional edge relies on free-text model output and takes the wrong branch on a rephrased answer.", "Cycles in the graph lack iteration limits, so a retry edge loops forever."],
    v: "Run ten varied inputs through the graph and confirm each follows an expected path in its trace. Feed one out-of-scope input and confirm it exits through a defined fallback node.",
    dep: ["plan-representation","structured-output-parser","durable-execution"]
  },
  "intent-router": {
    s: "Classifies an incoming request and sends it to the specialized agent, workflow or model best suited to handle it.",
    d: "A router reads the request, and sometimes session context, and picks among known handlers using a small model, embedding similarity, rules or a combination. Routing keeps each handler's prompt short and its tool set narrow, which improves accuracy and reduces permissions. It adds a first hop whose mistakes are costly, since a misrouted request gets the wrong tools and instructions, and the user sees only a confident, wrong answer.",
    k: ["Model-based router vs rules or embeddings: a model handles novel phrasing but adds latency and nondeterminism; rules are fast and predictable but brittle.", "Hard routing to one handler vs soft routing with fallback: hard routing is simple, while fallback to a generalist reduces misroute cost but invites the generalist to be used for everything."],
    p: ["New handlers are added but the router's descriptions are not updated, so they never receive traffic.", "Follow-up messages are routed independently of the conversation and bounce between handlers."],
    v: "Run a labeled set of requests through the router and confirm accuracy against labels. Confirm low-confidence cases go to the fallback and that the choice is recorded in the trace.",
    dep: ["agent-roles","model-gateway","eval-datasets"]
  },
});
