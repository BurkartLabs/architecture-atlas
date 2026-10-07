// Details for the code formatter plate, part 3: document IR and line fitting.
ATLAS.details("code-formatter", {
  "doc-builder-api": {
    s: "The small set of functions that style rules use to construct documents, hiding the node representation and giving plugins a stable contract.",
    d: "Rules call builders such as text, concat, group, indent, line and conditional rather than constructing nodes by hand. The API validates arguments, flattens nested sequences, drops empty parts and may intern common nodes such as a single space. It must be small, because every language and plugin depends on it, and expressive enough that no rule needs to inspect or mutate documents after building them. Keeping documents immutable allows sharing one document in several places, such as when a layout is tried in two modes.",
    k: ["Small algebra with composition vs many specialized node types: a small set is easy to print and verify; specialized nodes make rules shorter and the printer larger.", "Immutable documents vs mutable builders: immutable documents can be shared and cached safely; mutation is faster to write and breaks sharing assumptions."],
    p: ["A rule that forgets to wrap a list in a group never breaks it, and a long line results.", "Building the same large subdocument repeatedly in exploring alternatives multiplies memory."],
    v: "Build documents through the API for a sample node, print them in a debug text form, and confirm that the structure matches the expected tree, with empty parts removed and sequences flattened.",
    dep: ["text-primitive", "concat-sequence", "group-node", "line-kinds"]
  },
  "text-primitive": {
    s: "The leaf of every document: a literal string of characters that is emitted as is and whose width is measured but never broken.",
    d: "Identifiers, keywords, punctuation and literals become text nodes. The printer adds each node's display width to the current column. Text must not contain newlines unless explicitly marked, because the column tracker would be wrong; multi-line literals are handled by a separate form that resets the column. Text nodes should contain no trailing whitespace. Wide characters and combining marks make width differ from length, so width is computed by the width tables and often cached on the node.",
    k: ["Width computed on construction vs at print time: construction caches the width and speeds fitting; print-time computing keeps nodes small and repeats the work.", "Newlines in text forbidden vs allowed with a flag: forbidding keeps column math simple; allowing handles literals directly and needs special column logic."],
    p: ["A text node with a hidden newline makes later columns wrong, and lines are broken or kept incorrectly.", "Counting characters instead of display width puts wide characters over the limit."],
    v: "Print a text node containing wide and combining characters at the end of a line and confirm the printer's reported column equals the width a terminal shows for it.",
    dep: ["display-width"]
  },
  "concat-sequence": {
    s: "Joins several documents end to end without adding any space or breaks, forming the glue that builds larger layouts from parts.",
    d: "A concatenation holds an ordered list of child documents. The printer processes the children in sequence, each starting where the previous ended. Builders flatten nested concatenations and omit empty children so the structure stays shallow, which matters for both memory and for the fits check that scans ahead. Because there is no break behavior of its own, a concatenation inherits the mode of its enclosing group. Large generated sequences, for example arrays with thousands of elements, must not recurse deeply during printing.",
    k: ["Flat arrays of children vs binary nesting: arrays are compact and fast to iterate; binary pairs are simple to reason about and create deep chains.", "Flatten at build time vs at print time: build-time flattening costs a copy; print-time flattening repeats work and complicates the fits scan."],
    p: ["Recursive traversal of a very long sequence overflows the stack on large data files.", "Nested empty concatenations leave stray structure that makes group checks think content exists."],
    v: "Build a concatenation of one hundred thousand elements and print it; confirm it completes without stack overflow and that the output equals the elements joined in order.",
    dep: ["text-primitive"]
  },
  "group-node": {
    s: "Marks a region of the document that the printer tries to fit on one line, breaking all of its line breaks together if it does not fit.",
    d: "A group is the unit of choice in the layout. The printer asks whether the whole group, flat, fits in the remaining width up to the next possible break after it. If so, every soft line inside prints as a space or nothing. If not, the group is printed in break mode, and its lines become newlines, while nested groups are decided independently. Groups can carry an identifier so other parts of the document can ask whether it broke. They give outputs their characteristic shape: outer constructs break before inner ones.",
    k: ["All-or-nothing breaking vs break only as many lines as needed: all-or-nothing gives consistent, predictable shapes; partial breaking packs lines tighter and needs fill.", "Look-ahead to the next break vs measure only the group: look-ahead avoids a trailing token overflowing the line; measuring the group alone is simpler and sometimes exceeds the width."],
    p: ["A missing group around a list makes it never break, or always break, regardless of width.", "A group with a forced break inside always breaks, including its ancestors if propagation is on."],
    v: "Print one group at three widths: wide enough for one line, one column short, and very narrow; confirm it is flat in the first case and broken at every line in the others, with nested groups choosing independently.",
    dep: ["line-kinds", "break-propagation", "fits-check"]
  },
  "indent-align": {
    s: "Increases the indentation of the lines inside it by a unit or by a precise number of columns to line up with earlier content.",
    d: "An indent node adds one indentation unit, which is a number of spaces or one tab, to the current indentation for every newline emitted inside it. An align node adds a specific number of columns, used to line up continuation lines under an opening token such as an argument list. The printer keeps indentation as a stack of these contributions, and when tabs are used, aligned columns are emitted as tabs followed by spaces. The two differ in whether the layout should keep working when the indent unit changes.",
    k: ["Indent by unit vs align to a column: units remain tidy when names change length and produce smaller diffs; alignment looks neat and re-indents everything on a rename.", "Tabs for indent and spaces for alignment vs spaces everywhere: the mix honors reader tab width but is easy to corrupt; spaces everywhere are consistent."],
    p: ["Alignment with tabs gives crooked output when the reader's tab width differs from the formatter's assumption.", "Aligned code causes a diff on every line when a function is renamed."],
    v: "Format a call whose argument list wraps, once with indent and once with alignment, then rename the function and confirm the indent version changes one line while the aligned version re-indents each continuation line.",
    dep: ["indent-style", "text-primitive"]
  },
  "line-kinds": {
    s: "The family of break points in a document: soft lines that become a space or nothing when flat, hard lines that always break, and literal lines that skip indentation.",
    d: "A soft line prints as a newline in break mode or as nothing in flat mode. A normal line prints a newline or a space. A hard line is a mandatory newline that also forces its enclosing groups to break. A literal line emits a newline without indentation, used inside text whose whitespace matters. Having these kinds keeps rules declarative: a rule says where breaking is permitted and whether it is optional, and the printer does the choosing. The distinction between soft and normal lines is the most common source of rule mistakes.",
    k: ["Distinct line kinds vs one line with parameters: distinct kinds are easy to read and hard to misuse; parameters are compact and invite invalid combinations.", "Hard lines that force parents to break vs hard lines local to their group: forcing gives the shape people expect around multi-line content, while local effect lets short wrappers stay flat."],
    p: ["A soft line used where a space is needed glues tokens together when the group is flat, changing meaning.", "A literal line inside indentation produces dedented output that the parser reads differently."],
    v: "Print each line kind in flat and break mode and confirm outputs: nothing or newline, space or newline, always newline, and an unindented newline. Confirm the hard line forces the surrounding group to break.",
    dep: ["break-propagation", "indent-align"]
  },
  "conditional-content": {
    s: "Content that is chosen by whether a group broke, such as a trailing comma printed only when elements are on separate lines.",
    d: "A conditional node holds two documents: one for when the referenced group is broken and one for when it is flat. The printer decides the group first and then prints the matching alternative. It encodes rules such as trailing separators, the placement of an opening brace, or extra parentheses that appear only in a particular layout. Because the choice depends on a decision made elsewhere, the printer must process groups before the conditional that reads them, and the fits check must account for each option's width.",
    k: ["Conditional on a named group vs on the enclosing group: naming allows content to depend on a distant group; enclosing is simpler and cannot express every rule.", "Conditionals in documents vs special-casing after printing: documents keep one pass and one source of truth; post-edits are easy to write and fragile."],
    p: ["A conditional counted with the wrong alternative in fits check lets a line overflow by the trailing comma.", "A conditional referencing a group not yet printed uses a stale decision."],
    v: "Format a list that fits on one line and the same list at a narrower width; confirm the trailing separator appears only in the broken version and the line never exceeds the width when the separator is present.",
    dep: ["group-node", "trailing-separators"]
  },
  "fill-node": {
    s: "A list layout that places as many items as fit on each line and wraps the remainder, unlike a group that breaks every item.",
    d: "Used for sequences where density is preferable to one item per line: long runs of text, numbers in arrays, JSX-like children or argument-free lists. A fill alternates content and separator documents. For each pair, the printer checks whether the next content fits on the current line and prints the separator flat or broken accordingly. Fill cannot be expressed with ordinary groups because each separator is decided independently, using a look at only the following content, which can lead to slightly uneven results.",
    k: ["Fill vs one item per line: fill is compact and suits uniform short items; one per line makes diffs smaller and is clearer for complex items.", "Greedy decision per separator vs global optimization: greedy is linear and predictable; global optimization gives neater lines at higher cost and surprising reshuffles."],
    p: ["A fill containing a forced break in one item can leave unexpected short lines.", "Adding one element reflows every following line, producing large diffs in data-heavy files."],
    v: "Format a list of two hundred short numbers at width 80 and confirm each line is filled to near the limit without exceeding it, and that a one-item insertion at the top reflows later lines only as expected.",
    dep: ["group-node", "fill-algorithm", "line-kinds"]
  },
  "line-suffix": {
    s: "Content that is deferred until the end of the current line, used so a trailing comment stays at the end of its line even when code after it is printed.",
    d: "When a comment follows code on the same line, the printer should output the code then the comment, but code that comes later in the document on that line, such as a closing bracket or separator, must go before it. A line suffix holds the comment and flushes it at the next newline. A related boundary node flushes it early. The comment's width is excluded from the fits check of the code, otherwise a trailing comment would force a break that the code does not need.",
    k: ["Defer to end of line vs print in place: deferral keeps trailing comments trailing whatever follows; in-place printing is simple and can move tokens after a line comment, breaking code.", "Exclude suffix width from fitting vs include it: excluding avoids needless breaks; including keeps total line length within the limit."],
    p: ["A line comment printed before a later token on the same line turns that token into commented-out code.", "A suffix never flushed because the file ends loses the comment."],
    v: "Format a call with a trailing line comment on one argument and confirm the comment ends the line, the closing bracket precedes it, and compiling the output gives the same tree as the input.",
    dep: ["comment-printing", "break-propagation"]
  },
  "break-propagation": {
    s: "The pass that marks every group containing a forced break, so enclosing groups break too and the printer never tries to put them on one line.",
    d: "A hard line or a line comment inside a group means that group cannot be flat. Instead of discovering this during printing, a pre-pass walks the document bottom-up and sets a flag on every ancestor group of a forced break. The printer then enters those groups directly in break mode. Propagation makes the printer's fits check simpler and faster, and ensures consistency: an enclosing group cannot be flat around a multi-line child. Some groups opt out, to let a call with one block argument hug.",
    k: ["Propagate to all ancestors vs only to the nearest group: all ancestors gives uniform shapes and is needed for correctness with hard breaks; nearest-only allows hugging layouts and needs care.", "Pre-pass vs lazy discovery in the printer: a pre-pass is linear and simple; lazy discovery avoids a traversal for small documents but repeats the scan in fits."],
    p: ["Forgetting propagation lets the printer pick a flat layout around multi-line content, producing a line that is longer than the limit.", "Over-propagation breaks outer groups for a trivial inner break and makes code needlessly tall."],
    v: "Format a call whose argument contains a hard break and confirm every enclosing group is printed broken, and that the same call with that hard break removed prints on one line.",
    dep: ["group-node", "line-kinds"]
  },
  "width-measure": {
    s: "Computes how many terminal columns a piece of text occupies, accounting for wide characters, combining marks, tabs and zero-width characters.",
    d: "The printer tracks the current column as it emits text. For ASCII, width equals length, so a fast path counts bytes. Otherwise it consults the display width tables for each code point: East Asian wide characters take two columns, combining marks and zero-width joiners take none, and tabs advance to a tab stop. The measurement must agree with the tools people use to view code, but terminals and fonts disagree on some characters, especially emoji sequences, so the choice is a convention.",
    k: ["Table-based display width vs counting code points: tables match terminals for common text; code points are fast and misjudge wide characters, shifting wrapping decisions.", "Fast path for ASCII vs always use the table: the fast path is much quicker on typical code; always using the table is simpler and slower."],
    p: ["Emoji sequences measured as several wide characters make lines wrap much earlier than readers expect.", "Tabs inside text counted as one column make the real width exceed the limit."],
    v: "Format lines mixing ASCII, wide characters, combining marks and emoji against a width-80 limit and confirm that the printed lines measure at most 80 columns in a terminal that follows the same convention.",
    dep: ["display-width", "text-primitive"]
  },
  "fits-check": {
    s: "The look-ahead that decides whether a group, printed flat, fits in the remaining width up to the next point where a line could break.",
    d: "Given the remaining width, the check walks the document in flat mode, subtracting widths, and succeeds if it reaches a possible break or the end before the width runs out. It must continue past the end of the group into the rest content, because trailing tokens such as a closing parenthesis or a semicolon share the line. Encountering a forced break in flat mode counts as fitting up to that point. It is the hottest loop of the printer, so it aborts early and avoids allocation.",
    k: ["Look into the trailing content vs measure only the group: looking ahead avoids overflow from trailing tokens; measuring only the group is cheaper and sometimes exceeds the width.", "Stop at the first possible break vs measure to the end of the line: stopping early is faster and may accept layouts that later force an overflow."],
    p: ["Ignoring the trailing semicolon or bracket lets a line exceed the width by exactly those characters.", "A fits check that scans to the end of the document makes printing quadratic on long lines."],
    v: "Format a statement whose group fits exactly at the limit, then add a trailing token that tips it over; confirm the group breaks only in the second case and every output line is within the width.",
    dep: ["width-measure", "break-mode-stack", "group-node"]
  },
  "printer-loop": {
    s: "The main routine that walks the document with an explicit stack, emitting text and newlines and choosing flat or broken layout for each group.",
    d: "The loop keeps a stack of commands, each pairing a document with an indentation and a mode. It pops a command and acts on its type: emit text and advance the column, push the children of a sequence in reverse, decide a group by calling the fits check, or emit a newline plus indentation. Using an explicit stack rather than recursion avoids overflow on deep documents. It also tracks pending suffixes, trailing whitespace to trim and the position of marked cursors. Everything the user sees in output is the product of this one routine.",
    k: ["Explicit stack vs recursion: an explicit stack handles any depth and permits trimming and look-ahead; recursion is clearer to read and fails on deeply nested input.", "Single pass vs repeated passes with feedback: a single pass is fast and cannot revisit decisions; repeated passes can improve layouts and cost time and predictability."],
    p: ["A command pushed in the wrong order prints children reversed, which is obvious, or interleaves a suffix, which is subtle.", "State carried in module variables breaks when embedded formatting calls the printer recursively."],
    v: "Print a document with deep nesting of fifty thousand levels and confirm no stack overflow, and compare the output with a reference implementation on a corpus to confirm identical text.",
    dep: ["fits-check", "break-mode-stack", "whitespace-trim", "line-suffix", "indent-align"]
  },
  "break-mode-stack": {
    s: "The record of whether each enclosing group was printed flat or broken, consulted by every line and conditional to know how to behave.",
    d: "Each command carries the mode of its enclosing group. A soft line inside a flat group prints nothing, while the same soft line in a broken group prints a newline. When a group is decided, its children are pushed with that mode, so nested groups can override it by making their own decision, unless they were forced to break. Conditional content and group identifiers read the recorded mode of other groups, so decisions are saved in a table keyed by identifier as the printer proceeds.",
    k: ["Mode stored on each command vs mode looked up from a parent chain: storing makes decisions O(1) and uses more memory; lookup is smaller and slower.", "Decisions stored by group identifier vs recomputed on demand: storing is cheap and consistent; recomputation is stateless and may disagree with what was printed."],
    p: ["A flat-mode child inside a broken parent is printed flat when the rule expected it to break, because the mode is inherited incorrectly.", "A conditional reading a group's mode before the printer reaches it sees no decision and defaults wrongly."],
    v: "Print a document where an outer group breaks and an inner one fits; confirm the inner stays flat, and that a conditional keyed to the outer group's identifier prints its broken alternative.",
    dep: ["group-node", "conditional-content"]
  },
  "fill-algorithm": {
    s: "The procedure that lays out a fill, checking at each separator whether the next piece fits on the current line and breaking only when it does not.",
    d: "For each content and separator pair the printer tests whether the content fits flat. If it does, the separator prints flat. Otherwise the separator prints broken. It also checks whether the pair of two contents plus the separator fit, to avoid a state where the first fits but the second would then overflow. This local rule is linear and gives the familiar text-wrapping shape. A content item that is itself a group may break internally if it does not fit even on an empty line.",
    k: ["Greedy line filling vs minimum raggedness: greedy is linear and stable under edits; optimal wrapping makes tidier edges and moves earlier lines when later text changes.", "Test one content at a time vs test pairs: pairs avoid orphaned short tails and double the checks."],
    p: ["An oversize item that cannot fit on any line is left overflowing without a message.", "Greedy filling after a forced break in one item makes odd short lines on both sides."],
    v: "Fill a list of variable-length words at several widths and confirm each line is the maximum number of words that fit and no line exceeds the width, except for a single word longer than the width.",
    dep: ["fill-node", "fits-check"]
  },
  "whitespace-trim": {
    s: "Removes trailing spaces and tabs from each line when a newline is emitted, so indentation written for content that never arrived does not remain.",
    d: "Documents often print indentation immediately after a newline, before knowing whether any text follows, for example when a hard line is followed by another hard line. Rather than complicate the document, the printer trims trailing whitespace on the current output line whenever it emits the next newline and at the end of the output. It must not trim inside literal text where trailing spaces are significant, such as multi-line strings or markup, so trimming applies only to indentation the printer itself produced.",
    k: ["Trim in the printer vs avoid creating the whitespace: trimming is a small, robust safeguard; avoiding it requires every rule to know about neighbors.", "Trim all trailing whitespace vs only generated indentation: all is simple and can corrupt literal content; generated-only is safe and slightly more bookkeeping."],
    p: ["Trimming inside a multi-line literal changes its value and therefore the program.", "Blank lines retain indentation and show up as whitespace noise in diffs."],
    v: "Format code with consecutive blank lines inside a nested block and with a multi-line literal ending in spaces; confirm no generated trailing whitespace remains and the literal's spaces are unchanged.",
    dep: ["text-primitive", "indent-align"]
  },
  "indent-style": {
    s: "The choice between spaces and tabs and the width of one indent level, applied wherever the printer emits indentation.",
    d: "The printer's indentation is a stack of units. With spaces, each unit is a fixed number of spaces. With tabs, each unit is a tab, but width computations use the configured tab width so wrapping stays consistent. Alignment columns are made of spaces after the tabs. The setting changes line fits, since indentation consumes width, so the same code can break differently under different settings. Mixed indentation inside multi-line literals is left alone. The result of this choice reaches every line of every file.",
    k: ["Spaces vs tabs: spaces render the same everywhere and are widely used; tabs let each reader set their width and make alignment fragile.", "Fixed indent width vs configurable: fixed gives uniform output across projects; configurable accommodates existing conventions and multiplies layout cases."],
    p: ["Using tabs but measuring them as one column makes lines look much longer than the limit on screen.", "Switching the indent setting reformats every line in the repository."],
    v: "Format the same file with two spaces, four spaces and tabs at width 4; confirm line breaks differ only where indentation changes the fit, and each output is idempotent.",
    dep: ["width-measure"]
  },
  "line-ending-output": {
    s: "Chooses and applies the newline convention of the output, either preserving what the file used or converting to a configured one.",
    d: "The printer emits a neutral newline and a final stage rewrites it to the target convention. The default is to detect the file's dominant ending and keep it, so editing on mixed teams does not produce whole-file diffs. Some projects force one ending in configuration. Files with mixed endings are normalized to one. Multi-line literals and comments are converted too, since leaving a stray carriage return inside would look wrong, but this changes literal text in languages where line endings are significant, which needs a documented rule.",
    k: ["Preserve the detected ending vs force one: preserving avoids diffs when files differ across platforms; forcing gives a uniform repository and changes files on first run.", "Convert inside literals vs leave literals as is: converting yields clean files; leaving preserves values and produces mixed endings."],
    p: ["Version control conversion settings and the formatter fight over endings, and each run shows a whole-file change.", "Converting endings inside a literal alters the string's value on one platform."],
    v: "Format files with LF, CRLF and mixed endings under both policies and confirm the preserve policy keeps each file's dominant ending, the force policy gives only the chosen ending, and a second run changes nothing.",
    dep: ["source-reader", "printer-loop"]
  },
  "optimal-layout-search": {
    s: "The alternative to greedy printing in which several candidate layouts are scored for cost and the best is chosen, instead of taking the first that fits.",
    d: "Greedy group fitting is fast but local: it can pick a layout that forces ugly breaks later. A cost-based printer enumerates layouts for each group, assigns penalties for line count, overflow and awkward breaks, and chooses the cheapest overall using dynamic programming over the document structure. This yields better results for complex expressions at higher computational cost and the need to tune penalties. It also makes the output less predictable to authors, and small edits can pick a quite different layout.",
    k: ["Greedy fitting vs cost-based search: greedy is linear, predictable and easy to explain; cost-based finds tidier layouts and costs time, tuning effort and stability.", "Bounded search vs exhaustive: bounding keeps worst-case time acceptable and may miss the best layout; exhaustive is thorough and can blow up."],
    p: ["A tiny edit flips the chosen layout of a whole expression and makes a noisy diff.", "Penalty weights tuned on one corpus produce odd layouts on code that differs in style."],
    v: "Run both strategies on the corpus and compare time and number of lines over the limit; confirm the search never produces an overflow the greedy printer avoids, and that results are identical across runs.",
    dep: ["fits-check", "group-node"]
  }
});
