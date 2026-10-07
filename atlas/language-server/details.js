// Details for the language server plate, part 1: editor features.
ATLAS.details("language-server", {
  "hover": {
    s: "Returns a short rich-text description of the symbol under the cursor: its type, signature, documentation and sometimes its evaluated value.",
    d: "The server maps the cursor position to a syntax token, climbs to the enclosing node, resolves it to a declaration or expression, and formats the result as markdown with the signature, the doc comment and a link to the definition. It must run on code that is mid-edit, so it often falls back from a resolved symbol to the token's kind. It is hard because users hover constantly, expect an answer in well under a hundred milliseconds, and notice any wrong type immediately.",
    k: ["Rendering documentation on the server vs sending raw comments: the client stays simple and consistent, but the server must know markup rules and cannot adapt to client themes.", "Hovering resolved symbols only vs falling back to token info: fallbacks always show something, but can display misleading generic text when analysis is stale."],
    p: ["Hovering a name inside a macro or generated region shows the expansion's type but no source, which confuses users.", "Very large documentation blocks or huge inferred types make the popup unusable and slow to serialize."],
    v: "Hover over a generic call in a file with a syntax error elsewhere, and confirm the popup shows the correct instantiated signature within 100 ms, then repeat after an unrelated edit and see it unchanged.",
    dep: ["syntax-trees", "type-inference", "name-resolution", "query-engine"]
  },
  "signature-help": {
    s: "Shows the parameters of the function being called while the user types arguments, highlighting the one the cursor is on and listing overloads.",
    d: "Triggered by an opening parenthesis or comma, it finds the enclosing call expression in the possibly unfinished syntax tree, counts arguments before the cursor to pick the active parameter, and resolves the callee to its candidate signatures. With overloads it ranks candidates by how many already-typed arguments fit. The hard part is the broken tree: unbalanced brackets, nested calls and trailing commas mean the parser's recovery decides which call the cursor belongs to.",
    k: ["Counting commas in the tree vs in raw text: tree-based counting handles nesting and strings correctly, but depends on parser recovery quality for incomplete calls.", "Listing all overloads vs only the best match: showing all helps discovery, but a long list is noise once the user has typed enough arguments."],
    p: ["Commas inside nested generics or lambdas get counted as argument separators, moving the highlight to the wrong parameter.", "Callee resolution failing on an unfinished argument makes the popup flicker off while the user is mid-word."],
    v: "Type an opening parenthesis after a three-parameter function, then type two commas inside a nested call, and confirm the highlighted parameter index follows the outer call correctly at each keystroke.",
    dep: ["error-tolerant-parsing", "name-resolution", "type-inference", "capability-negotiation"]
  },
  "go-to-definition": {
    s: "Resolves the name under the cursor to the location of its declaration, and related requests find the type, implementation or declaration of the same symbol.",
    d: "The server finds the token at the position, maps it through any macro expansion back to source, runs name resolution or type inference to find the target, and returns one or more locations with ranges. Variants differ in what they target: the declaration, the type of the value, or the implementations of an interface. Results may point into library sources or generated files, which need paths the client can open. Ambiguity, such as overloaded or conditionally compiled definitions, produces several results.",
    k: ["Returning a location list vs a single best guess: lists are honest about ambiguity, but clients vary in how they present multiple targets.", "Navigating into library sources vs stubs: real sources allow deep navigation, but require locating and indexing files outside the workspace."],
    p: ["Targets inside generated code or macro output point at files that do not exist on disk, so the editor reports an error.", "A jump that lands on the wrong overload erodes trust faster than no result."],
    v: "Invoke definition on a symbol imported through a re-export chain and on one defined by a macro, and confirm each lands on the original source line that a manual search would identify.",
    dep: ["name-resolution", "import-resolution", "macro-expansion", "syntax-trees", "uri-and-path-mapping"]
  },
  "find-references": {
    s: "Lists every use of a symbol across the workspace, optionally including its declaration and distinguishing reads from writes.",
    d: "The server resolves the symbol under the cursor to a definition, then finds files that could mention its name using the reference index or a text search, and analyzes only those candidates to confirm each occurrence really resolves to the same definition. Results stream as partial results because large workspaces take seconds. It is hard because name equality is not identity: shadowed variables, same-named methods on unrelated types and renamed imports must be told apart.",
    k: ["Text prefilter then semantic confirmation vs analyzing every file: the prefilter is orders of magnitude cheaper, but depends on an index that must be complete and fresh.", "Streaming partial results vs one final list: users see matches immediately, at the cost of unstable ordering and more protocol traffic."],
    p: ["A stale or partial index silently omits references, which later makes a rename or deletion break callers.", "Searching a common name in a monorepo analyzes thousands of files and holds the scheduler for seconds."],
    v: "Search references for a method name shared by two unrelated types, and confirm results include only calls that resolve to the chosen type, with a count matching a compiler-assisted rename dry run.",
    dep: ["reference-index", "name-resolution", "partial-results", "symbol-index", "cancellation"]
  },
  "document-highlight": {
    s: "Marks other occurrences of the symbol under the cursor within the same file, with read and write distinctions, updating as the cursor moves.",
    d: "On each cursor move the client asks for highlights; the server resolves the symbol and scans only the current file's resolved names for the same target. Since it fires on nearly every cursor movement, it has to be cheaper than find-references and tolerate being cancelled constantly. It can also highlight related syntax, such as matching branch keywords or loop exits. The hard part is cost discipline: it must reuse the already computed analysis for the open file rather than starting new work.",
    k: ["Single-file semantic scan vs plain text match: semantic scan avoids highlighting shadowed names, but needs the file's analysis to be warm.", "Computing on every cursor move vs after a pause: instant feedback feels responsive, but floods the scheduler unless requests are cancellable."],
    p: ["Running full resolution for each cursor movement starves more important requests like completion.", "Highlights from a request issued before an edit land on shifted text and mark the wrong words."],
    v: "Move the cursor through a function with a shadowed variable using held arrow keys, and confirm highlights match only the intended binding with no request taking longer than 20 ms in the trace.",
    dep: ["name-resolution", "cancellation", "priority-lanes", "syntax-trees"]
  },
  "document-symbols": {
    s: "Provides the outline of one file as a tree of declarations with kinds and ranges, used for the outline panel, breadcrumbs and in-file search.",
    d: "The server walks the file's syntax tree or item tree and emits nested symbols: modules, types, functions and fields, each with a full range and a selection range for the name. It only needs syntax, so it works even when the project model is missing and is a good candidate for the fastest path. The difficulty is stability: outlines are requested on every edit, and returning a differently shaped tree for a mid-typing state makes the outline panel jump and lose its expanded state.",
    k: ["Syntax-only outline vs semantically enriched: syntax-only is fast and available before indexing, but cannot show resolved details such as inferred return types.", "Hierarchical symbols vs flat list: hierarchy supports breadcrumbs and folding, but older clients only understand flat information."],
    p: ["Dropping symbols while a declaration is incomplete makes the outline flicker and collapse during typing.", "Range and selection range mismatches make breadcrumb clicks select the wrong text."],
    v: "Type a new function header character by character and confirm the outline keeps its sibling order and expanded nodes at every keystroke, with the new entry appearing once the name is complete.",
    dep: ["syntax-trees", "item-tree", "error-tolerant-parsing"]
  },
  "workspace-symbols": {
    s: "Searches declarations across the whole workspace and libraries by partial name, returning ranked matches as the user types in a global search box.",
    d: "The query string is matched against the symbol index with fuzzy rules such as initials, substrings and case hints, then results are ranked by match quality, kind and proximity to the open file, and truncated to a limit. Most work is in the index, not the request. It must answer within a keystroke interval over millions of names, while the index may still be filling during startup, so the server reports partial or empty results rather than blocking.",
    k: ["Index lookup only vs analyzing candidates: index lookup is instant, but cannot show details such as resolved signatures without additional work.", "Server-side ranking and truncation vs returning everything: the client receives a small payload, at the cost of ranking rules the user cannot adjust."],
    p: ["Querying while the index is still building returns a short list with no hint that more exists.", "Ranking that ignores the current project buries local symbols under library names."],
    v: "Type three letters of a known class name in a one-million-symbol workspace and confirm results appear within 50 ms, with the intended class in the top three and library duplicates ranked lower.",
    dep: ["symbol-index", "name-matching", "background-indexing", "prebuilt-library-index"]
  },
  "call-hierarchy": {
    s: "Builds a navigable tree of callers or callees for a function, expanded one level at a time as the user opens nodes.",
    d: "The protocol is two-step: first prepare an item for the symbol at the cursor, then ask for incoming or outgoing calls of that item. Incoming calls use find-references and group results by enclosing function; outgoing calls walk the function body for call expressions and resolve each. Each level is a separate request so the tree grows lazily. The hard parts are indirect calls through function values or dynamic dispatch, which cannot be resolved statically, and cost on highly connected functions.",
    k: ["Lazy per-level expansion vs computing the whole tree: lazy keeps latency low and bounded, but users cannot see total depth or find cycles quickly.", "Including dynamic dispatch candidates vs direct calls only: candidates show real behavior, but add many false edges."],
    p: ["Calls through callbacks, function tables or reflection are missing, so the tree looks complete when it is not.", "Recursion and mutual recursion cause endless expansion unless the item identity is stable."],
    v: "Expand incoming calls for a function with three known callers, one inside a closure, and confirm all three appear grouped under the correct enclosing functions with call-site ranges.",
    dep: ["find-references", "name-resolution", "type-inference", "syntax-trees"]
  },
  "type-hierarchy": {
    s: "Shows the supertypes and subtypes of a type, expanded lazily, so users can browse inheritance or interface implementation relationships.",
    d: "As with call hierarchy, the client prepares an item and then asks for supertypes or subtypes. Supertypes come from the type's declared bases and trait or interface bounds. Subtypes require finding every type that names it as a base, which needs a reverse relation held in the index or computed by scanning candidates. Hardness lies in the reverse direction: without a prebuilt index, finding implementers across a large workspace and its dependencies is a whole-program question.",
    k: ["Reverse-relation index vs scanning on demand: an index makes subtype queries instant, but costs storage and an invalidation path.", "Including indirect implementations through blanket rules vs only explicit ones: complete answers help refactoring, but can return enormous lists."],
    p: ["Implementations that live in dependent packages not loaded by the workspace are never found.", "Blanket implementations over generic parameters list every type that satisfies the bounds."],
    v: "Open subtypes of an interface with known implementers in two packages and confirm the list matches a compiler-assisted listing, including one implementation declared in a generated file.",
    dep: ["trait-solving", "symbol-index", "reference-index", "name-resolution"]
  },
  "diagnostics": {
    s: "Reports errors, warnings and hints about the code to the editor as underlines and a problems list, from syntax checks, semantic analysis and external tools.",
    d: "Syntax errors come from the parser, semantic errors from name resolution and inference, and optional deeper checks from the real compiler or linter running out of process. The server either pushes a list per file or lets the client pull, tagged with source, code, severity and related locations. It is hard because diagnostics must be both fast and quiet: analysis of half-typed code produces cascades of false errors, so the server suppresses secondary errors and delays publishing during active typing.",
    k: ["Native analysis vs running the real compiler: native results arrive per keystroke, but may disagree with the compiler; compiler results are authoritative but only on save.", "Push vs pull diagnostics: push lets the server decide timing, but pull lets the client prioritize visible files and avoid work for closed ones."],
    p: ["Publishing diagnostics computed against an older document version leaves red underlines on code the user already fixed.", "Cascading errors from one missing brace bury the real mistake under dozens of false ones."],
    v: "Introduce a missing closing brace in the middle of a large file and confirm exactly one error appears at the right place within a second, then fix it and see all diagnostics clear without saving.",
    dep: ["error-tolerant-parsing", "name-resolution", "type-inference", "lint-analysis", "document-synchronization", "debounce-and-throttle"]
  },
  "completion": {
    s: "Proposes names, members, keywords and snippets at the cursor as the user types, ranked by relevance and filtered by what is in scope and type-correct.",
    d: "The server inserts a placeholder identifier at the cursor in a copy of the tree, runs analysis on that completed copy to learn what kind of position it is, such as member access, import path or expression, then gathers candidates from scope, the receiver's type or the index. Each candidate gets a sort key from type match, locality and usage. It is the most latency-sensitive feature: it runs on code that does not parse, on every keystroke, and its list must be right on first display.",
    k: ["Analyzing a patched copy of the file vs reusing the broken tree: the copy yields a precise context, but costs one extra analysis of a changed file per request.", "Returning full items vs lazy resolution of details: small lists are fast to send, but details like documentation arrive later and must stay consistent."],
    p: ["Candidates ranked by alphabet rather than relevance push the obvious choice off the visible list.", "Slow first completion after a project load makes users distrust the feature for the rest of the session."],
    v: "Type a dot after a value of a known type in a file with an unrelated syntax error and confirm its members appear within 100 ms, with type-matching members above unrelated ones.",
    dep: ["error-tolerant-parsing", "name-resolution", "type-inference", "symbol-index", "snippets-and-auto-import", "priority-lanes"]
  },
  "snippets-and-auto-import": {
    s: "Completion items that insert multi-line templates with tab stops, or add the missing import for an accepted suggestion in the same edit.",
    d: "A snippet is text with placeholders in the protocol's snippet syntax, offered where its kind of construct is valid. Auto-import completes names not yet in scope by searching the index, then attaches an additional edit that adds the import at a sensible position and style. Resolving the import path is deferred until the item is accepted or focused. The difficulty is deciding the right path among several, honoring the project's import style, and not offering names that would be visible but private.",
    k: ["Computing the import edit eagerly vs on resolve: eager is simpler, but multiplies cost by hundreds of candidates; lazy needs a stable item identity.", "Offering every indexed name vs only importable, visible ones: broader lists find more, but suggest unusable names unless visibility is checked."],
    p: ["Imports inserted into the wrong block or style produce diffs that fail the project's formatter or lints.", "Suggesting a name from a package not listed as a dependency produces code that cannot compile."],
    v: "Accept a completion for a type from another module, and confirm one undoable edit both inserts the name and adds a single import in sorted position, and that the file then has no new errors.",
    dep: ["symbol-index", "module-graph", "visibility-and-privacy", "completion", "formatting"]
  },
  "rename": {
    s: "Changes the name of a symbol and all of its references across the workspace in one atomic edit, after checking the new name is valid and does not collide.",
    d: "A prepare step validates that the cursor is on a renameable symbol and returns its range. The rename step finds all references, adds declaration sites, strings or comments only if the language says so, and builds a workspace edit grouped per file with document versions. It also checks for conflicts, such as shadowing or an existing member with the new name. It is hard because correctness requires complete references, and the edit must apply atomically or not at all.",
    k: ["Refusing a rename when conflicts are found vs applying it and flagging them: refusal preserves behavior, but frustrates users who intend to fix collisions afterward.", "Renaming in generated or macro code: skipping it keeps the edit safe, but leaves hidden uses broken."],
    p: ["An incomplete index drops a reference in a rarely opened file, so the rename compiles nowhere.", "Applying edits against document versions that changed in the meantime corrupts the file."],
    v: "Rename a method used in five files, one through an aliased import, and confirm one edit updates all uses; building afterward succeeds, and renaming to a colliding name is rejected with a reason.",
    dep: ["find-references", "name-resolution", "reference-index", "document-synchronization", "uri-and-path-mapping"]
  },
  "code-actions": {
    s: "Context-menu and lightbulb commands offered at a cursor or selection: fixes for diagnostics, refactorings and source-wide actions, each computed as an edit.",
    d: "The client sends the range, the diagnostics overlapping it and the kinds it wants. The server runs a set of independent assists against the syntax and semantic model at that range, each returning either an edit immediately or a command and data for later resolution. Lazy resolution keeps the menu fast. The hard part is scale: dozens of assists run on every cursor move, so each must reject cheaply, and none may take time proportional to the file.",
    k: ["Computing edits when listing vs on resolve: eager makes each item self-contained, but wastes work on actions the user never picks.", "Many small assists vs few large ones: small ones compose and test well, but crowd the menu unless filtered by context."],
    p: ["Assists that offer themselves in every position flood the lightbulb until users turn the feature off.", "An edit computed on the list request is applied after the file changed, producing a corrupted result."],
    v: "Place the cursor on a function with an unused parameter and confirm the lightbulb lists the relevant actions within 50 ms, and that applying one produces an edit that compiles.",
    dep: ["quick-fixes", "refactorings", "syntax-trees", "type-inference", "diagnostics"]
  },
  "quick-fixes": {
    s: "Code actions attached to a specific diagnostic that correct it, such as importing a missing name, adding a missing field or removing an unused item.",
    d: "Each diagnostic carries a code and enough data for a fixer to act without recomputing the analysis: the unresolved name, the missing members, the expected type. The fixer is registered against the code and produces an edit. Fixes may come from the server's own diagnostics or from an external linter's suggestions mapped into edits. The difficulty is correctness of intent: a fix for a missing symbol may have several valid readings, and offering the wrong one first trains users to apply it blindly.",
    k: ["Attaching fix data to the diagnostic vs recomputing on request: attached data is cheap and exact, but couples diagnostics to fixers and must survive edits.", "Offering several alternatives vs one best fix: alternatives respect ambiguity, but require ordering that reflects what users usually mean."],
    p: ["The fix for a typo suggests a different but valid name that silently changes behavior.", "Fixes tied to a diagnostic that was published against an old version no longer apply to the current text."],
    v: "Reference an undefined function with a close-spelled existing one, and confirm the fix list has the spelled-alike option first, the create-function option second, and applying either clears the diagnostic.",
    dep: ["diagnostics", "code-actions", "snippets-and-auto-import", "name-resolution"]
  },
  "refactorings": {
    s: "Structured source transformations that preserve behavior while changing shape: extract function, inline variable, change signature, move item and similar.",
    d: "Each refactoring selects a syntax range, checks preconditions using semantic information such as captured variables, mutation and visibility, and generates edits for the definition and every affected use. Extract needs free-variable analysis; change signature updates all call sites; move rewrites imports. Because the result must keep the program meaning, refactorings lean on resolution and sometimes type information, and must refuse when an unsupported construct appears. Correctness on unusual code is the hard part.",
    k: ["Refusing on any doubt vs best-effort edits: refusal never changes behavior, but covers fewer situations and annoys users with disabled actions.", "Syntactic rewriting vs semantics-aware rewriting: syntactic is simple and quick, but cannot see shadowing, captures or visibility changes."],
    p: ["Inline of an expression with side effects changes evaluation order or count without warning.", "A move that misses an import in one dependent file leaves the workspace failing to build."],
    v: "Extract a block that reads two locals and mutates one into a function, then confirm the program's test output is identical before and after and the new signature passes the mutated value correctly.",
    dep: ["name-resolution", "type-inference", "find-references", "syntax-trees", "visibility-and-privacy", "formatting"]
  },
  "formatting": {
    s: "Rewrites whitespace and layout of a document, range or typed line according to style rules, returning minimal text edits instead of whole-file replacements.",
    d: "The server either implements the formatter or calls an external one, and then diffs the result against the buffer so the editor receives small edits that preserve cursor, folds and undo granularity. Range and on-type requests format only a region or the line just completed. It is hard because formatting must be idempotent, must not change meaning, and has to cope with unparsable code, where it normally declines rather than guess.",
    k: ["In-process formatter vs external tool: in-process is fast and available offline, but may differ from the project's checked-in formatter and its configuration.", "Minimal edits from a diff vs whole-document replacement: minimal edits keep editor state intact, but cost diff computation on large files."],
    p: ["Formatting a file with a syntax error moves or deletes code around the broken region.", "Two formatters configured in different layers fight each other and change the file on every save."],
    v: "Format an already formatted file and confirm zero edits are returned; format a mangled one, apply, format again, and confirm the second result is empty.",
    dep: ["syntax-trees", "trivia-and-lossless-text", "settings-and-configuration", "incremental-edits"]
  },
  "semantic-tokens": {
    s: "Supplies per-token classification, such as variable, parameter, mutable or deprecated, so the editor can color code by meaning rather than by regular-expression syntax rules.",
    d: "The server walks the tree, resolves each identifier, and assigns it a type and modifier bits from a legend agreed at initialization, then encodes tokens as compact relative integers. Full-document, range and delta requests exist: delta sends only changes against a previous result id. The hard part is cost: classification needs resolution for every identifier in the file, yet it fires after every edit, so range requests for the viewport and delta encoding matter.",
    k: ["Full-file tokens vs viewport range plus delta: full is simplest, but delays coloring on large files; range and delta need result ids and consistent bookkeeping.", "Rich modifiers vs a small legend: richer legends enable better themes, but increase payload and client mismatch."],
    p: ["A delta computed against a result id the client no longer holds shows scrambled colors until a full refresh.", "Tokens resolved against stale analysis flash wrong colors on each keystroke."],
    v: "Open a ten-thousand-line file and confirm the visible region is colored within 200 ms, then type a character and confirm only a delta smaller than the whole payload is sent and colors stay correct.",
    dep: ["name-resolution", "syntax-trees", "capability-negotiation", "partial-results", "snapshots"]
  },
  "inlay-hints": {
    s: "Draws small annotations inside the text, such as inferred types, parameter names at call sites and chained-call types, without changing the file.",
    d: "For the visible range, the server walks the tree and, for each eligible node such as a variable without a type annotation, queries inference for the type and formats it as a label with optional links to definitions. Hints can be resolved lazily for tooltips and edits. The challenge is volume and noise: a dense file produces hundreds of hints, they are re-requested after each edit, and users disable them when they are wrong, long or in the way.",
    k: ["Computing for the visible range only vs the whole file: visible-only limits cost, but hints pop in while scrolling.", "Truncating long type labels vs showing them: truncation protects layout, but can hide the part of the type that matters."],
    p: ["Hints shift text as they appear, which moves the line under the cursor while the user is typing.", "Hints computed from stale inference show the wrong type for a variable that was just changed."],
    v: "Scroll through a long file with hints on and confirm every hint matches the type shown by hover for the same variable, with no request over 100 ms in the trace.",
    dep: ["type-inference", "syntax-trees", "partial-results", "cancellation", "settings-and-configuration"]
  },
  "folding-and-selection-ranges": {
    s: "Tells the editor where code regions can collapse and how a selection should grow outward by syntactic steps, using the tree rather than indentation.",
    d: "Folding ranges come from the syntax tree: blocks, comment runs, import groups and region markers. Selection range, given a position, returns a chain of nested ranges from the token outward to the whole file, which powers expand-selection commands. Both are syntax-only and so are quick and available early, but they depend on stable tree shapes. Hard cases are partially typed code, where recovery may produce a block that swallows the rest of the file.",
    k: ["Syntax-driven ranges vs indentation heuristics: tree-based ranges are accurate across languages and styles, but fail during unparseable states where indentation still works.", "Server-provided vs editor-native folding: server folding understands the grammar, but adds a round trip and latency on open."],
    p: ["An unclosed brace makes one fold cover the entire remainder of the file until it is closed.", "Folding state resets after each edit when range identities change, collapsing sections the user had expanded."],
    v: "Request selection ranges at a token inside a nested call and confirm the chain grows token, argument, call, statement, block, function, file, each strictly containing the previous one.",
    dep: ["syntax-trees", "error-tolerant-parsing", "trivia-and-lossless-text"]
  }
});
