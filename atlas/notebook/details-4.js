// Details for the notebook plate, part 4: kernel protocol and kernel runtime.
ATLAS.details("notebook", {
  "message-envelope": {
    s: "The common structure of every protocol message: a header with identity and type, a parent header linking replies to requests, metadata, and a content body.",
    d: "Each message carries a unique ID, a session ID, a user name, a timestamp and a type such as an execute request. Replies and broadcasts copy the originating request's header as their parent, which is how a front end knows which cell an output belongs to. Content is a JSON object whose shape depends on the type, and extra binary buffers can follow it. The envelope is language-neutral, so a runtime in any language can implement it. Version fields let old and new peers negotiate.",
    k: ["Parent header on every reply vs matching by arrival order: parent links route output correctly when several requests overlap; arrival order is simpler and wrong as soon as anything runs concurrently.", "JSON content with separate binary buffers vs encoding everything in JSON: separate buffers avoid base64 overhead for large arrays, but every transport must carry multiple frames."],
    p: ["Output from a background task carries the parent of an earlier request and shows up under the wrong cell.", "A peer that ignores protocol version fields fails on a field it does not understand."],
    v: "Capture the messages for one execute request and confirm every reply and output message has the request's header as parent, and that each has a unique ID and the right type.",
    dep: []
  },
  "channels": {
    s: "The separate message streams between front end and kernel: shell for requests, a broadcast channel for outputs, input for prompts, control for urgent commands and a heartbeat.",
    d: "Splitting traffic by purpose avoids blocking. Shell carries request and reply pairs and is processed in order. The broadcast channel publishes outputs and status to every attached client. The stdin channel lets the kernel ask the front end for text. Control takes shutdown and interrupt without waiting behind a long execution. A heartbeat echoes bytes to prove the kernel is alive. Each is an independent socket with its own port, which complicates networking, so gateways multiplex them over one connection.",
    k: ["Separate sockets per channel vs one multiplexed stream: separate sockets prevent one kind of traffic blocking another, and mean five ports to open; multiplexing needs one port and head-of-line blocking.", "A control channel separate from shell vs interrupts on shell: a separate channel works while a cell runs; sharing is simpler and an interrupt waits behind the thing it should stop."],
    p: ["Firewalls that allow one port but not the rest leave the page connected and unable to run code.", "Sending shutdown on shell queues it behind the running cell, so it takes effect only after the cell finishes."],
    v: "Start a long cell, send an interrupt on the control channel, and confirm the cell stops promptly; send a shell request during the run and confirm it waits until the cell ends.",
    dep: ["message-envelope"]
  },
  "execute-request": {
    s: "The request that sends code to a kernel, with options for silent execution and stopping on error, and the reply that reports status, execution count and any error.",
    d: "The front end sends code with flags: whether to store it in history, whether to allow input prompts, whether to stop the queue after an error. The kernel marks itself busy, runs the code, publishes outputs as they occur, and finally sends a reply with an ok or error status and the incremented execution count. Requests execute one at a time in order. The reply and the idle status may arrive in either order, so front ends consider a request complete only after both.",
    k: ["Serial execution in submission order vs concurrent execution: serial order keeps state predictable and blocks everything behind a long cell; concurrency uses the hardware and makes shared namespace updates racy.", "Stop-on-error in the queue vs continuing: stopping prevents cascading failures when running many cells; continuing lets independent cells finish."],
    p: ["A front end that treats the reply as completion misses output messages still in flight.", "Submitting dozens of cells queues work behind a hung cell, and none of it can be cancelled individually."],
    v: "Send two execute requests in succession and confirm the second begins only after the first's reply, with counts incrementing; send code that raises and confirm an error reply with the traceback and the queued request aborted when stop-on-error is set.",
    dep: ["channels", "message-envelope", "namespace-execution-counter"]
  },
  "iopub-broadcast": {
    s: "The one-to-many channel on which the kernel publishes outputs, display updates, status changes and execution inputs, so every attached client sees the same events.",
    d: "Anything a cell produces is published here: stream text, display data, results, errors, and clear requests, each with the parent header of the request that caused it. Status messages mark busy and idle transitions. Multiple clients subscribe, and a client joining late sees only new messages. Publishers do not wait for subscribers, so a slow client cannot block the kernel, and messages can be dropped if buffers overflow. Because outputs are not acknowledged, front ends rely on the idle status to know that all earlier messages have been sent.",
    k: ["Publish-subscribe without acknowledgement vs reliable delivery to each client: fire-and-forget never blocks the kernel, but may lose messages under load; reliable delivery needs per-client buffering and can stall.", "Tagging with the parent header vs a single current-cell pointer: tags allow overlapping work and shared sessions; a pointer is simple and breaks as soon as clients differ."],
    p: ["High-rate output drops messages because the subscriber is slow, truncating results silently.", "A subscriber connecting just after a cell started misses its first outputs, and the page shows partial results."],
    v: "Attach two clients, run a cell that prints ten lines, and confirm both receive the same sequence between a busy and an idle status, all tagged with the request's header as parent.",
    dep: ["channels", "message-envelope"]
  },
  "stdin-requests": {
    s: "The reverse channel on which the kernel asks the front end for a line of text, such as for an input call, optionally hidden for passwords.",
    d: "When code calls an input function, the kernel sends an input request on the stdin channel, with a prompt and a flag for password entry, and blocks until the front end replies. The front end shows an input box inside the output area, and sends the typed text back. Only the client that submitted the request is expected to answer. Batch executors and some clients set a flag declaring that they cannot provide input, so the kernel raises an error instead of waiting forever.",
    k: ["Blocking the kernel on input vs failing immediately: blocking supports interactive code and hangs unattended runs; failing is safe in batch and breaks interactive code.", "Echoing typed text vs hiding it for passwords: hiding protects secrets on screen, but the text still appears in the stored stream unless the kernel avoids recording it."],
    p: ["A scheduled notebook with an input prompt waits indefinitely and holds its worker.", "A password typed into a prompt is stored in the notebook's saved output."],
    v: "Run a cell calling an input function from the editor and confirm a box appears and the typed value reaches the code; run the same cell headless with input disabled and confirm it fails with an error.",
    dep: ["channels", "execute-request"]
  },
  "introspection-messages": {
    s: "Request and reply pairs that ask the kernel about code without running it: completions at a cursor, documentation for a name, whether a snippet is complete, and history.",
    d: "These are shell requests, answered by the language runtime using the live namespace. Completion returns candidates and the range they replace. Inspect returns documentation or signatures as a MIME bundle. Is-complete tells a console whether to run the input or wait for more lines. History returns earlier inputs. Since they use the shell channel, they queue behind running code, so the front end falls back to static analysis while the kernel is busy.",
    k: ["Answering from the live namespace vs from source: the live namespace knows runtime types; source-only analysis never executes code and cannot see dynamic attributes.", "Returning documentation as a MIME bundle vs plain text: a bundle lets the front end show formatted help, but each client must render it safely."],
    p: ["A request issued during a long execution returns only after it ends, long past usefulness.", "Inspecting an object triggers its lazy properties, running code the user did not intend to run."],
    v: "While the kernel is idle, request completions at a cursor after a known prefix and confirm candidates and replacement range; request documentation and confirm a bundle with at least a plain-text entry.",
    dep: ["channels", "message-envelope"]
  },
  "comm-messages": {
    s: "A generic channel for custom, bidirectional messages between kernel and front end, identified by a target name and used mainly by widgets and extensions.",
    d: "Either side opens a comm with a target name and an ID, sends data messages, and closes it. A registered handler on the other side receives them. Comms carry no schema of their own, so users define their own. They travel on the same channels as other messages, subject to the same ordering and loss. Comms are how widgets keep two copies of state in sync and how extensions send custom data without extending the protocol, which makes it flexible and untyped.",
    k: ["A generic untyped comm vs dedicated message types per feature: comms let anyone add features without protocol changes, but give no shared validation or tooling.", "Comms owned by the kernel session vs persisting beyond it: session-owned comms close cleanly with the kernel; persistence would let state survive and has no defined restore path."],
    p: ["After a kernel restart the front end keeps comm objects for a kernel that no longer has them.", "Large payloads sent through comms compete with output traffic and delay everything else."],
    v: "Register a comm target, open it from the front end, exchange a message each way, close it, and confirm further messages are refused and handlers are released on both sides.",
    dep: ["channels", "message-envelope"]
  },
  "kernel-info-handshake": {
    s: "The first exchange when a client connects: the kernel reports its language, protocol version, implementation and capabilities, so the front end knows what it can do.",
    d: "A client sends a kernel info request and waits for the reply. The reply names the language, its version, the file extension, the syntax mode for highlighting, supported protocol version, and optional features such as debugging. The front end uses it to configure the editor and to decide which requests are safe to send. It also serves as the readiness check: a kernel is not usable until it answers. Mismatched protocol versions are negotiated by falling back to the lower one.",
    k: ["Capability fields advertised by the kernel vs probing by trial: advertised capabilities are cheap and trusted, but depend on kernel authors keeping them honest; probing is reliable and noisy.", "Waiting for the handshake before enabling the interface vs optimistic use: waiting avoids lost requests while the kernel starts; optimism feels faster and drops early messages."],
    p: ["A client sends an execute request before the kernel is listening, and the message is lost.", "A kernel that reports the wrong language mode makes the editor highlight code incorrectly."],
    v: "Start a kernel, send the info request, and confirm the reply gives language name, protocol version and syntax mode; confirm requests sent before the reply is received are not accepted by the client.",
    dep: ["channels", "message-envelope"]
  },
  "kernelspec-discovery": {
    s: "Finding installed kernels: scanning known directories for specifications that give a kernel's name, launch command, language and display name.",
    d: "Each specification is a small directory with a descriptor file naming the command to start the kernel, with a placeholder for the connection file, plus an optional icon and environment variables. The server searches a path of directories in user, environment and system locations, in order, and exposes the list to the front end. Naming a kernel in a notebook refers to this registry. Registries differ across machines, so portability depends on the same names meaning the same interpreters.",
    k: ["Per-user and per-environment specifications vs a single system list: layered locations let each project bring its kernel and complicate which one wins; a single list is clear and sacrifices isolation.", "Launching by command line template vs a plugin API: templates support any language with no code on the server side; plugins can add checks and remote launching."],
    p: ["A specification points to an interpreter that was uninstalled, and the kernel list still offers it.", "Two directories hold specifications of the same name, so the one that wins depends on search order."],
    v: "List kernels on a machine with two environments, confirm each shows its interpreter path, remove one environment, and confirm the stale entry is reported as broken when started.",
    dep: []
  },
  "kernel-process": {
    s: "The operating system process that hosts a language runtime, connects to the protocol sockets, and loops receiving requests and running them.",
    d: "On launch it reads a connection file giving ports, transport and a signing key, binds or connects its sockets, and starts a loop on the shell channel. It usually has two threads: one for execution and one for control and heartbeat, so it can respond to interrupts and liveness checks while a cell runs. It publishes status transitions. The process owns the namespace, so its lifetime defines the lifetime of every variable. Its memory and CPU use are the main operational concerns.",
    k: ["A separate control thread vs a single loop: a control thread keeps heartbeat and interrupt responsive during long computations, but needs synchronization in the runtime; a single loop is simple and looks dead while busy.", "One process per notebook vs a shared process for several: one per notebook isolates state and crashes; sharing saves memory and lets notebooks interfere."],
    p: ["A long computation holds the single thread, so the heartbeat stops and the server declares the kernel dead.", "Native extensions that crash the process take the whole namespace with them without a traceback."],
    v: "Start a kernel, run a ten-minute computation, and confirm the heartbeat still answers and an interrupt works; then kill the process and confirm the server reports it dead within the heartbeat interval.",
    dep: ["channels", "kernel-info-handshake", "language-runtime-binding"]
  },
  "language-runtime-binding": {
    s: "The glue between the protocol loop and a language's own interpreter or compiler, which evaluates code, captures its output and exposes completion and display.",
    d: "A kernel for a new language implements a small set of functions: execute, complete, inspect, check completeness. Interpreted languages embed their interpreter and evaluate in a persistent global scope. Compiled languages must compile each cell into a fragment that links against earlier definitions, which makes cells costly and limits redefinition. Wrapper kernels instead drive an existing interactive session through its standard input and output. The binding decides how faithfully the runtime's features, such as exceptions, threads and graphics, map onto protocol messages.",
    k: ["Embedding the interpreter in the kernel vs wrapping an external session: embedding gives direct access to objects and rich output; wrapping needs no changes to the language and loses structured data.", "Incremental compilation per cell vs interpreting: compiling gives speed and strict typing; interpreting is immediate and slower for numeric work."],
    p: ["A language that cannot redefine names makes rerunning a cell fail with a redefinition error.", "A wrapped session's prompts leak into outputs and confuse parsing of results."],
    v: "Run a cell defining a function, rerun it with a changed body, call it, and confirm the new body is used; raise an exception and confirm a structured error with a traceback is published.",
    dep: ["channels", "execute-request"]
  },
  "namespace-execution-counter": {
    s: "The global variable scope that persists across cells, and the counter that numbers each execution, together forming the notebook's hidden state.",
    d: "Every cell runs in the same global scope. Names assigned in one remain visible in later cells, whatever their position in the document, and persist until redefined or the kernel restarts. This is the core convenience and the core hazard: results depend on the history of executed cells, not the text. The execution counter records the sequence. Deleting a cell does not delete its names, and rerunning a cell may mutate objects that other cells already used.",
    k: ["A single shared global scope vs an isolated scope per cell: shared scope enables incremental exploration and hidden state; isolated cells are reproducible and need explicit passing of every value.", "Keeping all state until restart vs scope cleanup: persistence supports long exploration, and memory only grows until the kernel restarts."],
    p: ["A deleted cell's variable keeps feeding later cells, so the notebook works until the kernel restarts.", "Rerunning a cell that mutates a list appends to it twice, and downstream numbers silently change."],
    v: "Define a variable, delete the defining cell, run a cell that reads it and confirm it still works; restart and rerun and confirm the failure, showing the state came from execution history.",
    dep: ["kernel-process", "language-runtime-binding"]
  },
  "display-hooks": {
    s: "Functions the kernel calls to turn the last value of a cell, or an explicitly displayed object, into a bundle of representations, which libraries can register for their own types.",
    d: "After a cell ends, the kernel takes the final expression's value and passes it through a formatter registry. Formatters are looked up by type and return HTML, images, text or structured data. Libraries register formatters for their classes, and objects can define standard methods that return their representations. The result is published as display data or an execute result. If no formatter applies, a text form is used. Formatting runs code on the user's object, so failures and slowness appear as display errors.",
    k: ["Formatter registry keyed by type vs methods defined on objects: a registry works for types the author cannot edit, but is global and order dependent; methods are simple and need library cooperation.", "Producing every representation eagerly vs on request: eager production makes saved files complete and wastes time on unused forms; on request is lean and needs a live kernel."],
    p: ["A formatter for a huge object runs for minutes after the cell logic finished.", "Two libraries register formatters for the same type, so the winner depends on import order."],
    v: "Evaluate an object with a registered formatter and confirm the broadcast carries bundle entries for each registered MIME type; evaluate one without and confirm only plain text appears.",
    dep: ["mime-bundles", "namespace-execution-counter"]
  },
  "magics-directives": {
    s: "Special commands written in cells that control the kernel or the cell's behavior, such as timing a statement, switching language for one cell, running a shell command or loading code.",
    d: "A line directive modifies one line, and a cell directive changes how the whole cell is interpreted, including sending its text to another interpreter, a database or a shell. Directives are handled in the kernel before the runtime sees the code, so the cell is no longer valid plain code. They give notebooks much of their power for exploration, and make files unportable: another tool or script runner cannot run the cell without the kernel's extension, and static analysis sees an unknown syntax.",
    k: ["Kernel-level directives vs ordinary function calls: directives give terse syntax for interactive work, and make cells invalid outside the kernel; function calls are portable and verbose.", "A shell escape in cells vs a library API: shell escapes reuse existing tools quickly, but hide dependencies and differ per operating system."],
    p: ["Exporting to a script leaves directive lines that are syntax errors in a plain interpreter.", "A shell escape installs packages into whichever environment the shell resolves, not the kernel's."],
    v: "Run a timing directive and a shell-escape cell, then export the notebook to a script and confirm the converter either translates or flags each directive instead of emitting invalid code.",
    dep: ["language-runtime-binding", "script-export"]
  },
  "reactive-execution": {
    s: "An execution model in which changing a cell automatically reruns the cells that depend on it, removing the hidden-state problem at the price of different semantics.",
    d: "The kernel or a wrapper analyzes each cell for the names it defines and reads, builds a graph, and when one cell runs, schedules its dependents in topological order. Cells may be forbidden from defining the same name twice, and from mutating objects defined elsewhere, so each name has one source. The document becomes a program whose order is by dependency, not position. The saved file is then reproducible by construction, and ordinary scripts and imperative code patterns need rewriting to fit.",
    k: ["Automatic dependency reruns vs manual execution: automatic reruns keep every output consistent with source, but can trigger expensive reruns on each keystroke; manual runs are cheap and allow staleness.", "Restricting one definition per name vs allowing redefinition: the restriction makes the graph exact; allowing it matches ordinary code and makes reruns ambiguous."],
    p: ["Editing an early cell triggers a chain of expensive downstream cells with no way to stop it.", "In-place mutation of an object hides a dependency, so downstream cells stay stale despite the model."],
    v: "Change a variable's value in an upstream cell and confirm the dependent cells rerun automatically in dependency order while unrelated cells do not; introduce a duplicate definition and confirm it is rejected.",
    dep: ["cell-dependency-graph", "execute-request", "namespace-execution-counter"]
  },
  "interrupt-restart": {
    s: "Controls to stop a running cell without losing state, and to discard the kernel's state and start a fresh process, with a clear difference between the two.",
    d: "Interrupt asks the kernel to stop the current execution, usually by signal or a control-channel message, which raises an exception in the running code; it works only if the code reaches a point where the runtime checks for it, so native loops may ignore it. Restart shuts down the process and launches a new one, losing all variables, and optionally runs all cells. Both must handle child processes and threads started by user code, and both change what the front end shows: status, counts and widget connections.",
    k: ["Interrupt by signal vs by control message: signals work on any runtime and are platform specific; messages are portable and need runtime support.", "Restarting by killing the process vs a polite shutdown: killing is reliable and skips cleanup such as flushing files; polite shutdown is gentle and may hang."],
    p: ["An interrupt does nothing while a native extension loops without returning control to the runtime.", "A restart leaves child processes spawned by earlier cells running and holding memory or ports."],
    v: "Run a long loop and interrupt it, confirming the namespace survives; run a native-heavy call and note whether the interrupt takes effect; then restart and confirm variables are gone and no stray child processes remain.",
    dep: ["kernel-process", "channels", "kernel-manager"]
  }
});
