// Details for the static site generator & CMS plate, part 3: media, templating and routing.
ATLAS.details("static-site-cms", {
  "media-library": {
    s: "The shared catalog of uploaded images, video and documents, with browsing, search, folders and tags, from which pages pick assets by reference.",
    d: "Each asset is a record with a stored original, metadata, a stable identifier and derived renditions. The interface offers search by name, tag, type and date, bulk actions and replacement of a file while keeping its identifier. Fields in content point to asset identifiers, not file paths. It is hard because the library grows without bound, duplicates accumulate, replacing a file must update every page that uses it, and deleting an asset must be blocked or reported if anything still references it.",
    k: ["References by asset identifier vs by file path: identifiers survive moves and replacement, but need resolution at build and an index of usage.", "One global library vs libraries per site or team: global sharing reduces duplicates, while separate libraries simplify permissions and clean-up."],
    p: ["Deleting an asset that looks unused breaks a page that referenced it from a rich-text field the usage scan did not read.", "The same photo uploaded fifty times under different names makes updates impossible to apply everywhere."],
    v: "Replace an image keeping its identifier, rebuild, and confirm every page using it shows the new file; try deleting an asset in use and confirm the system lists its referencing pages.",
    dep: ["media-storage", "asset-metadata", "media-usage-tracking"]
  },
  "upload-handling": {
    s: "Receiving files from editors safely: size and type limits, large-file transfer, virus and content checks, and storing the original before any processing.",
    d: "The browser sends the file directly to storage using a signed upload address or through the application. The system checks declared and detected type, size and dimensions, strips or keeps metadata, optionally scans for malware, and then registers the asset and queues renditions. Large files use resumable chunked transfer. It is hard because files are untrusted input: a renamed executable, an image bomb or an image with embedded location data can all pass a naive check.",
    k: ["Direct-to-storage upload vs through the application: direct is faster and spares the app, while proxying allows inspection before anything is stored.", "Stripping metadata by default vs keeping it: stripping protects privacy such as location, but loses credits and camera data that some sites want."],
    p: ["A file with a safe extension but different content type is accepted and served with a content type that runs script.", "Photos keep their location data and the site publishes where they were taken."],
    v: "Upload a text file renamed to an image extension and an image with location data, and confirm the first is rejected on detected type and the second has its location removed.",
    dep: ["object-storage", "media-library", "roles-and-permissions"]
  },
  "asset-metadata": {
    s: "Descriptive data attached to each asset, such as title, alt text, caption, credit, license and language, used by templates and by accessibility and search.",
    d: "Metadata is stored on the asset, with alt text possibly overridable per use because the right description depends on the surrounding content. Technical data such as dimensions, format, color profile and duration is extracted on upload. Templates read it to emit alternative text, captions and structured data. It is hard because editors skip it, accessibility depends on it, and the same image needs different text in different contexts and languages.",
    k: ["Alt text on the asset vs on each use: asset-level text is written once, while per-use text can match the context and is more work for editors.", "Required metadata at upload vs later: requiring it improves quality, but slows bulk imports and encourages meaningless placeholders."],
    p: ["Alt text left as the file name is accepted by validation and read aloud by screen readers.", "Captions are not localized, so translated pages show the original language under images."],
    v: "Publish a page with an image lacking alt text and confirm the build reports it by page and asset; then add text and confirm it appears in the output markup.",
    dep: ["media-library", "localized-fields", "content-validation"]
  },
  "image-transformations": {
    s: "Producing derived versions of an original image on demand or at build time: resized, cropped, converted to another format, compressed or sharpened.",
    d: "A transformation is described by parameters such as width, height, fit, format and quality. It runs either when content is saved, at build time, or on first request through an image service, and results are cached by a key formed from the original and parameters. Templates request the sizes they need. It is hard because the number of combinations grows quickly, on-demand transformation needs protection against abuse, and image processing is memory and processor intensive.",
    k: ["Pre-generated renditions vs on-demand transformation: pre-generation gives predictable delivery, while on-demand avoids producing sizes nobody requests and needs a cache and a safeguard.", "Named presets vs free parameters: presets limit combinations and cost, while free parameters give designers flexibility and open the service to abuse."],
    p: ["A public transformation endpoint accepting arbitrary sizes lets anyone request huge renditions and exhaust the processors.", "Changing a preset leaves stale renditions in the cache and old pages with the old look."],
    v: "Request an image in a defined preset and confirm dimensions, format and size; request a width above the allowed maximum and confirm it is refused; repeat the first request and confirm it is served from cache.",
    dep: ["media-storage", "image-optimization", "focal-point-and-crops"]
  },
  "focal-point-and-crops": {
    s: "Editor-chosen focus coordinates and named crops for an image so automatic cropping keeps the subject visible at any aspect ratio.",
    d: "The editor marks the subject's center or draws crops for named ratios. The values are stored with the asset. When the transformation service crops to a different ratio, it centers on the focal point instead of the image center. Art-directed crops can differ per breakpoint. It is hard because the same image appears in many shapes, from square thumbnails to wide banners, and an automatic crop that is fine in one is wrong in another.",
    k: ["Single focal point vs explicit crops per ratio: a focal point is quick to set and good enough for most uses, while explicit crops give control and are tedious to maintain.", "Automatic subject detection vs editor-set focus: detection saves effort, but misjudges what matters in editorial images."],
    p: ["A banner crop cuts off a face because the focal point was never set and defaults to the center.", "A replaced image keeps the old focal point, which now lands on empty space."],
    v: "Set a focal point on a portrait near the top, request a wide crop, and confirm the subject is in frame; replace the image and confirm the editor is prompted to review the point.",
    dep: ["image-transformations", "asset-metadata"]
  },
  "media-storage": {
    s: "The durable store for original uploads and generated renditions, addressed by key and served directly or through the delivery network.",
    d: "Originals are written once and kept, normally in object storage, under keys derived from identifiers. Renditions are stored beside them or in a cache bucket. Access can be public, signed or private. Backups and lifecycle rules control cost. It is hard because originals are the one irreplaceable data in the system, renditions need to be reproducible, and public addresses embedded in published pages cannot change without breaking them.",
    k: ["Immutable keys vs overwriting in place: immutable keys make caching easy and rollback safe, but require updating references when a file is replaced.", "Public bucket behind the delivery network vs signed private access: public is simple and fast, while signed access protects embargoed or restricted assets."],
    p: ["Originals deleted by a clean-up job that removes unreferenced files cannot be recovered, and a reference was missed.", "A restricted asset is stored in a public location and indexed by search engines."],
    v: "Upload an asset, delete it from the library, and confirm the original remains recoverable for the retention period; confirm a restricted asset's direct address is refused without a valid signature.",
    dep: ["object-storage"]
  },
  "media-usage-tracking": {
    s: "An index of which entries use which assets, kept up to date as content changes, so replacing or deleting an asset shows its effects first.",
    d: "On each save, the system scans the entry's fields and rich text for asset references and updates a reverse index from asset to entries. The library shows usage and warns before deletion. The same index drives rebuild scoping when an asset changes. It is hard because references hide in rich text, blocks and custom fields, scanning must be correct for every field type, and the index can drift if saves bypass the scanner.",
    k: ["Maintaining the index on write vs computing usage on demand: write-time upkeep gives instant answers, while on-demand scans are always right and slow on large sites.", "Counting references in drafts vs only published pages: including drafts prevents deletion of assets about to go live, but overstates live usage."],
    p: ["Imports that write directly to the store skip the scanner, so the index says an image is unused when it is not.", "Usage counts include old revisions and nothing can ever be deleted."],
    v: "Add an image inside a rich-text block, then confirm the library lists the page as a user of the asset; remove the image and confirm the usage disappears after save.",
    dep: ["media-library", "relations-and-references", "dependency-tracking"]
  },
  "templating-engine": {
    s: "The component that combines templates with data to produce HTML, supporting variables, conditions, loops, includes and expressions in a restricted language.",
    d: "A template is text with placeholders and control structures. The engine parses it into a tree or compiled function, then evaluates it against a data context, escaping output by default. Includes, inheritance and macros allow reuse. Many engines can run in the build, in the preview server and sometimes at the edge. It is hard because templates grow into programs, escaping mistakes cause injection, error messages must point to the template line, and the language must be powerful enough without becoming a second application language.",
    k: ["Logic-light templates vs full-language templates: light templates keep presentation separate from logic and push work to data preparation, while full languages are flexible and become hard to reason about.", "Compile templates once vs interpret each time: compiling is much faster on large sites, but complicates dev reload and error reporting."],
    p: ["Output not escaped by default lets a content field containing markup inject script into every page that renders it.", "A missing variable renders as an empty string, hiding a data bug until a visitor notices."],
    v: "Render a page whose title contains angle brackets and quotes, and confirm they appear escaped in the HTML; reference a missing variable and confirm the build reports the template and line.",
    dep: ["build-time-data-loading", "layouts-and-inheritance"]
  },
  "layouts-and-inheritance": {
    s: "Page-level templates that wrap content in shared structure, with the ability to extend a base layout and override named regions.",
    d: "A layout supplies the document shell: head, header, footer and the slot for page content. A page names its layout in its data or by convention from its folder. Layouts can extend others, replacing blocks such as title or sidebar. The engine passes the page's rendered body into the layout. It is hard because deep inheritance chains are hard to follow, data a layout needs must come from somewhere reliable, and a change to a base layout touches every page.",
    k: ["Inheritance with overridable blocks vs composition of components: inheritance is quick for variations of one shell, while composition is more explicit and avoids brittle chains.", "Layout chosen by folder convention vs declared per entry: convention needs no configuration, while declaration is visible in the content and easier to change."],
    p: ["Editing the base layout silently changes pages that overrode a block with a name that no longer exists.", "A layout chain three levels deep leaves nobody sure which file produces a given tag."],
    v: "Change a block in the base layout and rebuild; confirm the diff shows the expected change in every page using it and no change in a page that overrides that block.",
    dep: ["templating-engine", "partials"]
  },
  "partials": {
    s: "Reusable template fragments such as navigation, cards or breadcrumbs, included wherever needed and passed the data they should render.",
    d: "A partial is a small template file invoked by name with explicit parameters or the current context. It can include other partials. Engines resolve names through search paths so a theme or site can override a partial. Rendering a partial thousands of times on a large listing page adds up, so some engines cache compiled partials or their output. It is hard because implicit context makes partials depend on variables they do not declare, and caching output requires knowing every input.",
    k: ["Explicit parameters vs inherited context: parameters make each partial self-describing, while inherited context is shorter and creates hidden coupling.", "Caching rendered partial output vs rendering each time: caching saves time in repeated cards, but must key on every input or it serves stale markup."],
    p: ["A partial reads a variable that only one layout defines and renders blank on all others.", "Cached partial output ignores the locale, so a page shows navigation in another language."],
    v: "Render the same partial with two different inputs on one page and confirm each output reflects its own input; override the partial in a site folder and confirm the override is used.",
    dep: ["templating-engine"]
  },
  "components": {
    s: "Self-contained units of markup, style and optionally behavior, with declared inputs, that templates use as named tags, including one per block type.",
    d: "A component receives typed properties and slots and returns markup. Components can nest and can carry scoped styles that the asset pipeline collects. Those with behavior are marked as interactive and hydrated in the browser. A block renderer maps each stored block type to its component. It is hard because the component library is the design system in code, interfaces must stay stable as content depends on them, and static components must be separated clearly from interactive ones.",
    k: ["Components with declared property types vs untyped partials: types catch wrong data during the build, but demand more setup and discipline.", "Styles scoped to the component vs global styles: scoping prevents leakage and allows removing unused CSS, while global styles are simpler for site-wide rules."],
    p: ["A component's property is renamed and pages using the old name render with defaults instead of failing.", "A component marked static is given behavior later and ships with no scripts, so buttons do nothing."],
    v: "Render each component with missing and wrong-typed properties and confirm the build reports a clear error; render each block type from sample content and confirm the output matches the design reference.",
    dep: ["templating-engine", "block-schemas", "partial-hydration-and-islands"]
  },
  "shortcodes": {
    s: "Named snippets embedded inside body text, such as a video embed or callout, that expand into richer markup when the page is rendered.",
    d: "An author writes a short marker with arguments in the body. The markdown pipeline or template engine recognizes it and calls the matching function or component, passing the arguments and any enclosed text. They let authors use rich elements in plain text and keep markup out of content. It is hard because the syntax is a private language embedded in content, which editors and previews must understand, and moving to another generator means rewriting every use.",
    k: ["Shortcodes in text vs structured blocks: shortcodes suit file-based writing and are quick to add, while blocks are validated and editable in forms but need a block-based editor.", "Open argument lists vs declared parameters: open lists are easy to write, while declared parameters catch typos at build time."],
    p: ["A mistyped shortcode name is output as literal text in the published page.", "A shortcode that fetches data during rendering slows every build and fails offline."],
    v: "Write a body with a valid shortcode and a mistyped one; confirm the first renders its component and the second fails the build with the file and line.",
    dep: ["markdown-pipeline", "components"]
  },
  "filters-and-helpers": {
    s: "Small functions available inside templates for formatting dates, truncating text, building URLs, sorting lists and similar presentation tasks.",
    d: "Filters transform a value, such as formatting a date for a locale, and helpers compute something from arguments, such as the URL of another entry. They are registered with the engine and are pure functions of their inputs. Common ones cover dates, numbers, text, URLs, collections and image references. It is hard because helpers that look up data become hidden dependencies the dependency tracker cannot see, and locale handling of dates and numbers is easy to get subtly wrong.",
    k: ["Many specialized helpers vs doing the work in data preparation: helpers keep templates short, while preparing data earlier keeps templates trivial and logic testable.", "Pure helpers only vs helpers that read site data: pure ones are cacheable and predictable, while data-reading ones are convenient and hide dependencies."],
    p: ["A date helper uses the server's time zone, so a page's displayed date differs between a laptop and the build runner.", "A URL helper that looks up another entry does not register the dependency, so that page is not rebuilt when the target moves."],
    v: "Build on two machines with different time zones and confirm the dates in output are identical; move a linked entry and confirm pages linking to it are rebuilt.",
    dep: ["templating-engine", "dependency-tracking"]
  },
  "markdown-pipeline": {
    s: "The chain of steps that turns lightweight markup in content into HTML: parsing, transformation plugins, syntax highlighting, heading anchors and link rewriting.",
    d: "A parser converts the text to a syntax tree, then plugins rewrite it: resolving internal links, adding heading identifiers, processing embeds, highlighting code and rewriting image sources to processed versions. A second stage converts the tree to HTML, with a sanitizer where content is untrusted. The same tree can feed search indexing and excerpts. It is hard because plugin order matters, dialects differ between tools, and raw HTML in content is both a feature and a security risk.",
    k: ["Allowing raw HTML in content vs forbidding it: allowing it covers odd cases, but exposes the site to injected markup and breaks the separation of content and design.", "Rewriting on the syntax tree vs on the output string: tree rewriting is accurate and composable, while string rewriting is simple and fragile."],
    p: ["A plugin that rewrites links runs before the one that resolves references, so internal links go to unresolved targets.", "Code highlighting at build time adds seconds per page and makes large documentation sites slow."],
    v: "Render a document with a heading, internal reference, code block and image; confirm the heading has a stable anchor, the link resolves to the current URL, and the image points to its processed version.",
    dep: ["front-matter-files", "relations-and-references", "image-optimization"]
  },
  "themes": {
    s: "A packaged set of layouts, partials, components, styles and defaults that gives a site its look and can be installed, configured and overridden.",
    d: "A theme provides templates and assets under known names and exposes settings such as colors, fonts and menu positions. The site can override any file by placing its own copy in a higher-priority folder, and can configure the theme through data. Updates to the theme arrive as new versions. It is hard because an override copies a file and stops receiving fixes to it, themes assume a particular content model, and customization pressure turns every site into a fork.",
    k: ["Override by file replacement vs by named extension points: replacement can change anything, while extension points survive theme updates and limit what can be changed.", "Theme assumes a content model vs the site defining it: assuming gives instant results, while a site-defined model needs mapping code to every theme."],
    p: ["A site overrides a layout, the theme update changes its data contract, and the page breaks with nobody noticing until it ships.", "Theme settings and site data use the same names and one silently shadows the other."],
    v: "Install a theme, override one partial, upgrade the theme to a new version, and confirm the build reports which overrides now differ from their upstream originals.",
    dep: ["layouts-and-inheritance", "partials", "plugin-system"]
  },
  "plugin-system": {
    s: "The extension mechanism that lets third parties add content types, transforms, data sources, generated files and editor features without changing the core.",
    d: "A plugin registers functions with the generator or the CMS at defined points: new loaders, template helpers, markdown steps, post-build tasks, field types, admin panels. The host passes a context object and a limited API, and loads plugins in a declared order. Versions and compatibility ranges are checked. It is hard because plugins run with full privileges in the build, a plugin can break every site that updates it, and order and conflicts between plugins are rarely documented.",
    k: ["Rich host API vs a small stable one: rich APIs let plugins do more, while a small one keeps old plugins working across versions.", "Plugins in the same process vs sandboxed: same process is fast and simple, while sandboxing limits damage from a malicious or faulty plugin at the cost of speed and capability."],
    p: ["A plugin with access to the whole environment reads build secrets and sends them elsewhere.", "Two plugins rewriting the same output file produce a result depending on load order."],
    v: "Install a plugin that adds a generated file, confirm the file appears in the output, then remove the plugin and confirm the file and its references vanish; list the order plugins ran in the build log.",
    dep: ["build-hooks", "secrets-and-config"]
  },
  "build-hooks": {
    s: "Named points in the build and publishing lifecycle, such as before load, after render or on publish, where plugins and user code can run.",
    d: "The orchestrator emits events at each stage: configuration resolved, content loaded, page rendered, files written, build finished. Handlers may modify data, add pages, post-process HTML or trigger actions such as notifications. On the CMS side, hooks fire on save, publish and delete. It is hard because handlers can be slow or throw, ordering between them matters, and a hook that changes content during a build breaks the assumption that the same input yields the same output.",
    k: ["Synchronous hooks that can change data vs observe-only events: changing hooks are powerful, while observe-only events are safe and cannot fix anything.", "Failing the build on a hook error vs logging and continuing: failing protects correctness, while continuing keeps the site publishing at the risk of missing output."],
    p: ["A slow after-render hook runs for every page and doubles build time without showing up in any report.", "A hook that depends on build time produces different output between runs, breaking caching."],
    v: "Register hooks at each stage that write a timestamp, run a build, and confirm they fire in the documented order with the expected data; make one throw and confirm the build's stated behavior occurs.",
    dep: ["build-orchestrator"]
  },
  "file-based-routing": {
    s: "Deriving URLs from the layout of files and folders, so that creating a file at a path creates the page at the matching address.",
    d: "The generator scans the content or pages folder and maps each file to a route: index files become folder addresses, names become path segments, special names mark dynamic segments. Content files can inherit URL pieces from their folder. The result is a route table of path to source and layout. It is hard because the folder structure becomes public, renaming breaks links, case and trailing-slash rules vary by host, and collisions between files mapping to one path must be detected.",
    k: ["URL derived from file location vs URL declared in data: derivation needs no configuration, while declaration decouples URLs from how editors organize files.", "Trailing slash on every page vs none: slashes map neatly to folders on simple hosts, while no-slash URLs need rewrite rules on some."],
    p: ["Two files resolve to the same path and one is silently dropped from the output.", "A rename in the repository changes a URL that search engines and other sites link to."],
    v: "Create two files that map to the same path and confirm the build fails naming both; list the route table and confirm every page has exactly one source.",
    dep: ["front-matter-files", "permalinks"]
  },
  "permalinks": {
    s: "Rules that build each page's final URL from its data, such as section, date, slug or locale, so addresses are predictable and can be fixed permanently.",
    d: "A pattern such as section, year and slug is applied to each entry's fields, producing the path. Slugs are generated from titles, made unique and, once published, frozen. Overrides allow an explicit URL. Templates and references use a lookup from identifier to URL rather than building strings. It is hard because titles change after publication, but URLs should not, and because a pattern change would move thousands of pages and needs a matching redirect map.",
    k: ["Slug frozen at first publish vs following the title: frozen slugs protect links but drift away from the title, while following the title needs redirects for every edit.", "Date in the URL vs no date: dates add context for news and make updates look old, while undated URLs are shorter and age better."],
    p: ["Editing a headline changes the URL and every inbound link breaks.", "Two entries with the same title and date produce the same address."],
    v: "Publish an entry, change its title, rebuild, and confirm its URL is unchanged; create a second with an identical title and confirm a unique slug is assigned.",
    dep: ["content-types-and-schemas", "file-based-routing"]
  },
  "route-generation": {
    s: "Creating pages from data rather than files: one template and a list of records produce one page per record, such as per product, tag or locale.",
    d: "A route template declares a parameterized path and a function returning the list of parameter sets, usually by querying content. The generator calls it, then renders the template once per set with the matching data. It is the mechanism behind term pages, author pages and locale variants. It is hard because the number of pages is only known after data loads, large expansions multiply render time, and the parameter list must match the links elsewhere on the site.",
    k: ["Enumerating all pages at build vs rendering on demand: enumerating gives complete static output, while on-demand rendering handles huge or unknown sets and needs a server.", "One page per record vs combining into fewer pages: per-record pages are good for search and linking, while combined pages are cheaper to build and harder to find."],
    p: ["A query that returns far more records than expected generates tens of thousands of pages and a build that times out.", "A link to a generated page uses a different parameter format than the route and returns not found."],
    v: "Add one record to a source list, rebuild, and confirm exactly one new page appears at the expected address and is linked from its index and included in the sitemap.",
    dep: ["build-time-queries", "permalinks", "templating-engine"]
  },
  "pagination": {
    s: "Splitting a long list into numbered pages with previous and next links, each a separate generated file with its own URL.",
    d: "The generator slices a collection into pages of a configured size and renders the listing template for each slice, supplying page number, total and neighbor links. Page one often lives at the base address. Pages may be generated for tags and archives too. It is hard because adding one item shifts every later page, changing what each URL contains, and because very long lists produce hundreds of low-value pages that search engines treat as duplicates.",
    k: ["Numbered pages vs load more in the browser: numbered pages are crawlable and shareable, while load more is smoother and needs script and an API or data file.", "Page size fixed vs adapted per section: a fixed size is predictable, while per-section sizes suit different content and complicate the code."],
    p: ["A new post shifts every item one page back, so cached and linked pages now show different items.", "Page two of a list is indexed with the same title and description as page one."],
    v: "Generate a list with 25 items at ten per page, and confirm three pages exist, each links correctly to its neighbors, and the first page has no previous link.",
    dep: ["content-collections", "route-generation"]
  },
  "build-time-data-loading": {
    s: "The step that gathers all data a page needs, from content files, APIs, global settings and computed values, into the context handed to its template.",
    d: "Before rendering, loaders read content sources and produce collections and global data. A cascade merges data from several levels, such as site defaults, folder values and per-entry fields, with later levels overriding earlier ones. Results are cached for the rest of the build. It is hard because merge rules surprise people, a loader failure must fail clearly, and every datum read must be traced so a change can be mapped to the pages it affects.",
    k: ["A cascade of data from several levels vs explicit data per page: a cascade avoids repetition, while explicit data is clearer about where each value came from.", "Loading everything up front vs on first use: up-front loading makes dependencies simple, while lazy loading saves time on partial builds and needs careful invalidation."],
    p: ["A value set at the folder level is silently overridden by a default in another file and nobody can find out why.", "A loader reads a file the dependency tracker does not know about, so changes to it never trigger a rebuild."],
    v: "Set the same key at three levels, build, and confirm the output shows the documented winner; then change a lower-level value and confirm exactly the dependent pages rebuild.",
    dep: ["content-loading", "front-matter-files", "headless-content-api", "dependency-tracking"]
  },
  "build-time-queries": {
    s: "Queries run during the build to select, filter, sort and join content, such as the three most recent posts in a section or all products in a category.",
    d: "Templates and route functions call a query interface over the loaded collections or the remote content API. Queries may be written as function chains, filter expressions or a typed query language. Results feed lists, navigation, related links and route generation. It is hard because the same query repeated across thousands of pages must be cached or precomputed, a query over a remote API must be batched, and results must be deterministic across builds.",
    k: ["Querying local loaded data vs querying the remote API per page: local queries are fast and consistent, while remote queries are simple and make builds slow and rate limited.", "Precomputing shared lists once vs computing per page: precomputing is much faster at scale, but needs explicit invalidation when content changes."],
    p: ["A navigation query runs once per page and makes a ten-thousand-page build take hours.", "A sort on a field with ties returns a different order between builds and produces noisy diffs."],
    v: "Build with a query used on every page and confirm it executes once, not once per page, in the build trace; run the build twice and confirm the output is byte-identical.",
    dep: ["build-time-data-loading", "content-collections", "query-api"]
  },
  "locale-routing": {
    s: "How each language gets its own URLs, such as a path prefix or domain, and how pages in different languages link to each other and are chosen for visitors.",
    d: "The route generator produces each page once per locale, with the locale in a prefix or host. Each page carries its set of alternates so templates can emit language links and alternate-language tags. The default language may omit its prefix. Visitor language detection, if used, redirects at the edge. It is hard because untranslated pages need a rule, redirects based on language headers interfere with caching and crawlers, and links inside content must stay in the same locale.",
    k: ["Path prefix per language vs separate domains: prefixes share one host and certificate, while domains give regional presence and need more hosting setup.", "Automatic redirect by language header vs a visible language choice: redirects save a click, but confuse crawlers and break shared links."],
    p: ["An automatic redirect sends search engine crawlers to one language, and the others are never indexed.", "An internal link in translated text points to the default language page."],
    v: "Build with three locales, then confirm each page exists per locale, links to its alternates in both directions, and that an internal link in a translated page stays in its locale.",
    dep: ["localized-fields", "route-generation", "permalinks"]
  },
});
