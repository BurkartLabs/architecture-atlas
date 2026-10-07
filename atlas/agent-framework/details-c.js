// Details for the agent framework plate, part 3: memory and retrieval, tools and structured outputs.
ATLAS.details("agent-framework", {
  "working-memory": {
    s: "The state the agent keeps for the current task: its transcript, scratch notes, intermediate results and current plan, held inside or alongside the context window.",
    d: "Working memory is what the loop reads on each turn: recent messages, tool results, a notes field the agent can edit, and the plan status. Part of it lives in the prompt and part in run state, referenced by id so large results need not be pasted in. It lasts for the run and is discarded or distilled into long-term memory at the end. The challenge is that everything in it competes for the same limited window, and whatever is dropped is gone for the model.",
    k: ["Keep everything in the prompt vs keep large items by reference: in-prompt is always visible but fills the window; references save space and require an explicit step to fetch.", "Agent-editable scratchpad vs framework-managed state: a scratchpad lets the model preserve what it judges important but can record errors; framework state is reliable and only holds what code puts there."],
    p: ["A scratchpad note records a wrong conclusion early, and every later turn treats it as established fact.", "Large tool outputs stay in working memory long after they are needed and crowd out the task."],
    v: "Run a task over twenty turns and confirm from the traced prompts that the notes field and plan status stay present and current, and that large results appear only as references after use.",
    dep: ["run-state","context-window-budgeting"]
  },
  "conversation-store": {
    s: "Durable storage of every message, tool call and result in a conversation, keyed by session, in order and with metadata.",
    d: "Each turn is stored as an event with role, content, tool-call ids, timestamps, token counts and model version. It is the source from which the context assembler rebuilds history, from which users see past sessions, and from which evaluation draws real examples. Storing the original, unabridged record separately from the compacted view the model sees keeps both usable. The difficulty is volume and privacy: transcripts grow fast, contain personal data, and need retention limits and deletion on request.",
    k: ["Store full raw content vs store references to large payloads: raw is simple to replay but bloats storage; references keep rows small and need a payload store with matching retention.", "Append-only events vs mutable message rows: append-only gives a faithful history and easy replay; mutable rows are simpler to edit and lose what was shown."],
    p: ["Messages are saved only at the end of a run, so a crash loses the whole conversation.", "Retention is set for the database but copies of transcripts remain in logs and trace storage."],
    v: "Kill a run midway and confirm every message and tool result up to the last completed turn is in the store, in order, and a reload reproduces the same prompt.",
    dep: ["run-journal","sensitive-data-filter"]
  },
  "long-term-memory": {
    s: "Facts, preferences and past outcomes stored outside any single run and recalled in later runs, per user, team or agent.",
    d: "Entries are short statements or structured records with a subject, content, source run, timestamp and scope. They can be written by the agent, extracted by a background process, or entered by people. They give continuity: a user's preferences, a project's conventions, lessons from earlier failures. The hard parts are what to keep, how to keep it correct when facts change, and how to keep it from crossing between users or from preserving injected content.",
    k: ["Free-text notes vs structured records: notes are easy for the model to write and read but hard to update precisely; structured records support exact lookup and conflict handling, at the cost of a schema.", "Per-user memory vs shared memory: per-user is private and personal; shared memory improves everyone's results and creates a path for one user's input to affect another."],
    p: ["A remembered fact is no longer true, and the agent confidently acts on it.", "Content from a web page is stored as a memory and later retrieved as if the user had said it."],
    v: "State a preference in one session, change it in another, and confirm a third session recalls the newer value, with the old one marked superseded and both traceable to their source runs.",
    dep: ["memory-write-policy","embedding-index","permission-model"]
  },
  "memory-write-policy": {
    s: "Rules for what becomes a long-term memory, when, from what source, and how conflicts with existing memories are resolved.",
    d: "A policy decides whether the agent writes memory directly, a post-run extractor proposes entries, or a person confirms. It filters for durability and relevance, deduplicates against existing entries, tags the source and trust level, and handles contradictions by superseding, merging or flagging. Without a policy, memory fills with noise and mistakes. The difficulty is that usefulness is only known later, so most policies err toward saving too much or too little.",
    k: ["Write on every run vs write only on explicit signals: automatic writing captures more and creates clutter and errors; explicit signals give clean memory and miss unstated lessons.", "Trust only user-stated facts vs also agent inferences: user-stated is reliable but sparse; inferences add coverage and can record the agent's own mistakes as facts."],
    p: ["The agent writes a summary of what it just did as memory, and each run adds near-duplicates.", "Anything marked as a user preference is stored even when it came from a document the agent read."],
    v: "Feed a run containing one real user preference, one inference and one injected sentence from a web page. Confirm only the preference is stored, the inference is flagged and the injected text is rejected.",
    dep: ["long-term-memory","trust-boundaries","sensitive-data-filter"]
  },
  "memory-retrieval": {
    s: "Selects which stored memories to bring into the current prompt, by similarity, recency, importance and filters, and formats them for the model.",
    d: "At turn start, or on demand through a memory tool, a query is formed from the current task and recent messages, memories are searched and ranked, and the top results are inserted with their source and age. Recall quality depends on query formation as much as on the index. Retrieving too much wastes the window, and too little hides the relevant fact. It is hard because relevance depends on the task, and old memories may be right, stale or about a different situation.",
    k: ["Automatic retrieval every turn vs retrieval as a tool the agent calls: automatic is reliable and always costs tokens; tool-based costs only when needed and depends on the model deciding to look.", "Rank by similarity alone vs blend with recency and importance: similarity is simple and surfaces old trivia; blended ranking fits human expectations and needs tuning."],
    p: ["A query built from the last message alone misses context, and the wrong memories are retrieved.", "Retrieved memories lack dates, so the model treats a two-year-old preference as current."],
    v: "Ask a question whose answer is a stored memory plus one near-duplicate distractor. Confirm the correct memory ranks first and appears in the prompt with its date and source.",
    dep: ["embedding-index","long-term-memory","context-assembler"]
  },
  "embedding-index": {
    s: "A searchable index of vector representations of memories or passages, supporting nearest-neighbor lookup, filters and updates.",
    d: "Text is converted to vectors by an embedding model and stored with metadata in an index built for approximate nearest-neighbor search, often combined with keyword matching. Queries use the same embedding model, so the model version is part of the index's identity: changing it requires re-embedding everything. Filters on user, scope and time keep results within permission. The difficulty is approximate recall, tuning chunk size and keeping the index consistent with the source as entries change or are deleted.",
    k: ["Vector-only search vs hybrid with keyword matching: vectors capture meaning and miss exact identifiers; adding keyword search recovers them, with a second index and merge logic.", "Re-embed on model change vs keep versions side by side: re-embedding is clean and takes time and money; dual indexes avoid downtime and double storage."],
    p: ["Mixing vectors from two embedding model versions in one index produces nonsense rankings with no error.", "A deleted memory remains retrievable because the index was not updated with the delete."],
    v: "Insert a known item, search with a paraphrase and an exact identifier, and confirm both find it. Delete it and confirm no query returns it afterward.",
    dep: ["provider-adapters","permission-model"]
  },
  "document-retrieval": {
    s: "Fetches passages from documents, code or databases the agent searches as a tool, with sources attached so answers can cite them.",
    d: "Exposed as one or more search tools, it takes a query from the model, searches indexed documents, applies access control, and returns ranked passages with identifiers and locations. The agent can search repeatedly with refined queries, which makes it more adaptive than a single retrieval before the call. The agent decides when it has enough. The difficulty is that results are untrusted text that becomes part of the prompt, and ranking errors silently shape the answer.",
    k: ["Agent-driven iterative search vs one retrieval step before the call: iterative search handles hard questions at higher cost and variance; a single step is cheap and fixed in quality.", "Return passages vs return whole documents: passages save tokens and may cut needed context; whole documents are complete and quickly fill the window."],
    p: ["The tool returns passages without sources, so the answer cannot be checked.", "A passage inside a retrieved document tells the agent to disregard its instructions, and it complies."],
    v: "Ask a question answerable from one specific document and confirm the answer cites it. Ask for a document the user may not read and confirm the tool returns nothing for it.",
    dep: ["embedding-index","prompt-injection-defense","permission-model","result-truncation"]
  },
  "tool-registry": {
    s: "The catalog of every tool an agent can call, with its name, schema, handler, permissions, limits and version, and the rules for which agents see which.",
    d: "Each tool is registered with a unique name, a description and parameter schema for the model, a handler, a risk level, timeouts, and whether it is read-only or has side effects. Registration can be static or discovered from external tool servers at startup or on demand. The dispatcher looks tools up here and the prompt builder reads descriptions from here. It matters as the single source of truth: if the prompt, the validator and the permission check read from different places, they disagree.",
    k: ["Static registration in code vs dynamic discovery at run time: static is reviewable and predictable; dynamic adds capabilities without release but means the tool set can change under a run.", "One global registry vs per-agent registries: a global registry is simple, and per-agent registries limit exposure and need more configuration."],
    p: ["Two tools register the same name and the later one silently replaces the earlier.", "A tool's schema changes while old runs are paused, and resumed calls fail validation."],
    v: "Register two tools with one name and confirm registration fails loudly. Remove a tool from an agent's list and confirm its calls are refused even if the model names it.",
    dep: ["tool-schemas","tool-allowlists"]
  },
  "tool-schemas": {
    s: "Machine-readable definitions of each tool's parameters and result: names, types, required fields, enumerations and descriptions.",
    d: "A schema in a standard format such as JSON Schema is given to the model so it forms correct arguments, and is used by the validator to reject incorrect ones. Good schemas use narrow types and enumerations, describe each field, and put constraints in the schema rather than the prose. They are the contract between model and code. The difficulty is that a schema the model can follow is simpler than the one the code ideally wants, and models handle deeply nested or ambiguous schemas poorly.",
    k: ["Flat simple parameters vs rich nested objects: flat schemas are followed more reliably; nested ones model the domain accurately and cause more malformed calls.", "Enumerations and strict types vs free strings: strict types prevent whole classes of errors but reject plausible variants the model naturally produces."],
    p: ["A required field has no description, and the model fills it with a guess.", "The schema accepts any string for an identifier, and the model invents ids that look valid."],
    v: "Generate arguments from the schema with a model on fifty varied requests and confirm the share that validate on the first attempt, and that each failure is reported with the field at fault.",
    dep: []
  },
  "argument-validation": {
    s: "Checks every model-produced argument against the tool's schema and business rules before the tool runs, and reports precise errors when they fail.",
    d: "Validation parses the arguments, applies type and range checks from the schema, then rules the schema cannot express: an identifier must exist, a path must stay inside the workspace, an amount must not exceed a limit, the caller must own the resource. Failures return a specific message to the model so it can correct. This is a security boundary, since arguments are attacker-influenced text. Validation belongs in code and cannot be replaced by instructing the model to be careful.",
    k: ["Reject invalid arguments vs coerce them: rejection is explicit and costs a retry; coercion, such as turning a string into a number, saves turns and can hide misunderstandings.", "Validate against the schema only vs also against live state: schema checks are cheap and stateless; state checks catch real errors and add a lookup per call."],
    p: ["A path argument is checked as text but not normalized, so a relative path escapes the allowed folder.", "The error message says invalid input without naming the field, and the model repeats the same call."],
    v: "Send arguments with a wrong type, an out-of-range number, and a path that escapes the workspace. Confirm each is rejected before execution with a message naming the field and reason.",
    dep: ["tool-schemas","permission-model"]
  },
  "api-adapters": {
    s: "Code that wraps an external service as a tool: authenticates, maps the model's arguments to the service's request, and maps the response to a result the model can use.",
    d: "An adapter hides the service's quirks: pagination, auth flows, error formats, rate limits and units. It exposes a few clear operations suited to a model, rather than mirroring every endpoint. It applies the caller's credentials from the broker, enforces timeouts, and shapes responses into compact results. Writing adapters is most of the work in a tool-using system. The difficulty is design: a thin one-to-one wrapper gives the model too many confusing options, while a thick one hides necessary control.",
    k: ["Thin wrapper per endpoint vs task-oriented tools: thin wrappers are quick to build and flood the model with choices; task-oriented tools perform better and take design effort per use case.", "Return the raw service response vs a curated one: raw is complete and noisy; curated saves context and risks omitting fields users need."],
    p: ["The adapter follows a service's pagination silently and pulls thousands of records into one result.", "Rate-limit errors from the service are returned as generic failures, and the agent retries into a longer ban."],
    v: "Call each adapter operation against a recorded or sandboxed service and confirm results contain the documented fields, errors map to distinct messages, and credentials never appear in the output.",
    dep: ["credential-broker","tool-timeouts-and-retries","result-truncation"]
  },
  "tool-protocol-client": {
    s: "A client for a standard protocol that lets the agent discover and call tools hosted by separate tool servers, in other processes or on other machines.",
    d: "The client connects to servers, lists the tools they offer with their schemas, and forwards calls, returning results in a common shape. This decouples tool authors from the agent framework and allows sharing one tool server among many agents. Tools discovered this way register into the tool registry. The cost is trust and control: a remote server defines names, descriptions and results that go straight into the prompt, and it runs outside the framework's own checks.",
    k: ["Remote tool servers vs in-process tools: servers allow reuse and isolation across teams, with network failure and a trust problem; in-process tools are faster and fully under the framework's control.", "Expose all discovered tools vs a reviewed allowlist: exposing all is convenient and lets a server add tools unnoticed; an allowlist is safer and needs curation."],
    p: ["A tool server changes a tool's description to include instructions, and every connected agent follows it.", "The connection drops mid-run and calls hang with no timeout."],
    v: "Connect to a test server, list its tools, and call one. Add a new tool on the server and confirm it is not exposed to the agent until it is approved in the allowlist.",
    dep: ["tool-registry","tool-allowlists","trust-boundaries","tool-timeouts-and-retries"]
  },
  "result-truncation": {
    s: "Limits the size of tool results before they reach the model, keeping the useful part and noting what was cut.",
    d: "Limits apply by tokens or characters, with strategies that suit the content: head and tail of logs, first rows and a count for tables, a summary or outline for documents. The cut part can be stored and made available through a follow-up call such as read more or search within result. The limit protects the context window and cost. The difficulty is that a blind cut hides the part that mattered, and the model may not realize the result is incomplete unless it is told.",
    k: ["Truncate by size vs summarize with a model: size cuts are free and predictable; summaries keep the gist and cost a call and can invent or drop facts.", "Hard limit for every tool vs per-tool limits: a global limit is simple; per-tool limits fit each output's shape and need to be maintained."],
    p: ["The result is cut without a marker, and the agent reports on partial data as if it were complete.", "The truncation point falls inside a structured result and leaves invalid JSON the model misreads."],
    v: "Return a result over the limit and confirm the model receives a bounded excerpt with a visible note stating what was omitted, and that the stored original can be fetched in full.",
    dep: ["tokenizer-and-counting","run-state"]
  },
});
