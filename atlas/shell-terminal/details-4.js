// Details for the shell & terminal plate, part 4: interactive shell features, parsing and expansion.
ATLAS.details("shell-terminal", {
  "line-editor": {
    s: "The in-shell component that reads keystrokes in raw mode, maintains an editable buffer with a cursor, and redraws the line on screen as it changes.",
    d: "The editor switches the terminal to raw mode, reads bytes, decodes key sequences, and applies editing commands to a buffer: insert, delete, move by character or word, kill and yank. After each change it redraws, computing the minimal escape sequences to update the display given the prompt width, wrapped lines and wide characters. On submit it restores the saved terminal settings and returns the line. It is hard because it must predict what the terminal shows without reading the screen, so a wrong width assumption leaves the visible line and the buffer out of sync.",
    k: ["Own editor in the shell versus a shared library: an integrated editor can use shell state for highlighting and completion, but duplicates logic that a library gives for free.", "Redrawing the whole line versus minimal updates: full redraw is simple and robust, but flickers and is slow over high-latency links."],
    p: ["A prompt with invisible characters counted as visible makes the editor compute wrong line lengths, so long lines wrap onto themselves.", "The shell crashes while in raw mode and leaves the terminal unusable for the next program."],
    v: "Type a line longer than the terminal width containing wide characters, move the cursor to the middle, edit it, and confirm the visible text, cursor position and returned string all agree.",
    dep: ["termios-modes", "key-encoding", "unicode-width", "keymaps-and-editing-modes"]
  },
  "keymaps-and-editing-modes": {
    s: "The tables binding key sequences to editing commands, in modeless or modal styles, which people rebind to match habits from other editors.",
    d: "A keymap maps a sequence of keys (possibly multi-key chords) to a named editing function. Modeless maps bind control and alt combinations; modal maps provide insert and command states with motions and operators. Users override bindings in a configuration file and can bind keys to shell commands. The editor must match the terminal's key encodings, including multi-byte sequences and a timeout that separates a lone escape from the start of a sequence. It is hard because keys arrive as ambiguous bytes, and modes need counts, repeats and undo that behave like a full editor.",
    k: ["Modal and modeless maps both supported versus one: both serve more people, but double the testing and complicate shared commands such as undo.", "Short escape-timeout versus long: short feels responsive in modal editing, but breaks multi-byte sequences over slow links."],
    p: ["The escape timeout is too short over a slow connection, so arrow keys are interpreted as escape followed by letters.", "A rebound key conflicts with the terminal's own shortcut, so the binding never fires."],
    v: "Bind a custom key to a command, then in both modal and modeless setups run a word-motion, a delete and an undo, and confirm the buffer contents match the expected editing result.",
    dep: ["line-editor", "key-encoding"]
  },
  "history-store": {
    s: "Persists previously entered commands, with optional timestamps, deduplication and limits, and supports recall by position, prefix and incremental search.",
    d: "Entries are kept in memory during a session and written to a file at exit or after each command. Several concurrent shells either append and merge, or overwrite each other. Recall walks the list by arrow keys, by prefix, or through incremental reverse search. Options control duplicate and leading-space handling, size limits and timestamp storage. It is hard because concurrent sessions race on the file, multi-line commands need an encoding that survives line-based storage, and history can capture secrets typed on the command line.",
    k: ["Merging history across live shells versus per-session isolation: merging helps recall everywhere, but makes up-arrow show commands from unrelated sessions.", "Writing after each command versus at exit: immediate writes survive crashes, but increase file contention and I/O."],
    p: ["Two shells exiting at once overwrite each other, losing a session's commands.", "A password typed as a command argument is saved permanently in a file readable by backups."],
    v: "Run commands in two shells at once, exit both, start a third, and confirm that the history contains every command from both sessions with timestamps and no duplicated lines.",
    dep: ["line-editor", "file-descriptors"]
  },
  "history-expansion": {
    s: "Textual substitutions applied to the typed line before parsing, which replace designators such as the previous command or its arguments with earlier text.",
    d: "Special characters introduce event designators (last command, command number, prefix match), word designators (nth argument, last argument) and modifiers (substitute, strip path). The shell scans the line for them outside single quotes, replaces them from the history list, and shows the result before running. A quick-substitution form edits the last command. It is hard because expansion runs before parsing and has its own quoting rules, so a stray exclamation mark in text breaks commands, and expansion is typically disabled in scripts.",
    k: ["Enabled by default in interactive shells versus off: on gives fast recall, but surprises people typing punctuation.", "Expanding at submit versus live preview in the editor: preview avoids surprises, but needs the editor to understand the syntax."],
    p: ["A message in double quotes containing an exclamation mark expands to an old command and the wrong text runs.", "Expansion with an unknown event aborts the line with an error but still records the unexpanded text."],
    v: "Run a command, then enter a line using the previous command's last argument and a prefix match, and confirm the echoed expansion matches the earlier text before it executes.",
    dep: ["history-store", "quoting-rules"]
  },
  "completion-engine": {
    s: "Proposes ways to finish the word under the cursor, using context such as command position, option and argument type, and presents or inserts the common prefix.",
    d: "On a completion key the engine determines the cursor's context by parsing the partial line, selects a source (command names, files, variables, hosts, options), generates candidates, filters by the typed prefix, and inserts the longest common prefix or shows a list or menu. Candidates may carry descriptions and groups. Generators can call external programs or functions. It is hard because candidates may be expensive to generate, parsing a half-typed line needs quoting-aware recovery, and slow sources must not freeze the prompt.",
    k: ["Synchronous generation versus asynchronous with partial results: synchronous is simple and predictable, but a slow network lookup blocks typing.", "Prefix matching versus fuzzy matching: prefix is predictable and cheap, but fuzzy finds items with less typing at the cost of surprising order."],
    p: ["Completing a path on an unresponsive network filesystem hangs the shell prompt.", "A candidate with spaces or special characters is inserted unquoted and the resulting command is wrong."],
    v: "Complete a command name, an option, and a path containing a space, and confirm each yields the right candidate set, the space is escaped in the inserted text, and the prompt stays responsive.",
    dep: ["line-editor", "lexer", "completion-specs", "globbing"]
  },
  "completion-specs": {
    s: "Declarative or programmable descriptions, registered per command, that tell the completion engine what arguments, options and values a command accepts.",
    d: "A spec binds a command name to a generator: a static word list, a file filter, or a function that inspects the words typed so far and returns candidates. Specs for large tools describe subcommands, options with arguments, and mutually exclusive flags, often shipped with the tool or generated from its help text. Lookup happens when completion starts, loaded lazily by command name. It is hard because specs drift from the tools they describe, generated specs can be wrong, and a spec function runs arbitrary code in the user's shell.",
    k: ["Static declarative specs versus executable functions: declarative specs are fast and safe to load, but cannot express dynamic values such as branch names.", "Eager loading of all specs versus lazy loading: eager makes completion instant, but slows shell startup considerably."],
    p: ["A spec written for an old version of a tool offers options that no longer exist and misses new ones.", "An eagerly loaded spec set adds hundreds of milliseconds to every shell startup."],
    v: "Register a spec with a subcommand and an option taking a file, and confirm completion offers the subcommands first, the option after it, and filenames only after that option, with startup time unchanged.",
    dep: ["completion-engine", "functions", "script-execution"]
  },
  "prompt-rendering": {
    s: "Builds the text shown before each command, from templates or functions that insert the directory, version-control state, exit status and time, and handles width and escapes correctly.",
    d: "Before reading each command the shell expands the prompt template or calls a function. Dynamic parts use command substitution or built-in escapes, so slow lookups delay every prompt. Color sequences must be marked as zero-width so the line editor measures correctly. Many prompts also emit marks and directory reports for the terminal, and a right-aligned segment needs the terminal width. It is hard because the prompt is on the critical path of typing, and expensive probes such as repository status need caching or asynchronous updates.",
    k: ["Synchronous expansion each time versus asynchronous segments: synchronous is simple, but slow status checks make every command feel laggy.", "Prompt as a template string versus a function: templates are easy to write, but functions can compute layout and handle errors."],
    p: ["Unmarked color escapes are counted as visible width, and editing a long command overwrites the prompt.", "A repository status check in a huge directory adds seconds before each prompt appears."],
    v: "Set a prompt with colors, a directory, the last exit status and a right-aligned time, run a failing command in a deep directory, and confirm correct alignment and the status shown within a frame.",
    dep: ["line-editor", "shell-variables", "command-substitution", "osc-handlers"]
  },
  "startup-files": {
    s: "The files a shell reads when it starts, chosen by whether it is a login shell, interactive, or run as a script, which set up the environment, aliases, functions and the prompt.",
    d: "On start the shell decides its type from how it was invoked and its terminal state, and sources an ordered set of system-wide and per-user files. Login shells usually read a profile once per session to set the environment; interactive non-login shells read a separate rc file for aliases and the prompt; scripts read little or nothing unless asked. Environment variables are inherited by children, so the profile suffices for them, while functions and aliases are not. It is hard because the rules are intricate, differ between shells, and make slow files tax every new terminal.",
    k: ["Environment in login files versus interactive files: login files run once and are inherited, but graphical sessions often never run them.", "Large startup file versus lazy loading: eager loading is simple, but each tab startup pays for everything."],
    p: ["Environment set only in an interactive file is missing in scripts and in programs launched from the desktop.", "Output printed by a startup file breaks remote copy tools that expect a silent shell."],
    v: "Start the shell as login, interactive non-login and non-interactive, tracing file reads, and confirm each reads exactly the files documented for that type, with startup time under a target such as 100 milliseconds.",
    dep: ["shell-variables", "environment-export", "script-execution", "functions"]
  },
  "lexer": {
    s: "Splits the input into tokens: words, operators and newlines, recognizing quotes, escapes, comments and nested constructs while remembering the characters that quoted them.",
    d: "The lexer reads characters and groups them into words delimited by whitespace and operator characters. Quotes and backslashes remove the special meaning of what they enclose, and substitution forms such as dollar-parentheses nest, requiring the lexer to track depth and recurse. Operators such as pipe, ampersand and redirection are recognized longest-match. Whether a word is a keyword depends on its position, so the parser feeds context back. It is hard because quote and nesting rules interact, and tokens must keep their quoting information for later expansion.",
    k: ["Lexer that tracks parser context versus context-free tokens: context-aware handles keywords and aliases correctly, but couples lexer and parser.", "Retaining original quoting in each token versus stripping it early: retention enables correct expansion, but makes tokens heavier."],
    p: ["A lexer that strips quotes too early cannot tell that a quoted glob character should stay literal.", "A nested substitution containing an unmatched quote makes the lexer mis-find where the outer construct ends."],
    v: "Tokenize a line mixing single quotes, double quotes with nested substitutions, escaped spaces and a comment, and confirm the token list and each token's quoting flags match the specified grammar.",
    dep: ["quoting-rules", "byte-decoder", "locale-and-encoding"]
  },
  "quoting-rules": {
    s: "The three ways to remove special meaning, backslash, single quotes and double quotes, each with different rules for which expansions still occur inside.",
    d: "A backslash escapes the next character. Single quotes preserve everything literally. Double quotes allow parameter, command and arithmetic expansion but suppress word splitting and globbing of the results. Special forms add ANSI-style escapes or locale translation. Quote removal is the last expansion step, after which the markings are gone. The rules matter for security as much as for correctness. It is hard because quoting is easy to get wrong in generated commands, and variables containing spaces or glob characters behave differently quoted and unquoted.",
    k: ["Splitting unquoted expansions on whitespace versus never splitting: splitting preserves the original model, but is the largest source of scripting bugs.", "Supporting several quoting styles versus one: more styles express more, but increase the cases a lexer and a script author must know."],
    p: ["An unquoted variable containing a space becomes two arguments and deletes the wrong files.", "A filename starting with a dash is read as an option because quoting does not prevent option parsing."],
    v: "Run a command with a variable containing spaces and glob characters, quoted and unquoted, and confirm the argument count and values seen by the program match the documented outcomes in each case.",
    dep: ["lexer"]
  },
  "grammar-parser": {
    s: "Recognizes the command grammar: simple commands, pipelines, lists, conditionals, loops, groups and function definitions, producing structured commands from the token stream.",
    d: "A recursive-descent or table-driven parser reads tokens by precedence: simple commands join into pipelines, pipelines into and-or lists, and lists into sequences separated by semicolons, ampersands or newlines. Compound commands begin with reserved words that are recognized only in command position. Assignments, redirections and words can interleave in a simple command. Parsing must be incremental for interactive use. It is hard because the grammar was grown rather than designed, so the standard contains many special cases, and error messages must help despite ambiguity.",
    k: ["Hand-written recursive descent versus a generated parser: hand-written code handles the contextual quirks and gives better errors, but is longer and easy to drift from the specification.", "Parsing a whole script first versus one command at a time: whole-file parsing catches syntax errors before anything runs, but breaks scripts that change aliases or syntax as they go."],
    p: ["A syntax error in the last line of a script is only reported after earlier lines have already run.", "A reserved word used as an argument is mis-parsed as the start of a compound command."],
    v: "Parse a corpus of valid and invalid commands and confirm valid ones yield trees matching the expected shapes, and each invalid one reports a line number and the token where parsing failed.",
    dep: ["lexer", "syntax-tree", "alias-expansion"]
  },
  "here-documents": {
    s: "Lets a command read multi-line literal input embedded in the script, bounded by a delimiter word, with optional expansion inside and indentation stripping.",
    d: "After an operator and a delimiter word, the body lines up to the delimiter become the command's standard input. If the delimiter is quoted, the body is literal; otherwise it undergoes parameter, command and arithmetic expansion. The lexer must defer reading the body until the end of the current line, since further tokens may follow the operator, and several documents can start on one line. The shell provides the body through a temporary file or a pipe. It is hard because body reading interrupts the normal token flow, and large bodies through pipes can deadlock.",
    k: ["Temporary file versus pipe for the body: a file has no size limit on writes, but needs cleanup and a writable location; a pipe needs a writer to avoid blocking.", "Expanding unquoted bodies versus always literal: expansion allows templating, but surprises people embedding dollar signs."],
    p: ["A body larger than the pipe buffer, written by the shell before forking, deadlocks the shell.", "A delimiter with trailing whitespace on its line is not recognized and the document runs to end of file."],
    v: "Run a command with two here-documents on one line, one quoted and one not, and confirm each body reaches the right file descriptor, with expansion happening only in the unquoted one.",
    dep: ["lexer", "redirection", "file-descriptors"]
  },
  "syntax-tree": {
    s: "The in-memory structure produced by the parser: command nodes holding words with quoting marks, redirections, assignments and nested compound commands, which the evaluator walks.",
    d: "Nodes represent simple commands with ordered words and redirections, pipelines, lists with their separators, conditionals, loops, groups and function definitions. Words remain as unexpanded fragments tagged with their quoting, because expansion happens at execution time, not parse time. The tree is evaluated repeatedly for loops and functions, so nodes are often reference counted or shared. It is hard because the tree must preserve enough source information for correct expansion order, error messages, and for printing functions back out faithfully.",
    k: ["Evaluating the tree directly versus compiling to a lower-level form: direct evaluation is simple and fits shell semantics, but is slower in tight loops.", "Keeping source text positions versus dropping them: positions give accurate errors and tracing, but add memory to every node."],
    p: ["A function body stored with expanded words changes meaning when variables change later.", "A tree shared between a function and its call site is mutated during execution, corrupting later calls."],
    v: "Define a function containing quoting and a redirection, print it back, and confirm the printed text parses to an identical tree and behaves the same when executed.",
    dep: ["grammar-parser"]
  },
  "incomplete-input": {
    s: "Detects that a line is syntactically unfinished, such as an open quote, a trailing backslash or an unclosed block, so the shell can prompt for a continuation instead of failing.",
    d: "The parser reports a distinct 'need more input' result when it reaches the end of the buffer inside a quote, a compound command, a here-document body or after a trailing operator. In interactive mode the shell shows a secondary prompt and appends the next line; in a script it keeps reading. The editor also uses the check to decide whether pressing enter submits or inserts a newline. It is hard because it must distinguish truly incomplete from truly invalid input, and multi-line commands need to be stored in history as units.",
    k: ["Parser signalling incompleteness versus a separate pre-scan: the parser knows the exact state, but a pre-scan lets the editor decide without a full parse.", "Storing continuations as separate history lines versus one entry: one entry recalls the whole command, but needs an encoding in the history file."],
    p: ["An unmatched quote in a pasted block makes every following line a continuation, and nothing runs.", "A trailing operator at end of input is judged invalid rather than incomplete, so multi-line pipelines cannot be typed."],
    v: "Type a command with an open quote and a block opened but unclosed, and confirm a continuation prompt appears each time, the completed command runs once, and history recalls it as one entry.",
    dep: ["grammar-parser", "line-editor", "history-store"]
  },
  "alias-expansion": {
    s: "Replaces the first word of a command with a stored text before parsing continues, allowing short names for longer commands, within limits that prevent recursion.",
    d: "When the first word of a simple command matches an alias name, the shell replaces it with the alias value and re-lexes the result, possibly expanding another alias in the new first position, with a guard against re-expanding the same name. A trailing space in the value marks the next word as also eligible. Aliases apply only in interactive shells by default, and are read when a line is parsed, not when run. It is hard because alias text acts on syntax, not values, so aliases cannot take arguments in the middle and differ from functions.",
    k: ["Aliases for short renames versus functions for logic: aliases are trivial and cheap, but cannot handle arguments and apply at parse time.", "Disabled in scripts versus enabled: disabling keeps scripts portable and safe, but surprises people who test snippets interactively."],
    p: ["An alias defined and used on the same line does not take effect because the line was already parsed.", "An alias shadows a command inside a function when the function is defined while the alias exists."],
    v: "Define an alias for a command with options and another with a trailing space, then run both, and confirm the expansion happens in the first word and the following word respectively but not inside a script.",
    dep: ["lexer", "grammar-parser"]
  },
  "brace-expansion": {
    s: "Generates multiple words from a pattern with braces, such as lists and numeric or letter ranges, before any other expansion and without consulting the filesystem.",
    d: "A word containing a comma-separated list or a range in braces expands into one word per element, with any prefix and suffix attached, and nested or adjacent braces yield the product. It happens first, so a variable inside braces is expanded only afterward, and results are not checked against existing files. Ranges can have steps and zero padding. It is hard because the rules for what counts as a valid brace pattern are subtle, quoting disables it, and the order guarantees surprise people who expect variables to take part in ranges.",
    k: ["Expanding before variables versus after: before is simple and fast, but makes ranges from variable bounds impossible without extra evaluation.", "Supporting ranges versus lists only: ranges cut typing, but add rules for padding, direction and steps that differ between shells."],
    p: ["A range with variable endpoints is not expanded, because variables are resolved after braces.", "An enormous range produces millions of words and exhausts memory before the command starts."],
    v: "Expand a nested list, a numeric range with padding, and a range using variables, and confirm the first two produce the documented word lists and the variable case remains literal.",
    dep: ["lexer", "quoting-rules"]
  },
  "tilde-expansion": {
    s: "Replaces a leading tilde, optionally followed by a user name, with a home directory path, and handles the working directory shortcuts in variable-like forms.",
    d: "A word starting with an unquoted tilde expands the prefix up to the first slash: alone it uses the home variable, and with a name it looks up that user's home from the account database. Some forms expand to the current or previous working directory. It also applies after the equals sign in assignments and after colons in path-list variables. It is hard because the account lookup may be slow or networked, and because quoting any part of the prefix disables it, which is a common surprise inside double quotes.",
    k: ["Reading home from the environment versus the account database: the environment is fast and overridable, but can be missing or wrong for stripped environments.", "Expanding after colons in assignments versus only at word start: after-colon expansion makes path lists convenient, but is a special case in every expansion routine."],
    p: ["A tilde inside double quotes stays literal and the command operates on a directory literally named with a tilde.", "A user lookup against a slow directory service stalls every command that uses that user's name."],
    v: "Run a command with a leading tilde, a tilde for another user, a quoted tilde, and a path-list assignment, and confirm which words expand and which stay literal according to the rules.",
    dep: ["lexer", "environment-export"]
  },
  "parameter-expansion": {
    s: "Substitutes the value of a variable or special parameter, with operators for defaults, errors on unset values, length, substring, pattern removal and replacement.",
    d: "A dollar sign introduces a name, positional parameter or special parameter, and braces permit operators: use a default if unset or empty, assign a default, fail if unset, strip a prefix or suffix by pattern, take a substring, replace matches, or get the length. Arrays and maps add subscripts and expansion of all elements. Results of unquoted expansion undergo splitting and globbing. It is hard because the operator set is large, the unset-versus-empty distinction is subtle, and quoting determines whether one word or many result.",
    k: ["Rich operators in the shell versus calling external tools: operators avoid forking and are fast, but form a dense syntax that is hard to read.", "Failing on unset variables versus treating them as empty: failing catches typos, but breaks scripts relying on empty defaults."],
    p: ["An unset variable inside a recursive deletion path expands to empty and deletes the root of the project.", "A pattern-removal operator uses glob rules, not regular expressions, and removes more or less than expected."],
    v: "Expand a set, an empty and an unset variable using default, error and length operators, and confirm the results and the exit status for the error operator match the documented table.",
    dep: ["shell-variables", "quoting-rules", "arrays-and-maps", "globbing"]
  },
  "command-substitution": {
    s: "Runs a command in a subshell and replaces its expression with the command's standard output, with trailing newlines removed, in either backtick or dollar-parenthesis form.",
    d: "The shell forks a subshell with its output connected to a pipe, runs the nested command, reads all output, strips trailing newlines and substitutes the text. The result then undergoes splitting and globbing unless quoted. The parenthesis form nests cleanly and follows normal quoting rules inside; the backtick form needs extra escaping. The exit status is available for plain assignments. It is hard because output is read fully into memory, errors inside do not stop the outer command by default, and nulls cannot be represented.",
    k: ["Parenthesis form versus backticks: parentheses nest and quote predictably, but older scripts and some shells only understand backticks.", "Capturing output into memory versus streaming through a pipe: capturing fits expansion semantics, but large output wastes memory and delays the command."],
    p: ["A failing inner command in a substitution inside a larger command is ignored, and the outer command runs with empty input.", "Output containing a trailing blank line loses it silently, which matters when the exact text is needed."],
    v: "Capture the output of a command printing three lines with trailing blank lines, in quotes and without, and confirm trailing newlines are removed and the quoted form yields one argument.",
    dep: ["subshells", "pipelines", "quoting-rules", "word-splitting"]
  },
  "arithmetic-expansion": {
    s: "Evaluates an integer expression inside a special form and substitutes the result, supporting variables, the usual operators, bases and assignment operators.",
    d: "The text inside the form is first expanded for variables and substitutions, then parsed with conventional operator precedence and evaluated using fixed-width signed integers. Variable names can appear without a dollar sign, and assignment, increment and ternary operators have side effects. Numbers can use hexadecimal, octal or an arbitrary base. A separate command and a for-loop form evaluate the same grammar. It is hard because overflow wraps silently, leading zeros mean octal, and floating point is unsupported, so scripts shell out for it.",
    k: ["Fixed-width integers only versus supporting floats: integers are fast and portable, but force external tools for fractions.", "Allowing side effects in expressions versus pure evaluation: side effects allow compact loops, but make evaluation order matter."],
    p: ["A value with a leading zero such as a padded date field is parsed as octal, producing an error or wrong number.", "An overflow wraps around to a negative number with no error, corrupting a counter."],
    v: "Evaluate expressions with a hexadecimal literal, a padded decimal, an overflow and an assignment operator, and confirm each result matches the specified integer semantics, including the octal interpretation.",
    dep: ["parameter-expansion", "shell-variables"]
  },
  "process-substitution": {
    s: "Presents a command's output or input as a filename, backed by a pipe or special device path, so programs expecting files can read from or write to other commands.",
    d: "The shell creates a pipe, starts the inner command with one end, and substitutes a path that refers to the other end, such as a descriptor path or a named pipe. The outer command opens that path like a file. This lets two command outputs be compared without temporary files. It is hard because the path is not seekable and can be opened only once, the shell does not wait for the inner process by default, and the feature is an extension that portable scripts cannot use.",
    k: ["Descriptor path versus named pipe in the filesystem: a descriptor path leaves nothing behind, but needs support from the system, while a named pipe works anywhere and needs cleanup.", "Waiting for the inner command versus not waiting: waiting gives correct ordering and status, but a program that never reads can deadlock."],
    p: ["A program that seeks within its input fails on the pipe path with a confusing error.", "The inner command's exit status is lost, so a failed producer looks like successful empty input."],
    v: "Compare the output of two commands using a diff tool with process substitution, and confirm the diff runs without temporary files and the outcome matches comparing the same output saved to files.",
    dep: ["pipelines", "file-descriptors", "subshells"]
  },
  "word-splitting": {
    s: "Breaks the results of unquoted expansions into separate words at characters listed in a separator variable, after other expansions and before filename matching.",
    d: "After parameter, command and arithmetic expansions, any result not inside quotes is scanned for separator characters, by default space, tab and newline. Whitespace separators collapse, while other separators produce empty fields. A null separator variable disables splitting. Fields then go to filename expansion. Literal text in the original word is not split. It is hard because the same variable gives different arguments depending on quoting, filenames can contain every separator, and people change the separator variable globally and forget to restore it.",
    k: ["Splitting unquoted expansions versus requiring explicit array syntax: splitting keeps old scripts working, but makes safe code require constant quoting.", "Global separator variable versus a per-expansion setting: a variable is simple, but changing it leaks into unrelated code."],
    p: ["A file named with spaces becomes several arguments, and the script operates on unrelated files.", "A changed separator variable left set after a function causes later commands to split in unexpected places."],
    v: "Expand a variable containing spaces, tabs and newlines unquoted, quoted and with a custom separator, and confirm the argument count seen by a counting program matches the documented result.",
    dep: ["parameter-expansion", "command-substitution", "quoting-rules"]
  },
  "globbing": {
    s: "Matches filename patterns against the filesystem after splitting, replacing a pattern word with the sorted list of matching paths, or leaving it unchanged when nothing matches.",
    d: "Characters such as star, question mark and brackets form a pattern, matched component by component against directory entries, skipping hidden names unless the pattern names the leading dot. Matches are sorted by locale collation. Options add recursive patterns, extended pattern operators, failing on no match, or returning empty. The same matcher also serves case statements and parameter operators. It is hard because the shell expands before the program sees arguments, argument lists have a size limit, and a pattern with no matches behaves differently across shells and options.",
    k: ["Leaving unmatched patterns literal versus failing or expanding to nothing: literal is traditional and forgiving, but hides typos and can create files named with a star.", "Sorting in locale order versus bytewise: locale order matches what people expect, but varies between machines."],
    p: ["A pattern matching too many files exceeds the argument size limit and the command fails with a confusing error.", "A directory containing a file named like an option gets it expanded into the command as a flag."],
    v: "In a directory with hidden files, a file starting with a dash, and no match for another pattern, run each pattern and confirm the matches, ordering and the no-match behavior follow the documented rules.",
    dep: ["quoting-rules", "locale-and-encoding", "file-descriptors"]
  },
});
