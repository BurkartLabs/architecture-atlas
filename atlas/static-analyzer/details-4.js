// Details for the static analyzer plate, part 4: taint tracking, interprocedural analysis, frontends.
ATLAS.details("static-analyzer", {
  "taint-sources": {
    s: "The program points where data an attacker can influence enters: network input, files, environment, command-line arguments, databases and framework request objects.",
    d: "Sources are declared as return values of functions, fields, parameters of entry-point methods or reads from particular channels, each with the kind of untrustedness. Framework-specific entry points matter most: a handler registered by annotation or routing table has attacker-controlled parameters, but nothing in the code calls it. The engine must find those entry points or accept them in the spec. The difficulty is second-order input: data stored in a database by one request and read by another is a source only if the store is modeled as tainted.",
    k: ["Treat all external reads as sources vs only attacker-reachable ones: all is sound and noisy for internal tools; narrowing needs a threat model to justify.", "Declare sources by function vs by entry-point annotation: function lists are explicit; entry-point detection finds framework handlers that no code calls."],
    p: ["A new framework handler style is not recognized, so request parameters are never marked and flows vanish.", "Data read from internal configuration is marked as tainted and every finding involving it is dismissed as noise."],
    v: "Add a handler with a seeded injection to each supported framework style and confirm its parameters are marked as sources and a finding is reported from each.",
    dep: ["taint-rule-specs","library-models","call-graph-construction"]
  },
  "taint-sinks": {
    s: "The operations that are dangerous when given tainted data, such as query execution, command execution, file paths, deserialization, redirects and output to a browser.",
    d: "A sink declaration names a function or construct, the argument positions that matter and the vulnerability class. Different classes need different sanitizers, so each sink carries a kind. Sinks can be sensitive to structure: a query built by concatenation is dangerous where a parameterized call is not. The engine reports when a value tagged for that kind reaches the argument. The hard part is completeness of sink lists and of argument semantics, as a function may be safe for some arguments and not others.",
    k: ["Argument-specific sinks vs whole-call sinks: argument-specific is accurate and needs careful specs; whole-call flags every use and over-reports.", "Report at the sink vs at the first dangerous operation: at the sink is where the fix goes; earlier reporting aids understanding and splits one issue into many."],
    p: ["A wrapper around a dangerous API is not listed as a sink, so flows into it are not reported.", "A sink is flagged even when the taint kind does not match, such as path data reaching a query call."],
    v: "For each sink kind, seed a program that passes tainted data and one that passes constants, and confirm exactly the tainted ones are reported with the sink kind in the message.",
    dep: ["taint-rule-specs","taint-labels","library-models"]
  },
  "sanitizers-and-validators": {
    s: "The operations that remove or neutralize taint, by escaping, encoding, parameterizing or checking against an allow-list, and which stop a flow for the matching sink kind.",
    d: "A sanitizer is declared as a function whose result is clean for certain kinds, or a validator whose success on a branch makes its argument clean on that path. Context matters: escaping for a web page does not protect a database query. Validators need path sensitivity so only the checked branch is clean. Custom project helpers are common, and each unmodeled one causes false alarms. The difficulty is knowing when sanitization is real, since a function named like a sanitizer may do nothing useful.",
    k: ["Trust declared sanitizers vs verify their behavior: trusting is cheap and wrong when a helper is flawed; verification is expensive and limited to simple cases.", "Kind-specific cleaning vs clearing all taint: kind-specific is accurate and needs care; clearing all is simple and hides real flows."],
    p: ["A sanitizer for one output context is applied before a different context, and the flow is treated as clean.", "A validator's check result is ignored by the caller, but the analysis marks the value clean anyway."],
    v: "Seed flows through each sanitizer and through a similarly named no-op function, and confirm the first is not reported and the second is; also confirm the validator cleans only on the success branch.",
    dep: ["taint-rule-specs","taint-labels","path-sensitivity"]
  },
  "propagation-rules": {
    s: "The rules for how taint moves through operations: assignment, string concatenation, collection insertion, field access and library calls that copy or transform data.",
    d: "Basic propagation follows assignments and arithmetic. String operations propagate from any tainted operand, containers taint their contents when a tainted element is inserted, and fields propagate through loads and stores via pointer results. Library calls need explicit rules saying which arguments flow to the return value, to other arguments or to the receiver. The engine implements these over its fact domain with summaries. The hard part is the long tail: thousands of library functions, each needing a rule to avoid dropping taint.",
    k: ["Taint by default through unknown calls vs clean by default: tainting by default is sound and noisy; clean by default is quiet and loses flows through any unmodeled call.", "Element-level container tracking vs whole-container taint: element-level is precise and heavy; whole-container taint is simple and over-taints everything in the container."],
    p: ["A string builder method has no rule, so taint disappears halfway through a constructed query.", "Taint attached to a whole list persists after the tainted item is removed, producing a false flow."],
    v: "Run a test suite that passes tainted data through every modeled operation type and library helper, and confirm each exit point is tainted; run again with a model removed and confirm the test fails.",
    dep: ["library-models","procedure-summaries","points-to-analysis","field-sensitivity"]
  },
  "implicit-flows": {
    s: "Information that leaks through control flow instead of assignment, where a branch on a secret or tainted value determines what is written, covered by optional extra tracking.",
    d: "If code writes one constant in the branch where a tainted flag is true and another otherwise, the written value depends on the tainted input without ever being copied from it. Tracking this requires marking the control dependence of statements on tainted conditions and treating values assigned there as tainted. It matters for confidentiality analyses and less for injection. It is usually off by default because it taints large parts of programs. The hard part is controlling the spread: nearly everything depends on some input through a branch.",
    k: ["Track implicit flows vs ignore them: tracking finds covert leaks and over-taints heavily; ignoring is quiet and misses information leakage.", "Taint within a conditional scope vs only direct writes: scope-based tracking is thorough and spreads widely; direct writes are limited and easier to explain."],
    p: ["Enabling implicit-flow tracking marks most values in the program as tainted, and the output becomes useless.", "A check on tainted data to choose a safe constant is reported as a leak."],
    v: "Analyze a program that copies a secret bit by branching and assigning constants, and confirm a flow is reported with implicit tracking on and not when off, then measure the increase in tainted values on a real module.",
    dep: ["taint-labels","control-flow-graph","program-dependence-graph"]
  },
  "taint-labels": {
    s: "Tags carried by values saying what kind of untrusted data they hold and which cleaning steps they have passed, so different vulnerability classes are tracked at once.",
    d: "Rather than a single tainted bit, a value carries a set of labels such as user-input, path-unsafe or html-unescaped. Sanitizers remove specific labels, sinks require specific ones, and combining values unions labels. Labels can also record the origin source for reporting. The label set grows the abstract state, so tools bound it or use bit sets. The hard part is label design: too few labels merge distinct problems and cause false alarms; too many make configuration hard and results harder to explain.",
    k: ["Multiple labels vs one taint bit: labels give accurate class-specific results and need more specs; a single bit is simple and treats all sanitizers as universal.", "Track origin per label vs only presence: origins make traces and triage clear and increase state size."],
    p: ["Two unrelated sanitizers both clear a single taint bit, and a flow is wrongly judged clean.", "Label sets grow without bound along a loop and slow the fixed-point computation."],
    v: "Run a flow that passes through an escaping function for one output context into a sink of a different context, and confirm the finding is still reported with the remaining label named.",
    dep: ["lattices-and-joins","taint-rule-specs"]
  },
  "flow-path-reconstruction": {
    s: "Rebuilds a concrete source-to-sink path from the analysis's facts after a flow is found, so that the finding can be explained step by step.",
    d: "Analyses often store only the fact that tainted data reaches a point, not how. A second pass walks backward from the sink through predecessor links or re-queries the summaries, choosing for each step the edge by which taint arrived. Where a summary was used, the callee body may be expanded on demand. The reconstructed path is converted into a trace. It is hard because abstraction discards the history: shortest, plausible and correct paths are different goals.",
    k: ["Record provenance during analysis vs reconstruct afterward: recording is simple and costs memory on every fact; reconstruction saves memory and spends time per finding.", "Expand summarized calls vs show them as one step: expansion is faithful and long; one step is short and unverifiable."],
    p: ["The reconstructed path passes through a branch that the analysis proved infeasible, so the trace looks unrealistic.", "Reconstruction takes longer than the analysis for flows crossing hundreds of calls."],
    v: "For a sample of findings, replay each trace step by step against the source and confirm every step's statement exists, is reachable from the previous one and carries the tainted value.",
    dep: ["procedure-summaries","code-flow-traces","propagation-rules"]
  },
  "call-graph-construction": {
    s: "Builds the graph of which functions may call which, the skeleton that every interprocedural analysis follows and whose gaps decide what is reachable.",
    d: "Direct calls are edges by name. Calls through function pointers, interfaces, virtual methods and callbacks are resolved by type information or by the pointer analysis. Entry points include main, exported functions and framework handlers. Graphs are built on demand during analysis or ahead of time with cheaper approximations. It is hard because every approximation is wrong in a known direction: too few edges miss bugs, too many edges flood analyses with impossible paths and slow them.",
    k: ["Cheap type-based construction vs pointer-analysis-based: type-based is fast and over-approximates targets; pointer-based is precise and depends on a costly analysis.", "Whole-program graph vs library entry points only: whole-program finds cross-module flows; entry-point-only suits libraries without knowing callers."],
    p: ["A callback registered through a framework creates no edge, so everything it calls is considered dead.", "A virtual call is resolved to every override in the program, producing impossible flows and false positives."],
    v: "Compare the generated graph with a runtime trace of a test execution and confirm every dynamically observed call has an edge, and report edge counts per call site to find over-approximation.",
    dep: ["virtual-dispatch-resolution","points-to-analysis","symbol-table"]
  },
  "virtual-dispatch-resolution": {
    s: "Determines which concrete method a call on an interface or base type may reach, using the type hierarchy and what is known about the receiver.",
    d: "The simplest approach considers every override in subtypes of the declared type, reachable or not. Refinements restrict to classes actually instantiated in the program, use points-to sets of the receiver, or use local type information after a cast or allocation. Dynamic loading and reflection add targets that no static hierarchy shows. Resolution quality directly sets call graph size, and therefore analysis precision and cost. The hard part is open-world code, where unknown subclasses may exist elsewhere.",
    k: ["Class hierarchy based vs points-to based: hierarchy is fast and broad; points-to is narrow and costs the pointer analysis.", "Closed-world assumption vs open-world: closed world is precise when all code is present; open world is safe for libraries and imprecise."],
    p: ["An interface with hundreds of implementers makes every call site fan out to all of them.", "A subclass loaded by name at run time is missing, so a call to its method is never analyzed."],
    v: "On a program with a three-level hierarchy and receivers of known runtime types, confirm the resolved target set at each call equals the reachable overrides only.",
    dep: ["symbol-table","points-to-analysis","name-and-type-resolution"]
  },
  "procedure-summaries": {
    s: "A compact description of what a function does to its inputs and outputs, computed once and applied at every call site, replacing re-analysis of the body.",
    d: "A summary maps abstract inputs, such as which parameters are tainted or null, to effects: return value facts, modified fields, resources released and possible errors. Summaries may be input-independent, or parameterized by input conditions so that it is applied precisely. They are computed bottom-up through the call graph and stored in the fact cache. They make the analysis scale linearly with program size. The hard part is the summary's expressiveness: too simple loses precision at calls, too detailed approaches re-analyzing the body.",
    k: ["Parameterized summaries vs single summary per function: parameterized are precise for different callers and larger; a single summary is small and merges all contexts.", "Compute eagerly for every function vs on demand: eager is simple and wastes work on unused functions; on demand saves time and complicates scheduling."],
    p: ["A summary omits an effect on a global, so callers assume the function is pure and miss a flow.", "Recursive functions produce summaries that depend on themselves and do not stabilize."],
    v: "Compare analysis results using summaries against fully inlined analysis on a test set, and confirm every difference is a documented imprecision, never a missed true finding.",
    dep: ["summary-computation-order","call-graph-construction","fact-cache"]
  },
  "summary-computation-order": {
    s: "The schedule that decides in which order functions are summarized, normally callees first, with special handling for cycles of mutually recursive functions.",
    d: "The call graph is condensed into strongly connected components and processed in reverse topological order, so each function's callees are summarized first. Within a cycle, summaries are iterated to a fixed point or conservative placeholders are used. Independent components can be processed in parallel. When one summary changes in incremental runs, its callers are re-queued. The hard part is the long chain: a deep call chain serializes the work, and one huge cycle in a framework can dominate the run.",
    k: ["Bottom-up callee-first order vs top-down: bottom-up gives complete summaries for callers; top-down gives caller context to specialize callees and needs context handling.", "Iterate recursive groups to a fixed point vs cut them with conservative summaries: iteration is precise and slow; cutting is fast and coarse."],
    p: ["One giant strongly connected component from callback registration makes nearly the whole program one cycle.", "A changed summary re-queues callers repeatedly in an oscillation that never stabilizes."],
    v: "Log the component sizes and processing order for a repository, and confirm every non-recursive function is summarized after all its callees and that the largest component size is within the expected limit.",
    dep: ["call-graph-construction","procedure-summaries","parallel-scheduler"]
  },
  "library-models": {
    s: "Hand-written or generated descriptions of library functions the analyzer cannot or should not look inside, giving their effects as summaries instead of code.",
    d: "A model states what a library call returns, what it may modify, which arguments flow where, whether it can return null and which resources it opens or closes. Models cover the standard library, common frameworks and system calls, and are shipped with the tool or generated from annotations or from analysis of the library once. Without them, every unknown call is a hole in the analysis. They are hard to maintain: libraries change, and a wrong model silently produces wrong results everywhere it is used.",
    k: ["Hand-written models vs generated summaries from library code: hand-written are accurate for what they cover and expensive to extend; generated cover everything and inherit analysis imprecision.", "Model the behavior vs stub it out entirely: modeling keeps flows through the call; stubbing is cheap and loses them."],
    p: ["A model for an older library version is used with a newer one whose behavior changed.", "A function with no model is assumed pure, so a taint flow through it is dropped."],
    v: "For each modeled function, run a test program using it and confirm the analysis result matches the documented behavior, and list calls with no model by frequency to guide new work.",
    dep: ["procedure-summaries","symbol-table"]
  },
  "path-sensitivity": {
    s: "Keeps facts separate along different paths and uses branch conditions to rule out infeasible combinations, reducing false alarms at the cost of more states.",
    d: "A path-insensitive analysis merges facts at every join and may report a bug on a path whose condition contradicts another earlier condition. A path-sensitive one tracks conditions along the path, either by splitting states per condition or by attaching predicates and checking them with a solver. Full path sensitivity is exponential, so tools use it selectively: on the paths to a candidate finding, or on a few key predicates. The hard part is bounding the cost and the soundness of dropped conditions.",
    k: ["Predicate tracking vs state splitting: predicates are compact and need a solver; splitting is direct and multiplies states.", "Sensitivity on demand per finding vs everywhere: on demand spends effort only where an alarm exists; everywhere is thorough and often unaffordable."],
    p: ["Conditions on loop-modified variables are carried unchanged around the loop, giving wrong feasibility answers.", "State splitting explodes at a function with many sequential branches and hits the budget."],
    v: "Analyze code where a value is dereferenced only when it is non-null by an earlier correlated check, and confirm the alarm appears without path sensitivity and disappears with it.",
    dep: ["control-flow-graph","abstract-domains","relational-domains"]
  },
  "context-sensitivity": {
    s: "Analyzes a function separately for different callers or call chains so that facts from one caller do not leak into results for another.",
    d: "A context-insensitive analysis merges all calls to a function, so an identity function applied to a tainted value and a clean value taints both outputs. Context sensitivity distinguishes calls by call-site string of bounded length, by receiver object or by parameter facts. Cost grows with the number of contexts, so depth is limited, or contexts are applied only where merging hurts. Summaries parameterized by input are a related way to achieve it. The hard part is choosing the kind and depth that give precision where the clients need it.",
    k: ["Call-site context vs object context: call-site works for plain functions; object context fits object-oriented code, where the receiver identity matters most.", "Fixed depth vs selective: fixed depth is predictable and wasteful; selective applies it to the few functions where merging causes false results."],
    p: ["A utility function used everywhere merges all callers' facts, and a clean value is reported as tainted.", "Context depth of three multiplies the work by orders of magnitude on code with deep call chains."],
    v: "Analyze two calls to the same helper, one passing tainted data and one clean, and confirm the clean one is not reported with sensitivity and is without; then record the runtime cost of each setting.",
    dep: ["call-graph-construction","procedure-summaries"]
  },
  "parser-frontend": {
    s: "Turns source text into a syntax tree using the full grammar of the language, with positions, comments and enough fidelity to map findings back to exact text.",
    d: "A lexer and parser produce a tree annotated with source ranges. For analysis, the tree must keep token positions and preserve comments and whitespace trivia for suppressions and fixes. Parsers may be generated from a grammar or written by hand, and language versions can change the grammar. Syntax errors need recovery so the rest of a file is still analyzed. The hard part is exact agreement with the real compiler, since a differing parse silently changes what the code means.",
    k: ["Generated parser vs hand-written: generated parsers follow the grammar and give poor error recovery; hand-written ones recover well and cost more to maintain.", "Reuse the compiler's frontend vs a separate parser: reuse is faithful and tied to the compiler's release; a separate parser is portable and may disagree."],
    p: ["A new language construct is parsed as a syntax error and the whole file is skipped.", "Positions from a parser that expands tabs differently from the editor place findings in the wrong column."],
    v: "Parse the language's official conformance programs and a large real repository, and confirm no unexpected errors, and that printing the tree reproduces the source text exactly.",
    dep: ["source-snapshot-access","build-and-target-model"]
  },
  "preprocessor-and-macros": {
    s: "Handles textual inclusion, conditional compilation and macro expansion, which determine what code actually exists before parsing for languages that use them.",
    d: "The preprocessor evaluates includes, defines and conditions using the file's build settings, expands macros and produces the text the parser sees, while tracking the original positions. Findings in expanded code must be reported at the macro use. Some tools analyze each configuration separately; others parse variability directly. Macros that generate statements or change control flow, such as ones containing return or goto, change the meaning of code at the call. The hard part is mapping between expanded and original code for locations and fixes.",
    k: ["Analyze the expanded code vs the unexpanded source: expanded is what the compiler sees and maps poorly to text; unexpanded is readable and cannot model macros.", "One configuration vs variability-aware parsing: one is simple and misses other branches; variability-aware covers all and is complex."],
    p: ["A finding inside a macro body is reported once per use, flooding the output with duplicates.", "A conditional branch off in the chosen configuration hides a bug that appears only on another platform."],
    v: "Analyze a file with nested macros and conditions and confirm each finding maps to the macro invocation line with the expansion shown, and that deduplication yields one finding per macro definition issue.",
    dep: ["build-and-target-model","parser-frontend","result-locations"]
  },
  "name-and-type-resolution": {
    s: "Binds each identifier to its declaration and gives each expression a type, using scopes, imports, overload rules and inheritance, so later analyses work on meanings, not text.",
    d: "Resolution builds scopes, follows imports and includes, applies overload and template or generic rules, and records for each name the symbol it denotes and for each expression its type. It needs the declarations of all dependencies, from source or compiled interface files. Partial resolution is common: when a dependency is missing, the node gets an unknown type and analyses must handle it. It is hard because language rules for overloads, implicit conversions and inference are intricate, and a small deviation changes which function a call reaches.",
    k: ["Full resolution vs lightweight name matching: full is accurate and requires all dependencies; lightweight works anywhere and mismatches overloaded names.", "Resolve from source vs from compiled interfaces: source is complete and slower; interface files are fast and may lack bodies."],
    p: ["A missing dependency leaves types unknown, and rules relying on types silently stop firing.", "Overload resolution differs from the compiler's, so calls are bound to the wrong function."],
    v: "Resolve a project and report the share of identifiers and expressions with unknown bindings or types; confirm it is below a threshold and that unresolved items are listed per file.",
    dep: ["parser-frontend","symbol-table","build-command-capture"]
  },
  "build-command-capture": {
    s: "Obtains the exact compiler invocations for each file by observing or querying the real build, so the analyzer sees the same flags, defines and paths the compiler does.",
    d: "Approaches include wrapping the compiler and recording its calls, tracing the build, reading a compilation database exported by the build tool, or asking the build system for its action graph. The captured commands feed the target model and the frontend. For interpreted or package-based ecosystems, this means reading the manifest and lock files. The hard parts are cost and reliability: running a full build to observe it is slow, and it executes project code.",
    k: ["Observe a real build vs read a static export: observation is exact and requires a working build; exports are fast and may omit generated steps.", "Capture once and cache vs capture each run: caching is fast and goes stale when the build changes; each run is fresh and costly."],
    p: ["Incremental builds skip files, so no command is recorded for them and they are never analyzed.", "Commands captured with absolute paths from the build machine do not work on the analysis machine."],
    v: "Compare the set of files with captured commands against the set of files the build compiled, and confirm they match exactly with a count of any files missing a command.",
    dep: ["source-snapshot-access","build-and-target-model"]
  },
  "error-tolerant-parsing": {
    s: "Recovers from syntax errors so a file that is half-written or uses unknown syntax still yields a usable tree for the parts that are valid.",
    d: "Recovery strategies skip to the next statement boundary, insert missing tokens, or wrap the unparsable region in an error node that later passes ignore. This lets editor diagnostics work during typing and lets batch runs continue past odd files. Error nodes must not produce misleading findings, so analyses treat them as unknown. The hard part is that recovery guesses: a wrong guess may attach later code to the wrong construct and cause spurious findings nearby.",
    k: ["Aggressive recovery vs fail on first error: aggressive recovery keeps analyzing and risks nonsense findings; failing is clear and loses the file's results.", "Skip analysis near error nodes vs analyze normally: skipping avoids false findings and creates blind spots; normal analysis finds more and misleads."],
    p: ["A missing brace makes the parser absorb the rest of the file into one function, and findings there are wrong.", "An unsupported new syntax is treated as an error, and silently no findings come from files that use it."],
    v: "Feed files with a single deleted token at every position and confirm the parser returns a tree, reports at most a few error nodes, and produces no findings more than a few lines from the error.",
    dep: ["parser-frontend","editor-diagnostics"]
  },
  "multi-language-frontend": {
    s: "A set of frontends that map several languages into one shared model, so rules, analyses and results work across languages and across calls between them.",
    d: "Each language has its own parser and resolver, which lower into a common tree or intermediate representation with language-neutral node kinds. Shared analyses then run on the common form, with language-specific semantics encoded in the lowering or in plugins. Cross-language flows, such as a web front end calling a back-end service or native code, need models of the foreign interface. It is hard to avoid lowest-common-denominator modeling: details that matter to one language are lost in the shared form.",
    k: ["Common intermediate form vs per-language analyses: common form shares rules and engine work and blurs language rules; per-language analyses are accurate and multiply effort.", "Model foreign calls precisely vs as opaque: precise models catch cross-language flows; opaque treatment loses them."],
    p: ["A language feature with no neutral equivalent is lowered to an unknown node, and rules silently do not apply.", "A shared rule is written once and has different meaning in two languages because of differing semantics."],
    v: "Write the same seeded bug in each supported language and confirm the shared rule reports each at the right location, and that a flow crossing a foreign call is reported with the interface named.",
    dep: ["intermediate-representation","parser-frontend","library-models"]
  },
});
