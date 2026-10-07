// Details for the notebook plate, part 2: publishing, document format, versioning.
ATLAS.details("notebook", {
  "conversion-pipeline": {
    s: "The tool that turns a notebook file into another format by reading it, running preprocessors over cells and outputs, and handing the result to an exporter.",
    d: "A pipeline has stages: read the document, run preprocessors that execute cells, clear outputs, extract figures or filter by tag, then apply an exporter that writes HTML, PDF, Markdown, slides or a script. Each stage is replaceable. Conversion can also execute the notebook first, so one command goes from source to finished report. It is hard because the formats differ in what they can hold: interactive outputs need a script runtime, print formats need static images, and every exporter needs a fallback for each MIME type it cannot show.",
    k: ["A staged pipeline of preprocessors vs a monolithic converter: stages can be composed and customized, but ordering bugs appear when two preprocessors assume different inputs.", "Executing during conversion vs converting stored outputs: executing guarantees fresh results, but needs a kernel, the environment and the data; using stored outputs is fast and may be stale."],
    p: ["Converting stored outputs produces a report whose numbers do not match the current code.", "A preprocessor that removes cells before another that references them breaks the chain silently."],
    v: "Convert one notebook to HTML, Markdown and a script, and confirm each result contains the cells' source and appropriate outputs, with the executed variant showing outputs that differ from the stored ones.",
    dep: ["notebook-file-format", "mime-selection", "headless-execution"]
  },
  "export-templates": {
    s: "Layout and style definitions applied at export, controlling page structure, themes, headers, how cells and outputs are laid out, and what is shown or hidden.",
    d: "Templates take the notebook's cells and wrap them in a page: stylesheets, scripts, navigation, headers and footers. Blocks in the template can be overridden, so a team changes the layout of code and outputs without rewriting the exporter. Print formats go through a typesetting system and need page breaks, fonts and numbering. Templates inherit from a base, which keeps most of the logic in one place and means upstream changes can break customized children.",
    k: ["Inheritable templates vs standalone ones: inheritance reuses logic and tracks fixes, but upstream changes can break overrides; standalone copies are stable and drift away.", "Embedding assets in the output vs linking them: embedding yields a single portable file, but a larger one; linking keeps files small and depends on a reachable server."],
    p: ["A custom template overrides a block whose name changed upstream, and the content silently disappears from reports.", "Print exports break pages mid-output because the template does not control breaks inside long cells."],
    v: "Export the same notebook with the default and a custom template, and confirm the custom header and chosen cell visibility appear while all outputs remain present.",
    dep: ["conversion-pipeline"]
  },
  "slide-export": {
    s: "Producing a slide presentation from a notebook, where cells or tagged groups become slides, fragments or notes, shown by a browser presentation framework.",
    d: "Each cell carries metadata naming its role: a new slide, a sub-slide, a fragment that appears on advance, a note, or skip. The exporter walks the cells in order and builds a structure the presentation framework understands. Live presentation from the editor can also run code during the talk. Slides combine arbitrary-size outputs with a fixed canvas, so tall tables and wide plots overflow unless the author controls size, and tool output often needs manual layout work.",
    k: ["Cell-level slide roles in metadata vs a separate slide file: metadata keeps the story and results together, but mixes presentation concerns into the analysis document.", "Static slides vs a live presentation with a running kernel: static slides are reliable on any machine; live execution makes demos possible and fails with the environment or network."],
    p: ["A long output overflows the slide boundary and is cut off on the projector.", "A live demo cell depends on a package missing from the presentation machine."],
    v: "Tag cells as slides and fragments, export, and confirm the deck has the right slide count, fragments reveal in order, and the largest output fits the slide area.",
    dep: ["conversion-pipeline", "cell-metadata-tags"]
  },
  "cell-tag-filtering": {
    s: "Using tags in cell metadata to decide at conversion what is shown: hide the input, hide the output, remove the cell, or collapse it.",
    d: "Authors tag cells such as hide-input or remove-cell, and a preprocessor reads the tags while converting. This lets one notebook serve both as the working analysis and the polished report: setup and plotting code stays out of the reader's way and remains in the file. Tag names are conventions set by the exporter, not part of the file format. The filter can also operate on regular expressions or output types, such as removing all stderr output.",
    k: ["Tags in the notebook vs filter rules in the conversion command: tags travel with the notebook and the author's intent, but pollute metadata; command rules keep the file clean and separate intent from content.", "Removing hidden content from the file vs hiding it only visually: removing protects what must not be shared; hiding leaves the data in the HTML source."],
    p: ["Tagged-as-hidden cells containing credentials remain in the exported HTML and can be read by viewing the page source.", "Tag names differ between tools, so a notebook shows its code in one exporter and hides it in another."],
    v: "Tag one cell hide-input and another remove-cell, export to HTML, and confirm the first shows only its output and the second text does not appear anywhere in the exported file.",
    dep: ["conversion-pipeline", "cell-metadata-tags"]
  },
  "notebook-as-app": {
    s: "Serving a notebook as a web page or dashboard: code runs on the server, the code cells are hidden, and the viewer sees outputs and controls only.",
    d: "A server executes the notebook, either once per request or in a kept-alive kernel, then serves the rendered result. Widgets provide interaction. Per-viewer kernels isolate users but cost memory for each visitor. Shared kernels serve many with one state and leak data between sessions. Deployment resembles any web service: authentication, scaling, timeouts and caching. The hard part is that notebooks were written as sequential scripts, so partial reruns after an input change can show stale or inconsistent outputs.",
    k: ["Kernel per visitor vs a shared kernel: per-visitor isolates state and uses memory in proportion to visitors; sharing is cheap and mixes users' data.", "Re-executing the whole notebook on input vs only affected cells: full reruns are always consistent but slow; partial reruns are fast and need a reliable dependency model."],
    p: ["A shared kernel serves one visitor's filter selection to another.", "Each page load starts a kernel and runs expensive setup, exhausting memory under modest traffic."],
    v: "Serve a notebook with an input control, connect two browsers, set different values, and confirm each sees its own result and the server shows two kernels.",
    dep: ["headless-execution", "widget-state-sync", "kernel-manager", "auth-tokens"]
  },
  "script-export": {
    s: "Converting a notebook into a plain source file with code cells in order and prose as comments, so it can be run, linted and reviewed as ordinary code.",
    d: "The exporter concatenates code cells, turns prose into comments or documentation blocks, and translates language-specific cell directives into plain statements or drops them. Output cells are discarded. Cell boundaries may be kept as markers so the file can convert back. Order is document order, which may differ from the order the author actually ran things, so a script can fail even though the notebook once worked. Magics and shell escapes have no direct equivalent and need rewriting.",
    k: ["Document order as the script order vs recorded execution order: document order is predictable and reviewable; execution order matches what ran and includes hidden reruns that cannot be reproduced.", "Markers for round-tripping vs clean source: markers allow reconversion, and clutter the code; clean source reads well and loses the cell structure."],
    p: ["A script generated from a notebook that was run out of order fails at the first undefined name.", "Cell directives left in the exported source cause syntax errors outside the notebook."],
    v: "Export a notebook to a script, run it with a plain interpreter in a fresh environment, and confirm it completes with the same final values as a restart and run all in the notebook.",
    dep: ["conversion-pipeline", "magics-directives"]
  },
  "notebook-file-format": {
    s: "The on-disk representation: a structured text document listing cells with source, type, metadata and outputs, plus notebook-level metadata and a format version.",
    d: "The file is JSON. Top level holds the format version, metadata such as kernel and language information, and a list of cells. Each cell has a type, source lines, metadata, and for code cells an execution count and a list of outputs. Binary output is stored as base64 text. The format is open and language-neutral, which is why many tools read it, and also why it is awkward: generated content, such as images, dominates the file, and line-based tools see the whole array as noise.",
    k: ["A single JSON document vs a directory of files: one file is easy to copy and share; a directory separates code from outputs and diffs cleanly, but is harder to move around.", "Storing outputs in the file vs separately: stored outputs let readers see results with no kernel, but bloat the file and make every run a change in history."],
    p: ["Opening and saving in a different tool reformats whitespace and key order, producing a diff on every line.", "Embedded base64 images make files large enough to be refused by code hosting and review tools."],
    v: "Save a notebook with one text cell, one code cell and one image output, and confirm the JSON has the expected top-level keys, a format version, and the image as base64 in the output bundle.",
    dep: ["cell-model", "output-serialization", "schema-validation"]
  },
  "cell-model": {
    s: "The in-memory structure for a notebook: an ordered list of cells, each with a type, source, metadata and outputs, observed by the editor and by tools.",
    d: "The model is the single source of truth in the front end. The view renders it and user actions change it. Cell types are code, prose written in a lightweight markup, and raw text passed through untouched on conversion. Code cells also carry an execution count and outputs. The model emits fine-grained change events so views update only what changed, and collaboration replicates the same structure. Keeping it separate from the DOM is what makes headless tools such as converters and tests possible.",
    k: ["A model independent of the view vs state held in the interface: independence supports headless use and collaboration; held state is simpler to write and cannot be reused outside the editor.", "Fine-grained change events vs whole-document replacement: fine-grained events are efficient and need careful ordering; replacement is easy and discards cursor and scroll state."],
    p: ["View code that mutates the DOM directly drifts from the model, so saved files differ from what the user saw.", "Large notebooks emit so many change events that updates are processed in the wrong order."],
    v: "Change a cell through the model API with no browser attached, save, and confirm the file reflects the change; then do the same through the editor and compare the two files.",
    dep: ["notebook-file-format"]
  },
  "cell-metadata-tags": {
    s: "Free-form key-value data attached to cells and to the notebook, used by tools for tags, slide roles, collapsed state, scheduling hints and extension settings.",
    d: "Metadata is a dictionary in the file at both the notebook and the cell level. The format reserves a few keys and leaves the rest to tools. A tags list is the most common convention. Extensions store state there, for example whether a cell is collapsed or whether its output is scrolled. Because any tool may write to it and none owns it, namespacing by tool is advised. Metadata changes are text changes in version control, so frequent UI state such as collapse flags creates noise.",
    k: ["Open dictionary vs a fixed schema: open metadata lets any tool add data without format changes, but invites conflicts and unvalidated values.", "UI state in metadata vs in local browser storage: in the file it follows the notebook everywhere, but dirties history; local storage keeps files clean and is per user."],
    p: ["Two extensions use the same key with different meanings and corrupt each other's state.", "Expanding or collapsing a cell modifies the file and appears as a change in review."],
    v: "Add a tag to a cell, save, reopen in another tool, and confirm the tag persists. Collapse an output and confirm whether the file changes, as the project intends.",
    dep: ["cell-model", "schema-validation"]
  },
  "output-serialization": {
    s: "How outputs are written to the file: streams, display data, execution results and errors, each as a typed object, with binary content encoded as text.",
    d: "Four output types exist: stream, display data, execute result (which also records the execution count) and error. A MIME bundle is stored under the output's data key, with metadata beside it. Text may be split into line arrays. Binary types such as images are base64 strings. Because outputs are saved with the document, a reader sees results without computing them, which is the central appeal of the format and the central problem for review, size and privacy.",
    k: ["Splitting text into line arrays vs single strings: arrays diff better line by line, but make programmatic access and exact content comparison clumsy.", "Saving every output vs saving only non-sensitive ones: saving all keeps the record complete; filtering protects data and breaks readers who expect results."],
    p: ["Outputs containing personal or secret data get committed with the notebook.", "Encoding changes between tools make the same output serialize differently, creating spurious diffs."],
    v: "Run cells producing each of the four output types, save, and confirm the file has an entry for each with the right type name, and that clearing outputs removes all of them without touching source.",
    dep: ["mime-bundles", "notebook-file-format"]
  },
  "attachments-embedded-data": {
    s: "Binary files such as images embedded inside prose cells, stored in the notebook as encoded data and referenced by name from the text.",
    d: "A prose cell can refer to an image by an attachment name, and the file holds the encoded bytes under the cell's attachments key, keyed by name and MIME type. Pasting an image into a cell creates an attachment automatically, so the notebook remains a single self-contained file. The tradeoff is that binary data lives inside a text format. Attachments are copied with the cell, but editors must clean unreferenced ones, and renderers outside the notebook need to resolve the names on export.",
    k: ["Embedding images in the file vs linking to files beside it: embedding survives copying and sharing, but bloats history; linking keeps files small and breaks when the notebook moves.", "Resolving attachments at export vs leaving references: resolving gives a working report, but needs the exporter to extract or inline every attachment."],
    p: ["Deleting the text that references an image leaves megabytes of orphaned attachment data in the file.", "Exported Markdown keeps attachment links that point nowhere outside the notebook."],
    v: "Paste an image into a prose cell, save, and confirm it appears in the cell's attachments; export to HTML and confirm the image displays with no side files, then remove the reference and confirm cleanup.",
    dep: ["notebook-file-format", "cell-model"]
  },
  "schema-validation": {
    s: "A machine-readable schema for the file, plus a validator that checks structure and rejects or repairs notebooks that do not conform.",
    d: "A versioned schema defines required fields, cell types and output types. Validators run when files are read or written, in conversion tools, and in review checks. Strict validation stops corrupt files early; lenient reading accepts files from older or sloppy tools and repairs them, for instance by adding missing cell identifiers. Minor versions add fields and must be readable by older readers, which means readers should ignore unknown keys instead of failing.",
    k: ["Strict rejection vs repair on load: rejection keeps data trustworthy and strands users with a file they cannot open; repair keeps them working and can hide tool bugs.", "Ignoring unknown keys vs failing on them: ignoring keeps old readers working with new files, and quietly drops data a newer writer put there."],
    p: ["A tool writes outputs of an invalid shape and every later reader fails with an obscure parse error.", "Repair on load changes the file, so merely opening a notebook marks it as modified."],
    v: "Validate a good notebook and a copy with a cell missing its type field, and confirm the first passes and the second reports the exact path to the invalid field.",
    dep: ["notebook-file-format"]
  },
  "paired-text-formats": {
    s: "Keeping a notebook alongside a plain text file, such as a script or Markdown document, so the text is edited and versioned and the notebook is generated from it.",
    d: "A pairing tool converts between the notebook and a text format that encodes cells as comments or fenced blocks. On save, both files update; on open, the text file is the source and outputs come from the notebook copy. This gives clean diffs, editor support and code review in the text, while preserving outputs in the notebook. The two must be kept in sync, and edits made in one tool while the other is stale lead to lost changes unless the sync checks timestamps.",
    k: ["Text as the source of truth with outputs in a companion notebook vs the notebook as truth: text gives reviewable history and loses cell-level metadata unless encoded; the notebook keeps everything and is poor to review.", "Automatic sync on every save vs explicit conversion: automatic saves effort, and can overwrite one side when the other changed externally."],
    p: ["Editing the text file while the notebook is open lets the next save overwrite the text edit.", "Cell metadata not representable in the text format is lost on a round trip."],
    v: "Edit a paired text file in a plain editor, open the notebook, and confirm the edit appears with outputs retained; then convert back and confirm the text file is byte-identical to the pre-edit round trip.",
    dep: ["notebook-file-format", "cell-metadata-tags"]
  },
  "notebook-diff": {
    s: "A comparison that understands notebook structure, showing changes cell by cell for source, metadata and outputs, instead of line changes in JSON.",
    d: "A diff tool parses both versions, aligns cells by identifier or content similarity, and reports additions, deletions, moves and edits. Source changes are shown as text diffs inside the cell. Outputs are compared by MIME type, with images shown side by side. Options filter noise such as execution counts and metadata. The hard step is cell alignment: without stable IDs, a moved and edited cell looks like a deletion plus an addition, and similarity matching can pair the wrong cells.",
    k: ["Aligning cells by ID vs by content similarity: IDs are exact and require every tool to preserve them; similarity works on old files and mismatches near-duplicates.", "Showing output differences vs ignoring them: showing catches changed results and floods reviews with irrelevant churn; ignoring is clean and misses real result changes."],
    p: ["A reordering of cells appears as a complete rewrite of the notebook.", "Execution counts and timestamps in the diff bury the real change among dozens of trivial ones."],
    v: "Change one source line, move one cell and re-run another, and confirm the diff reports exactly one edit and one move, with the rerun's output change listed separately from the source change.",
    dep: ["stable-cell-ids", "cell-model", "output-serialization"]
  },
  "notebook-merge": {
    s: "Combining two divergent versions of a notebook, resolving conflicts at the level of cells and outputs rather than by textual conflict markers in JSON.",
    d: "A merge driver does a three-way comparison of base, local and remote versions, aligned by cell identifier. Non-overlapping changes combine; the same cell changed on both sides produces a conflict. Outputs are usually not merged but taken from one side or cleared, since merged results are meaningless. Text conflict markers inserted into raw JSON produce a file that no longer parses, which is why a structural merge driver or a conflict interface is needed.",
    k: ["Structural merge driver vs line-based merge: structural merging keeps the file valid and resolves independent changes, but needs the tool installed in every checkout.", "Dropping outputs on conflict vs choosing a side: dropping avoids showing inconsistent results and forces a rerun; choosing one side is quick and may pair results with the wrong source."],
    p: ["A line-based merge leaves conflict markers inside JSON, making the notebook unopenable.", "Merged source with outputs from only one side shows results the merged code never produced."],
    v: "Edit different cells on two branches, merge, and confirm the notebook opens and holds both edits. Edit the same cell on both and confirm a conflict is reported at that cell, with the file still valid.",
    dep: ["notebook-diff", "stable-cell-ids", "notebook-file-format"]
  },
  "output-stripping-hooks": {
    s: "A step in the commit workflow that removes outputs, execution counts and volatile metadata from notebooks before they enter version control.",
    d: "Hooks or filters run at commit time and clean the notebook, so history contains only source and stable metadata. This reduces diff noise, file size and the chance of committing sensitive results. The working copy keeps its outputs. The tradeoff is that readers browsing the repository see no results, so a published report is generated separately, and projects that want to show results must be deliberate about which notebooks keep them.",
    k: ["Stripping all outputs on commit vs keeping selected notebooks' outputs: stripping gives clean history and safety; keeping selected outputs preserves a readable record where results matter.", "Client-side hooks vs a server-side check: hooks fix files at the source but depend on every contributor installing them; a server check is certain and only rejects."],
    p: ["A contributor without the hook installed commits megabytes of outputs and credentials.", "The filter rewrites files so a commit appears to modify notebooks the author never touched."],
    v: "Commit a notebook with outputs and confirm the stored version has none while the working file still shows them, then check that execution counts are null in the committed file.",
    dep: ["output-serialization", "notebook-file-format"]
  },
  "autosave-checkpoints": {
    s: "Periodic saving of the open notebook and a recoverable previous version, protecting against crashes, accidental overwrites and lost connections.",
    d: "The front end saves after a short idle interval and on specific events, writing through the contents manager. A checkpoint is a copy kept beside the file that the user can revert to. Autosave must handle conflicts: if the file changed on disk since it was loaded, a naive save overwrites someone else's change, so saves carry a modification time that the server compares. In shared sessions the live document model is the truth and the file is a snapshot of it.",
    k: ["Autosave on every pause vs explicit save only: autosave prevents loss and writes files nobody asked for; explicit save is predictable and loses work on crashes.", "Checking modification time on save vs last write wins: checking prevents clobbering, but interrupts users with conflict dialogs; last write wins is silent and loses changes."],
    p: ["Two tabs open to one file overwrite each other's autosaves, so edits from the earlier tab are lost.", "Autosave of a huge notebook on a slow disk blocks the interface during each save."],
    v: "Edit a cell, wait for autosave, kill the browser, reopen and confirm the edit is present. Modify the file on disk from another process and confirm the next save reports a conflict.",
    dep: ["contents-manager", "notebook-file-format"]
  },
  "stable-cell-ids": {
    s: "A unique identifier stored with each cell that persists across edits, reordering and saves, so tools can refer to the same cell over time.",
    d: "Each cell carries an identifier generated when it is created. Newer file versions require it; older files get identifiers added on load. IDs let diff and merge align cells, comments attach to the right cell and extensions track state. They are only useful if every tool preserves them: copying a cell must create a new ID, and splitting one cell should keep the ID on one of the halves. Collisions after copy and paste between notebooks are the typical failure.",
    k: ["Random identifiers stored in the file vs positional indexes: stored IDs survive reordering and add noise to each new cell; positions are free and break on every move.", "Short IDs vs long unique ones: short IDs are readable and collide in large merges; long ones are safe and awkward to refer to."],
    p: ["A tool that regenerates all IDs on save makes every cell look new in every diff.", "Duplicated cell IDs after copying a notebook make merges and comments attach to the wrong cell."],
    v: "Create a notebook, reorder and edit cells, save and reload, and confirm each cell keeps its ID; copy one cell and confirm the copy has a different ID.",
    dep: ["cell-model", "schema-validation"]
  },
  "rendered-review-diff": {
    s: "A review view in which prose appears as formatted text and outputs as rendered images and tables, showing before and after, so reviewers read a notebook change as the author saw it.",
    d: "Code review systems show raw JSON. A rendered diff instead parses both versions, renders each cell, and highlights changes in source and output. Reviewers see a figure change as two images and a table change as two tables. It combines the notebook diff with the renderers of the front end, and in hosted review it must do this without executing the notebook's scripts. That makes it an untrusted rendering surface that must sanitize active content.",
    k: ["Rendering outputs in review vs showing source only: rendering exposes result changes, but needs a safe renderer and large files in the review system; source-only is simple and hides changed numbers.", "Server-side rendering vs in the reviewer's browser: server-side sanitizes centrally and costs compute; browser rendering is cheap and runs untrusted content near the reviewer's session."],
    p: ["A change in a plot's data is invisible in a source-only review and merges unnoticed.", "A review renderer that runs notebook scripts lets a malicious change execute in the reviewer's session."],
    v: "Open a review of a change that alters one plot, and confirm both versions of the image appear side by side while no script in the notebook ran, shown by an empty network and console log.",
    dep: ["notebook-diff", "output-sanitization", "output-area"]
  }
});
