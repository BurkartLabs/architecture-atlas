// Details for the language server plate, part 2: protocol, scheduling, documents.
ATLAS.details("language-server", {
  "transport": {
    s: "The byte channel between editor and server: usually the server's standard input and output, with pipes, sockets or a message bridge for remote and browser-hosted cases.",
    d: "The client launches the server as a child process and talks over its standard streams, which needs no ports and dies with the parent. Sockets and named pipes allow a server to outlive the editor or run on another machine, and a worker-based channel serves in-browser servers. The transport hands a raw byte stream to framing. Hard parts are hygiene and lifetime: anything else written to the stream corrupts the protocol, and a server must notice when the client vanishes.",
    k: ["Standard streams vs sockets: streams are simple, private and automatically cleaned up, but cannot be shared among clients or survive editor restarts.", "Parent-process watching vs relying on stream closure: a watchdog catches orphaned servers after crashes, but needs platform-specific code."],
    p: ["A library printing a debug line to standard output injects garbage into the message stream and kills the session.", "An orphaned server keeps running after the editor crashes and holds memory and file locks."],
    v: "Kill the editor process abruptly and confirm the server process exits within a few seconds; also run the server with debug logging on and confirm the protocol stream contains only framed messages.",
    dep: []
  },
  "message-framing": {
    s: "Splits the byte stream into messages using a header with a content length, then a body, and decodes the body as text in an agreed encoding.",
    d: "Each message starts with header lines ending in a blank line, the main one giving the body's length in bytes. The reader accumulates bytes until it has the headers, parses the length, then reads exactly that many bytes. Bodies are UTF-8 JSON. The framer must handle messages split across reads, several messages in one read, and very large payloads. The trap is length counted in bytes while string positions are in characters, so a miscount desynchronizes everything after it.",
    k: ["Length-prefixed frames vs delimiter-based lines: length prefix permits any content including newlines, but one bad length poisons the remainder of the stream.", "Streaming parse vs buffering the full body: streaming limits memory for huge payloads, but complicates error recovery."],
    p: ["Computing content length in characters rather than bytes breaks on the first non-ASCII character.", "Accepting an unbounded length lets a corrupt header allocate gigabytes."],
    v: "Feed the framer a stream with two messages split at every possible byte boundary, including inside a multi-byte character, and confirm both decode identically each time; send a length of four gigabytes and confirm rejection.",
    dep: ["transport"]
  },
  "json-rpc-dispatch": {
    s: "Interprets decoded messages as requests, responses or notifications, routes each to its handler by method name, and guarantees every request gets exactly one response.",
    d: "A request has an id and expects a reply; a notification has none; a response carries a result or an error for an earlier id. The dispatcher validates the shape, decodes typed parameters, finds the handler, and tracks outstanding ids in both directions, since servers also send requests to clients. Errors use defined codes for unknown methods, invalid parameters and cancellation. It is hard because every request must be answered even when the handler fails, panics or is cancelled.",
    k: ["Typed per-method decoding vs generic values: typed gives early validation and clear errors, but forces protocol versions to be mirrored in code.", "Replying with an error for unknown methods vs ignoring: erroring is correct for requests, but notifications must be ignored silently."],
    p: ["A handler that fails without producing a response leaves the client spinner running forever.", "Unknown optional notifications answered with errors make some clients disconnect."],
    v: "Send a request for an unknown method, a malformed request and a valid one with a handler that throws, and confirm each receives exactly one response with the correct error code and the server keeps running.",
    dep: ["message-framing", "request-scheduler"]
  },
  "initialization": {
    s: "The opening handshake: the client sends its identity, root folders, options and capabilities; the server replies with what it supports; no other request is valid until it completes.",
    d: "The first request carries the client's process id, workspace roots, capabilities and arbitrary initialization options. The server loads settings, starts project discovery and answers with its capabilities and identity. A following notification confirms the client is ready, after which the server may begin sending requests and registering features. The hard part is time: users open an editor and expect features at once, so the server answers quickly and loads the project in the background while reporting progress.",
    k: ["Answering initialize immediately and loading afterward vs finishing loading first: immediate response gets the editor interactive, but features must tolerate a not-yet-ready project.", "Reading settings during the handshake vs after: early settings avoid a reload, but not every client sends them there."],
    p: ["Doing project discovery inside the initialize handler makes the editor appear hung for large workspaces.", "Requests arriving before initialization completes are processed anyway and fail confusingly."],
    v: "Open a large workspace and confirm the initialize response arrives within a second, a loading progress indicator follows, and a request sent before initialization is rejected with the defined error code.",
    dep: ["json-rpc-dispatch", "capability-negotiation", "workspace-folders", "progress-reporting"]
  },
  "capability-negotiation": {
    s: "Each side declares which features and sub-features it supports, and each only uses what the other has declared, which lets servers and clients of different ages interoperate.",
    d: "The client lists, per feature, whether it supports options like link support, snippets, resolve of lazy properties and dynamic registration. The server returns its own provider flags and options, such as trigger characters and token legends. The server tailors responses, for example returning location links only if the client accepts them. The challenge is the matrix: dozens of features with many optional sub-features, and clients that claim support they handle badly.",
    k: ["Strict capability gating vs assuming common behavior: gating is always correct, but every feature needs a fallback code path to test.", "Fine-grained flags vs protocol version numbers: flags let clients adopt features individually, but produce a combinatorial space no one tests fully."],
    p: ["Sending a response shape the client never declared support for makes the editor drop the result silently.", "Hardcoding behavior for one client's quirks makes other clients regress."],
    v: "Initialize with a client that declares no snippet support and confirm completion items contain plain text only; repeat with snippet support and confirm placeholders appear.",
    dep: ["initialization"]
  },
  "dynamic-registration": {
    s: "Lets the server turn features on or off after startup by sending registration requests to the client, for example when a setting changes or a project finishes loading.",
    d: "Rather than fixing all capabilities in the initialize reply, a server can register a feature with document selectors and options later, and unregister it with the same id. This supports features that depend on configuration, languages discovered at runtime, and file-watch patterns. It requires that the client declared support. The difficulty is state: the server must track what it registered, unregister on shutdown and reconfiguration, and cope with clients that apply registrations late or not at all.",
    k: ["Static capabilities vs dynamic registration: static is simple and universal, but cannot react to configuration; dynamic adapts, but needs client support and bookkeeping.", "One registration per feature vs per document selector: per selector gives precision, at the cost of more messages and ids to manage."],
    p: ["A registration sent but never unregistered leaves duplicated features after a configuration change.", "Relying on dynamic registration with a client that did not declare it means the feature never appears."],
    v: "Toggle a feature setting while connected and confirm the server sends one unregister and one register message with matching ids, and the feature appears or disappears in the editor without a restart.",
    dep: ["capability-negotiation", "json-rpc-dispatch", "settings-and-configuration"]
  },
  "shutdown-and-exit": {
    s: "A two-step stop: a shutdown request asks the server to finish and refuse new work, then an exit notification tells it to terminate with a status code.",
    d: "On shutdown the server stops accepting requests, cancels in-flight work, flushes persistent state such as the index, and replies. The exit notification then ends the process: code zero if shutdown came first, nonzero otherwise, so clients can tell clean from unclean ends. Background threads must be joined, child processes reaped and watchers released. What makes it hard is bounded time: editors give a server a short grace period before killing it, so persistence must be incremental or skipped.",
    k: ["Flushing the full index on shutdown vs writing incrementally: a full flush is simple, but risks being killed halfway and corrupting the cache.", "Waiting for in-flight requests vs cancelling them: waiting is orderly, but can exceed the editor's kill timeout."],
    p: ["Child build processes left running after exit hold file locks that break the next build.", "A server that ignores exit when shutdown was never sent lingers forever as a zombie."],
    v: "Send shutdown then exit during a heavy analysis and confirm the process ends within two seconds with status zero, no child processes remain, and the next start loads the cache without a rebuild.",
    dep: ["json-rpc-dispatch", "cancellation", "persistent-index", "out-of-process-helpers"]
  },
  "protocol-extensions": {
    s: "Custom requests and notifications beyond the standard set, used for language-specific features such as viewing syntax trees, expanding macros or running tests, negotiated through experimental capabilities.",
    d: "The standard protocol covers common features, so servers add their own methods under a private namespace and advertise them in an experimental capabilities object. A matching client extension calls them. Extensions typically expose internal views for debugging, project-specific commands and richer completion or code action data. They are useful because adopting a standard feature takes years. The cost is coupling: every extension ties the server to editors that implement it and must be versioned independently.",
    k: ["Private extensions vs waiting for the standard: extensions ship features now, but fragment the ecosystem across clients and drift from eventual standards.", "Capability-gated extensions vs unconditional: gating prevents errors in unaware clients, but needs an extra negotiation step for each one."],
    p: ["Changing an extension's payload shape without versioning breaks the editor plugin of everyone not yet updated.", "An extension sent to a client that does not know it produces an error popup on each use."],
    v: "Connect a generic client that implements no extensions and confirm no custom method is ever sent; connect the matching plugin and confirm each advertised custom request returns its documented shape.",
    dep: ["capability-negotiation", "json-rpc-dispatch"]
  },
  "request-scheduler": {
    s: "Decides which of the queued requests and state changes runs next and on which thread, keeping writes ordered with reads and freeing the main loop quickly.",
    d: "Incoming messages enter a main loop that applies state changes, such as document edits, in order on one thread, and hands read-only requests to a worker pool running against a snapshot of the state. Requests are dispatched by priority, bounded by pool size, and tagged with their snapshot's revision. The scheduler tracks which are outstanding to support cancellation and to report slow ones. It is hard because ordering matters: a request sent after an edit must see that edit.",
    k: ["Single-threaded state mutation with parallel readers vs fully concurrent: single mutation is simple to reason about, but one slow write stalls the loop.", "Run-to-completion handlers vs cooperative yielding: run-to-completion is simple, but a long handler blocks everything queued behind it."],
    p: ["Doing analysis on the main loop makes typing lag, as edits wait behind a slow request.", "A request that reads state before a preceding edit was applied returns results for text the user already changed."],
    v: "Send an edit followed immediately by a hover on the edited text, and confirm the hover result reflects the new text; flood with expensive requests and confirm edit handling latency stays under 10 ms.",
    dep: ["json-rpc-dispatch", "snapshots", "priority-lanes", "document-synchronization"]
  },
  "priority-lanes": {
    s: "Separates work into classes, so latency-critical requests such as completion run ahead of background work such as indexing or workspace-wide checks.",
    d: "Requests are given a class by method: interactive ones (completion, hover, on-type formatting), visible-area ones (semantic tokens, inlay hints, diagnostics for open files), and background ones (indexing, project checks). Interactive work uses dedicated threads or preempts others; background work runs at low priority and yields. Pools are sized separately so that a flood of background tasks cannot block a keystroke. What makes it hard is that classification is static, while the real cost of a request varies enormously.",
    k: ["Separate thread pools per lane vs one pool with priorities: separate pools guarantee capacity for interactive work, but waste threads when idle.", "Preempting background work vs waiting for a boundary: preemption keeps latency low, but demands that background work be cancellable and restartable."],
    p: ["Treating find-references as interactive lets one expensive query occupy the lane meant for completion.", "Background indexing at full priority saturates all cores and makes the machine feel frozen."],
    v: "Start indexing a large workspace, then request completion repeatedly and confirm the 95th percentile completion latency stays under 100 ms while indexing keeps making progress.",
    dep: ["request-scheduler", "cancellation", "background-indexing"]
  },
  "cancellation": {
    s: "Stops work whose result is no longer wanted, triggered by an explicit client notification or by a newer edit invalidating the data being analyzed.",
    d: "The client sends a cancel notification with a request id; the scheduler marks the request, and the handler stops at its next check and replies with the defined cancelled error. In incremental engines, a newer edit also cancels running readers, typically by unwinding from the computation when it next reads the changed state. Handlers must be written to be cancel-safe. Hardness lies in cleanup: half-finished computations must not leave corrupt memoized state or leak locks.",
    k: ["Cooperative checks vs forced unwinding: checks are explicit and safe, but a missed check keeps a cancelled request running; unwinding is prompt but demands cancel-safe state.", "Cancelling on every edit vs letting running requests finish: aggressive cancelling keeps results fresh, but wastes work on requests that would have been fine."],
    p: ["A cancelled computation stores a partial result in its memo table, and later queries read it as complete.", "Failing to reply to a cancelled request leaves the client waiting for an answer indefinitely."],
    v: "Start find-references on a huge workspace, cancel it, and confirm an error response with the cancelled code arrives within 50 ms, CPU use drops, and the same query rerun gives the full correct result.",
    dep: ["request-scheduler", "snapshots", "query-engine"]
  },
  "progress-reporting": {
    s: "Shows the user what long-running work is in progress, such as loading a project or indexing, with a title, message and percentage, through client-side progress indicators.",
    d: "The server creates a progress token, by asking the client to create one or by using one the client supplied with a request, then sends begin, report and end notifications. Indicators can be cancellable. Servers use them for project loading, indexing, build-script execution and long requests. The design problem is signal quality: too many updates flood the channel and the interface, too few leave users guessing, and percentages for work of unknown size are invented and misleading.",
    k: ["Determinate percentages vs indeterminate spinners: percentages reassure, but are wrong when total work is unknown; spinners are honest but give no sense of remaining time.", "Throttled updates vs every step: throttling protects the channel and UI, but hides short phases entirely."],
    p: ["A progress session that begins but never ends leaves a spinner on screen permanently after an error.", "Reporting each file indexed individually floods the editor and slows it down."],
    v: "Open a project that takes ten seconds to load and confirm exactly one begin, a bounded number of reports, and one end are sent, with the indicator disappearing even when loading fails partway.",
    dep: ["json-rpc-dispatch", "capability-negotiation"]
  },
  "partial-results": {
    s: "Streams parts of a large answer to the client as they become available, so long searches and whole-file features show something before they finish.",
    d: "If the client supplies a partial-result token, the server sends batches of results through progress notifications keyed to that token and finishes the request with an empty or final response. This suits references, workspace symbols and large token sets. Partial results let the user begin reading, but they complicate ordering, de-duplication and failure semantics: if the request is cancelled midway, the client has already displayed part of an answer that will never be completed.",
    k: ["Streaming batches vs a single final reply: streaming lowers time to first result, but adds protocol traffic and means the answer is never atomic.", "Ordered by rank vs by discovery: ranking helps users, but forces the server to hold results back until it has enough to rank."],
    p: ["A request that fails midway leaves earlier batches visible and presented as if they were complete.", "Duplicate results across batches appear when the same location is found through two paths."],
    v: "Run find-references on a symbol with thousands of uses and confirm the first batch reaches the client within 200 ms, the union of batches equals the full result, and no location appears twice.",
    dep: ["json-rpc-dispatch", "capability-negotiation", "progress-reporting"]
  },
  "stale-request-handling": {
    s: "Detects that a request was issued against text that has since changed, and either answers against the newer text, discards the answer, or reports a content-modified error.",
    d: "Requests refer to positions in a particular document version, and edits arrive continuously. The server compares versions at admission and again before replying. A request whose positions no longer map reliably is answered with the defined content-modified error so the client retries, while those that can be mapped through the edits are adjusted. The design question is the retry contract: the client must retry automatically and quietly, or users see spurious errors on every fast typing burst.",
    k: ["Error on any change vs mapping positions through edits: erroring is always correct, but causes retry storms; mapping is smoother, but is wrong when edits touch the target.", "Checking staleness at admission only vs again at reply: admission checks are cheap, but the document can change during a long computation."],
    p: ["Answering with ranges computed on old text puts the highlight or edit in the wrong place after an insertion above.", "Clients that surface content-modified errors as popups make fast typing unusable."],
    v: "Issue a rename preparation, insert a line above the target before it runs, and confirm the server either returns a content-modified error or ranges shifted by exactly one line, never the old position.",
    dep: ["document-synchronization", "request-scheduler", "incremental-edits", "input-revisions"]
  },
  "debounce-and-throttle": {
    s: "Delays or rate-limits recomputation after rapid edits, so diagnostics and other background work run once typing pauses rather than after every keystroke.",
    d: "Edits mark documents dirty and start a timer. Each further edit resets it, so analysis runs after a quiet interval, while interactive requests bypass the timer and use the latest state. Throttling bounds how often a recurring job can fire, for example project checks on save. Intervals are tuned per feature: syntax diagnostics are quick, whole-project checks slower. The hardness is balance: too short and the CPU churns on throwaway results, too long and errors appear after the user has moved on.",
    k: ["Fixed delays vs adaptive ones based on measured analysis time: fixed is predictable, but wrong for both small and huge projects; adaptive tracks load, but is harder to reason about.", "Debouncing per document vs globally: per-document isolates busy files, but many open files can still add up."],
    p: ["Debouncing diagnostics but not clearing old ones leaves a stale error visible for the whole delay.", "A timer that never fires because edits never pause leaves diagnostics empty during continuous typing."],
    v: "Type continuously for five seconds in a large file and count analysis runs in the trace: it should be a handful, not one per keystroke, with diagnostics appearing within the interval after the last key.",
    dep: ["document-synchronization", "request-scheduler"]
  },
  "document-synchronization": {
    s: "Keeps the server's copy of every open document identical to the editor's buffer, using open, change and close notifications with monotonically increasing version numbers.",
    d: "The client sends the full text on open, then change notifications each tagged with a version; on close the server returns to the on-disk contents. Each notification updates the overlay and bumps the input revision, which invalidates dependent analysis. Servers choose full-text or incremental sync at initialization. It is hard because correctness is absolute: one lost or reordered change leaves the server analyzing text the user never wrote, and every later answer is quietly wrong.",
    k: ["Incremental sync vs full text on every change: incremental is cheap for large files, but any drift persists; full text is self-correcting, but sends megabytes per keystroke.", "Trusting client version numbers vs verifying: trusting is simple, but misses client bugs that skip or duplicate versions."],
    p: ["Applying a change out of order produces text that no longer matches the editor, so every position is off.", "Not handling close properly leaves the overlay shadowing the saved file after an external change."],
    v: "Apply a recorded stream of ten thousand edits through the server, then compare its buffer byte for byte against the editor's final text, and force a mismatch to confirm the server detects and reports it.",
    dep: ["incremental-edits", "overlays", "input-revisions", "json-rpc-dispatch"]
  },
  "incremental-edits": {
    s: "Applies a change described as a range and replacement text to a document, and maps positions, syntax trees and indexes forward through the edit.",
    d: "A change is one or more edits, each a range in the current text and its new content, applied in the order sent. The server converts positions using the line index, patches the stored text, and informs the parser which byte range changed so it can reuse the unchanged tree. Several edits in one notification are sequential, each relative to the result of the previous. The difficulty is coordinate handling: line endings, tabs, surrogate pairs and out-of-range positions each cause off-by-one corruption.",
    k: ["Applying edits to a rope or gap structure vs a flat string: ropes make large-file edits cheap, but complicate slicing; flat strings are simple, but copy on every change.", "Rejecting out-of-range edits vs clamping them: rejecting exposes client bugs early, but clamping keeps the session alive with some risk of silent drift."],
    p: ["Treating a multi-edit notification as simultaneous rather than sequential applies later edits at wrong offsets.", "Positions counted in the wrong unit shift edits by one for every non-ASCII character before them."],
    v: "Apply edits containing emoji, tabs and carriage-return line endings through the server and verify the resulting text equals the editor's buffer; replay a random edit sequence against a reference implementation and compare.",
    dep: ["position-encoding", "line-index", "incremental-parsing", "overlays"]
  },
  "position-encoding": {
    s: "The unit in which a character offset within a line is counted, by default UTF-16 code units, with newer protocol versions allowing UTF-8 or code point counting by agreement.",
    d: "Line and character positions are zero-based, and the character index is counted in an encoding negotiated during initialization. Servers whose strings are UTF-8 internally must translate between byte offsets and the client's unit on every request and notification, using the line index to find the line and then walking the characters. The hard part is that wrong conversion is invisible for ASCII text and only breaks on identifiers, comments or strings with non-ASCII characters.",
    k: ["Converting at the boundary vs using the client's unit internally: converting keeps core logic in native units, but costs a scan per position and risks missed conversions.", "Requesting UTF-8 when offered vs always UTF-16: UTF-8 avoids conversion for servers with UTF-8 text, but not every client supports it."],
    p: ["A position inside a surrogate pair gets converted to the middle of a character and produces invalid text.", "One missed conversion in a rarely used feature misplaces ranges only for users writing in non-Latin scripts."],
    v: "Run every position-producing feature on a file whose identifiers include two-byte and four-byte characters, and confirm each returned range selects exactly the intended identifier in the editor.",
    dep: ["line-index", "initialization", "capability-negotiation"]
  },
  "line-index": {
    s: "A table of line start offsets for a text, used to convert between byte offsets and line and column positions in logarithmic time and to find characters on a line.",
    d: "Built by scanning the text once for line terminators, it stores each line start and often a compact list of non-ASCII characters per line with their widths. Offset to position is a binary search plus a short scan of that line's wide characters; position to offset reverses it. It is rebuilt or patched on each edit. Care is needed with different line endings, a final line without a terminator, and files too large for a naive rebuild on every keystroke.",
    k: ["Rebuild on every edit vs patch incrementally: rebuilding is trivial and safe for typical files, but quadratic over long sessions on very large files.", "Recording only non-ASCII spans vs per-character widths: sparse records are small and fast for mostly ASCII sources, but add a code path for the exceptions."],
    p: ["Mixed line endings in one file cause positions to drift after the first unusual terminator.", "An index kept from before an edit is used after it, silently mapping to wrong lines."],
    v: "Build the index for a file with mixed line endings, a final line without a terminator and wide characters, then round-trip every offset through position and back, confirming each returns itself.",
    dep: []
  },
  "virtual-file-system": {
    s: "An abstraction over file contents that analysis reads through, assigning each file a stable identifier and recording changes, independent of whether text comes from disk or memory.",
    d: "All analysis asks the file system layer for text by file id, never by path. The layer maintains the path-to-id mapping, the current contents with overlay applied, and a change log that the main loop drains in batches to update inputs. It records creation, deletion, rename and modification so analysis can invalidate precisely. It is hard because the file system is shared mutable state changing under the server: partial writes, atomic-save renames, symlinks and case-insensitive paths all produce events that must map to coherent changes.",
    k: ["Stable file ids vs paths as keys: ids make moves and renames cheap and keep memoized results valid, but need a canonical path mapping and care with aliases.", "Batching changes vs applying each immediately: batching avoids reanalysis storms during checkouts, but delays visibility of a change by one tick."],
    p: ["Two paths reaching the same file through a link get different ids and double the analysis, with inconsistent results.", "Reading a file during an atomic-save rename sees it as deleted and drops its diagnostics."],
    v: "Check out a branch that changes hundreds of files at once and confirm the server applies one batched change set, ends consistent with disk, and never reports a transient missing-file error for files that exist afterward.",
    dep: ["uri-and-path-mapping", "overlays", "file-watching", "input-revisions"]
  },
  "overlays": {
    s: "In-memory text for open documents that takes precedence over the saved file, so analysis sees what the user is typing, and reverts to disk when the document closes.",
    d: "When a document opens, its text is stored in an overlay keyed by file id; reads through the file system layer return overlay text where present and disk text otherwise. Edits update the overlay only. Closing removes it, and the file system layer reloads the disk contents and compares, since they may have changed meanwhile. Complications include documents with no file behind them, untitled buffers, and files whose disk contents change while the overlay exists, which must not clobber unsaved text.",
    k: ["Overlay precedence vs disk precedence on external change: overlay wins protects unsaved work, but the user may not know the file changed beneath them.", "Memory-only overlays vs persisting drafts: memory-only is simple, but nothing survives a server crash; the editor holds the true buffer anyway."],
    p: ["A file changed by a formatter on disk while open in the editor is ignored, so analysis keeps using the old text.", "Overlays not removed at close leave phantom text shadowing the file indefinitely."],
    v: "Open a file, type unsaved text, modify the same file on disk, and confirm analysis still uses the typed text; close the document without saving and confirm analysis switches to the new disk content.",
    dep: ["virtual-file-system", "document-synchronization"]
  },
  "file-watching": {
    s: "Learns about changes to files and directories made outside the editor, such as branch switches, code generation and builds, so analysis can refresh inputs.",
    d: "The server asks the client to watch glob patterns, or runs its own watcher using operating-system change notifications, and receives created, changed and deleted events. Events are debounced, filtered against ignore rules, and fed to the file system layer as changes. Manifests and build outputs trigger project reload. It is hard because watchers are lossy and platform-specific: queues overflow during large operations, rename events arrive as pairs, and watch limits are finite, so servers must rescan rather than trust events.",
    k: ["Client-side watching vs server-side watching: client watching shares the editor's existing resources, but depends on client support and glob semantics.", "Trusting events vs periodic rescans: events are immediate and cheap, but overflow loses changes; rescans are certain, but cost time on big trees."],
    p: ["Hitting the operating system's watch limit silently stops updates, and the project looks frozen in time.", "Watching the build output directory generates an event storm during every build."],
    v: "Switch version-control branches touching a thousand files while the server is running, and confirm that within a few seconds diagnostics match a fresh server started on the same tree.",
    dep: ["virtual-file-system", "dynamic-registration", "debounce-and-throttle"]
  },
  "uri-and-path-mapping": {
    s: "Converts between the URIs the protocol uses and the native paths the server reads, handling encoding, drive letters, case rules, symlinks and remote or virtual schemes.",
    d: "Every document and location in the protocol is a URI. The server decodes percent-encoding, normalizes drive letter case and separators, resolves or preserves symlinks consistently, and produces canonical absolute paths, with the reverse mapping for results. Non-file schemes, such as untitled buffers or remote workspaces, map to virtual locations or to a path prefix. It is hard because paths that compare unequal as strings can denote the same file, and clients differ in how they encode them.",
    k: ["Canonicalizing early at the boundary vs preserving the client's spelling: canonical keys prevent duplicates, but responses must map back to spellings the client recognizes.", "Resolving symlinks vs preserving them: resolving dedupes, but shows users paths they did not open."],
    p: ["A drive letter in different case makes the same file appear as two documents with separate analysis.", "Unencoded spaces or percent characters in results make the editor fail to open the location."],
    v: "Open the same file via two URI spellings differing in drive letter case and percent-encoding, and confirm the server treats it as one document and returns locations the client opens correctly.",
    dep: []
  },
});
