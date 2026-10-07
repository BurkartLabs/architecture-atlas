// Details for the shell & terminal plate, part 2: escape-sequence processing and the screen model.
ATLAS.details("shell-terminal", {
  "byte-decoder": {
    s: "Converts the raw byte stream from the pty into Unicode code points, carrying partial multi-byte characters across read boundaries and replacing invalid sequences.",
    d: "Reads from the pty arrive in arbitrary chunks, so a multi-byte character can be split between two reads. The decoder keeps a few bytes of state and emits a code point only when complete. Invalid or overlong sequences produce a replacement character and resynchronize at the next valid lead byte. Control bytes inside escape sequences must still reach the parser, so decoding is often fused with the state machine, with a fast path for plain ASCII runs. It is hard because performance matters on large outputs, while correctness at chunk boundaries decides whether text corrupts.",
    k: ["Decoding before parsing versus parsing bytes directly: decoding first is simpler and handles all code points, but parsing bytes allows a fast ASCII path and avoids an extra pass.", "Replacing invalid bytes versus passing them through: replacement is safe and visible, but binary output becomes unrecoverable in the display."],
    p: ["A chunk boundary falls inside a multi-byte character and the decoder emits two replacement characters instead of one correct glyph.", "An invalid sequence consumes the following valid ASCII byte, swallowing an escape character and breaking a control sequence."],
    v: "Feed a text containing multi-byte characters one byte at a time and in one block, and confirm the screen contents are identical; then inject an invalid byte and confirm exactly one replacement character.",
    dep: ["locale-and-encoding"]
  },
  "escape-state-machine": {
    s: "A byte-driven finite state machine that classifies each input unit as printable text, a control, or part of an escape, control, operating-system or device-control sequence, and dispatches complete sequences.",
    d: "States include ground, escape, intermediate collection, parameter collection, string collection and ignore. Each input byte causes a transition and possibly an action: print, execute, collect a parameter, or dispatch a final byte. Because the machine holds state between reads, sequences split across reads parse correctly, and unknown sequences can be skipped without desynchronizing. Controls inside a sequence execute immediately, and cancel bytes abort it. It is hard because real programs emit malformed and vendor-specific sequences, and a parser that mishandles one leaves the screen in a corrupted state until reset.",
    k: ["Table-driven machine versus hand-written branches: a table follows the specification and is easy to audit, but hand-coded paths can be faster for printable text.", "Ignoring unknown sequences versus printing them: ignoring keeps the screen clean, but hides which features a program needed."],
    p: ["An unterminated string sequence swallows all following output until a terminator that never comes, freezing the display.", "Parameters beyond a fixed limit overflow a buffer or are truncated differently than other terminals, changing behavior."],
    v: "Feed a recorded session in randomly sized chunks and in one block, and confirm the resulting grid, cursor and attributes are identical; then feed truncated sequences and confirm the parser recovers on the next valid byte.",
    dep: ["byte-decoder"]
  },
  "control-characters": {
    s: "Handles the single-byte controls such as backspace, tab, line feed, carriage return and bell, which move the cursor or signal the person without an escape prefix.",
    d: "Carriage return moves to column zero, line feed moves down and scrolls at the bottom margin, backspace moves left one cell, tab advances to the next tab stop, and bell triggers an audible or visual alert. Line feed may also imply carriage return, depending on a mode, and the line discipline's output processing usually adds one. Shift codes switch character sets. The controls execute even in the middle of another sequence. It is hard because the combined behavior of the line discipline and terminal decides whether lines stair-step, and bell needs rate limiting.",
    k: ["Treating line feed as new-line versus pure line-feed: new-line matches casual expectations, but breaks programs that move down without returning.", "Visual bell versus audible bell: visual avoids annoying people, but can be missed in an unfocused or hidden tab."],
    p: ["A raw-mode program prints bare line feeds and each line starts further right, since nothing added a carriage return.", "A loop printing the bell character produces a flood of alerts or flashes that cannot be silenced."],
    v: "Print text containing tab, backspace, carriage return and line feed in raw mode and cooked mode, and confirm the cursor positions match the specified movement in each case.",
    dep: ["escape-state-machine", "cursor-and-margins", "line-discipline"]
  },
  "csi-dispatch": {
    s: "Interprets control sequences with numeric parameters and a final byte, which perform most screen editing: cursor movement, erasing, inserting, scrolling and setting attributes.",
    d: "After the parser collects parameters and intermediates, a dispatcher looks up the final byte and calls a handler: move the cursor, erase in line or display, insert or delete lines or characters, scroll a region, set modes, or select graphic rendition. Missing parameters take defaults, zero often means default, and subparameters separated by colons carry extended colors. It is hard because handlers must obey margins and wide-character edge cases, defaults differ per command, and ambiguity between a private mode and a standard one depends on a prefix byte.",
    k: ["Strict specification behavior versus compatibility with popular implementations: strictness is predictable, but programs written against another terminal's quirks break.", "One handler table versus per-mode dispatch: a single table is easy to extend, but sequences meaning different things in different modes need explicit checks."],
    p: ["Erase and insert commands ignore the current attribute state, leaving blank cells with the wrong background color.", "A missing or zero parameter is treated as literal zero, so a move by zero moves nothing instead of one cell."],
    v: "Run a conformance script exercising each sequence with default, zero and out-of-range parameters, and compare the resulting grid snapshot with the expected reference screen.",
    dep: ["escape-state-machine", "cell-grid", "cursor-and-margins", "cell-attributes"]
  },
  "osc-handlers": {
    s: "Processes operating-system-command strings that set the window title, change palette entries, report the working directory, create hyperlinks, mark prompts and access the clipboard.",
    d: "An OSC sequence is a numeric code, a separator and a string terminated by a bell or string terminator. The handler table maps codes to actions: set title, set or query colors, announce the current directory, open a link region, mark the start and end of prompts and command output, and write to the clipboard. Shells emit prompt marks and directory reports through their prompt, which lets the terminal jump between commands and open new tabs in the same place. It is hard because strings have no length bound and carry untrusted data into window titles and the clipboard.",
    k: ["Whitelisting known codes versus honoring all codes: a whitelist limits abuse, but blocks useful extensions that appear later.", "Terminator support for both bell and string terminator versus one: accepting both matches existing programs, but doubles parser paths."],
    p: ["A title set from untrusted output contains control characters and is later echoed back through a title query as injected input.", "A string with no terminator keeps the parser collecting forever and consumes memory."],
    v: "Emit a title, a working-directory report and a prompt mark from a shell prompt and confirm the window title updates, a new tab opens in that directory, and jump-to-previous-prompt lands on the mark.",
    dep: ["escape-state-machine", "untrusted-output"]
  },
  "terminal-modes": {
    s: "The set of switchable behaviors on the emulator, such as autowrap, origin mode, application cursor keys, cursor visibility, mouse reporting and bracketed paste, toggled by escape sequences.",
    d: "Modes are numbered flags set and reset by sequences, queried by programs, and saved or restored in groups. Some affect output (wrap, origin, insert), some affect input encoding (application keys, keypad), and some enable features (mouse, paste brackets, focus reporting, alternate screen). A reset sequence restores the defaults. It is hard because modes persist after the program that set them exits, so shells and multiplexers must reset or save them, and because a few modes differ between the primary and alternate screen.",
    k: ["Global modes versus modes saved per screen: global is simpler, but a full-screen program then pollutes the primary screen's behavior after exit.", "Querying modes explicitly versus assuming defaults: queries let programs adapt, but need every emulator to answer honestly."],
    p: ["A crashed program leaves mouse reporting or application-cursor mode on, and the shell becomes unusable until a reset command.", "A multiplexer restores a mode on reattach that the client terminal never learned, so state diverges."],
    v: "Enable several modes from a test program, run a mode-query for each and confirm the replies, then run the reset sequence and confirm they all return to documented defaults.",
    dep: ["csi-dispatch", "cell-grid"]
  },
  "device-queries": {
    s: "Responds to programs that ask the terminal to identify itself or report its state: cursor position, device attributes, size, colors, supported modes and features.",
    d: "A program writes a query sequence and reads the reply from its input, as if typed. Common queries ask for the cursor position, the terminal's identity and feature class, text area size in cells or pixels, palette colors, and whether a mode is set. Programs use the answers to measure the terminal or detect capabilities that no database lists. Replies are written back into the pty input. It is hard because replies arrive asynchronously interleaved with typing, programs may not wait long enough, and responding to queries inside untrusted output can inject input.",
    k: ["Answering every query versus only trusted ones: answering supports feature detection, but untrusted output can make the terminal type into the shell.", "Truthful capability reports versus claiming a popular identity: claiming an identity gets better behavior from programs, but is a lie when features are missing."],
    p: ["Printing a file containing a query sequence causes the terminal to inject reply bytes into the next shell prompt.", "A program times out waiting for a reply through a slow connection and the late reply later appears as typed characters."],
    v: "Send a cursor-position query and a device-attributes query from a test program in raw mode, and confirm each reply arrives on input in the documented format with the correct current cursor row and column.",
    dep: ["csi-dispatch", "pty-pair", "untrusted-output", "capability-negotiation"]
  },
  "inline-graphics": {
    s: "Optional protocols that let programs draw raster images in the grid by sending encoded image data through special escape sequences, placed at cell positions and cleared with the text.",
    d: "A program sends an image as encoded pixel data, either inline in a device-control string or in chunks that reference an identifier. The terminal decodes it, uploads it as a texture and records a placement anchored to cells, with a size in cells or pixels. Images must scroll with text, be clipped by margins, and be deleted when the cells are overwritten or scrolled off. It is hard because image memory can be large, the formats differ, placement semantics interact with reflow and alternate screen, and multiplexers must pass the data through.",
    k: ["Image memory limit with eviction versus unlimited storage: a limit protects the machine, but evicted images disappear from scrollback.", "Image attached to cells versus floating over the grid: attached images move with text, but complicate reflow and selection."],
    p: ["Unbounded image data from a hostile program exhausts memory because decoded size was never checked against a limit.", "Images stay on screen after the text under them is erased, leaving ghost pictures."],
    v: "Display an image, scroll it halfway off the screen and clear the line beneath, and confirm it is clipped correctly, scrolls with the text and disappears once its cells are erased.",
    dep: ["escape-state-machine", "scrollback-buffer", "glyph-cache", "compositing-and-frame-pacing"]
  },
  "cell-grid": {
    s: "The rows-by-columns array of cells holding a character, its attributes and flags for wide characters and wraps, which is the emulator's model of what is on screen.",
    d: "Each cell stores a code point or a reference to a grapheme string, foreground and background colors, style flags and a width marker. The second half of a wide character is a spacer cell. Each row carries flags, notably whether it soft-wrapped into the next. Rows are often stored as a ring or linked structure so scrolling moves a pointer rather than copying cells. The difficulty is size and speed: millions of cells live in scrollback, so cell layout, string interning for rare clusters and row sharing determine memory and scroll performance.",
    k: ["Fixed-size cells with side storage for clusters versus variable cells: fixed cells give fast indexing and compact memory, but rare long clusters need an indirection.", "Rows as an array versus a ring buffer: a ring scrolls without copying, but complicates indexing and resizing."],
    p: ["A wide character overwritten on one half leaves an orphaned spacer cell that renders as a gap or garbage.", "Storing full attributes per cell makes scrollback tens of times larger than the text it holds."],
    v: "Print a wide character, overwrite its right half with ASCII, and confirm both cells become consistent (the original is blanked, not half drawn), and that a snapshot dump shows no orphaned spacer.",
    dep: ["cell-attributes", "unicode-width"]
  },
  "cell-attributes": {
    s: "The per-cell style state: foreground and background colors, bold, italic, underline styles, inverse, blink, strikethrough and hyperlink identity, set by graphic rendition sequences.",
    d: "Selecting graphic rendition sets a current pen that is stamped onto every subsequently printed cell, and also used when erasing and scrolling to fill blank cells. Colors can be default, palette indexes or direct color values. Underline can be styled and colored separately. Attributes are often deduplicated into a table so cells store a small identifier. It is hard because the many combinations multiply storage, because erase operations must use the current background, and because rendering has to resolve inverse, faint and bold-as-bright rules consistently.",
    k: ["Interning style combinations in a table versus embedding in each cell: a table shrinks cells and speeds comparison, but needs reference counting or garbage collection.", "Bold selects bright colors versus bold selects a heavier font: bright colors keep one font face, but conflict with direct color values."],
    p: ["Erased lines show the default background instead of the pen's background, producing visible stripes in programs that paint a colored area.", "Style table entries are never released and grow without limit when a program cycles through unique colors."],
    v: "Set a background color, clear the screen with an erase sequence, and confirm every cell reports that background; then print a thousand unique colors and confirm the style table stays bounded.",
    dep: ["csi-dispatch", "color-models"]
  },
  "cursor-and-margins": {
    s: "The cursor position, saved cursor state, top and bottom scroll margins, left and right margins and origin mode, which together define where text lands and what scrolls.",
    d: "The cursor has row, column, a pending-wrap flag and style. Scroll margins restrict which rows move when output passes the bottom, letting a program keep a status line fixed. Origin mode makes cursor addressing relative to the margins. Save and restore store position, attributes and some modes. The pending-wrap flag means that printing in the last column does not wrap until another printable arrives. It is hard because these rules interact: wide characters, insert mode and margins all alter the rule for when and where a line scrolls.",
    k: ["Deferred wrap at the last column versus immediate wrap: deferred matches the specification and avoids blank lines after full-width output, but surprises implementers.", "Supporting left and right margins versus top and bottom only: horizontal margins enable column scrolling, but multiply edge cases in every editing operation."],
    p: ["Ignoring the pending-wrap flag causes a full-width line followed by newline to leave an extra blank line.", "Restoring the cursor without its attributes and modes leaves later output with the wrong style."],
    v: "Set margins to rows five through ten, print twenty lines inside them, and confirm only those rows scroll while the rest stay fixed; then print exactly one full-width line and confirm no extra blank row appears.",
    dep: ["cell-grid", "control-characters"]
  },
  "scrollback-buffer": {
    s: "Stores lines that scrolled off the top of the primary screen so the person can scroll back, search and select them, up to a configured size.",
    d: "As the primary screen scrolls, the top row moves into a history ring with its wrap flag. Viewing scrollback is a viewport offset into the combined history and screen; new output either snaps the view to the bottom or leaves it in place. The alternate screen normally keeps no history. Limits are by lines or bytes, and old rows are discarded, which invalidates selections and image anchors. It is hard because memory use scales with history length times width, resizing must reflow the stored rows, and the viewport must stay on the same text while output arrives.",
    k: ["Unlimited history versus a fixed limit: unlimited loses nothing, but a single runaway program can consume all memory.", "Compressing old rows versus storing cells directly: compression saves memory, but makes search and reflow slower and more complex."],
    p: ["A command that prints gigabytes evicts the lines the person wanted to read, and nothing warns that history was discarded.", "The viewport jumps to the bottom on every output line, making it impossible to read history during a build."],
    v: "Print twice the history limit in numbered lines, scroll to the top and confirm the oldest retained line number equals total minus limit, and confirm scrolled position holds while more output arrives.",
    dep: ["cell-grid", "line-wrap-and-reflow"]
  },
  "alternate-screen": {
    s: "A second, separate grid that full-screen programs switch to and leave, so the shell's screen and scrollback return untouched when the program exits.",
    d: "A mode sequence switches to a blank alternate grid, optionally saving the cursor, and the reverse switch restores the primary grid exactly. The alternate grid has no scrollback and its size always equals the window. Terminals commonly translate wheel events into arrow keys while it is active so that pagers scroll. It is hard because programs that crash leave the terminal on the alternate screen, because resizing affects both grids differently, and because copying output while a full-screen program runs gives text that is not kept in history.",
    k: ["Separate grid with no history versus drawing in the primary screen: separate grids protect the shell's output, but programs' output is lost when they exit.", "Wheel as arrow keys versus no wheel handling: arrow keys give pagers scrolling for free, but misbehave in programs that do not expect them."],
    p: ["A program is killed while on the alternate screen and the shell prompt appears on a blank screen with scrollback hidden.", "Clearing the screen on switch erases the shell's visible output because the mode saved nothing."],
    v: "Print marker lines in the shell, start and quit a full-screen editor, and confirm the markers, cursor and attributes are restored exactly and scrollback is unchanged.",
    dep: ["cell-grid", "terminal-modes", "scrollback-buffer"]
  },
  "line-wrap-and-reflow": {
    s: "Tracks which rows were broken by automatic wrapping rather than a newline, so text can be rejoined into logical lines when the width changes or text is copied.",
    d: "When printing wraps at the last column, the emulator marks the previous row as soft-wrapped. A hard newline does not. On resize, the emulator joins rows along soft wraps into logical lines, then splits them again at the new width, adjusting the cursor and saved positions. Wide characters that no longer fit move to the next row. It is hard because full-screen programs manage their own layout and break under reflow, the cursor position must map through the transformation, and long lines make reflow cost proportional to history size.",
    k: ["Reflowing on resize versus truncating or padding: reflow keeps text readable at any width, but is expensive and wrong for programs that redraw themselves.", "Reflowing the primary screen only versus both grids: the alternate screen is redrawn by its program, so reflowing it wastes work."],
    p: ["Reflow of a prompt line moves the cursor to the wrong cell, so the line editor's idea of the cursor no longer matches the screen.", "Joining rows that were never wrapped, such as a table, scrambles output after a width change."],
    v: "Print a long unbroken line at width eighty, shrink to forty and widen again, and confirm the text rejoins into one logical line with the cursor still after the last character and hard breaks intact.",
    dep: ["cell-grid", "scrollback-buffer", "unicode-width"]
  },
  "resize-handling": {
    s: "Applies a new window size to the emulator and informs the program through the pseudo-terminal, reconciling grid dimensions, scrollback, cursor and any in-flight output.",
    d: "On a window change the terminal computes rows and columns from pixel size and cell metrics, resizes the grid and scrollback (reflowing where appropriate), clamps the cursor and margins, and sets the size on the pty, which signals the foreground process group. Programs then query the size and redraw. Dragging produces a rapid series of sizes, so terminals coalesce them. It is hard because the emulator's size and the program's idea must agree: output written before the program saw the signal assumes the old size.",
    k: ["Resizing immediately on every event versus debouncing: immediate feels responsive, but triggers repeated reflow and program redraws.", "Updating the grid before versus after notifying the program: grid first avoids drawing outside bounds, but briefly shows old layout at the new size."],
    p: ["Resizing while a program is mid-redraw leaves half the screen painted at the old width, since output was in flight.", "Size reported in pixels is zero or stale, so programs that use it to place graphics draw at the wrong scale."],
    v: "Resize a window repeatedly while a full-screen program runs, and confirm the program's reported size equals the emulator's final size and the screen repaints completely without leftover fragments.",
    dep: ["cell-grid", "line-wrap-and-reflow", "window-size-notification"]
  },
  "damage-tracking": {
    s: "Records which cells or rows changed since the last frame so that rendering can redraw only those regions and avoid repainting the whole grid each time.",
    d: "Every mutation marks a dirty range: a row span for printed text, whole rows for scrolls and erases. A scroll may be recorded as a shift rather than damage to every row, letting the renderer copy pixels. At frame time the renderer consumes the damage, draws the affected cells and clears it. Selection, cursor blink and hyperlink hover add damage not caused by output. It is hard because missing damage leaves stale pixels, too coarse damage wastes power, and the information must be shared safely between the emulator thread and the render thread.",
    k: ["Row-level damage versus cell-level spans: rows are cheap to track and good enough for most output, but wide rows waste redraw for a changed character.", "Tracking scroll as a shift versus redrawing: shifts cut GPU work during scrolling, but need exact offsets and fall back whenever anything else changes."],
    p: ["A change made by a rarely used code path forgets to mark damage, leaving stale characters until something else repaints.", "Damage accumulated while the window was hidden is lost, and the first visible frame shows old content."],
    v: "Enable a debug mode that flashes redrawn regions, print one character and one scroll, and confirm only that cell and the shifted band are redrawn, with a forced full repaint producing identical pixels.",
    dep: ["cell-grid", "compositing-and-frame-pacing"]
  },
});
