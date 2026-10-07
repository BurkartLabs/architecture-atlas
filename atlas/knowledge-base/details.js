// Details for the knowledge base plate, part 1: editing surface, navigation, links.
ATLAS.details("knowledge-base", {
  "block-editor": {
    s: "The editing surface that renders the block tree and turns keystrokes, clicks and drags into operations on it, keeping the visible page and the document model in agreement.",
    d: "Each block is a separately focusable unit, such as a paragraph, heading, list item or to-do, rendered from the document model. Input is intercepted and translated into model operations rather than letting the host editing engine mutate the page directly, so the model stays the source of truth and the view is re-rendered from it. The editor talks to the selection model, the operation log and the collaboration engine. It is hard because native text editing, undo and accessibility behavior must be reproduced or reconciled by hand.",
    k: ["Model-driven rendering versus letting the browser edit the page and reading it back: model-driven keeps one truth and makes merging possible, but must reimplement caret, spell-check and accessibility behavior.", "One editable region per block versus a single editable surface for the whole page: per-block regions simplify block logic, but make selections that cross blocks awkward."],
    p: ["Host text-editing quirks differ across platforms, so a keystroke that works in one environment produces a duplicated or lost character in another.", "Re-rendering the whole page on each operation drops the caret or scroll position on long documents."],
    v: "Type, format, split and merge blocks in a long page while recording the operation stream; replay it into an empty model and confirm the rendered result matches character for character, with the caret where the user left it.",
    dep: ["block-tree","selection-model","operation-log"]
  },
  "inline-marks": {
    s: "Character-level formatting such as bold, italic, code, links, colors and inline mentions, stored as spans of marks over the text of a block.",
    d: "Marks are attached to ranges of text, either as overlapping annotations or as a sequence of runs that each carry a mark set. Toggling a mark over a selection splits and merges runs so that adjacent runs with identical marks collapse. Inline objects, such as a mention of a page or a date, sit in the same text stream as special atoms. The difficulty is edge behavior: whether text typed at the boundary of a bold span becomes bold, and how marks survive concurrent edits by two people on overlapping ranges.",
    k: ["Run-based storage versus range annotations: runs make rendering and serialization simple, but concurrent edits to overlapping formats are harder to merge than independent ranges.", "Sticky versus non-sticky mark boundaries: sticky matches typing intuition for bold, but links and comments must not grow when someone types next to them."],
    p: ["Two people formatting overlapping ranges can produce a fragmented run list that renders identically but bloats the document.", "Pasted text brings foreign marks that the schema does not allow, leaving invisible or unremovable styling."],
    v: "Apply bold, then italic across a range that partly overlaps it, then remove bold; confirm the stored runs collapse to the minimal list and the exported text carries exactly the expected marks.",
    dep: ["rich-text-runs","block-editor"]
  },
  "command-menu": {
    s: "A searchable popup, usually opened by typing a trigger character, that inserts blocks, changes block types or runs actions without leaving the keyboard.",
    d: "Typing the trigger at the start of a block opens a filtered list of block types and commands. Choosing one replaces the current block or inserts a new one by emitting an operation. The list is assembled from built-in block types, plugin-registered commands and recent choices, and filtered by fuzzy matching on names and aliases. Related menus handle mentions and date pickers using the same popup machinery. It is hard to make the trigger reliable alongside text entry in every input method.",
    k: ["Trigger-character menu versus a toolbar-first interface: triggers keep hands on the keyboard and make blocks discoverable, but literal use of the trigger character needs an escape.", "Static ordering versus usage-ranked results: ranking by use speeds common choices, yet moves items around and defeats muscle memory."],
    p: ["The menu opens while someone legitimately types the trigger character in prose, interrupting the sentence.", "Plugin commands with colliding names make the result of a keystroke sequence unpredictable."],
    v: "Type the trigger followed by a partial command name in an empty block, press Enter, and confirm the block becomes the chosen type with the caret inside it; repeat with a plugin command and with the menu dismissed by Escape leaving the typed text intact.",
    dep: ["block-editor","block-types"]
  },
  "input-shortcuts": {
    s: "Rules that convert typed patterns into structure as people write, such as a pound sign becoming a heading or two dashes becoming a divider.",
    d: "An input rule matches the text before the caret against a pattern when a trigger key such as space is pressed, then replaces the matched text with an operation: changing the block type, applying a mark or inserting an atom. Rules are ordered, scoped to block types, and reversible: pressing backspace right after a conversion restores the literal text. They sit between raw keystroke handling in the editor and the operation model. The trouble is interplay with composition input and with pasted text, which must not trigger conversions.",
    k: ["Eager conversion on typing versus conversion only on explicit command: eager feels fast and teaches the markup, but surprises people who meant the literal characters.", "Built-in rule set versus user-defined rules: custom rules suit power users, yet add collisions and make behavior differ between workspaces."],
    p: ["A conversion with no immediate undo traps people who typed a literal symbol on purpose.", "Rules firing during pasted or composed text convert content the writer never typed."],
    v: "Type a heading marker followed by a space and confirm a heading appears; press Backspace and confirm the literal characters return; paste the same text and confirm no conversion occurs.",
    dep: ["block-editor","block-types","operation-log"]
  },
  "block-dragging": {
    s: "Moving blocks by handle, keyboard or gesture, including reordering within a parent, nesting under another block and moving across pages.",
    d: "A drag handle selects a block with its children, and drop targets are computed from pointer position into a parent and an index. The drop becomes a move operation that detaches the subtree and inserts it elsewhere, preserving identifiers so links to those blocks remain valid. Cross-page moves also touch permissions and backlink indexes. It is hard because moves are not simple deletes plus inserts: concurrent edits to the moved subtree must follow it, and moving a block into its own descendant must be rejected.",
    k: ["Move as a first-class operation versus copy plus delete: first-class moves keep identifiers, links and comments attached, but require move-aware merging.", "Pointer-only dragging versus keyboard and menu moves: supporting both is needed for accessibility and long pages, at the cost of duplicating drop-target logic."],
    p: ["Implementing move as delete and create orphans comments, synced copies and references to the block.", "Two people moving the same block into different parents leave it duplicated or lost unless the merge rule picks a single winner."],
    v: "Drag a block with children and a comment to another page; confirm its identifiers are unchanged, the comment and incoming references still resolve, and the source page's backlinks and permissions reflect the new location.",
    dep: ["block-tree","stable-ids","operation-log","rename-propagation"]
  },
  "selection-model": {
    s: "The representation of the cursor and selected content across blocks, as positions in the document model rather than the screen, kept valid as other edits arrive.",
    d: "A selection is a pair of positions, each naming a block and an offset, or a set of whole blocks. The view translates between these and the host's selection API on every change. When remote operations arrive, positions are transformed through them so the caret does not jump. Multi-block selection, table cells and atoms such as mentions need special cases. It is hard because the host selection and the model can disagree, for example around collapsed whitespace and atoms that look like a character but are not.",
    k: ["Model positions versus host-native selection: model positions survive re-rendering and concurrent edits, but need constant translation to what the platform exposes.", "Block-level selection as a distinct mode versus text range only: a block mode makes bulk operations clean, but adds a state people must learn to move between."],
    p: ["Remote edits that arrive before the position is transformed make the caret leap to another paragraph mid-sentence.", "Offsets counted in code units rather than characters break when text includes combined or emoji characters."],
    v: "With two clients, place the caret in the middle of a sentence on one while the other inserts text before it; confirm the caret stays at the same character and a later keystroke lands there.",
    dep: ["block-tree","stable-ids"]
  },
  "clipboard-handling": {
    s: "Copy, cut and paste between blocks, pages and other applications, converting between the internal model and the formats the clipboard carries.",
    d: "Copying writes several flavors at once: an internal structured payload that preserves identifiers and types, rich markup for other applications and plain text. Paste reads the richest flavor it understands and sanitizes it against the block schema, mapping unknown markup to the closest block type. Pasting a link may offer a mention or preview instead of raw text. It also handles files and images. The challenge is hostile or noisy markup from other sources, and deciding whether pasted blocks keep their identifiers or receive fresh ones.",
    k: ["Rich internal payload versus text-only copy: the payload preserves structure and properties between pages, but must be versioned and never trusted blindly on paste.", "Keeping identifiers on paste versus minting new ones: keeping preserves references for moves, but duplicated identifiers corrupt the tree when the same content is pasted twice."],
    p: ["Pasted markup carries scripts, styles or enormous nested wrappers that the sanitizer must strip, or the page becomes unsafe or unreadable.", "Pasting copied blocks twice with preserved identifiers creates two blocks with the same identity."],
    v: "Copy a block with child items, a mark and a mention, paste it twice into another page and into a plain-text field; confirm structure and marks arrive, the two pasted copies have distinct identifiers, and plain text reads correctly.",
    dep: ["block-types","stable-ids","rich-text-runs"]
  },
  "composition-input": {
    s: "Handling text entered through input methods that build characters in several steps, as used for many languages, voice dictation and mobile prediction.",
    d: "Composition events deliver provisional text that is replaced as the person chooses a candidate. The editor must not re-render or apply input rules during composition, and must treat the provisional range as a unit when remote edits arrive. When composition ends, the final text becomes one or a few operations. It interacts with the selection model, input shortcuts and collaboration, and varies across platforms. It is hard because the host fires events in different orders and the editor cannot see the intermediate state it is not allowed to disturb.",
    k: ["Deferring model updates until composition ends versus applying them live: deferring is safe for input methods, but delays what collaborators see and what search can index.", "Locking the composing block against remote edits versus merging into it: locking avoids corruption, at the price of rejecting a collaborator's change."],
    p: ["Re-rendering the block mid-composition cancels the input method and drops the partial character.", "Input shortcuts firing on provisional text convert content that was never committed."],
    v: "Using an input method with candidate selection, compose a multi-character word while a second client edits another block of the same page; confirm the final text is correct and the page did not re-render during composition.",
    dep: ["block-editor","selection-model","input-shortcuts"]
  },
  "page-tree": {
    s: "The hierarchy of pages inside pages that gives a workspace its structure, with parent links, ordering and the ability to move whole subtrees.",
    d: "Each page has at most one parent and an order among siblings, forming a tree stored as parent references plus a sibling-ordering key. Operations include nesting, moving, duplicating a subtree and deleting it. Because permissions and breadcrumbs derive from ancestry, the tree is read constantly, so ancestor lists or paths are often cached. Moves rewrite those caches for the whole subtree. It is hard to keep ordering stable under concurrent reordering and to move large subtrees without long locks.",
    k: ["Strict single parent versus allowing a page in several places: a single parent keeps permissions and paths well defined, but forces shortcuts or aliases for multi-home content.", "Fractional ordering keys versus integer positions: fractional keys allow concurrent inserts without renumbering, but keys grow over time and need occasional rebalancing."],
    p: ["Moving a page under its own descendant creates a cycle if the check is missed or races with another move.", "Stale ancestor caches after a subtree move show wrong breadcrumbs and apply the wrong permissions."],
    v: "Move a subtree with a thousand pages to a new parent while another client reorders its siblings; confirm no cycles, every page's ancestor path is updated, and sibling order converges on all clients.",
    dep: ["block-tree","stable-ids","permission-inheritance"]
  },
  "sidebar-favorites": {
    s: "A persistent panel that shows the workspace's top-level structure and the pages a person has pinned, always reachable from any page.",
    d: "The sidebar lists root pages and lets people expand the tree lazily, so that only visible branches are loaded. Favorites and pinned items are per-person lists stored separately from the page tree. It reads the page tree and the person's permissions, and updates live as pages are created, renamed or moved. It is hard because it must show only pages the viewer may see, keep expanded state across devices, and stay fast when a workspace has tens of thousands of root-level children.",
    k: ["Per-person pins versus shared team shortcuts: personal lists suit individual habits, but teams then lack a common way to surface the pages that matter.", "Eager tree loading versus load on expand: eager makes search-within-sidebar instant, but costs memory and time on large workspaces."],
    p: ["Pins pointing at pages that were deleted or lost access show broken entries instead of disappearing.", "Expanded state stored only on the device makes the sidebar differ between phone and desktop."],
    v: "Pin a page, then revoke the viewer's access from another account; confirm the pin disappears without an error, and that expanding a branch of ten thousand children loads in pages rather than at once.",
    dep: ["page-tree","permission-filtering"]
  },
  "breadcrumbs": {
    s: "A path of ancestor page titles shown above a page, so a reader knows where they are and can step upward.",
    d: "The path is derived from the page tree by following parent references, then filtered by what the viewer may see: ancestors the viewer cannot open appear as hidden or are omitted. It collapses long paths and updates when an ancestor is renamed or the page is moved. It reads cached ancestor lists and titles. It looks trivial but exposes permission leaks, because an ancestor title can reveal the existence and name of a private page.",
    k: ["Showing the true path versus the path through which the viewer arrived: the true path is stable and shareable, but a link into a shared subpage leaks or truncates unseen ancestors.", "Computing on read versus storing the path with the page: on read stays correct after moves, storing is faster but needs rewriting for every descendant."],
    p: ["A private ancestor's title appears to a guest who can open only the child page.", "A renamed ancestor continues to show the old title because a cached path was not invalidated."],
    v: "As a guest with access only to a deep child page, open it and confirm the path shows no private ancestor titles; then rename an accessible ancestor and confirm the path updates within the sync interval.",
    dep: ["page-tree","permission-inheritance"]
  },
  "quick-switcher": {
    s: "A keyboard-driven search box that jumps straight to a page by title or recent activity, faster than navigating the tree.",
    d: "Opening the switcher shows recent and frequently opened pages, and typing filters by fuzzy title match, usually against a local index of titles so that results appear on each keystroke. Longer queries fall through to full-text search. It reads the recents list, the local title index and the search service, and applies the same permission filtering. It is hard to rank: recency, exact title match and frequency all compete, and results should not reshuffle while the person is typing.",
    k: ["Local title index versus server queries for every keystroke: local is instant and works offline, but needs the titles synced and covers only what the device has loaded.", "Pure fuzzy matching versus weighting exact prefixes and recency: weighting returns the page you meant, but is harder to explain when it surprises."],
    p: ["Results reorder as late responses arrive, so Enter opens a different page than the one highlighted.", "Titles of pages that lost access linger in the local index and appear in results."],
    v: "Type three letters of a page title and press Enter; confirm the intended page opens within one rendering frame from a local index, including with the network disabled, and that a page the viewer cannot access never appears.",
    dep: ["recent-pages","full-text-index","permission-filtering"]
  },
  "recent-pages": {
    s: "A per-person list of pages recently opened or edited, used for return trips and as the default content of the quick switcher.",
    d: "Each page view or edit records an event keyed by person and page, with a timestamp, and the list is compacted to the most recent entries. Views and edits are kept as separate signals so that the list can show 'recently edited by you' separately. It reads access-checked page metadata for display. It is hard because writes happen on every navigation, which makes it a source of write amplification, and entries must disappear when access is lost.",
    k: ["Recording on every view versus sampling after a dwell time: every view is accurate, but a flood of writes and accidental entries from fast browsing.", "Server-side list versus device-local: server-side follows the person across devices, but is another write path to keep cheap."],
    p: ["Writing a row per navigation in a synchronous path slows page loads under load.", "The list reveals titles of pages that were later moved into restricted spaces."],
    v: "Open fifty pages in quick succession and confirm the list shows them in the right order with no more than one write per page per interval, and that a page moved into a restricted space disappears for a viewer without access.",
    dep: ["page-tree","permission-filtering"]
  },
  "tags-and-collections": {
    s: "Cross-cutting labels and groupings that let one page belong to several categories at once, in contrast to the single-parent tree.",
    d: "Tags are either inline tokens inside text or a property on the page, and are indexed so a tag lists all pages that carry it. Collections group pages by a stored query or a manual list. Tag rename and merge rewrite every use. It reads the property schema and search index and respects permissions on the listed pages. It is hard because freeform tags drift into near-duplicates, and an organization-wide tag registry that prevents this conflicts with the low-friction typing that made tags attractive.",
    k: ["Freeform tags versus a managed vocabulary: freeform is frictionless, but produces misspellings and duplicates; a managed set is cleaner, but people stop tagging.", "Tags as text in the body versus tags as properties: body tags read naturally and travel with content, while properties are queryable and renameable but hidden from the writing flow."],
    p: ["Renaming a tag that exists in body text only updates some pages if the rewrite is not applied to every document.", "Plural, case and spacing variants of one tag split a topic across several lists."],
    v: "Tag fifty pages with one tag, rename it, and confirm every page shows the new name and the tag listing returns exactly those pages, including the ones in a space the viewer is allowed to read.",
    dep: ["property-schema","full-text-index","permission-filtering"]
  },
  "internal-links": {
    s: "References from one page to another by identity, written as a typed link or mention, that stay attached to the target when it is renamed or moved.",
    d: "A link stores the target's stable identifier and optionally a block anchor, and displays the target's current title rather than a copy. Creating one usually goes through a search popup. The links in each page are extracted into an outgoing-link set that feeds the backlink index. Links across workspaces or to deleted pages need defined behavior. The hard part is the choice between identity and path: path-based links survive export to files, but break on rename unless rewritten.",
    k: ["Identifier-based links versus title or path links: identifiers survive rename and move at no cost, but are opaque in plain-text export unless converted.", "Showing the live target title versus the text typed when linking: live titles stay accurate, but change how a sentence reads."],
    p: ["Links to pages that were deleted or restricted render as blank or reveal that a private page exists.", "Plain-text export leaves identifiers that no other tool can resolve."],
    v: "Link page A to page B, rename and move B, and confirm A shows the new title and the link still opens B; export A and confirm the exported link resolves to the exported B.",
    dep: ["stable-ids","block-tree","backlink-index"]
  },
  "backlink-index": {
    s: "A reverse index answering which pages link to this one, kept current as pages are edited, moved and deleted.",
    d: "On each save, a page's outgoing links are extracted and compared with the previous set, and the difference is applied to an index keyed by target. Reading a page's backlinks is then a single lookup, filtered by what the viewer may open. The index is derived and can be rebuilt by scanning all documents. It is hard because updates are eventually consistent with edits, because links inside synced or embedded content count for several pages, and because a heavily linked page, such as a daily index, has a very large reverse list.",
    k: ["Maintained incrementally versus computed at read time: incremental makes reads cheap, but needs repair logic when updates are missed.", "Counting links only from direct text versus also from transcluded content: including transclusions is more complete, but multiplies work and confuses where a link actually lives."],
    p: ["A missed update leaves backlinks pointing at text that no longer exists, undermining trust in the panel.", "A page referenced from thousands of pages makes the backlinks panel slow unless it is paginated."],
    v: "Add a link in page A, wait for indexing, and confirm B lists A; remove the link and delete A, and confirm B no longer lists it; rebuild the index from scratch and diff it against the live index.",
    dep: ["internal-links","derived-data-cache","permission-filtering"]
  },
  "unlinked-mentions": {
    s: "Suggestions of pages that mention this page's title in plain text without linking to it, with a one-click way to make the link.",
    d: "The system searches the text index for the title and aliases of the current page, excludes positions that are already links, and displays the surrounding context. Accepting a suggestion replaces the matching text with a link through an ordinary edit. It reads the full-text index and permissions. It is hard because short or common titles produce noise, phrase matching must respect tokenization and stemming, and the query must run quickly while the person is looking at the page.",
    k: ["Exact phrase match versus fuzzy or stemmed match: exact is precise but misses plurals and inflections; fuzzy finds more but suggests false links.", "Computing on page open versus precomputing during indexing: on open is always current, but adds latency; precomputing is fast but may be stale."],
    p: ["A title that is a common word floods the list with unrelated matches.", "Linking a suggestion in text the person cannot edit appears to work but fails on save."],
    v: "Create a page titled with a distinctive phrase, type that phrase in two other pages, and confirm both appear as suggestions; link one and confirm it moves from suggestions to backlinks.",
    dep: ["full-text-index","backlink-index","permission-filtering"]
  },
  "rename-propagation": {
    s: "Keeping links and references valid when a page or block is renamed, moved or merged, either automatically through identity or by rewriting text.",
    d: "With identifier-based links, a rename changes only the target's title, and every link renders the new one. With path or title-based links, a rename triggers a rewrite of every source page, found through the backlink index, with each rewrite going through normal editing so history and permissions apply. Moves across spaces may also change who can follow a link. It is hard where plain files are the store, because other tools may edit the same files at the same time as the rewrite.",
    k: ["Rewrite sources on rename versus resolve by identity: rewriting works with plain text files and other tools, but touches many documents and can fail partway.", "Preserving old titles as aliases versus dropping them: aliases keep old references working, but clutter search and can collide with a new page that takes the old name."],
    p: ["A partial rewrite after a crash leaves some links on the old name and some on the new.", "Rewriting pages the editor lacks permission to change silently skips them and leaves dangling links."],
    v: "Rename a page referenced from two hundred others, then confirm every referencing page resolves to it, the rewrite shows up as an attributed version in each page's history, and killing the process halfway and restarting completes the rest.",
    dep: ["backlink-index","stable-ids","version-snapshots"]
  },
  "graph-view": {
    s: "A visual map of pages as nodes and links as edges, used to explore clusters, orphans and the neighborhood of the current page.",
    d: "The graph is built from the link index: nodes are pages and edges come from outgoing links, with optional filters by tag, folder or depth. A force-directed layout positions nodes, usually computed incrementally on the client or a worker. Local graphs show only a neighborhood of a chosen page. It reads the backlink index and metadata. It is hard at scale, because layout cost grows quickly with node count, and a whole-workspace graph of tens of thousands of nodes is unreadable.",
    k: ["Global graph versus local neighborhood graph: global shows the shape of the whole base, but is a cluttered hairball at scale; local stays readable and answers more real questions.", "Layout computed live versus cached: live adapts to filters, but burns CPU and shifts nodes unpredictably; cached is stable but goes stale."],
    p: ["Rendering every node and edge at once freezes the interface for large workspaces.", "Nodes the viewer cannot access are drawn as anonymous dots that still reveal structure."],
    v: "Open the local graph at depth two for a page with known links and confirm the nodes and edges match the backlink and outgoing lists exactly; load a ten-thousand-page workspace and confirm interaction stays responsive.",
    dep: ["backlink-index","internal-links","permission-filtering"]
  },
  "transclusion": {
    s: "Showing the live content of one block or page inside another, so a single source appears in many places and edits to it show everywhere.",
    d: "A transcluding block stores a reference to a source block and renders the source's current subtree. Editing within the embedded view edits the source, so edits go to one place. Some designs mark one copy as the original and the others as mirrors of it. Permissions are evaluated against the source for each viewer. It is hard because the same block now has several parents for display purposes, so history, comments, backlinks and deletion all need rules about which context they belong to.",
    k: ["Live reference versus copy: a reference keeps one truth with no drift, but couples pages and complicates permissions and deletion; a copy is simple but diverges.", "Edit in place versus read-only embeds: editing everywhere is convenient, but means edits arrive from contexts that cannot show the whole source."],
    p: ["A viewer without access to the source sees an empty box or, worse, the content because permissions were checked on the host page only.", "Deleting the original block silently empties every place it was used."],
    v: "Embed a block in three pages, edit it from the second page, and confirm the other two show the change; revoke a viewer's access to the source and confirm the embed shows a locked placeholder with no content.",
    dep: ["stable-ids","block-tree","permission-inheritance"]
  },
  "block-references": {
    s: "Links that point at a single block inside a page rather than a whole page, letting people cite and discuss specific passages.",
    d: "Each block has a stable identifier that can be copied as a link. The reference renders the block's text with a link back to its location, and appears in the backlinks of the block as well as the page. Anchors survive edits to surrounding text but not deletion of the block. It uses the identifier model and the link index, and may be exported as a heading anchor or hash. It is hard to keep anchors valid when blocks are split, merged or retyped, and to decide who owns the identifier after a split.",
    k: ["Identifier on every block versus on demand when first referenced: every block is simple and consistent, but the identifiers add storage; on demand is lean but writes to the source when a link is created.", "Keeping the original identifier on the first half of a split versus minting two new ones: keeping preserves most references, but may bind them to the half the writer did not mean."],
    p: ["Merging two blocks drops one identifier, and every reference to it becomes dangling.", "Exporting block references to plain files produces anchors that are not stable across edits."],
    v: "Copy a block link, split the block in the middle and move the first half to another page; confirm the link still resolves to a sensible target and the rest of the references behave as the documented split rule says.",
    dep: ["stable-ids","internal-links","backlink-index"]
  }
});
