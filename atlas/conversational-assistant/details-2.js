// Details for the conversational assistant plate, part 2: understanding and dialogue.
ATLAS.details("conversational-assistant", {
  "text-normalizer": {
    s: "Cleans and standardizes incoming text before analysis: case, whitespace, characters, abbreviations, spelled-out numbers and common typing errors.",
    d: "Normalization removes noise that would otherwise split identical meanings: repeated characters, stray markup, emoji variants, different Unicode forms of the same letter, and spoken forms such as 'twenty twenty six'. For voice transcripts it also restores punctuation and casing and converts spoken numbers and dates to digits. It must be conservative, because the original wording sometimes matters (a name's capitalization, a code with letters and digits), so the raw text is kept alongside the normalized form. It is hard because the right rules depend on language and channel, and aggressive cleanup can silently change meaning.",
    k: ["Normalize before every model versus let the model cope with raw text: normalization helps classic classifiers, while modern models handle noise but benefit from consistent spoken-number handling.", "Destructive versus parallel normalization: keeping raw and normalized text costs storage, but lets later stages recover what the person typed."],
    p: ["A product code such as 'a1b2' is lowercased or reformatted and no longer matches the catalog.", "Spoken 'two for one' is normalized into the digit sequence '241'."],
    v: "Feed a set of messy inputs including spoken numbers, repeated letters and mixed Unicode forms. Confirm the normalized output matches expected forms and the raw text is preserved unchanged.",
    dep: []
  },
  "language-detector": {
    s: "Identifies the language, and sometimes the script and dialect, of each message or call so the right models, content and voice are selected.",
    d: "A classifier scores the language of the text or audio, using the channel's locale setting and the person's profile as priors. Short messages and code-switching, where people mix languages in one sentence, are the hard cases. Detection decides which recognizer, understanding model, knowledge index and voice to use. The system must decide whether to switch mid-conversation on one foreign sentence or stay with the established language. Mistakes are visible immediately, because the assistant answers in a language the person did not choose.",
    k: ["Detect per message versus fix the language per session: per message handles bilingual users, but flips unpredictably on short or ambiguous text, while per session is stable but ignores real switches.", "Trust channel locale versus detect: locale is free and usually right, but phones and browsers are often set to a language the person does not actually use."],
    p: ["A one-word reply such as 'ok' or a name flips the conversation into another language.", "Mixed-language text is classified with low confidence and routed to fallback."],
    v: "Run labeled samples including very short messages and code-switched text through the detector. Confirm accuracy by length bucket, and confirm one foreign word inside a session does not change the session language.",
    dep: ["text-normalizer"]
  },
  "intent-classifier": {
    s: "Assigns each user message to one of a set of defined goals, with a confidence score, so the dialogue layer can start the matching flow.",
    d: "A trained model maps text, and often a little context, to intents such as check-balance or cancel-order, returning ranked candidates with scores. Intents form a taxonomy maintained by designers, which must have clear boundaries or the classes overlap. Out-of-scope messages need an explicit treatment, either a catch-all class or a score threshold. Some assistants replace this stage with a language model that chooses a flow or tool directly. The difficult part is taxonomy upkeep: new products add intents, old ones merge, and training data drifts away from how people actually phrase requests.",
    k: ["Closed intent set versus open model-chosen actions: a closed set is testable and predictable, while model-chosen actions cover more requests but are harder to bound and evaluate.", "Single intent per message versus multiple: multiple intents match real requests such as 'cancel and refund', but complicate state and ordering."],
    p: ["Intents overlap, so the same phrase is split between two classes and scores never clear the threshold.", "Out-of-scope questions are confidently misrouted to the nearest intent."],
    v: "Evaluate on a held-out set of real utterances including out-of-scope ones. Confirm per-intent precision and recall, and that out-of-scope examples fall below the routing threshold at the configured rate.",
    dep: ["text-normalizer", "confidence-calibration", "nlu-evaluation-sets"]
  },
  "entity-extractor": {
    s: "Finds the specific values in a message, such as dates, amounts, names, product identifiers and locations, and converts them to typed, normalized form.",
    d: "Extraction combines patterns for structured values (order numbers, emails), lookups against catalogs and gazetteers, trained sequence taggers and model-based extraction. Each result carries a type, a span, a normalized value ('next Friday' becomes a calendar date) and confidence. Resolution depends on context: the current date, the person's time zone, and prior turns. Extracted entities feed slot filling and tool arguments, so errors become wrong actions. It is hard because relative expressions, ambiguous names and values that look alike (a date versus an order number) need context to resolve.",
    k: ["Rules and lookups versus learned extraction: rules are exact and auditable for structured values, while learned extractors generalize to free-form phrases but make harder-to-explain errors.", "Extract eagerly from every message versus only when a slot is requested: eager extraction captures volunteered detail, but risks filling slots with irrelevant values."],
    p: ["'Next Friday' is resolved against the server's time zone rather than the person's, booking the wrong day.", "An order number is read as a phone number, so the lookup fails."],
    v: "Run utterances containing relative dates, amounts with currency and similar-looking identifiers. Confirm every value resolves to the expected typed value for a fixed reference date and time zone.",
    dep: ["text-normalizer", "coreference-resolver"]
  },
  "coreference-resolver": {
    s: "Works out what pronouns and shortened references such as 'it', 'the second one' or 'same as before' point to in the conversation so far.",
    d: "Follow-up turns rarely repeat names in full. The resolver keeps a short list of recently mentioned entities and displayed options, and matches references by type, recency and the options just offered. It handles ordinals over lists ('the second one'), elliptical questions ('and for tomorrow?') and corrections ('no, the blue one'). Some systems rely on the language model with full history to do this implicitly; others resolve explicitly against dialogue state. The risk is quiet error: a wrong referent produces a fluent, confident and mistaken action, so ambiguous references should trigger a clarifying question.",
    k: ["Explicit resolution against state versus implicit via the model: explicit is inspectable and testable, while implicit handles unusual phrasing but fails without any trace.", "Resolve to the most recent candidate versus ask when unsure: guessing is smoother, but asking is safer when the next step changes data."],
    p: ["'Cancel it' is resolved to the last item mentioned in an answer rather than the one the person was discussing.", "Displayed option order changes between turns and 'the first one' selects a different item."],
    v: "Present a numbered list, reply 'the second one', and confirm the selected item matches what the screen showed. Say 'cancel it' with two candidates in context and confirm the assistant asks which one.",
    dep: ["dialogue-state-tracker"]
  },
  "model-gateway": {
    s: "A single interface in front of one or more language models, handling routing, retries, timeouts, caching, quotas and provider changes so the assistant does not depend on one model.",
    d: "Components call the gateway with a task description and receive structured results. The gateway selects a model by task, language, cost and current health, applies timeouts, retries with backoff and failover, enforces per-tenant quotas, records token counts and cost, and can cache identical requests. It also applies version pinning, so a provider's silent model update cannot change behavior unannounced. Because every turn passes through it, it is where latency, spend and outages concentrate. The hard problem is that models differ in prompt format, limits and failure modes, so a plain swap rarely preserves behavior.",
    k: ["Route by task to specialized models versus use one model for everything: routing cuts cost and latency on easy turns, but needs evaluation per route and a classifier that can be wrong.", "Pin model versions versus follow the latest: pinning keeps behavior stable and testable, while following the latest gains improvements at the risk of unannounced regressions."],
    p: ["A provider outage with no failover model takes the whole assistant down, even for turns a smaller model could handle.", "Retries without a budget multiply load during a slowdown and make it worse."],
    v: "Disable the primary model in a test and confirm turns fail over to the secondary within the timeout, with the switch logged and the cost recorded per model for each turn.",
    dep: ["config-and-secrets", "cost-latency-monitoring", "autoscaling-concurrency"]
  },
  "prompt-assembler": {
    s: "Builds the instructions and context sent to a language model each turn: role, rules, tools, retrieved facts, history and the user's message, in a controlled order.",
    d: "Prompts are assembled from versioned parts: a system instruction with policies and persona, tool descriptions, retrieved passages, relevant profile and session facts, recent turns, and the new message. The assembler enforces size limits, orders content so important instructions are not lost, labels untrusted text clearly and fills variables such as the date. Each part is a template tracked in version control with tests. The difficulty is that small wording changes alter behavior unpredictably, that content from users or documents can contain instructions the model might follow, and that the budget for context is shared among all parts.",
    k: ["One large static prompt versus assembled parts: a static prompt is easy to read, while parts allow per-task prompts and targeted tests but need more machinery.", "Include all potentially relevant facts versus a minimal set: more context answers more questions but dilutes attention, raises cost and enlarges the injection surface."],
    p: ["Editing the shared system instruction for one flow changes behavior in unrelated flows nobody retested.", "Retrieved text is placed with the instructions, so a document line saying to ignore the rules is obeyed."],
    v: "Render the final prompt for a sample turn and inspect it: each part is present in order, untrusted text is delimited, token count is under the limit, and the stored template version matches the one deployed.",
    dep: ["context-window-manager", "tool-registry", "bot-versioning-release"]
  },
  "context-window-manager": {
    s: "Decides which parts of the conversation, memory and retrieved material fit into the model's limited input, and summarizes or drops the rest.",
    d: "Models read a bounded amount of text per call, and cost and latency grow with it. The manager reserves space for instructions, tool definitions and the reply, then fills the remainder by priority: current state, the latest turns, retrieved passages ranked by relevance and long-term facts. Older turns are summarized or dropped, and summaries are refreshed as the conversation grows. It must keep information that later steps depend on, such as confirmed slot values, even after the original turn is trimmed. The hard part is losing a detail silently: the model then behaves as if it was never said.",
    k: ["Summarize older turns versus drop them: summaries keep the gist across long conversations but can distort or omit facts, while dropping is lossless for what remains but forgets.", "Rely on structured state versus on transcript: state keeps essential facts reliable regardless of length, but only what designers anticipated is stored."],
    p: ["A summary drops the constraint the person gave early, so the assistant proposes options that violate it.", "Long tool outputs crowd out the conversation and the assistant loses the thread."],
    v: "Run a long conversation past the context limit with an early stated constraint. Confirm that the constraint is still honored in the final turn and that the prompt stayed under the limit throughout.",
    dep: ["dialogue-state-tracker", "conversation-history-store", "prompt-assembler"]
  },
  "confidence-calibration": {
    s: "Makes the scores reported by classifiers, recognizers and models mean something dependable, so thresholds for acting, confirming or falling back can be set rationally.",
    d: "Raw scores are often overconfident and differ between models, so a score of 0.8 from two components does not mean the same chance of being right. Calibration maps scores to observed accuracy using labeled data, per component and sometimes per language or channel, and combines signals such as recognition score, classification score and slot agreement into one decision. The dialogue policy then uses thresholds: act above one, confirm between, ask again or fall back below. Calibration must be redone when models, data or user populations change, which is the usual way it fails.",
    k: ["Calibrate each component separately versus one combined confidence: separate scores are easier to maintain, while a combined score captures interactions at the cost of more labeled data.", "Fixed global thresholds versus per-intent thresholds: global thresholds are simple, but risky intents such as payments need stricter ones than harmless lookups."],
    p: ["A model update shifts score distributions and the old threshold lets many wrong guesses through.", "Language models give fluent answers with no usable confidence value, so no threshold exists."],
    v: "Bin held-out predictions by score and confirm observed accuracy in each bin matches its score within tolerance, and that after a model change the check is rerun and thresholds are reset.",
    dep: ["nlu-evaluation-sets"]
  },
  "dialogue-state-tracker": {
    s: "Maintains the structured record of the conversation so far: the active goal, filled and missing slots, confirmed values, and what the assistant last asked.",
    d: "After each turn the tracker updates state from the understanding results: goal, slot values with their source and confidence, pending questions, flags such as verified identity, and results of tool calls. It handles corrections that overwrite values, negations, and values that were offered but not yet accepted. State is stored per session and read by the policy, prompt assembler and response planner. Explicit state makes behavior inspectable and lets a conversation resume. The hard parts are deciding what to keep when the topic changes, resolving conflicting statements, and keeping state consistent when two messages arrive close together.",
    k: ["Explicit structured state versus implicit state in the transcript: structured state is testable and survives long conversations, while implicit state needs no schema but cannot be audited or reliably resumed.", "Overwrite on correction versus keep history of values: overwriting is simple, while history supports 'go back to the first one' at the cost of larger state."],
    p: ["Two quick messages are processed concurrently and the later state overwrites the earlier one.", "Values proposed by the assistant are stored as if the person had confirmed them."],
    v: "Run a scripted conversation with a correction and a topic change. Dump state after every turn and confirm each value, its source and its confirmed flag match the expected table.",
    dep: ["session-state-store", "intent-classifier", "entity-extractor"]
  },
  "slot-filling": {
    s: "Collects the required details for a task one at a time, asking for what is missing, accepting several values in one message and validating each.",
    d: "Each task defines slots with types, validators and prompts. After every turn the system extracts values, checks them (a date in the future, a valid account), asks for the next missing one and skips anything already supplied. People often volunteer information out of order or change a value after supplying others, so slots can be filled, cleared and re-asked. Some slots depend on others, such as a seat class that determines a price. The difficulty is making this feel like conversation rather than a form: asking only what is needed, in a sensible order, and handling 'I don't know'.",
    k: ["Form-style prompts one slot at a time versus open collection: one at a time is clear and robust, while open collection is faster for experienced users but depends on extraction accuracy.", "Validate immediately versus at the end: immediate validation catches errors where the cause is obvious, but needs live lookups and can slow the exchange."],
    p: ["A volunteered value is ignored and the assistant asks again, which people read as not listening.", "Validation errors repeat the same message, so the person gets stuck in a loop."],
    v: "Supply three details in one sentence for a task with five slots and confirm only two remaining questions are asked. Give an invalid value and confirm a specific explanation and a different re-prompt.",
    dep: ["entity-extractor", "dialogue-state-tracker", "argument-validation"]
  },
  "disambiguation-prompts": {
    s: "Questions that resolve unclear requests, offering a short list of likely meanings instead of guessing or failing when the assistant is not sure what was meant.",
    d: "When classification scores are close, an entity matches several records, or a reference is ambiguous, the assistant asks a targeted question that names the candidates. Good prompts offer two or three options plus an escape ('something else'), include enough detail to tell choices apart, and accept natural answers. The policy decides when to ask using calibrated confidence and the cost of being wrong. Too many clarifications annoy; too few produce wrong actions. For voice, the list must be short and spoken clearly, because people cannot scan it.",
    k: ["Ask the person versus pick the most likely: asking is safer when an action is hard to undo, while picking is smoother for harmless lookups.", "Open clarification question versus enumerated choices: choices are easy to answer and parse, while open questions invite unexpected replies but sound more natural."],
    p: ["The assistant asks about a distinction the person does not understand, such as internal product names.", "Options are listed with the escape missing, trapping people whose need is not among them."],
    v: "Send an ambiguous request with two matching records. Confirm the assistant lists both distinguishably with an 'other' option, and that selecting each leads to the correct record.",
    dep: ["confidence-calibration", "dialogue-policy", "coreference-resolver"]
  },
  "dialogue-policy": {
    s: "The component that chooses the assistant's next move given the state: ask, answer, act, confirm, hand off or end, using rules, learned models or a language model.",
    d: "Inputs are dialogue state, understanding results with confidence, tool outcomes and business rules; the output is a next action for the response planner. Rule-based policies are explicit flow charts. Learned policies map state to actions from examples. Model-driven policies let a language model choose between answering and calling tools, bounded by allowed actions and checks. The policy also enforces ordering rules: verify identity before showing account data, confirm before irreversible steps. It is hard to keep behavior predictable while allowing flexibility, and to see why a particular move was chosen after the fact.",
    k: ["Scripted flows versus model-chosen actions: scripted flows are predictable and auditable, while model choice handles unforeseen requests but needs guardrails and heavier evaluation.", "Hybrid with a model inside bounded flows versus a pure model loop: hybrids keep critical steps deterministic, but demand clear boundaries between the two."],
    p: ["The model skips a required verification step because the person sounded confident.", "A policy that cannot explain its choice makes failures impossible to debug."],
    v: "Replay a recorded conversation and confirm each policy decision is logged with its inputs and rule or reason. Try to request account data without verification and confirm the policy forces verification first.",
    dep: ["dialogue-state-tracker", "flow-definitions", "policy-guardrails"]
  },
  "flow-definitions": {
    s: "Authored descriptions of multi-step tasks: the steps, conditions, required slots, tool calls and exits, edited by designers and executed by the policy.",
    d: "A flow is a graph or list of steps: collect details, check eligibility, call a system, confirm, report the result. Authors define it in a visual editor or text format, with conditions, loops, sub-flows and error branches. Flows are versioned, tested and deployable independently, and they separate business process from language, so a changed policy does not require retraining. Large flow sets get tangled: duplicated steps, dead branches and inconsistent wording. Interaction between flows, such as starting a new task halfway through another, is where most defects hide.",
    k: ["Visual editor versus text definitions in version control: visual tools open authoring to designers, while text works with review, diffing and testing but needs engineering skills.", "Many small flows versus few large ones: small flows are reusable and testable, but increase the number of transitions to reason about."],
    p: ["A flow is changed to fix one case and its sub-flow, shared by five others, breaks all of them.", "Branches nobody tested hold dead ends where the person can only leave by abandoning the chat."],
    v: "Generate every path through a flow automatically and run each as a scripted conversation. Confirm every path reaches an exit, no step is unreachable, and each error branch produces a response.",
    dep: ["slot-filling", "tool-registry", "bot-versioning-release"]
  },
  "confirmation-and-repair": {
    s: "Checking understanding before consequential steps and recovering gracefully when the person says the assistant got it wrong or did not hear.",
    d: "Confirmation restates what the assistant will do, 'Cancel the order for two lamps, correct?', with explicit or implicit styles depending on risk. Repair handles 'no', 'that's not what I meant', 'say that again' and silence, offering to repeat, rephrase, change one value or start over. It uses confidence to decide whether to confirm at all. In voice, repair must be tolerant of recognition errors, and spelling out names or digits one group at a time is common. The hard part is calibrating friction: confirm too often and the assistant is tedious, too rarely and mistakes execute.",
    k: ["Explicit confirmation versus implicit: explicit is clearest for payments and deletions, while implicit ('Booking your flight for Friday...') is faster but lets small errors pass if the person does not object.", "Restart from the beginning versus repair one slot: repairing one slot respects effort already spent, but requires state that tracks each value's origin."],
    p: ["The confirmation message omits the one value that was misrecognized, so the person confirms an error.", "Repeating the same prompt after a failure makes a retry loop."],
    v: "Inject a recognition error into one slot of a booking. Confirm the confirmation text shows that slot, the person's 'no, the date' changes only the date, and a second identical failure uses a different strategy.",
    dep: ["dialogue-state-tracker", "confidence-calibration", "action-confirmation-gate"]
  },
  "topic-stack": {
    s: "Tracks nested and interrupted tasks so the assistant can answer a side question, then return to the original task without losing its place.",
    d: "People change subject mid-task: asking about fees while booking, or starting a second request. The assistant pushes the new topic on a stack, suspends the current flow with its state, handles the digression, and offers to resume. It must decide whether a message belongs to the current task, starts a new one, or abandons the old one. Some digressions, like 'cancel', terminate the whole stack. Resumption must restore slot values and context cleanly. Boundaries are the problem: if topics blur, the assistant applies a value to the wrong task or resumes a task the person had dropped.",
    k: ["Stack of suspended tasks versus single active task: a stack handles natural digressions, but needs timeouts so abandoned tasks do not resurface hours later.", "Resume automatically versus ask first: automatic resume is smooth, while asking avoids resuming something the person no longer wants."],
    p: ["A suspended task is resumed days later with outdated values and prices.", "A short reply such as 'yes' is applied to the digression's question rather than the paused one."],
    v: "Start a booking, ask an unrelated question, then answer it and say 'continue'. Confirm the booking resumes with prior values intact. Wait past the timeout and confirm the suspended task expires.",
    dep: ["dialogue-state-tracker", "flow-definitions", "session-state-store"]
  },
  "fallback-handler": {
    s: "What the assistant does when it cannot understand, cannot help or hits an error: reprompt, offer choices, narrow the scope, hand off or end politely.",
    d: "Fallback triggers on low confidence, out-of-scope requests, repeated failures, tool errors and guardrail refusals. Good fallbacks vary by cause and by attempt count: the first retry rephrases, the second offers examples or menu choices, the third offers a human or another channel. They record the failed utterance for later analysis. It matters because the fallback is the experience people remember. A single generic 'sorry, I didn't understand' repeated is the best-known failure of assistants, and it hides every bug behind the same message.",
    k: ["Generic fallback versus cause-specific responses: cause-specific responses help the person recover but require every failure path to carry a reason.", "Escalate after a fixed number of failures versus after frustration signals: fixed counts are simple, while sentiment signals respond earlier but can misfire."],
    p: ["The fallback repeats identically on each failure and the person abandons the conversation.", "Fallback failures are not logged with the utterance, so the team never learns what people were asking."],
    v: "Send three consecutive unintelligible messages. Confirm three different responses, the third offering a human, and that each failing utterance appears in the failure log with its cause.",
    dep: ["dialogue-policy", "handoff-triggers", "conversation-logging"]
  },
  "determinism-and-control": {
    s: "How much of the assistant's behavior is fixed by design versus generated by a model, and where that line is drawn for each task.",
    d: "Generated behavior is flexible and fluent, but varies from run to run and can be wrong in confident language. Scripted behavior is exact, testable and limited. Most assistants draw the line by risk: models understand and phrase, while rules and code decide anything involving money, identity, policy or irreversible change. Control mechanisms include structured outputs, allowed-action lists, validators on every tool argument, low sampling randomness, templates for regulated wording, and logging of every decision. The decision shapes testing, since scripted paths can be asserted exactly while generated paths need statistical evaluation.",
    k: ["Model decides, code verifies versus code decides, model phrases: the first reaches more requests, while the second guarantees the outcome and is easier to certify at the cost of coverage.", "Zero randomness versus sampling: fixed output makes tests reproducible, while some variation avoids robotic repetition in conversation."],
    p: ["A model-generated promise such as a refund the policy does not allow is delivered as if it were commitment.", "Teams assume low sampling randomness makes output identical, but model updates still change it."],
    v: "Run the same fifty requests twenty times each. Confirm tool calls and policy decisions are identical every time on scripted paths, and measure the variation on generated paths against the agreed bound.",
    dep: ["dialogue-policy", "argument-validation", "output-filters", "model-graded-evaluation"]
  },
  "conversation-state-ownership": {
    s: "The decision about which component owns each piece of conversation state, where it is stored and who may change it, so servers, channels and humans stay consistent.",
    d: "State appears in many places: dialogue slots, model context, channel session, tool results, memory and the agent's view after handoff. Without a single owner, they diverge. A common design gives the orchestrator authority over session state, with other components reading snapshots and proposing updates through events. State needs a version so late or duplicated messages do not overwrite newer ones, a lifetime, and a defined behavior at handoff and resume. Stateless servers with an external store scale and recover better, at the cost of a read and write per turn and care about concurrent updates.",
    k: ["Stateless servers with an external store versus in-memory sessions: external storage survives restarts and scales out, while memory is faster but loses conversations on failure or requires sticky routing.", "One shared state object versus per-component state: shared state is simple to reason about, while per-component state limits coupling but needs reconciliation."],
    p: ["Two replicas hold different versions of one session after a failover and answer inconsistently.", "A person's earlier answer is lost because it lived only in the model's context, not in state."],
    v: "Kill the server mid-conversation and send the next message. Confirm another instance continues with the same slots and history. Send two messages concurrently and confirm the version check keeps both updates.",
    dep: ["session-state-store", "turn-orchestrator", "dialogue-state-tracker"]
  }
});
