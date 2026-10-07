// Details for the text editor plate, part 1: buffer and text model, files, encoding and resilience.
ATLAS.details("text-editor", {
  "text-buffer-interface": {
    s: "The narrow API every other component uses to read and edit text, hiding which data structure sits underneath so the structure can change without touching callers.",
    d: "Callers ask for a range of text, a line, a length, or apply an edit given as a range and a replacement. Behind it sits a piece table, rope, gap buffer or a hybrid. The interface also owns the version counter, emits change events and hands out snapshots. It is hard because the contract must be cheap for the common case, one keystroke at a cursor, while still supporting bulk replacement of a whole file and many simultaneous edits applied in one pass.",
    k: ["Edits as range plus replacement text vs. insert and delete primitives: one shape covers every change and maps to protocol messages, but callers must compute ranges correctly.", "Mutable buffer with snapshots vs. fully persistent buffer: mutation is faster and simpler, while persistence makes background readers trivial at a memory cost."],
    p: ["Callers that cache offsets across an edit read the wrong text, because the interface only guarantees positions for the version they were computed against.", "Leaking the underlying structure through convenience methods locks the editor to one implementation."],
    v: "Apply a scripted sequence of ten thousand random edits to the buffer and to a plain string kept in a test harness, then compare full text, every line and every length after each step. They match exactly.",
    dep: ["piece-table","line-index"]
  },
  "gap-buffer": {
    s: "A flat array with an unused gap kept at the cursor, so typing at the cursor is an append into the gap and moving the cursor moves the gap.",
    d: "Text lives in one contiguous array with a hole of free space. Inserting at the gap's position writes into the hole in constant time. Editing elsewhere first moves the gap by copying the text between the old and new position. Reading is trivial because the text is almost contiguous. It is simple and fast for one cursor and sequential edits. It degrades with multiple distant cursors, where each edit moves the gap far, and offers no cheap snapshots.",
    k: ["Gap buffer vs. piece table: far less code and perfect locality for typing, but distant edits cost a copy proportional to the distance and old versions cannot be kept.", "Large gap vs. small gap: growing the gap in big steps amortizes reallocation, but wastes memory on every open file."],
    p: ["Replace-all or many multi-cursor edits move the gap across the file for every edit and turn a linear task into a quadratic one.", "Handing out a pointer into the array lets a later gap move invalidate it."],
    v: "Type one thousand characters at the end of a ten-megabyte buffer, then jump to the start and type another thousand. Measure that only the first jump copies bytes and the typing itself shows no copying.",
    dep: ["text-buffer-interface"]
  },
  "piece-table": {
    s: "Represents the document as a list of spans pointing into the original file and an append-only add buffer, so edits only change the list and never move text.",
    d: "The original file contents stay immutable, and every inserted character is appended to a second buffer. The document is an ordered sequence of pieces, each naming a buffer, an offset and a length. An insert splits a piece and adds one; a delete trims or removes pieces. Lookup by offset needs a balanced tree over the pieces. Undo is cheap because earlier piece lists remain valid. The difficulty is fragmentation after many edits and keeping per-piece line counts current for line lookup.",
    k: ["Piece table vs. gap buffer: edits anywhere cost the same and old states are kept for free, but reads walk pieces and the structure fragments.", "Balanced tree of pieces vs. flat list: logarithmic lookup stays fast on heavily edited files, while a flat list is simpler and faster until a few thousand pieces.", "Per-piece line-break counts vs. a separate line index: counts keep line lookup in the same tree, but every split must recompute them."],
    p: ["Pieces never merge, so a long session of single-character edits leaves a tree of millions of tiny nodes and slow reads.", "The append-only buffer grows without bound unless compaction runs when no snapshot references it."],
    v: "Open a one-hundred-megabyte file, apply fifty thousand scattered edits, and confirm that edit time stays flat, that memory grows by roughly the typed text, and that reading the final text equals the expected result.",
    dep: ["text-buffer-interface","line-index"]
  },
  "rope": {
    s: "A balanced tree whose leaves hold chunks of text and whose nodes cache lengths and line counts, giving logarithmic edits, lookup and cheap copies.",
    d: "Each leaf stores a bounded chunk of text, and each internal node stores the total length, line breaks and sometimes UTF-16 length of its subtree. Finding an offset, a line or a column descends the tree using those cached sums. Insert and delete split and rebuild nodes along one path, and subtrees can be shared between versions, which makes snapshots nearly free. It handles huge files and many cursors well, but has more overhead per character and more complex code than a flat array.",
    k: ["Rope vs. piece table: uniform logarithmic cost for every operation and structural sharing, but the original file must be copied into leaves rather than mapped untouched.", "Large vs. small leaf chunks: big leaves cut tree overhead and speed scans, while small leaves make edits cheaper and copies finer-grained."],
    p: ["Leaf boundaries that split a multi-unit character or a carriage-return and line-feed pair create bugs that appear only on certain files.", "Repeated deletes leave many underfull leaves; without rebalancing the tree gets deep and slow."],
    v: "Insert text at one thousand random offsets in a file of five hundred megabytes, take a snapshot before and after, and confirm each edit is under a millisecond and the snapshot reads the old text unchanged.",
    dep: ["text-buffer-interface","line-index"]
  },
  "line-index": {
    s: "A structure mapping line numbers to text offsets and back, kept current as the buffer changes, so any line can be found without scanning the file.",
    d: "A flat array of line start offsets works for small files but must shift every later entry on each edit. Larger editors store line break counts in the buffer tree, or keep a chunked array that updates lazily. Lookup of line N or of the line containing an offset takes logarithmic time. The index must treat all line ending forms consistently, including a lone carriage return, a pair, and Unicode separators. It is hard because every keystroke changes it and wrapped display lines must be derived from it.",
    k: ["Offset array vs. counts in the tree: the array is trivial and fast for small files, while tree counts update locally and scale to millions of lines.", "Eager vs. lazy index building on open: eager gives instant jumps but delays showing a large file, while lazy opens quickly and risks wrong line numbers until finished."],
    p: ["Splitting on line feed only, then meeting files with lone carriage returns, shows one line where the user sees several.", "An index not updated in the same step as the edit lets a listener read lines that do not exist yet."],
    v: "Open a file mixing all line ending styles, then compare the editor's line count and the text of each line with an independent splitter. Edit across a line break and confirm both agree again.",
    dep: ["text-buffer-interface"]
  },
  "position-mapping": {
    s: "Conversion between the different ways of naming a place in text: byte offset, code unit, code point, line and column, and visual column after tabs and wide characters.",
    d: "A cursor is stored as an offset or as line and column, while protocols count in UTF-16 units or bytes, and users see columns affected by tabs and double-width characters. The editor needs fast, exact conversions between all of them in both directions. Conversion uses the line index plus a scan of one line, with caches for long lines. It is hard because the systems disagree, and a mismatch is silent: the cursor ends up one character off only for lines with certain content.",
    k: ["Store positions as offsets vs. line and column: offsets survive line changes and are cheap to compare, while line and column match what users and tools report.", "Convert at the boundary vs. everywhere internally: one internal unit prevents mixing mistakes, but each protocol edge pays for conversion."],
    p: ["Sending a UTF-16 column to a tool that counts bytes places every diagnostic wrong on lines containing accents or emoji.", "Scanning a very long line on each conversion makes cursor movement in minified files crawl."],
    v: "Take a test file with accented letters, emoji, tabs and CJK characters. For every position, convert offset to line and column and back, and to each external unit and back. All round trips return the starting place.",
    dep: ["line-index","grapheme-and-width"]
  },
  "anchors-and-markers": {
    s: "Positions or ranges that follow the text as it changes, used for cursors, breakpoints, diagnostics, bookmarks and decorations so they stay attached to the right code.",
    d: "A marker stores an offset and a stickiness rule: when text is inserted exactly at the marker, it moves right or stays left. Each edit adjusts all markers after the edit point. Many markers are kept in an interval tree so adjustment and range queries stay logarithmic. Deleting the text around a marker collapses or removes it. The difficulty is volume, since a large file can carry tens of thousands of diagnostics and decorations, and each edit must update them without scanning them all.",
    k: ["Eager adjustment on every edit vs. lazy adjustment from the change log: eager keeps queries simple, while lazy makes edits cheaper when markers are numerous.", "Collapse vs. delete a marker when its text is removed: collapsing keeps a breakpoint near its place, while deleting avoids pointing at unrelated code."],
    p: ["Wrong stickiness makes a selection grow when the user types at its edge, or a decoration swallow typed text.", "Markers from asynchronous results, such as diagnostics computed on an older version, land on the wrong code if not mapped through intervening edits."],
    v: "Place markers on a function, insert text before, inside and after it, delete part of it, and undo. After each step, check marker positions against expected offsets, including the sticky edge cases.",
    dep: ["text-buffer-interface","change-deltas"]
  },
  "buffer-snapshots": {
    s: "A frozen, consistent view of the text at one version that background tasks can read while the user keeps typing, without locks or copies of the whole file.",
    d: "Search, parsing, saving and language analysis all need stable text for longer than a keystroke. A persistent structure such as a rope or piece table gives a snapshot by holding the current root, at no copy cost. A flat structure must copy or use copy-on-write. A snapshot carries its version number so results can be matched to the right text and discarded if stale. The difficulty is memory: a long-held snapshot pins old chunks, and a slow reader can keep gigabytes alive.",
    k: ["Structural sharing vs. copy on demand: sharing makes snapshots instant but keeps the more complex persistent structure, while copying is simple but costs time proportional to file size.", "Reference counting vs. explicit release: counting is safe against forgotten releases, but delays freeing memory held by stuck readers."],
    p: ["A save running on a snapshot while a later edit is accepted can mark the buffer clean though it holds unsaved changes.", "Snapshots taken for every keystroke by a chatty listener pin old versions and inflate memory."],
    v: "Start a background save of a large file, keep typing during it, and confirm the saved file equals the text at the moment of the save and the buffer is still marked modified afterward.",
    dep: ["text-buffer-interface","piece-table","rope"]
  },
  "change-deltas": {
    s: "A precise description of each edit, as ranges removed and text inserted with the new version, sent to everything that mirrors or derives from the buffer.",
    d: "After an edit the buffer emits a list of changes: the old range, the new text, and both positions in every unit consumers need. Parsers use it to reuse their trees, the language client forwards it so the server's copy stays equal, and layout uses it to invalidate only affected lines. Multiple edits in one transaction are ordered so that each position is valid after the previous one is applied, or all are given against the original text. Mixing the two conventions is a classic source of corrupted state.",
    k: ["Incremental deltas vs. full text resend: deltas are small and enable incremental work, but any lost or reordered delta desynchronizes the mirror for good.", "Deltas against original text vs. sequential application: original-relative deltas are easier to reason about for multi-cursor edits, while sequential ones are simpler to apply."],
    p: ["A consumer that applies a batch of changes in the wrong order ends up with text that differs from the buffer, with no error.", "Dropping a delta while a consumer is busy leaves it permanently out of sync unless a version check forces a resync."],
    v: "Attach a mirror that applies only the emitted deltas to its own copy. After a long scripted session with multi-cursor edits, undo and redo, the mirror's text equals the buffer's text byte for byte.",
    dep: ["text-buffer-interface","position-mapping"]
  },
  "file-loading": {
    s: "Reads a file from disk into the buffer: detecting its encoding and line endings, decoding, building the line index, and showing something quickly.",
    d: "Loading reads bytes, checks for a byte order mark, guesses the encoding, decodes into the buffer's internal form and records the original line ending style so it can be written back. For big files it streams in chunks on a worker and lets the user see the first screen before the end arrives. It can also memory-map the file as the original of a piece table. The difficulty is doing all of this without freezing the interface and without silently changing bytes the user did not edit.",
    k: ["Decode everything up front vs. stream and show early: up-front loading is simple and gives exact line counts, while streaming shows content sooner but complicates every feature that needs the full text.", "Memory-map the file vs. copy it: mapping is instant and cheap in memory, but another program changing the file can alter text under the editor."],
    p: ["A file with invalid byte sequences, decoded leniently and saved back, has those bytes replaced and is permanently corrupted.", "Loading on the interface thread makes opening a network file freeze the whole window."],
    v: "Open a one-gigabyte file and confirm the first screen appears in under a second, the window stays responsive during loading, and saving without edits produces a file identical byte for byte.",
    dep: ["encoding-detection","line-ending-policy","text-buffer-interface","background-workers"]
  },
  "encoding-detection": {
    s: "Decides how to turn a file's bytes into text and back, using byte order marks, declared settings and statistical guessing, and remembers the choice per file.",
    d: "Order of evidence: a byte order mark, then a per-file or project setting, then validity checks for UTF-8, then heuristics for legacy single-byte and multi-byte encodings. The chosen encoding is stored with the buffer and used on save. The user can reopen the file with a different encoding. Detection is hard because short files are ambiguous and legacy encodings overlap, so any guess can be wrong, and saving in the wrong one changes the file.",
    k: ["Default to UTF-8 and fail loudly vs. guess aggressively: strict handling avoids silent corruption, but legacy files then open as garbage until the user chooses an encoding.", "Preserve a byte order mark vs. strip it: preserving leaves files as authored, while stripping avoids surprising tools that dislike it."],
    p: ["Round-tripping a file through a wrong guess replaces characters that cannot be mapped, losing data on the next save.", "A byte order mark silently removed on save breaks a tool that relied on it to identify the file."],
    v: "Open fixtures in UTF-8, UTF-8 with mark, UTF-16 both orders and a legacy encoding. Each displays correctly, and saving unchanged writes identical bytes, mark included.",
    dep: ["text-buffer-interface"]
  },
  "line-ending-policy": {
    s: "Rules for handling line feed, carriage return and the pair: what the buffer stores, what the user sees, and what gets written back on save.",
    d: "Most editors normalize internally to one line break and remember each file's original style, or the dominant style if mixed. New lines typed by the user use the file's style. A status indicator and command let the user convert. Mixed files are either preserved line by line or normalized, depending on policy. The hard part is fidelity: the editor must write back exactly what was loaded except where the user edited, and still keep the line index consistent for every form.",
    k: ["Normalize internally vs. store raw: normalizing makes every algorithm simpler, while storing raw preserves mixed files exactly but forces each feature to understand all forms.", "Preserve vs. normalize on save: preserving avoids noisy diffs in version control, while normalizing cleans up files at the price of whole-file changes."],
    p: ["Normalizing a mixed file on save changes every line in a diff and hides the real change from reviewers.", "Pasting text with a different line ending style into a file silently creates a mixed file."],
    v: "Open files with each style and a mixed one, edit one line, and save. A byte comparison shows only that line changed, and new lines typed use the file's dominant style.",
    dep: ["line-index"]
  },
  "large-file-mode": {
    s: "A degraded but responsive way of opening files too big for normal handling, by turning off expensive features and loading or indexing only what is needed.",
    d: "Above a size or line-length threshold the editor disables wrapping, highlighting, folding, bracket matching and language features, uses streaming load, and may show a read-only paged view. Very long single lines, as in minified code, are handled by limiting tokenization and layout to a window. The threshold is a policy choice and is announced to the user. The difficulty is that each feature assumes cheap access to whole lines and total counts, so each needs its own fallback.",
    k: ["Automatic degradation vs. user opt-in: automatic mode prevents hangs without being asked, but may disable a feature the user expected.", "Paged read-only view vs. full editing: paging handles files larger than memory, while editing needs the whole structure and bounds the supported size."],
    p: ["A file with a few huge lines passes a size check yet hangs layout, because the limit counted bytes but not line length.", "Features disabled without any visible sign look like bugs and prompt reports."],
    v: "Open a two-gigabyte log and a five-megabyte single-line minified file. Both show the first screen in under a second, scroll without stalls, and display a notice listing the features turned off.",
    dep: ["file-loading","line-index","viewport-virtualization"]
  },
  "atomic-save": {
    s: "Writes a file so that a crash or full disk at any point leaves either the old or the new contents intact, preserving permissions, links and ownership.",
    d: "The usual method writes the new contents to a temporary file in the same directory, flushes it to stable storage, then renames it over the original. It then restores permissions and attributes. Symbolic links, hard links, network shares and files that are watched by other tools each break this pattern in different ways, so some editors write in place for them. Saving also applies encoding, final newline and trim rules, and must handle disk full, read-only files and locked files.",
    k: ["Write temporary file and rename vs. write in place: rename is crash-safe, but changes the file's identity, breaking hard links and some watchers.", "Flush to disk on every save vs. rely on the system cache: flushing guards against power loss but makes saves noticeably slow on some disks."],
    p: ["A save to a symbolic link replaces the link with a regular file, detaching the editor from the real target.", "A full disk during in-place writing truncates the user's file."],
    v: "Kill the editor at random points during repeated saves of a large file. After each kill, the file on disk is entirely the old version or entirely the new one, never partial.",
    dep: ["encoding-detection","line-ending-policy","buffer-snapshots"]
  },
  "external-change-handling": {
    s: "Detects that a file changed on disk behind the editor's back and reconciles it with the open buffer: reload silently if clean, ask if modified.",
    d: "File watching or a check on window focus compares modification time, size and sometimes a content hash against the state at last load or save. A clean buffer reloads, ideally keeping cursor and scroll position. A modified buffer shows a conflict choice: keep mine, take theirs or compare. Edits made by formatters or code generators trigger this constantly, so the logic must tell its own saves from foreign ones. The difficulty is races, since a save followed by another tool's write can look like one event.",
    k: ["Silent reload of clean buffers vs. always prompting: silent reload keeps work flowing, but can hide that a generator rewrote the file.", "Timestamp comparison vs. content hashing: timestamps are cheap but unreliable on coarse or network file systems, while hashing is exact and costs reading the file."],
    p: ["The editor's own save echoes back as an external change and triggers a needless reload that moves the cursor.", "A conflict dialog that blocks unsaved edits risks users choosing wrongly and discarding hours of work."],
    v: "Modify an open clean file from another program and see it reload with cursor kept. Repeat with unsaved edits in the buffer and see a conflict choice offered, with neither version lost.",
    dep: ["file-watching","buffer-snapshots"]
  },
  "autosave": {
    s: "Saves modified buffers automatically after a delay, on focus loss or on a timer, trading the explicit save step for protection against forgotten work.",
    d: "Several modes exist: save after a pause in typing, on losing focus, on switching files, or never. Writing real files can trigger builds, watchers and formatters, so some editors autosave only to a hidden recovery store instead. Autosave runs through the same atomic save path and respects format-on-save rules. The difficulty is side effects: a half-typed function saved to a file that a compiler or test watcher is monitoring starts work on broken code.",
    k: ["Autosave to the real file vs. to a hidden backup: saving to the file avoids all loss and works with other tools, while the backup avoids triggering them.", "Short delay vs. long delay: short delays minimize loss but churn watchers and disks, long delays lose more on a crash."],
    p: ["Format-on-save combined with autosave rewrites code under the user's cursor in the middle of typing.", "Autosaving files outside the project, such as scratch buffers, creates files in places the user never chose."],
    v: "Enable autosave with a one-second delay, type, and pause. The file on disk matches the buffer within the delay, the cursor does not move, and a watching test runner sees exactly one change.",
    dep: ["atomic-save","crash-recovery"]
  },
  "crash-recovery": {
    s: "Keeps enough information about unsaved work, including untitled buffers, to restore it after a crash, power loss or forced update, so exit and crash look the same.",
    d: "The editor periodically writes unsaved buffer contents and a session description, with open files, layout and cursor positions, to a recovery store, and removes entries on a clean save. On next start it detects leftover entries and restores them, noting the base file's version to catch conflicts. Some editors write a journal of edits instead of full text, so recovery cost stays low for large files. The hard parts are partial writes of the recovery data itself and deciding when stale entries are safe to drop.",
    k: ["Snapshot of full text vs. journal of edits: snapshots are simple and self-contained, while journals write far less for large files but need replay to recover.", "Hot exit, restoring without prompting vs. asking to save on quit: hot exit never interrupts the user, but leaves unsaved changes lingering for days."],
    p: ["A recovery file written by a crashing process is itself truncated, and the editor refuses to start while parsing it.", "Recovered text restored over a file that changed on disk meanwhile gives no sign which side is newer."],
    v: "Type into three buffers, one untitled, kill the process with no warning, and restart. All three buffers return with exact text, cursor positions and modified flags, and the file on disk is untouched.",
    dep: ["buffer-snapshots","atomic-save","workspace-model"]
  },
  "background-workers": {
    s: "Threads or processes that do heavy work off the interface thread: file loading, parsing, searching and indexing, communicating by messages tied to buffer versions.",
    d: "The interface thread handles input and painting and must never block. Workers read snapshots or receive deltas, compute, and post results back tagged with the version they used. The interface discards results whose version is stale. Pools are sized to cores, and tasks have priorities and cancellation so a new keystroke can drop obsolete work. It is hard because shared mutable text is the root of races, which is why snapshots and message passing are used instead of locks.",
    k: ["Threads with shared snapshots vs. separate processes: threads share memory cheaply, while processes isolate crashes and hangs at the cost of copying data.", "Cancel stale work vs. let it finish: cancellation keeps the interface current, but requires every task to check often and clean up."],
    p: ["Applying a result computed for an older version places highlights and diagnostics on the wrong lines.", "A worker pool larger than the cores starves the interface thread and makes typing stutter."],
    v: "Run a full-project search while typing continuously. Keystroke latency stays within its normal range, and cancelling the search stops worker activity within a fraction of a second.",
    dep: ["buffer-snapshots","change-deltas"]
  },
  "startup-budget": {
    s: "An explicit time limit for each phase between launch and a usable window, enforced by lazy loading, deferred work and measurement on every build.",
    d: "Phases include process start, loading core code, restoring the previous session, showing the first window with text, and only later starting extensions and indexes. The editor paints a usable frame before the extension platform loads, snapshots parsed code or settings, and loads large modules on demand. Each phase has a time budget tracked over releases. It is hard because startup cost accumulates from many small additions, none of which looks expensive alone, and extensions can erase every gain.",
    k: ["Lazy loading vs. eager loading: lazy features start fast but pay on first use, while eager loading is predictable but slow to launch.", "Restore full session vs. restore visible files only: full restore resumes exactly, while restoring only visible files starts much faster on big workspaces."],
    p: ["A new feature that reads a file on startup adds only a few milliseconds, then dozens of them add seconds with no single culprit.", "Measuring on a developer's fast machine misses the slow disk and low memory users actually have."],
    v: "Launch cold with a large workspace and ten extensions installed, and record time to a window with typed text accepted. It stays within the stated budget, and a regression check fails the build if it does not.",
    dep: ["background-workers","extension-host","crash-recovery"]
  },
  "diagnostics-and-tracing": {
    s: "Internal logging, timing traces and crash reporting that show where time and failures go, including per-extension cost, so regressions can be found and fixed.",
    d: "The editor records input-to-paint latency, slow operations, memory use and unhandled errors, with a log channel per component. Extensions get their own logs and cost accounting so that a slow one can be named. Crash reports include the version, recent actions and a stack, with user text and paths removed. A profiling command exports a trace for inspection. The difficulty is overhead and privacy: always-on tracing must be nearly free, and reports must never carry the user's code.",
    k: ["Always-on lightweight counters vs. opt-in detailed tracing: counters catch regressions in the field, while detailed traces explain them but cost enough to enable only on request.", "Automatic crash upload vs. ask first: automatic upload finds bugs sooner, but needs strong redaction and consent."],
    p: ["Crash reports that include buffer text or file paths leak private source code.", "Logging each keystroke in detail adds measurable latency to the thing being measured."],
    v: "Install an extension that busy-loops. The slow-operation log names it and its share of time, a trace export loads in a viewer, and a forced crash produces a report containing no document text.",
    dep: ["extension-host","background-workers"]
  }
});
