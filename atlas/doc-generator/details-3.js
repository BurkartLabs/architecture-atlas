// Details for the documentation generator plate, part 3: reading experience, search, hosting, rendering.
ATLAS.details("doc-generator", {
  "sidebar-nav": {
    s: "The navigation tree and per-page outline shown beside content, built from the navigation manifest and page headings, with the current location highlighted.",
    d: "The sidebar renders the site tree with collapsible sections and marks the current page. The outline lists headings of the open page and tracks scroll position. Reference sections can be thousands of entries, so the tree is often loaded lazily or split per section instead of embedded in every page. Embedding it fully makes each page large and each navigation change rebuild every page. On small screens it becomes a drawer.",
    k: ["Embed the tree in every page versus load it as a separate file: embedding works without script and bloats pages; a shared file is cached once and needs script.", "Mirror the file layout versus an authored order: file layout needs no maintenance; authored order teaches concepts in sequence and has to be kept up."],
    p: ["A navigation change forces every page in the site to rebuild and be redeployed.", "A deep reference tree with thousands of entries makes the page slow to open on phones."],
    v: "Open a page in the middle of a large section. The tree expands to its location, the current entry is highlighted, and the outline highlights the heading in view as the page scrolls.",
    dep: ["navigation-manifest","theme-system","page-model"]
  },
  "code-blocks": {
    s: "Rendering of code samples with highlighting, copy buttons, line numbers and tabs for alternative languages, so readers can choose their own language and copy accurately.",
    d: "Code blocks are highlighted at build time, wrapped with a copy control and optionally line numbers and emphasized lines. Language tabs group equivalent examples and remember the reader's choice across pages. Copying must produce the code only, without prompts, line numbers or hidden decoration. Examples with output show it separately. Consistent behavior depends on build-time highlighting, with script only for tabs and copying.",
    k: ["Tabs for each language versus separate pages: tabs keep related examples together and hide content from search and print; separate pages are indexable and multiply maintenance.", "Prompt characters in shown commands versus clean commands: prompts distinguish commands from output and break copying; clean commands copy correctly."],
    p: ["The copy button copies line numbers and prompts, and the pasted command fails.", "Content in an inactive tab is not found by in-page search or print."],
    v: "Click the copy control on an example with line numbers and a prompt, then paste into a file. The file contains exactly the code. Switch a language tab, navigate to another page and confirm the choice persists.",
    dep: ["syntax-highlighting","theme-system"]
  },
  "heading-anchors": {
    s: "Stable identifiers and visible permalink controls on every heading, so readers can link to a precise section.",
    d: "Each heading gets an identifier derived from its text through the slug generator, unique within the page. The theme shows a link control on hover that copies the full address. Explicit identifiers can be set by authors for headings whose text is likely to change. Heading changes alter the URL fragment, which is why checks and stable identifiers matter. Identifiers also act as targets for search results that point to a section.",
    k: ["Auto-generated from text versus explicit authored ids: automatic needs no effort and moves with rewording; explicit is stable and often forgotten.", "Anchor on every heading versus on selected levels: every heading is complete and noisy; selected levels reduce clutter and leave deep sections unlinkable."],
    p: ["Duplicate headings such as Examples on one page need disambiguation, and the order-based suffix shifts after edits.", "Hidden permalink controls are unreachable by keyboard."],
    v: "Open a page with two headings called Examples. Each has a distinct identifier, the link control copies the matching address, and loading that address scrolls to the right heading.",
    dep: ["slug-generation","theme-system"]
  },
  "switchers": {
    s: "Controls for choosing the documentation version and language, which keep the reader on the equivalent page where one exists and explain where one does not.",
    d: "The switcher reads a manifest of available versions and locales, shows the current one and links to the same page under another. When the page does not exist there, it falls back to the nearest parent or the home page with an explanation. The manifest is shared across all builds, so it is loaded at read time or regenerated for old versions. A banner on old versions points readers to the latest.",
    k: ["Link to the same page versus to the version home: the same page keeps context and is often missing; the home is always valid and discards position.", "Manifest baked into each page versus fetched at read time: baked pages never learn of new versions; fetched manifests update everywhere and need script."],
    p: ["The switcher on an old version does not list versions published later.", "Switching language lands on a not-found page because the translation lacks that page."],
    v: "From a page in an older version, use the switcher to go to the latest. A page that exists there opens at the equivalent location, and for a removed page the reader sees an explanation and the section home.",
    dep: ["version-aliases","locale-fallback","theme-system"]
  },
  "page-feedback": {
    s: "Links and controls on each page for reporting errors, suggesting edits and rating helpfulness, tied to the source file or symbol behind the page.",
    d: "An edit link goes to the source file in the repository, either the prose file or the source containing a doc comment, so a fix is a normal change request. A feedback widget records a rating or comment against the page and version. The mapping from a generated page back to its origin is the key piece, and it fails for generated or inherited content. Feedback needs a destination: a tracker, a form service or analytics, with privacy considered.",
    k: ["Edit link to the source repository versus an in-browser editor: repository links reuse review and require an account; in-browser editing lowers the barrier and needs infrastructure.", "Free text versus thumbs only: free text carries detail and spam; thumbs are cheap and tell little."],
    p: ["The edit link for a generated page opens the generated file, and no one can fix it there.", "Feedback accumulates in a place no one reads."],
    v: "Click the edit link on a prose page and on a symbol page. Each opens the file and line, at the right revision, containing the text on screen.",
    dep: ["source-links","theme-system"]
  },
  "reader-accessibility": {
    s: "Semantic markup, keyboard navigation, contrast, color-scheme support and respect for reader preferences, so documentation can be used by everyone.",
    d: "Pages use landmarks, ordered headings and labeled controls, and every interactive element works by keyboard with a visible focus. Themes support light and dark schemes and reduced motion. Code highlighting colors must keep enough contrast in both schemes. Tables and diagrams need text alternatives. Since themes and plugins add markup, accessibility is enforced by automated checks in the build and by manual testing with assistive tools.",
    k: ["Accessible-by-default theme versus per-project fixes: defaults help everyone and constrain designers; per-project fixes are flexible and routinely skipped.", "Automated checks versus manual testing: automated checks run on every page and find about a portion of issues; manual testing finds the rest and does not scale."],
    p: ["A highlighting color scheme looks fine in light mode and fails contrast in dark mode.", "A diagram rendered as an image has no text alternative and is unreadable to screen readers."],
    v: "Run an automated accessibility audit across a sample of pages and navigate one page using only the keyboard. There are no critical violations, focus is always visible and every control can be reached and used.",
    dep: ["theme-system","syntax-highlighting","diagram-and-math"]
  },
  "search-index-builder": {
    s: "Extracts titles, headings, body text and symbol names from every output page, together with weights and metadata, and writes the search index.",
    d: "After rendering, the builder reads each page's text, splits it into sections by heading, assigns fields such as title, heading, body and symbol name, and records URL, version and locale. Code and navigation text are excluded, or kept in a separate field. The index is then serialized for a client-side engine or sent to a hosted service. It must stay in step with the pages: indexing before the final output is complete yields stale entries.",
    k: ["Index per page versus per section: per-page indexes are small and send readers to the top; per-section indexes deep-link and grow large.", "One index for the whole site versus per version and locale: one index is simple and mixes results; separate indexes isolate versions and multiply storage."],
    p: ["Boilerplate text such as the sidebar is indexed on every page and drowns real matches.", "Hidden or deprecated pages are indexed and found."],
    v: "Search for a term appearing in a hidden page, in navigation chrome and in a normal page. Only the normal page is returned, and the result links to the correct section.",
    dep: ["text-analysis","page-model"]
  },
  "text-analysis": {
    s: "Splits text into searchable terms by tokenizing, case folding, stemming and removing stop words, with special handling for identifiers and code.",
    d: "Natural-language rules do not fit programming names. A good analyzer splits camel case and snake case, keeps dotted qualified names searchable by their parts and the whole, and stems prose but not identifiers. It must apply the same analysis at index and query time, per language for translated sites. Choices affect recall and precision: aggressive stemming finds more and mixes unrelated words.",
    k: ["Split identifiers into parts versus index whole names: splitting finds partial matches and adds noise; whole names are precise and miss parts.", "Stem prose versus exact words: stemming helps natural queries and conflates terms; exact matching is predictable and strict."],
    p: ["A query for a function name fails because the index split it and the query did not.", "Stop-word removal deletes meaningful short names such as a function called in."],
    v: "Search for a camel-case function name by its whole name, its first part and a plural-form natural query. All three return its page, and a query for an unrelated common word returns nothing from code fields.",
    dep: ["text-encoding"]
  },
  "client-side-search": {
    s: "A search engine running in the reader's browser over a prebuilt index file, so a static site gets search with no server.",
    d: "The browser downloads an index when the reader first searches, or in the background, and queries it locally. It supports prefix matching and typo tolerance, and returns highlighted excerpts. Index size is the limit: tens of thousands of pages can mean megabytes, so indexes are compressed, split into shards or reduced to titles and headings. Language-specific analysis must also be shipped to the browser.",
    k: ["Full-text index in the browser versus titles and headings only: full text finds more and costs download and memory; titles are small and miss body matches.", "Load index upfront versus on first focus: upfront is instant and wastes bandwidth for readers who never search; lazy loading costs a delay on first use."],
    p: ["A multi-megabyte index makes search slow or impossible on mobile connections.", "The index and the pages are deployed at different moments and results link to missing pages."],
    v: "Open a page on a throttled connection and type a query. Results appear within the target time after the index loads, and the downloaded index size is within the stated budget.",
    dep: ["search-index-builder","static-hosting"]
  },
  "hosted-search": {
    s: "An external or self-hosted search service that stores the index server-side and serves queries over an interface, for sites too large for browser indexes.",
    d: "At publish time, index records are uploaded to the service, and the page's search box queries it. The service supplies typo tolerance, analytics, synonyms and ranking tuning at scale. It adds a dependency, credentials, cost and a privacy question about sending reader queries to a third party. Index updates must be atomic per version so readers never see half of a release, and old records must be removed.",
    k: ["Hosted service versus client-side index: hosted scales and tunes better and adds cost, dependency and tracking; client-side is private and limited.", "Crawl the published site versus push records from the build: crawling needs no build integration and lags; pushing is immediate and requires credentials in CI."],
    p: ["Old records from removed pages stay in the index and return not-found results.", "The search credentials embedded in the page allow anyone to modify the index."],
    v: "Publish a release, then remove one page and publish again. Searching for text only that page contained returns nothing, and the query key shipped to browsers cannot write to the index.",
    dep: ["search-index-builder","publish-pipeline"]
  },
  "search-ranking": {
    s: "Orders results by relevance using field weights, exact-name boosts, popularity and version, so the page a reader wants is first.",
    d: "Scoring combines text relevance with signals that fit documentation: matches in a symbol name or title rank above body text, exact name matches above partial ones, the current version above older ones, guides above generated pages for conceptual queries, and deprecated items lower. Tuning needs real queries; the quick method is to examine the most common searches and the ones that return nothing. It is easy to fix one query and break ten.",
    k: ["Hand-tuned field weights versus learned ranking: weights are explainable and need care; learning adapts to behavior and needs data and is opaque.", "Prefer reference pages versus prefer guides: reference is precise for known names; guides serve readers who do not yet know the names."],
    p: ["Tuning for one popular query demotes results for others, and nobody notices without a test set.", "An old version outranks the current one because it has more inbound links."],
    v: "Run a fixed list of real queries against the index and check the expected page rank for each. The exact function name returns its page first, and a deprecated function ranks below its replacement.",
    dep: ["search-index-builder","text-analysis","deprecation-metadata"]
  },
  "search-filters": {
    s: "Controls and index fields that limit results to a version, locale, section or kind of page.",
    d: "Every indexed record carries version, locale, section and kind. The search box defaults to the current version and locale and offers filters to widen. Without it, results mix versions, and readers click through to documentation for a release they do not use. Filters must align with the switcher and with the canonical URLs, and counts in a facet should come from the index, not from guesses. Defaults decide behavior for most readers, so they matter more than the controls.",
    k: ["Default to the current version versus search all: default-current avoids wrong-version answers and hides older pages; search-all finds everything and confuses.", "Filter in the index versus after retrieval: in-index filtering is fast and exact; post-filtering is simple and returns too few results when most are excluded."],
    p: ["Results from three versions of the same function fill the first page.", "The filter state is lost on navigation and the reader searches again."],
    v: "Search a term that exists in two versions while on the older version's page. Results are from that version by default, and widening the filter shows the other with clear version labels.",
    dep: ["search-index-builder","version-model"]
  },
  "static-hosting": {
    s: "Serving the generated site as plain files from object storage or a file server, with correct content types, compression and index-file rules.",
    d: "A documentation site is a tree of HTML, scripts, styles and images. The host must map directory URLs to index files consistently with the generator's URL policy, return correct content types, serve compressed variants, apply cache headers and a custom not-found page. Whole-site deploys should be atomic: a reader mid-release must not see a mix of old and new files. The simplicity is the benefit; mismatches between generator and host cause most failures.",
    k: ["Atomic switch to a new immutable directory versus in-place file update: atomic switching avoids mixed states and keeps old releases for rollback; in-place is simple and exposes partial deploys.", "Serve pretty directory URLs versus explicit file names: directory URLs read well and need host rules; file names work on any server."],
    p: ["The host does not map the directory URL to the index file and every page returns not-found.", "A partial upload leaves new pages linking to scripts that are not there yet."],
    v: "Deploy a release, fetch the home page, a deep page, a missing page and a directory URL with and without trailing slash. Statuses and content types match the stated rules, and none returns a mix of versions.",
    dep: ["publish-pipeline","path-and-url-model"]
  },
  "cdn-cache": {
    s: "A content delivery network in front of the site, with cache rules and purging so that readers get fast pages and releases appear promptly.",
    d: "Hashed assets are cached for a long time and never purged. Pages are cached briefly or revalidated, and purged by path or tag on each publish. A CDN also provides compression, TLS and edge redirects. Wrongly set cache headers are the common issue: pages that stay stale for hours after release, or never cached at all. Search indexes and version manifests need short lifetimes because they change with every release.",
    k: ["Long cache with purge versus short cache with revalidation: purging gives speed and needs reliable invalidation; short lifetimes are forgiving and increase origin traffic.", "Purge everything versus purge changed paths: everything is simple and cold after each release; precise purging keeps hit rates and needs a correct changed list."],
    p: ["The version manifest is cached for a day and the new release is unlisted.", "A purge request fails silently and some regions serve old pages."],
    v: "Publish a change to one page and request it from two regions. Both return the new content within the stated time, while unchanged pages remain cache hits.",
    dep: ["static-hosting","content-hashing"]
  },
  "redirect-map": {
    s: "A maintained list of old URLs and their new locations, applied at the host or edge, plus generated redirects for moved and renamed pages.",
    d: "When pages move, are renamed or restructured by version, a redirect keeps their old addresses alive. Entries come from hand-written rules and from automatic comparison of the previous and current URL sets. Redirects are served as permanent status codes by the host, or as meta refresh pages on hosts without rules. The map must avoid chains and loops, handle patterns, and be tested. It grows over time and is a record of the site's history.",
    k: ["Server-side status redirects versus page-level refresh: status codes are proper and need host support; refresh pages work anywhere and are slower and weaker for search engines.", "Rule patterns versus a complete list: patterns are small and can catch the wrong URLs; lists are exact and long."],
    p: ["A redirect chain of several hops slows readers and some crawlers give up.", "A rule written for one section accidentally redirects pages in another."],
    v: "Request a sample of old URLs from the previous release. Each answers with a single permanent redirect to a page returning success, and none loops.",
    dep: ["path-and-url-model","canonical-urls"]
  },
  "preview-builds": {
    s: "A temporary site built from each change request, with a link posted back, so reviewers read the rendered result instead of source text.",
    d: "For every proposed change, CI builds the site and publishes it under a unique address, then comments the link. Reviewers can see layout, links and search. Builds should be incremental or restricted to affected sections to be quick, and previews expire when the change closes. Previews need authentication or obscure URLs if the content is not public, and they must not be indexed by search engines.",
    k: ["Build the whole site versus only changed pages: whole-site previews are accurate and slow; partial previews are fast and can miss cross-page breakage.", "Public previews versus authenticated ones: public are easy to share and expose unreleased content; authenticated are safe and add friction."],
    p: ["Preview sites are indexed by search engines and appear as duplicates of the real pages.", "Previews from forks run with deployment credentials."],
    v: "Open a change request that edits one page. A link appears within the build time, the preview shows the edit, and after the request closes the address no longer works.",
    dep: ["publish-pipeline","incremental-builds"]
  },
  "publish-pipeline": {
    s: "The automated sequence that builds, checks and deploys documentation on a release or merge, with gates, rollback and a record of what was published.",
    d: "Triggered by a tag or merge, the pipeline checks out the revision, builds each version and locale, runs quality checks, assembles the site with prior versions, uploads it, purges caches and updates the version manifest and search index. Failure at any step stops the release without touching the live site. It records which revision produced each version, and supports rebuilding an old version with the old toolchain.",
    k: ["Publish on every merge versus on release only: every merge keeps docs current and exposes unreleased features; release-only is controlled and stale between releases.", "Rebuild all versions each time versus only the new one: rebuilding applies theme changes everywhere and costs time; only-new is fast and leaves old versions on the old theme."],
    p: ["A failed deploy half-way leaves the site and its search index from different releases.", "The old version cannot be rebuilt because the toolchain for it is no longer available."],
    v: "Tag a release and watch the pipeline. The site, the manifest and the search index update together, and rolling back restores the earlier site in one step.",
    dep: ["strictness-policy","version-snapshots","repo-checkout"]
  },
  "docs-access-control": {
    s: "Restricts documentation to authorized readers, for internal or customer-only APIs, using authentication at the host or edge and per-section rules.",
    d: "Private documentation is protected by single sign-on or tokens at the edge, with rules per path, version or audience. The search index must follow the same rules, or titles leak through result excerpts. Previews, redirects and feeds also need protection. Since a static site has no server logic, the check happens before serving, so the host or CDN is the security boundary and must be configured with the same care as an application.",
    k: ["Protect at the edge versus build separate sites per audience: edge rules keep one build and depend on correct configuration; separate builds are safest and multiply cost.", "Gate the whole site versus selected sections: whole-site gates are simple; sections help mixed audiences and rely on path rules."],
    p: ["The public search index includes pages from private sections and their excerpts leak.", "A forgotten alternate path, such as a feed or sitemap, serves private content."],
    v: "Request a private page, its search entry, its source file and the sitemap without credentials. All are refused or omit the private content, and with valid credentials the page loads.",
    dep: ["static-hosting","search-index-builder"]
  },
  "page-model": {
    s: "The in-memory representation of each page and the site tree: URL, title, metadata, content tree, links, headings and relationships to other pages.",
    d: "Both prose pages and generated symbol pages become entries of one model before rendering. Each has a path, a body tree, headings, summary, version, locale and a list of links out. The model supplies the data to templates, navigation, search and checks. Keeping it separate from HTML lets multiple outputs share it. It is read-only during rendering. Incomplete modeling is a frequent cause of features that need page text to be re-parsed from rendered HTML.",
    k: ["Model-first versus generate HTML directly: model-first enables checks and many outputs; direct HTML is quicker to build and hard to analyze.", "Pages as simple records versus rich objects with behavior: records are easy to serialize and cache; rich objects are convenient and complicate caching."],
    p: ["Features read information back from rendered HTML because the model never kept it.", "Two sources create pages with the same path and one silently wins."],
    v: "Dump the page model for a build and compare it with the rendered file list. Every output page has exactly one model entry and every entry has one file, with no duplicate paths.",
    dep: ["markup-parser","declaration-model","path-and-url-model"]
  },
  "template-engine": {
    s: "Combines page data with templates to produce HTML, supporting inheritance, partials, loops, conditionals and escaping.",
    d: "Templates define page frames and reusable parts, such as signature blocks and parameter tables. The engine evaluates them against the page model and escapes output by default. Inheritance lets a theme override only a part. Logic in templates is kept small; heavier decisions belong in code. Error messages should name the template and line. Template evaluation dominates build time for large sites, so compiled templates and caching matter.",
    k: ["Logic-light templates versus full programming in templates: logic-light is safe and readable and needs more code for complex cases; powerful templates are flexible and hard to maintain.", "Escape by default versus opt-in escaping: default escaping prevents injection and requires explicit marks for trusted HTML; opt-in is convenient and dangerous."],
    p: ["Trusted-HTML marks are used on author text and open an injection path.", "A template error reports a line in generated code and not in the template."],
    v: "Render a page whose title contains angle brackets and a quote. The output shows them as text, and a deliberately broken template reports its own file and line.",
    dep: ["page-model"]
  },
  "theme-system": {
    s: "A package of templates, styles and scripts that defines how the site looks and behaves, with override points and versioning separate from content.",
    d: "A theme supplies layouts, partials, CSS, scripts and settings. Projects select one and customize through options, then template overrides, then a fork. Themes define which blocks pages can use, so content authors need only the markup. The theme version is part of cache keys. A project that overrides many templates must keep them updated when the theme changes, which is why override points should be few and documented.",
    k: ["Configuration options versus template overrides: options are safe across upgrades and limited; overrides are unlimited and break when internals change.", "One theme for reference and guides versus separate themes: one theme is consistent; separate themes suit each content type and drift visually."],
    p: ["A theme upgrade changes an internal block and silently breaks a project's override.", "Style rules written for one page type leak into others."],
    v: "Switch theme options for color and logo and rebuild. All pages change, and a project override of one partial still renders after upgrading the theme to a version with the same declared override points.",
    dep: ["template-engine","asset-pipeline"]
  },
  "syntax-highlighting": {
    s: "Colors code at build time using grammars for many languages, producing static markup that needs no script and reads well in light and dark themes.",
    d: "A highlighter tokenizes each block with a grammar for its language and emits spans with token classes. Doing it at build time removes script and flashes of unstyled code. Grammars are numerous and uneven: embedded languages, inline templates and new syntax need updates. Unknown languages fall back to plain text. Performance matters on sites with many blocks. Style sheets map token classes to colors with theme variants.",
    k: ["Build-time highlighting versus in the browser: build time gives fast, script-free pages; browser highlighting is easy to retrofit and costs every reader.", "Regular-expression grammars versus real parsers: regular expressions are simple and fooled by complex syntax; parsers are accurate and heavier."],
    p: ["A block labeled with an unsupported language name loses color silently.", "Highlighting treats a comment inside a string as a comment and colors the rest wrongly."],
    v: "Render blocks in five languages, one with embedded templates and one with an unknown label. Colors are correct in the first five, and the unknown block renders as plain text without failing the build.",
    dep: ["page-model"]
  },
  "diagram-and-math": {
    s: "Renders diagrams from text descriptions and mathematical notation into images or vector markup during the build or in the browser.",
    d: "Authors write a diagram or formula as text, which is rendered to vector graphics. Build-time rendering keeps pages self-contained and needs a renderer in the toolchain, which may be heavy. Browser rendering delays display and needs script. Output must be accessible with text alternatives, readable in dark mode and printable. Because the source is text, diagrams are diffable and reviewable, unlike pasted images.",
    k: ["Render at build time versus in the browser: build-time pages are static and need a heavy toolchain step; browser rendering is lightweight and slower to show and weaker offline.", "Text-based diagrams versus drawn images: text diffs and updates easily; drawn images allow free layout and rot."],
    p: ["A diagram's colors are unreadable in dark mode.", "A renderer update changes layout and every diagram shifts in the next build."],
    v: "Build a page with a diagram and a formula. Both render without script errors, appear in the print view, and have text alternatives listed in the accessibility tree.",
    dep: ["page-model","asset-pipeline"]
  },
  "asset-pipeline": {
    s: "Processes images, styles, scripts and fonts: copying, hashing file names, minifying, resizing and rewriting references in pages.",
    d: "Assets from the theme, from prose folders and from doc comments are collected, optimized and written to the output with content-hashed names so they can be cached forever. References in templates and markup are rewritten to the hashed names. Images get responsive sizes and modern formats where supported. Missing assets must be errors, not silent gaps. When two sources contribute a file with the same name, precedence must be defined.",
    k: ["Hashed file names versus fixed names: hashed names allow permanent caching and need reference rewriting; fixed names are simple and need cache purges.", "Optimize images at build time versus accept originals: optimization cuts page weight and build time grows; originals are fast to build and heavy."],
    p: ["A relative image path works from the prose folder and breaks on the generated page at a different depth.", "Two assets with the same name from different folders overwrite each other."],
    v: "Build a page referencing an image from a prose folder and one from a theme. Both load with hashed names and long cache headers, and renaming one source file without updating the reference fails the build.",
    dep: ["content-hashing","path-and-url-model"]
  },
  "alternate-outputs": {
    s: "Output formats beyond the web site, such as a single printable file, an offline bundle, a reader-friendly ebook and plain text for tools.",
    d: "The same page model can drive other renderers: a combined print layout with a table of contents, a packaged offline site, a plain-text or structured export for programs and assistants, and manual-page formats for command-line tools. Each format needs its own handling of links, navigation, code blocks and images. They are rarely tested as carefully as the web theme and fail on unusual content, such as wide tables.",
    k: ["Derive from the page model versus convert the finished site: the model gives clean output and needs a renderer for each format; converting HTML is quick and loses structure.", "Maintain every format versus the web only: more formats serve more readers and multiply testing; web only is simple and ignores offline users."],
    p: ["The print layout breaks wide tables and code across pages.", "Links in the offline bundle point to the live site, not to files in the bundle."],
    v: "Generate the offline bundle and open it with the network disabled. Navigation, search, images and cross-links all work, and the printable file's table of contents matches the site's.",
    dep: ["page-model","template-engine","asset-pipeline"]
  }
});
