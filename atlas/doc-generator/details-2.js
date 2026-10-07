// Details for the documentation generator plate, part 2: doc comment markup, cross-references, quality, API change.
ATLAS.details("doc-generator", {
  "comment-attachment": {
    s: "The rules that decide which comment belongs to which declaration: position before or after, blank lines, decorators, grouped members and file-level comments.",
    d: "A comment is attached to a declaration by position, usually the nearest following declaration with no blank line between, sometimes a trailing comment on the same line. Rules must handle attributes between comment and declaration, several declarations sharing one comment, fields in enumerations and comments on parameters. Attachment errors are silent: the text appears, on the wrong item. The rules must also treat ordinary comments, which are not documentation, differently from doc comments.",
    k: ["Comment before the declaration versus after: leading is the common convention and reads naturally; trailing suits short member notes and needs a clear rule for ambiguity.", "Strict adjacency versus allowing blank lines: strict adjacency prevents accidental attachment; tolerance forgives formatting and attaches stray comments."],
    p: ["A license header at the top of a file is attached to the first declaration and appears as its description.", "A decorator between comment and declaration breaks attachment and the item shows as undocumented."],
    v: "Extract a file with a header comment, a decorated function, a documented enum member and a trailing field comment. Each text must appear on exactly the item that visually owns it.",
    dep: ["comment-lexer"]
  },
  "comment-lexer": {
    s: "Recognizes doc comment delimiters in each style, strips leading decoration such as asterisks and indentation, and yields the raw text with accurate source positions.",
    d: "Doc comments come as line comments and block comments, each with a marker that distinguishes them from ordinary comments. The lexer strips the markers and common leading decoration, preserves relative indentation inside code blocks and records original line and column for each stripped line. Nested or unterminated comments, and markers inside string literals, are the difficult cases. Position mapping must survive stripping so that a markup error points at the right place in the file.",
    k: ["Strip indentation by common prefix versus per line: a common prefix preserves code block layout; per-line stripping is simple and destroys relative indentation.", "Lexing within the language parser versus separately: inside the parser it knows string literals; separate is reusable and can be fooled by comment-like text in strings."],
    p: ["A comment marker inside a string literal begins a bogus comment and swallows the code.", "Stripping all indentation flattens code samples inside comments."],
    v: "Lex a block comment with decorated lines and an indented code sample. The output text has no decoration, the sample keeps its relative indentation, and a markup error reports the original line number.",
    dep: ["text-encoding"]
  },
  "markup-parser": {
    s: "Parses the lightweight markup used in comments and prose into a document tree of paragraphs, lists, code blocks, tables, emphasis and links.",
    d: "The parser follows a defined grammar, usually a common lightweight markup with extensions for admonitions, tables, definition lists and directives. It produces a tree, not HTML, so later stages can resolve links, extract summaries and render to several formats. Real-world dialects differ in edge cases such as nested lists and blank-line handling, so a precise specification and conformance tests matter. Parsing speed matters because there is a comment for nearly every declaration.",
    k: ["Parse to a tree versus transform directly to HTML: a tree enables link resolution and multiple outputs; direct HTML is simpler and locks in one format.", "Extensible directives versus a fixed grammar: directives let projects add features; a fixed grammar is portable and slower to evolve."],
    p: ["A dialect difference makes the same comment render differently in the editor hover and in the published site.", "Pathological nesting makes the parser take quadratic time on one comment."],
    v: "Parse a corpus of comments that exercise nested lists, tables and code fences. Compare the tree against the dialect's published conformance cases, and confirm the largest comment parses in milliseconds.",
    dep: ["comment-lexer"]
  },
  "block-tags": {
    s: "Structured sections in a doc comment, such as parameters, return value, errors raised and examples, validated against the declaration they describe.",
    d: "A block tag begins a labeled section: parameter descriptions, what is returned, what can fail, related items, and custom tags a project defines. The parser records each in the doc tree, and a validator compares them to the declaration: a documented parameter that does not exist is an error, a missing one is a warning. Tag semantics vary between ecosystems, so projects often define their own. Translating tags to readable headings is a template concern.",
    k: ["Tag-based parameter docs versus prose in the description: tags enable per-parameter tables and checks; prose reads naturally and cannot be validated.", "Fixed tag vocabulary versus custom tags: a fixed set keeps docs uniform; custom tags capture project concepts and need support in every theme."],
    p: ["A parameter is renamed in code and the tag keeps the old name, so the table shows a nonexistent parameter.", "Unknown tags are dropped silently, and the information never reaches the page."],
    v: "Rename a parameter and leave its tag unchanged. The build must report a tag that names no parameter, citing the file and line of the comment.",
    dep: ["markup-parser","declaration-model"]
  },
  "inline-tags": {
    s: "Constructs inside running text that refer to symbols, insert code or values, or carry directives, such as link tags and code-formatted names.",
    d: "Inline tags mark a span of text as a link to a symbol, a code literal, a value pulled from elsewhere, or a reference to an example. They are parsed into nodes in the doc tree and handed to the resolver later. Their syntax collides with ordinary text, for example braces in code samples, so escaping rules matter. Because links are written by name, they often include a display label that must be preserved.",
    k: ["Inline link tags versus automatic linking of known names: explicit tags are unambiguous; automatic linking saves typing and links words that were not meant as references.", "A tag for every construct versus few general tags: many tags are precise and hard to learn; few are simple and need arguments."],
    p: ["Braces in a code sample are parsed as a tag and the sample is mangled.", "Auto-linking turns a common word that matches a function name into a link."],
    v: "Write a comment with a link tag carrying a label, a literal brace in a code span and a plain word matching a symbol. Only the tag becomes a link, the label is shown, and the brace is intact.",
    dep: ["markup-parser","reference-syntax"]
  },
  "doc-inheritance": {
    s: "Lets an overriding or implementing member reuse documentation from the member it overrides, an interface method or a base type, unless it supplies its own.",
    d: "Implementations of an interface often say the same thing as the interface. Inheritance walks the type hierarchy, finds the nearest documented ancestor and copies or references its doc tree, optionally merging tags so only changes are written. It needs the full hierarchy, including types from other packages. Authors need a way to say inherit this part, replace that part. Without it, either every override repeats text or implementations appear undocumented.",
    k: ["Inherit automatically versus on explicit request: automatic gives coverage with no effort and can publish text that is wrong for the override; explicit is deliberate and rarely done.", "Copy text at build time versus link to the ancestor: copying reads standalone; linking avoids duplication and sends readers away."],
    p: ["An override with different behavior inherits text describing the base behavior and misleads callers.", "A hierarchy that crosses packages is incomplete because the other package's model is not loaded."],
    v: "Document an interface method and implement it in two classes, one with its own comment. The first class's page shows the inherited text with a note of origin, and the second shows its own.",
    dep: ["block-tags","declaration-model"]
  },
  "html-sanitizer": {
    s: "Filters or escapes raw HTML embedded in comments and prose, allowing a safe set of elements and attributes and removing scripts, handlers and dangerous URLs.",
    d: "Authors sometimes embed HTML for layout the markup cannot express. The sanitizer parses it into a tree, keeps allowed elements and attributes, rewrites relative URLs against the page, and drops anything that can execute code, including event attributes and script-bearing URL schemes. It runs after markup parsing and before rendering. The hard part is the allowlist: too tight breaks legitimate tables and details blocks, too loose leaves an injection path.",
    k: ["Allowlist versus denylist: an allowlist fails closed when browsers add features; a denylist is easier to start and misses new attack vectors.", "Sanitize at build time versus at read time in the browser: build time costs nothing for readers; read time protects against late changes and costs script on every page."],
    p: ["An allowed link element keeps a script-bearing URL scheme and the page runs injected code.", "Sanitizing before relative-link rewriting leaves broken links that the link checker then misses."],
    v: "Feed comments containing an inline event handler, a script tag and a link using a script URL scheme. The generated page keeps the safe content and none of the three survive in the output.",
    dep: ["markup-parser"]
  },
  "symbol-table": {
    s: "An index of every documented declaration by qualified name, kind, aliases and page location, used to resolve references and build navigation and search.",
    d: "After extraction, the table is built over the whole model: each declaration gets a stable identifier, qualified name, URL and parent. Lookup supports exact names, partial names relative to a scope, and searching by kind. It merges re-exports and records which declarations are hidden. Since resolution happens across the entire project, the table is global state in an otherwise parallel pipeline, and must be complete before references can be resolved.",
    k: ["Qualified names as the key versus generated opaque ids: names are readable and change when code is renamed; opaque ids survive renames and are meaningless to authors.", "Build once before resolution versus incrementally during parsing: once is simple and serializes the pipeline; incremental allows overlap and risks order-dependent results."],
    p: ["Two declarations with the same qualified name in different packages collapse into one entry.", "A symbol hidden from docs is still resolvable and links to a page that does not exist."],
    v: "Resolve every symbol in the table to a URL and fetch each one in the built site. All must return pages, and the count of table entries equals the count of symbol pages plus aliases.",
    dep: ["declaration-model","slug-generation"]
  },
  "reference-syntax": {
    s: "The notation authors use to name a target in a link: qualified or relative names, scope hints, kind prefixes, anchors and labels.",
    d: "A reference such as a dotted name, a name with a kind hint or a name with a parameter list tells the resolver what to find. The syntax decides how much context is implied: relative to the current scope, or imported names. It must be easy to type, unambiguous when a name is overloaded and tolerant of renames. It should also work in both comments and prose, with the same meaning, and be parseable by editor tools.",
    k: ["Context-relative names versus always fully qualified: relative are short and break when the declaration moves; fully qualified are verbose and stable.", "One syntax for all targets versus a form per kind: one is easy to learn; per-kind forms are precise and numerous."],
    p: ["A relative reference resolves differently when the comment is inherited into another scope.", "A syntax too close to ordinary punctuation links words nobody meant as references."],
    v: "Write references by qualified name, by relative name inside a class and by name with kind hint. Each resolves to the intended target in the built site, and all appear in the unresolved report when the target is removed.",
    dep: ["symbol-table"]
  },
  "reference-resolver": {
    s: "Turns each unresolved reference in the doc trees into a link to a specific page and anchor, using scope, imports and the symbol table.",
    d: "The resolver walks every doc tree after the symbol table is complete, looks up each reference from its scope outward, follows imports and aliases, and replaces the node with a resolved link or an unresolved marker. Targets can be declarations, prose pages, headings and external projects. It runs over the whole model, so it is a natural point to collect statistics, backlinks and warnings. It must be deterministic: resolving by search order that depends on file order gives different links.",
    k: ["Resolve at build time versus in the browser: build time can check and fail; browser resolution handles late-bound targets and breaks without script.", "Nearest scope wins versus require uniqueness: nearest scope matches how programmers read; requiring uniqueness is strict and noisy."],
    p: ["Resolution order depends on discovery order, so links change between machines.", "A reference resolves to a same-named item in the wrong package without any warning."],
    v: "Resolve a project with two same-named types in different packages and references from both. Each link goes to the type in its own scope, and the result is identical across repeated builds.",
    dep: ["symbol-table","reference-syntax","inline-tags"]
  },
  "overload-disambiguation": {
    s: "Chooses among declarations that share a name, such as overloads and same-named members in different scopes, and gives each its own stable anchor.",
    d: "When several callables share a name, a reference must pick one, and a page must show all of them without anchors colliding. Disambiguation uses parameter types, arity, kind hints or generated suffixes. Anchor naming for each overload should depend on its signature and not its position, or reordering code changes every link. Languages without overloading still hit this problem with the same name in different namespaces.",
    k: ["Signature-based anchors versus ordinal suffixes: signatures survive reordering and are long; ordinals are short and change when overloads are added.", "Group overloads on one page versus separate pages: grouping aids comparison and makes long pages; separate pages link precisely and scatter related text."],
    p: ["Adding an overload shifts numbered anchors and every existing link points at the wrong one.", "A reference with no hint silently links to the first overload."],
    v: "Add a new overload before an existing one and rebuild. Links to the original overload still land on it, and a bare reference reports that it is ambiguous.",
    dep: ["symbol-table","signature-resolution"]
  },
  "external-inventories": {
    s: "Index files published by other projects listing their documented names and URLs, loaded so references can link to dependencies' documentation.",
    d: "Each project can publish an inventory mapping qualified names to page URLs and anchors. At build time the generator downloads inventories listed in configuration and adds them to the resolver as a read-only scope. This is how a project links to the standard library or its dependencies without copying them. The risks are freshness and shape: an inventory is a snapshot of one version, and remote pages can move, so links decay without notice.",
    k: ["Pin inventory versions versus follow latest: pinned links match the dependency version in use; latest links are always live and may describe a newer API.", "Link only on explicit configuration versus guess from package names: explicit is predictable; guessing links more and sometimes to wrong projects."],
    p: ["An inventory for the wrong version links to pages that describe different behavior.", "The remote inventory host is unreachable and the build either fails or silently drops all external links."],
    v: "Configure an inventory for one dependency and reference one of its types. The link goes to the dependency page for the configured version, and the link checker confirms the target loads.",
    dep: ["reference-resolver","http-fetcher","doc-model-format"]
  },
  "source-links": {
    s: "Links from each documented item to its definition in the hosted repository, at the exact revision and line range the documentation was built from.",
    d: "Each declaration carries a source range. A URL template combines repository address, revision, relative path and line numbers into a link on the page. Revision matters most: a link to a branch moves as code changes, a link to the built revision stays correct. Complications include generated code, monorepos where the path inside the repository differs from the package path, and code hosts with different URL schemes.",
    k: ["Link to the built revision versus the default branch: revision links stay accurate and go stale; branch links stay current and drift off the described lines.", "Line ranges versus file only: lines send readers to the code and break when the file changes; file links are robust and vague."],
    p: ["A template with a wrong path prefix produces links to missing files on every page.", "Links to a branch point at lines that no longer contain the declaration."],
    v: "Open the source link from five pages built from a tagged revision. Each lands at the declaration on that tag, and the line number matches the one shown in the model.",
    dep: ["declaration-model","repo-checkout","project-config"]
  },
  "unresolved-references": {
    s: "Reports references that cannot be resolved, with the file, line and nearest suggestions, and applies the configured policy of failing the build, warning or emitting plain text.",
    d: "When resolution fails, the tool records the reference text, location and the scope searched. It can suggest likely names, based on edit distance. Policy decides the effect: fail, warn or render without a link. For a growing project, a baseline file records existing failures so new ones are caught without fixing the backlog. The output must be precise enough that an author can act without searching.",
    k: ["Fail the build versus warn: failing keeps docs correct and blocks unrelated work; warning is gentle and the warnings accumulate unread.", "Baseline of known failures versus a clean slate: a baseline allows adoption on legacy projects; a clean slate forces cleanup first."],
    p: ["A warning count that is never zero is ignored, and new failures hide inside it.", "A reference to a hidden symbol is reported as a typo and sends authors on a pointless search."],
    v: "Reference a name that does not exist. The report names the file and line, suggests the closest existing name, and in strict mode the build exits with a failure status.",
    dep: ["reference-resolver","strictness-policy"]
  },
  "link-checker": {
    s: "Verifies that every internal and external link in the generated site points to a page that exists and responds, after redirects.",
    d: "The checker crawls the output tree, collects each link, resolves internal ones against the file list and queries external ones over the network, honoring redirects and rate limits. It reports the page holding the broken link. Internal checking is fast and exact; external checking is slow and flaky, so it usually runs on a schedule and with retries. Links that need authentication, rate-limited sites and links generated by script need explicit rules.",
    k: ["Check external links on every build versus on a schedule: every build catches problems early and fails for reasons unrelated to the change; a schedule isolates outages.", "Fail on redirects versus follow them: failing keeps links current; following is tolerant and allows chains to grow."],
    p: ["A temporary outage on a third-party site fails an unrelated pull request.", "Client-side generated links are invisible to a static crawl and are never checked."],
    v: "Remove a target page and rebuild. The checker lists every page linking to it, and with the page restored the same run reports zero broken internal links.",
    dep: ["http-fetcher","path-and-url-model","redirect-map"]
  },
  "fragment-validation": {
    s: "Checks that links with a fragment point at an anchor that exists on the target page, including generated heading and symbol anchors.",
    d: "A link to a page can be valid while its fragment is not: headings get renamed, symbols overloaded, sections removed. The validator extracts all anchors from each output page and compares them with each link's fragment. It must know anchors added by scripts or the theme. Because heading anchors derive from heading text, a rewording changes the URL, which is why this check matters more than the page-level one.",
    k: ["Validate fragments at build time versus ignore them: build-time validation catches renamed headings; ignoring is faster and leaves readers at the top of a long page.", "Explicit anchors on important headings versus generated ones: explicit anchors survive rewording; generated ones need no effort and move."],
    p: ["A heading is reworded and every deep link to it silently lands at the page top.", "Case differences between link and anchor work in some browsers and tools and fail in others."],
    v: "Reword a heading that other pages link to and rebuild. The checker lists each link whose fragment no longer exists, naming source page and target anchor.",
    dep: ["link-checker","heading-anchors"]
  },
  "doc-coverage": {
    s: "Measures the share of public declarations, parameters and tags that have documentation, and reports or enforces a threshold.",
    d: "Using the filtered model, the tool counts public items with and without comments, optionally checking that parameters, return values and errors are described. Results are reported per package and as a trend. A threshold can fail the build, often as a ratchet that must not fall. Coverage measures presence, not quality, so a one-word comment passes; rules can require a minimum length or forbid text copied from the name.",
    k: ["Hard threshold versus a ratchet that only rises: a threshold sets a clear bar and may be gamed; a ratchet protects progress and fixes no existing gaps.", "Count presence versus judge quality: presence is cheap and objective; quality checks are subjective and annoy authors."],
    p: ["Authors add a comment repeating the name to pass the threshold, and coverage rises while usefulness does not.", "Generated or inherited items counted as undocumented drag the number down."],
    v: "Add a public function with no comment. Coverage for its package falls by the expected fraction, the report lists the function by name, and a configured threshold turns the build red.",
    dep: ["declaration-model","visibility-filter","block-tags"]
  },
  "runnable-examples": {
    s: "Executes the code examples in docs, from comments and prose, as part of the test run, so a broken example fails the build.",
    d: "Code blocks marked as runnable are extracted, wrapped in the context they need, compiled or executed, and optionally compared with expected output. Examples that cannot run, because they need credentials, hardware or long time, are marked and skipped explicitly. Failures report the page and line of the example. This is the strongest guard against documentation rot for code, and also the most expensive: it needs sandboxing, dependencies and a way to show only the interesting lines.",
    k: ["Run every example versus compile only: running proves behavior and needs a sandbox and slow tests; compile-only catches API drift cheaply and misses wrong output.", "Hidden setup lines versus complete examples: hidden lines keep pages short and hide what readers need to copy; complete examples are longer and reproducible."],
    p: ["Examples marked as not runnable pile up until most of the page is untested.", "An example passes because it asserts nothing, so a behavior change goes unnoticed."],
    v: "Change an API so one example no longer compiles and another prints different output. The test run fails for both, naming each page and line, and passes again after the examples are updated.",
    dep: ["snippet-extraction","example-sources","block-tags"]
  },
  "snippet-extraction": {
    s: "Pulls code blocks out of comments and prose into standalone units with their language, options and context, ready to compile, run or lint.",
    d: "The extractor finds fenced or marked blocks in the doc trees, reads their attributes, such as language, expected output or whether to hide a line, and assembles each into a unit with the imports and wrapper code needed to build it. It records the origin so failures point back to the page. It must handle multiple blocks that build on each other, which share state in order, and blocks that are intentionally incomplete.",
    k: ["Blocks independent versus cumulative within a page: independent blocks are simple and repeat setup; cumulative blocks read like a tutorial and fail if an earlier one is edited.", "Wrap automatically versus require full programs: automatic wrapping keeps docs short and hides assumptions; full programs are honest and long."],
    p: ["A block meant as pseudocode is extracted and fails compilation, and authors disable the check.", "The wrapper code changes the meaning of an example and hides a missing import from readers."],
    v: "Extract blocks from a page with two cumulative blocks and one pseudocode block. The first two build in order, the third is skipped by its marker, and an error cites the page and line.",
    dep: ["markup-parser","block-tags"]
  },
  "prose-linting": {
    s: "Applies configurable rules to documentation text for spelling, terminology, tone, heading structure and formatting, reporting violations with locations.",
    d: "The linter walks the doc trees and prose files, ignores code and links, and applies rules: a spelling dictionary with project terms, preferred words, sentence length, heading order and required sections. Rules have severities and can be disabled with inline markers. Run in CI, it keeps a large contributor base consistent. Too many noisy rules make authors ignore the tool, so rules are introduced gradually and each should have a clear reason.",
    k: ["Strict style enforcement versus advisory hints: strict gives consistency and slows contributors; advisory is friendly and is soon ignored.", "Shared central ruleset versus per-project rules: shared rules give consistent voice; per-project rules fit local terms and drift."],
    p: ["Project terms and identifiers are flagged as misspelled until the dictionary is maintained, and authors stop reading output.", "Rules applied to generated reference text flag things authors cannot change."],
    v: "Introduce a banned term, a misspelled word and a skipped heading level into a page. The linter reports each with file and line, and the term inside a code span is not reported.",
    dep: ["markup-parser","project-config"]
  },
  "strictness-policy": {
    s: "Defines which warnings fail the build, which are shown and which are suppressed, per environment and per check, with a way to record exceptions.",
    d: "Each check emits diagnostics with a code and severity. The policy maps codes to outcomes: errors stop the build, warnings are listed, notices are quiet. Local previews are lenient so authors can iterate; release builds are strict. Suppressions must be explicit, localized and ideally expire, otherwise they accumulate. The policy is also where adoption plans live: a legacy project starts lenient and tightens each release.",
    k: ["Strict in CI and lenient locally versus the same everywhere: split keeps authors productive and surprises them in CI; identical is predictable and slower to iterate.", "Inline suppressions versus a central list: inline suppressions sit next to the problem; a central list is auditable and easily forgotten."],
    p: ["Authors suppress a warning to merge and never revisit it.", "A new tool version adds checks and every project's build breaks at once."],
    v: "Trigger one warning in a lenient local build and the same in strict mode. The first lists it and exits successfully, the second fails, and a suppression with a reason silences only that location.",
    dep: ["project-config"]
  },
  "api-snapshot": {
    s: "A normalized record of a release's public API, with names, signatures, kinds and modifiers, stored so later releases can be compared against it.",
    d: "At each release the public declarations are reduced to a canonical, sorted form that omits comments and formatting but keeps everything affecting compatibility: names, parameter and return types, generics, visibility, constants and inheritance. It is stored with the source revision. Because it is built from the filtered model, hiding rules affect what counts as API. A snapshot is also the baseline for a compatibility gate in CI.",
    k: ["Snapshot of only public API versus all declarations: public-only matches what users depend on; all declarations catch internal changes and add noise.", "Store snapshots in the repository versus as release artifacts: in-repo changes show up in review; artifacts keep the repository small and are less visible."],
    p: ["A snapshot taken before hiding rules were applied includes internal items, and every release shows spurious changes.", "Snapshot format changes make old and new snapshots incomparable."],
    v: "Generate the snapshot twice from the same revision and compare bytes. Add one public function and confirm only that function is added in the next snapshot.",
    dep: ["declaration-model","visibility-filter","doc-model-format"]
  },
  "api-diff": {
    s: "Compares two API snapshots and lists added, removed and changed items with a precise description of each change.",
    d: "The engine matches declarations between versions by identity, then compares signatures part by part: parameters added, types widened, defaults changed, members made less visible. Renames are the hard case, since a rename looks like a removal plus an addition unless the author records it. The output is structured so that classification rules, changelogs and reviewers can all use it. It must handle generics and inheritance changes that alter many items at once.",
    k: ["Match by name only versus by name and similarity: name-only is exact and sees renames as removal; similarity finds renames and sometimes pairs unrelated items.", "Compare declared signatures versus effective behavior: signatures are mechanical and cheap; behavior needs tests and cannot be inferred from names."],
    p: ["A moved symbol is reported as one removal and one addition, and the breaking change gets noise instead of a clear message.", "Changes to a base type are repeated for every subtype and bury the one real change."],
    v: "Compare two snapshots where one function gains a parameter, one is removed and one is renamed with a recorded alias. The report lists exactly three entries with correct kinds.",
    dep: ["api-snapshot","declaration-model"]
  },
  "breaking-rules": {
    s: "Rules that classify each API difference as compatible, breaking or ambiguous for source, binary or behavior compatibility, with severity.",
    d: "Not all differences are equal: adding an optional parameter may be safe in one language and breaking in another, narrowing a return type may be safe while widening it is not. The rule set encodes the language's compatibility semantics and the project's policy, for example what counts as public and which change types are allowed in a minor release. Output labels each change and can gate a release. Rules differ between languages and between source-level and binary-level compatibility.",
    k: ["Language-specific precise rules versus a conservative generic rule: precise rules avoid false alarms and need expertise; conservative rules are simple and flag harmless changes.", "Block the release versus require an acknowledgment: blocking protects users and stalls necessary breaks; acknowledgment is flexible and can be waved through."],
    p: ["A change judged compatible at source level breaks existing compiled consumers.", "Treating every change as breaking makes teams ignore the gate."],
    v: "Run the diff on a minor release candidate that removes a parameter. The gate marks it breaking, names the item and rule, and an approved exception recorded in config changes the outcome to a documented waiver.",
    dep: ["api-diff","versioning-policy"]
  },
  "deprecation-metadata": {
    s: "Structured information on a deprecated item: since which version, the replacement, planned removal version and a reason, stored in the declaration model.",
    d: "Deprecation is carried in language attributes, doc tags or both, and the extractor normalizes them into one record. The record includes the replacement as a resolvable reference, so the page can link to it, and the version in which removal is planned. Tools consume the metadata for notices, changelogs and warnings to callers. Without structure, a deprecation is a sentence of prose that no tool can find or check.",
    k: ["Structured fields versus free text: fields allow notices, queries and checks; free text is easy to write and is invisible to tools.", "One source in the language attribute versus a doc tag: the attribute drives compiler warnings for callers; the tag carries richer prose and can disagree with it."],
    p: ["The code is marked deprecated and the docs are not, or the reverse, so readers get conflicting advice.", "The named replacement does not exist because it was renamed."],
    v: "Deprecate a function with a replacement and a removal version. The declaration record contains all three fields, and the replacement resolves to a real page.",
    dep: ["block-tags","declaration-model","reference-resolver"]
  },
  "deprecation-notices": {
    s: "Visible warnings on deprecated items' pages, in navigation and in search results, with a link to the replacement and the removal timeline.",
    d: "Templates render a banner on the page of a deprecated item, mark it in sidebars and indexes, and lower its search rank. Reference lists can be filtered to hide or group deprecated items. A site-wide deprecations page lists everything scheduled for removal. Notices must not be so loud that they drown out the page, but readers searching by the old name must still find the page and learn what to use instead.",
    k: ["Keep deprecated pages versus remove them: keeping helps people maintaining old code; removing declutters and breaks inbound links.", "Hide deprecated items in listings versus show them marked: hiding reduces noise for new users; showing is honest about the surface."],
    p: ["A deprecated function ranks above its replacement in search and new users adopt it.", "Banners appear only on the page and not in the index, so readers never see the warning."],
    v: "Deprecate a function and rebuild. Its page shows a banner linking to the replacement, the sidebar entry is marked, and a search for its name returns it below the replacement.",
    dep: ["deprecation-metadata","theme-system","search-ranking"]
  },
  "since-tags": {
    s: "Metadata recording the release in which an item was added or changed and the release it will be removed in, shown on pages and used for filtering.",
    d: "Authors or the diff engine record the first version of each declaration. Pages show the badge, and version filters can list new items per release. Automatic derivation from successive snapshots avoids reliance on authors remembering the tag, and handles items that existed before documentation started. Conflicts between a hand-written tag and the computed value reveal mistakes. It requires a reliable sorted version ordering.",
    k: ["Hand-written tags versus computed from snapshots: hand-written tags are available immediately and are forgotten; computed values are accurate and need stored snapshots.", "Show badges on every item versus only recent ones: every item is complete and cluttered; recent-only reduces noise and hides history."],
    p: ["A new function carries no since tag and users assume it exists in older releases.", "Version strings compared as text place the tenth release before the second."],
    v: "Add a function in a new release. Its page shows the version badge matching the snapshot where it first appears, and the new release's changelog lists it.",
    dep: ["api-snapshot","version-model","block-tags"]
  },
  "changelog-generation": {
    s: "Produces release notes from API diffs, deprecations and commit or change records, grouped by kind of change and linked to affected pages.",
    d: "The generator combines the machine-detected API changes with human-written entries, for example fragments filed with each change. It groups by section, orders by importance and links each entry to the item or issue. Machine-generated lists are complete and terse, while human text explains why and what to do. A good pipeline requires one per change entry and merges them at release, which avoids conflicts in a single shared file.",
    k: ["One file per change versus a shared changelog file: per-change files avoid merge conflicts and need assembly; a shared file is simple and conflicts constantly.", "Generated from commits versus written by hand: commits are complete and unreadable; handwritten entries are clear and often missing."],
    p: ["A breaking change appears in the diff but no author-written note, and the release notes omit what to do.", "Entries refer to internal items that are not in the published docs."],
    v: "Prepare a release with one added function, one deprecation and one hand-written entry. The generated notes contain all three in the right sections with working links to their pages.",
    dep: ["api-diff","deprecation-metadata","release-notes-pages"]
  }
});
