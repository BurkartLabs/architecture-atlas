// Details for the shell & terminal plate, part 3: text rendering and the pseudo-terminal layer.
ATLAS.details("shell-terminal", {
  "unicode-width": {
    s: "Decides how many columns each code point occupies (zero, one or two) so that text lines up on the grid, using tables derived from Unicode data.",
    d: "Combining marks and format characters take zero columns, East Asian wide and fullwidth characters and most emoji take two, and the rest take one. The emulator uses a lookup table keyed by code point, built from a particular version of the standard. The program that prints the text must use the same widths, or its idea of the cursor column drifts from the terminal's. It is hard because the standard keeps changing, ambiguous-width characters depend on locale, emoji sequences change width in context, and the library in the shell, the editor and the terminal may each use different versions.",
    k: ["Static table compiled in versus runtime-configurable width: static is fast and predictable, but can disagree with the programs on the other end of the pty.", "Treating ambiguous-width characters as narrow versus wide: narrow suits most locales, but breaks alignment for people whose fonts draw them wide."],
    p: ["A program and the terminal disagree on an emoji's width, so everything after it on the line is misaligned.", "A new character added in a later standard version has width one in an old table and the line wraps incorrectly."],
    v: "Print a line mixing ASCII, wide, combining and emoji characters followed by a right-aligned marker, and confirm the marker lands in the expected column and the cursor report matches the program's count.",
    dep: ["locale-and-encoding", "text-model"]
  },
  "grapheme-clusters": {
    s: "Groups code points that form one user-perceived character, such as a base letter with accents or an emoji built from joined parts, into a single cell cluster.",
    d: "Boundary rules from the Unicode text segmentation algorithm decide whether an incoming code point extends the previous cluster or starts a new one. The emulator then stores the cluster in one cell, or a wide cell and spacer, via a side table for multi-code-point strings, and the renderer shapes it as a unit. Selection, deletion and cursor movement should treat it as one. It is hard because rules depend on a running state (regional indicator pairs, joined sequences), the shell's line editor must agree with the emulator, and the terminal cannot know how fonts will draw a given sequence.",
    k: ["Cluster-aware cells versus one code point per cell: clusters render correctly and match user expectations, but need side storage and state tracking in the parser.", "Replacing the last cell's content on a joiner versus appending a new cell: replacement keeps alignment, but changes width after the cursor has moved on."],
    p: ["Combining marks printed after a cursor move land in a new cell and show as detached accents.", "Backspace in a line editor removes only part of a cluster, leaving a broken sequence on screen."],
    v: "Print a flag emoji, a family emoji sequence and a letter with two combining marks, and confirm each occupies the expected cells, is drawn as one glyph and is selected and copied as a unit.",
    dep: ["cell-grid", "unicode-width", "text-shaping"]
  },
  "font-fallback": {
    s: "Chooses which font draws each character, searching a configured list and then the system's fonts when the primary font lacks the glyph, while keeping cell metrics uniform.",
    d: "The terminal loads a primary monospace family with regular, bold, italic and bold-italic faces, derives cell width and height from it, and checks each cluster against font coverage. Missing glyphs trigger a search of fallback fonts, with results cached per code point. Fallback glyphs are scaled or clipped to fit the cell grid. Box drawing and block characters are often drawn by the terminal itself for exact joins. It is hard because fallback fonts have different metrics and baselines, discovery can be slow on first use, and missing styles are synthesized.",
    k: ["Synthesizing bold and italic versus requiring real faces: synthesis always works, but looks worse and can change width.", "Built-in drawing of box and block characters versus font glyphs: built-in drawing aligns perfectly at any size, but ignores the font's design."],
    p: ["First use of a rare character stalls rendering for hundreds of milliseconds while the system searches for a font.", "A fallback font with a taller baseline makes emoji lines taller or clipped relative to text."],
    v: "Print a line mixing Latin, rare symbols, box drawing and emoji, and confirm every glyph is drawn inside its cell without gaps in box lines, and a second print of the line is drawn without a stall.",
    dep: ["system-fonts", "glyph-cache", "unicode-width"]
  },
  "text-shaping": {
    s: "Maps a run of code points to positioned glyphs using the font's tables, applying ligatures, contextual forms and mark placement while the grid constrains advance widths.",
    d: "A shaping engine takes a run of text with a font and script and returns glyph indexes with positions. For terminals, runs are formed from consecutive cells sharing a font and style, then shaped and mapped back to cells. Programming ligatures replace sequences of characters with one glyph spanning several cells, while complex scripts need reordering and joining. It is hard because the grid fixes each cell's width, so shaped output must be fit into cells, cursor and selection must cope with a glyph spanning cells, and run splitting at style changes can break ligatures unintentionally.",
    k: ["Shaping runs versus drawing glyph per cell: shaping supports ligatures and complex scripts, but costs CPU and complicates the cell mapping.", "Breaking runs at the cursor versus keeping them whole: breaking lets the cursor sit inside a ligature, but makes the ligature flicker as the cursor moves."],
    p: ["A ligature spanning cells is split when only one cell is redrawn, so a stale half shows next to the new half.", "Right-to-left text printed in logical order shows reversed, because no reordering was applied to the run."],
    v: "Print a sequence that a font ligates, move the cursor across it and edit one character, and confirm the ligature forms, redraws as a whole and reverts correctly when the sequence is broken.",
    dep: ["font-fallback", "grapheme-clusters", "cell-grid"]
  },
  "glyph-cache": {
    s: "Stores rasterized glyphs in an atlas texture keyed by font, glyph, size and style, so drawing a screen of text is mostly texture lookups rather than repeated rasterization.",
    d: "On first use a glyph is rasterized by the font engine and packed into an atlas, with metrics recorded. Each frame the renderer emits instances referencing atlas rectangles, so a full screen is a few draw calls. The cache is keyed by anything that changes the bitmap: size, subpixel position, hinting, and whether color. When the atlas fills, entries are evicted or the atlas is grown or rebuilt. It is hard because cache invalidation on font or scale change must be complete, and subpixel and color glyphs need different formats.",
    k: ["Fixed-size glyph cells versus variable packing: fixed slots are simple and fast to index, but waste space for narrow glyphs and handle oversized ones poorly.", "Rebuilding the atlas when full versus incremental eviction: rebuilds are simple, but cause a visible hitch."],
    p: ["Moving the window to a display with a different scale factor reuses glyphs rasterized at the old scale, drawing them blurry.", "A flood of unique characters fills the atlas mid-frame and some cells draw blank for one frame."],
    v: "Print every character in a large Unicode block, then clear and reprint a normal screen, and confirm no blanks appear, memory use stays bounded, and frame time returns to its earlier level.",
    dep: ["font-fallback", "system-fonts"]
  },
  "color-models": {
    s: "How colors are represented and mapped: default colors, a small indexed palette, an extended palette, and direct values, along with the rules for theming and contrast.",
    d: "The emulator stores colors as default, an index into a palette of sixteen base colors plus a color cube and gray ramp, or a direct three-channel value. Rendering resolves indexes against the current theme, so palette changes recolor existing text. Programs may query or redefine palette entries. Terminals may enforce minimum contrast or map direct colors down when the display or remote link cannot show them. It is hard because the same escape yields different appearance in different themes, programs assume particular palette values, and blending and gamma are rarely specified.",
    k: ["Resolving indexes at render time versus at print time: render-time resolution lets themes change live, but can make old output unreadable on a new background.", "Enforcing minimum contrast versus honoring program colors exactly: enforcement protects readability, but alters designed output."],
    p: ["Dark blue text on a dark theme is unreadable because the program assumed a light background palette.", "A program advertising direct color through the environment is run in a terminal that quantizes it, producing banding."],
    v: "Print the full color cube, a gray ramp and a direct color gradient, switch themes, and confirm indexed cells recolor while direct colors stay fixed, with no visible banding in the gradient.",
    dep: ["cell-attributes", "capability-negotiation"]
  },
  "cursor-and-decorations": {
    s: "Draws the cursor in its shape and blink state, plus underlines, strikethrough, selection highlights, link underlines and search matches, layered over the glyphs.",
    d: "After glyphs are drawn, the renderer overlays decorations computed from cell attributes and UI state: block, bar or underline cursor, hollow when unfocused, blink phase, several underline styles with their own color, selection and search highlights, and hover underline for links. Inverse cells swap colors. The cursor shape can be set by programs. It is hard because blink timers force periodic damage, decorations must align across fonts, and the cursor must stay visible against any background and over wide or combined characters.",
    k: ["Blinking cursor driven by timer versus steady: blink helps locating the cursor, but wakes the renderer and drains battery when idle.", "Drawing decorations from font metrics versus fixed fractions of the cell: font metrics look correct, but vary across fallback fonts."],
    p: ["The blink timer keeps redrawing the screen while hidden or idle, wasting power continuously.", "A block cursor over a cell with the same foreground and background becomes invisible."],
    v: "Focus and unfocus the window with each cursor shape, over a wide character and over an inverse cell, and confirm the cursor is always visible and the idle process stops waking once blink is disabled.",
    dep: ["cell-attributes", "damage-tracking", "glyph-cache"]
  },
  "compositing-and-frame-pacing": {
    s: "Draws the grid, decorations and images into a frame and presents it in step with the display, deciding how often to render when output arrives faster than the refresh rate.",
    d: "The renderer collects damage, builds instance data for backgrounds, glyphs and decorations, draws them, and presents on the display's vertical sync, usually on a separate thread from parsing. If the program prints faster than frames can be drawn, intermediate states are skipped, which is why a fast scroll shows only some lines. Idle sessions should not render. It is hard because latency and throughput conflict: vsync adds up to a frame of delay for each key, while unthrottled rendering burns power, and transparency and blur require extra passes.",
    k: ["Presenting on vsync versus immediately: vsync avoids tearing and saves power, but adds latency to each echo.", "Parsing and rendering on separate threads versus one: separate threads keep input responsive under heavy output, but need locking or snapshots of the grid."],
    p: ["Rendering every received chunk during a huge output makes the terminal slower than the program producing it.", "A fully transparent window forces the compositor to blend each frame, cutting frame rate on weak hardware."],
    v: "Measure key-to-pixel latency on an idle session, then print a very large file and confirm the file completes quickly, typing still echoes within a few frames, and CPU use drops to near zero afterward.",
    dep: ["damage-tracking", "glyph-cache", "display-and-input-system", "throughput-latency"]
  },
  "pty-pair": {
    s: "A pair of connected kernel endpoints, a master held by the terminal and a slave opened by the shell, behaving like a serial terminal for the program on the slave side.",
    d: "The terminal opens the master, obtains the slave's device path after granting and unlocking it, then starts the child, which opens the slave as its standard descriptors and becomes the session leader with it as its controlling terminal. Bytes written to the master become input on the slave through the line discipline, and bytes written to the slave become readable on the master. When the last slave descriptor closes, the master reads end-of-file or an error. It is hard because every behavior of an old serial line is simulated: hangups, window size, flow control and permission checks.",
    k: ["Using a pty versus plain pipes for the child: a pty gives job control, line editing and terminal detection, but adds line discipline overhead and quirks.", "Allocating the pty before versus after forking: allocating first lets the parent keep the master, but the child must set up the session correctly or inherit the wrong terminal."],
    p: ["The parent keeps a stray slave descriptor open, so the master never sees end-of-file after the child exits.", "Slave device permissions are left permissive and another user can read or inject input."],
    v: "Spawn a shell on a pty, write a command to the master and read output back, then exit the shell and confirm the master read returns end-of-file or error promptly.",
    dep: ["file-descriptors", "controlling-terminal", "line-discipline"]
  },
  "line-discipline": {
    s: "The kernel layer between the master and slave that, in canonical mode, buffers and edits input lines, echoes characters and translates control keys to signals and line endings.",
    d: "Input bytes from the master pass through the discipline, which in canonical mode collects a line, handles erase and kill characters, echoes typed text back to the output side, and delivers the line to a reader only when a line ending arrives. Interrupt, quit and suspend characters generate signals to the foreground process group. Output passes through output processing, which can convert line feed to carriage return plus line feed. It is hard because behavior is controlled by many flags, and a shell or editor switches between modes frequently.",
    k: ["Canonical processing in the kernel versus raw bytes to the program: the kernel line editing is free for simple programs, but any program with its own editing must disable it.", "Echo performed by the discipline versus the program: kernel echo is immediate and correct for simple readers, but corrupts password prompts and custom redraw."],
    p: ["A program crashes in raw mode and the shell shows typed characters without echo until a reset restores the flags.", "Both the line discipline and the line editor echo, so every typed character appears twice."],
    v: "In a pty with canonical mode, type text with a backspace and confirm the program receives the edited line only after enter; then switch to raw mode and confirm bytes arrive immediately and unmodified.",
    dep: ["pty-pair", "termios-modes", "terminal-signals"]
  },
  "termios-modes": {
    s: "The set of flags and special characters describing how the terminal behaves: echo, canonical editing, signal generation, output translation, baud-like settings and the control character table.",
    d: "A program reads and writes a structure containing input, output, control and local flag words and an array of control characters such as erase, interrupt and end-of-file. Calls apply changes immediately, after output drains, or after discarding pending input. Programs typically save the original settings, switch to raw or cbreak mode, and restore on exit, including from signal handlers. It is hard because the structure is global to the terminal rather than per process, so any process can change it for all others, and failure to restore leaves a broken terminal.",
    k: ["Cbreak mode (no line editing, signals kept) versus full raw: cbreak keeps interrupt working, but raw hands every byte, including control keys, to the program.", "Applying changes after draining output versus immediately: draining avoids corrupting pending output, but can block if the output is stalled by flow control."],
    p: ["A program exits through an unhandled path without restoring settings, and the shell is left with echo disabled.", "A child changes flags while the shell's editor assumes its own, so editing misbehaves after a command returns."],
    v: "Run a program that enters raw mode, kill it with an uncatchable signal, and confirm the shell restores sane flags on the next prompt or the terminal shows echo disabled, as the shell's handling dictates.",
    dep: ["line-discipline", "pty-pair"]
  },
  "controlling-terminal": {
    s: "The association between a session and one terminal device, set when a session leader opens it, which decides who receives hangups and terminal-generated signals.",
    d: "A session leader that has no controlling terminal acquires one by opening a terminal device, usually done explicitly by the spawner with an ioctl. The terminal records the session and its foreground process group. Background processes that read or write the terminal receive stop signals. When the terminal hangs up, the session leader gets a hangup signal, which the shell forwards to its jobs. It is hard because the rules for acquisition, the ability to take over a terminal, and orphaned process groups are subtle and differ between systems.",
    k: ["Explicit assignment by the spawner versus acquiring on first open: explicit is predictable, but forgetting it gives a child with no job control.", "Shell forwarding hangup to jobs versus leaving them: forwarding cleans up, but kills background work the person wanted to keep."],
    p: ["A child without a controlling terminal opens the terminal device by path and gets job control signals aimed at the wrong group.", "An orphaned stopped process group is never resumed because no parent can continue it."],
    v: "Start a shell on a pty, check from within it that the process's terminal and session identifiers match the pty, close the master, and confirm the shell and background job receive a hangup.",
    dep: ["pty-pair", "process-groups", "signal-delivery"]
  },
  "window-size-notification": {
    s: "Stores the terminal's row and column counts in the pty and delivers a signal to the foreground process group when they change so programs can redraw.",
    d: "The terminal sets the window size on the master with an ioctl. The kernel stores rows, columns and optional pixel dimensions, and sends a window-change signal to the foreground process group. Programs handle the signal, query the size with the matching ioctl, and redraw. A newly started program reads the size at startup, and shells also export size variables for non-signal-aware tools. It is hard because the notification is only an edge, so a program that misses it keeps stale dimensions, and coalesced signals may arrive after a further change.",
    k: ["Signal plus query versus sending the size in the data stream: the signal fits all programs, but loses information if missed and has no ordering with output.", "Setting pixel size versus only cells: pixels help graphics programs, but many terminals report zeros or inaccurate values."],
    p: ["A program blocks the signal during a critical section and later never reads the new size.", "Size is set before the child starts reading, so the first prompt wraps at the default eighty columns."],
    v: "Run a program that prints its size on each window-change signal, resize the terminal several times quickly, and confirm the last printed size equals the final window size.",
    dep: ["pty-pair", "signal-delivery", "resize-handling"]
  },
  "flow-control": {
    s: "Lets a receiver pause and resume a sender using in-band stop and start characters, or by simply not reading, so a slow consumer does not lose data.",
    d: "Software flow control reserves two control characters: one asks the output side to stop, another to resume, and the line discipline obeys them when enabled. Without it, the kernel's pty buffer fills and the writer blocks, which provides backpressure by default. Terminals can use the stop character to throttle fast producers, and users sometimes press it by accident, appearing to freeze the display. It is hard because the pause characters are data bytes that programs might need, and flow control through layers such as multiplexers and remote links compounds delays.",
    k: ["In-band stop and start versus relying on blocking writes: in-band signalling works across many layers, but reserves two bytes and is easy to trigger accidentally.", "Disabling software flow control in the shell versus leaving it: disabling frees those keys for editing, but removes a way to pause output."],
    p: ["Pressing the stop key by accident makes the terminal look frozen until the start key is pressed.", "A multiplexer ignores the stop character and buffers megabytes the person asked to pause."],
    v: "Print a continuous stream, send the stop character and confirm output halts and the producer blocks, then send the start character and confirm output resumes with no missing lines.",
    dep: ["line-discipline", "termios-modes"]
  },
  "pty-backpressure": {
    s: "The finite kernel buffer between the two pty ends, which blocks writers when full and so ties the speed of programs to how fast the terminal reads and draws.",
    d: "The kernel keeps a bounded buffer in each direction, commonly a few kilobytes to tens of kilobytes. If the emulator stops reading from the master, the program's writes block once the buffer fills. Reading in large chunks reduces system calls, but must be balanced against responsiveness and the time to parse and render. In the other direction, pasting a big text into a program that does not read blocks the terminal's write. It is hard because a blocking write on the terminal's main loop freezes the interface, so writes must be queued and non-blocking.",
    k: ["Reading as fast as possible versus a bounded read per tick: reading greedily maximizes throughput, but can starve rendering and input.", "Queueing writes to the pty versus blocking: queueing keeps the interface alive, but needs a cap and a policy for overflow."],
    p: ["Pasting a large block into a stalled program blocks the terminal's event loop, so the window stops responding.", "Giving each session an unbounded output queue lets a runaway command consume memory."],
    v: "Run a command that prints continuously and one that never reads input, paste a large block into the second, and confirm the window stays responsive and memory use stays below the configured cap.",
    dep: ["pty-pair", "io-multiplexing", "throughput-latency"]
  },
  "terminal-signals": {
    s: "The signals the terminal layer generates: interrupt, quit and suspend from control keys, hangup when the terminal closes, and window change, all delivered to the foreground process group.",
    d: "When signal generation is enabled, the line discipline converts the interrupt, quit and suspend characters into signals sent to every process in the foreground group. Hangup goes to the session leader when the master closes, and window-change follows a resize. Background processes that read from the terminal get stop signals. A program may catch, ignore or default each one, which is why a program can ignore interrupt and keep running. It is hard because delivery is to groups, not single processes, and correct behavior depends on the shell having placed jobs in the right groups.",
    k: ["Signal generation by the discipline versus by the terminal emulator: the kernel route reaches the right group with no emulator knowledge, but only works in modes that enable it.", "Suspend character enabled versus disabled: enabled gives job control, but programs in raw mode must manage it themselves."],
    p: ["A raw-mode program treats the interrupt byte as data, so pressing it has no effect and the program seems unkillable.", "A job started without its own process group is hit by the shell's interrupt and the shell dies with it."],
    v: "Run two chained commands, press the interrupt key, and confirm every process in that job receives it and exits while the shell survives and prints a fresh prompt.",
    dep: ["line-discipline", "process-groups", "signal-delivery"]
  },
});
