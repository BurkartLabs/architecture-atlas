// Details for the conversational assistant plate, part 3: response, knowledge, actions and memory.
ATLAS.details("conversational-assistant", {
  "response-planner": {
    s: "Decides what the reply must contain, such as an answer, a question, a confirmation or a result, before any wording is chosen.",
    d: "Given the policy's chosen move, tool results, retrieved facts and dialogue state, the planner assembles an ordered list of communicative acts: acknowledge, report outcome, ask for the next slot, offer next steps. It selects whether each act is a template, a generated passage or a rich element, and applies length and channel constraints, for example shorter replies for voice. Separating what to say from how to say it lets designers control content and compliance while the wording layer varies. It is hard to avoid overload: long replies mixing results, upsells and questions make people miss the question they were asked.",
    k: ["Separate planning from wording versus one model call that does both: separation allows checks on content before it is phrased, while one call is simpler and often reads better.", "One question per reply versus several: one is easier to answer, especially by voice, while several finish tasks in fewer turns for confident users."],
    p: ["A reply ends with a statement after the question, so the question is not the last thing the person reads.", "The planner includes facts the person did not ask for, adding length and risk."],
    v: "Feed a set of dialogue states and tool results into the planner and inspect the plan: each contains the required acts in order, a single question at the end, and voice plans stay under the length limit.",
    dep: ["dialogue-policy", "dialogue-state-tracker"]
  },
  "template-renderer": {
    s: "Fills authored reply templates with values from state and tool results, applying grammar, formatting and variant selection, for wording that must be exact.",
    d: "Templates are written by content designers with placeholders, conditional parts and several variants to avoid repetition. The renderer inserts values with locale-aware formatting (dates, currency, plurals, gender and case agreement), and escapes content for the channel. Templates are the right choice for legal wording, prices, confirmations and error messages, where a paraphrase would be a defect. They are tested by rendering with sample data. The difficulty is languages with complex agreement, and combinatorial growth: every new phrasing variant multiplies across languages and channels.",
    k: ["Templates versus generated text for informational replies: templates are exact and fast, but rigid and costly to author at scale, while generation is flexible but needs checking.", "Many variants per template versus one: variants avoid robotic repetition, but multiply review and translation work."],
    p: ["A plural form is wrong for zero or for languages with several plural forms, producing visibly broken sentences.", "A missing value renders as an empty gap or the raw placeholder text."],
    v: "Render every template with typical, empty and extreme values in each supported language. Confirm no placeholders remain, plural and currency forms are correct, and missing values are caught before sending.",
    dep: ["localization-engine"]
  },
  "llm-response-generator": {
    s: "Uses a language model to write replies from the plan, retrieved facts and conversation, for open-ended answers where fixed templates would not cover the range of requests.",
    d: "The prompt includes the plan, approved facts and style instructions, and the model returns reply text, sometimes with structured fields for tool calls or citations. Generation can be streamed. Controls include instructing the model to use only supplied facts, limiting length, checking the draft against the facts and filters before sending, and falling back to a template when checks fail. The risks are fabrication, drifting off topic, inconsistent persona and over-promising. Generation is hard to bound: a model can be fluent and wrong, so every consequential statement should be traceable to a fact or a tool result.",
    k: ["Generate from supplied facts only versus allow general knowledge: facts-only lowers fabrication and makes answers traceable, but refuses questions the content does not cover.", "Check the full draft before sending versus stream directly: checking blocks bad replies but adds delay, while streaming is fast but sends text before it is validated."],
    p: ["The model states a price or deadline that appears nowhere in the supplied facts, and the person relies on it.", "A model update changes tone and length across every flow."],
    v: "Ask questions with answers in the facts, absent from them and contradicting common belief. Confirm answers match the facts, absent answers produce an honest 'I don't know', and each factual claim can be traced to its source.",
    dep: ["prompt-assembler", "model-gateway", "output-filters", "citation-attribution"]
  },
  "structured-output-parser": {
    s: "Turns model output into validated structured data, such as tool calls, classifications and extracted fields, and handles malformed results.",
    d: "Components ask the model for output in a defined schema. The parser checks that the text parses, that required fields exist, that values are in allowed sets and types, and that references point to real records. On failure it can repair simple problems, retry with the error message, or fall back to a simpler path. Constrained decoding, where the model can only emit valid tokens, reduces failures but does not guarantee the content is correct. It is the boundary between fuzzy language and deterministic code, so lenient parsing there lets errors pass into business systems.",
    k: ["Strict rejection versus lenient repair: strict rejection is safe but increases retries, while repair gets more answers through but can alter meaning without anyone noticing.", "Constrained decoding versus validate afterward: constraints give valid syntax at once, but limit model flexibility and still need semantic checks."],
    p: ["A field with a plausible but invalid value, such as an order identifier the model invented, passes syntax checks.", "Retries with the same prompt repeat the same malformed output and burn latency."],
    v: "Feed malformed, truncated and out-of-range outputs to the parser. Confirm each is rejected or repaired as specified, and a value that references a nonexistent record is caught by lookup.",
    dep: ["argument-validation", "model-gateway"]
  },
  "persona-and-tone": {
    s: "The defined voice of the assistant: its name, register, level of formality, humor and limits, applied consistently across channels and generated or templated replies.",
    d: "A persona guide specifies how the assistant introduces itself, how it addresses people, what it will not joke about, how it apologizes, and how it adapts to a frustrated or hurried person. It is implemented through prompt instructions, template wording, voice selection and a few examples. Tone adapts by context: terse in a status lookup, empathetic in a billing dispute. The persona must never mislead people about being an automated system when it matters. It is difficult because it is subjective, drifts between authors, and is overridden by model behavior unless evaluated.",
    k: ["Strong personality versus neutral helper: personality builds brand and engagement, but jokes and familiarity misfire in serious situations and across cultures.", "One persona everywhere versus per-channel variants: one persona is consistent, while variants fit the medium, such as shorter, plainer phrasing for voice."],
    p: ["Cheerful wording appears in a reply about a bereavement or fraud, which makes the assistant seem callous.", "Persona instructions crowd out accuracy instructions in the prompt."],
    v: "Run a panel of sample scenarios, including angry and sensitive ones, through the assistant. Reviewers score each reply against the persona guide, and automated checks confirm forbidden phrases never appear.",
    dep: ["llm-response-generator", "template-renderer"]
  },
  "localization-engine": {
    s: "Adapts replies and prompts to a language and region: translation, formats, units, politeness levels and culturally appropriate phrasing.",
    d: "Content is stored as keys with per-language variants or as source text translated by a model and reviewed. The engine selects the language from detection and preference, applies locale formats for dates, numbers, currency and addresses, handles right-to-left layout, and falls back along a language chain when a translation is missing. It must coordinate with recognition and synthesis languages and keep terminology consistent. It is hard because translation is not localization: idioms, politeness forms and legal wording differ, and machine translation of a reply cannot be assumed to keep exact commitments.",
    k: ["Translate content ahead of time versus translate at runtime: ahead-of-time can be reviewed and is exact, while runtime covers dynamic text but cannot be reviewed beforehand.", "Separate flows per language versus shared flows with translated text: shared flows stay consistent, but cannot reflect local business rules or phrasing differences."],
    p: ["A missing translation falls back silently to another language mid-sentence.", "Date formats are applied by server locale rather than the person's, swapping day and month."],
    v: "Switch a test conversation through each supported language. Confirm replies, dates, currency and button labels are in that language, a deliberately missing key follows the fallback chain, and the fallback is logged.",
    dep: ["language-detector", "template-renderer"]
  },
  "response-streaming": {
    s: "Delivers the reply in pieces as it is generated, so text appears or speech begins before the full answer exists.",
    d: "The generator emits tokens, the streamer groups them into words or sentences and forwards them to the channel or the synthesizer. In text channels it enables a typing effect and early reading; in voice it lets synthesis start on the first sentence. Streaming must coordinate with safety checks, since content that has been sent cannot be recalled, and with structured output, since partial structures are not valid yet. It needs cancellation when the person interrupts. Hard problems include sentence boundary detection, partial markup, and keeping order when several streams (text, tool status, cards) interleave.",
    k: ["Stream directly versus buffer for checks: direct streaming has the lowest delay, while buffering a sentence or two allows filters to run at a small latency cost.", "Cancel generation on interruption versus let it finish: cancelling saves cost and respects the person, but needs support through every layer of the stack."],
    p: ["A streamed sentence is retracted by a filter after the person has already seen or heard it.", "Cancelled generations keep running and keep incurring cost."],
    v: "Stream a long reply and interrupt halfway. Confirm output stops within the target delay and the generation is cancelled upstream. Inject a filter-triggering sentence and confirm it is never delivered.",
    dep: ["llm-response-generator", "output-filters", "channel-adapters"]
  },
  "knowledge-ingestion": {
    s: "Brings approved content, such as help articles, policies, product data and documents, into the assistant's knowledge store with its source, owner and permissions intact.",
    d: "Connectors crawl or receive content from wikis, document stores, ticket systems and databases. The pipeline converts formats, strips boilerplate, keeps structure such as headings and tables, attaches metadata (source, owner, date, audience, language, access rules) and deduplicates. Content has to be approved before use: drafts and outdated policies must not be answerable. It runs on a schedule or on change events. It is hard because source documents are messy, tables and images lose meaning when flattened to text, and access permissions from the source must carry through so the assistant does not reveal restricted material.",
    k: ["Index everything available versus a curated approved set: everything gives coverage but includes stale and contradictory material, while curation gives reliable answers at editorial cost.", "Preserve source permissions per chunk versus tenant-level access: per-chunk checks prevent leaks, but add filtering cost and complexity to retrieval."],
    p: ["An old pricing PDF stays indexed after the policy changed and the assistant quotes it confidently.", "Tables are flattened to text and the numbers lose their row and column labels."],
    v: "Ingest a document with a table, a restricted section and a superseded version. Confirm the table keeps its labels, the restricted section is retrievable only by authorized users, and the old version is excluded.",
    dep: ["freshness-sync", "chunking-and-embedding"]
  },
  "chunking-and-embedding": {
    s: "Splits documents into retrievable passages and converts each into a numeric vector, so passages similar in meaning to a question can be found.",
    d: "Chunking chooses passage boundaries, by headings, paragraphs or fixed lengths with overlap, so each chunk carries enough context to stand alone, often with its title and section path prepended. An embedding model maps each chunk, and later each query, to a vector in a shared space. Choices here set the ceiling for answer quality: chunks too small lose context, too large dilute the match. Changing the embedding model requires re-embedding everything, since vectors from different models are not comparable. Multilingual content needs a model that places languages in a shared space.",
    k: ["Small precise chunks versus large context-rich chunks: small chunks match narrowly but lose surrounding detail, while large chunks keep context but blur relevance and use more of the model's input.", "Structure-aware chunking versus fixed size: structure-aware keeps sections intact but needs parsing for each format, while fixed size is simple and cuts mid-thought."],
    p: ["A chunk boundary splits an exception from the rule it modifies, so retrieval returns only the rule.", "Switching embedding models without re-indexing makes search quietly return poor matches."],
    v: "For a set of questions with known answer passages, measure how often the correct chunk appears in the top results. Re-run after any chunking or model change and compare before accepting it.",
    dep: ["knowledge-ingestion"]
  },
  "retrieval-index": {
    s: "The searchable store of passages that returns the most relevant ones for a query, using vector similarity, keyword matching or both, with filters on metadata.",
    d: "Indexes support approximate nearest-neighbor search over vectors, keyword search for exact terms such as part numbers, and metadata filters for language, audience, product and permission. Hybrid retrieval combines both and merges the ranked lists, because vector search misses exact identifiers while keyword search misses paraphrases. It returns passages with scores and source references. Updates must appear quickly without degrading query speed. It is hard to tune: recall, latency, memory and freshness pull against each other, and a retrieval miss makes the downstream model answer without the needed fact.",
    k: ["Vector only versus hybrid with keywords: hybrid finds exact codes and names that vectors miss, at the cost of a second index and a merging step.", "Approximate versus exact search: approximate search is fast at scale but occasionally misses the best match, while exact is complete and slower."],
    p: ["Permission filters are applied after ranking, so the top results are removed and nothing remains.", "Index updates lag, and an answer published an hour ago cannot yet be found."],
    v: "Query for a part number, a paraphrased policy question and a restricted document as two different users. Confirm each returns the expected passage, and the restricted one appears only for the authorized user.",
    dep: ["chunking-and-embedding", "freshness-sync"]
  },
  "query-rewriter": {
    s: "Turns the person's latest message into a good search query, filling in context from the conversation and splitting compound questions.",
    d: "Follow-up questions like 'what about for business accounts?' are meaningless to a search index on their own. The rewriter uses recent turns and state to produce a standalone query, expands abbreviations, may generate several variants, and sets filters such as language or product from known context. It may decide that no retrieval is needed (a greeting) or that several are (a multi-part question). The result is often a model call, which adds latency to every grounded turn. The risk is drift: a rewrite that changes the question's meaning retrieves confident answers to a different question.",
    k: ["Rewrite with a model versus use the raw message: rewriting resolves follow-ups and improves recall, but adds delay and can distort intent.", "Single query versus several variants: variants improve recall on vague questions, while increasing retrieval load and the work of merging results."],
    p: ["A rewrite drops a qualifier such as 'not' or a product name and retrieves the opposite policy.", "The rewriter is called for every message, adding delay even to greetings."],
    v: "Ask a question, then a pronoun-only follow-up. Confirm the rewritten query is standalone and names the right subject, and that a greeting skips retrieval entirely.",
    dep: ["dialogue-state-tracker", "model-gateway", "retrieval-index"]
  },
  "reranker": {
    s: "A second-stage model that reads the question together with each candidate passage and reorders candidates so the best evidence comes first.",
    d: "First-stage retrieval returns many candidates cheaply, perhaps fifty. The reranker scores each question and passage pair with a more precise model and keeps the top few. This improves precision where passages are similar, such as policies for different regions. It also lets the system apply business signals such as recency, authority of the source or the person's product. It is slower than retrieval and scales with the number of candidates, so the candidate count is set by the latency budget. A low top score is a useful signal that the knowledge base may not contain the answer.",
    k: ["Rerank many candidates versus few: many raises the chance the right passage is included, while few keeps delay and cost down.", "Use the reranker score as an abstain signal versus always answer: abstaining prevents unsupported answers, but needs a tuned threshold or it refuses answerable questions."],
    p: ["Reranking is skipped under load and answer quality quietly falls without an alert.", "Recency boosts push a newer but less authoritative page above the official policy."],
    v: "On a labeled question set, compare answer-passage rank with and without reranking and confirm improvement. For questions with no answer in the knowledge base, confirm top scores fall below the abstain threshold.",
    dep: ["retrieval-index"]
  },
  "citation-attribution": {
    s: "Links each factual statement in an answer to the source passage it came from, so people and reviewers can verify it.",
    d: "Retrieved passages carry identifiers through the prompt, and the generator is asked to reference them. A checker confirms that cited passages exist, were supplied for this turn, and support the claim, using entailment checks or overlap tests. The channel shows sources as links, footnotes or a short 'based on' line, or only logs them where the interface cannot. Attribution is the audit trail for grounded answers and drives feedback loops that fix wrong content at its source. It is hard because models can cite a real source that does not support the sentence, and long answers merge several sources.",
    k: ["Show citations to the person versus log them only: showing builds trust and allows checking, but clutters short replies and especially voice, where links cannot be spoken.", "Verify support automatically versus trust model citations: verification catches false citations, at the cost of another model call per answer."],
    p: ["The assistant cites a document that is real but does not say what the answer claims.", "Source links point at internal pages the customer cannot open."],
    v: "Generate answers to twenty sourced questions and check each citation by hand. Confirm cited passages exist in the turn's supplied set and support the claim, and that unsupported claims are flagged.",
    dep: ["retrieval-index", "llm-response-generator"]
  },
  "freshness-sync": {
    s: "Keeps the knowledge store aligned with its sources: detecting changes, updating or removing passages, and expiring content that is no longer valid.",
    d: "Change events or scheduled crawls detect new, edited and deleted source items. The pipeline re-ingests only what changed, updates or deletes the matching chunks and vectors, and records the version. Content can carry effective and expiry dates, so a promotion disappears by itself. Deletions are as important as additions, and are easy to miss when a source only reports new items. Operators need to see lag between a source change and its availability. It is hard because sources differ in change reporting, and because a half-applied update can leave old and new versions of a policy both retrievable.",
    k: ["Event-driven updates versus scheduled full crawls: events are fast and cheap, but depend on the source reporting every change, while crawls are slower but catch what events miss.", "Delete on source removal versus soft-expire: deleting is clean, while soft expiry allows rollback and auditing of what was once answerable."],
    p: ["A deleted article stays in the index because the sync only processes additions.", "Updates apply chunk by chunk, so for minutes the assistant mixes old and new policy text."],
    v: "Edit one article and delete another at the source. Confirm the edit is answerable within the target lag, the deleted one is no longer retrievable, and the sync log lists both changes.",
    dep: ["knowledge-ingestion", "retrieval-index", "event-bus"]
  },
  "curated-answers": {
    s: "Hand-written, reviewed answers for high-value or high-risk questions, matched ahead of generation and returned exactly as approved.",
    d: "Teams maintain a set of questions with approved replies, often with variants, links and rich content. Matching uses the intent classifier or a high-precision semantic match; a hit returns the curated answer without generation. This covers legal, medical, financial and brand-sensitive topics, and the most common questions where speed and exactness matter. It is the controlled counterpart of generation. It needs an owner and review dates, because curated answers go stale like any content. The hard part is the boundary: a near match that returns an approved answer to a slightly different question is wrong with authority.",
    k: ["Curated before generated versus generated first with curated as examples: curated-first is exact on covered questions, while examples guide generation but do not guarantee wording.", "High-precision matching versus broad matching: precision avoids wrong approved answers, while breadth covers more phrasings but returns mismatches."],
    p: ["A curated answer about last year's fees keeps being returned after the fees changed.", "Variants are added for coverage until two entries contradict each other."],
    v: "Ask each curated question in several phrasings and a near-miss question. Confirm exact approved text for the phrasings, no match for the near-miss, and that every entry has a review date within policy.",
    dep: ["intent-classifier", "template-renderer"]
  },
  "tool-registry": {
    s: "The catalog of actions the assistant may take, each with a name, description, input schema, permissions, side-effect class and owner.",
    d: "Every tool, whether a lookup, a booking or a message to a person, is registered with a precise description the model or policy uses to choose it, a typed schema for its inputs and outputs, the authentication it needs, whether it changes data, whether it can be undone, and its cost and rate limits. The registry decides which tools are visible in which flows and to which users. It is a contract between assistant designers and system owners. It is hard to keep accurate: vague descriptions cause wrong selection, changed backend APIs break schemas, and a long tool list degrades model choice.",
    k: ["Many narrow tools versus few broad ones: narrow tools are easy to validate and permission, while broad ones reduce the choice burden but accept loosely specified inputs.", "Expose all tools always versus expose per flow: per-flow exposure shrinks the choice and the risk, but requires flows to declare what they need."],
    p: ["Two tools have similar descriptions and the model picks the destructive one for a lookup request.", "A schema falls behind the backend API and calls fail only in production."],
    v: "List the tools visible to a flow and a user role. Confirm only permitted tools appear, each has a schema and side-effect class, and a contract test against each backend passes.",
    dep: ["connector-layer", "config-and-secrets"]
  },
  "tool-call-planner": {
    s: "Chooses which tools to call, in what order and with which arguments, to satisfy the current goal, either by flow rules or by model reasoning.",
    d: "In scripted flows the next call is fixed by the step. In model-driven designs the model proposes a call from the tool descriptions and state, sees the result, and may call again, within a limit on steps and cost. Independent calls can run in parallel to save time. The planner stops on success, error, ambiguity or limit, and then asks the person or hands off. It must propose before acting for side-effecting tools, passing through validation and confirmation. It is hard because loops, wrong tool choice and chained errors compound, and every extra step spends the latency budget.",
    k: ["Fixed call sequences versus model-planned sequences: fixed sequences are predictable and cheap, while model planning handles open requests but needs step limits and loop detection.", "Parallel calls versus sequential: parallel is faster, but cannot use one result in another call and complicates partial failure."],
    p: ["The model repeats a failing call with the same arguments until the step limit.", "A lookup result is trusted blindly, although it came from an unrelated customer's record."],
    v: "Give a request needing two dependent lookups and one independent. Confirm order, parallel use, a halt at the step limit on a forced error, and a full trace of each proposed and executed call.",
    dep: ["tool-registry", "dialogue-policy", "argument-validation"]
  },
  "argument-validation": {
    s: "Checks every proposed tool input against schema, business rules and the current user's authority before the call executes.",
    d: "Validation is deterministic code between the model or flow and the backend. It checks types and ranges, that referenced records exist and belong to this person, that required slots were confirmed and not just guessed, and that amounts and dates fall within policy. It rejects with a specific reason the dialogue layer can turn into a question. It is the main defense against both model errors and manipulation, because it does not depend on what the model intended. The key discipline is deriving identity and ownership from the authenticated session, never from text supplied in the conversation.",
    k: ["Validate in the assistant versus rely on the backend: assistant-side checks give better messages and earlier failure, but the backend must still enforce, so rules exist twice.", "Reject versus auto-correct inputs: rejection is safe and clear, while correction is smoother but silently changes what the person asked."],
    p: ["An account identifier typed in chat is accepted instead of the authenticated one, exposing another customer's data.", "Validation errors are returned as raw backend messages the person cannot act on."],
    v: "Submit calls with another user's record identifier, an out-of-range amount and a missing confirmation. Confirm all three are rejected before reaching the backend, each with a distinct logged reason.",
    dep: ["tool-registry", "identity-binding"]
  },
  "connector-layer": {
    s: "Adapters that call business systems such as order, billing, scheduling and ticketing, translating between the assistant's tool contracts and each system's interface.",
    d: "Each connector owns authentication, request building, pagination, error mapping, timeouts and retries for one backend, and returns normalized results and errors. Backends vary in reliability and speed, and some offer only batch interfaces or screens meant for people. The layer isolates the assistant from this, caches safe reads, applies circuit breakers so a failing backend does not stall conversations, and exposes health. It is hard because backend error semantics are poorly documented, latency is unpredictable, and a change on the backend side breaks the assistant without notice.",
    k: ["Direct calls to systems of record versus an intermediate service: direct calls are simple and current, while an intermediate service allows shaping, caching and rate control but adds a component to run.", "Cache reads versus always query live: caching meets the latency budget, but risks showing stale status the person will act on."],
    p: ["A slow backend holds sessions open until the whole assistant runs out of connections.", "Backend error text such as stack traces passes through to the person."],
    v: "Slow a backend to timeout in a test. Confirm the connector times out within its limit, the breaker opens after repeated failures, the assistant tells the person a plain message, and normal calls resume after recovery.",
    dep: ["delegated-credentials", "config-and-secrets"]
  },
  "delegated-credentials": {
    s: "Holds and uses authorizations that let the assistant act on a specific person's behalf in other systems, scoped, time-limited and revocable.",
    d: "When the person links an account or signs in, the system obtains a token for the connected service with limited scope and lifetime, stores it encrypted, and uses it only for calls on that person's behalf. It handles refresh, expiry and revocation, and records each use. Service-level credentials, used for actions not tied to one user, are separate and kept narrow. The model never sees any credential. It is difficult because tokens are high-value targets, scopes are often broader than needed, and revocation must take effect while conversations are in progress.",
    k: ["Per-user delegated tokens versus a shared service account: delegated tokens limit damage and give a precise audit trail, while a shared account is simple but turns any bug into access to everyone's data.", "Short-lived tokens with refresh versus long-lived: short-lived limits exposure, but adds refresh failures the conversation must recover from."],
    p: ["Tokens are logged in debug output along with request bodies.", "A revoked link keeps working until the cached token expires."],
    v: "Link an account, perform an action, then revoke the link. Confirm the next action fails with a re-link prompt immediately, no token appears in logs or model prompts, and each use is in the audit trail.",
    dep: ["config-and-secrets", "audit-trail"]
  },
  "action-confirmation-gate": {
    s: "A required explicit approval from the person before any action that spends money, deletes data, sends messages or is otherwise hard to undo.",
    d: "Tools are classed by effect, and those above a threshold are held until the person confirms a plain statement of exactly what will happen, with amounts, dates and targets. The gate checks the confirmation applies to the current proposal and is recent, so a stale 'yes' cannot approve a changed action. For high-value actions it can require step-up authentication. The proposal that was confirmed is stored with the executed call. It is a design trade between friction and safety, and the hard cases are model-initiated actions, where a persuasive generated message could imply consent that was never given.",
    k: ["Confirm every write versus only high-impact writes: confirming everything is safe but tiresome, while risk-based confirmation needs a reliable effect classification.", "Confirmation inside the chat versus a separate approval screen: in-chat is fast, while a separate screen resists manipulation of the conversation and is clearer for large amounts."],
    p: ["A 'yes' given to one question is applied to a different action proposed in the next turn.", "The confirmation text is generated by the model and describes a different action from the one executed."],
    v: "Propose a refund, change its amount after the confirmation prompt, then reply yes. Confirm execution is refused because the confirmation no longer matches, and the confirmed text equals the executed call.",
    dep: ["tool-registry", "step-up-authentication", "audit-trail"]
  },
  "idempotency-and-retries": {
    s: "Ensures a retried or duplicated action takes effect once, using unique request keys, and retries transient failures without repeating side effects.",
    d: "Each side-effecting call carries a key derived from the conversation, turn and step, which the backend uses to return the original result for repeats. The caller retries on timeouts and transient errors with backoff, but never retries when it is unclear whether the first attempt succeeded unless the backend supports keys. Channels can redeliver messages and people can send the same request twice, so the dedupe applies from the message level down. It is hard because many backends have no idempotency support, so the connector must read state first to check whether the action already happened.",
    k: ["Idempotency keys versus read-then-write checks: keys are reliable where the backend supports them, while read-then-write works anywhere but can race.", "Retry automatically versus ask the person: automatic retry hides glitches, while asking is safer when a repeat could double a charge."],
    p: ["A timeout is treated as failure and retried, but the first attempt had succeeded, so the person is charged twice.", "Keys are random each attempt and so never match."],
    v: "Force a timeout after the backend commits and let the retry run. Confirm exactly one record exists, both attempts share a key in the log, and the person gets one confirmation.",
    dep: ["connector-layer", "event-bus"]
  },
  "multi-step-transactions": {
    s: "Coordinates actions that span several systems and conversation turns so they complete together or are compensated, with clear status for the person.",
    d: "A change such as moving a flight may reserve a seat, reprice, charge and issue a ticket across different services. The orchestration keeps the transaction state, executes steps in order, and when a later step fails runs compensations for earlier ones (release the seat, reverse the charge). Long-running steps persist across turns and sessions, so the assistant can report progress and resume after a restart. Compensation is not always possible, so risky steps are ordered last. It is hard because partial failure is the normal case, and the person must understand what happened without internal details.",
    k: ["Compensating actions versus holds and commits: compensation works across independent systems, while holds are cleaner but need backends that support reservation.", "Run to completion within the conversation versus continue in the background: staying inline is simple, while background completion avoids timeouts at the cost of notifications and status lookups."],
    p: ["A failure after the charge leaves money taken with no booking and no record to reverse from.", "The assistant says 'all done' when the final step is still pending."],
    v: "Fail the last step of a three-step transaction. Confirm earlier steps are reversed, final state matches the starting state, the person is told what happened, and the ledger records each step and compensation.",
    dep: ["idempotency-and-retries", "connector-layer", "session-state-store"]
  },
  "async-job-callbacks": {
    s: "Handles actions that finish later, such as approvals or shipments, by tracking the job and resuming the conversation when a callback or poll reports completion.",
    d: "The assistant starts a job, stores its identifier with the session and tells the person what to expect. Completion arrives as a signed callback or is found by polling. The system then locates the conversation, decides whether to message proactively or wait for the person to return, and updates state. Callbacks can arrive before the start call returns, twice, or after the session has expired, so handling is idempotent and keyed by job. It is hard because the person may have moved to another channel, and because a result needs context from a conversation that has long since gone cold.",
    k: ["Callbacks versus polling: callbacks are timely and cheap, while polling works with any backend but costs calls and delay.", "Notify proactively versus wait for the person: proactive messages are helpful for results people await, but intrusive for routine ones and need consent."],
    p: ["A callback arrives after the session expired and there is nowhere to deliver it.", "The completion message loses its context, so the person gets 'Your request is done' with no idea which one."],
    v: "Start a delayed job, close the session, and complete the job. Confirm the callback finds the right person, a message with the job's context is delivered on their preferred channel, and a duplicate callback is ignored.",
    dep: ["connector-layer", "proactive-outbound", "event-bus"]
  },
  "session-state-store": {
    s: "The fast, short-lived store holding the current conversation's state, such as slots, flow position and flags, readable and writable by any server handling a turn.",
    d: "Each session has a record keyed by identifier with a version, expiry and the dialogue state. Reads and writes happen on every turn, so it must be fast and support conditional updates to prevent lost writes when messages overlap. Expiry rules vary by channel: minutes for voice, hours or days for messaging, with the option to resume. Data is encrypted and limited to what the dialogue needs. It is hard because it is a shared dependency on the critical path of every turn, and because deciding what persists beyond the session, and what must be deleted, is a privacy decision.",
    k: ["In-memory store versus durable database: memory is quicker per turn, while a durable store survives restarts at higher latency and cost.", "Long session lifetime versus short: long lifetimes let people return later, while short ones limit stored data and stale context."],
    p: ["Session expiry is shorter than the longest legitimate task, so people lose progress partway through.", "Unversioned writes let a late message overwrite newer state."],
    v: "Update the same session from two servers at once and confirm one succeeds and one retries via version checking. Let a session expire and confirm its data is removed and a new message starts fresh.",
    dep: []
  },
  "conversation-history-store": {
    s: "The durable record of every turn, with its inputs, outputs, tool calls and decisions, used to rebuild context, review and audit.",
    d: "Each turn is saved with timestamps, channel, normalized and raw text, understanding results, retrieved sources, tool calls and results, the reply and the model and bot versions. Recent turns are read back to build the prompt, and full history serves support staff, review and analytics. Storage is partitioned by tenant and person and subject to retention rules. It differs from analytics logs in being the source of truth for resuming and for disputes. It is hard because volume is large, content is sensitive, and the same data serves product improvement and legal deletion requests.",
    k: ["Store raw audio and text versus transcripts only: raw data helps debugging and retraining, but holds more sensitive content and costs more to protect.", "One store for runtime and analytics versus separate: one store is simple, while separation keeps analytics queries from slowing live turns and allows different retention."],
    p: ["History includes full card numbers because redaction ran only on analytics copies.", "Deletion removes the transcript but leaves tool call logs with the same personal data."],
    v: "Complete a conversation with a tool call and a correction. Confirm every turn appears with its versions and decisions, the person's deletion request removes every copy including logs, and the removal is itself recorded.",
    dep: ["retention-and-deletion", "pii-redaction"]
  },
  "user-profile-store": {
    s: "The structured record of what is known about a person across conversations: identifiers, preferences, entitlements and verified attributes, with the source and time of each fact.",
    d: "Profiles combine data pulled from business systems (plan, region), facts the person has stated (preferred language, name) and attributes inferred by the assistant. Each field has a source, a confidence, an expiry and a visibility rule, so the assistant knows what it may use and say. Access is checked per field: a profile can include data the assistant may use internally but never repeat. The store is read at the start of a turn and updated sparingly. It is hard to keep truthful: external systems change, inferred values go stale, and wrong profile facts are repeated confidently.",
    k: ["Copy data into the profile versus read live from systems of record: copies are fast, but go stale, while live reads are current and slower and need availability.", "Store inferred attributes versus only stated ones: inferences personalize more, but are often wrong and raise privacy concerns."],
    p: ["An old address stays in the profile and the assistant ships to it.", "Assistant-inferred traits are shown to the person as facts they never gave."],
    v: "Change a plan in the billing system and confirm the profile reflects it within its refresh period. Check each field shows source and time, and that a restricted field is used internally but never spoken.",
    dep: ["identity-binding", "memory-controls"]
  },
  "long-term-memory": {
    s: "Facts and episodes from past conversations that the assistant stores and recalls later, such as preferences, ongoing issues and commitments it made.",
    d: "After a conversation, a process extracts items worth remembering, with a summary, a type and a time, and stores them with embeddings for later search. At the start of or during a later conversation, relevant memories are retrieved and placed in the prompt. Memory should be scoped to a person, correctable and expiring. It is separate from the profile in being free-form and conversational. The difficulty is judging what to keep and when to forget: noisy memories add clutter and cost, wrong ones are applied confidently, and some things people said in passing should not follow them.",
    k: ["Automatic extraction versus explicit 'remember this': automatic memory is convenient but surprises people with what it kept, while explicit memory is predictable and less complete.", "Retrieve memories every turn versus on demand: every turn personalizes broadly but adds delay and context noise, while on demand misses what the person assumed it remembered."],
    p: ["A one-time remark about a sensitive topic resurfaces weeks later in an unrelated conversation.", "Contradictory memories are both retrieved and the assistant mixes them."],
    v: "State a preference, end the conversation, and start a new one. Confirm the preference is recalled, can be viewed and deleted by the person, and after deletion is no longer used or retrievable.",
    dep: ["retrieval-index", "memory-controls", "user-profile-store"]
  },
  "preference-inference": {
    s: "Learns the person's habits and choices from behavior, such as usual channel, time of day or typical request, to shorten conversations without asking.",
    d: "Signals from past turns and outcomes update simple per-person statistics or a model: the account most often asked about, the preferred contact method, the level of detail tolerated. The assistant uses them to pre-fill suggestions or skip questions, and always lets the person override. Inference should be transparent enough to explain ('your usual account') and bounded to low-risk uses. It is hard to avoid the creepy line: personalization that reveals how much the system knows, or that guesses about sensitive traits, reduces trust more than it saves time.",
    k: ["Suggest and confirm versus act on the inference: suggesting is safe and teaches the model, while acting saves a turn but risks wrong, unexplained behavior.", "Individual models versus population defaults: individual models fit better but need history and storage, while defaults work for new users and are easier to govern."],
    p: ["The system defaults to the usual account and the person transfers money from the wrong one.", "Inferences are based on a shared device and apply one household member's habits to another."],
    v: "Simulate a person who always asks about one account. Confirm the assistant offers it first, a different choice is respected and updates the preference, and the person can see and reset what was inferred.",
    dep: ["user-profile-store", "conversation-history-store", "memory-controls"]
  },
  "memory-controls": {
    s: "Settings and mechanisms that let people see, correct, pause and delete what the assistant remembers, and that enforce those choices everywhere data is held.",
    d: "A person can ask 'what do you remember?', correct a fact, say 'forget that', or turn memory off, in conversation or in an account page. The controls propagate to the profile, long-term memory, caches, derived summaries and analytics copies, and are checked at read time so deleted items cannot be recalled. Consent is recorded with time and wording. For organizations, administrators set limits and retention. It is hard because personal data is copied into many places, including prompts, logs and backups, and because proving deletion requires knowing every place it went.",
    k: ["Delete by reference across all stores versus time-based expiry only: reference deletion honors requests promptly but needs a data map, while expiry is simpler but leaves data longer.", "Memory on by default versus opt-in: on by default personalizes sooner, while opt-in respects consent in stricter jurisdictions and reduces surprise."],
    p: ["A deleted memory persists in a cached summary and is spoken again the next day.", "The controls change the profile but not the analytics copy of the same data."],
    v: "Create a memory, ask the assistant what it remembers, delete the item, and confirm that it is absent from profile, memory search, summaries and analytics export, and that a fresh conversation does not mention it.",
    dep: ["retention-and-deletion", "audit-trail"]
  }
});
