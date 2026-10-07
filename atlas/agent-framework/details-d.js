// Details for the agent framework plate, part 4: remaining tools and structured outputs, sandbox, guardrails.
ATLAS.details("agent-framework", {
  "tool-timeouts-and-retries": {
    s: "Per-call time limits and rules for retrying a failed tool call, distinguishing errors that are safe to repeat from those that are not.",
    d: "Every call has a deadline after which it is cancelled and reported as a timeout. Retries apply to transient failures such as network errors and rate limits, with backoff and a cap, and only when the call is idempotent or carries an idempotency key. The result tells the model that a retry happened. The difficulty is side effects: a timed-out write may have succeeded, so blind retry duplicates it, and the framework must either avoid retrying writes or make them safe to repeat.",
    k: ["Retry inside the tool layer vs return the error to the model: inside retries hide transient noise and save turns; returning the error lets the model choose a different approach and costs a model call.", "Short timeouts vs generous ones: short timeouts keep runs responsive and abort slow but valid work; generous ones finish more calls and let one stuck call stall the run."],
    p: ["A write times out, is retried, and both attempts take effect.", "Retry with no backoff against a rate-limited service extends the block and fails the whole run."],
    v: "Make a tool fail twice transiently and then succeed. Confirm exactly one effect occurs, the trace shows three attempts with backoff, and a non-idempotent tool without a key is not retried.",
    dep: ["idempotency-keys","retry-policy","error-classification"]
  },
  "structured-output-parser": {
    s: "Turns the model's reply into typed data matching a declared schema, and reports exactly what is wrong when it does not match.",
    d: "The framework declares a schema for the answer or for a step's result, asks for it through the provider's structured mode or through instructions, then extracts and validates the reply. Valid data is passed to code as typed values, so downstream logic does not parse prose. It enables workflow edges, finish tools and aggregation. The difficulty is the failure modes: truncated output at a token limit, extra commentary around the data, wrong field names, and values that match types but not meaning.",
    k: ["Provider-enforced structured mode vs parse-and-validate on plain output: enforced mode removes most format errors but limits schema features; parsing works with any model and needs repair paths.", "Strict schema vs permissive with defaults: strict fails fast and loudly; permissive keeps runs going with silently filled-in values."],
    p: ["The reply is cut off at the token limit and parses as a valid but incomplete object.", "A field has the right type and the wrong meaning, such as a date in the wrong format, and passes validation."],
    v: "Run a hundred requests through the parser and confirm every output is either valid against the schema or produces a specific error naming the field, and none passes with a missing required field.",
    dep: ["tool-schemas","response-parser","output-repair"]
  },
  "constrained-decoding": {
    s: "Restricts the model's token choices during generation so the output must conform to a grammar or schema, making format errors impossible.",
    d: "The serving side masks tokens that would break the grammar at each step, so the result always parses. It applies to JSON schemas, enumerations, regular patterns or custom grammars. It removes retries for syntax errors and makes small models usable for extraction. Support varies by provider and by schema feature. It guarantees form, not content: a constrained answer can be perfectly formatted and wrong, and tight constraints can push the model to choose a poor value over expressing uncertainty.",
    k: ["Constrain output vs validate afterward: constraints guarantee syntax and need provider support and a limited schema subset; post-validation is universal and needs retries.", "Allow a not-sure value in the schema vs force a choice: an escape value gives honest abstention; forcing a choice yields an answer even when none is right."],
    p: ["A schema feature is unsupported by the provider and is silently ignored, so outputs are unconstrained.", "The first required field forces the model to commit before reasoning, which lowers accuracy compared with a free reasoning field first."],
    v: "Send prompts designed to elicit prose and confirm every response parses against the grammar. Confirm that a schema with an abstain value yields it on an unanswerable input.",
    dep: ["generation-parameters","provider-adapters","tool-schemas"]
  },
  "output-repair": {
    s: "Fixes malformed model output by deterministic cleanup or by asking the model to correct its own mistake, with limits on attempts.",
    d: "Cheap repairs come first: strip code fences, remove commentary, close brackets, fix quotes. If the output still fails, the framework sends the invalid text and the validator's error back to the model and asks for a corrected version, up to a small number of tries. Each stage is logged so the rate of repairs is visible. The difficulty is that repair can change meaning, and a high repair rate is a symptom of a prompt or schema problem that repair merely hides.",
    k: ["Deterministic cleanup vs model-based repair: cleanup is free and predictable and handles only known patterns; model repair handles anything and adds cost and risk of changed content.", "Repair silently vs surface the repair rate: silent repair gives a smoother experience; tracked repair exposes degrading prompts before users notice."],
    p: ["Repair closes a truncated object and passes an incomplete result as a complete one.", "The repair prompt omits the original task, and the corrected output is valid but answers something else."],
    v: "Feed a set of known malformed outputs and confirm each is repaired or rejected with a recorded reason, and that the repair rate appears as a metric per prompt version.",
    dep: ["structured-output-parser","retry-policy","trace-capture"]
  },
  "code-interpreter": {
    s: "Lets the agent write code and run it to compute, transform data or test ideas, returning output and errors for the next step.",
    d: "The agent submits code to an execution service, which runs it in an isolated environment with files and installed packages, and returns text output, errors, generated files and plots. State may persist across calls within a run, like a notebook session. It turns arithmetic and data work from language guesses into computation. The difficulty is that generated code is unreviewed and may loop, consume memory or try to reach the network, so execution always needs isolation and limits.",
    k: ["Persistent interpreter state vs fresh process per call: persistence matches how people iterate and is hard to checkpoint and resume; fresh processes are reproducible and slower, losing variables.", "Return full output vs captured excerpt: full output is complete and floods context; excerpt is compact and may drop a needed line."],
    p: ["A cell loops forever and holds the sandbox until the run is cancelled.", "State kept in the interpreter is lost when the sandbox is recycled, and the agent continues assuming its variables exist."],
    v: "Run code that prints a computed value, raises an error, writes a file and loops forever. Confirm output, error, file and a timeout termination are each returned correctly and the sandbox remains usable.",
    dep: ["sandbox-isolation","resource-limits","workspace-filesystem","environment-images"]
  },
  "sandbox-isolation": {
    s: "Runs untrusted, model-written code behind a boundary so it cannot read host files, reach internal networks, or affect other runs.",
    d: "Isolation can be a container with restricted system calls, a lightweight virtual machine, or a language-level interpreter that exposes only chosen functions. Each run gets a fresh or reset environment with no credentials, a read-only base, and a writable scratch area. Strength is a trade-off with start time and cost. The difficulty is that the boundary is only as good as its configuration: shared kernels, mounted host paths, metadata endpoints and leftover files are common ways out or across.",
    k: ["Container isolation vs lightweight virtual machine: containers start fast and share the host kernel; virtual machines add a stronger boundary at higher start cost.", "Fresh sandbox per call vs per run: fresh per call is cleanest and slow; per run gives speed and state, and lets an earlier step contaminate a later one."],
    p: ["A host directory is mounted for convenience, and generated code reads files from it.", "A recycled sandbox keeps files from a previous user's run."],
    v: "From inside the sandbox attempt to read a host path, reach the metadata endpoint, and see another run's files. Confirm all three fail and that a new sandbox starts with a clean scratch area.",
    dep: ["resource-limits","network-egress-policy","environment-images"]
  },
  "workspace-filesystem": {
    s: "The working directory the agent reads and writes, with path rules, snapshots and a way to extract results.",
    d: "The workspace holds input files, generated artifacts and scratch data for a run. File tools operate on it with path normalization that keeps all access inside its root. Snapshots at checkpoints make rollback and resume possible, and a diff of the workspace shows what the agent changed. Large files are handled by reference. The difficulty is consistency: files written by tools running in different sandboxes, concurrent edits by several agents, and cleanup that must not delete results someone still needs.",
    k: ["Ephemeral workspace per run vs persistent project workspace: ephemeral is clean and safe and loses work between sessions; persistent supports continuity and accumulates drift and clutter.", "Snapshot the whole workspace vs track changed files only: whole snapshots are simple to restore and use space; change tracking is compact and needs reliable change detection."],
    p: ["A symbolic link inside the workspace points outside it and file tools follow it.", "Resume restores the conversation checkpoint but not the file state, so the agent believes files exist that do not."],
    v: "Write a file, take a checkpoint, modify the file, restore the checkpoint, and confirm both the transcript and the file contents match their checkpointed state.",
    dep: ["sandbox-isolation","checkpoint-store"]
  },
  "network-egress-policy": {
    s: "Controls which network destinations agent-run code and tools may reach, usually a short allowlist, with logging of every attempt.",
    d: "Outbound traffic from sandboxes passes through a proxy or firewall that permits only listed hosts and ports, resolves names itself to prevent rebinding, and blocks internal address ranges and metadata services. Package downloads go through a mirror. Allowing the network is often what makes an agent useful and what makes it dangerous: it is the path for data exfiltration and for fetching hostile instructions. The hard cases are tools that legitimately need broad web access.",
    k: ["Allowlist of hosts vs open internet with monitoring: an allowlist prevents exfiltration to unknown places and breaks tasks needing new sites; open access works and relies on detecting abuse after the fact.", "No network in the sandbox vs a proxied network: no network is the strongest and prevents installing packages or calling services; a proxy allows both under control."],
    p: ["An allowed host serves user content, and data is exfiltrated through it by writing to a public page.", "The sandbox can reach an internal service by its address because only names were filtered."],
    v: "From the sandbox request an unlisted host, an internal address and a listed host. Confirm the first two are blocked and logged, and the third succeeds through the proxy.",
    dep: ["sandbox-isolation","audit-log"]
  },
  "environment-images": {
    s: "Prebuilt, versioned images that define the operating system, installed packages and tools available inside the sandbox.",
    d: "An image holds interpreters, libraries, command-line tools and sometimes the project's source at a known version. Runs start from an image, so execution is reproducible and packages need not be downloaded each time. Images are built in a pipeline, scanned for vulnerabilities and pinned by digest. The trade-off is between small, auditable images and rich ones with everything the model may want. Missing packages cause confusing runtime errors the model tries to fix by installing things.",
    k: ["One large general image vs task-specific images: a general image works for most tasks and has a bigger attack surface and slower start; specific images are lean and need selection and maintenance.", "Install packages at run time vs bake them in: run-time installs are flexible and need network access and are slow; baked images are fast and fixed."],
    p: ["An image tag is moved to a new build, and runs that worked yesterday fail with a different library version.", "The agent loops trying to install a package the sandbox cannot reach."],
    v: "Start two runs from the same pinned image digest and confirm identical package lists. Confirm a command needing an absent package fails with a clear error naming it.",
    dep: ["resource-limits"]
  },
  "resource-limits": {
    s: "Hard ceilings on CPU, memory, disk, process count and wall-clock time for any sandboxed execution.",
    d: "Limits are enforced by the isolation layer, not by the code being run, and violations end the process with a distinct error that the agent can read. Per-call limits stop one bad cell; per-run limits cap total consumption. Memory and process limits stop fork bombs and runaway allocation, disk quotas stop endless writes. The difficulty is calibration: limits tight enough to contain abuse also kill legitimate heavy data tasks, and a killed process must report why, or the model assumes a bug in its code.",
    k: ["Tight default limits with a way to raise them vs generous limits: tight limits contain faults and need an escalation path; generous limits avoid false failures and let runaway code consume real money.", "Kill on exceed vs throttle: killing is clear and final; throttling lets work finish slowly and delays diagnosis."],
    p: ["An out-of-memory kill appears to the model as a vanished process with no message, and it rewrites correct code.", "Disk limits apply to the scratch directory but not to temp or cache directories."],
    v: "Run code that allocates memory without bound, forks repeatedly and writes endlessly. Confirm each is stopped at its limit with an error message naming the limit and no effect on other runs.",
    dep: []
  },
  "browser-and-desktop-control": {
    s: "Lets the agent operate a web browser or graphical desktop through screenshots, element trees and input events, for tasks that have no API.",
    d: "A controlled browser or virtual desktop runs in a sandbox. Each step returns a screenshot or a structured page description, and the model replies with an action such as click, type or scroll. This reaches systems built for people. It is slow, costly in tokens and fragile: layouts change, pages load asynchronously, and every page is untrusted input that may contain instructions. Confirmation steps and domain limits matter more here than for API tools.",
    k: ["Screenshot-based control vs page element trees: screenshots work on anything and cost more tokens and are imprecise; element trees are exact and compact and miss canvas content.", "Fully autonomous browsing vs confirmation on sensitive pages: autonomy completes tasks without help; confirmations on logins and payments cost interruptions and prevent costly mistakes."],
    p: ["A page contains hidden text that tells the agent to visit another site and submit the user's data.", "The agent clicks a button before the page finishes loading and acts on a stale view."],
    v: "Have the agent complete a form on a test site, then load a page with a hostile instruction and confirm the agent does not follow it and an attempted off-allowlist navigation is blocked.",
    dep: ["sandbox-isolation","network-egress-policy","prompt-injection-defense","approval-gates"]
  },
  "input-guardrails": {
    s: "Checks on incoming requests and retrieved content before they reach the model: policy classification, size limits, format checks and detection of attacks.",
    d: "Input checks run in parallel with or before the first model call. They apply rules and small classifiers to flag disallowed topics, personal data, attempts to override instructions, or malformed files, then block, rewrite or tag the content. Running them in parallel hides latency but may let the model start on content that is later blocked. Classifiers produce false positives that frustrate users and false negatives that attackers learn, so thresholds and review loops matter.",
    k: ["Block on detection vs flag and continue with reduced authority: blocking is simple and stops legitimate edge cases; flagging with restricted tools keeps the user served and requires a reduced mode.", "Check before the model call vs in parallel: before is safe and adds latency; parallel is fast and the model may act on content that is later rejected."],
    p: ["The guardrail checks the user's message and not the content of attached files or retrieved pages.", "A classifier is tuned on English examples and passes the same attack in another language."],
    v: "Run a labeled attack and benign set through the guardrail and confirm the block and false-positive rates against targets, and that blocked inputs appear in the audit log with the rule that fired.",
    dep: ["prompt-injection-defense","sensitive-data-filter","audit-log"]
  },
  "output-guardrails": {
    s: "Checks on what the agent says or sends out: policy compliance, leakage of secrets or personal data, claims lacking sources, and format.",
    d: "Output checks run on final answers, on drafted messages and on arguments to outbound tools such as email or posting. They use rules, pattern matching for secrets, classifiers and sometimes a reviewing model. On failure the output is blocked, redacted or sent back for revision. Checking tool arguments matters most, since a harmless-looking reply is less dangerous than a message sent to an outside party. Streaming complicates this: text may be displayed before the check completes.",
    k: ["Check complete output vs check incrementally while streaming: complete checks are accurate and delay display; incremental checks are fast and can retract only what was not yet shown.", "Block vs rewrite: blocking is safe and visible; rewriting preserves usefulness and risks altering meaning."],
    p: ["The check covers the chat reply but not the body of an email the agent sends through a tool.", "A redaction rule removes a pattern from the answer and leaves the same secret in the attached file."],
    v: "Make the agent produce a secret-looking string in a reply and in an outbound email body. Confirm both are blocked or redacted and each event is logged with its destination.",
    dep: ["sensitive-data-filter","permission-model","audit-log"]
  },
  "permission-model": {
    s: "The rules that define which actions each agent, user and tool may take on which resources, enforced in code regardless of what the model requests.",
    d: "Permissions combine the caller's rights, the agent's role, the tool's risk level and the resource. Decisions are allow, deny or require approval. They are checked at the dispatcher on every call and again inside tools that touch sensitive systems. The principle is that the model is an untrusted requester: it can be wrong or manipulated, so authority must come from the surrounding system. The difficulty is granularity and maintenance: coarse rules are too permissive, and fine rules are unmanageable.",
    k: ["Least privilege per run vs broad standing permissions: least privilege limits damage and needs the right grants requested for each task; standing permissions are easy and make every mistake costly.", "Static rules vs context-aware policy: static rules are predictable and easy to audit; context-aware policy handles real situations and is harder to reason about."],
    p: ["The agent inherits its owner's full access, so a manipulated run can do anything the owner can.", "Permissions are checked in the prompt layer only, and a second path to the same tool skips them."],
    v: "Grant an agent read-only access, then have it request a write through two different routes. Confirm both are denied at execution with the permission that failed named in the audit log.",
    dep: ["audit-log","credential-broker"]
  },
  "tool-allowlists": {
    s: "The explicit list of tools, and of argument patterns for each, that a given agent or run is permitted to call.",
    d: "The list is selected per role, task type or trust level. Tools not on it are neither shown to the model nor executable, so a model cannot call what it does not know about, and a call to it is refused anyway. Allowlists can include argument constraints, such as permitted directories, commands or domains. Unlike a prompt rule, they hold regardless of model behavior. The difficulty is keeping lists current as tools change, and the temptation to allow broad tools like a general shell that defeat finer rules.",
    k: ["Allowlist vs denylist: allowlists fail closed and require maintaining the list; denylists are easy to start and miss the dangerous tool nobody thought of.", "Allow a general shell vs narrow purpose-built tools: a shell is flexible and makes argument-level control nearly impossible; narrow tools are limited and checkable."],
    p: ["A new tool is added to the registry and automatically becomes available to every agent.", "A command allowlist permits an interpreter, and any command can be run through it."],
    v: "Call a tool not on the agent's list by name and confirm it is refused. Add a path-restricted tool and confirm a call outside its path is refused with the rule that applied.",
    dep: ["tool-registry","permission-model"]
  },
  "credential-broker": {
    s: "Issues short-lived, scoped credentials to tools at call time so the model and the prompt never see secrets.",
    d: "Tools ask the broker for a credential for a given user, service and scope. The broker checks policy, mints or fetches a token with narrow rights and short expiry, and returns it to the tool handler only. Secrets never enter prompts, logs or tool results, and each issuance is logged. It enables acting as the end user instead of a shared account. The difficulty is leakage by other routes: error messages, echoed headers, files written to the workspace, and long runs outliving tokens.",
    k: ["Per-call scoped tokens vs a long-lived service credential: scoped tokens limit blast radius and add a broker call and expiry handling; a service credential is simple and gives every call full reach.", "Broker inside the framework vs the existing identity provider: an in-framework broker is simple to wire; the identity provider centralizes policy and revocation across systems."],
    p: ["An API error echoes the request headers into the result, and the token is now in the transcript.", "A secret is placed in an environment variable inside the sandbox where generated code can print it."],
    v: "Run a tool call that authenticates and search the prompt, transcript, trace and result for the credential value. Confirm it appears nowhere, and the broker log shows the scope and expiry of the issued token.",
    dep: ["audit-log"]
  },
  "prompt-injection-defense": {
    s: "Measures that stop instructions hidden in untrusted content, such as web pages, documents or tool results, from steering the agent.",
    d: "No filter reliably separates data from instructions in text a model reads, so defenses are layered. Untrusted content is delimited and labeled, tools with side effects are limited after untrusted content enters the context, sensitive actions require approval, and outbound channels are restricted so stolen data has nowhere to go. Detection classifiers add a further signal. The structural defense is controlling what an injected instruction could do, not whether the model is fooled.",
    k: ["Detect and filter injected text vs limit the capabilities available after exposure: detection helps and will always miss some attacks; capability limits bound the damage of attacks that succeed.", "Separate agents for reading untrusted content and for acting: separation contains injection to a component with no powerful tools, with cost in handoffs and lost context."],
    p: ["The agent reads a web page and email in the same context where it holds permission to send email, so one page can trigger a send.", "A defense is tested only against known phrases and fails against the same request in a reworded form."],
    v: "Plant an instruction in a document the agent retrieves, asking it to send data elsewhere. Confirm the send is blocked or requires approval, and the attempt is logged with the source document.",
    dep: ["trust-boundaries","approval-gates","network-egress-policy","tool-allowlists"]
  },
  "sensitive-data-filter": {
    s: "Detects and masks personal data, secrets and regulated content in prompts, tool results, memory and logs.",
    d: "Detection combines patterns, checksums, dictionaries and classifiers. Matches are redacted, tokenized or blocked at defined points: before text is sent to a model provider, before it is written to memory or traces, and before it is shown to a user without access. Tokenization lets the agent work with a placeholder and restores the real value only at the final tool call. The difficulty is recall and context: names and addresses are hard to detect, and over-redaction breaks tasks.",
    k: ["Redact before the model sees it vs after the response: redacting first protects data from providers and may break tasks needing the value; redacting after protects users and exposes the data to the provider.", "Masking vs reversible tokenization: masking is simple and irreversible; tokenization preserves task function and requires a secure token vault."],
    p: ["Redaction is applied to the chat but not to traces and memory, so personal data is stored in plain form.", "Placeholders are not restored, and the agent emails a customer the token string."],
    v: "Send input with an invented account number, a name and an address. Confirm none reaches the provider payload or the stored trace, and that the final tool call received the real value.",
    dep: ["audit-log"]
  },
  "audit-log": {
    s: "A tamper-resistant record of who asked what, which tools ran with which arguments, what was approved or blocked, and what changed.",
    d: "Entries are written at decision points: authentication, permission checks, approvals, tool calls with arguments and results summaries, guardrail hits and credential issuance. They are append-only, timestamped, tied to the run and principal, and kept in storage the agent cannot modify. Unlike a debugging trace, the audit log is a record for review, compliance and incident response. It is hard to keep complete and safe at once, since the log itself must not become a store of secrets.",
    k: ["Log full arguments vs hashes or summaries: full arguments are complete for investigation and hold sensitive data; summaries protect data and may be too thin to explain an incident.", "Separate audit store vs reuse of the trace store: separate storage is tamper-resistant and has its own retention; reuse is simpler and mixes debug detail with compliance records."],
    p: ["The agent has write access to the same store and can edit its own history.", "Only successful calls are logged, and denied attempts, which show an attack, leave no record."],
    v: "Perform an approved action, a denied action and a blocked input. Confirm three entries, each with principal, run id, decision and rule, and that an attempt to modify an entry fails.",
    dep: []
  },
});
