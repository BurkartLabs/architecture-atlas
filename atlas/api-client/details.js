// Details for the API client plate, part 1: interface, collaboration, request building, cross-cutting concerns.
ATLAS.details("api-client", {
  "request-tabs": {
    s: "The workspace shell that holds many open requests at once, with unsaved drafts, pinned items and restorable sessions, so a person can work on several calls side by side.",
    d: "Each tab holds a request in an editable draft state separate from the saved copy, along with its own response and scroll position. The shell tracks which drafts differ from saved versions, restores them after a crash, and keeps tab state when the sidebar is reorganized. It talks to the collection tree for saving and to the local database for session recovery. The difficulty is draft identity: a tab must survive its request being renamed, moved or deleted by a teammate through sync.",
    k: ["Drafts as separate objects versus edits written straight to the saved request: drafts allow safe experimentation and cheap discard, but create a second copy that must be reconciled on sync.", "Persisting every keystroke versus saving on pause: constant persistence survives crashes, at the cost of disk churn with large bodies."],
    p: ["A draft tab keeps pointing at a request that was deleted remotely, and saving it silently recreates the request in the wrong folder.", "Hundreds of restored tabs with large responses make startup slow and memory heavy."],
    v: "Edit a request without saving, kill the process, relaunch, and confirm the draft returns with its unsaved edits, then delete the saved request from another client and confirm the tab is flagged as orphaned.",
    dep: ["local-database", "collection-tree"]
  },
  "request-editor": {
    s: "The form and text surface where a person sets method, URL, parameters, headers, authentication and body, with variable highlighting and validation as they type.",
    d: "It is a set of coordinated panels bound to one request model. Changing the URL updates the query table, and editing the table rewrites the URL, so both views are projections of one structure. Variable references such as double-brace names are highlighted and resolved against the active environment to show their current value on hover. It calls the template engine for previews and the header editor and serializers for the details. Hard parts are round-tripping odd URLs without altering them and keeping large forms responsive.",
    k: ["Structured model with derived text versus raw text parsed on demand: a structured model is easier to validate and diff, but can reformat input the person typed deliberately.", "Validating while typing versus on send: early feedback catches mistakes, but flags half-typed input and distracts."],
    p: ["Re-serializing the URL normalizes encoding and silently changes a request that was deliberately malformed to test a server.", "Variable highlighting resolves against the wrong environment, so a person believes they are hitting staging."],
    v: "Type a URL containing an unusual escape sequence, send it, and compare the request line in the network log byte for byte with what was typed. Confirm no normalization occurred.",
    dep: ["url-builder", "header-editor", "template-interpolation", "body-editors"]
  },
  "body-editors": {
    s: "Syntax-aware editors for JSON, XML, text and binary bodies, with formatting, folding and error markers that stay fast on payloads of many megabytes.",
    d: "A text editor component is configured per content type, with a tokenizer, a formatter and lightweight validators. Binary bodies use a file picker or hex view. Large documents need virtualized rendering and incremental parsing, because tokenizing a multi-megabyte string on the main thread freezes the interface. Variable references inside bodies must be highlighted without being mistaken for syntax errors. The same component is reused for the response viewer, scripts and documentation, so its behavior is a shared dependency.",
    k: ["Full tokenization versus viewport-only highlighting: full parsing gives accurate folding and errors, but large payloads hang; viewport-only is fast but gives approximate structure.", "Auto-formatting on paste versus preserving input: formatting is convenient, but destroys whitespace that some servers or signatures depend on."],
    p: ["Pretty-printing changes the bytes of a signed body, so a signature computed before editing no longer matches.", "A variable placeholder inside a JSON string is flagged invalid, training people to ignore error markers."],
    v: "Open a 20 MB JSON body, scroll and type at the end, and confirm input latency stays imperceptible and no long main-thread task appears in a performance trace.",
    dep: ["template-interpolation"]
  },
  "response-viewer": {
    s: "Shows status, headers, cookies, timing and a body rendered by content type, with search, filtering and raw, pretty and preview modes.",
    d: "The body is decoded from bytes using the declared charset, then rendered by type: formatted structured text, an image, a rendered page in an isolated frame, or a hex dump. It offers search and query filters such as JSONPath over the body. The viewer must not execute content from the server in the tool's own privileged context, and must cope with streaming responses that arrive over time. It is hard because responses are untrusted, unbounded in size and often mislabeled.",
    k: ["Rendering previews in the tool's process versus an isolated frame: in-process is faster and simpler, but untrusted markup could reach local capabilities; isolation costs startup and messaging.", "Loading the full body versus truncating with a download option: full loading lets search work everywhere, but large responses exhaust memory."],
    p: ["A preview of an HTML response runs script from the server inside the application window with access to local APIs.", "A mislabeled charset produces garbled text, and the person blames the server rather than the decoder."],
    v: "Fetch a response with a hostile script in an HTML body and confirm the preview executes nothing with access to the tool. Fetch a 200 MB body and confirm the interface stays responsive.",
    dep: ["body-editors", "response-decoding", "response-queries"]
  },
  "code-generation": {
    s: "Turns a request into equivalent code or a command line for another client or language, so a working call can be copied into an application.",
    d: "A generator walks the fully resolved request model and emits text through per-target templates. It must decide how to represent variables, authentication, multipart bodies and files, and whether to inline secrets. Output should reproduce the same bytes on the wire, which requires matching how the target's own library encodes parameters and sets default headers. It is hard because libraries add headers and encodings of their own, so a generated snippet can behave differently from the tool's request.",
    k: ["One template per target versus a shared intermediate form: templates are simple to add, but duplicate logic; an intermediate form is consistent but harder to extend for library quirks.", "Resolving variables in output versus leaving placeholders: resolved output runs immediately, but may copy secrets into code and chat."],
    p: ["Generated code embeds a live bearer token that is then committed to a repository.", "The snippet omits a header the tool adds implicitly, so it fails against a server that required it."],
    v: "Generate a snippet for a multipart request with a file, run it against an echo endpoint, and compare the received bytes with the tool's own request. Confirm headers and boundaries are equivalent.",
    dep: ["request-pipeline", "body-serializers", "redaction"]
  },
  "console-pane": {
    s: "A log of every request and response the tool performed, including those from scripts, with raw headers, redirects and script output for diagnosing what really went on the wire.",
    d: "The pane subscribes to events from the request pipeline: each outgoing request as sent, each response as received, redirect hops, script console output and errors. It shows the final resolved values, not the templates. Entries link back to the originating request. Because it reveals the real messages, it is the first place to look when a server rejects a call that looks correct. It is hard because it must record faithfully without retaining large bodies or secrets indefinitely.",
    k: ["Recording raw wire bytes versus the parsed model: raw bytes show exactly what happened, but require hooks deep in the transport and complicate compressed or encrypted streams.", "Unlimited log retention versus a rolling window: unlimited helps late debugging, but grows memory and holds sensitive data longer."],
    p: ["The log shows the request after the tool normalized it, hiding the very difference that caused the failure.", "Authorization headers remain visible in the log and appear in screenshots shared for support."],
    v: "Send a request that follows two redirects and confirm the log shows three requests with their own headers, plus the output of a console call made in a script.",
    dep: ["request-pipeline", "redaction"]
  },
  "workspaces-and-roles": {
    s: "The sharing boundary for a team: who belongs to a workspace, what each member may view or edit, and which collections and environments are visible to whom.",
    d: "A workspace groups collections, environments and mocks under one membership list with roles such as viewer, editor and admin. Permissions apply to whole workspaces and sometimes to individual collections. A directory or single sign-on integration can provision members. The server enforces roles on every sync and API call, while the client hides unavailable actions. It is hard because shared and personal scopes mix: a person may want a private environment inside a team workspace.",
    k: ["Coarse workspace-level roles versus per-item permissions: coarse roles are easy to reason about, but force teams to split workspaces; per-item rules are flexible and hard to audit.", "Visibility by default versus explicit sharing: open defaults aid discovery, but risk exposing internal endpoints and credentials."],
    p: ["A departed member keeps a local copy of every shared collection, including values that were never rotated.", "Public workspaces expose internal URLs and example payloads containing real data."],
    v: "Add a viewer to a workspace, attempt an edit through both the interface and the sync API, and confirm both are refused by the server rather than only hidden in the client.",
    dep: ["account-sync", "audit-log"]
  },
  "shared-collections": {
    s: "Keeps one collection consistent across many people's machines, merging concurrent edits to requests, folders and scripts without losing work.",
    d: "Changes are recorded as operations on a tree of items and sent to a server, which orders them and distributes them to other clients. Clients apply remote changes while the person may be editing the same request. The system must resolve moves, renames and deletes that cross, and keep drafts safe. It depends on the account sync channel and the collection format. It is hard because a tree with reordering and nested moves is harder to merge than flat records, and users notice every lost edit.",
    k: ["Operation-based merging versus whole-document last-writer-wins: operations preserve concurrent edits to different fields, but need ordering and tombstones; last-writer-wins is simple but silently discards work.", "Live updates versus explicit pull: live updates keep teams aligned, but change a request under someone who is mid-edit."],
    p: ["Two people reorder the same folder at once and the result duplicates or drops requests.", "A remote delete removes a request that another member's runner schedule still references."],
    v: "Edit the same request from two clients while one is offline, reconnect, and confirm both edits to different fields survive and the conflicting field is surfaced rather than overwritten.",
    dep: ["account-sync", "collection-tree", "workspaces-and-roles"]
  },
  "forks-and-merges": {
    s: "Lets a person copy a collection, change it in isolation and propose the changes back, with a visible diff and a review step before they reach the shared version.",
    d: "A fork records its parent and a base version. A merge request computes a structured diff between fork and parent, request by request and field by field, and applies accepted changes. It reuses the collection format's stable item identifiers so renames are not mistaken for delete and add. It is hard because diffs of scripts, bodies and settings need to read well to a reviewer, and because the parent may have moved on since the fork.",
    k: ["Structured diffs versus text diffs of the stored file: structured diffs read well and merge by field, but require a stable model; text diffs work with any tool but are noisy.", "Forks of whole collections versus branches within one: forks isolate cleanly, but multiply copies that drift; branches keep one lineage but complicate sync."],
    p: ["A fork never receives later changes to the parent, so it keeps testing an old version of the API.", "Merging reorders items and produces a diff too large for anyone to review properly."],
    v: "Fork a collection, change one header and one script, open a merge request, and confirm the diff lists exactly those two changes and nothing else after the merge is accepted.",
    dep: ["shared-collections", "collection-format"]
  },
  "published-docs": {
    s: "Turns a collection into browsable, shareable documentation with examples, so API consumers can read and try requests without receiving the whole workspace.",
    d: "A renderer takes descriptions, saved examples and request definitions and produces a page, hosted by the service or exported as static files. Variables are shown as placeholders, and secret values are excluded. A try-it action may load the request into the viewer's own client. Links carry a visibility setting: private, team or public. It is hard because the published output must stay current with the collection, while never leaking values that were present in the source.",
    k: ["Live rendering from the collection versus a published snapshot: live pages never go stale, but expose work in progress; snapshots are controlled but need a deliberate republish.", "Showing resolved example values versus placeholders: resolved values are more illustrative, but may expose real identifiers."],
    p: ["A public documentation page includes a real token left in a saved example.", "Documentation drifts from the live API because nobody republishes after a change."],
    v: "Publish a collection whose environment contains a secret variable and confirm, by searching the rendered page source and exported files, that the secret value appears nowhere.",
    dep: ["documentation-generator", "request-examples", "redaction"]
  },
  "audit-log": {
    s: "An append-only record of who changed what in a workspace and when: membership, permissions, collection edits, secret access and publication.",
    d: "Server-side events are written with an actor, an action, a target, a time and a source address, and can be filtered, exported or streamed to a security system. Client-side changes are only logged once synced, so the log reflects what the service saw. It must not store secret values themselves, only that a secret was changed or read. It is hard because the interesting questions, such as who altered a script that touches production, require fine-grained change events, not just a note that the collection was saved.",
    k: ["Fine-grained field events versus per-save summaries: fine events answer who changed which line, but multiply volume; summaries are cheap and cannot answer detailed questions.", "Log inside the product versus export to an external system: built-in is convenient, but retention is limited and tamper resistance is weaker."],
    p: ["The log records the new value of a changed secret, turning the audit trail into a credential store.", "Offline edits appear with the sync time, attributing changes to the wrong moment."],
    v: "Change a member's role and edit a pre-request script, then confirm two entries appear with actor, target and time, and that no secret value appears in either.",
    dep: ["workspaces-and-roles", "account-sync"]
  },
  "repository-sync": {
    s: "Stores collections as files in a source repository, so requests are versioned, reviewed and branched with the same process as the application code they test.",
    d: "The tool reads and writes a directory of plain files: one per request or folder, in a stable order and format. Changes made in the interface become file edits, and edits made by other means, such as a branch checkout, are picked up by a file watcher. It relies on the collection format being deterministic so diffs are small. It is hard because merge conflicts happen in files the tool must then re-read safely, and because secrets must never be written into the tracked files.",
    k: ["One file per request versus one file per collection: per-request files merge cleanly and diff well, but create many files; a single file is portable but conflicts constantly.", "Tool-managed commits versus leaving version control to the person: automation reduces friction, but hides history decisions."],
    p: ["The tool rewrites every file with different key ordering, producing a commit that touches the whole collection.", "An environment file with real credentials is committed because it sat in the same directory."],
    v: "Change one request, save, and run a diff on the working directory: exactly one file should differ, by only the edited lines, with no environment secrets in any tracked file.",
    dep: ["workspace-files", "collection-format", "secret-scanning"]
  },
  "url-builder": {
    s: "Parses and composes the request URL, handling scheme, host, port, path segments, path parameters and percent-encoding without changing what the person meant.",
    d: "The URL is held as components, not a single string, so edits to the host or a path parameter do not disturb the rest. Placeholders in the path, such as colon-prefixed names, are substituted from a table. Encoding rules differ by component: a space in a path, a query and a fragment each encode differently, and reserved characters need judgment. It hands off to the query editor and the HTTP client. It is hard because real-world URLs are often technically invalid, and testing them is a legitimate purpose.",
    k: ["Strict standard parsing versus lenient parsing that preserves input: strict parsing prevents mistakes, but refuses to send malformed requests that need testing; lenient keeps flexibility and risks sending garbage.", "Encoding on entry versus encoding at send: encoding on entry shows the final form, but double-encodes when pasted values are already escaped."],
    p: ["A value containing a percent sign is encoded twice, so the server receives a different identifier.", "Internationalized host names are converted differently by the builder and by the transport, failing name resolution."],
    v: "Send a path with a literal encoded slash and a plus sign in a query, and read the request line the server received. Both must arrive as typed.",
    dep: ["variable-scopes", "template-interpolation"]
  },
  "query-params": {
    s: "A table of query parameters that stays synchronized with the URL, supporting toggling, repeated keys, arrays and variable values.",
    d: "Each row has a key, a value, a description and an enabled flag. Disabled rows are kept in the saved request but left out of the URL, which is why the table is a separate structure rather than just URL text. The editor serializes enabled rows into the query string and parses pasted URLs back into rows, preserving order and duplicates. Array notation differs between servers, so the tool may offer a choice of styles. The hard part is order and duplicate preservation, which servers sometimes depend on.",
    k: ["Ordered list of pairs versus a map: a list preserves order and repeats that some servers and signatures need, while a map is easier to script against and silently drops duplicates.", "Disabled rows retained in the saved request versus removed: retention supports quick toggling, but can leak unused or sensitive parameters into shared collections."],
    p: ["Repeated keys collapse into one when a script reads parameters as a map, hiding a bug that only the server sees.", "Parameters added by a signing helper are included in the table and then signed twice."],
    v: "Add a repeated key and a disabled parameter, send, and confirm the server sees the repeat in order and does not see the disabled one.",
    dep: ["url-builder", "template-interpolation"]
  },
  "header-editor": {
    s: "A table for request headers with name completion, value hints, enable toggles, and a clear view of headers the tool adds automatically.",
    d: "Rows hold names and values with variable support. The tool also computes implicit headers such as content length, content type, host, accept encoding and user agent, and shows them as read-only rows that the person can override. Header names are case-insensitive but their case and order can matter to some servers, so the editor preserves what was typed. Hidden defaults are the hard part: a person must be able to see everything actually sent, and to remove a default on purpose.",
    k: ["Showing automatic headers explicitly versus hiding them: showing them explains behavior and surprises, but clutters every request; hiding them is clean and mystifying when something differs from a real client.", "Letting people suppress defaults versus protecting them: suppression allows testing broken clients, while protection prevents accidental invalid requests."],
    p: ["A stale content type header left from a previous body type makes the server parse the new body incorrectly.", "A pasted header value with a trailing newline splits into two headers."],
    v: "Open the console after sending and compare the header list with the editor. Every automatic header must be visible in the editor view, and an overridden one must show the person's value.",
    dep: ["template-interpolation", "body-serializers"]
  },
  "body-serializers": {
    s: "Converts the structured body, such as raw text, form fields, encoded pairs, binary or structured documents, into the exact bytes and content type to send.",
    d: "Each body mode has a serializer: raw text with an assigned content type, URL-encoded pairs, multipart parts, a file stream, or a structured document with variables substituted. Serializers run after variable resolution and set content type and length headers. Streaming file uploads avoid loading the whole file into memory. It is hard because encoding differences are subtle: line endings, charset, and escaping of special characters change the bytes, and a signature or checksum computed over them will not forgive any difference.",
    k: ["Serialize at send time versus at edit time: send-time keeps the stored model clean, but the person never sees the final bytes until later; edit-time previews bytes and duplicates state.", "Streaming files versus reading into memory: streaming handles huge uploads, but prevents retry and content-length computation without a second pass."],
    p: ["Windows-style line endings are added in a raw body, breaking a hash the server verifies.", "Variables substituted into a JSON string are not escaped, producing invalid JSON when a value contains a quote."],
    v: "Send a body containing quotes, non-ASCII characters and a variable value with a backslash to an echo endpoint, and compare the received bytes to the expected encoding.",
    dep: ["template-interpolation", "multipart-encoder"]
  },
  "multipart-encoder": {
    s: "Builds multipart bodies from text fields and files, choosing boundaries, per-part headers and encodings, and streaming large files without loading them whole.",
    d: "Each part has a name, an optional file name, a content type and content. The encoder picks a boundary string that does not occur in any part, writes part headers, and emits parts in order. File parts are read from disk at send time, and relative paths resolve against the workspace. It must handle non-ASCII file names, which are encoded differently by different servers. It is hard because servers differ in how strictly they parse boundaries, and a collection that references local files breaks when shared.",
    k: ["Streaming parts from disk versus buffering the whole body: streaming scales to large files, but cannot easily compute a length or retry after a redirect.", "Absolute file paths versus workspace-relative: absolute paths always work locally, but make shared collections fail on other machines."],
    p: ["A shared collection references a file in the author's home directory and fails for everyone else without a clear message.", "A file name with accented characters is mangled, so the server rejects the upload."],
    v: "Upload a binary file and a text field in one request to a server that echoes a checksum, and confirm the checksum matches the file on disk, including for a name with non-ASCII characters.",
    dep: ["body-serializers", "workspace-files"]
  },
  "graphql-composer": {
    s: "A query editor for graph-style APIs with variables, operation selection and schema-aware completion, sending the query and variables as one structured request.",
    d: "The composer holds a document, a variables object and an operation name, and sends them as a request body. Using a cached schema from introspection, it offers completion, argument hints and validation before sending. Documents may contain several operations, so the person picks one. Subscriptions use a long-lived connection instead of one request. It is hard because schemas are large, introspection may be disabled in production, and validation against an out-of-date schema produces false errors.",
    k: ["Validating locally against a cached schema versus letting the server reject: local validation is instant and guides authors, but can be wrong when the cache is stale.", "Sending as a JSON body versus a query string: body encoding handles large documents, while query strings suit caching and simple links."],
    p: ["Cached schema is out of date, so completion suggests fields that no longer exist.", "A variable of the wrong type is coerced silently by the editor and rejected only on the server."],
    v: "Write a query using a field removed from the schema since the last introspection, and confirm the editor flags it after a refresh and the server error matches the same field.",
    dep: ["graphql-introspection", "body-serializers", "websocket-client"]
  },
  "rpc-message-builder": {
    s: "Builds binary RPC request messages from a form or structured text using a service definition, including nested messages, repeated fields and enumerations.",
    d: "The person edits a structured representation, and the builder validates it against a message descriptor, then encodes it into the compact binary wire format. Descriptors come from files or from server reflection. It must handle default values, unknown fields, oneof groups and well-known types such as timestamps. It talks to the RPC client for transport. It is hard because the structured text hides how defaults and missing fields map to what is actually sent.",
    k: ["Form generated from descriptor versus free-form text: forms prevent mistakes and enumerate fields, but are slow for deeply nested messages; text is fast and error prone.", "Omitting default-valued fields versus sending them: omission matches typical encoders, but hides the difference between unset and zero."],
    p: ["A field renamed in a newer descriptor is silently dropped, so the call succeeds with missing data.", "Large integers are shown as floating-point numbers and lose precision on re-encode."],
    v: "Build a message with a repeated nested field and a 64-bit integer above 2^53, send it to an echo service, and confirm the decoded response has identical values.",
    dep: ["rpc-descriptors", "rpc-client"]
  },
  "script-trust-boundary": {
    s: "Scripts in shared collections are code from other people that runs with the user's network access and credentials, so every scripting feature has to answer what a script may touch.",
    d: "Collections are imported from teammates, public links and repositories, and their scripts run when a request is sent, often without being read. A script can read variables, call other hosts, read the cookie jar and, if allowed, the file system. The decision runs through the sandbox, scripting API, runner, library loading and sharing. Tight isolation limits power and breaks legitimate automation; loose isolation turns an imported collection into a way to steal tokens. Workspace trust prompts, permission scopes and network allow lists are the usual tools.",
    k: ["Run all scripts freely versus ask for trust per workspace: free running is convenient, but any imported collection can exfiltrate secrets; trust prompts add friction people learn to click through.", "Full runtime access versus a narrow API: full access enables rich automation, while a narrow API is auditable and limits what scripts can do."],
    p: ["A public collection's pre-request script posts every environment variable to an outside host.", "A trust prompt appears so often that people approve everything by habit."],
    v: "Import a collection whose script attempts to read a file and call an unlisted host. Confirm both attempts are blocked or prompted, and that the attempt is visible in the console.",
    dep: ["script-sandbox", "scripting-api", "secret-variables"]
  },
  "secrets-versus-sharing": {
    s: "Features that copy data, such as sync, export, history, documentation and code generation, all risk carrying credentials, so secrets need a scope that every such feature respects.",
    d: "A credential used in a request flows into many places: the saved request, the console, history, snapshots, generated code, exports and shared environments. Each feature was built to preserve fidelity, and each can leak. The decision is where secrets live, how they are marked, and which features must strip or mask them. Marking a variable secret has to change behavior everywhere, not only in one view. Local-only storage prevents leaks and prevents teammates from running the same request.",
    k: ["Secrets shared with the team versus kept per person: sharing lets everyone run requests immediately, but multiplies the exposure; per-person values are safer and require each member to set them up.", "Masking at display versus never storing in synced data: display masking is cheap, while exclusion from storage is the only guarantee against later leaks."],
    p: ["A secret marked in the environment still appears in history because history stores resolved requests.", "An export for a bug report includes the full environment."],
    v: "Mark a variable secret, send a request, then export, sync, generate code and open history. Search every output for the value: it must appear in none of them.",
    dep: ["secret-variables", "redaction", "request-history", "account-sync"]
  },
  "run-reproducibility": {
    s: "A test run is only useful if it can be repeated: the same collection, data and environment should give the same verdicts, and differences should be explainable.",
    d: "Anything that varies between runs works against that goal: dynamic variables, current time, random data, token expiry, order of requests, state left on the server by earlier runs and variables changed by scripts. The decision covers seeding random values, isolating each run's state, recording what was resolved, and making runs from the interface and from CI use the same engine. It also covers capturing enough information, such as the resolved requests and environment snapshot, to compare a failed run with a passing one.",
    k: ["Seeded dynamic values versus fully random ones: seeds allow exact replay, but reduce the variety that finds bugs; randomness explores more and makes failures hard to repeat.", "Recording full run artifacts versus only results: artifacts allow diagnosis, but are large and may hold secrets."],
    p: ["A test passes locally and fails in CI because a variable persisted by a previous interactive session was never reset.", "Time-based data makes a snapshot comparison fail every day."],
    v: "Run the same collection twice with the same seed and data file, then diff the resolved requests and results: they should match except for explicitly time-based fields.",
    dep: ["collection-runner", "dynamic-variables", "variable-scopes", "report-generators"]
  },
  "client-fidelity": {
    s: "The tool is a stand-in for real clients, so its requests should match what applications send, including headers, ordering, connection reuse, encodings and errors.",
    d: "Differences show up as bugs that appear only in the tool or only in the application. Common sources are default headers, header case and order, how query parameters are encoded, connection pooling, protocol version negotiation, certificate validation and cookie behavior. The decision is whether to imitate a browser, a common library or a neutral baseline, and how visibly to expose the differences. It touches the request editor, the pipeline, the HTTP client and the TLS stack, and it matters most when debugging works in one place and fails in another.",
    k: ["Imitating a browser versus a minimal neutral client: browser behavior matches web applications, but hides how server-to-server callers behave; a neutral client is predictable and matches no one exactly.", "Strict adherence to the specification versus tolerant behavior: strictness exposes server bugs, while tolerance matches the lenient real clients."],
    p: ["A request succeeds in the tool because it sends no cookie, and fails in the browser because a stale cookie is attached.", "The tool negotiates a newer protocol version than the application, so a middlebox bug never shows."],
    v: "Send the same call from the tool and from the target application to a capture endpoint, and diff the full request: the difference list should contain only intentional, visible items.",
    dep: ["request-pipeline", "http-client", "tls-stack", "header-editor"]
  },
  "format-portability": {
    s: "Collections are an investment, so how they are stored, versioned and exchanged decides whether they survive a change of tool, a team merge or a format upgrade.",
    d: "The tool defines a file format with fields, scripting conventions and variable syntax. Others can read it, convert it, or be locked out. Decisions include whether the format is documented, versioned and stable, whether scripts use tool-specific APIs, and how well it round-trips through open schema descriptions. Exporters and importers carry the load, and every proprietary feature, such as special authentication, creates something that does not convert. Portability favors a small common core with explicit extensions.",
    k: ["Tool-specific rich format versus a minimal common one: rich formats keep every feature, but lock people in; minimal formats travel and lose detail.", "Versioning the format with migrations versus tolerant readers: explicit versions make upgrades controlled, while tolerant readers avoid breaking old files but accumulate ambiguity."],
    p: ["An export drops scripts that use vendor-specific functions, and the imported collection runs without its tests.", "A format upgrade makes files unreadable by older versions on teammates' machines."],
    v: "Export a collection with scripts, variables and examples, import it into a second tool or a fresh install, and compare the request count, variables and assertions: nothing should be lost silently or reported only as a warning nobody reads.",
    dep: ["collection-format", "format-converters", "scripting-api"]
  },
  "scale-of-data": {
    s: "Large collections, large responses, long histories and many iterations stress a tool built for small interactive use, and each layer needs a limit and a plan for exceeding it.",
    d: "Typical failure points: a response of hundreds of megabytes loaded into an editor, a collection of thousands of requests rendered in a sidebar, history that grows for years, a runner holding all results in memory, and a sync of a whole workspace on every launch. The decision is where to stream, paginate, index, truncate or spill to disk. It crosses the viewer, tree, local database, runner and reports. The tool is judged by how it behaves in the unfriendly case, not the demo.",
    k: ["Truncating by default versus loading everything: truncation protects the interface, but hides data people expect to search; full loading is complete and can freeze or crash.", "Incremental sync versus full sync at launch: incremental is fast at scale and harder to make correct; full sync is simple and slow."],
    p: ["A collection run of fifty thousand iterations holds every response and exhausts memory before reporting.", "History grows without a cap and slows search and startup after a year of use."],
    v: "Open a collection with ten thousand requests, load a 200 MB response, and run ten thousand iterations: startup, scrolling and memory use should stay within stated limits, with truncation shown clearly where applied.",
    dep: ["response-viewer", "collection-tree", "local-database", "collection-runner"]
  }
});
