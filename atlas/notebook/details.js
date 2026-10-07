// Details for the notebook plate, part 1: front-end editor, widgets, collaboration, rich outputs.
ATLAS.details("notebook", {
  "cell-editor": {
    s: "The text editing surface inside each cell, with syntax highlighting, indentation, bracket matching and keyboard shortcuts, tied to a language chosen per notebook or per cell.",
    d: "Each cell hosts its own editor instance, so a notebook with hundreds of cells holds hundreds of editors. Large notebooks therefore render editors lazily, only for cells near the viewport. The editor knows the cell's language from the kernel or a cell directive and loads the matching grammar. Focus management is the hard part: arrow keys must move between cells at the edges, shortcuts must differ between editing a cell and operating on cells, and pasted content must not trigger accidental execution.",
    k: ["One editor instance per cell vs one editor over the whole document: per-cell instances keep cell boundaries simple, but cost memory and make cross-cell selection and search awkward.", "Windowed rendering of off-screen cells vs rendering everything: windowing keeps huge notebooks fast, but breaks browser find and anchor links unless the front end reimplements them."],
    p: ["Hundreds of live editors make scrolling and typing lag in long notebooks until cells are virtualized.", "Shortcut conflicts between the browser, the editor and cell commands swallow keystrokes or run the wrong action."],
    v: "Open a notebook with five hundred cells and confirm typing in the middle of the document responds within a frame or two, and that arrow keys cross from one cell into the next.",
    dep: ["cell-model"]
  },
  "code-completion": {
    s: "Suggestions, signature help and documentation popups as the user types, answered either by the live kernel or by a language analysis service that never executes code.",
    d: "Two sources feed it. The kernel answers completion and inspection requests using the live namespace, so it can complete names of objects that exist only at runtime, such as columns of a loaded table. A separate static analyzer works from source alone and keeps working when the kernel is busy or absent. The front end merges both, debounces requests, and cancels stale ones. It is hard because the kernel is single-threaded: a request queued behind a long-running cell returns only when that cell finishes.",
    k: ["Kernel-backed completion vs static analysis: runtime knowledge completes dynamic objects, but blocks while the kernel executes and can trigger side effects in properties.", "Merging both sources vs choosing one: merged lists are richer but need ranking rules and can show duplicates or contradictory signatures."],
    p: ["Completion that evaluates properties on live objects can run slow or destructive code merely from a keystroke.", "Requests that queue behind a long cell make the popup appear minutes late, long after the user moved on."],
    v: "Load a table into the kernel, type its variable name and a dot, and confirm column names appear. Start a long cell and confirm static suggestions still appear while the kernel is busy.",
    dep: ["cell-editor", "introspection-messages"]
  },
  "cell-operations": {
    s: "Actions on whole cells: insert, delete, move, split, merge, change type between code, prose and raw, copy between notebooks, and run one cell or a range.",
    d: "Operations modify the notebook model, not the DOM, and the view follows. Type changes convert cell content and drop or keep outputs. Moving a cell changes document order but not execution order, which stays in the kernel's history, so the numbers beside cells stop being monotonic. Copying across notebooks must carry metadata and attachments, and assign new identifiers so two cells never share one. Each operation must also be expressible as a change that collaboration and undo can transmit and reverse.",
    k: ["Operations as model transactions vs direct DOM edits: transactions allow undo, collaboration and scripted edits, but every feature must go through one API.", "Preserving outputs when a cell is moved vs clearing them: preserving shows results beside the wrong source order, clearing loses expensive results."],
    p: ["Dragging a cell above the one that defines its variables leaves a document that reads correctly but fails on a fresh run.", "Duplicated cells keep the same identifier, so comments and diffs attach to the wrong copy."],
    v: "Move a cell above its dependency, restart the kernel and run all, and confirm the failure is reported at that cell. Copy a cell between two notebooks and confirm it receives a new identifier.",
    dep: ["cell-model", "stable-cell-ids"]
  },
  "notebook-undo": {
    s: "History of edits that spans cells: reverses text changes, deleted or moved cells and type changes, but not the effects of running code.",
    d: "Two histories exist. Text undo works inside one cell editor. Structural undo works on the notebook model and reverses cell-level changes such as deletion. Implementations either merge both into one stack, or keep them separate and switch based on focus. Executed code is never undone: deleting a cell does not delete the variable it created, and undoing an edit does not restore a prior value. The mismatch between the visible document and the kernel's state is what makes the feature subtly misleading.",
    k: ["One merged undo stack vs separate text and structure stacks: a merged stack feels uniform, but ordering conflicts arise with collaborators; separate stacks are predictable but confuse users about which key undoes what.", "Undoing only document changes vs also offering state rollback: document undo is feasible, while kernel snapshotting is expensive and often impossible."],
    p: ["Users undo a deleted cell and assume its variables returned; they did not, so later cells fail or silently use stale values.", "In shared sessions, undo reverses another person's change when the stacks are not per-author."],
    v: "Delete a cell that defines a variable, undo the deletion, and confirm the cell returns while the kernel's variable list is unchanged by the undo and still shows the earlier value.",
    dep: ["cell-model", "cell-operations"]
  },
  "variable-inspector": {
    s: "A panel listing the names, types, sizes and values currently alive in the kernel's namespace, so hidden state becomes visible without writing code to print it.",
    d: "The front end asks the kernel for a summary through a request that runs inside the kernel, because only it can see its objects. The kernel returns bounded previews: type, shape, truncated representation, and memory estimate. Tabular and array types get a lazy drill-down. The challenge is cost and safety. Summarizing a large object can allocate memory or trigger lazy computation, and refreshing after every cell must not slow execution or hold references that keep objects alive.",
    k: ["Refresh after every execution vs on demand: automatic refresh keeps the view honest, but adds work to every cell and may touch lazily evaluated objects.", "Previews computed in the kernel vs raw data sent to the browser: kernel-side summaries bound traffic, but require per-language code for each data type."],
    p: ["Inspecting a lazily evaluated object forces its computation and stalls the kernel for minutes.", "The panel holds references to large objects, so memory is not freed after a variable is deleted."],
    v: "Create a variable of known type and size, confirm the panel shows both, delete it, and confirm it disappears and the kernel's memory use falls.",
    dep: ["introspection-messages", "namespace-execution-counter"]
  },
  "notebook-debugger-ui": {
    s: "Breakpoints, stepping, call stack and variable views for code in cells, driven by a debug adapter running alongside the kernel.",
    d: "The front end speaks a standard debug protocol, forwarded over a dedicated channel to the kernel's debug adapter. Because cells are not files, the adapter must map each cell's source to a temporary file path so breakpoints have a location, and the mapping must change when the cell is edited. Breakpoints set before an edit may point at the wrong line afterward. Debugging also pauses the single execution thread, so the kernel cannot answer other requests while stopped.",
    k: ["Mapping cells to synthetic files vs debugging only whole scripts: synthetic paths allow cell-level breakpoints, but edits invalidate positions and re-execution creates new paths.", "A separate debug channel vs multiplexing on the shell channel: a separate channel stays responsive while paused, but needs protocol and kernel support that not every language runtime provides."],
    p: ["Editing a cell after setting a breakpoint leaves the breakpoint on a line that no longer holds that code.", "A paused kernel cannot answer completion or heartbeat requests, so the server may mark it dead."],
    v: "Set a breakpoint inside a loop in a cell, run it, and confirm execution stops there with the loop variable visible, then step once and confirm the value changes.",
    dep: ["cell-editor", "kernel-process", "channels"]
  },
  "widget-model": {
    s: "The shared definition of a widget: a named set of synchronized properties with a kernel-side object and a browser-side counterpart, identified by a model ID.",
    d: "Each widget has a model holding its state, such as a slider's value and range, and one or more views that draw it. The model exists on both sides and is created through the protocol's comm mechanism. Properties declare types and validation so that a bad value from either side is rejected or coerced. Models can reference other models, for example a layout object or a container's children, so the state forms a graph. The hard part is lifecycle: models must be released when no views or kernel references remain.",
    k: ["Typed declarative properties vs free-form state dictionaries: typing catches invalid values and enables serialization, but every new widget needs a schema.", "Models that outlive views vs models tied to one output: long-lived models let several views share state, but require reference tracking to avoid leaks."],
    p: ["Models created in a loop are never closed and accumulate in browser memory.", "A kernel restart destroys models that the page still displays, leaving controls that look alive and do nothing."],
    v: "Create a slider in the kernel, display it twice, move one view, and confirm the other moves and the kernel attribute reads the new value. Restart the kernel and confirm the views show a disconnected state.",
    dep: ["comm-messages", "namespace-execution-counter"]
  },
  "widget-state-sync": {
    s: "The protocol traffic that keeps the kernel and browser copies of a widget identical: change messages in both directions, throttled and ordered so updates do not loop or reorder.",
    d: "When a user drags a slider, the browser sends a small update message over a comm; the kernel applies it and fires observers. When kernel code changes a property, the reverse happens. To avoid echo loops, a change applied from one side is marked so it is not sent back. High-frequency sources such as dragging need throttling. Ordering matters because messages for several properties can interleave, and a slow kernel can receive hundreds of stale values.",
    k: ["Sending every change vs coalescing to the latest: sending all preserves history for observers, but floods a busy kernel; coalescing keeps it responsive and loses intermediate values.", "Optimistic local update vs waiting for kernel confirmation: optimistic updates feel immediate, but may briefly show a value the kernel rejects or clamps."],
    p: ["A callback that sets the property it observes can loop between kernel and browser until the page freezes.", "Throttling that drops the final value leaves the control and the kernel disagreeing after the drag ends."],
    v: "Drag a slider rapidly while a kernel callback appends to a list, and confirm the final kernel value equals the control's displayed value and the callback ran fewer times than events were generated.",
    dep: ["widget-model", "comm-messages", "iopub-broadcast"]
  },
  "widget-view-rendering": {
    s: "The browser code that draws a widget from its model and updates the drawing when properties change, inside the output area or in a standalone page.",
    d: "A view subscribes to model change events and updates only the affected DOM, so a long table does not redraw on each keystroke. Container widgets create child views from their children's models. Views are bundled as JavaScript modules, loaded on demand when the output first names the widget's module and version. The renderer must work in multiple hosts: the notebook editor, a static export, and an embedded app. Each host provides a different way to load modules and a different level of kernel connection.",
    k: ["Fine-grained property updates vs re-rendering the whole view: fine-grained is fast and keeps focus and scroll, but each widget author must write update logic.", "Loading view code from a package registry at render time vs bundling it: runtime loading supports any widget, but fails offline and creates a supply-chain exposure."],
    p: ["A widget whose view module cannot be found renders as raw text, with no hint that an extension is missing.", "Views that re-render fully on every change lose focus mid-typing."],
    v: "Open a notebook using a widget package that is not installed and confirm the page names the missing module; install it and confirm the control renders and updates without full redraws.",
    dep: ["widget-model", "output-area"]
  },
  "widget-layout": {
    s: "Layout and style properties for widgets, exposed as objects so that width, alignment, spacing, and appearance can be set from code and inherited by container widgets.",
    d: "Layout is separated from the widget's own state: a layout object holds properties such as width, height, margin, flex direction and grid placement, and maps them to CSS. Containers arrange children in rows, columns, tabs or grids. Style objects cover appearance that layout does not, such as label width or button color. This keeps widget code portable, but the abstraction leaks: themes, dark mode and print stylesheets interact with it, and a layout that looks right in the editor may break in an exported page.",
    k: ["Layout as a typed object vs raw CSS strings: objects validate and travel across languages, but only expose the properties the library chose; raw CSS is flexible and ties code to the browser.", "Theme-aware styles vs fixed colors: theme-aware widgets match dark mode, but depend on host variables that exports may not define."],
    p: ["Fixed pixel widths overflow in narrow viewports and slide layouts.", "A widget styled for a light theme becomes unreadable in dark mode."],
    v: "Place the same dashboard in the editor, an exported HTML page and a narrow window, and confirm controls remain visible and readable in each theme.",
    dep: ["widget-model", "widget-view-rendering"]
  },
  "widget-persistence": {
    s: "Saving widget state into the notebook or an export so that a static copy can display the widgets as they were, even though no kernel is running.",
    d: "On save, the front end collects every live model's state into a metadata block keyed by model ID, together with the module versions needed to display it. A static viewer reads that block, creates models without a kernel, and renders views. Interactions that need computation still need a kernel, so static pages work for states that were precomputed, such as an embedded plot with a slider over stored frames. The risk is size: state includes data, and a widget holding a large array can multiply file size.",
    k: ["Embedding state in the file vs leaving it out: embedding gives faithful static copies, but grows files and diffs; leaving it out keeps files small and loses controls on reload.", "Saving every model vs only displayed ones: saving all is complete, but keeps orphaned state that bloats the file."],
    p: ["Embedded state for a large dataset makes the notebook file tens of megabytes and every diff unreadable.", "Stale state restored for a widget whose code changed shows controls that no longer match the program."],
    v: "Save a notebook with a slider, open it in a static viewer with no kernel, and confirm the slider shows its saved value and the notebook file records the model state and version.",
    dep: ["widget-model", "output-serialization"]
  },
  "widget-extensions": {
    s: "How third-party widgets are packaged: a kernel-side library and a browser-side module that must be installed, versioned and discovered together.",
    d: "A widget package has two halves released as one unit: code that defines the model in the kernel's language and a bundle of browser modules with a compatible view. The front end needs to find the bundle by name and version at runtime, through a server extension, a labextension directory or a content delivery fallback. The protocol version of the widget system also has to match. Mismatches between the halves, or between package and front end, are the usual failure mode.",
    k: ["Installing the browser half with the kernel package vs fetching it on demand: bundled install is reproducible offline, but needs a server rebuild or restart; on-demand fetch is easy and brittle.", "Strict version matching vs tolerant ranges: strict matches prevent subtle breakage, but force upgrades in lockstep across environments."],
    p: ["Upgrading only the kernel-side package leaves the browser module old, and the control silently fails to update.", "Extensions that need a build step block installation on locked-down managed servers."],
    v: "Install a widget package in a clean environment, open a notebook using it, and confirm both halves report the same version and the control renders with no network access.",
    dep: ["widget-view-rendering", "server-extensions"]
  },
  "realtime-shared-editing": {
    s: "Several people editing the same notebook at once, with changes merged automatically into one document using a conflict-free data type or an operation log.",
    d: "The notebook model is held in a replicated data structure: cells form an ordered list, each cell's source is a shared text, and metadata is a map. Local edits apply immediately and are broadcast; remote edits merge regardless of arrival order. A server relays updates and persists snapshots. It is hard because the model has more than text: reordering cells, changing types, and editing the same cell concurrently all need defined results, and outputs written by a single kernel must have one authoritative writer.",
    k: ["Conflict-free replicated types vs a central operation server: replicated types merge offline edits and need no single owner, but grow metadata; a central server keeps the log small and needs connectivity.", "Merging outputs from all clients vs only the kernel owner: one writer avoids duplicated or interleaved results, but clients must be told who the owner is."],
    p: ["Two people run the same cell and both write outputs, so results interleave or duplicate.", "The saved file and the live shared state diverge when autosave and a collaborator write at once."],
    v: "Open the same notebook in two browsers, type in the same cell at once, and confirm both show identical text after the edits settle. Reorder a cell on one side and confirm the other follows.",
    dep: ["cell-model", "contents-manager", "websocket-gateway"]
  },
  "presence-awareness": {
    s: "Showing who else is in the notebook: names, cursors, selections and which cell each person is viewing or running.",
    d: "Presence is ephemeral state: it is broadcast over the same channel as edits but never stored in the document. Each client announces its user, color, cursor and selection, and clears it on disconnect or timeout. The view draws remote cursors in the editors and marks cells being run. The difficulty is volume and privacy. Cursor traffic is frequent and must be throttled, and users in shared deployments may not want their activity or identity visible to every viewer.",
    k: ["Ephemeral presence vs persisting it in the document: ephemeral state keeps files clean and is lost on crash, which is fine; persisted presence would clutter history.", "Showing identities vs anonymous cursors: names help coordination, but expose who is viewing in open or public notebooks."],
    p: ["Ghost cursors remain after a browser crash because no disconnect message was sent.", "Per-keystroke presence traffic competes with edit traffic on slow links."],
    v: "Join a notebook from two accounts, move the cursor in one, and confirm the other shows it within a second; close the first tab abruptly and confirm its cursor disappears after the timeout.",
    dep: ["realtime-shared-editing"]
  },
  "comments-annotations": {
    s: "Threaded comments attached to cells, text ranges or outputs, used for review and discussion without editing the notebook content itself.",
    d: "Comments reference an anchor: a stable cell identifier and optionally a text range within it. Anchors must survive edits, so ranges are tracked relative to the changing text, and comments on a deleted cell become orphaned and are flagged. Storage is either inside the file's metadata, which travels with the notebook but pollutes diffs, or in a side service keyed by notebook and cell ID. Comments on outputs are harder, as outputs are replaced each run.",
    k: ["Comments in the notebook file vs a separate store: in-file travels with copies and offline, but changes the file on every reply; a side store keeps files clean and breaks when the notebook is moved.", "Anchoring to cell IDs vs line numbers: IDs survive reordering, but only if IDs are stable across copy and merge."],
    p: ["Comments anchored to output vanish when the cell reruns and the output is replaced.", "Copying a notebook duplicates cell IDs, so comments appear on the wrong notebook's cells."],
    v: "Comment on a text range, edit above it, and confirm the comment follows the same text. Delete the cell and confirm the comment is shown as orphaned rather than lost.",
    dep: ["stable-cell-ids", "cell-model"]
  },
  "sharing-permissions": {
    s: "Rules for who may view, edit, run or administer a notebook, enforced by the server for both files and kernels.",
    d: "Permissions differ by action. Viewing needs file read access. Editing needs write access. Running is the sensitive one, because executing code uses the host's identity, files and credentials. Servers either run each user in a separate account or container, or restrict run rights to the owner. Shared links can grant view-only access to a rendered copy. Enforcement must be at the server, never in the front end, and must also cover the kernel channels, not just the file.",
    k: ["Run rights separate from edit rights: lets reviewers change prose without executing code, but requires the server to distinguish them on every kernel message.", "Per-user kernels with their own identities vs one shared account: separate identities contain damage and attribute actions, but cost resources and need an identity integration."],
    p: ["A user with edit access can add a cell and run it as the owner, gaining every permission the owner has.", "A shared link to an executed copy exposes outputs that include secrets or private data."],
    v: "Grant a second account edit but not run access, attempt to execute a cell from it, and confirm the server rejects the execute request and logs the denial.",
    dep: ["auth-tokens", "contents-manager", "session-manager"]
  },
  "shared-kernel-sessions": {
    s: "Several users or browsers attached to one running kernel, sharing its variables and seeing the same outputs.",
    d: "A kernel is a single stateful process, so sharing it means every participant sees and changes the same namespace. Execution requests from multiple clients are serialized in arrival order. Outputs are broadcast to all attached clients, but a client that connects late misses earlier output unless the server replays it or the document stores it. The model works for pairing and teaching and fails for independent analysis, since one person's reassignment of a variable silently changes another's results.",
    k: ["One shared kernel vs a kernel per user on the same document: shared state supports pairing, but allows interference; per-user kernels isolate and make output ownership ambiguous.", "Replaying output history to late joiners vs showing only new output: replay gives context, but needs the server to buffer messages."],
    p: ["Two people run cells that reassign the same variable and each sees the other's values with no warning.", "A late joiner sees partial output because the early messages were not retained."],
    v: "Attach two browsers to one kernel, set a variable from one, read it from the other, and confirm a late-joining third browser sees the retained outputs of the last runs.",
    dep: ["kernel-manager", "iopub-broadcast", "session-manager"]
  },
  "output-area": {
    s: "The region below a cell that displays everything the last execution produced: text streams, errors, rich results and widgets, kept in the order they arrived.",
    d: "The output area is a list of output items that grows as messages arrive from the kernel. Streams merge consecutive writes into one text block. Display data may be updated in place later by ID, which supports progress bars and animations. Clearing may be immediate or deferred until the next output arrives to avoid flicker. The area also owns scrolling, collapsing and truncation. It is hard because it renders untrusted content from many sources, and every renderer must agree on lifecycle and cleanup.",
    k: ["Appending items as they arrive vs rendering only on completion: streaming shows progress, but forces incremental rendering and update-by-ID semantics.", "One renderer per MIME type behind a common interface vs hard-coded cases: pluggable renderers add formats cheaply, but need a lifecycle contract for disposal."],
    p: ["An output that updates ten times a second slows the whole page when each update re-renders every item.", "A clear request arriving after a new output removes results the user needed."],
    v: "Run a cell that prints a hundred lines with a progress display updated in place, and confirm the page stays responsive, the progress shows one updating item, and the text appears in order.",
    dep: ["iopub-broadcast", "mime-selection"]
  },
  "mime-bundles": {
    s: "A dictionary mapping MIME types to representations of one result, such as plain text, HTML, an image and a structured data format, so each viewer chooses what it can show.",
    d: "When a kernel displays an object, a formatter produces several representations of it in one bundle. A table might carry plain text for a terminal, HTML for the editor, and a structured JSON form for tools. Metadata travels alongside, giving image dimensions or sandbox hints. Binary data is base64 encoded inside the JSON message. The bundle is the contract between kernel and every viewer, including exporters that never talk to a kernel.",
    k: ["Sending all representations vs the one requested: all lets any later viewer choose, but multiplies message and file size; on-demand needs a live kernel.", "Open MIME types vs a fixed list: open types let libraries add formats, but viewers must handle unknown types gracefully."],
    p: ["A large image sent in three formats triples the notebook file size.", "A bundle missing a plain-text fallback shows nothing in terminals and text exports."],
    v: "Display one object and inspect the message, confirming several MIME keys with consistent content, then open the notebook in a terminal viewer and confirm the plain-text form is shown.",
    dep: ["display-hooks", "message-envelope"]
  },
  "mime-selection": {
    s: "The rule by which a viewer picks one representation from a bundle: an ordered list of preferred types, filtered by what the viewer can render and trust.",
    d: "Each front end has a priority order, typically structured or rich types first and plain text last. It walks the bundle and takes the first type it has a renderer for and that is allowed in the current trust state. Untrusted notebooks exclude active types such as scripts and live HTML, which falls back to images or text. Exporters have their own orders: print prefers static images, web pages prefer HTML. The ordering is policy, so different tools can show the same result differently.",
    k: ["Fixed priority list vs per-output user choice: a fixed list is predictable, but cannot honor a user who wants raw text for one result.", "Trust-aware filtering at selection vs at rendering: filtering early prevents active content from ever reaching a renderer, but couples selection to the security model."],
    p: ["A new MIME type with no renderer silently falls back to text, so users believe the library is broken.", "Selection ignores trust, and an untrusted notebook renders live script-bearing HTML."],
    v: "Open a notebook whose output bundle has script-bearing HTML and an image, in untrusted and trusted state, and confirm the first shows the image and the second runs the HTML.",
    dep: ["mime-bundles", "trust-model"]
  },
  "stream-and-error-output": {
    s: "Standard output, standard error and exceptions from a cell, delivered as text streams and structured error messages with a traceback.",
    d: "The kernel captures the runtime's output channels and forwards chunks as stream messages tagged by name. The front end merges consecutive chunks, and interprets control characters such as carriage return for in-place progress and ANSI sequences for color. Errors arrive as a structured message holding name, value and traceback lines, and the front end formats them with links to cell positions. The difficulty is volume and fidelity: a loop that prints a million lines can overwhelm the browser, and output from background threads may land under the wrong cell.",
    k: ["Rate limiting and truncation at the kernel vs in the browser: kernel limits protect the network and the page, but hide output the user wanted; browser limits keep data and risk freezing.", "Interpreting terminal control sequences vs showing raw text: interpretation gives familiar progress bars and color, but needs a parser and can be abused to hide output."],
    p: ["Output from a background thread appears under whichever cell is running now, mislabeling its source.", "Unbounded printing in a loop freezes the browser tab and loses the actual error."],
    v: "Run a cell that prints one hundred thousand lines then raises an error, and confirm the page stays responsive, the output is truncated with a notice, and the error and traceback still appear.",
    dep: ["iopub-broadcast", "output-area"]
  },
  "figure-rendering": {
    s: "Turning plotting library results into displayed images or interactive charts, as static raster or vector images or as structured specifications drawn in the browser.",
    d: "A plotting library either renders to an image in the kernel, or emits a declarative chart specification that browser code draws. Images are simple and portable and cannot be hovered or zoomed. Specifications allow interaction and small payloads, but require a renderer in every viewer, including exports. A backend setting decides which one is produced, and figures created but not displayed may be shown when the cell ends or may leak into later cells. High-density displays need either vector output or larger raster images.",
    k: ["Static images vs browser-rendered specifications: images work everywhere including print and email, but cannot be explored; specifications give interaction at the price of renderer availability and larger files.", "Showing figures automatically at cell end vs requiring an explicit display call: automatic is convenient, but reveals half-built figures and clutters outputs."],
    p: ["An interactive chart exported to PDF becomes an empty box because the renderer script did not run.", "A figure left open from an earlier cell appears again in a later cell's output."],
    v: "Plot one chart both ways, export to PDF and HTML, and confirm the static image appears in both while the interactive version is replaced by its fallback image in the PDF.",
    dep: ["display-hooks", "mime-bundles", "interactive-html-outputs"]
  },
  "table-display": {
    s: "Rendering tabular results as readable tables with truncation, sorting and paging, often from a data frame object rather than plain text.",
    d: "The kernel's formatter turns a table-like object into HTML with a limited number of rows and columns, plus a structured form for richer viewers. More capable viewers take the structured data and provide sorting, filtering and virtual scrolling, requesting more rows from the kernel as the user scrolls. Display limits are configurable and apply to the formatter, not to the object itself. The tradeoff is between faithful display and cost, because converting a large table to HTML is slow and the result is bulky.",
    k: ["Rendering a bounded HTML snapshot vs a live paged view: a snapshot stays in the file and needs no kernel, but is a truncated copy; a paged view shows everything and requires a running kernel.", "Showing head and tail with a gap vs the first rows only: head and tail reveals more about the data, but can mislead on sorted or grouped tables."],
    p: ["Silent truncation makes users believe the table has only the rows shown.", "HTML for a table with thousands of columns locks up the browser."],
    v: "Display a table with one million rows and confirm the output renders in under a second, shows the total row count, and that the saved file contains only the bounded preview.",
    dep: ["display-hooks", "mime-bundles"]
  },
  "interactive-html-outputs": {
    s: "Outputs that carry HTML, styles and scripts, giving charts, maps and apps their own behavior inside the output area, at the cost of running content from the file.",
    d: "HTML outputs are inserted into the page, sometimes inside an isolated frame. Scripts in them load libraries, draw on canvases and may open connections to the kernel through comms. Because they execute, they are the main route by which a notebook file runs code in the reader's browser before any cell is run. Trusted notebooks may render them inline. Untrusted ones sanitize them, drop scripts, or confine them to a sandboxed frame without access to the host page.",
    k: ["Inline in the page vs in a sandboxed frame: inline allows tight integration and style sharing, but gives content the page's full privileges; a frame isolates and loses sizing, theming and kernel access.", "Allowing scripts only in trusted notebooks vs always: restricting prevents attacks from untrusted files, but breaks charts users saved and shared."],
    p: ["Script outputs from an untrusted file run with the viewer's session cookies and can act as them.", "Multiple outputs loading incompatible versions of one library overwrite each other's global variables."],
    v: "Open a notebook with a script-bearing output while untrusted and confirm the script does not run; then trust it, reload, and confirm the output runs inside its configured container.",
    dep: ["output-sanitization", "content-security-isolation", "mime-selection"]
  },
  "large-output-handling": {
    s: "Limits and strategies that keep very large outputs, such as huge images, long logs and big tables, from bloating files, freezing browsers or flooding the connection.",
    d: "Outputs are stored in the notebook file and held in browser memory, so size matters in three places: the wire, the page and the file. Strategies include truncating text with a note, switching long outputs into scrollable regions, downsampling images, writing big results to external files and referencing them, and refusing to save outputs above a size. Limits live in several layers, in the kernel formatter, the server's message size cap, and the browser, and the one that triggers decides what the user sees.",
    k: ["Truncating at the source vs storing everything and virtualizing the view: truncation protects every layer and loses data; virtualization keeps data and still stores a huge file.", "Hard size caps vs warnings: caps prevent breakage, but silently drop results; warnings preserve results while allowing the file to become unusable."],
    p: ["A single embedded image of tens of megabytes makes the notebook slow to open and impossible to diff or load in review.", "A message above the socket size limit closes the connection and kills the session mid-execution."],
    v: "Display an output larger than the limit and confirm a visible notice appears, the page stays responsive, the connection survives, and the saved file stays below the configured size.",
    dep: ["websocket-gateway", "output-serialization", "output-area"]
  }
});
