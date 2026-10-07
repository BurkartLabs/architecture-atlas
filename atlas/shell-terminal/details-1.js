// Details for the shell & terminal plate, part 1: tabs, panes, multiplexing, input and clipboard.
ATLAS.details("shell-terminal", {
  "tabs-and-top-level-windows": {
    s: "The window chrome that holds one or more terminal sessions, each with its own emulator state, pseudo-terminal and shell, and lets the person switch, reorder, title and close them.",
    d: "Each tab owns an emulator instance, a pty and a child process. The window layer routes keyboard focus to the active session, keeps inactive ones draining their output so shells do not block, and updates titles from title-setting escape sequences or the foreground process name. Closing a tab must decide what happens to its processes: hang them up, warn if a foreground job is running, or leave them to a server. It is hard because many sessions share one render loop and one event loop, and a flood from a hidden tab must not starve the visible one.",
    k: ["Emulator per tab inside one process versus one process per window: sharing saves memory and allows cross-tab features, but one crash or hang takes every session down.", "Draining hidden tabs fully versus pausing them: draining keeps shells moving, but burns CPU on output nobody sees; pausing risks stalling long jobs."],
    p: ["Closing a window sends a hangup to the foreground job and silently kills a long build the person thought was safe.", "A hidden tab printing megabytes per second starves input handling for the focused tab because all sessions share one loop."],
    v: "Open three tabs, run a command printing continuously in a background tab, and confirm typing in the focused tab still echoes within a frame while the busy tab's output is still consumed.",
    dep: ["pty-pair", "cell-grid"]
  },
  "split-layout": {
    s: "Divides a window into resizable rectangular panes, each hosting an independent session, with a layout tree, focus navigation and per-pane size reported to its program.",
    d: "Panes form a tree of horizontal and vertical splits with fractional or cell-quantized sizes. Resizing a divider recomputes every descendant rectangle, rounds to whole cells, and notifies each affected pty of its new rows and columns. Focus moves by direction or index, and zoom temporarily gives one pane the whole area. The difficulty is rounding: pixel sizes rarely divide into whole cells, so borders, padding and leftover pixels need rules, and every size change cascades into resize handling for each session below.",
    k: ["Layout tree with ratios versus fixed cell counts: ratios survive window resizing gracefully, but fixed counts keep programs from reflowing unexpectedly.", "Drawing pane borders as cells versus separate pixels: cell borders are simple and work over remote links, but waste columns and look coarse."],
    p: ["Rounding errors leave a one-cell gap or overlap between panes after repeated resizes.", "Resizing a divider fires a storm of size changes, and full-screen programs redraw for every intermediate size."],
    v: "Split a window into three panes, drag a divider, and confirm that each pane's program reports the new row and column count and no cell is unassigned or shared between panes.",
    dep: ["tabs-and-top-level-windows", "resize-handling"]
  },
  "detachable-sessions": {
    s: "Lets a set of shells keep running after the terminal window closes or the network drops, and be reattached later from the same or another terminal.",
    d: "A long-lived server process owns the ptys and the shells' parent relationship. Terminal windows are clients that connect over a local socket, receive a rendering of the session and send input. Detach drops the client without touching the server. On reattach the server must send enough state to repaint: either a screen snapshot or a replay of recent output. It is hard because the server is itself a terminal emulator facing the client's real terminal, so two screen models must be kept consistent and the client's capabilities can differ on each attach.",
    k: ["Server keeps its own screen model versus forwarding raw bytes: a model allows clean repaint and multiple viewers, but doubles emulation work and must match the client's quirks.", "One shared size for all attached clients versus per-client sizes: sharing is simple, but the smallest client constrains everyone."],
    p: ["Reattaching from a different terminal with fewer capabilities shows garbled output because the server replays sequences the client does not support.", "A server crash kills every session at once, since all shells depend on it."],
    v: "Start a long-running counter in a session, detach, wait a minute, reattach from a new window and confirm the counter kept advancing and the screen repaints with correct contents.",
    dep: ["multiplexer-server", "pty-pair"]
  },
  "multiplexer-server": {
    s: "The background process that owns ptys, session state and client connections for a multiplexer, mediating between many terminal clients and many shells.",
    d: "It listens on a local socket, authenticates clients by filesystem permissions, and forks shells on ptys it holds. Messages carry input, resize requests, and commands such as new window or split. Output from each pty is fed to a server-side emulator and fanned out to attached clients as drawing updates. The server also runs the control layer: key tables, command prompt, status line. It is difficult because it is a single event loop that must keep every pty drained, since one stalled client or slow consumer cannot be allowed to block the others.",
    k: ["Single-threaded event loop versus worker threads: a loop avoids locking and keeps state simple, but one expensive repaint delays all sessions.", "Binary framed client protocol versus passing escape sequences: framing is precise and versioned, but clients and servers must be upgraded together."],
    p: ["A slow client's unsent output buffer grows without bound in the server and eventually exhausts memory.", "A version mismatch between a newly installed client and the old running server refuses connection until the server is restarted, losing sessions."],
    v: "Attach two clients of different sizes, suspend one client process, run a heavy output command, and confirm the other client stays responsive and server memory stays bounded.",
    dep: ["pty-pair", "io-multiplexing", "escape-state-machine"]
  },
  "terminal-config-and-themes": {
    s: "Settings for fonts, colors, key bindings, scrollback size, shell command and behavior, loaded from files and reloadable while sessions run.",
    d: "A configuration file is parsed into typed options with defaults. Many options apply live: a font change triggers new metrics, which change cell size and so every session's rows and columns; a palette change repaints without touching the screen model. Others apply only to new sessions, like the shell command or environment. Themes are named palettes plus cursor and selection colors. It is hard because options interact with state already in flight, and errors in the file must degrade to defaults with a visible message rather than leaving the person with an unusable window.",
    k: ["Live reload versus restart-to-apply: live reload makes tuning pleasant, but each option needs a defined transition for existing sessions.", "Declarative file versus embedded scripting: a file is safe and diffable, but scripting expresses dynamic behavior at the cost of startup time and a larger attack surface."],
    p: ["A font size change recalculates rows and columns and sends a resize to every program, so full-screen editors redraw mid-edit.", "A syntax error in the file results in silent defaults, and the person cannot tell why customizations vanished."],
    v: "Edit the palette and font size in the file while a session runs, and confirm colors change in place, the cell grid resizes, and the shell's reported column count matches the new layout.",
    dep: ["system-fonts"]
  },
  "scrollback-search": {
    s: "Finds text across the visible screen and saved history, jumps between matches, and highlights them, working on the logical text rather than the wrapped display rows.",
    d: "Search walks the scrollback and grid, converting cells back into text. Wrapped rows must be joined into logical lines so a match is not broken by a wrap, and wide characters and combining marks must be mapped between cell positions and string offsets. Matches are stored as ranges and drawn as an overlay. Plain, case-insensitive and pattern search are common modes. It is hard because history can hold millions of lines, so scanning must be incremental and cancellable, and the buffer keeps changing while the search runs.",
    k: ["Search on stored cells versus a separately maintained text index: scanning cells costs nothing extra to store, but is slow on huge histories and must be redone as output arrives.", "Searching logical lines versus display rows: logical lines match what was printed, but map back to rows only through wrap bookkeeping."],
    p: ["A search that ignores soft wraps misses a match split across two display rows.", "New output scrolls the buffer while matches are highlighted, so stored positions drift off the text they referred to."],
    v: "Print a unique string that wraps across two rows, search for it, and confirm exactly one match is found and highlighted across both rows, then scroll output and confirm the highlight follows the text.",
    dep: ["scrollback-buffer", "line-wrap-and-reflow", "unicode-width"]
  },
  "key-event-capture": {
    s: "Receives raw key press and release events from the window system with their physical key, layout-resolved character and modifier state, before any translation into terminal bytes.",
    d: "The window system delivers events with a scan code, a symbol and the modifiers held, and often a separate text event after layout and dead-key processing. The terminal must decide which to use: the symbol for shortcuts, the produced text for ordinary input. It also intercepts its own bindings (copy, new tab) before the program sees anything. Repeat events, key release and focus changes add cases. It is hard because layouts differ, modifiers like alt can mean either an escape prefix or a composed character, and the same physical key must behave predictably.",
    k: ["Using layout-resolved characters versus physical key positions: characters respect the person's layout, but shortcuts then move when the layout changes.", "Terminal-level bindings first versus program first: reserving shortcuts is convenient, but takes keys away from programs that want them."],
    p: ["A dead key followed by a space produces a stray accent or nothing at all because composition state is not tracked.", "Reserved terminal shortcuts collide with an editor's keys, so the editor never receives them."],
    v: "On a non-default layout, press a dead key then a letter and an alt-modified letter, and confirm the program receives the composed character and the expected prefix sequence respectively.",
    dep: ["display-and-input-system"]
  },
  "key-encoding": {
    s: "Turns key presses into the byte sequences programs expect: plain text, control characters, and escape sequences for cursor, function and editing keys, varying with terminal modes.",
    d: "Printable keys send their encoded text. Control combinations map to C0 bytes, alt prefixes an escape byte, and special keys send sequences whose form depends on application-cursor and keypad modes and on modifier parameters. The program learns which sequences to expect from the capability database or by convention. It is hard because the scheme is lossy: several key combinations produce identical bytes, a lone escape byte is indistinguishable from the start of a sequence without a timeout, and modes switch the whole table.",
    k: ["Table from the capability database versus a built-in table: the database lets old programs adapt, but the built-in table is faster and avoids missing or wrong entries.", "Timeout to disambiguate a lone escape versus never waiting: waiting guesses correctly, but adds delay to a frequently used key."],
    p: ["A mode set by a crashed program is never reset, so arrow keys send different sequences in the next program.", "Control-I and tab, or control-M and enter, are the same byte, so programs cannot bind them separately."],
    v: "Run a byte-dump tool, press arrows in normal and application-cursor mode and with shift held, and confirm the printed sequences match the mode-dependent table.",
    dep: ["key-event-capture", "terminal-modes", "terminal-capability-database"]
  },
  "extended-key-protocol": {
    s: "An opt-in scheme where programs request unambiguous key reports, including modifiers, key release and alternate keys, in place of the legacy lossy byte encoding.",
    d: "A program enables it with a mode-setting sequence, often with flags choosing how much to report. The terminal then sends each key as a structured sequence carrying a key code and modifier bitmask, and optionally event type (press, repeat, release) and the shifted or base-layout key. Terminals keep a stack of requested modes so nested programs restore the previous state. It is hard because adoption is partial: support must be detected through a query, programs must fall back, and a program that exits without disabling it leaves the shell receiving sequences it cannot parse.",
    k: ["Opt-in flags versus a new default: opt-in preserves every existing program, but needs query, fallback and cleanup logic in every client.", "Reporting release events versus press only: release enables games and chords, but floods ordinary programs with sequences they must discard."],
    p: ["A program crashes while the mode is on, and the shell then prints raw sequences as text when keys are pressed.", "Multiplexers drop or rewrite the mode request, so the inner program believes it has precise keys but never receives them."],
    v: "Enable the mode in a test program, press control-I then tab and shift-enter, and confirm distinct reports; then kill the program and verify the shell regains legacy encoding.",
    dep: ["key-encoding", "terminal-modes", "device-queries"]
  },
  "input-method-composition": {
    s: "Supports text entry that needs several keystrokes to produce one character, by hosting the system input method's pre-edit text and sending only the committed result.",
    d: "For languages that compose characters, the system input method shows a candidate or in-progress string near the cursor and commits finished text. The terminal supplies the cursor's pixel position so the candidate window appears in the right place, draws the pre-edit string as an overlay without writing it to the cell grid, and sends the committed text through the normal input path. It is hard because pre-edit text is neither screen content nor program input, the cursor position changes as programs move it, and wide characters must be handled consistently with the grid's cell widths.",
    k: ["Drawing pre-edit as an overlay versus inserting into the grid: an overlay leaves program state untouched, but needs separate layout and clipping code.", "Reporting cursor position continuously versus on focus: continuous reporting keeps the candidate list near the text, but costs a round trip to the input system."],
    p: ["The candidate window appears at the wrong place after a full-screen program moves the cursor, because position updates are lagging.", "Committed wide text is sent without the program knowing its width, so the program's cursor tracking drifts."],
    v: "With a composing input method active, type a multi-keystroke character, confirm the in-progress text shows near the cursor but is absent from scrollback, and the final character arrives once as a single input.",
    dep: ["key-event-capture", "unicode-width", "display-and-input-system"]
  },
  "mouse-reporting": {
    s: "Lets a program ask the terminal to send mouse presses, releases, motion and wheel events as escape sequences, in one of several coordinate encodings.",
    d: "A program enables reporting with mode sequences that choose which events to send (clicks only, drag, all motion) and an encoding for coordinates. The terminal converts pixel positions to cell coordinates and writes a sequence with button, modifiers and position. Older encodings cap coordinates at a small number, so extended encodings carry decimal numbers and optionally pixel positions. When reporting is off the terminal handles the mouse itself for selection and scrolling, usually with a modifier key to override. It is hard because ownership of the mouse switches with program state.",
    k: ["Extended decimal coordinates versus legacy single-byte coordinates: decimal supports wide terminals, but legacy is the only form old programs understand.", "Wheel as scroll of the terminal versus wheel as arrow keys in the alternate screen: arrow keys make pagers scroll without mouse support, but surprise programs that did not ask."],
    p: ["Selection stops working in a full-screen program because mouse reporting is on and the override modifier is not known to the person.", "A crashed program leaves reporting enabled, and every click in the shell prints escape garbage."],
    v: "Run a mouse-event dumper, click, drag and scroll at known cell positions, and confirm the decoded button, modifiers and coordinates match, including past column 223 with extended encoding.",
    dep: ["terminal-modes", "key-event-capture", "alternate-screen"]
  },
  "text-selection": {
    s: "Lets the person highlight text on the grid with the mouse or keyboard, by character, word, line or rectangle, and map the highlight back to the text that was printed.",
    d: "Selection is stored as anchors in grid or scrollback coordinates, so it can span history and survive scrolling. Word and line modes use boundary rules: delimiter characters for words, and soft-wrap flags to join wrapped rows into one logical line. Extracting text converts cells back to characters, trims trailing blank cells, skips the second half of wide characters and keeps combining marks. It is hard because the grid is not the text: padding, wraps and wide characters distort it, and selected cells can scroll out or be overwritten while selected.",
    k: ["Anchoring in absolute buffer coordinates versus screen coordinates: absolute anchors follow the text through scrolling, but must be clipped when old rows are discarded.", "Rectangular mode available versus lines only: rectangles help with columns and tables, but add a second extraction path."],
    p: ["Copied text contains trailing spaces or hard breaks at every soft wrap because wrap flags are ignored.", "The selection silently shifts onto different text when the screen scrolls under it."],
    v: "Print a long wrapped line, double-click a word on it and triple-click the line, and confirm the pasted text has no inserted line break or trailing padding and contains the exact words selected.",
    dep: ["cell-grid", "scrollback-buffer", "line-wrap-and-reflow", "grapheme-clusters"]
  },
  "clipboard-integration": {
    s: "Moves text between the terminal and the system clipboards, and lets programs request clipboard reads or writes through an escape sequence, subject to permission policy.",
    d: "Copy writes the selected text to the system clipboard, and on some systems also to a separate primary selection updated on every highlight. Programs may ask to set the clipboard with an OSC sequence carrying encoded data, which allows copying from remote sessions. Reading is a query that returns clipboard contents to the program, which is much more sensitive. The terminal checks policy for each operation. It is hard because the clipboard crosses a trust boundary: remote programs can write arbitrary content, and asynchronous reads need a prompt or a deny rule.",
    k: ["Allowing program-initiated writes versus denying them: allowing makes remote copy work, but lets any output replace what the person later pastes.", "Allowing clipboard reads versus write-only: reads enable useful tooling, but give any program in the session access to everything copied."],
    p: ["A malicious file shown with a cat command silently overwrites the clipboard with a dangerous command.", "Large clipboard payloads in an escape sequence exceed length limits of a multiplexer and arrive truncated."],
    v: "From a remote session send a clipboard-set sequence and confirm the local clipboard changes only when policy allows; then attempt a read and confirm it is refused or prompted.",
    dep: ["osc-handlers", "text-selection", "untrusted-output"]
  },
  "bracketed-paste": {
    s: "Wraps pasted text in start and end markers so the program can tell pasted input from typing and handle it as a single unit, without executing embedded control characters.",
    d: "When a program enables the mode, the terminal sends a start marker, the pasted bytes, then an end marker. The program can insert the text literally, ignore embedded newlines, or show a confirmation. The terminal must also strip or neutralize any end marker inside the pasted content, otherwise the content could close the bracket early and inject commands. It is hard because pasting is a trust boundary: without brackets every newline in pasted text acts as pressing enter, and shells and editors must each implement their side.",
    k: ["Bracketing enabled by the program versus always on: opt-in keeps old programs working, but those programs execute pasted newlines immediately.", "Stripping control bytes in the terminal versus letting the program decide: stripping protects naive programs, but changes legitimate paste content."],
    p: ["Pasted text containing the end marker terminates the bracket early and the remainder runs as typed commands.", "A program exits without disabling the mode, and the next program sees stray markers around pasted text."],
    v: "Paste a multi-line command into a shell with the mode enabled and confirm it appears in the editing buffer unexecuted; then paste text containing the end marker and confirm it cannot escape.",
    dep: ["terminal-modes", "clipboard-integration", "untrusted-output"]
  },
});
