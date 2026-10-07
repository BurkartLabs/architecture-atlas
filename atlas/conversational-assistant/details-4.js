// Details for the conversational assistant plate, part 4: handoff, safety and remaining cross-cutting concerns.
ATLAS.details("conversational-assistant", {
  "handoff-triggers": {
    s: "The rules and signals that decide when the assistant should stop and bring in a person: explicit requests, repeated failure, sensitive topics, high value or detected distress.",
    d: "Triggers combine explicit requests ('agent please'), counts of failed understanding, negative sentiment, topics designated for humans (complaints, bereavement, legal), account or transaction value, and loops in the flow. Each trigger has a priority and a response: offer, or transfer at once. They must be evaluated every turn, and consider whether humans are available, since offering a transfer to a closed queue is worse than continuing. Some regulated settings require a human on request. It is hard to tune: too eager and the assistant deflects nothing, too reluctant and people feel trapped.",
    k: ["Offer a human versus transfer immediately: offering keeps the person in control and avoids unnecessary transfers, while immediate transfer is right for distress and for explicit demands.", "Sentiment signals versus hard rules: signals catch frustration early but misfire on sarcasm and across cultures, while rules are predictable and miss unspoken anger."],
    p: ["The assistant refuses to transfer until three failures even though the person asked for an agent twice.", "Handoff is offered outside staffed hours and dead-ends in a voicemail."],
    v: "Trigger each condition in tests: an explicit request, three failures, a complaint topic and an angry message. Confirm the expected response for each, and that outside staffed hours the person is told when help is available.",
    dep: ["fallback-handler", "queue-routing"]
  },
  "queue-routing": {
    s: "Chooses which human team and agent receives the conversation, using skills, language, priority, availability and expected wait.",
    d: "The handoff carries attributes such as topic, language, customer tier and channel. The router matches them to queues and agents with the required skills and available capacity, estimates the wait, and may offer a callback or another channel when the wait is long. Text agents handle several conversations at once; voice agents handle one. Business hours, holidays and overflow to partner teams add rules. It is hard because capacity changes minute by minute, priorities conflict, and a transferred conversation that waits unseen is worse than the bot's answer was.",
    k: ["Skill-based routing versus first available agent: skill-based gives better resolution but longer waits and under-used agents, while first available is quick and wastes expertise.", "Show estimated wait versus not: showing it manages expectations, but wrong estimates anger people more than silence."],
    p: ["Priority customers wait behind a flood of low-value chats because priority was not passed along.", "The router sends a conversation in one language to an agent who does not speak it."],
    v: "Transfer a Spanish-language billing conversation from a priority customer. Confirm it lands in the right queue with priority applied, shows a wait estimate, and moves to overflow when no one is available.",
    dep: ["handoff-triggers", "context-transfer"]
  },
  "context-transfer": {
    s: "Passes the conversation's relevant history, identified customer, collected details and attempted actions to the human, so the person does not repeat themselves.",
    d: "The package includes a short summary, the full transcript, verified identity level, slot values, tool results, the reason for transfer and suggested next steps, rendered into the agent's workspace and ticket. A model-generated summary saves reading time but must be checked against facts. Sensitive data follows the agent's permissions rather than being shown wholesale. The same package returns to the assistant after the human finishes, if it resumes. It is hard to make useful: agents ignore long transcripts and distrust summaries that have been wrong, and what the bot knows is often not shown at all in the agent's tools.",
    k: ["Model-written summary versus raw transcript only: a summary is quick to read, but can omit or invent details, while a transcript is complete and slow.", "Structured fields versus free text: structured fields feed the ticketing system and routing, but cannot express everything the person said."],
    p: ["The agent asks for the account number the person already gave the bot.", "A summary states that a refund was issued when only a request was submitted."],
    v: "Hand off a conversation after identity verification and a failed refund attempt. Confirm the agent sees the verified customer, the attempt with its error, an accurate summary, and does not need to ask for anything already collected.",
    dep: ["conversation-history-store", "dialogue-state-tracker", "agent-workspace"]
  },
  "agent-workspace": {
    s: "The interface where human agents handle transferred conversations, with transcript, customer data, suggested replies, knowledge search and the tools to act.",
    d: "Agents see the conversation, context package, profile and the actions available, often the same tools the assistant uses but under the agent's own permissions. The assistant can help by drafting replies, retrieving knowledge, summarizing and filling forms for the agent to approve. Agents can handle several chats, use canned responses, add notes and set dispositions. It also records handling time and outcomes. It is hard because it integrates with several back-office systems, because suggestions must be accurate enough that agents trust them, and because it is the best source of corrections to the assistant.",
    k: ["Suggested replies the agent edits versus fully manual: suggestions speed handling and keep wording consistent, but agents can send unchecked errors, so approval stays human.", "Embedded in the existing support desk versus a dedicated tool: embedding fits existing habits and data, while dedicated tools give a better workflow but another system for agents."],
    p: ["Agents ignore suggestions after a few wrong ones and then the tool slows them down.", "Agent permissions are broader than the assistant's and a prompt-injected suggestion exposes data."],
    v: "Have an agent accept a transferred chat and use a suggested reply and a knowledge search. Confirm the sent message and the suggestion's source are recorded, and that disposition and notes flow back to analytics.",
    dep: ["context-transfer", "retrieval-index", "connector-layer"]
  },
  "warm-cold-transfer": {
    s: "The two ways of moving a person to a human: warm, where the agent is briefed and joins before the bot leaves, and cold, where the person simply enters a queue.",
    d: "In a warm transfer the bot stays until the agent accepts, announces the person and the issue, then leaves, which suits voice and high-value cases. A cold transfer ends the bot's role and waits in the queue, which is cheaper and fine for text channels with asynchronous replies. The transfer must preserve the line or thread, handle the agent not accepting, and give the person status while waiting. Voice transfers cross telephony boundaries and often drop calls. The difficulty is the middle ground: the person left with silence, hold music and no idea whether they were forgotten.",
    k: ["Warm transfer versus cold: warm shortens the call and avoids repetition, but ties up an agent and bot during the briefing, while cold scales better and leaves a gap.", "Hold the same channel versus switch to a callback: holding keeps the context and the person waiting, while callbacks respect their time but need reliable returns."],
    p: ["The transfer drops the call and the person must start again with no record of the attempt.", "Waiting people receive no message, and assume the chat is dead."],
    v: "Run both transfer types in test: for warm, confirm the agent hears the briefing before the person is connected; for cold, confirm waiting messages arrive and the thread stays intact when the agent joins.",
    dep: ["queue-routing", "telephony-gateway", "context-transfer"]
  },
  "supervisor-monitoring": {
    s: "Lets supervisors watch live conversations, see queues, step in on a bot or agent conversation, and override or coach when something goes wrong.",
    d: "A live dashboard lists active conversations with status, sentiment, duration and flags. A supervisor can read along, whisper guidance to an agent, take over from the bot, or pause a flow that is misbehaving. During incidents, such as a bad answer found in several conversations, they can disable a tool or flow quickly through a kill switch. Access is audited since it exposes live customer data. It is hard to build so it scales to thousands of conversations, shows what needs attention rather than everything, and gives control without a deploy.",
    k: ["Real-time monitoring versus after-the-fact review: real-time allows intervention but needs staff watching, while review is cheaper and cannot prevent harm.", "Global kill switches versus deploy-based rollback: switches act in seconds, but each one is a state that must be tested in both positions."],
    p: ["A flow is disabled but conversations already in progress continue with it.", "Supervisors see raw personal data without being logged."],
    v: "Open a live test conversation, observe it from the supervisor view, take over from the bot and disable one tool. Confirm takeover works within seconds, the tool is refused thereafter, and all supervisor access is recorded.",
    dep: ["conversation-logging", "audit-trail", "bot-versioning-release"]
  },
  "return-to-bot": {
    s: "Passes the conversation back to the assistant after a human finishes, or when the person wants to continue self-service, with state updated for what happened.",
    d: "After handling the human issue the agent can release the conversation with an outcome and notes, and the assistant resumes with the new facts in state, for example 'refund approved, reference 123'. The system must tell the person who they are talking to and avoid the bot replying while a human is still active. Some conversations never return, which is fine; the case worth supporting is a human who resolves part of the problem and lets the bot finish routine steps. It is hard because the bot has to avoid contradicting the human, and the agent's free-text notes are not structured state.",
    k: ["Return automatically after resolution versus keep with the human: automatic return frees agents, while staying with the human avoids a jarring change near the end.", "Structured outcome codes versus free-text notes: codes drive bot behavior and analytics, while notes capture nuance but cannot be reliably acted on."],
    p: ["Both agent and assistant reply in the same thread because the release was not recorded.", "The bot greets the person as if starting over and re-asks resolved questions."],
    v: "Have an agent resolve part of a case and release it with an outcome code. Confirm the bot's next message acknowledges the outcome, does not repeat resolved questions, and only one party is replying at a time.",
    dep: ["context-transfer", "dialogue-state-tracker", "agent-workspace"]
  },
  "input-moderation": {
    s: "Screens what people send for abuse, self-harm signals, illegal requests and other content the assistant must not engage with normally.",
    d: "Classifiers and rules evaluate each message and, for voice, its transcript, assigning categories and severity. Outcomes range from allowing, to a specific safe response, to refusal, to escalating to a human or crisis resources. Thresholds and responses differ by deployment: a children's service is stricter than an internal tool. It must work in every supported language and resist trivial evasions such as spacing out letters. It is hard because categories blur, false positives frustrate legitimate users, and some signals, such as distress, need care rather than refusal.",
    k: ["Block versus respond with safe content: blocking is simple, while a tailored response (crisis resources, an explanation) serves people better but needs authored content per category.", "Strict thresholds versus lenient: strict reduces harm and also refuses legitimate medical, legal or safety questions."],
    p: ["A legitimate question about medication is refused because it contains a flagged word.", "Moderation covers English only and other languages pass through unchecked."],
    v: "Run a labeled set in every supported language through moderation. Confirm detection and false-positive rates meet targets, distress messages produce the designed response, and evasion variants are caught.",
    dep: ["language-detector", "policy-guardrails"]
  },
  "prompt-injection-defense": {
    s: "Measures that stop instructions hidden in user text, retrieved documents or tool results from taking over the assistant's behavior or leaking its instructions and data.",
    d: "Defenses are layered: clearly separating trusted instructions from untrusted content in the prompt, treating all retrieved and tool-provided text as data, restricting tools available when untrusted content is present, validating every tool call independently of the model, and filtering outputs for leaked instructions or secrets. Detection classifiers flag likely attacks for blocking or review. Privileges are minimal, so a successful injection can do little. It is hard because no filter is complete: attackers adapt, and models cannot reliably distinguish instructions from data, so the design must assume some attacks succeed and limit the damage.",
    k: ["Detect and block versus contain by privilege limits: detection stops known attacks but misses new ones, while containment bounds damage regardless of whether the attack is recognized.", "Restrict tools after reading untrusted content versus keep all tools: restriction cuts risk but removes useful workflows, such as acting on emailed instructions."],
    p: ["A document in the knowledge base contains text telling the assistant to reveal customer data, and it complies.", "Defenses are tested once with known attacks and never again."],
    v: "Run a standing red-team suite of injection attempts through user input, retrieved documents and tool results. Confirm no unauthorized tool call is made, no prompt or secret is revealed, and new attack cases are added after each incident.",
    dep: ["prompt-assembler", "argument-validation", "output-filters"]
  },
  "output-filters": {
    s: "Checks the assistant's drafted reply before delivery for harmful content, personal data, leaked instructions, unsupported commitments and policy violations.",
    d: "Filters run on the final text, and on structured parts, as classifiers, pattern rules and checks against facts. They block, edit or replace a reply with a safe alternative, and log why. Specific checks cover forbidden promises ('guaranteed returns'), competitor mentions, regulated advice, personal data not belonging to the person, and system prompt fragments. They add latency, and with streaming need buffering of the first sentences. It is hard to balance: filtering too little releases harmful text, too much produces bland, evasive answers, and a filter that fails closed turns an outage into a total outage.",
    k: ["Block and replace versus regenerate: replacing is fast and predictable, while regenerating can recover a good answer but costs another model call.", "Fail closed versus fail open when the filter is down: closed is safe but stops service, while open keeps service with unchecked content."],
    p: ["The filter checks only the first sentence of a streamed reply and the rest is not checked.", "Filter rules written for one language miss the same phrase in others."],
    v: "Feed drafts containing a forbidden promise, another person's data and a quoted system instruction. Confirm each is blocked or replaced, the reason is logged, and a filter outage follows the configured failure mode.",
    dep: ["pii-redaction", "policy-guardrails", "response-streaming"]
  },
  "pii-redaction": {
    s: "Detects personal and sensitive data in text and audio transcripts and masks, tokenizes or restricts it before storage, logging, model calls or display.",
    d: "Detectors find names, addresses, identifiers, card numbers and health details using patterns, checksums and trained models. Policies decide per destination: keep in the live turn, mask in logs, remove from analytics, never send to certain model providers. Redaction can replace values with consistent tokens so conversations remain analyzable and, when needed, reversible by an authorized process. It applies to voice too, including masking audio at the card-number step. It is hard because detection is imperfect, context determines sensitivity, and over-redaction destroys the data teams need to debug.",
    k: ["Redact before storage versus at read time: before storage removes risk at the source, while at read time preserves originals for authorized use but widens exposure.", "Reversible tokens versus irreversible masking: tokens keep joins and debugging possible, but the mapping becomes a sensitive store."],
    p: ["Card numbers spoken in words ('four one one one...') pass pattern detectors and land in logs.", "Redaction is applied to transcripts but not to tool-call logs holding the same value."],
    v: "Run conversations containing numbers, names and addresses, including spelled-out card digits. Confirm logs, analytics and model-provider requests contain only tokens where policy says so, and an authorized lookup can reverse one token.",
    dep: ["conversation-logging", "retention-and-deletion"]
  },
  "policy-guardrails": {
    s: "The defined limits on what the assistant may discuss, promise or do: allowed topics, required disclosures, regulated advice rules and escalation requirements.",
    d: "Policies come from legal, compliance and the business and are turned into enforceable form: topic allow and deny lists, required wording, prohibited commitments, age and region restrictions, and rules such as 'never give investment advice'. Enforcement happens at several points: in prompts, in the dialogue policy, in tool permissions and in output filters, because any one can fail. Policies have owners, versions and tests. It is hard because natural language rules do not map cleanly to classifiers, and because the same question can be harmless or regulated depending on who asks and where.",
    k: ["Enforce in the prompt versus in code: prompts are quick to change but can be argued around, while code and filters are firm and slower to update.", "Central policy service versus per-flow rules: central rules are consistent and auditable, while per-flow rules fit local needs and drift apart."],
    p: ["A policy lives only in the prompt, and a clever rephrasing gets the assistant to ignore it.", "Region rules are not applied to a channel that does not report location."],
    v: "Ask policy-restricted questions in different phrasings, regions and channels. Confirm the assistant consistently declines or uses the required wording, and that each decision names the policy and version in the log.",
    dep: ["dialogue-policy", "config-and-secrets"]
  },
  "step-up-authentication": {
    s: "Raises the proof of identity during a conversation, such as a one-time code or sign-in, before sensitive information is shown or a risky action is taken.",
    d: "Channels start with different levels of trust: a signed-in app session is strong, an anonymous web visitor weak. Tools declare the level they need, and the policy triggers a challenge when the current level is too low, sending a code to a known contact, linking to a sign-in, or asking security questions. The elevated level is recorded with an expiry and applies only to this session. Voice needs methods suited to audio, such as keypad entry or voice-independent codes, since spoken answers can be overheard or spoofed. The difficulty is placing friction where the risk is and handling lockouts and failed attempts safely.",
    k: ["Challenge at the start versus when needed: at the start is simple but burdens every conversation, while on demand keeps lookups easy and complicates the flow.", "Out-of-band code versus knowledge questions: out-of-band codes resist guessing, while questions are easy to use and often answerable by attackers."],
    p: ["Verification persists across a handoff or a later session and lets someone else continue in the verified context.", "Failed attempts are not limited, enabling guessing of codes."],
    v: "Ask for account balance anonymously. Confirm a challenge, a wrong code rejected and limited after repeated tries, a correct code accepted with a recorded level, and that the level lapses at session expiry.",
    dep: ["identity-binding", "session-state-store"]
  },
  "abuse-rate-limiting": {
    s: "Limits request volume and detects automated or hostile use, protecting cost, availability and other users from flooding, scraping and probing.",
    d: "Limits apply per person, address, account, channel and tenant, covering messages, tool calls, model tokens and costly actions such as outbound messages. Detection looks for scripted traffic, repeated attack probes and prompt-extraction attempts. Responses escalate: slow down, challenge, block, alert. Voice and messaging channels add toll fraud and spam. It is hard because generative backends make every message expensive, so a flood is also a cost attack, and because shared addresses (offices, mobile carriers) make per-address limits unfair.",
    k: ["Per-identity limits versus per-address limits: identity limits are fair but need identification, while address limits work for anonymous traffic and affect shared networks.", "Hard blocks versus slowing responses: blocks stop abuse and can lock out real users, while slowing degrades gracefully but takes longer to bite."],
    p: ["A scripted client drains the model budget overnight because limits counted messages, not tokens.", "A corporate network is blocked after one user's abuse."],
    v: "Send a scripted burst from one identity and from many addresses. Confirm limits trigger at the configured level, legitimate users on the same network are still served, and an alert fires on budget burn.",
    dep: ["config-and-secrets", "cost-latency-monitoring"]
  },
  "audit-trail": {
    s: "An append-only record of consequential events: who or what took an action, with what authority, on whose data, and what the result was.",
    d: "Entries capture actions taken by the assistant, confirmations, identity checks, data access, policy decisions, supervisor interventions, configuration and prompt changes, and deletions, each with actor, time, subject, version and outcome. Records are tamper-evident, access-controlled, separate from conversation logs and retained according to compliance rules. They answer disputes ('who approved this refund?') and regulators' questions. It is hard because the model's reasoning is not an audit record: what can be proven is the inputs, the validated call and the confirmation, so those must be captured at the code boundary.",
    k: ["Audit at the code boundary versus rely on conversation logs: boundary records are precise and trustworthy, while logs are complete but mix many things and are easier to alter.", "Immutable storage versus ordinary database: immutable storage resists tampering and complicates deletion requests, which need careful design for personal data."],
    p: ["The audit entry records that the model called a tool, but not which confirmation authorized it.", "Audit data includes full personal details and then falls under its own retention conflict."],
    v: "Perform a confirmed refund, then reconstruct from the audit trail alone who requested it, what was confirmed, which version of flows and policies was active, and the result. Confirm entries cannot be edited.",
    dep: ["retention-and-deletion"]
  },
  "retention-and-deletion": {
    s: "The rules and machinery that keep each category of data only as long as needed and remove it everywhere, including copies, on schedule or on request.",
    d: "Each data class has a retention period and a legal basis: audio, transcripts, memory, profile, analytics, audit and backups. Jobs expire data on schedule; deletion requests find the person's data across stores using a data map, remove or anonymize it, and record proof. Derived data, such as embeddings, summaries and evaluation sets built from conversations, has to be included. It is hard because the same conversation feeds many systems, because anonymization is difficult for free text, and because deletion and audit requirements pull in opposite directions.",
    k: ["Anonymize versus delete: anonymization keeps analytic value but can leave re-identifiable text, while deletion is final and loses the data.", "Short default retention versus long: short retention reduces exposure and cost, while long retention helps investigation and model improvement."],
    p: ["A deletion request clears the main store but not the evaluation set built from transcripts.", "Backups restore deleted records back into production."],
    v: "Create a test person's data across all stores, issue a deletion request, and confirm a scripted scan finds nothing in any store including derived data, and that restoration from backup re-applies the deletion.",
    dep: []
  },
  "privacy-and-consent": {
    s: "The decisions on what data the assistant may collect, use, keep and share, and how people are told and asked, which shape storage, models and every integration.",
    d: "Conversations contain names, health details, finances and voices, often volunteered casually. Decisions include the legal basis for each use, what is disclosed at the start (including that the person is talking to an automated system and whether it is recorded), consent for memory, analytics and training use, data minimization in prompts, residency of storage and model calls, and which vendors may see content. The decisions are enforced by redaction, retention, access control and per-tenant configuration. They differ by region and sector, so the design needs them configurable rather than hard-coded.",
    k: ["Minimize what models see versus pass full context: minimizing reduces exposure and sometimes quality, while full context answers better and spreads sensitive data further.", "Use conversations to improve models by default versus opt-in: default use improves quality faster, while opt-in is easier to defend and yields less data."],
    p: ["Conversations are sent to a model provider in another region without anyone checking residency rules.", "Disclosure appears in a terms page nobody reads rather than in the conversation."],
    v: "Map where one conversation's data travels, from channel to model call to log to analytics. Confirm each hop is covered by a documented basis, matches the configured region, and respects the person's consent settings.",
    dep: ["pii-redaction", "memory-controls", "retention-and-deletion"]
  },
  "graceful-degradation": {
    s: "The plan for how the assistant behaves when parts fail or run slowly, so that a model outage, slow backend or lost speech service reduces capability instead of breaking the conversation.",
    d: "Every dependency has a defined fallback: a smaller model when the main one is slow, templates when generation fails, cached or curated answers when retrieval is down, text when speech fails, queued requests when a backend is unavailable, human handoff when the assistant cannot proceed. The person is told plainly what is not working and what they can do. Fallbacks are tested by injecting failures, since untested ones fail when needed. The decision is made per capability: which failures hide, which are announced, and which must stop an action entirely rather than guess.",
    k: ["Degrade silently versus announce limits: silent fallback preserves flow, but hides reduced accuracy, while announcing sets honest expectations and can alarm people.", "Fall back to a weaker path versus fail the turn: a weaker path keeps service available, but should never apply to actions with side effects that need full validation."],
    p: ["The fallback model has no safety filters configured and answers things the main one would refuse.", "Fallbacks are never exercised and fail for the first time in an incident."],
    v: "Disable each dependency in turn in a staging environment: model, retrieval, speech, one backend. Confirm the planned fallback occurs within its time limit, the person is informed, and no action executes without validation.",
    dep: ["model-gateway", "connector-layer", "fallback-handler", "turn-orchestrator"]
  },
  "language-and-locale-coverage": {
    s: "The decision about which languages and regions the assistant supports, and to what depth in each, as this multiplies every model, content set, voice and test.",
    d: "Support can be full (recognition, understanding, content, voice, policies and evaluation in that language), partial (text only, translated answers) or best-effort (a general model with no tuning). Each added language needs recognition accuracy, localized content, voices, pronunciation entries, moderation and test sets, plus local business rules. Quality differs widely between languages, and measuring it separately matters, because an average hides the weak ones. People also mix languages and switch mid-conversation. The decision defines what the assistant tells someone it cannot help in their language.",
    k: ["Native content per language versus translation of one source: native content fits local needs and costs more to maintain, while translation stays consistent but misses local rules and phrasing.", "Few languages with full quality versus many at partial quality: few is dependable, while many reaches more people with uneven behavior that must be disclosed."],
    p: ["Evaluation is done in the main language and the others quietly perform far worse.", "Safety filters work in some languages only and are bypassed by switching languages."],
    v: "Run the same task set and safety set in every supported language and report accuracy, task completion and filter results per language, with the weakest language called out against the stated support level.",
    dep: ["language-detector", "localization-engine", "streaming-recognizer", "nlu-evaluation-sets"]
  }
});
