// Details for the static site generator & CMS plate, part 2: content model, sources and API.
ATLAS.details("static-site-cms", {
  "content-types-and-schemas": {
    s: "Declarations of each kind of content, such as article, author or product, listing its fields, types, constraints and defaults, from which forms, validation and APIs are derived.",
    d: "A schema names a content type and lists its fields with type, required flag, limits and help text. It is stored as code or data, versioned with the site, and read by the editor to build forms, by the API to validate writes, and by the generator to type its data and check templates. It is hard because it is the one artifact every layer depends on: loosening it is easy, but tightening it can invalidate thousands of existing entries.",
    k: ["Schema in code vs schema edited in the interface: code is reviewable and deployable with templates, while interface editing is quick but drifts between environments.", "Strict validation on write vs lenient storage with validation at build: strict writes keep the store clean, while lenient storage never blocks an editor but moves failures to the build."],
    p: ["A new required field makes every existing entry invalid and blocks the build until all are edited.", "Schemas edited separately in staging and production diverge, so content copied between them fails."],
    v: "Add a required field to a type with existing entries and confirm the system lists every entry that now fails, and that the editor form shows the new field with its constraint.",
    dep: ["field-types", "version-control-store"]
  },
  "field-types": {
    s: "The catalog of value kinds a field can hold, such as text, number, date, boolean, enumeration, media, reference and block list, each with its own editor control and storage form.",
    d: "Every field type defines how a value is stored, validated, edited and returned by the API. Primitive types are simple; richer ones such as slugs, geographic points, color values or rich text carry formatting rules and options. Custom types let teams add their own widgets. It is hard because each added type must work in the form, the API, the query language, search, diffs and translation, so the cost of a new type is paid in many places.",
    k: ["A few general types vs many specialized ones: few types are easy to support everywhere, while specialized types give better editing at the cost of broader maintenance.", "Typed values in the API vs opaque JSON: typed values allow filtering and validation, while opaque JSON is flexible but pushes interpretation onto every consumer."],
    p: ["A date field stored without a time zone is read differently by the editor, the build and the browser.", "A custom field type works in the form but is missing from the query API, so it cannot be filtered on."],
    v: "Create one entry using every field type, fetch it through the API, and confirm each value comes back in its declared type and renders correctly in the editor, diff view and a template.",
    dep: ["content-types-and-schemas"]
  },
  "relations-and-references": {
    s: "Typed links between entries, one-to-one, one-to-many or many-to-many, that let a page pull in its author, category, related items or parent.",
    d: "A relation field stores identifiers of targets, constrained to allowed types. The API can return identifiers only or expand targets to a requested depth. At build time, the loader resolves references into objects so templates can read them directly. Inverse links, such as all posts by an author, are computed by query. It is hard because of cycles, deep expansion that multiplies queries, dangling targets after deletes, and dependency tracking: a page that shows an author's name must rebuild when the author changes.",
    k: ["Expanding references at query time vs resolving at render time: query-time expansion costs one request but returns large payloads, while render-time resolution keeps payloads small and multiplies lookups.", "Enforcing referential integrity on delete vs allowing dangling links: enforcement prevents broken pages, but makes deleting entries a multi-step cleanup."],
    p: ["A change to an author does not rebuild the pages that display their name because the dependency was never recorded.", "Circular references between entries send expansion into an infinite loop or a huge payload."],
    v: "Rename an author and rebuild incrementally; confirm every page that shows the name is regenerated and no other page is. Delete a referenced entry and confirm the system reports each referencing page.",
    dep: ["content-types-and-schemas", "dependency-tracking"]
  },
  "content-collections": {
    s: "Named groups of entries of the same type, such as posts or docs, that can be listed, sorted, filtered and paged, and that templates treat as one data set.",
    d: "A collection is defined by a source location or a type plus an optional filter, with a schema applied to every member. The build loads it once and exposes it as a sorted list with computed fields such as dates and excerpts. Templates iterate it to generate index pages, feeds and navigation. It is hard because collections are the main fan-out point: one edit can change many listings, and sorting or filtering rules must be identical in every place the collection appears.",
    k: ["Collections defined by folder vs by tag or query: folders are obvious and cheap, while query-defined collections allow one entry in several groups but hide membership.", "Sorting once at load vs at each use: sorting once is fast and consistent, but templates that need another order must re-sort or define another view."],
    p: ["Two templates sort the same collection differently, so previous and next links disagree with the index.", "Drafts included in a collection by default show up in listings in production."],
    v: "Publish a post with a date in the past and confirm it appears in the index, previous/next links, feed and sitemap in the same position; confirm a draft appears in none of them.",
    dep: ["content-types-and-schemas", "build-time-data-loading"]
  },
  "taxonomies": {
    s: "Ways of classifying content, such as categories, tags and series, with their own pages, counts and sometimes hierarchy, shared across entries.",
    d: "A taxonomy is a content type or a controlled list of terms, with entries referencing terms. Each term can have a description, slug and parent. The generator builds a page per term listing its entries, and often an index of all terms. Counts and related-content logic derive from the same data. It is hard because free-form tags create near-duplicates, renaming a term changes URLs and every referencing page, and a large site can generate thousands of tiny term pages.",
    k: ["Controlled terms vs free tagging: controlled lists keep classification clean, while free tagging is easier for authors and fills with variants.", "Flat vs hierarchical terms: hierarchy supports browsing and breadcrumbs, but needs rules for entries assigned to both parent and child."],
    p: ["Tags differing by case or plural produce duplicate term pages with split listings.", "Renaming a term changes its URL with no redirect and breaks inbound links."],
    v: "Tag three entries with a term, rename the term, rebuild, and confirm the term page lists all three at the new URL and the old URL redirects to it.",
    dep: ["content-types-and-schemas", "relations-and-references"]
  },
  "singletons-and-globals": {
    s: "Content types with exactly one entry, such as site settings, navigation, footer and home page, holding information that many pages share.",
    d: "A singleton is declared as a type that cannot have more than one entry and is addressed by name. The build loads it into global data available to every template. Navigation menus, default metadata, contact details and feature flags live here. It is hard because a change to a global affects every page, which defeats incremental builds, and because it ties every page's output to one record that many editors may want to change.",
    k: ["Globals read by every page vs passed only where needed: global access is convenient, while explicit passing makes dependencies visible and rebuilds narrower.", "One large settings entry vs several small ones: a single entry is easy to find, while small entries separate permissions and limit the pages touched by a change."],
    p: ["Editing the footer link rebuilds the entire site because every page depends on the global entry.", "A singleton accidentally created twice makes the build pick one at random."],
    v: "Edit the site tagline, rebuild, and confirm the build log shows which pages were regenerated and that every template using the tagline changed, while pages not using it did not.",
    dep: ["content-types-and-schemas", "dependency-tracking"]
  },
  "block-schemas": {
    s: "Definitions of each block type allowed in a page body, with its fields, allowed nesting and which content types may use it.",
    d: "A block schema is a small content schema nested inside a field. The page field lists the block types it accepts, and each type lists its own fields, possibly including more blocks. The editor builds the add menu and per-block forms from it, validation checks stored blocks against it, and the template layer needs a component for every type. It is hard because stored content references block type names permanently, so schema changes need migrations, and variants are hard to model without exploding the number of types.",
    k: ["Many narrow block types vs few configurable ones: narrow types are clear to authors and designers, while configurable ones reduce components but add options nobody remembers.", "Allowing nesting vs flat lists: nesting supports layouts such as columns, but multiplies validation and rendering paths."],
    p: ["A block type removed from the schema leaves old pages with unrenderable data that nobody notices until a visitor complains.", "Optional fields without defaults render empty wrappers that break layout."],
    v: "Remove a block type from a schema, run validation, and confirm every page containing it is listed; then add the type back and confirm all pages validate and render.",
    dep: ["content-types-and-schemas", "field-types"]
  },
  "localized-fields": {
    s: "Fields, or whole entries, that hold a separate value per language or region, with rules for which fields are translated and which are shared.",
    d: "A field is marked localizable, and the store keeps one value per locale, either inside one entry or as sibling entries linked by a translation group. Non-localized fields such as dates or images are shared across languages. The API takes a locale parameter and a fallback chain. It is hard because deciding what is translatable is a content decision with cost, and because some values, such as images with text or currency, are shared by default and wrong in other locales.",
    k: ["Locales as fields within one entry vs one entry per locale: one entry keeps variants together, while separate entries let each locale have its own state, structure and publication date.", "Fallback chains vs strict locales: fallbacks avoid empty pages, but can show text in the wrong language to a visitor."],
    p: ["A shared image contains embedded English text, so every locale shows it.", "A fallback silently serves the default language for a field the translators missed."],
    v: "Request one entry in each locale and confirm localized fields return that locale's values, shared fields are identical, and a missing translation follows the configured fallback and is reported.",
    dep: ["field-types", "content-types-and-schemas"]
  },
  "schema-migrations": {
    s: "Versioned, repeatable scripts that change stored content to match a schema change, such as renaming a field, splitting one into two or changing a block's shape.",
    d: "When a schema changes, existing entries must be transformed. A migration describes the change as steps applied in order to each entry, is tested against a copy, and is recorded as applied. For file-based content it rewrites files; for a database it updates records, and published copies and revisions must be considered. It is hard because there may be millions of entries, because history still holds the old shape, and because the editor, API clients and builds all run different code versions during rollout.",
    k: ["Migrating all content at once vs reading old shapes lazily: all at once leaves one clean shape, while lazy reading avoids downtime and leaves permanent compatibility code.", "Migration tied to schema deploy vs run separately: tied deploys cannot be skipped, but a long migration blocks release."],
    p: ["A migration rewrites drafts and published copies differently, so the live site changes shape before editors expect it.", "No dry run means a bad transform is discovered only after it has overwritten the only copy."],
    v: "Run the migration on a copy, diff the result against the original for a sample of entries, then apply it and confirm the build passes validation with no entries in the old shape.",
    dep: ["content-types-and-schemas", "version-control-store", "content-validation"]
  },
  "front-matter-files": {
    s: "Content stored as text files, each starting with a block of structured metadata followed by a body, kept in folders that mirror the site.",
    d: "A file begins with a delimited header holding fields such as title, date and tags in a structured text format, followed by the body in a lightweight markup. The generator walks a content folder, parses each file, and attaches the parsed data and the path. Folders may imply type, section or URL. It is hard because there is no database: relations, validation and queries must be built by the generator, large folders slow every build, and files edited by hand can break parsing.",
    k: ["Files in a repository vs a database: files bring versioning, review and offline work for free, while databases offer queries, concurrency and permissions.", "Front matter for all fields vs separate data files: front matter keeps data beside the body, while data files suit structured content that has no body."],
    p: ["An unquoted colon or tab in the header silently changes a value's type or fails parsing for the whole file.", "Moving a file changes its inferred URL, breaking links with nothing in the build to warn."],
    v: "Add a file with a malformed header, run the build, and confirm it fails with the file name and line; fix it and confirm the entry appears with each field in its declared type.",
    dep: ["version-control-store", "content-types-and-schemas"]
  },
  "git-backed-storage": {
    s: "A content system that reads and writes content as commits in a repository, giving history, branches and review through the same tools used for code.",
    d: "The editor application commits changes on behalf of the author, often to a branch, and opens a request for review. The repository's history is the revision history, and merging is publishing. Media may be stored alongside or in external storage with pointers. Webhooks from the repository start builds. It is hard because the repository has no concept of locks or rich queries, commits from the application need identity and rate control, and large binary files and many small edits bloat history.",
    k: ["Branch per change vs commit directly to the main line: branches give review and previews, while direct commits are simpler and make mistakes live immediately.", "Binaries in the repository vs in object storage: in the repository they stay versioned together, but they slow every clone."],
    p: ["Two editors saving at once produce merge conflicts in files they cannot see or resolve in the interface.", "Large images committed directly make clones slow and builds start with a long download."],
    v: "Edit an entry in the interface, confirm one commit appears on a branch with the editor's identity, merge it, and confirm the build triggered by the merge produces the change.",
    dep: ["version-control-store", "front-matter-files", "identity-and-sso"]
  },
  "content-database": {
    s: "A database that stores entries as records with fields, relations and states, giving the editing application queries, concurrency control and permissions.",
    d: "Entries are rows or documents with columns or fields for each schema field, plus metadata such as state, locale, timestamps and version. The content API reads and writes through it. Relations use keys, and drafts and published copies are separate rows or flags. Indexes support filtering and sorting. It is hard because schema changes become database changes, backups must cover content and media pointers together, and exporting a consistent snapshot for builds needs care while editors keep writing.",
    k: ["Relational tables per type vs a generic document store: tables enforce structure and queries, while documents handle changing and nested shapes more easily.", "One database for editing and delivery vs a separate read replica for builds: one is simpler, but heavy builds then compete with editors."],
    p: ["A build reading page by page while editors save sees a mix of old and new content that never existed together.", "Restoring a database backup without the matching media storage leaves entries pointing at missing files."],
    v: "Start a full build while saving edits, then confirm the output corresponds to a single consistent snapshot, by checking that related pages show the same version of a shared entry.",
    dep: ["content-types-and-schemas", "object-storage"]
  },
  "headless-content-api": {
    s: "A network interface that serves and accepts content as structured data, separate from any presentation, so builds, apps and tools all read the same source.",
    d: "The API exposes endpoints for entries, types, media and users, returning structured data with fields, references and locale. Read access may be public for published content, with a separate authenticated path for drafts. Write access serves the editing interface and automation. Responses can be filtered, sorted, paged and expanded. It is hard because it is a public contract that many clients depend on, and because build tools request thousands of entries at once.",
    k: ["One API for editors and consumers vs separate delivery and management interfaces: one is simpler, while separation lets delivery be cached, read-only and scaled independently.", "Versioned API vs always-current: versioning protects old clients, but multiplies what the team must maintain."],
    p: ["A build requesting entries one at a time hits rate limits and takes hours.", "Draft content exposed through a public endpoint because the published filter was left out of a new route."],
    v: "Request a list of published entries without credentials and confirm only published content returns with stable paging; repeat with a draft identifier and confirm a refusal.",
    dep: ["content-database", "content-types-and-schemas", "api-authentication"]
  },
  "query-api": {
    s: "The query language or parameters through which clients select exactly the fields, filters, sort order and related entries they need in one request.",
    d: "Clients send a query naming a type, filters over fields, sort, page size and the fields or relations to include. The server translates it into storage queries, checks permissions, and shapes the response. Some offer a typed graph query language, others a parameter grammar over standard endpoints. It is hard because flexible queries can be expensive, deep relation expansion can fan out unbounded, and the same filters must behave identically across storage engines and locales.",
    k: ["Client-shaped queries vs fixed endpoints: shaped queries avoid over-fetching and extra requests, while fixed endpoints are easier to cache, secure and reason about.", "Rich filter operators vs a small safe set: rich operators serve every need, but expose slow queries and complicate permission checks."],
    p: ["A deeply nested query multiplies into a very expensive database call that slows editors for everyone.", "Filters on unindexed fields work in a small test site and time out on the real one."],
    v: "Run a query filtering on a field across a full-size data set, and confirm it returns within the target time and that the server limits depth and size for an overly large query.",
    dep: ["headless-content-api", "relations-and-references", "content-database"]
  },
  "api-authentication": {
    s: "Credentials and checks that identify callers of the content API, separating public read access from editor tokens, build tokens and integrations, each with defined scopes.",
    d: "Public reads may need no credential, while drafts, writes and management need tokens. Tokens are issued per user or per integration with scopes such as read drafts or write one type, expire or can be revoked, and are checked on every request. Preview tokens may be short-lived and tied to one entry. It is hard because build tokens sit in build environments and logs, and because one overbroad token shared among tools makes leaks impossible to trace.",
    k: ["Long-lived scoped tokens vs short-lived exchanged tokens: long-lived tokens are simple for builds, while short-lived ones limit exposure at the cost of refresh logic.", "Per-integration tokens vs shared team tokens: per-integration tokens allow revocation and tracing, but need an inventory that someone must maintain."],
    p: ["A token with write scope stored as a build variable is printed in a public build log.", "A revoked token continues to work because a cache in front of the API keeps accepting it."],
    v: "Revoke a build token and confirm the next request with it is refused within the stated time, while other tokens keep working; confirm the audit log names the revoked token.",
    dep: ["identity-and-sso", "secrets-and-config", "roles-and-permissions"]
  },
  "external-data-sources": {
    s: "Other systems whose data the site shows, such as product catalogs, event feeds, reviews or spreadsheets, pulled in through their interfaces at build time.",
    d: "Loaders fetch data from remote endpoints, files or services, normalize it to the content model, and feed it into the same pipeline as native content. Results are cached between builds, and failures fall back to the last good copy. Some sources are merged with editorial content, for example adding a description to a product. It is hard because external systems change shape, rate limit, go down during a build, and because the content you did not write can still be wrong, copyrighted or sensitive.",
    k: ["Fetching during every build vs syncing into the content store: fetching is simple and fresh, while syncing isolates builds from outages and rate limits.", "Failing the build on a bad response vs using stale data: failing is honest, while stale data keeps the site up and may hide a long outage."],
    p: ["A remote service returns an empty list during an outage and the build publishes a site with every product removed.", "A field renamed upstream becomes undefined in templates and renders as empty text."],
    v: "Make the remote source return an error during a build and confirm the build either fails clearly or uses the cached copy and reports its age, and never publishes an empty set.",
    dep: ["content-sync-and-cache", "build-time-data-loading", "secrets-and-config"]
  },
  "content-sync-and-cache": {
    s: "Copying content from its source into a local store the build reads, with change detection so only updated entries are fetched.",
    d: "A sync step asks the source for entries changed since a stored cursor, writes them to a local cache keyed by identifier, and records the new cursor. Deletions arrive as tombstones. Builds then read the cache, not the network. The cache can be restored from the build cache between runs. It is hard because cursors can be lost, deletions can be missed, partial syncs leave an inconsistent cache, and a full resync must be possible and cheap enough to run.",
    k: ["Incremental sync by cursor vs full fetch each time: incremental is fast and light on the API, while full fetch is simple and self-healing.", "Persisting the cache between builds vs rebuilding it: persistence speeds builds, but a corrupted cache produces wrong sites that look right."],
    p: ["Deletes never reach the cache, so removed pages keep being published for months.", "A cache keyed without the locale or state mixes drafts into a production build."],
    v: "Delete an entry at the source, run the sync and a build, and confirm the page disappears; then wipe the cache, resync, and confirm the output is identical.",
    dep: ["headless-content-api", "build-cache", "object-storage"]
  },
});
