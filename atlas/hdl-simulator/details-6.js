// Details for the hardware description simulator plate, part 6: front end and elaboration.
ATLAS.details("hdl-simulator", {
  "preprocessor": {
    s: "Expands macros, conditional compilation, file inclusion and compiler directives in the source text before it is tokenized.",
    d: "Directives define and expand text macros with arguments, include other files, select code by conditions, and set defaults such as the time unit that apply to every following module. The preprocessor works on text, tracking original file and line for diagnostics. State carries across files in compile order, so a directive in one file affects the next. It is hard because macro expansion can nest, concatenate tokens and hide errors, and because the order dependence means the same file compiled in a different position behaves differently.",
    k: ["Single-pass text expansion before parsing vs expansion integrated into the lexer: separate is simple, and integrated tracks locations better and is trickier.", "Directive state persists across files vs reset per file: persistent matches the language and causes order bugs, while reset is safer and nonstandard."],
    p: ["A default timescale set in one file changes delay values in every file compiled after it.", "A macro redefinition in a late file silently changes earlier behavior in a separate compile."],
    v: "Preprocess a file set with nested macros and conditionals and diff the output against a hand-written expected text; confirm each error message points to the original macro call line.",
    dep: ["file-and-io-services", "command-line-and-options"]
  },
  "lexer": {
    s: "Splits preprocessed text into tokens: identifiers, keywords, numbers with bases and widths, strings and operators.",
    d: "The lexer recognizes sized based literals such as a width, a base and digits including unknown and high-impedance characters, real numbers with exponents, escaped identifiers, comments and the many operators. Keyword sets depend on the language version selected, since a word reserved in a newer standard is a legal identifier in an older one. It keeps source positions for each token. It is hard because version-dependent keywords require the lexer to know the dialect, and because very large generated files must tokenize quickly.",
    k: ["Version-specific keyword tables vs one superset: tables accept legacy code correctly, while one superset is simpler and rejects old identifiers.", "Hand-written lexer vs generated: hand-written is faster and handles quirks, while generated is easier to maintain."],
    p: ["A signal named like a newer keyword fails to parse in the default mode.", "Number literals with a space between base and digits are accepted by one tool and rejected by another."],
    v: "Tokenize a corpus of literals and escaped identifiers and compare with an expected token list; run a hundred-megabyte generated file and confirm throughput stays within the stated MB per second.",
    dep: ["preprocessor"]
  },
  "parser": {
    s: "Builds a syntax tree from tokens according to the grammar of the hardware description language, reporting syntax errors with useful recovery.",
    d: "The grammar is large, with hundreds of productions covering design units, declarations, statements, assertions and classes. It is not cleanly context-free: some constructs depend on whether a name is a type or a variable, so the parser needs feedback from the symbol table or uses lookahead. On a syntax error it should recover to the next statement and continue so users see several errors at once. It is hard because new standards add constructs frequently, and a parser must keep older code valid.",
    k: ["Generated parser vs hand-written recursive descent: generated is closer to the grammar, while hand-written gives better error messages and context-dependent handling.", "Parse all files then analyze vs analyze as you parse: parse-first allows parallel parsing, and incremental analysis finds errors sooner."],
    p: ["One missing semicolon yields hundreds of follow-on errors that bury the real one.", "Ambiguity between type names and variables leads to wrong parses silently."],
    v: "Parse a conformance corpus of valid files with zero errors and a corpus of invalid files where each produces an error at the correct line; compare error counts for single-fault inputs.",
    dep: ["lexer", "syntax-tree"]
  },
  "syntax-tree": {
    s: "The in-memory tree representing the program's structure, shared by analysis, elaboration, code generation, linting and the debugger.",
    d: "Each node records its kind, children, source location and later annotations: resolved declarations, types and constant values. The tree is created by the parser and enriched by semantic passes. Tools such as linters, formatters and coverage instrumentation work on it. It is hard because it must be compact for million-line designs, stable for serialization into libraries, and rich enough to rebuild the original text for messages.",
    k: ["Mutable annotated tree vs immutable tree with side tables: mutable is simple and fast, while immutable allows sharing and parallel passes.", "Keep the full tree in memory vs serialize compiled units to disk: in-memory is fast, and disk-backed units scale to very large designs."],
    p: ["Annotations written by one pass and read by another in the wrong order give stale results.", "A tree that stores full text for each node uses more memory than the source."],
    v: "Parse, print the tree back to source and re-parse; confirm the second tree equals the first. Check memory per thousand source lines stays within budget on a one-million-line input.",
    dep: ["memory-allocator"]
  },
  "name-resolution": {
    s: "Connects each use of a name to its declaration, following scopes, packages, imports, hierarchical references and the language's lookup rules.",
    d: "Lookups proceed through local scopes, enclosing modules, imported packages, and the compilation unit. Hierarchical references reach into other instances by path, which cannot be resolved until the hierarchy exists. Names may refer to modules, interfaces, classes, tasks and signals. It is hard because some names resolve only at elaboration, because wildcard imports create ambiguity that must be diagnosed on first use, and because identical names in different namespaces must remain distinct.",
    k: ["Resolve everything at analysis time vs defer hierarchical names to elaboration: early resolution reports errors sooner, but cannot handle references through parameterized hierarchy.", "Eager import of whole packages vs lazy by use: eager is simple, and lazy follows the language rule and scales."],
    p: ["Two wildcard imports both define a name and the choice silently depends on file order in a looser tool.", "A hierarchical reference works until a generate block is renamed."],
    v: "Resolve a set of programs with shadowing, imports and hierarchical paths against expected bindings; confirm ambiguous imports are diagnosed at the point of use and not at the import.",
    dep: ["syntax-tree", "parser"]
  },
  "type-checker": {
    s: "Determines the type and width of every expression and checks assignment, port and operator compatibility, inserting the implicit conversions the language defines.",
    d: "Expression width and signedness follow context-dependent rules: operand widths extend to the largest operand and the assignment target, and signedness is lost if any operand is unsigned. The checker computes these, inserts conversions, and checks class inheritance, parameter overrides and port connections. It is hard because the width rules are subtle and are a frequent source of silent truncation, and because strong checks reject code that older tools accepted.",
    k: ["Strict checking with errors vs lenient with warnings: strict finds bugs early and blocks legacy code, while lenient lets projects continue and leaves truncation bugs.", "Compute widths bottom-up vs by context propagation: bottom-up is simple, and the language needs context-determined widths, which means two passes."],
    p: ["A sum of two sixteen-bit values assigned to seventeen bits loses the carry when the operands are not extended first.", "Mixing signed and unsigned operands makes a comparison silently unsigned."],
    v: "Check a table of expressions with mixed widths and signs against expected result widths and values from the standard; run a design with a known truncation and confirm a warning at that line.",
    dep: ["name-resolution", "constant-evaluator"]
  },
  "constant-evaluator": {
    s: "Computes the values of expressions that must be known at compile or elaboration time, such as parameters, widths, array bounds and generate conditions.",
    d: "It evaluates arithmetic, functions with constant arguments, system functions such as bit-width queries, and conditional operators in the compiler. Constant functions are executed by an interpreter in the compiler with limits on loops and recursion. Results feed type checking and elaboration, and can depend on parameters not yet resolved, so evaluation is repeated per instance. It is hard because the evaluator must match the runtime semantics exactly, including four-state and width rules, and because user code can run arbitrarily long.",
    k: ["Separate compile-time interpreter vs reuse the simulation runtime: separate is isolated and duplicates semantics, while reuse is consistent and ties the compiler to the runtime.", "Evaluation limits on loops vs unbounded: limits prevent hangs, and reject legal but long computations."],
    p: ["Compile-time and run-time evaluation of the same function disagree on a width rule.", "A constant function with a runaway loop hangs the compile."],
    v: "Evaluate a library of constant functions in the compiler and in the simulator and confirm identical results for every input; a function with an infinite loop produces a limit error with its call path.",
    dep: ["syntax-tree", "four-state-values", "vector-storage"]
  },
  "linting-and-diagnostics": {
    s: "Static checks beyond what the language requires, plus the formatting and numbering of all compiler messages.",
    d: "Lint rules find likely bugs: width mismatches, incomplete sensitivity lists, unintended latches, unreachable code, missing default cases and unconnected ports. Each message has an identifier, severity, location and explanation, and users can suppress by rule or by region in the source. Output goes to the console and to files that regression tools consume. It is hard because every rule has false positives that cost reviewers' trust, and because rules must be tuned per project style.",
    k: ["Many rules on by default vs a small trusted set: many finds more, and users disable the whole tool when noise is high.", "Message text freedom vs stable identifiers: stable identifiers let projects waive specific messages, while free text is clearer to read."],
    p: ["Blanket suppression added to silence one false positive hides a real bug in the same file.", "Warning counts creep up because no one enforces a threshold."],
    v: "Run lint on a set of files with one planted defect per rule and confirm exactly one message per defect with the right identifier and line, and that a waiver by identifier removes only that message.",
    dep: ["type-checker", "name-resolution", "syntax-tree"]
  },

  "hierarchy-elaboration": {
    s: "Creates the tree of instances starting from the top modules, so that every module instantiation becomes a distinct object with its own state.",
    d: "Starting at the top-level units, the elaborator instantiates each child module, interface and program, recursively. Each instance has its own copy of variables and processes, and its own parameter values. The instance tree gives every object a hierarchical path name used by debug, coverage and dump control. It is hard because memory use scales with instance count, because identical instances should share code but not state, and because generate constructs and configuration choices change the tree.",
    k: ["Create a full copy per instance vs share code and keep only per-instance data: full copy is simple, and sharing saves memory and compile time on large replicated designs.", "Elaborate everything up front vs on demand: up-front catches errors in unused modules, while on demand speeds start of very large designs."],
    p: ["Millions of identical small instances each carry overhead that dwarfs their state.", "An uninstantiated module with an error is never reported until someone uses it."],
    v: "Elaborate a design with known instance counts and confirm the number of instances, their path names and parameter values match a golden listing; check memory per instance.",
    dep: ["parameter-resolution", "generate-expansion", "port-binding", "name-resolution"]
  },
  "parameter-resolution": {
    s: "Determines each instance's final parameter values from defaults, overrides in the instantiation, and overrides from configuration or the command line.",
    d: "Parameters can be overridden by position or name at the instantiation, by defparam-style statements elsewhere in the hierarchy, and by tool options. The elaborator evaluates dependent parameters in order, and can create a distinct specialization of a module for each distinct set of values. Types and widths can depend on parameters. It is hard because override precedence is complex, because circular dependencies must be detected, and because many different specializations of one module multiply compile and memory cost.",
    k: ["One specialization per unique parameter set vs per instance: unique set shares code between instances, and per instance is simple and wastes memory.", "Allow overrides from distant scopes vs only at instantiation: distant overrides are flexible, and make the design hard to reason about."],
    p: ["A parameter overridden from far away in the hierarchy gives an instance a value no reader of its module expects.", "Hundreds of unique parameter combinations multiply the compile time of a generic module."],
    v: "Elaborate with defaults, instantiation overrides and a command-line override on the same parameter and confirm the final value follows the documented precedence; print the resolved value table for each instance.",
    dep: ["constant-evaluator", "type-checker"]
  },
  "generate-expansion": {
    s: "Unrolls loops and conditionals in the structure of the design, creating the blocks, instances and assignments they describe.",
    d: "Generate loops repeat structure a number of times known at elaboration, such as an array of identical slices, and generate conditions select between alternative structures. Each iteration gets a scope with an index that is a constant within it, and a hierarchical name. The expansion evaluates conditions with the constant evaluator and creates real elements. It is hard because expansions can be very large, because names of generated scopes must be stable for debug and coverage, and because loop bounds depend on parameters.",
    k: ["Fully unroll all iterations vs represent loops symbolically: unrolling is simple and uses memory proportional to size, while symbolic is compact, and complicates every later pass.", "Name generated scopes by index vs by order of creation: index is stable and predictable for scripts, creation order may change with edits."],
    p: ["A generate loop with a large bound creates millions of elements and exhausts memory during elaboration.", "A condition with an unknown value is treated as false without a warning."],
    v: "Expand a generate loop with a known bound and a conditional branch, and confirm the instance names and counts equal the expected list for several parameter values, including zero iterations.",
    dep: ["parameter-resolution", "constant-evaluator"]
  },
  "port-binding": {
    s: "Connects each instance's ports to nets in its parent, handling width mismatch, direction, interfaces, implicit connections and collapse of connected nets.",
    d: "Binding by name, order or wildcard attaches parent expressions to child ports and checks direction and width. Interface ports bundle many signals, with modports restricting direction. Ports of unequal width are padded or truncated with a warning, and an unconnected port gets a default or high impedance. After binding, nets joined through ports may be merged to one so values need not be copied. It is hard because implicit and wildcard connections hide errors, and because collapsing ports must keep enough information for debugging.",
    k: ["Merge connected nets into one object vs keep separate with copy on change: merging is fast and saves memory, but loses the separate names; separate objects aid debugging at a runtime cost.", "Lenient implicit connections vs strict explicit: lenient is convenient, and masks misspelled names."],
    p: ["A misspelled port name with a wildcard connection leaves the port connected to nothing.", "A width mismatch on a port truncates the top bits and the simulation still runs."],
    v: "Instantiate a module with mismatched widths and an unconnected input and confirm warnings at the instance line, and that the unconnected input value in the waveform matches the documented default.",
    dep: ["hierarchy-elaboration", "type-checker", "net-and-driver-graph"]
  },
  "configuration-and-binding": {
    s: "Rules that choose which implementation of a module to use for each instance, so one source design can bind to different models without editing it.",
    d: "A configuration lists library search orders and per-instance or per-cell overrides: bind this instance to the gate-level model, the rest to the register-level one. This lets a test swap a behavioral memory for a netlist or a faster model. Bind statements can also attach checkers and monitors into existing modules from outside, without modifying their source. It is hard because the result differs from the plain source, so a bug may exist only in one configuration, and because binding into modules interacts with instance parameters and names.",
    k: ["Configurations separate from source vs conditional compilation: configurations leave the source unchanged, but add another file to maintain, while conditional compilation is simple and clutters code.", "Bind attachment of checkers vs editing modules: bind is non-invasive and reusable, and can be forgotten by teams that read only the source."],
    p: ["A regression runs under the wrong configuration and tests the wrong model.", "Bound checkers disappear when the module is renamed and nobody notices."],
    v: "Elaborate the same top with two configurations and confirm, from the instance listing, that the selected cells differ in exactly the intended instances and that a bound checker appears under each target.",
    dep: ["library-manager", "hierarchy-elaboration", "name-resolution"]
  },
  "design-flattening": {
    s: "Removes hierarchy boundaries where possible, merging modules and ports into one level for faster simulation, while keeping a map for debug.",
    d: "After elaboration, the tool can inline small modules into their parents, merge nets across ports, and remove empty or constant logic. This reduces process count and indirection, and enables optimization across former boundaries. The tool keeps a mapping from original hierarchical names to the flattened objects, so waveforms and coverage still show the user's names. It is hard because aggressive flattening removes signals the user wants to see, and because forced values and hierarchical references must continue to work.",
    k: ["Flatten aggressively vs preserve hierarchy: aggressive is faster, and loses visibility, while preserved hierarchy debugs easily and runs slower.", "Flatten by size threshold vs by user attributes: thresholds are automatic, and user attributes are explicit and need effort."],
    p: ["A signal removed by flattening cannot be added to the waveform on a rerun.", "Optimization across boundaries changes where a hierarchical force takes effect."],
    v: "Simulate with flattening on and off and confirm identical outputs; check that every signal in a user-supplied list still resolves by its original name, or is reported as removed with the reason.",
    dep: ["port-binding", "net-and-driver-graph", "hierarchy-elaboration"]
  },
  "net-and-driver-graph": {
    s: "The graph of nets, drivers and loads in the elaborated design, which resolution, ordering, partitioning and debug tracing all use.",
    d: "Nodes are nets, variables, drivers and loads such as process inputs. Edges say which drivers contribute to a net and which processes read it. The graph is built after binding and updated by flattening. Ordering and partitioning use it for dependencies, and debug uses it to trace a value back to its source. It is hard to keep memory small at hundreds of millions of connections, and to keep it consistent when force and release, or dynamic hierarchical access, change connectivity at run time.",
    k: ["Explicit stored graph vs derived on demand: stored is fast to query and takes memory, and derived saves memory and repeats work.", "Per-bit nodes vs per-vector nodes: per-bit is exact for partial drivers and heavy, while per-vector is compact and mishandles bit-level connections."],
    p: ["Bit-level partial drivers on a vector tracked as one object produce false multi-driver warnings.", "A graph built before flattening goes stale and gives wrong trace results."],
    v: "Build the graph for a netlist with known fan-in and fan-out, and compare counts of drivers and loads on a sample of nets against the source; confirm a trace from an output reaches the known driver.",
    dep: ["port-binding", "strength-resolution"]
  },
  "delay-annotation": {
    s: "Loads timing values computed after layout, such as cell and wire delays and timing check limits, onto the elaborated netlist.",
    d: "A standard annotation file lists delays per cell instance and per interconnect, in minimum, typical and maximum sets, along with setup, hold and pulse-width limits. The annotator matches names in the file to elaborated instances, applies values, and reports what was unmatched. It runs after elaboration and before simulation starts. It is hard because names in the file come from the implementation tool and may not match the simulator's naming, and because the files are huge, taking minutes to load and gigabytes of memory.",
    k: ["Annotate at elaboration vs at load of a saved image: at elaboration is simple, while at image load lets one compiled design reuse many timing files.", "Fail on unmatched names vs warn: failing catches mismatched design versions, and warning lets partial annotations run."],
    p: ["A name-mapping mismatch leaves part of the design at zero delay and the run looks fine.", "Annotating a design from an earlier netlist version gives plausible but wrong timing."],
    v: "Annotate a small netlist, read back selected delays, compare with the file, and confirm the unmatched-name report is empty; then rename one cell and confirm it is listed.",
    dep: ["net-and-driver-graph", "primitive-and-path-delays", "file-and-io-services"]
  },
  "simulation-image": {
    s: "The saved result of elaboration and compilation that the kernel loads and runs, holding the design, its code and the tables needed by debug and coverage.",
    d: "The image contains the instance tree, the net and process tables, generated or interpretable code, initial values, name tables and coverage structures. It can be saved and reused so many runs start without recompiling, and tests differ only in plusargs and seeds. Loading must be fast since a regression launches thousands of jobs, so images are memory-mapped where possible. It is hard to make the image portable across hosts and compatible across tool versions, and to keep size reasonable.",
    k: ["Reuse a saved image across tests vs elaborate in each run: reuse saves minutes on every launch, but requires cache keys that capture every option that affects the design.", "Memory-mapped image vs deserialized: memory-mapped starts instantly and shares pages among jobs, while deserialized is simpler and costs per-run memory."],
    p: ["An image reused after an option change simulates a different design than the one intended.", "A large image copied to every farm machine saturates the network."],
    v: "Build an image once, run ten tests from it, and confirm results equal those from separate full builds; time image load and confirm it is a small fraction of a short test.",
    dep: ["hierarchy-elaboration", "net-and-driver-graph", "native-code-generator", "library-manager"]
  },
});
