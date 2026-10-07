// Details for the text editor plate, part 3: editing operations, search and navigation, commands, keys and settings.
ATLAS.details("text-editor", {
  "cursors": {
    s: "Tracks the insertion point and its preferred column, and implements movement by character, word, line, paragraph and document, plus the rules for where each lands.",
    d: "A cursor is a position, usually stored as an anchor that follows edits, together with a remembered column so that moving vertically through short lines returns to the original column. Movement commands depend on grapheme clusters, word definitions per language, wrapped rows and folds. Edits made by commands are applied at the cursor and the cursor is then moved to a defined place. It is hard because every movement rule has special cases at line ends, wrapped rows, bidirectional runs and fold boundaries.",
    k: ["Cursor as offset vs. line and column: offsets stay valid across line changes, while line and column match the remembered column behavior.", "Cursor at line end sticks to wrap boundary vs. starts next row: one choice makes end-key natural, the other makes typing continue visually in the right row."],
    p: ["Forgetting the preferred column makes vertical movement drift left after crossing one short line.", "A cursor placed inside a grapheme cluster causes deletion to leave stray combining marks."],
    v: "Move down through lines of varied lengths and back up: the cursor returns to its original column. Step through text with accents, emoji and tabs and confirm it never rests inside a cluster.",
    dep: ["anchors-and-markers","grapheme-and-width","position-mapping"]
  },
  "multi-selection": {
    s: "Supports many cursors and selections at once, created by clicking, adding the next match, selecting all matches or column selection, with every edit applied at each.",
    d: "The editor keeps an ordered set of non-overlapping selections. A typed character or command runs once per selection, and results are applied as one transaction. After the edit, selections are mapped through the changes, and any that overlap are merged. Commands that copy or paste distribute text per selection when counts match. It is hard because edits at several places change offsets for the later ones, so they must be processed from the end or with an offset adjustment, and many selections multiply the cost of everything.",
    k: ["One primary selection plus secondaries vs. an equal set: a primary gives commands a clear target, such as for scrolling and search, but complicates the model.", "Apply edits from last to first vs. adjust offsets going forward: reverse order keeps positions valid without adjustment, while forward adjustment fits delta reporting."],
    p: ["Overlapping selections after an edit not merged lead to doubled changes or corrupted text.", "Paste of N lines into N cursors works, but into a different count silently does something unexpected."],
    v: "Select ten identical identifiers with multiple cursors, type a new name, and confirm all change as one undo step. Then move cursors so two collide, and see them merged into one.",
    dep: ["cursors","edit-transactions","change-deltas"]
  },
  "edit-transactions": {
    s: "Groups a set of text changes made by one user action into a single unit, with its cursor state before and after, applied atomically and undone together.",
    d: "A transaction collects the edits from one command, such as a multi-cursor replace or a format operation, and applies them to the buffer as a batch with a single event. It records the selection before and after, so undo can restore both text and cursors. Typing is coalesced: consecutive characters merge into one group until a pause, a cursor jump or a change of kind. It is hard because grouping rules decide how undo feels, and extensions that apply edits must go through the same path.",
    k: ["Coalesce typing by time vs. by word: time-based grouping is easy to implement, while word-based grouping matches expectations more closely but needs language rules.", "Atomic batch vs. incremental application: batches give consistent events and one undo step, but must fully validate before applying."],
    p: ["Grouping too much makes undo erase a minute of typing, grouping too little needs dozens of presses.", "An extension edit applied outside a transaction creates a separate undo step that confuses users."],
    v: "Type a sentence, pause, type another, then run a multi-cursor replace. Undo removes the replace as one step, then the second sentence, then the first, restoring cursors each time.",
    dep: ["text-buffer-interface","change-deltas","multi-selection"]
  },
  "undo-tree": {
    s: "Records history as a tree rather than a line, so undoing and then making a new edit starts a branch and the earlier future is never lost.",
    d: "Each node is a transaction, with its parent being the state before it. Undo moves to the parent, redo to a chosen child, and a new edit after undo adds a sibling branch. A linear stack is the special case with one child per node. Users can navigate by branch or by time. Nodes store reversible deltas, or snapshots of persistent structures. Memory grows with history, so limits and compaction apply. It is hard because history must be consistent with markers, saved state and external reloads.",
    k: ["Tree vs. linear stack: a tree never discards work, but needs a way to browse branches, which most users never see.", "Store inverse deltas vs. persistent snapshots: deltas are compact but can be costly to apply across large changes, while snapshots make jumping cheap and use more memory."],
    p: ["Reloading a file from disk resets or silently invalidates history, so a later undo applies deltas to the wrong text.", "Unbounded history in a long session holds large old text alive."],
    v: "Type A, undo, type B, then open history. Both A and B states are reachable, moving between them restores exact text and cursors, and the saved-state marker follows the correct node.",
    dep: ["edit-transactions","buffer-snapshots","change-deltas"]
  },
  "auto-indent": {
    s: "Edits that happen as a side effect of typing: indenting a new line, re-indenting after a closing bracket, continuing comments and lists, and smart paste indentation.",
    d: "On a newline, the editor computes the indent from the previous line and the language's indentation rules or the syntax tree. Typing a closing bracket or keyword can trigger re-indentation of that line. Pasting adjusts indentation of the inserted block to the destination. Each rule produces ordinary edits inside the same transaction, so undo removes them together. It is hard because the rules are language-specific, heuristics disagree with formatters, and wrong guesses are annoying precisely because they occur while typing.",
    k: ["Rule-based indent from patterns vs. from the syntax tree: patterns are simple and work with broken code, while trees are accurate on valid code.", "Reindent on type vs. rely on a formatter at save: on-type is immediate but guesses, while a formatter is consistent but delayed."],
    p: ["Reindenting a pasted block using the first line's indentation shifts the rest wrongly.", "Rules that fire on every keystroke interfere with an input method composing text."],
    v: "Type a nested block with braces and a multi-line comment, press enter after each line, then paste an indented snippet. Indentation matches the language's style, and one undo reverts each automatic change with its keystroke.",
    dep: ["language-configuration","edit-transactions","incremental-parser"]
  },
  "bracket-pairing": {
    s: "Highlights the matching bracket for the one at the cursor, colors nesting levels, and automatically closes or surrounds with pairs as the user types.",
    d: "Matching uses the syntax tree or a scan from the cursor that skips strings and comments. Auto-closing inserts the closing character and types over it when the user types it. Surround wraps the selection. Colorization assigns colors by depth. Language configuration says which pairs apply and where. It is hard because matching must ignore brackets in strings and comments, must not scan the whole file on each keystroke, and has to handle unbalanced code gracefully while the user is typing.",
    k: ["Tree-based matching vs. text scan: trees are accurate and fast with a current parse, while scans work without one but cost time on large spans.", "Auto-close eagerly vs. only before whitespace: eager closing saves keystrokes, but surprises when typing before existing text."],
    p: ["Typing over an auto-inserted closer works only until the cursor moves, then a duplicate closer remains.", "Scanning to find a match in a file with an unclosed bracket traverses the entire file on every move."],
    v: "Type an opening bracket, a string containing a bracket, and a closing bracket. The correct pair highlights, brackets inside the string are ignored, and typing the closer overtypes the auto-inserted one.",
    dep: ["language-configuration","incremental-parser","cursors"]
  },
  "clipboard-and-paste": {
    s: "Moves text between the editor and the system clipboard, including multi-cursor copies, line-wise copies, rich formats and handling of large or odd pasted content.",
    d: "Copy puts plain text, and often a formatted version with colors, on the system clipboard along with metadata such as whether it was a whole-line copy or came from multiple cursors. Paste reads that metadata to distribute text among cursors, adjusts indentation, and normalizes line endings and encodings. Large pastes must not freeze the interface. It is hard because clipboard access is asynchronous on some platforms, may be subject to permissions, and the content is untrusted text from elsewhere.",
    k: ["Store extra metadata beside the text vs. plain text only: metadata enables smart paste behavior, but is lost when pasting from or to other programs.", "Normalize pasted line endings vs. keep as is: normalizing keeps files consistent, while keeping preserves exact content for special files."],
    p: ["Pasting text with hidden or direction-control characters inserts invisible changes into code.", "A multi-megabyte paste runs auto-indent and bracket logic per line and freezes the editor."],
    v: "Copy three lines with three cursors and paste into three cursors, then into one. Content distributes correctly in the first case and pastes all lines in the second. A ten-megabyte paste completes without freezing input.",
    dep: ["multi-selection","line-ending-policy","edit-transactions"]
  },
  "decorations-and-markers": {
    s: "Visual annotations attached to ranges of text, such as highlights, underlines, gutter icons and inline hints, with styles supplied by the editor and by extensions.",
    d: "A decoration is a range tracked by an anchor plus a style or a widget: a background color, a squiggle, a gutter glyph, text inserted visually at a point, or a line-level change. Owners add and remove sets of decorations by identifier. The editor stores them in an interval structure, queries those intersecting the viewport, and passes them to layout and rendering. It is hard because inline widgets alter layout widths and heights, and many decorations must not slow down edits.",
    k: ["Decorations as ranges in an interval tree vs. per-line lists: a tree handles many ranges and edits efficiently, while per-line lists are simpler for few.", "Inline widgets affecting layout vs. overlay only: layout-affecting widgets look native, but break the assumption that text positions equal visual positions."],
    p: ["A provider that replaces thousands of decorations on every keystroke makes typing laggy.", "Inline hints that change line width cause wrapping and cursor positions to jump."],
    v: "Add ten thousand decorations from a test provider to a large file and type continuously. Latency stays within budget, and decorations stay attached to the correct tokens after edits above them.",
    dep: ["anchors-and-markers","line-height-map"]
  },
  "edit-event-bus": {
    s: "Delivers change notifications from the buffer to every listener, such as highlighter, language client, minimap and extensions, in a defined order and with batching.",
    d: "After a transaction commits, the buffer publishes one event with the new version and the list of changes. Listeners register with priorities: internal consumers such as layout and markers run first so that later listeners see a consistent state. Extension listeners are delivered asynchronously across the process boundary, often batched. It is hard because a listener that edits the buffer while handling an event can re-enter, and a slow listener can delay the event for everyone.",
    k: ["Synchronous internal listeners vs. asynchronous: synchronous delivery keeps derived state consistent at once, while asynchronous delivery protects the typing path from slow listeners.", "Batch events by frame vs. one per edit: batching cuts overhead, but listeners see multiple changes together and must apply them in order."],
    p: ["A listener that edits text inside the callback re-enters the bus and corrupts state for later listeners.", "Dropped events to a remote listener leave its mirror stale without any version check."],
    v: "Register a test listener that records versions while a script types and undoes. Versions arrive in strictly increasing order with no gaps, and an extension listener's final mirror equals the buffer.",
    dep: ["change-deltas","extension-host"]
  },
  "find-in-buffer": {
    s: "Searches the current buffer incrementally as the user types, highlighting all matches, counting them, and supporting case, whole-word, regex and selection-only options.",
    d: "As the query changes, a search runs over a snapshot, starting near the viewport so the first match shows quickly, then continues in the background for the match count and scroll markers. Options change the matcher: literal, case-folded, whole-word or regex. Matches are shown as decorations and navigated with next and previous commands that wrap around. It is hard on very large files and with multi-line regular expressions, and because the buffer may change while the search is running.",
    k: ["Incremental search per keystroke vs. on enter: incremental gives instant feedback, but wastes work on partial queries.", "Search the viewport first vs. from the file start: viewport-first shows results at once, but the total count arrives later."],
    p: ["Counting matches over a huge file on each keystroke freezes the interface.", "A multi-line pattern must cross line boundaries, and a line-by-line matcher silently misses those matches."],
    v: "Search a one-hundred-megabyte file for a common word. The first match highlights within one hundred milliseconds, typing continues smoothly, and the final count equals a command-line search.",
    dep: ["regex-engine","buffer-snapshots","decorations-and-markers","background-workers"]
  },
  "regex-engine": {
    s: "The pattern matcher used by search, grammars and replace, with defined syntax, Unicode awareness, and protection against patterns that take exponential time.",
    d: "Two families exist: backtracking engines support rich features such as lookaround and backreferences but can take exponential time on some patterns, while automaton-based engines guarantee linear time but omit those features. The editor picks one, translates between its syntax and the user's expectations, and handles Unicode case folding and line terminators. Long-running matches need a time limit or cancellation. It is hard because user-written patterns are untrusted input, and behavior must match the user's expectations in each context.",
    k: ["Backtracking engine vs. linear-time engine: backtracking has the full feature set users expect, while linear-time engines are safe from pathological patterns but reject some syntax.", "Match line by line vs. across the whole buffer: per line is fast and simple, while whole-buffer matching supports multi-line patterns at higher cost."],
    p: ["A pattern with nested repetition hangs the editor on input that nearly matches.", "Different syntax between the search box and grammar files confuses users who copy patterns."],
    v: "Run a known pathological pattern against a long near-miss string. The search is cancelled or completes in bounded time, the interface stays responsive, and valid patterns match the same as a reference engine.",
    dep: ["text-buffer-interface"]
  },
  "replace-and-preview": {
    s: "Replaces matches in the buffer or across files, expanding captured groups and case rules, and shows a diff-style preview that the user can accept per match.",
    d: "Replacement templates reference capture groups and may change case. In one buffer, a replace-all is a single transaction, so one undo reverts it. Across files, the editor builds a set of edits per file, shows them in a preview where each can be unchecked, and applies them as a workspace edit that is undoable. Files not open are edited on disk or loaded into hidden buffers. It is hard because the set must be applied atomically, files may have changed since the search, and encoding must be preserved.",
    k: ["Preview before applying vs. apply and rely on undo: preview prevents bad bulk changes, but costs a step on every use.", "Edit closed files on disk vs. open as buffers: disk edits are lighter, while buffers give undo and consistent encoding handling."],
    p: ["A replace across files after the files changed on disk applies edits at stale offsets and corrupts text.", "Unescaped special characters in the replacement text insert group references the user did not intend."],
    v: "Run a regex rename across forty files, uncheck three matches in the preview, apply, and check the diff. Only checked matches changed, encodings and line endings are intact, and a single undo reverts everything.",
    dep: ["multi-file-search","regex-engine","edit-transactions","atomic-save"]
  },
  "multi-file-search": {
    s: "Searches text across all files in the workspace, honoring ignore rules, binary detection and include and exclude globs, streaming results as they are found.",
    d: "A search coordinator walks the file tree in parallel, skips ignored directories, binary files and large files, and runs a fast matcher over file contents, preferring a dedicated search tool or process. Results stream to a results view grouped by file. Open unsaved buffers take precedence over disk contents. Remote workspaces run the search where the files are. It is hard because it must be fast on huge trees, cancelable, and consistent with what the user is editing.",
    k: ["Search on demand vs. maintain a persistent text index: on-demand search needs no index upkeep, but scales linearly with the tree, while an index is fast and costs space and maintenance.", "Respect ignore files by default vs. search everything: ignoring cuts noise and time, but hides matches users expect to see."],
    p: ["Ignoring unsaved buffer contents shows results that do not match what is on screen.", "Searching a folder of build output or dependencies floods results and takes minutes."],
    v: "Search a repository of a hundred thousand files for a rare string. Results begin streaming within a second, finish in a few seconds, skip ignored folders, and include a match that exists only in an unsaved buffer.",
    dep: ["regex-engine","file-watching","background-workers","workspace-model"]
  },
  "file-name-index": {
    s: "A list of workspace file names kept up to date, which powers quick open with fuzzy matching ranked by path similarity, recency and name boundaries.",
    d: "The index is built by walking the workspace and updated through file watching. Quick open scores each candidate against the typed characters, favoring consecutive matches, matches at path separators and word starts, and files opened recently. For large trees the scoring runs incrementally or in a worker. The ranking can include open editors, and results can jump to a line suffix. It is hard because of the number of files, the quality of the ranking, and keeping the index correct when files move.",
    k: ["Fuzzy subsequence matching vs. substring: fuzzy finds files from a few initials, but returns noisy results that need good ranking.", "Index everything vs. respect ignore rules: indexing all is exact, but ranks build outputs and vendored files into results."],
    p: ["A stale index after a branch switch lists files that no longer exist.", "Scoring all files on each keystroke in a huge tree lags behind typing."],
    v: "In a repository of a hundred thousand files, type three initials of a deeply nested file name. It ranks first within fifty milliseconds, and after renaming the file on disk the index reflects the change.",
    dep: ["file-watching","workspace-model","background-workers"]
  },
  "symbol-index": {
    s: "A searchable list of the symbols in the current file and across the workspace, from the language server or syntax queries, used for outline views and go-to-symbol.",
    d: "Symbols such as functions, classes and variables are collected per file from a language server or from tree queries, with names, kinds and ranges, and arranged hierarchically for the outline view. Workspace-wide symbol search queries the server or a local index. The outline follows the cursor and updates as the document changes. It is hard because accuracy depends on the language server's state, results arrive asynchronously, and the index must stay consistent with edits.",
    k: ["Symbols from the language server vs. from syntax queries: the server is semantically accurate, but slow to start, while syntax queries are instant and approximate.", "Index the whole workspace vs. open files only: whole-workspace gives global lookup, but costs startup time and memory."],
    p: ["Outline ranges that lag behind edits make jumping land on the wrong line.", "Querying the server on each keystroke of a workspace symbol search floods it with requests."],
    v: "Open a file with nested classes and functions. The outline shows the hierarchy correctly, editing a function name updates it within a second, and the workspace search finds a symbol in an unopened file.",
    dep: ["language-client","syntax-tree-queries"]
  },
  "navigation-history": {
    s: "Moves to definitions, references, lines and previous locations, and keeps a back and forward stack of places the user has been so they can return.",
    d: "Jump commands ask the language client or search for a target, open the file, reveal and select the location, and push the previous location on a history stack. Back and forward move through it. Entries are anchored so they survive edits, and entries close together are merged. Peek views show a target inline without leaving. It is hard because jumps cross files, preview tabs and remote workspaces, and what counts as a significant movement worth recording is a judgment call.",
    k: ["Record every cursor movement vs. only jumps: recording everything is complete but floods the stack, while jumps only match user intent more closely.", "Open targets in a preview tab vs. a permanent tab: preview avoids clutter from browsing, but users lose context when the tab is replaced."],
    p: ["History entries stored as line numbers point to the wrong place after edits.", "Merging entries too aggressively makes back skip places the user wanted to revisit."],
    v: "Go to a definition in another file, then to its definition, then press back twice. Each press returns to the exact earlier cursor position, even after inserting lines above it in between.",
    dep: ["anchors-and-markers","language-client","workspace-model"]
  },
  "command-registry": {
    s: "A single table of named, invokable actions with identifiers, titles, arguments and enablement conditions, shared by menus, keys, the palette and extensions.",
    d: "Every user-visible action, from moving a cursor to opening a panel, registers as a command with an identifier, a handler, a title and optional argument schema. Keybindings, menu entries, toolbar buttons, context menus and scripts refer to commands by identifier rather than calling code. Extensions register their own and call built-in ones. Commands run in a context and report completion. It is hard because the registry becomes the editor's public contract, so identifiers and arguments must stay stable once others use them.",
    k: ["Everything is a command vs. direct function calls for internals: uniform commands make keys and scripting trivial, but force an indirection and a stable name on each action.", "Commands with typed arguments vs. string-only: typed arguments allow keybindings with parameters and validation, but need a schema to maintain."],
    p: ["Renaming a command identifier silently breaks user keybindings and extension code that referred to it.", "A command that runs for seconds blocks the interface if it executes on the main thread."],
    v: "List all registered commands, invoke ten of them by identifier from a script with arguments, and confirm each performs the same action as its menu item and key.",
    dep: ["extension-api"]
  },
  "command-palette": {
    s: "A searchable list of every command, with their keys, opened by one shortcut and filtered by fuzzy matching, so features can be used without remembering a key.",
    d: "The palette lists commands that are enabled in the current context, matches the typed text against titles with a fuzzy scorer, ranks recently used commands higher, and shows each command's keybinding to teach it. The same interface mode supports file open, symbol and line jump through prefixes, and extension-defined pickers. Selecting runs the command, possibly asking further questions. It is hard because quality of matching and ranking decides whether people trust it, and the list changes with context.",
    k: ["Show only enabled commands vs. all: filtering reduces clutter, but hides commands whose absence is confusing without explanation.", "Rank by recent use vs. by match score only: recency speeds repeated tasks, but makes results change unpredictably."],
    p: ["Command titles that differ from the words users search for make features undiscoverable.", "A picker that blocks on a slow data source freezes the palette."],
    v: "Open the palette, type three letters of a command, and see it ranked first with its keybinding. Run a command that is disabled in the current context and confirm it does not appear.",
    dep: ["command-registry","keybinding-resolver","context-conditions"]
  },
  "keybinding-resolver": {
    s: "Maps a key press to a command by looking up bindings in order of precedence, so user, extension and default bindings can override each other predictably.",
    d: "Bindings pair a key combination with a command, arguments and a context condition. When a key arrives, the resolver collects bindings for it, filters by whether the condition holds, and picks the highest-precedence match: user overrides before extensions before defaults, later before earlier. Keys are normalized across keyboard layouts and platforms. It is hard because physical versus layout-dependent keys differ per language, and conflicts between bindings must be visible to the user.",
    k: ["Match by produced character vs. physical key position: characters follow the layout's labels, while positions keep the same finger layout on every language.", "Last binding wins vs. explicit priority: last-wins is simple to reason about, while priorities resolve extension conflicts but add concepts."],
    p: ["Shortcuts that assume a US layout are unreachable on keyboards where those characters need a modifier.", "Two extensions binding the same key produce behavior that depends on load order."],
    v: "Bind one key twice with different contexts and overrides, then press it in each context. The expected command runs each time, and the shortcut editor lists conflicts. Repeat on a non-US layout.",
    dep: ["command-registry","context-conditions"]
  },
  "context-conditions": {
    s: "Boolean expressions over editor state, such as focus, selection, language or mode, that decide whether a key binding, menu item or command applies right now.",
    d: "The editor maintains a set of named context values: which pane has focus, whether text is selected, the active language, whether a completion list is open, the current mode. A condition language combines them with and, or, not and comparison, and bindings and menu entries carry such expressions. The registry re-evaluates conditions when the relevant keys change. It is hard because contexts proliferate as extensions add their own, and a missed update leaves a command enabled when it should not be.",
    k: ["Expression language vs. code predicates: expressions are declarative and can be shipped in data files, but cannot express arbitrary logic.", "Evaluate on demand vs. cache and invalidate: on-demand is always correct, while caching is faster for menus but risks stale results."],
    p: ["A context key not reset when a panel closes keeps stale bindings active.", "Typos in condition names evaluate to false silently, so the binding never fires."],
    v: "Define a binding conditioned on a completion list being open and not on a read-only editor. It fires only in that state, and stops firing immediately when the list closes or the editor becomes read-only.",
    dep: ["command-registry"]
  },
  "chords-and-modal-editing": {
    s: "Supports key sequences and distinct modes where the same key means different things, from two-key chords to full modal editing with motions, operators and counts.",
    d: "A chord is a sequence such as one shortcut followed by another, so the resolver keeps a pending prefix and waits for the next key or a timeout. Modal editing generalizes this: modes such as normal, insert and visual each have their own bindings, and commands compose from operators, motions and counts. It can be built in, or provided by an extension on the same keybinding and text input path. It is hard because mode interacts with input methods, multiple cursors, undo grouping and every extension that handles typing.",
    k: ["Built-in modal engine vs. extension-provided: built-in gives tight integration and performance, while an extension keeps the core simple and the modal design changeable.", "Show pending keys vs. hide: showing helps learning, but adds interface that most users do not need."],
    p: ["A chord prefix that swallows keys when the second never comes leaves the user thinking the editor is frozen.", "Insert-mode typing grouped as many undo steps because the mode logic bypasses transactions."],
    v: "Enter a mode, type a counted operator and motion such as delete three words, and undo it. The right text is removed in one step, and a chord with a timeout falls back to the single key when the second does not come.",
    dep: ["keybinding-resolver","edit-transactions","text-input-methods"]
  },
  "text-input-methods": {
    s: "Receives typed text from the platform's input method system, including composition for languages needing several keystrokes per character, dead keys and voice input.",
    d: "Keyboard events are not enough for text. Many languages use an input method that shows a temporary composition string with candidates, which commits as final text only when selected. The editor must expose a position for the candidate window, display the uncommitted composition inline, and avoid reacting to partial text with auto-indent or completion. Dead keys and emoji pickers use the same path. It is hard because custom-drawn editors must implement this interface themselves and platform behavior differs.",
    k: ["Use a hidden native input element vs. implement the platform interface directly: a hidden element inherits correct behavior, but adds a synchronization problem between it and the editor.", "Apply composition into the buffer vs. keep it separate: separate composition avoids polluting undo, while in-buffer composition is simpler to render."],
    p: ["Treating each partial composition as a typed key inserts raw letters and ruins the final text.", "The candidate window appears at the wrong position because the caret rectangle is not reported."],
    v: "Type with a composing input method: the candidate window opens next to the caret, partial text shows underlined, committing inserts only final characters, and one undo removes the committed word.",
    dep: ["cursors","edit-transactions"]
  },
  "settings-layering": {
    s: "Merges configuration from several layers, such as defaults, user, workspace, folder, language and remote-machine settings, each overriding the previous, with the source of each value visible.",
    d: "Settings are key-value pairs read from default values, a user file, a workspace file shared with the team, folder files, per-language sections and sometimes policy from an administrator. A lookup walks layers from most specific to least and returns the first value, or merges objects. Changes are observed, so editors, extensions and the interface update live. It is hard because layers can disagree, some settings must not be overridable by an untrusted workspace, and users need to see where a value came from.",
    k: ["Deep merge of objects vs. replacement: merging lets layers add keys, while replacement is predictable and avoids unexpected leftovers.", "Workspace may override security-sensitive settings vs. not: allowing it makes projects self-contained, while forbidding it prevents a cloned project from changing how tools run."],
    p: ["A malicious workspace setting that points to an executable runs code when the folder is opened.", "A setting changed in the wrong layer appears to have no effect because a more specific layer overrides it."],
    v: "Set the same option in user, workspace and language layers. The effective value follows precedence, the settings view names the layer it came from, and removing the top layer reveals the next one.",
    dep: ["settings-schema","workspace-trust"]
  },
  "settings-schema": {
    s: "A declaration of every setting's name, type, default, allowed values and description, used to validate files, offer completion and generate the settings interface.",
    d: "Core features and extensions declare their settings in a schema with types, defaults, enumerations, scope (user, workspace, per-language) and documentation. The editor validates the settings files against it, shows errors and offers completions inside them, and renders a searchable form. Defaults come from the schema, so there is one source of truth. It is hard because schemas from many extensions must merge without collisions, and deprecated settings must keep working.",
    k: ["Schema declared with the feature vs. a central file: declaring beside the feature keeps docs in step with code, but spreads configuration across components.", "Strict validation vs. tolerant loading: strict validation catches typos, but tolerant loading keeps old or unknown settings from breaking startup."],
    p: ["A renamed setting without migration silently drops users back to the default.", "Unknown keys from an uninstalled extension produce warnings that never go away."],
    v: "Open the settings file, type a partial key and see completions with descriptions, enter a wrong type and see a validation error, and confirm the form shows the same default as the schema.",
    dep: ["extension-manifest","contribution-points"]
  },
  "snippets-and-macros": {
    s: "Reusable templates with tab stops and placeholders that expand from a trigger, and recorded sequences of commands that can be replayed.",
    d: "A snippet is text with numbered tab stops, placeholders with defaults, variables such as the file name or selection, and transformations. Inserting it creates a temporary mode where tab moves between stops and linked stops edit together as multiple cursors. A macro records commands and arguments from the registry and replays them any number of times. It is hard because snippets must work inside multiple cursors, indentation and undo, and macros depend on state at the time of replay.",
    k: ["Snippets expanded as multi-cursor edits vs. a custom placeholder engine: reusing cursors gives mirrored stops cheaply, but the selection model must tolerate temporary overlapping.", "Macros as command lists vs. raw key replay: command lists are reliable across layouts, while raw keys are simpler but break when bindings change."],
    p: ["Leaving snippet mode on unrelated cursor movement keeps tab stops hijacking the tab key.", "A macro recorded in one context fails silently in another where a command is disabled."],
    v: "Expand a snippet with three linked stops, type in the first and see the others mirror, tab through to the final stop, then undo. The whole expansion is removed in as few steps as expected.",
    dep: ["multi-selection","command-registry","edit-transactions"]
  },
  "theme-system": {
    s: "Maps semantic token names and interface elements to colors and font styles, so syntax and the interface can be restyled by swapping a theme.",
    d: "A theme assigns colors to scopes such as keyword, string and comment, and to interface parts such as background, selection and gutter. Syntax producers emit scopes, and the theme resolves each to a style by most specific match. Theme files can inherit and are supplied by extensions. Light, dark and high-contrast variants may switch with the system. It is hard because scope names are a contract across grammars, language servers and themes, and a missing mapping leaves tokens plain.",
    k: ["Scope-based theming vs. fixed token categories: scopes allow fine control, but make themes large and uneven in coverage.", "Themes can change fonts and sizes vs. colors only: allowing fonts gives designers freedom, but breaks the monospace assumptions of layout."],
    p: ["Poor contrast between selection and text color makes selected code unreadable in some themes.", "Tokens from a new language server scope are uncolored because no theme maps them."],
    v: "Switch between light, dark and high-contrast themes while a file is open. Every visible element changes with no unstyled flash, and contrast between text and background meets the stated ratio.",
    dep: ["semantic-tokens","grammar-tokenizer","extension-manifest"]
  }
});
