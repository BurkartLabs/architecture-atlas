// Details for the text editor plate, part 4: language and debug clients, workspace and integrated tools.
ATLAS.details("text-editor", {
  "language-client": {
    s: "Speaks the language server protocol to a separate analysis process: starts it, syncs open documents, sends requests and routes responses to the features that display them.",
    d: "The client launches one server per language or workspace, negotiates capabilities, then keeps the server's copy of each open document in step by sending open, change and close notifications from the buffer's change deltas. Features send requests for completion, hover, definitions and more, each tagged with the document version. Responses that arrive for an old version are dropped or mapped. It handles restarts after a crash, cancellation and progress reporting. It is hard because the server is slow, asynchronous and unreliable, and position units must match the protocol.",
    k: ["One server per workspace vs. per project root: a single server shares analysis, while per-root servers isolate failures and configuration at higher memory cost.", "Incremental document sync vs. full text: incremental is cheap for large files, but any mistake desynchronizes the server's copy."],
    p: ["Sending UTF-16 positions mapped from the wrong unit places every result off by one on lines with emoji.", "A crashed server that restarts without resending open documents answers from stale text."],
    v: "Edit a file rapidly while the server is slow. Results shown always match the current text or are discarded, the server's document copy equals the buffer when queried, and killing the server restarts it with documents resynced.",
    dep: ["change-deltas","position-mapping","extension-host","background-workers"]
  },
  "completion-ui": {
    s: "Shows ranked suggestions as the user types, filters them locally between server calls, and inserts the chosen item with its additional edits and snippet placeholders.",
    d: "Triggers are typed characters, specific trigger characters or an explicit command. The client requests items from the language client and other providers, merges them, and filters and ranks locally by prefix match, recent use and the server's own sort. A details panel shows documentation. Accepting applies the main edit plus any additional edits, such as inserting an import, in a transaction, and enters snippet mode if placeholders exist. It is hard because latency is visible, results arrive late, and the list must not jump under the user's fingers.",
    k: ["Filter locally between requests vs. ask the server on every key: local filtering feels instant, but may show items the server would have excluded.", "Resolve item details lazily vs. send everything: lazy resolution keeps the list fast, but needs a second request when the user selects."],
    p: ["A late response replaces the list just as the user presses enter and inserts a different item.", "Additional edits applied at stale positions insert an import in the wrong place."],
    v: "Type quickly in a file with a slow server. The list updates smoothly by local filtering, the selected item stays put when new results arrive, and accepting an item with an import inserts both edits as one undo step.",
    dep: ["language-client","snippets-and-macros","edit-transactions","text-input-methods"]
  },
  "diagnostics-display": {
    s: "Shows errors and warnings from servers and linters as underlines, gutter marks, a problems list and navigation commands, kept attached to the right text.",
    d: "Providers publish diagnostics for a file with range, severity, message and code. The editor stores them by source and file, maps their ranges through edits made since the version they were computed for, and shows them as decorations and in a list sorted by file and severity. Next and previous commands navigate. Quick fixes attach through code actions. It is hard because diagnostics arrive after typing, so they must be shifted correctly in the meantime, and thousands of them must not slow the editor.",
    k: ["Show diagnostics from stale versions shifted vs. hide until fresh: shifting avoids flicker, but may briefly point at wrong code.", "Merge sources into one list vs. keep separate by source: merged is simpler to read, while separate lets users silence one noisy tool."],
    p: ["Diagnostics from a closed or renamed file linger forever because nothing clears the source.", "Thousands of warnings in a generated file make decorations and the list lag."],
    v: "Introduce an error, type above it, and see the underline stay on the error. Fix it and see the mark clear within a second, and open a file with five thousand warnings without noticeable lag.",
    dep: ["language-client","decorations-and-markers","anchors-and-markers"]
  },
  "hover-and-signature-help": {
    s: "Shows documentation and types for the symbol under the pointer or cursor, and parameter hints while typing a call, from the language server.",
    d: "Hovering for a short delay sends a request for the position and shows the returned formatted text in a popup, with links. Signature help triggers on typing the opening parenthesis or a comma, shows the current signature, and highlights the active parameter. Results are rendered from a limited markup subset, and may combine diagnostics and server content. It is hard because popups are overlays that must position correctly near edges, stay put while the user moves toward them, and render untrusted markup safely.",
    k: ["Delay before hovering vs. immediate: a delay avoids flicker and requests on every pointer move, but feels sluggish for people who want instant answers.", "Render rich markup vs. plain text: rich text shows code blocks and links, but widens the attack surface and rendering cost."],
    p: ["Links inside hover content that run commands let a hostile server trigger actions in the editor.", "A popup that closes when the pointer moves toward it makes its links unreachable."],
    v: "Hover over a function call: a popup with its signature and documentation appears after the delay, the pointer can move into it to click a link, and typing a comma inside a call highlights the next parameter.",
    dep: ["language-client","overlay-layers"]
  },
  "code-actions": {
    s: "Offers fixes and refactors for the current position or selection, such as quick fixes, rename, extract and organize imports, applied as workspace edits.",
    d: "At the cursor or selection, the client asks providers for available actions, grouped as quick fix, refactor or source action, and shows them in a menu or a lightbulb. Choosing one applies a workspace edit that can touch many files, possibly creating or renaming files, and may run a command. Rename asks the server for all references, then applies one atomic edit with preview. It is hard because the edit is computed against a document version that may have changed, and must apply all or nothing.",
    k: ["Apply workspace edits atomically vs. file by file: atomic application keeps the project consistent and undoable, but needs validation of every file first.", "Show the lightbulb automatically vs. on request: automatic is discoverable, but costs a server request on every cursor move."],
    p: ["An edit computed against an earlier version applies at shifted offsets and corrupts code.", "A rename that reaches files not open or not saved leaves the project half renamed if one file fails."],
    v: "Rename a symbol used in twenty files. A preview lists every change, applying updates all files, a single undo reverts them, and a failure injected into one file leaves all files unchanged.",
    dep: ["language-client","replace-and-preview","edit-transactions"]
  },
  "semantic-tokens": {
    s: "Coloring supplied by the language server using its knowledge of the code, layered over grammar-based colors to distinguish variables, parameters, types and more.",
    d: "The server returns a compact array of tokens, each with position delta, length, type and modifiers. The editor decodes it, maps types and modifiers to theme scopes, and overlays them on the base highlighting. Updates may be full or as deltas, and ranges can be requested for just the viewport. Colors arrive after the base highlight, so there is a brief flash if they differ. It is hard because positions must be adjusted through edits made since the response was computed.",
    k: ["Overlay on grammar colors vs. replace them: overlaying keeps instant coloring and improves it later, but produces visible changes when the layers disagree.", "Request the full file vs. only the viewport: full-file results make scrolling smooth, while viewport requests save work on large files."],
    p: ["Applying tokens computed for an old version colors the wrong words until the next response.", "Themes that do not define the server's token types ignore the information entirely."],
    v: "Open a file and compare colors before and after the server responds: parameters and types gain distinct colors, base colors show immediately on open, and typing does not shift the semantic colors off their identifiers.",
    dep: ["language-client","grammar-tokenizer","anchors-and-markers"]
  },
  "formatting-hooks": {
    s: "Runs formatters and linters on request or on save, applies their output as minimal edits, and reports their problems in the same list as other diagnostics.",
    d: "A formatter is invoked with the document or a range, from a language server or a command-line tool, and returns edits or replacement text. The editor diffs replacement text against the buffer so only changed ranges are applied and cursors and markers survive. Format-on-save runs before the write with a time limit. Linters run on save or while typing and publish diagnostics. It is hard because formatters can be slow, disagree with one another and fail on syntax errors.",
    k: ["Apply a minimal diff vs. replace the whole document: a diff keeps cursors, folds and undo sensible, while replacement is simpler and loses that state.", "Format before the write vs. after: before keeps the file on disk formatted, but delays saving by the formatter's time."],
    p: ["A formatter that hangs makes save appear to do nothing, so the time limit must exist.", "Two formatters configured for the same language undo each other's output on every save."],
    v: "Save a badly formatted file with format-on-save. The file on disk is formatted, the cursor stays on the same token, undo reverts the formatting alone, and a formatter that times out lets the save complete unformatted with a warning.",
    dep: ["language-client","edit-transactions","atomic-save","diagnostics-display"]
  },
  "debug-client": {
    s: "Talks the debug adapter protocol to a debug process, to launch or attach to a program, control execution and show threads, stacks, variables and output.",
    d: "A debug adapter sits between the editor and the runtime. The client sends configuration to launch or attach, then breakpoints, and commands for continue, step over, step in and pause. The adapter reports stops, with thread and stack, and the client requests scopes, variables and evaluations lazily as the user expands them. Output and exceptions stream to a console. It is hard because the debugged program, the adapter and the editor are three asynchronous processes whose state can drift apart.",
    k: ["Generic protocol with per-language adapters vs. built-in debuggers: a protocol lets one editor support many runtimes, but adapters differ in quality and features.", "Fetch variables lazily vs. eagerly: lazy fetching keeps stops fast, but each expansion costs a round trip."],
    p: ["Breakpoints set before the adapter is ready are lost unless they are re-sent on session start.", "Evaluating an expression with side effects in the debug console changes the program being observed."],
    v: "Launch a sample program, hit a breakpoint, step three times, expand a nested object and change a variable. The stack, values and execution line match a command-line debugger session on the same program.",
    dep: ["extension-host","integrated-terminal","breakpoints-and-inline-values"]
  },
  "breakpoints-and-inline-values": {
    s: "Gutter breakpoints, conditions, logpoints and values shown beside the code during a stop, kept attached to the right lines as text is edited.",
    d: "Clicking the gutter creates a breakpoint stored by anchor, so it moves with edits, and sent to the adapter by file and line. Conditional breakpoints, hit counts and logpoints add expressions. The adapter reports which breakpoints were actually bound, and the editor shows unverified ones differently. While stopped, inline values appear after variables, and hovering evaluates expressions. It is hard because the file the debugger runs may differ from the one being edited.",
    k: ["Anchor breakpoints to text vs. store line numbers: anchors survive edits, but the running program still uses its original line numbers until restart.", "Show inline values from the adapter vs. static analysis: adapter values are real, while static analysis is cheap but may show wrong values."],
    p: ["Edits made during a debug session leave the displayed line out of sync with the running code.", "Breakpoints on lines with no executable code are silently moved by the adapter, confusing users."],
    v: "Set a breakpoint, edit lines above it, and confirm it stays on its statement. Run to it and check inline values match the variables panel, and see an invalid breakpoint shown as unverified.",
    dep: ["anchors-and-markers","decorations-and-markers","debug-client"]
  },
  "workspace-model": {
    s: "The editor's idea of a project: one or more root folders, their settings, open editors and layout, which together are saved and restored as a session.",
    d: "A workspace is a set of root folders plus workspace-level settings, tasks and recommended extensions. The model owns the list of open editors, their groups and layout, per-folder settings and scopes for search, source control and language servers. Saved sessions restore these. Multi-root workspaces mean every feature must handle several roots with different settings. It is hard because the same folder opened in two windows shares files but must not share unsaved state, and paths may refer to remote or virtual file systems.",
    k: ["Single root vs. multi-root workspaces: single root is simple to reason about, while multi-root supports related projects but multiplies every per-folder feature.", "Store workspace data in the project vs. in the editor's own store: in-project files can be shared with a team, while editor storage keeps personal state out of version control."],
    p: ["Opening one folder in two windows lets both write the same session store and corrupt it.", "Features that assume a single root pick the first folder's settings for files in the second."],
    v: "Open a workspace with two roots having different tab width settings. Files in each root use their own setting, search can be scoped to either, and closing and reopening restores editors and layout.",
    dep: ["settings-layering","remote-fs-provider"]
  },
  "file-explorer": {
    s: "A tree view of the workspace's files and folders for browsing, opening, creating, renaming, moving and deleting, kept in step with changes on disk.",
    d: "The tree loads directory contents lazily as folders expand, and sorts, filters and decorates entries with source control state and diagnostics. Operations such as rename or move go through the file service, update open editors that refer to the file, and can be undone. Drag and drop, copy and paste, and multiple selection are supported. It is hard because the tree must remain responsive on directories with huge numbers of entries and on slow remote file systems, while reflecting changes from outside.",
    k: ["Lazy per-folder loading vs. loading the full tree: lazy loading opens instantly on huge repositories, but makes whole-tree features such as search need their own walk.", "Rename updates open editors and references vs. only the file: updating keeps work intact, but means a rename is a multi-step operation that can partly fail."],
    p: ["Deleting a file that is open leaves an editor with unsaved text and no file behind.", "A directory with a million entries freezes the tree if sorting and rendering are not batched."],
    v: "Rename a folder containing open files. The editors follow to the new paths without losing unsaved text, source control marks update, and expanding a folder of one hundred thousand entries remains responsive.",
    dep: ["workspace-model","file-watching","scm-integration"]
  },
  "file-watching": {
    s: "Subscribes to operating system change notifications for the workspace and delivers debounced events about created, changed and deleted files to explorers, search and buffers.",
    d: "The watcher registers recursive watches on workspace folders, excluding heavy directories such as dependencies and build output, and receives events from the kernel or a polling fallback. It coalesces bursts, such as a branch switch, into batches and normalizes platform differences: renames as delete plus create, case changes, and missing events on network drives. Consumers include the explorer, index, source control and the buffers. It is hard because limits on watch counts, event floods and missed events are normal.",
    k: ["Kernel notifications vs. polling: notifications are cheap and prompt, but miss changes on network and virtual file systems and hit watch-count limits.", "Watch the whole tree vs. only open folders: whole-tree watching keeps indexes right, but consumes the most resources."],
    p: ["Exhausting the system's watch limit makes the editor silently stop noticing changes.", "A build writing thousands of files per second floods listeners and freezes the interface unless excluded and batched."],
    v: "Switch branches that change thousands of files. The explorer and index update within a couple of seconds from a few batched events, the editor stays responsive, and a file changed on a network share is detected by polling.",
    dep: ["workspace-model","background-workers"]
  },
  "scm-integration": {
    s: "Shows version control state in the editor: changed files, line-level change marks in the gutter, staging, commit, branch switching and history, driven by the version control tool.",
    d: "A provider runs the version control tool, or links to its library, to list status, compute diffs against the committed version, and perform operations. The editor shows change marks in the gutter, a changes list, blame annotations and a commit box. Status refreshes on file watching events with debouncing. Large repositories make status slow, so it runs in the background with cancellation. It is hard because operations are invoked on a repository that other tools also modify, and long commands can leave locks.",
    k: ["Shell out to the tool vs. embed a library: shelling out matches the user's installed version and configuration, while a library is faster but may disagree with the tool.", "Refresh status eagerly vs. on demand: eager keeps marks current, but is costly in huge repositories."],
    p: ["Running status refreshes in parallel with a user's own command makes both fail on repository locks.", "Gutter marks computed against a stale base show wrong changes after a branch switch."],
    v: "Edit three lines, and see gutter marks within a second. Stage one hunk, commit, and compare with the command line's status. Switch branches in a large repository without freezing the editor.",
    dep: ["file-watching","workspace-model","diff-and-merge-view","background-workers"]
  },
  "diff-and-merge-view": {
    s: "Side-by-side or inline comparison of two versions of text, with word-level highlights, and a three-way view for resolving conflicts in merges.",
    d: "A diff algorithm computes the minimal line changes, then refines changed lines into word or character changes, and the view aligns the two sides with padding and synchronized scrolling. The three-way editor shows the two incoming versions and the base, with actions to accept either side per conflict, and an editable result. It works on large files by computing in a worker. It is hard because the best diff is not the minimal one humans find readable, and moved blocks are hard to detect.",
    k: ["Minimal diff vs. readable heuristics: minimal diffs are exact, but readable heuristics align function boundaries and blank lines the way people expect.", "Compute diff on the whole file vs. around changes: whole-file is simple, while windowed computation scales to huge files."],
    p: ["A diff computed on the interface thread freezes the editor when comparing two very large files.", "Resolving a conflict by accepting a side drops whitespace changes that were on the other side."],
    v: "Compare two versions of a file with moved and edited blocks, check the highlighted words and alignment. Resolve a conflict with changes on both sides, and see the result contain the expected merged text.",
    dep: ["background-workers","buffer-snapshots","scm-integration"]
  },
  "integrated-terminal": {
    s: "A terminal emulator inside the editor, connected to a shell through a pseudo-terminal, with scrollback, links to files and one tab per session.",
    d: "The editor starts the user's shell on a pseudo-terminal, feeds its output through an emulator that interprets escape sequences into a grid of cells, and renders that grid, often on the GPU. Input keys are translated to the byte sequences programs expect. Output containing file paths and URLs becomes clickable. It is related to the standalone shell and terminal plate, and the editor adds integration: working directory, environment from the workspace, and links back to code.",
    k: ["Own emulator inside the editor vs. embed an external terminal window: an own emulator integrates links and layout, but must track terminal behavior forever.", "Render with the text renderer vs. a separate grid renderer: sharing keeps fonts and scaling consistent, but a terminal grid has different update patterns."],
    p: ["A program printing megabytes per second floods the emulator and freezes the interface if output is not throttled.", "Key bindings of the editor swallow keys that shell programs need, such as control combinations."],
    v: "Run a command that prints a million lines, then an interactive full-screen program. The interface stays responsive, the screen draws correctly, scrollback holds the output, and clicking a file path opens it at the right line.",
    dep: ["workspace-model","gpu-text-renderer","extension-host"]
  },
  "terminal-shell-integration": {
    s: "Markers emitted by the shell that tell the editor where each command starts and ends, its exit status and working directory, enabling command navigation and decoration.",
    d: "A small script loaded into the shell prints escape sequences around the prompt and each command, carrying the command text, exit code and current directory. The emulator records these as marks. The editor can then draw a status icon per command, jump between commands, rerun them, select a command's output, and track the directory for new terminals. It is hard because it depends on shell configuration, nested shells and remote sessions, and must fail silently when markers are absent.",
    k: ["Inject the integration script automatically vs. user installs it: automatic works out of the box, but modifies the user's shell startup, which some consider intrusive.", "Marks as escape sequences vs. watching process state: sequences are precise and portable, while process inspection works without cooperation but is imprecise."],
    p: ["Shell startup files that print their own output break marker parsing and shift marks.", "Pasting a command into a remote session hides the exit status because no integration is installed there."],
    v: "Run three commands, one failing. The terminal shows success and failure marks, jumping between commands lands on each prompt, and a new terminal opens in the last directory.",
    dep: ["integrated-terminal"]
  },
  "task-runner": {
    s: "Runs build, test and lint commands defined for the workspace, parses their output into diagnostics with problem matchers, and links results to source locations.",
    d: "Tasks are declared in workspace files or provided by extensions, with command, arguments, working directory, environment and dependencies on other tasks. Running one uses a terminal or a hidden process. A problem matcher is a pattern set that turns output lines into file, line, severity and message, so errors appear in the problems list and as underlines. Watch tasks keep running and report incrementally. It is hard because tool output formats vary and change, and a matcher must also know when a build cycle starts and ends.",
    k: ["Pattern-based problem matchers vs. structured tool output: patterns work with any tool, while structured output is exact but needs tool support.", "Run tasks in a visible terminal vs. hidden: visible output helps debugging, hidden runs keep the screen clean."],
    p: ["A matcher that does not clear old problems when a new build starts leaves fixed errors on screen.", "Relative paths in output resolve against the wrong directory, so clicking an error opens no file."],
    v: "Run a build task that produces three errors in different files. The problems list shows each with the correct file and line, clicking opens the location, and fixing and rerunning clears them.",
    dep: ["integrated-terminal","diagnostics-display","workspace-model"]
  },
  "workspace-trust": {
    s: "A decision, made per folder, whether the editor may run code that comes from the folder, such as tasks, workspace settings and extensions, when it is opened.",
    d: "Opening an unknown project can execute code: tasks, debug configurations, formatters set in workspace settings, and extension features reading project files. In an untrusted folder, the editor opens in a restricted mode that disables those, tells extensions to limit themselves, and keeps text editing and reading available. The user can trust a folder or its parent, and the decision is remembered. It is hard because many features run external programs indirectly, and each must declare how it behaves when restricted.",
    k: ["Ask on first open vs. trust by default: asking protects against hostile repositories, but adds a prompt users tend to click through.", "Restrict features globally vs. let each extension decide: global restriction is uniform, while per-extension control keeps useful read-only features working."],
    p: ["A setting naming an executable path, honored in an untrusted workspace, runs attacker code on open.", "Users who always click trust gain nothing, so the prompt must explain concretely what is disabled."],
    v: "Open a folder with a malicious task and a setting pointing to a program. In restricted mode neither runs, the interface says which features are off, and trusting the folder enables them.",
    dep: ["settings-layering","extension-permissions","workspace-model"]
  }
});
