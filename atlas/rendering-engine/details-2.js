// Details for the rendering engine plate, part 2: DOM and shadow trees, CSS parsing and CSSOM, matching and cascade.
ATLAS.details("rendering-engine", {
  "node-tree": {
    s: "The in-memory tree of document, element, text and other nodes, with links to parent, siblings and children, shared by script, style and layout.",
    d: "Each node stores pointers for tree navigation, a reference to its owning document, and flags describing state such as connected, dirty for style, or has a shadow root. Elements hold attributes and a computed-style pointer. Nodes are optimized for size, because pages have hundreds of thousands, so rare data lives in side tables. Tree operations preserve invariants like no cycles and single parentage, and notify other systems. The hard part is keeping the node small and the traversal fast while carrying everything the other stages hang off it.",
    k: ["Sibling-linked children vs child arrays: constant-time insertion and removal in the middle, but indexed access is linear and needs caching.", "Rare fields in side tables vs inline: smaller common nodes and better cache use, but each rare feature costs a lookup and an extra allocation."],
    p: ["Adding a field to every node multiplies by the node count and can add megabytes on large pages.", "Operations that skip the invariant checks can create cycles that hang the next traversal."],
    v: "Load a page with one hundred thousand elements and measure per-node memory. Then insert and remove nodes at the front of a long child list and confirm the time stays flat as the list grows.",
    dep: ["node-wrappers"]
  },
  "mutation-model": {
    s: "The set of operations that change the tree and attributes, each of which updates invariants, marks dirty state and notifies every interested system in a fixed order.",
    d: "Insertions, removals, attribute changes and text edits all go through a few primitives. Each one runs pre-checks, changes the links, then calls hooks: mark ancestors as having dirty descendants, tell style which selectors may be affected, tell layout the box tree needs updating, queue custom element reactions and mutation records, and update live ranges and collections. Hooks must tolerate that script may run between steps. The design problem is covering every side effect exactly once without a slow path, and doing it identically for the thousand callers of the primitives.",
    k: ["Central primitives with notification hooks vs ad hoc updates at call sites: one place guarantees every observer is told, but every new subsystem adds cost to the hottest path.", "Batching dirty marks vs immediate recomputation: many edits cost one update later, but reads must be able to force the pending work."],
    p: ["A mutation path that forgets to notify style leaves an element showing stale styling until some unrelated change.", "Running script between the link update and the hooks lets observers see a half-updated tree."],
    v: "Perform every kind of mutation inside one observed subtree, then compare the delivered mutation records, collection contents and rendered output against a fresh page built directly in the final state.",
    dep: ["node-tree", "style-invalidation", "layout-invalidation", "dom-ranges", "custom-element-reactions", "observers"]
  },
  "live-collections": {
    s: "Collections such as elements by tag name or children that always reflect the current tree, implemented with caches that are invalidated by mutation.",
    d: "A live collection is defined by a root and a filter, and script expects to read its length and items after any change. Recomputing by traversal on each access would be quadratic in loops, so the engine caches the last visited index and node, and a document-wide version counter or per-root flag that mutation bumps to invalidate caches. Iteration then walks incrementally from the cached position. It is hard because collections must stay correct under mutation during iteration and must not keep large subtrees alive when script holds them.",
    k: ["Lazy cached traversal vs eagerly maintained lists: no per-mutation cost for unused collections, but a first access after any mutation is a full scan.", "Invalidating by a counter vs by precise change tracking: a counter is cheap and always safe, but unrelated mutations discard useful caches."],
    p: ["A loop that appends to a node while reading a live length can run forever or skip items.", "Holding many live collections on a heavily mutated tree makes every mutation touch every cache."],
    v: "Loop over a live collection of ten thousand items, reading length and indexing each iteration, with and without interleaved mutations. Time must stay linear in the unmutated case and results must stay correct in the mutated case.",
    dep: ["node-tree", "mutation-model"]
  },
  "shadow-roots": {
    s: "A separate subtree attached to a host element, with its own scoping for style and queries, so a component's internals stay encapsulated.",
    d: "A shadow root is a node attached to a host element. Its children render in place of the host's own children, which are redistributed through slots. Style rules inside it do not match outside, and outer rules do not match inside, apart from inheritance and explicit hooks such as custom properties and parts. Events crossing the boundary are retargeted, and queries from outside do not see the contents. Modes decide whether script can reach the root from the host. It is hard because every algorithm that walks the tree has to decide which tree it means.",
    k: ["Style scoping per root vs global style: components do not leak or break, but every matching and invalidation path must track which scope a rule belongs to.", "Open vs closed roots: closed hides internals from script, but is not a security boundary and complicates tooling and testing."],
    p: ["Assuming a single global tree in a tree-walking algorithm exposes or misses shadow content.", "Many shadow roots, each with duplicated style sheets, multiply parse and memory cost unless sheets are shared."],
    v: "Attach a shadow root with a style rule that targets a paragraph, and put a paragraph in the light tree. Only the shadow paragraph is styled, and an outer query cannot find the shadow paragraph.",
    dep: ["node-tree", "slot-assignment", "flat-tree", "rule-sets"]
  },
  "slot-assignment": {
    s: "Matches a host's child nodes to named slots inside its shadow tree, and updates the assignment as children or slot names change.",
    d: "Each host child is assigned to the slot whose name matches its slot attribute, or to the default slot if it has none. Assignment is computed lazily and recomputed when children, attributes or slots change, and a slotchange event is queued when a slot's list changes. Manual assignment lets script choose directly. The assignment determines both the flat tree used for rendering and event paths. The challenge is doing this incrementally when slots nest, when hosts hold thousands of children, and when assignment is read in the middle of a mutation.",
    k: ["Lazy recomputation on read vs eager updates: mutations stay cheap, but a read after a change pays for assignment, which may be large.", "Name-based vs manual assignment: declarative and easy to reason about vs full script control, with more places to get inconsistent."],
    p: ["Reading assigned nodes during a mutation returns a stale list unless the dirty flag is checked.", "Nested slots that forward each other can produce long chains that make each flat-tree walk slow."],
    v: "Add, rename and remove slotted children and slots in a component with nested slots. After each step the assigned lists, the rendered order and the slotchange events must match the specified results.",
    dep: ["shadow-roots", "mutation-model", "flat-tree"]
  },
  "flat-tree": {
    s: "The composed tree that results from replacing each host's children with its shadow tree and slotted content, and the tree that style, layout and focus actually walk.",
    d: "Rendering does not use the node tree directly. It uses a view in which a host's rendered children are its shadow root's children, and each slot is replaced by its assigned nodes. Style inheritance, layout box creation, hit testing and focus order all follow that composed order, while script and selectors still use the original trees. Implementations compute it on demand with traversal helpers instead of storing it. The difficulty is making every traversal in the engine use the right tree and keeping it fast, since it is on the hot path.",
    k: ["Computing the flat tree on the fly vs materializing it: no extra memory or sync problem, but every parent and next-sibling lookup has branching.", "A single flat-tree traversal API vs each stage walking its own way: consistency, but a bug in the shared helper affects everything."],
    p: ["Inheriting style from the node parent instead of the flat parent gives slotted content the wrong inherited values.", "Using light-tree order for focus or hit testing makes components behave differently from what is drawn."],
    v: "Build a component that reorders slotted children with two slots. Confirm inherited color, tab order and hit test results all follow the rendered order and not the order in the light tree.",
    dep: ["shadow-roots", "slot-assignment", "node-tree"]
  },
  "dom-ranges": {
    s: "Objects that mark a span between two tree positions, and which adjust automatically as the tree changes, used by selection, editing and find.",
    d: "A live range holds a start and end, each a node and offset. When nodes are inserted, removed or split, or text data changes, the engine must update every registered range so the span keeps pointing at the same content. Mutation primitives therefore consult a per-document list of ranges. Ranges support extracting, cloning and deleting content, and give rectangles for painting. It is hard because registration costs every mutation, and boundary points have to follow subtle rules when a node is moved or merged.",
    k: ["Updating all live ranges on every mutation vs static ranges: the behavior script and editing depend on, but every text edit pays a scan of the range list.", "Storing offsets vs node references only: offsets are compact and serializable, but they shift when siblings change and need adjustment rules."],
    p: ["Leaking ranges that are never released slows every later mutation in the document.", "Forgetting to adjust a range on node merge points it at a detached node and breaks the selection."],
    v: "Create a range over a word, insert text before it, split the text node in the middle of it, and remove a sibling. The range's string must still return exactly the original word.",
    dep: ["node-tree", "mutation-model"]
  },
  "node-wrappers": {
    s: "The scheme that ties each native node's lifetime to its script wrapper object and to the garbage collector, so neither is freed while the other can still reach it.",
    d: "A script wrapper must stay alive while the page can reach it, and so must its native node. Conversely the node should be freed when nothing reaches it. Because the object graph spans two heaps, the engine reports edges from native nodes to wrappers to the collector, often as trace hooks, treating a whole connected tree as one group. Nodes in the document are kept alive by the document. It is hard because cycles across the boundary are common, listeners hold closures, and a missed edge causes either a leak or a use of freed data.",
    k: ["Tracing native objects through the script collector vs reference counting with manual cycles: precise lifetime and fewer leaks, but the native side needs tracing support everywhere.", "Treating a tree as one group vs per-node edges: far cheaper to trace, but a single live wrapper keeps the entire detached tree alive."],
    p: ["A detached subtree kept alive by one forgotten wrapper reference leaks memory proportional to its size.", "A missing trace edge lets the collector free a native object that script still uses."],
    v: "Repeatedly create, attach, detach and drop subtrees with listeners. The heap size must plateau across many cycles, and a heap snapshot should show no detached trees without a live reference.",
    dep: ["node-tree", "script-bindings"]
  },
  "css-tokenizer": {
    s: "Converts style sheet text into a stream of tokens such as identifiers, numbers, dimensions, strings and delimiters, following the CSS syntax rules.",
    d: "The tokenizer is a small state machine defined by the CSS syntax standard. It handles escapes, comments, url tokens with their special rules, and number and dimension recognition. It produces tokens for the parser without building any structure, and the same tokenizer is reused for style attributes, custom property values and script-provided strings. Performance matters because style sheets can be megabytes. The difficulty is exact behavior in odd cases like unterminated strings and bad urls, which the parser then uses to decide what to recover from.",
    k: ["Tokenizing the whole sheet up front vs lazily with the parser: simpler code and reuse of tokens, but memory spikes for large sheets, so parsers often stream.", "One shared tokenizer for all inputs vs specialized fast paths: consistent errors, but hot paths like simple declarations benefit from shortcuts."],
    p: ["A mishandled escape sequence lets a crafted selector or value change meaning when it is serialized.", "Treating a bad url token like a normal one lets malformed input swallow the following rules."],
    v: "Run the tokenizer conformance tests with escapes, bad urls, unterminated strings and comments, and compare token types and values to the reference output.",
    dep: []
  },
  "css-parser": {
    s: "Builds rules, selectors and declarations from tokens, dropping what it cannot understand and resuming at the next safe point.",
    d: "The parser follows the CSS syntax algorithm: parse a list of rules, then for each qualified rule parse a selector prelude and a block of declarations. Invalid declarations and rules are dropped, with recovery at the next semicolon or closing brace, so a sheet is forward compatible: new syntax in old engines is skipped, not fatal. Nesting, at-rules and custom property values with arbitrary tokens complicate it. Parsed output feeds the CSSOM and the rule indexes. Hard parts are speed on large sheets, fidelity of error handling, and lazy parsing of rules that might never match.",
    k: ["Dropping invalid declarations vs failing the sheet: pages survive new syntax in old engines, but typos fail silently and are hard to debug.", "Lazy parsing of rule bodies vs eager: faster load for sheets mostly unused, but the first use pays and errors surface late."],
    p: ["An unbalanced brace in one rule can swallow rules after it unless recovery follows the specified points.", "Eagerly parsing every rule in a large framework sheet delays first render for rules never used."],
    v: "Parse a sheet with unknown properties, a misspelled value, an unclosed block and new nesting syntax. Valid rules around each error must still apply and the CSSOM must list exactly the retained declarations.",
    dep: ["css-tokenizer", "value-parsing", "at-rules", "rule-sets"]
  },
  "value-parsing": {
    s: "Interprets property values against their grammars, producing typed values with lengths, colors, functions and keywords, and resolving relative units.",
    d: "Each property has a grammar, such as a list of lengths or a color or a shorthand expanding to several properties. The parser matches tokens to it and produces an internal value, expanding shorthands into longhands and recording css-wide keywords. Math functions are kept as expression trees until the needed context is known. Units are classified: absolute ones convert immediately, while relative ones such as font-relative and viewport-relative units wait for style computation. It is hard because the grammar space is huge, and values must serialize back exactly as specified.",
    k: ["Typed internal values vs strings reparsed on demand: faster style resolution and exact semantics, but every property needs a parser, serializer and interpolation.", "Early resolution of units vs deferring: fewer steps at use time, but font and viewport changes then force a reparse or recomputation."],
    p: ["Shorthand expansion that loses a component leaves a longhand at an old value when a later rule sets the shorthand.", "Serializing a computed value with different precision than the standard breaks code that compares strings."],
    v: "Set shorthands with mixed forms, calc expressions and relative units, then read back both specified and computed values. Check against expected serialization, and resize the viewport to confirm viewport units update.",
    dep: ["css-tokenizer", "custom-properties"]
  },
  "stylesheet-loading": {
    s: "Fetches linked and imported style sheets, tracks which are pending, and blocks rendering and script until the ones that matter have loaded.",
    d: "Link elements and import rules create fetches. A sheet is render-blocking while it is pending for media that currently applies, because painting without it would flash unstyled content. Scripts that come after a pending sheet also wait for it. Sheets can carry media conditions, disabled flags and alternative titles. When a sheet arrives it is parsed, added to the document's collection in cascade order and style is invalidated. Hard problems are ordering when sheets finish out of order, nested imports forming serial chains, and failure handling that must not block the page forever.",
    k: ["Blocking render on pending sheets vs painting early: no flash of unstyled content, but a slow sheet delays the whole page.", "Waiting for sheets before scripts vs not: scripts read correct styles, but a slow stylesheet can delay behavior that does not need it."],
    p: ["Chains of imports serialize downloads and make a small sheet take several round trips.", "A sheet failing without an error event can leave the document waiting until a timeout."],
    v: "Load a page with a sheet that the server delays by two seconds, with a script after it. Confirm no first paint and no script run until the sheet arrives, and check that a non-matching media sheet does not block.",
    dep: ["css-parser", "style-invalidation", "render-blocking", "parser-blocking-scripts"]
  },
  "rule-sets": {
    s: "Indexed storage of parsed rules, bucketed by their rightmost selector part, so matching an element checks only a few candidate rules.",
    d: "After parsing, rules are placed into hash buckets keyed by id, class, tag name or other cheap features of the key selector, which is the rightmost compound. Rules with no such feature go in a generic bucket. Separate sets exist per origin, per cascade layer and per shadow scope, plus lists for pseudo-elements, focus and other special cases. When an element is styled, the engine looks up its id, classes and tag and tests only rules in those buckets. Hard parts are building the sets fast and updating them when sheets change or rules are edited.",
    k: ["Indexing by rightmost compound vs by the first or most selective part: the key selector must match the element itself, so it prunes best, but common keys like tag names leave large buckets.", "Rebuilding sets on change vs incremental update: simple and safe, but editing one rule can cost a full rebuild."],
    p: ["Hundreds of rules with only a universal or attribute selector end in one bucket tested for every element.", "Rule sets not invalidated after a CSSOM edit make changes invisible until reload."],
    v: "Count rules tested per element on a page with ten thousand rules. The count per element should be a small fraction of the total and track the number of rules sharing its id, classes and tag.",
    dep: ["css-parser", "selector-matching", "cssom"]
  },
  "cssom": {
    s: "The script-visible object model of style sheets, rules and declarations, and the computed-style view, which can be read and edited at runtime.",
    d: "Parsed sheets are exposed as objects: sheet lists, rule lists, and declaration blocks with properties and priorities. Script can insert and delete rules, edit declarations, create sheets and adopt them into documents and shadow roots. Inline style attributes expose a declaration block that stays in sync with the attribute. Edits must invalidate style, rebuild or patch rule sets and update serialization. The computed-style view reads values after forcing style. It is hard because wrappers must stay consistent with the internal immutable parsed forms, which engines often keep separate.",
    k: ["Lazily wrapping internal rules vs a full object copy: memory stays low for sheets script never touches, but edits must convert and keep both views consistent.", "Sharing a parsed sheet across documents vs cloning: much less memory for repeated components, but mutation needs copy-on-write."],
    p: ["Editing a shared sheet in place changes every component using it, not just the one the script meant.", "Reading declaration text right after an edit returns a stale cached serialization."],
    v: "Insert a rule, change a declaration and delete another through script, with a screenshot taken after each. Computed style, rendered output and the serialized rule list must change in step.",
    dep: ["css-parser", "rule-sets", "style-invalidation", "computed-style"]
  },
  "at-rules": {
    s: "Conditional and structural rule containers, such as media, supports, layers, scope, container and font rules, that change which rules apply or define named resources.",
    d: "Media and supports rules evaluate conditions against the environment and feature support. Layers define named ordering groups for the cascade. Container rules apply to descendants based on an ancestor's size or style, which means style depends on layout results. Font-face and keyframes rules define resources used by other stages. Conditions are reevaluated when the viewport, color scheme or preferences change, and rules are included or excluded without reparsing. It is hard because some conditions depend on layout, which breaks the simple order of style before layout.",
    k: ["Re-evaluating conditions on environment change vs reparsing: cheap and precise, but each rule set must track which conditions it depends on.", "Container conditions resolved during layout vs a separate pass: correct dependencies, but style and layout become interleaved and need loop protection."],
    p: ["A container query that changes the size of its own container produces a cycle the engine must cut by limiting the query axes.", "Unsupported conditions in supports rules must evaluate false, not error, or fallbacks never apply."],
    v: "Resize the viewport and a container across the breakpoints of media and container rules, and confirm the correct rules apply each time and the number of style recalculations is limited to affected elements.",
    dep: ["css-parser", "rule-sets", "cascade-resolution"]
  },
  "selector-matching": {
    s: "Tests whether an element satisfies a complex selector, evaluating its parts right to left against the element and its ancestors and siblings.",
    d: "Matching starts with the rightmost compound, which must match the element itself, then moves through combinators to ancestors or earlier siblings, backtracking when a descendant combinator has several candidate ancestors. Simple selectors check tag, id, class, attributes and pseudo-classes, and are ordered cheapest first. Relational and logical pseudo-classes, such as has and is, can require subtree or alternative checks. The mechanism is the engine's most common operation, so it is heavily optimized with fast rejects. Pathological selectors with long descendant chains are the main risk.",
    k: ["Right-to-left matching vs left-to-right: most elements fail at the rightmost part immediately, so cost per element stays low, but it cannot be used to enumerate matches from a root.", "Supporting relational pseudo-classes vs excluding them: authors can style parents by children, but invalidation and matching cost rise sharply."],
    p: ["Long descendant chains on common elements force deep backtracking on every element.", "Matching against a shadow-host or slotted element without scoping rules gives false positives."],
    v: "Benchmark a selector with a deep descendant chain and a rarely matching rightmost part on a ten-thousand-element tree. Time should be dominated by cheap rejects, with bloom filter and bucket counters showing most elements skipped.",
    dep: ["rule-sets", "ancestor-bloom-filter", "flat-tree", "shadow-roots"]
  },
  "ancestor-bloom-filter": {
    s: "A small probabilistic set of the ancestors' tags, ids and classes, kept during tree traversal so descendant selectors can be rejected without walking up.",
    d: "While style recalculation walks down the tree, the engine adds each ancestor's identifying hashes to a counting bloom filter and removes them when leaving. Before testing a selector with a descendant or child combinator, it checks whether the hashes of the required ancestor parts are in the filter. A negative answer is definitive, so the match fails without climbing the tree. False positives only fall through to the full check. Hard parts are keeping the filter in sync with traversal, resetting when the walk jumps, and sizing it for deep documents.",
    k: ["A small counting filter vs exact ancestor sets: fixed constant cost and memory, but false positives grow with depth and diversity of classes.", "Maintaining the filter during traversal vs building per element: amortized cost along the walk, but it only works for traversal orders that follow the tree."],
    p: ["Using the filter for a subtree style recalculation without rebuilding it from the ancestors produces wrong rejects.", "A very deep tree saturates the filter and it stops rejecting anything."],
    v: "Count full ancestor walks with and without the filter on a deep page with many descendant selectors. The walks should drop by a large factor with identical computed styles for every element.",
    dep: ["selector-matching", "node-tree"]
  },
  "cascade-resolution": {
    s: "Orders all matching declarations by origin, importance, layer, specificity and source order, and picks the winning value for each property.",
    d: "For one element the engine gathers declarations from user agent defaults, user settings, author sheets, inline style, and animations and transitions. The cascade sorts them by origin and importance, then by layer, scope proximity, specificity and order of appearance. The winner for each property is the declaration with the highest precedence. Engines avoid sorting by tracking a rule's position in a pre-sorted list, and by applying properties in a dependency-friendly order, for example font size before units that depend on it. The hard part is correctness across the many tie-breakers.",
    k: ["Resolving highest-priority-wins with early exit vs collect-and-sort: fewer allocations, but order dependencies between properties must be handled explicitly.", "Cascade layers vs specificity alone: authors control precedence without selector hacks, but one more ordering dimension makes outcomes harder to predict."],
    p: ["Misordering important declarations across layers reverses the intended override direction.", "Applying dependent properties in the wrong order makes em units use the wrong font size."],
    v: "Build conflicting rules across origin, importance, layers, specificity and order, and verify each element's computed value against a table derived from the specification's tie-break order.",
    dep: ["selector-matching", "rule-sets", "inheritance", "custom-properties"]
  },
  "inheritance": {
    s: "Passes values of inherited properties from parent to child, and resolves explicit inherit, initial, unset and revert keywords.",
    d: "Some properties, such as color and font, inherit by default, while others, like margins, do not. After the cascade, each property either has a winning declaration or takes the parent's value if inherited, or its initial value. Engines store computed style in groups, so that unchanged groups are shared with the parent by reference, which makes inheritance a pointer copy for most of the tree. Parent here means the flat-tree parent, and for pseudo-elements their originating element. The difficulty is keeping shared groups correct when a parent changes.",
    k: ["Sharing style groups by reference vs copying values: low memory and fast inheritance, but a change must create a new group and notify dependent children.", "Inheriting from the flat-tree parent vs the node parent: matches what is rendered, but style code must always use flat-tree traversal."],
    p: ["Mutating a shared style group in place changes unrelated descendants that point to it.", "An inherited value change that fails to invalidate children leaves old text color in a subtree."],
    v: "Change an inherited property on a parent with ten thousand descendants and verify every descendant's computed value updates, while the number of newly allocated style groups stays small.",
    dep: ["cascade-resolution", "computed-style", "flat-tree"]
  },
  "custom-properties": {
    s: "Author-defined properties that inherit like other values, can be referenced in any property through variable substitution, and can be registered with types.",
    d: "A custom property value is stored as tokens and inherits by default. Substitution replaces references in other properties during computation, with fallbacks when a reference is missing, and cycles make the properties invalid. Registered properties declare a syntax, an initial value and whether they inherit, so values are parsed and can be animated. Because a change on a root can alter every descendant's values, the engine must propagate it carefully. The hard parts are cost on big trees, cycle detection, and the cross-effect that any property can depend on a variable.",
    k: ["Unregistered token values vs registered typed values: maximum flexibility and no setup, but typed values enable validation, animation and cheaper comparison.", "Inheriting by default vs not: simple theming from the top, but a change near the root touches the whole tree and can force broad recalculation."],
    p: ["Changing a variable on the root each frame forces style recalculation of the whole document.", "Cycles between variables resolve to invalid, which silently drops the whole declaration using them."],
    v: "Define a theme variable on the root used by many elements, change it, and verify all dependent styles update. Then add a cycle between two variables and confirm both resolve to the guaranteed-invalid value.",
    dep: ["cascade-resolution", "inheritance", "value-parsing", "style-invalidation"]
  },
  "computed-style": {
    s: "The resolved set of property values for each element after cascade and inheritance, stored in compact shared groups for layout, paint and script to read.",
    d: "Computed style is the engine's central per-element data structure. Values are resolved to absolute form where possible: lengths in pixels, colors converted, keywords substituted. Properties are grouped by use, such as box, text, background and non-inherited misc, so groups can be shared among elements and compared quickly. A diff between old and new computed style tells later stages what to redo: nothing, paint only, composite only, or layout. Hard parts are memory at scale and making the diff precise.",
    k: ["Grouped, reference-shared storage vs one flat record per element: much less memory and cheap equality, but access and updates are indirect.", "Computing a diff at change time vs always recomputing downstream: later stages skip unaffected work, but missed fields cause stale rendering."],
    p: ["A diff that ignores one field makes an update silently skip layout or paint.", "Resolving all properties for every element on every change wastes time when only a few are used."],
    v: "Change one property at a time on an element and record which downstream stages ran. Color should trigger paint only, width layout, and opacity only compositing, matching the property's classification.",
    dep: ["cascade-resolution", "inheritance", "style-sharing", "layout-invalidation", "paint-invalidation"]
  },
  "style-sharing": {
    s: "Detects elements that will compute to identical style, such as siblings with the same classes, and reuses one computed result instead of matching again.",
    d: "Many pages have long lists of identical siblings. The engine keeps a cache of recently styled elements and, for a new element, checks the cheap conditions that determine its style: same tag, same classes, same inline style, parent with the same computed style, and no attribute or pseudo-class state that rules examine. If all hold, it copies the style pointer. Unsafe cases include positional selectors, hover state, and ids. It is hard because any new selector feature that depends on a property of the element can silently break sharing correctness.",
    k: ["Sharing across siblings and cousins vs only exact siblings: more hits, but more conditions to validate for correctness.", "Disabling sharing when rules use sibling-dependent selectors vs tracking per rule: correctness is simple, but pages using them lose a large speedup."],
    p: ["A new selector type that is not considered in the share check gives matching elements the wrong style.", "Sharing across elements with different attribute values that rules read yields wrong results."],
    v: "Style a list of ten thousand same-class items and count full matches versus shared styles. Then add a rule using an nth-child selector and confirm sharing is correctly bypassed and the styles stay right.",
    dep: ["selector-matching", "computed-style"]
  },
  "style-invalidation": {
    s: "Works out which elements need style recalculated after a change to classes, attributes, state or rules, using precomputed hints instead of recomputing everything.",
    d: "When an attribute or class changes, the engine consults invalidation sets built from the rule sets: for each simple selector, which others in the same selector could now start or stop matching, and whether the effect applies to the element, descendants or siblings. Only those elements get dirty flags. Rule changes invalidate by the features they mention. State changes like hover use the same sets. Relational selectors need reverse lookups. The hard part is being conservative enough to be correct and precise enough to avoid whole-tree recalculation on trivial changes.",
    k: ["Feature-based invalidation sets vs always recalculating a subtree: far less work per change, but sets must be built, kept current and complete.", "Marking whole subtrees on uncertainty vs tracking exact elements: simple and safe, but big for common changes like toggling a class on a root."],
    p: ["Adding a class to the body can invalidate the whole document if a rule uses it as an ancestor.", "A missing set entry leaves elements with stale styles that a reload would fix."],
    v: "Toggle a class on one element in a large page and count elements restyled. The count should match the elements affected by selectors mentioning that class, not the document size, and rendering must match a full recalculation.",
    dep: ["rule-sets", "selector-matching", "mutation-model", "computed-style"]
  },
  "pseudo-elements": {
    s: "Boxes generated from style rather than markup, such as before, after, markers, first line, placeholder and selection, each with their own cascade.",
    d: "Generated content pseudo-elements get styled from rules targeting them on their originating element, and create boxes in the layout tree if their content is not none. First-line and first-letter depend on layout results, since which text falls on the first line is known only then, so they are styled during layout. Highlight pseudo-elements style selection and find results at paint time. Each pseudo-element has a computed style of its own, inheriting from its originating element. The complexity is ordering of style and layout and invalidation when the originating element changes.",
    k: ["Style for first-line computed during layout vs in the style pass: results are right when text wraps, but layout must be able to restyle part of a paragraph.", "Pseudo-elements as real layout boxes vs paint effects: boxes support full layout, while highlights stay cheap and do not affect geometry."],
    p: ["Content generated for an element with display none must not create boxes or counters, which is easy to miss.", "First-letter handling that ignores leading punctuation styles the wrong glyphs."],
    v: "Style before, after, first-line and selection on a paragraph that reflows when resized. Generated content must appear, the first line style must follow the actual first line, and selection color must apply at paint.",
    dep: ["computed-style", "layout-tree", "inline-formatting", "selector-matching"]
  },
});
