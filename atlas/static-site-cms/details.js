// Details for the static site generator & CMS plate, part 1: editing interface and workflow.
ATLAS.details("static-site-cms", {
  "editing-ui": {
    s: "The browser application editors use to create and change content, with forms generated from the content schema and controls for saving, previewing and publishing.",
    d: "The application reads the schema and renders a form for each content type: inputs for each field, validation messages, and controls for state changes. It loads entries from the content store, saves through the same API other clients use, and keeps unsaved edits locally. Navigation lists collections, search and recent work. It is hard because the form must stay correct as schemas change, handle very long or deeply nested documents without lag, and avoid losing work when sessions expire or two editors open the same entry.",
    k: ["Forms generated from the schema vs hand-built screens: generation keeps the editor in step with the model, but unusual workflows need escape hatches that complicate the framework.", "Autosave vs explicit save: autosave protects against lost work, but it creates many revisions and makes half-finished states visible to previews and webhooks."],
    p: ["Two editors saving the same entry silently overwrite each other when there is no version check on save.", "A schema change removes a field and old entries open with data the form can neither show nor save."],
    v: "Open an entry in two browsers, edit and save in both, and confirm the second save is rejected or merged with a visible conflict rather than overwriting the first.",
    dep: ["content-types-and-schemas", "headless-content-api", "field-types", "identity-and-sso"]
  },
  "rich-text-editor": {
    s: "The text-editing control that lets authors format prose with headings, lists, links and emphasis while storing a structured document rather than loose markup.",
    d: "The editor keeps an internal document tree of paragraphs, headings and inline marks, with a schema defining which nodes may nest. Typing, pasting and shortcuts become transactions on that tree, which also provides undo. On save, the tree is serialized to a stored format such as a node tree or markdown, and templates later render it to HTML. It is hard because pasted content from word processors and web pages carries arbitrary markup, and because the stored format must remain readable years after the editor changes.",
    k: ["Storing a document tree vs storing HTML: a tree can be validated, transformed and rendered for many targets, but needs a converter for existing content and a renderer for every node type.", "Strict schema vs permissive paste: strictness keeps output consistent with the design, while loose paste is friendlier to authors who bring in text from elsewhere."],
    p: ["Pasting from a word processor brings in inline styles and empty elements that break the site's typography.", "Changing the editor's node format without a migration leaves old entries rendering as blank or raw data."],
    v: "Paste a formatted word-processor document with a table and colored text, and confirm the stored result contains only node types the schema allows and renders with site styles.",
    dep: ["editing-ui", "block-schemas", "markdown-pipeline"]
  },
  "structured-blocks": {
    s: "Page content built from an ordered list of typed blocks, such as hero, quote, gallery or call to action, each with its own fields, instead of one free-form body.",
    d: "A page field holds an array of block objects, each tagged with a type and carrying that type's fields. The editor offers an add-block menu, drag reordering and per-block forms. The templates map each type to a component that renders it, so design stays in code while ordering and content stay with editors. It is hard because blocks are a public contract: renaming a type or field breaks every page that uses it, and nested or recursive blocks complicate validation and rendering.",
    k: ["Typed blocks vs free-form rich text: blocks keep layout consistent and enable reuse across channels, but constrain authors who want a one-off arrangement.", "Block types owned by developers vs editor-defined layouts: developer ownership protects design integrity, while editor freedom reduces how often a change needs an engineer."],
    p: ["Renaming a block type leaves existing pages with blocks no component renders, and they disappear without an error.", "Deeply nested blocks make the editing form unusable and the render time unpredictable."],
    v: "Add one block of each type to a page, reorder them, publish, and confirm the generated HTML shows each block in the saved order; then delete a block type and confirm validation flags the page.",
    dep: ["block-schemas", "components", "editing-ui"]
  },
  "source-mode-editing": {
    s: "A plain-text way to edit the same content, typically markdown with front matter, for authors and developers who prefer a text editor over forms.",
    d: "Content is shown or edited as raw text: front matter on top for fields, body below. Edits are parsed against the schema on save, and parse errors point to a line. In file-based setups the editor is any text editor and the repository is the interface. In database-backed setups the application offers a source pane. It is hard because two representations must stay equivalent: a round trip between the form and the text must not reformat, reorder or drop anything.",
    k: ["Text as the primary format vs form as primary: text is portable, diffable and editor-agnostic, but gives non-technical authors no guardrails.", "Preserving formatting on round trip vs normalizing it: preserving avoids noisy diffs, but normalizing makes the output predictable and simpler to test."],
    p: ["A form save rewrites the file with different key order and quoting, so version-control diffs show changes nobody made.", "A stray indentation error in front matter makes the entire entry fail to parse."],
    v: "Open an entry in the form, save without changes, and confirm the stored file is byte-identical. Introduce a syntax error in the source pane and confirm the error names the line.",
    dep: ["front-matter-files", "editing-ui", "content-validation"]
  },
  "visual-inline-editing": {
    s: "Editing directly on the rendered page by clicking text or images in place, with the system mapping each visible element back to the field that produced it.",
    d: "The preview page is loaded with annotations that identify each rendered fragment's source field, usually through data attributes added at render time. Clicking an element opens the matching field editor or turns it into an editable region, and changes post back to the editor shell. The page may update live through a draft endpoint. It is hard because many elements are computed from several fields or from templates, so the mapping is incomplete, and because the annotated page must be a faithful copy of the production render.",
    k: ["Click-to-edit overlay vs full inline editing: an overlay is easier to build and keeps editing in the form, while true inline editing feels natural but only works for simple, directly bound fields.", "Preview rendered by the production templates vs a separate editing renderer: sharing keeps fidelity, but ties the editor to the site's runtime."],
    p: ["Computed values such as a combined title and site name cannot be mapped to one field, so editors click and nothing happens.", "Annotation attributes leak into the production build and expose internal field paths."],
    v: "Click each editable region on a sample page and confirm the matching field opens and the page updates after a change; then diff the production HTML and confirm no annotation attributes appear.",
    dep: ["draft-preview", "editing-ui", "templating-engine"]
  },
  "reference-picker": {
    s: "The control for linking one entry to another, with search, filtering and creation of new targets, used for authors, related posts, categories and internal links.",
    d: "A reference field stores the target's stable identifier, not its title or URL. The picker queries the content API with filters by type and status, shows titles with thumbnails, and can create a new entry in place. In rich text, an internal link inserts a reference that is resolved to the current URL at build time. It is hard because identifiers must survive renames, deleting a target must be handled, and picking among thousands of entries needs search that is fast and filters that match the field's constraints.",
    k: ["Linking by identifier vs by URL: identifiers survive slug changes and moves, but require resolution at build and a clear failure when the target is gone.", "Inline creation of targets vs separate creation: inline is faster for authors, but produces half-filled entries that clutter the library."],
    p: ["Deleting a referenced entry leaves pages pointing at nothing and the build either fails or silently drops the link.", "A picker that lists unpublished entries lets a public page link to a draft."],
    v: "Link a post to an author, rename the author's slug, rebuild, and confirm the link still points to the new URL. Delete the author and confirm validation reports the dangling reference.",
    dep: ["relations-and-references", "query-api", "editing-ui"]
  },
  "drafts-and-states": {
    s: "The lifecycle states an entry moves through, such as draft, in review, approved and published, with rules about who may move it and what each state exposes.",
    d: "Each entry carries a state, and often separate draft and published copies so editing a live page does not change it until the next publish. Transitions are checked against permissions and required fields. Public content endpoints and builds return only published copies, while previews may return drafts. It is hard because the published copy must be a stable snapshot, unpublishing must remove content from every output including feeds and search, and the model must handle edits to an already-published entry.",
    k: ["Separate draft and published copies vs a single record with a flag: copies let editors work safely on live pages, but double storage and require merge logic.", "Fixed states vs configurable workflows: fixed states are simple to reason about, while configurable ones fit organizations at the cost of more states to test."],
    p: ["A build that reads drafts by accident publishes unfinished content to the public site.", "Unpublishing removes the page but leaves it in the feed, sitemap and search index until a full rebuild."],
    v: "Edit a published entry and save as draft, rebuild, and confirm the public page still shows the old text. Unpublish and confirm the page, feed entry, sitemap line and search record all disappear.",
    dep: ["content-types-and-schemas", "content-database", "roles-and-permissions"]
  },
  "scheduled-publishing": {
    s: "Setting a future time at which an entry goes live or is removed, so launches and embargoes happen without someone pressing a button.",
    d: "An entry stores publish and unpublish timestamps. A scheduler checks due items and flips their state, then fires the same rebuild trigger a manual publish would. For static output, nothing changes until a build runs, so the scheduler must start the build close to the target time and the build must use the same clock to decide what is visible. It is hard because time zones, clock skew, build duration and caching all push the moment a visitor actually sees the content away from the nominal time.",
    k: ["Scheduler flips state and triggers a build vs build computes visibility from timestamps: the first is explicit and auditable, the second works with periodic builds but needs every output to apply the same rule.", "Exact-time builds vs a periodic build: exact timing meets embargoes but costs unscheduled builds, while periodic builds are cheap and late by up to one interval."],
    p: ["A ten-minute build means an embargoed story is live ten minutes after its stated time, or early if the cache is warmed.", "Times stored without zones publish an hour off after a daylight saving change."],
    v: "Schedule a page for two minutes ahead, then confirm the first public request that returns it occurs within the expected build time of the target and not before it.",
    dep: ["drafts-and-states", "scheduled-rebuilds", "job-queue"]
  },
  "revisions-and-history": {
    s: "A stored record of every saved version of an entry with who changed it and when, so earlier states can be inspected and recovered.",
    d: "On each save or publish, the system writes a snapshot or a delta with author, timestamp and optional message. In file-based setups the repository history serves this role. Retention rules limit growth, and some systems mark published revisions specially. It is hard because rich documents produce large snapshots, autosave floods the history with noise, and references inside old revisions may point to entries or media that no longer exist.",
    k: ["Full snapshots vs deltas: snapshots are simple to read and restore but grow quickly, while deltas are compact but require replaying a chain.", "Revision on every save vs on explicit publish: every save gives fine recovery but a noisy list, while publish-only history is readable but loses work in progress."],
    p: ["Autosave creates hundreds of revisions per entry and the history list becomes unusable.", "Restoring an old revision brings back a reference to a deleted image and the page renders with a broken one."],
    v: "Edit an entry five times, publish twice, and confirm the history lists each version with author and time, and that opening the oldest shows its exact original content.",
    dep: ["content-database", "version-control-store", "drafts-and-states"]
  },
  "diff-and-restore": {
    s: "Showing what changed between two versions of an entry, field by field, and bringing back an older version, wholly or in part.",
    d: "The comparison walks both versions according to the schema, showing changed fields and, for text, word-level differences. For blocks it must match items across reordering. Restoring creates a new revision whose content equals the old one, rather than deleting later history. Partial restore lets an editor take one field. It is hard because structured documents have no single natural diff, moves are mistaken for delete and insert, and a restore must respect the current schema.",
    k: ["Schema-aware diff vs text diff of serialized data: schema awareness reads like the form, but needs a differ for every field type, while text diff is general and noisy.", "Restore as a new revision vs rewinding history: a new revision keeps the audit trail intact, while rewinding is tidier and destroys evidence."],
    p: ["A restored version containing a field that has since been removed from the schema fails validation on save.", "Reordering blocks shows as a whole-list change, hiding the one edit that mattered."],
    v: "Change one word and reorder two blocks, open the comparison, and confirm only those changes are highlighted; then restore the old version and confirm a new revision appears with identical content.",
    dep: ["revisions-and-history", "content-types-and-schemas", "block-schemas"]
  },
  "roles-and-permissions": {
    s: "The rules that say which users may read, create, edit, publish or delete which content, by role, content type, locale or individual entry.",
    d: "Users receive roles, and roles hold permissions on actions and resources. The check runs in the content API, so the interface, scripts and integrations are all covered, and the interface merely hides what would be refused. Rules can depend on field values, such as owning the entry, or on locale. It is hard because permissions multiply across types and languages, relations let a user reach content through a link they cannot open directly, and field-level rules complicate every query.",
    k: ["Role-based rules vs per-entry grants: roles are easy to audit and assign, while per-entry grants fit exceptions at the cost of rules that nobody can summarize.", "Enforcing in the API vs only in the interface: API enforcement closes every path, but every query pays the cost of filtering."],
    p: ["Permissions enforced only by hiding buttons let anyone with a token call the API and publish.", "A reader denied an unpublished entry can still see its title through a reference from another entry."],
    v: "Sign in as a role without publish rights, call the publish endpoint directly with its token, and confirm a refusal and an audit entry; then confirm the same role cannot read an entry of a type it is denied.",
    dep: ["identity-and-sso", "headless-content-api", "content-types-and-schemas"]
  },
  "approval-workflow": {
    s: "A defined path of review steps an entry must pass, with named approvers, before it may be published, and a record of who approved what.",
    d: "Entries move from draft to review states. Each step names a role or group, may require a quorum, and records decisions with comments. Publishing is blocked until the required approvals exist on the current version. Notifications tell reviewers they have work. It is hard because an edit after approval must invalidate it, reviewers need to see exactly what changed, and urgent corrections need a path that skips steps without becoming the normal route.",
    k: ["Approval bound to a specific revision vs to the entry: binding to a revision prevents bait-and-switch edits, but forces re-review for trivial fixes.", "Strict gates vs advisory review: strict gates guarantee control for regulated content, while advisory review keeps teams fast but cannot prove who checked."],
    p: ["Editing an entry after approval leaves the approval attached, so unreviewed text goes live under a reviewer's name.", "An approver who has left the company leaves entries stuck with no one able to move them."],
    v: "Submit an entry, approve it, edit one word, and confirm publishing is blocked until a new approval is recorded against the edited revision; the audit log shows both decisions.",
    dep: ["drafts-and-states", "roles-and-permissions", "revisions-and-history", "audit-log"]
  },
  "translation-workflow": {
    s: "The process by which source-language content is sent for translation, tracked per locale, and returned and reviewed before the translated entry is published.",
    d: "When a source entry changes, the system marks each locale's version as outdated and creates translation tasks listing the changed fields. Work is done in the editor, exported as files for translation vendors, or sent to a translation service, and returns into the matching fields. Each locale has its own state and its own approval. It is hard because source changes arrive while translation is in progress, structured and block content must keep its shape, and untranslated pages need a deliberate fallback.",
    k: ["Translate by field vs by whole entry: field-level tasks keep cost down when a small change is made, but need change tracking per field.", "Falling back to the source language vs hiding untranslated pages: falling back keeps the site complete but mixes languages, while hiding keeps each locale clean and thin."],
    p: ["A source edit mid-translation is overwritten by the returning translation, and the locale now says something different from the source.", "Export formats drop block structure, so translated text is pasted into the wrong blocks."],
    v: "Change one field in a source entry and confirm each locale is marked outdated with only that field flagged; return a translation and confirm it lands in the right field and clears the flag.",
    dep: ["localized-fields", "drafts-and-states", "roles-and-permissions", "locale-routing"]
  },
  "audit-log": {
    s: "An append-only record of who did what and when across the system: edits, publishes, permission changes, logins and API token use.",
    d: "Each significant action writes an event with actor, action, target, time and, where useful, before and after values. Events go to storage that ordinary users and the application itself cannot rewrite. Interfaces filter by user, entry and period. It is hard because the volume of events can exceed the content itself, privacy rules may require removing personal data from an otherwise immutable log, and actions done by integrations need an identity that is meaningful to a reader.",
    k: ["Recording before and after values vs only the fact of the change: values enable investigation, but store sensitive content a second time with its own access rules.", "Separate immutable store vs a table in the content database: a separate store resists tampering, while a table is simpler and queryable with content."],
    p: ["Automated actions are logged under one shared service identity, so nobody can say which integration made a change.", "Logs retained forever keep personal data that a deletion request required removing."],
    v: "Change a permission, publish an entry and revoke a token, then confirm three events appear with the right actor and time, and that the application account cannot update or delete them.",
    dep: ["identity-and-sso", "headless-content-api", "object-storage"]
  }
});
