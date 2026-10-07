// Details for the shell & terminal plate, part 5: language and state, execution and job control.
ATLAS.details("shell-terminal", {
  "shell-variables": {
    s: "The shell's named string values, with global and function-local scope, attributes such as read-only and integer, and special variables the shell itself maintains.",
    d: "Variables live in a table, usually layered into a global scope and a stack of function scopes. Assignment creates or updates; unset removes. Attributes mark a variable read-only, exported, integer or case-converted. The shell sets special variables such as the last exit status, process ids, the current directory, a line number and a random value. Dynamic scoping means a called function sees its caller's locals. It is hard because scope rules are unusual, variables can hide builtins' behavior (separators, path, prompt), and every value is a string at heart.",
    k: ["Dynamic scope versus lexical scope: dynamic scope is easy to implement and lets helpers see caller state, but makes functions depend on invisible context.", "Variables as strings versus typed values: strings keep the model simple and uniform, but numbers, lists and booleans are conventions, not checks."],
    p: ["A function forgetting to declare a local variable overwrites a caller's variable of the same name.", "Assigning to a variable the shell uses internally, such as the path list, breaks command lookup in unrelated code."],
    v: "Set a variable, call a function that declares it local and another that does not, and confirm the global value changes only through the second, and that a read-only variable rejects assignment.",
    dep: []
  },
  "environment-export": {
    s: "The subset of variables marked for export and passed to every child process as its environment, along with the rules for inheritance, temporary assignments and sanitizing.",
    d: "Exporting marks a variable so that when the shell creates a process it builds the environment block from exported variables and passes it to exec. Children inherit and may modify their copy, but cannot affect the parent. A prefix assignment on a command line applies only to that child. The shell imports its environment at startup. Special variables such as path, home and the locale are conventions all programs read. It is hard because the environment is an unstructured bag of strings that leaks secrets into every child, and changes only propagate downward.",
    k: ["Explicit export versus everything exported: explicit export limits leakage, but forgetting it causes a variable to vanish in children.", "Temporary prefix assignments versus export then restore: prefix assignments scope cleanly to one command, but do not apply to builtins and functions uniformly."],
    p: ["Secrets exported for one command are inherited by every later child, including programs that log their environment.", "A variable set in a child script is expected to appear in the parent shell and never does."],
    v: "Export a variable, run a child that prints and modifies it, and confirm the child sees the value, the parent's value is unchanged, and a prefix assignment is visible only to that one child.",
    dep: ["shell-variables", "process-creation-services"]
  },
  "arrays-and-maps": {
    s: "Variables holding ordered lists or key-value maps, with subscripts, slicing, appending and expansion of all elements as separate words, where the shell supports them.",
    d: "An array assignment stores elements by index; a map stores them by string key. Expansion forms yield all elements as separate words when quoted properly, or as one joined string, and others give indexes or length. Elements can contain any characters except the null byte, which makes arrays the safe way to carry lists of filenames. Many minimal shells omit them and offer only positional parameters. It is hard because the syntax is dense, behavior differs between shells, and arrays cannot be exported to children.",
    k: ["Real arrays versus whitespace-separated strings: arrays preserve elements with spaces, but need syntax and are not portable.", "Sparse indexes versus dense lists: sparse arrays allow gaps and unusual use, but make length and iteration subtle."],
    p: ["Expanding an array with the wrong quoting joins elements into one word, destroying separation.", "Arrays are assumed to be exported but silently disappear in child processes."],
    v: "Store three filenames, one with a space, in an array, pass them quoted to a counting program, and confirm it sees exactly three arguments with the spaced name intact.",
    dep: ["shell-variables", "parameter-expansion"]
  },
  "control-flow": {
    s: "Conditionals, loops and pattern-matching branches that decide what runs next, driven by the exit status of commands rather than boolean values.",
    d: "An if runs a command and branches on its exit status zero or nonzero; loops repeat over a word list, while a condition holds, or until it does; a case matches a word against patterns. Test commands and bracket expressions evaluate file and string conditions. Short-circuit operators chain commands by status, and break and continue exit loops. It is hard because truth is inverted from many languages (zero is success), conditions in the middle of a pipeline have separate statuses, and tests built on strings need careful quoting.",
    k: ["Branching on command status versus on boolean expressions: status unifies commands and tests, but makes every condition an exit code convention.", "Bracket test builtin versus extended test syntax: the builtin is portable, but the extended form handles quoting and patterns more safely."],
    p: ["An unquoted empty variable inside a test collapses an argument and the test errors or silently takes the wrong branch.", "A loop over command output splits on whitespace and iterates over fragments of filenames."],
    v: "Run an if on a command that fails, a while loop over a counter, and a case matching patterns, and confirm each branch is taken according to exit status and pattern order.",
    dep: ["exit-status-and-errexit", "grammar-parser", "globbing"]
  },
  "functions": {
    s: "Named blocks of commands that run in the shell's own process, take positional arguments, return a status, and can define local variables and be exported or traced.",
    d: "A definition stores a syntax tree under a name; a call pushes a new positional-parameter frame and local-variable scope, runs the body, and pops the frame. The return builtin sets the status; output is captured through substitution. Functions take precedence over external commands but not over special builtins, and they can call themselves recursively. It is hard because they cannot return values except through status, output or variables, run in the same process so they can change the shell's state, and error handling is shared with the caller.",
    k: ["Functions in the current shell versus separate processes: in-process is fast and can change state, but one bug can alter the whole session.", "Returning data by output versus by named variable: output is simple but costs a subshell, while variables avoid it but couple caller and callee."],
    p: ["A function name matches an existing command and every script calling the command runs the function instead.", "Capturing a function's output with substitution runs it in a subshell, so its variable changes are lost."],
    v: "Define a function that sets a local and a global, call it directly and via substitution, and confirm the global changes only in the direct call and the positional parameters restore afterwards.",
    dep: ["syntax-tree", "shell-variables", "exit-status-and-errexit"]
  },
  "builtins": {
    s: "Commands implemented inside the shell rather than as separate programs, required where they must change the shell's own state or are cheaper to run without a fork.",
    d: "Changing directory, setting variables, exporting, sourcing a file, exiting, setting options and managing jobs must run in the shell process, since a child cannot alter its parent. Others, such as echo, printf and test, are builtins for speed. Lookup tries special builtins first, then functions, then regular builtins, then external programs. Builtins have their own option parsing and error conventions and respect redirections. It is hard because some behave differently from the program of the same name, and special builtins affect error handling.",
    k: ["Builtin versus external program for common utilities: builtins avoid process creation, but their behavior diverges from the standalone tool on edge cases.", "A large builtin set versus a small one: large sets speed scripts and reduce dependencies, but enlarge the shell and the surface that must be kept consistent."],
    p: ["A builtin accepts different flags from the external command of the same name, so a script behaves differently under another shell.", "A redirection on a special builtin that fails exits the whole shell, unlike a regular command."],
    v: "Change directory in a subshell and in the shell itself, and confirm only the direct call changes the shell's directory; then compare a builtin and the external command with the same arguments for equal output.",
    dep: ["command-lookup", "shell-variables", "job-table"]
  },
  "exit-status-and-errexit": {
    s: "The numeric result of every command, its propagation through pipelines and lists, and the options that make the shell stop on failure or on unset variables.",
    d: "Each command yields a status from zero to 255 held in a special parameter; a signal death maps to a value above 128. A pipeline's status is normally that of its last command, with an option to fail if any element fails. An error-exit option stops the shell on an unchecked failure, but is suppressed in conditions, lists and negations. Traps can run on error or exit. It is hard because the exemptions make error-exit behavior unintuitive, and subshell and substitution failures often vanish.",
    k: ["Error-exit option versus explicit status checks: the option is concise, but its suppression rules hide failures, so explicit checks are more reliable and verbose.", "Pipeline status of the last command versus any failure: last-command status is the long-standing rule, but hides failures in earlier stages."],
    p: ["A failing command inside a condition or a list does not trigger error-exit, and the script continues after an actual failure.", "A failed producer in a pipeline is hidden by a successful consumer, so a broken step reports success."],
    v: "Run a script with error-exit enabled containing a failing command, a failing command inside an if, and a failing first stage in a pipeline, and confirm which of the three stops the script.",
    dep: ["pipelines", "child-reaping", "terminal-signals"]
  },
  "script-execution": {
    s: "Running commands from a file, either as a new shell process chosen by an interpreter line or sourced into the current shell, with arguments and option handling.",
    d: "Executing a script file makes the kernel read the first line, find the interpreter, and start it with the file as argument, in a new process with a copy of the environment. Sourcing reads and runs the file in the current shell, so definitions and variable changes persist. Scripts get positional parameters and a status. Options can be set at the top. Non-interactive shells skip editing, history and, by default, aliases. It is hard because behavior depends on which interpreter runs, on the invoking environment, and on options that differ between shells.",
    k: ["Executing as a separate process versus sourcing: a process isolates state, but cannot change the caller; sourcing shares state, but a failure can end the shell.", "Interpreter line naming an absolute path versus searching: absolute paths are predictable, but break on systems with the interpreter elsewhere."],
    p: ["A script written for one shell dialect is run by another and fails in subtle places, not at the first error.", "A script sourced with an unexpected exit call ends the person's interactive shell."],
    v: "Run a script both executed and sourced, with a function and a variable assignment inside, and confirm the definitions and variable exist afterward only in the sourced case.",
    dep: ["grammar-parser", "fork-and-exec", "shell-variables"]
  },
  "command-lookup": {
    s: "Resolves the first word of a command to something to run, trying functions, builtins, then each directory in the search path, with a cache of earlier results.",
    d: "A word containing a slash is used as a path directly. Otherwise the shell checks aliases, functions, special builtins and builtins, then walks the colon-separated directories in the path variable looking for an executable file, remembering the hit in a hash table. Failure reports command not found with a distinct status. Assignments and redirections without a command word take effect without lookup. It is hard because the cache can go stale when files move, relative entries in the path create attack surface, and permissions differ from existence.",
    k: ["Caching resolved paths versus searching each time: caching saves repeated filesystem work, but runs a stale path after an install or move.", "Current directory in the path versus excluded: including it is convenient, but lets a hostile file in a directory shadow a standard command."],
    p: ["After installing a newer version elsewhere in the path, the shell keeps running the old cached location.", "An empty entry in the path list is treated as the current directory and runs a malicious program."],
    v: "Install a command into an earlier path directory after running the old one, and confirm the shell still runs the old path until the cache is cleared, while a type check reports the cached location.",
    dep: ["builtins", "environment-export", "file-descriptors"]
  },
  "fork-and-exec": {
    s: "Creates a child process by duplicating the shell, arranges its descriptors, groups and signals, then replaces its image with the program, or uses a combined spawn call.",
    d: "The shell forks; in the child it applies redirections, sets its process group, resets signal dispositions that the shell had changed, and calls exec with the argument vector and environment. In the parent it records the child's identifier and either waits or tracks it as a job. Spawn interfaces combine these for speed in large processes. A failed exec reports a status in the child, 126 or 127. It is hard because between fork and exec only a restricted set of operations is safe, and mistakes in ordering produce race conditions with job control.",
    k: ["Fork then exec versus a combined spawn: fork gives full control and is traditional, but copying a large address space is costly; spawn is faster but less flexible.", "Setting the process group in both parent and child versus only one: doing both closes a race, but duplicates code paths."],
    p: ["The child inherits descriptors it should not have and keeps pipes open, so a reader never sees end-of-file.", "A race between setting the group in parent and child lets a signal reach the wrong group."],
    v: "Run a command that lists its open descriptors, and confirm only intended ones are present, and that the child's process group and signal dispositions match what the shell should have set.",
    dep: ["process-creation-services", "redirection", "process-groups", "file-descriptors"]
  },
  "pipelines": {
    s: "Connects the output of one command to the input of the next through pipes, running every stage concurrently and reporting a status for the whole chain.",
    d: "The shell creates a pipe between each pair of stages, forks one process per stage with the right descriptors, closes unused ends in the parent and each child, and places all stages in one process group for job control. Stages run concurrently, throttled by pipe buffers. A stage that exits early closes its end, so upstream stages receive a broken-pipe signal. It is hard because forgetting to close one end prevents end-of-file, builtins and compound commands inside pipelines need subshells, and the last stage's environment is lost unless the shell runs it in place.",
    k: ["Running the last stage in the current shell versus a subshell: in the current shell keeps variable changes, but is a nonstandard extension.", "One process group per pipeline versus individual processes: one group lets signals and stops act on the whole job, at the cost of careful group setup."],
    p: ["A pipe end left open in the shell means the consumer waits forever for input that never ends.", "Variables set inside a pipeline stage are lost, because each stage ran in a subshell."],
    v: "Run a three-stage pipeline with a fast producer and a head-style consumer, and confirm the producer is terminated by a broken-pipe signal, all stages exit, and no pipe descriptors remain open in the shell.",
    dep: ["file-descriptors", "fork-and-exec", "process-groups", "subshells"]
  },
  "redirection": {
    s: "Rewires a command's file descriptors to files, other descriptors or here-documents before it runs, processed left to right so order determines the result.",
    d: "Operators open a file for read, write, append or both and bind it to a descriptor number, or duplicate one descriptor onto another, or close it. They are applied in the child between fork and exec, or saved and restored for builtins. Order matters: sending standard error to where standard output points, then redirecting output, differs from the reverse. A clobber guard protects existing files. It is hard because descriptor numbers above nine, saved copies for builtins, and failures partway through need consistent handling.",
    k: ["Left-to-right application versus applying all at once: left-to-right is flexible and lets duplication capture the current target, but is order dependent and confusing.", "Noclobber protection versus unconditional overwrite: protection prevents accidental data loss, but scripts must use an override operator to replace files."],
    p: ["Writing the error redirect before the output redirect sends errors to the terminal rather than the file.", "Redirecting a builtin changes the shell's own descriptors and fails to restore them after an error."],
    v: "Run a command writing to both output and error with the two redirect orderings, and confirm the files contain different content matching the left-to-right rule.",
    dep: ["file-descriptors", "here-documents", "fork-and-exec"]
  },
  "subshells": {
    s: "A child copy of the shell that runs a group of commands with its own variables and directory, used for grouping, substitution, background jobs and pipeline stages.",
    d: "A subshell is created by forking the current shell without exec, so it inherits all variables, functions, options and descriptors, and changes affect only the copy. Parenthesized groups, command substitutions, background commands and non-final pipeline stages all use one. Traps and some options are reset in the copy. Variable changes and directory changes disappear when it ends. It is hard because forking a large shell has a cost, and the isolation surprises people who expect state changes to persist.",
    k: ["Subshell for isolation versus a brace group in the current shell: a subshell gives containment, but costs a fork and hides state changes.", "Inheriting everything versus a clean environment: inheriting is convenient, but carries unexpected state and descriptors into the copy."],
    p: ["A loop fed through a pipe runs in a subshell, so counters set in the loop are zero afterward.", "A subshell inherits a held lock descriptor and keeps the lock after the parent releases it."],
    v: "Change a variable and the working directory inside a parenthesized group and inside a brace group, and confirm only the brace group's changes remain after it finishes.",
    dep: ["fork-and-exec", "shell-variables", "process-creation-services"]
  },
  "process-groups": {
    s: "Collections of processes managed as one unit by the terminal and the shell, so signals, stops and foreground ownership apply to a whole pipeline.",
    d: "Each job gets its own process group, led by its first process. The terminal records one foreground group, and signals generated from the keyboard go to it. The shell hands the terminal to a job by setting the foreground group, waits for it, and takes the terminal back afterward. Background groups that read the terminal are stopped. Both parent and child set the group right after the fork to avoid a race. It is hard because ordering and ownership are subtle, and a crash can leave the terminal owned by a dead group.",
    k: ["Group per job versus group per process: per-job groups make interrupt and stop apply to the whole pipeline, but need explicit terminal handoff.", "Shell restoring the terminal with signal protection versus plain: protection avoids being stopped by the handoff, but needs signal masks set correctly."],
    p: ["The shell fails to take the terminal back when a job is killed and the prompt appears with no input.", "A child outside the job's group is not stopped by suspend and continues running in the background."],
    v: "Run a pipeline, suspend it with the keyboard, and confirm every process stopped and shares one group, the shell regained the terminal and the job resumes in the foreground on request.",
    dep: ["controlling-terminal", "signal-delivery", "fork-and-exec"]
  },
  "job-table": {
    s: "The shell's list of running, stopped and finished jobs, with numbers, states and the commands for bringing a job to the foreground, backgrounding it or waiting on it.",
    d: "Each job record holds its group id, processes, command text and state. Builtins list jobs, move one to the foreground or background, resume a stopped job, send it signals, and wait for it. State changes arrive through child status reports and are announced before the next prompt. Job specifiers refer to a job by number, prefix or current marker. On exit, the shell may warn about stopped jobs and send hangups. It is hard because status updates arrive asynchronously, and reporting must not interleave with the line being edited.",
    k: ["Announcing job changes immediately versus before the next prompt: immediate is timely, but corrupts the line being typed.", "Hanging up jobs on shell exit versus leaving them: hanging up cleans up processes, but kills work the person expected to survive."],
    p: ["A job finishing while the person types interrupts the line and scrambles the display.", "Closing the terminal hangs up background jobs that were meant to keep running."],
    v: "Start a background job, suspend another, list the table, bring one to the foreground and finish it, and confirm job numbers, states and the completion notice appear in the right order.",
    dep: ["process-groups", "child-reaping", "builtins"]
  },
  "child-reaping": {
    s: "Collecting the exit status of finished child processes so the kernel can free their entries, and translating normal exit, signal death and stop into the shell's state.",
    d: "When a child exits, it remains as a zombie until its parent waits. The shell calls wait with flags to report stops and continuations, usually when a child-status signal arrives or while waiting for a foreground job. Each report is matched to a job record and updates its status and the last-status parameter. Signal-killed children map to a status above 128. It is hard because signals can coalesce so one notification covers several children, and waiting for an unrelated child by mistake loses a status.",
    k: ["Reaping in a signal handler versus in the main loop: a handler reaps promptly, but must be written with only safe operations, while the main loop is simpler but can delay.", "Waiting for a specific job versus any child: specific waits avoid stealing statuses, but need to track every pending process."],
    p: ["Coalesced child-status signals lead a handler to reap only one child, leaving zombies.", "A wait for any child collects an unrelated background process and its status is lost to the job table."],
    v: "Start fifty short background commands at once, and confirm the shell reaps all of them with none left as zombies, and each job's recorded status equals the command's real exit status.",
    dep: ["job-table", "signal-delivery", "process-creation-services"]
  },
  "shell-signal-handling": {
    s: "How the shell treats signals itself and for its children: ignoring interrupt and quit at the prompt, trapping signals in scripts, and resetting dispositions before exec.",
    d: "An interactive shell ignores interrupt, quit and terminal stop signals so it survives them, while its children get defaults restored before exec. The trap builtin installs handlers for scripts: cleanup on exit, reaction to termination, or ignoring signals. A trap runs after the current foreground command finishes, not instantly. Interrupt during a wait cancels the current line. It is hard because traps inherit through forks inconsistently, ignored signals stay ignored across exec, and a trap that does the wrong cleanup can loop.",
    k: ["Trap run after the foreground command versus immediately: waiting is safe for shell state, but delays cleanup on long commands.", "Ignoring signals in the interactive shell versus default handling: ignoring avoids accidental death, but requires restoring defaults in every child."],
    p: ["A script ignores a signal and every child it starts inherits the ignore, so they cannot be interrupted.", "An exit trap that itself fails or recurses prevents the script from ever finishing."],
    v: "Install a cleanup trap in a script, interrupt it during a long command, and confirm the command ends, the trap runs once, temporary files are removed and the exit status reflects the signal.",
    dep: ["signal-delivery", "fork-and-exec", "terminal-signals", "builtins"]
  },
});
