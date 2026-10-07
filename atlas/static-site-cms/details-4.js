// Details for the static site generator & CMS plate, part 4: build pipeline, asset processing, generated metadata.
ATLAS.details("static-site-cms", {
  "build-orchestrator": {
    s: "The driver of a build: it reads configuration, runs the stages in order, collects errors and writes the output folder, in full or incrementally.",
    d: "The orchestrator resolves configuration and plugins, loads content, builds the page list, schedules rendering, runs asset pipelines, writes files, and runs post-build tasks such as generating feeds and search indexes. It records timings and a manifest of what it wrote. Output is written to a fresh folder, so a failed build never leaves a half-updated site. It is hard because stages depend on each other, failures must be attributed to a source file, and the same code must serve one-off builds, watch mode and previews.",
    k: ["Write to a fresh output folder vs update in place: a fresh folder gives atomic results and easy rollback, while in-place updates are faster and risk a half-built site.", "Stop at the first error vs collect all errors: stopping is quick, while collecting shows an editor every problem in one run."],
    p: ["A build that fails halfway leaves a partially written output folder that gets deployed.", "A warning in the log is ignored for months and becomes a failure when a dependency updates."],
    v: "Force an error in the last stage and confirm the build exits with a non-zero code, the previous output is untouched, and the report names the failing file; then fix it and confirm a clean build writes a manifest.",
    dep: ["content-loading", "render-stage", "build-hooks", "secrets-and-config"]
  },
  "content-loading": {
    s: "Reading every content source, parsing and validating entries, and building the in-memory data set the rest of the build uses.",
    d: "Loaders walk files or call APIs, parse front matter and body, apply schemas and defaults, resolve references and attach computed fields such as reading time and excerpts. Results are normalized to one entry shape regardless of origin. Parsing can run in parallel and reuse a cache keyed by file content. It is hard because it is the first stage and its cost is paid on every build, errors must carry file and field, and loading must produce the same data in the same order every time.",
    k: ["Validating while loading vs in a separate pass: validating while loading fails early with context, while a separate pass can report all problems at once.", "Caching parsed entries by content hash vs by modification time: hashes are reliable across clones and builds, while modification times are cheaper and change on every fresh checkout."],
    p: ["Reading files in directory order differs between operating systems and changes list order in the output.", "A cache keyed by file name returns old data after a file is replaced with an older timestamp."],
    v: "Load a site of known size twice, confirm the second run parses only changed files, and confirm entry order is identical on two different operating systems.",
    dep: ["front-matter-files", "headless-content-api", "content-types-and-schemas", "build-cache"]
  },
  "render-stage": {
    s: "Turning each page's data and template into final HTML and writing it to the right path in the output folder.",
    d: "For each route, the stage gathers the page's data, evaluates the layout and template chain, runs post-processing such as link rewriting and HTML minification, and writes the result. Pages are independent, so they can run in parallel, and a page's output can be cached by its inputs. Errors in a template are reported with page and line. It is hard because rendering time is dominated by a few expensive templates, memory grows with page count, and one page's failure should not hide others.",
    k: ["Rendering all pages in one pass vs streaming each to disk: one pass is simple, while streaming keeps memory flat for very large sites.", "Post-processing every page's HTML vs trusting templates: post-processing enforces rules everywhere, but adds time per page and can change valid markup."],
    p: ["A page that renders a huge list grows slowly with content and dominates total build time.", "Post-processing rewrites links in code samples that were meant to show literal text."],
    v: "Render a site and confirm the file count equals the route count, each file is valid HTML with the expected title, and build time per page is reported with the slowest pages listed.",
    dep: ["templating-engine", "file-based-routing", "route-generation", "build-time-data-loading"]
  },
  "incremental-builds": {
    s: "Rebuilding only the pages and assets affected by a change, reusing earlier output for the rest, so a small edit builds in seconds.",
    d: "The system compares the current inputs to the previous build's recorded inputs, finds what changed, uses the dependency graph to find affected outputs, and re-renders only those. Unchanged outputs are kept from the cache. A full build is the fallback and the check. It is hard because correctness depends on the dependency graph being complete: one missed dependency leaves a stale page that looks valid, and no test of the pipeline's logic will reveal it.",
    k: ["Incremental by default vs full builds for releases: incremental is fast for editors, while full builds are slower and certain, so releases often use them.", "Fine-grained field-level tracking vs per-file tracking: field-level tracking rebuilds fewer pages and costs more bookkeeping, while per-file is simple and rebuilds more."],
    p: ["A page reads data through a helper that does not record the dependency, and it stays stale after the data changes.", "The cache is trusted across a generator upgrade and old pages persist with outdated markup."],
    v: "Change one entry, run an incremental build, and compare its output byte for byte with a full build from the same inputs; the two must be identical and only the expected pages must differ from before.",
    dep: ["dependency-tracking", "build-cache", "content-loading"]
  },
  "dependency-tracking": {
    s: "A graph recording which sources, data, templates and assets each output depends on, so a change can be traced to exactly the outputs it affects.",
    d: "During rendering, every read of an entry, global value, template, partial, helper or asset registers an edge from the output to that input. After the build the graph is saved. When an input changes, the graph gives the affected outputs. Collection-level reads, such as a listing, depend on membership and order, not just single entries. It is hard because reads happen through many paths, dynamic includes and computed lookups can bypass registration, and over-recording degenerates into rebuilding everything.",
    k: ["Automatic recording of reads vs declared dependencies: automatic recording is complete as long as every access goes through the tracked API, while declared ones are explicit and easy to forget.", "Coarse dependency on a whole collection vs on individual entries: coarse is simple and over-invalidates, while per-entry is precise and heavier to maintain."],
    p: ["Direct file reads in a template bypass the tracked loader, so the page never rebuilds when that file changes.", "Every page depends on the global settings, so any settings edit rebuilds the entire site."],
    v: "Change a partial, an entry referenced by one page, and a global value in turn, and confirm each triggers exactly the pages the graph predicts, comparing the rebuilt set to a count from an instrumented render.",
    dep: ["build-time-data-loading", "templating-engine"]
  },
  "build-cache": {
    s: "Stored intermediate results from earlier builds, such as parsed content, processed images and compiled templates, keyed by their inputs so they can be reused.",
    d: "Expensive work writes its result under a key formed from a hash of its inputs and the version of the tool. Later builds look up the key first. The cache lives on disk, is restored on build runners from shared storage, and is pruned by age or size. It is hard because stale cache entries produce plausible but wrong output, the key must cover every input including configuration, and shared caches across branches can leak unreleased content.",
    k: ["Content-hash keys vs timestamp keys: hashes are correct across machines but cost time to compute, while timestamps are cheap and fail on fresh checkouts.", "Shared cache across branches vs per branch: sharing is faster and risks unreleased data leaking into other builds, while per-branch caches are isolated and start cold."],
    p: ["The key omits a configuration value, so changing it leaves old cached output in use.", "A cache restored from an older tool version feeds incompatible data to the new one."],
    v: "Build twice and confirm the second is faster with cache hits listed; change one input option and confirm the affected cache entries miss; clear the cache and confirm output is byte-identical.",
    dep: ["object-storage", "build-runners"]
  },
  "parallel-rendering": {
    s: "Splitting the page list across workers so that many pages are rendered at once, using all processor cores or several build machines.",
    d: "The orchestrator divides routes into batches and sends each to a worker, which holds a copy of the data set and renders its pages. Results are written independently. Shared data is sent once and kept read-only. Some systems distribute across machines for the largest sites. It is hard because startup and data transfer can cost more than the saved rendering time, output must stay deterministic, and templates with side effects or shared mutable state behave differently in parallel.",
    k: ["Threads in one process vs separate worker processes: threads share data cheaply, while processes isolate failures and memory at the cost of copying data.", "Even batches vs work stealing: even batches are simple, while work stealing balances pages of very different cost."],
    p: ["A template with a global counter produces different output depending on which worker rendered which page.", "Each worker loads the full data set, and the machine runs out of memory on large sites."],
    v: "Render with one worker and with eight and confirm outputs are byte-identical and the timing report shows the expected speedup without any worker idle at the end.",
    dep: ["render-stage", "build-runners"]
  },
  "dev-server-and-hot-reload": {
    s: "A local server that rebuilds changed content on save and refreshes the browser, so authors and developers see edits within a second or two.",
    d: "A file watcher detects changes, the incremental build updates affected pages in memory rather than writing to disk, and a connection to the browser tells it to reload or swap styles. Drafts and future-dated entries are usually shown. The server serves the same routes and redirect rules as production where it can. It is hard because it must not behave differently from the real build, memory use grows during long sessions, and watchers miss changes on some file systems.",
    k: ["Serving from memory vs writing files: memory is fast and leaves nothing behind, while files make behavior closer to production and are slower.", "Showing drafts by default vs only in a flag: showing drafts is convenient, but makes it easy to forget what is not yet public."],
    p: ["The dev server shows drafts and a bug appears only in production where they are hidden.", "A watcher on a network drive misses changes and the author keeps looking at stale output."],
    v: "Edit a template and an entry while the server runs and confirm the browser shows each change within two seconds; compare the served HTML with a production build for the same page.",
    dep: ["incremental-builds", "build-orchestrator", "file-based-routing"]
  },
  "asset-bundling": {
    s: "Combining and splitting scripts and styles into files for the browser, resolving imports and sharing common code between pages.",
    d: "The bundler starts from entry points declared by templates or components, follows imports to build a graph of modules, removes unused code, and writes bundles. Shared modules go into common chunks so visiting a second page reuses the cache. The result is recorded in a manifest that templates use to emit the right tags. It is hard because too few bundles load unneeded code, too many make many small requests, and what a page needs is only known after components are rendered.",
    k: ["One bundle per page vs shared chunks: per-page bundles are simple and repeat code, while shared chunks improve caching and add loading steps.", "Bundling at build vs loading modules natively in the browser: bundling reduces requests and enables optimization, while native loading avoids the step and sends more files."],
    p: ["A large library imported for one function lands in every page's bundle.", "The manifest is read before the bundler finishes and templates emit tags for files that do not exist."],
    v: "Build and list the bundles by size and the pages that load each; confirm every script tag in the HTML points to an existing file and a page without interactivity loads no script.",
    dep: ["components", "minification", "fingerprinting"]
  },
  "minification": {
    s: "Reducing the size of HTML, CSS and scripts by removing whitespace and comments and shortening names, without changing behavior.",
    d: "After bundling, each text asset is passed through a minifier. For scripts it renames local variables and simplifies expressions; for styles it merges rules and shortens values; for HTML it collapses whitespace and removes optional tags. Source maps connect minified output to the originals for debugging. It is hard because aggressive options can change meaning, for example in whitespace-sensitive text, and because bugs surface only in production output that nobody tests in a browser.",
    k: ["Aggressive minification vs safe minification: aggressive saves a little more, while safe options avoid rare broken pages.", "Shipping source maps publicly vs keeping them private: public maps make debugging easy and reveal source, while private maps keep source hidden and complicate error reports."],
    p: ["Collapsing whitespace changes the rendering of preformatted code blocks and inline spacing.", "A minifier updated by a routine dependency bump alters output and breaks one script that depended on a function name."],
    v: "Compare minified and unminified output in a real browser using the scripted visual and behavior tests for several pages, and confirm identical rendering and interaction with a smaller transfer size.",
    dep: ["asset-bundling"]
  },
  "fingerprinting": {
    s: "Adding a hash of a file's content to its name so the file can be cached forever and any change produces a new address.",
    d: "After processing, each asset is hashed and written as a name containing the hash. A manifest maps original names to hashed ones, and templates and stylesheets are rewritten to use them. The host sends long-lived cache headers for these files and short ones for HTML. It is hard because references between assets form a chain: a stylesheet that references an image changes when the image's hash does, so the order of hashing matters.",
    k: ["Hash in the file name vs a version query string: names work with every cache and allow old files to coexist, while query strings are simple and ignored by some caches.", "Keeping old hashed files after a deploy vs deleting them: keeping them protects visitors on old pages, while deleting saves storage and breaks open sessions."],
    p: ["Deleting the previous deploy's assets breaks pages still open in browsers, which request the old hashes.", "An asset referenced by an unfingerprinted file is cached forever while its name stays the same."],
    v: "Change one stylesheet, rebuild, and confirm only that file and the pages referencing it have new names while all other hashed files keep their previous names.",
    dep: ["asset-bundling", "response-headers"]
  },
  "css-processing": {
    s: "Compiling and transforming stylesheets: resolving imports, adding vendor prefixes, flattening nesting, and removing rules no page uses.",
    d: "Source styles pass through a chain of transforms: imports are inlined, variables and nesting are resolved, prefixes added for target browsers, and unused selectors removed by scanning the generated HTML and components. Critical styles for the top of the page may be inlined into the head. It is hard because removing unused rules is based on guesses about class names, so classes built from variables or added by script are deleted by mistake.",
    k: ["Removing unused rules automatically vs shipping everything: removal cuts size sharply, while shipping everything is safe and larger.", "Inlining critical styles vs a single linked stylesheet: inlining speeds the first paint, while a linked file is cached across pages and simpler."],
    p: ["A class name assembled in script is not found by the scanner and its styles are removed.", "Inlined critical styles drift from the full stylesheet and the page jumps when it loads."],
    v: "Build and load pages with the scripted browser, then compare screenshots with and without unused-rule removal and confirm no visual difference, including states opened by interaction.",
    dep: ["asset-bundling", "components"]
  },
  "image-optimization": {
    s: "Reducing the weight of images in the output by resizing, converting to efficient formats and compressing, as part of the build.",
    d: "Templates reference images through an image helper that requests specific widths and formats. The build processes originals into those outputs, caches them by content and settings, and writes them with fingerprinted names. Modern formats are produced alongside a widely supported fallback. It is hard because processing is the slowest build step on image-heavy sites, quality settings are subjective, and a page that references an image directly bypasses the pipeline.",
    k: ["Processing at build vs on a delivery service: build processing needs no runtime service but is slow and cached, while a service processes on request and adds a dependency.", "Aggressive compression vs visual fidelity: smaller files load faster, while artifacts show on photographs and fine text."],
    p: ["A raw originals folder is referenced directly in markup and ships multi-megabyte photographs.", "Each build reprocesses every image because cache keys include a timestamp."],
    v: "Build and list every image delivered with its dimensions and size; confirm none exceed the page's display width times the density cap, and that a second build processes zero images.",
    dep: ["image-transformations", "build-cache", "fingerprinting"]
  },
  "responsive-images": {
    s: "Markup and renditions that let each browser choose an image size and format fit for its screen, instead of one large file for everyone.",
    d: "The helper emits an image element with a set of candidate files and descriptions of their widths, plus a sizes statement telling the browser how wide the image will be in the layout. For art direction it emits alternative sources per media condition. Width and height attributes reserve space. It is hard because the sizes statement must match the real layout in the stylesheet, which lives elsewhere, and a wrong one makes browsers download an image far larger than needed.",
    k: ["Many widths vs a few: many widths fit every device closely and multiply the images to process and cache, while a few are cheap and waste some bytes.", "Automatic sizes from layout rules vs written by hand: automatic is consistent but needs layout knowledge, while hand-written values drift out of date."],
    p: ["The sizes statement says full width but the image is displayed at a third of the screen, so a large file is fetched.", "Missing width and height attributes cause the page layout to jump as images load."],
    v: "Load a page at three viewport widths and densities in a browser, record which file is fetched in each, and confirm each is no more than about one and a half times the displayed size.",
    dep: ["image-optimization", "components"]
  },
  "font-handling": {
    s: "Preparing and delivering web fonts: subsetting to needed characters, using efficient formats, self-hosting, and controlling how text shows while fonts load.",
    d: "Font files are copied or generated at build, optionally subset by script or by the characters the site uses, converted to a compressed format and fingerprinted. The stylesheet declares them with a display strategy and the head preloads the critical ones. It is hard because languages with large character sets make subsetting complex, fonts delay or shift text, and loading from a third-party host adds a request and a privacy concern.",
    k: ["Self-hosting fonts vs a third-party font service: self-hosting avoids another connection and sharing visitor data, while a service handles formats and updates for you.", "Subsetting by site content vs by language range: content-based subsets are smallest but break when text changes, while range-based subsets are safe and larger."],
    p: ["A subset built from current text lacks a character used in a new post, which renders in a fallback font.", "Text is invisible until the font loads when a display strategy is not set."],
    v: "Throttle the network in a browser, load a page, and confirm text is visible immediately in a fallback and swaps once without layout shift; check each character used in the content renders in the web font.",
    dep: ["asset-bundling", "fingerprinting"]
  },
  "sitemaps": {
    s: "A generated file listing every public URL, with last-modified dates and alternate-language links, so search engines can discover and refresh pages.",
    d: "After routes are known, the generator writes an index of URLs for pages that are public, canonical and not excluded, with the last change date taken from content, not the build time. Large sites split into several files with an index. Alternates are listed for each language. It is hard because the file must agree exactly with the pages, an incorrect modification date reduces trust, and excluded or redirected pages must not appear.",
    k: ["Last-modified from content vs build time: content dates tell crawlers what really changed, while build time marks everything as new on every build.", "One file vs a split set with an index: one file is simple, while splitting is required past the size limits and adds files to maintain."],
    p: ["Every page shows today's date as modified, so crawlers learn to ignore the field.", "Pages marked as not for indexing still appear in the sitemap and send mixed signals."],
    v: "Fetch the sitemap and confirm each listed URL returns success without redirect, no unpublished or excluded URL is present, and a page edited today has today's date while others keep older ones.",
    dep: ["route-generation", "content-collections", "seo-tags"]
  },
  "feeds": {
    s: "Machine-readable lists of recent entries, in standard syndication formats, generated from collections for readers, aggregators and other sites.",
    d: "A template or generator turns a sorted slice of a collection into a feed document with titles, links, dates, authors, summaries and optionally full content. Links and media must be absolute. Each section or taxonomy can have its own. Entries have stable identifiers independent of the URL. It is hard because content must be valid in the feed format, relative links in the body must be rewritten, and changing an entry's identifier makes readers show it as new.",
    k: ["Full content vs summary in the feed: full content serves readers who stay in their reader, while summaries bring visitors to the site.", "Identifiers from the entry's stable id vs from the URL: stable ids survive URL changes, while URL-based ids duplicate entries when the URL changes."],
    p: ["Relative image links in the body break in feed readers that show them outside the site.", "A slug change gives the entry a new identifier and every subscriber sees it again as new."],
    v: "Validate the feed with a standard validator, load it in a reader, and confirm links and images work; rename an entry's slug and confirm the identifier stays the same.",
    dep: ["content-collections", "permalinks", "markdown-pipeline"]
  },
  "seo-tags": {
    s: "Page metadata for search engines and link previews, such as title, description, canonical URL, language alternates and robots directives, generated from content fields with defaults.",
    d: "A head template builds the tags from the entry's fields, falling back to site defaults and templates for titles. It emits a canonical link, alternate-language links, and robots directives for pages that should not be indexed. Values are escaped and length-checked. It is hard because defaults produce duplicate titles at scale, canonical addresses must match the real URL and redirects, and a setting meant for staging can leak into production.",
    k: ["Editor-supplied vs templated titles and descriptions: editor-supplied text is better, while templated is consistent and often generic.", "Environment-based indexing rules vs per-page flags: environment rules protect staging sites with one switch, while per-page flags are fine-grained and easy to leave wrong."],
    p: ["A staging block on indexing is copied into the production configuration and the site disappears from search.", "A canonical link points to a different host or a URL without its trailing slash, splitting ranking."],
    v: "Crawl the built site and confirm every page has one title, a description within the length range, a self-referencing canonical that returns success, and no page unintentionally marked as noindex.",
    dep: ["content-types-and-schemas", "permalinks", "locale-routing"]
  },
  "social-cards": {
    s: "The metadata and generated preview images that determine how a page looks when its link is shared on social platforms and messaging apps.",
    d: "Templates emit tags for title, description, type and image, using the entry's fields. The preview image can be a chosen asset or generated at build from a template that places title text over a background, rendered through a headless browser or an image library. Sizes follow platform guidelines. It is hard because generation costs time per page, text must wrap and fit in every language, and platforms cache previews so errors persist after they are fixed.",
    k: ["Generated images from a template vs editor-chosen images: generated images exist for every page and look uniform, while chosen images are more relevant and often missing.", "Rendering at build vs on demand: build time keeps hosting static and slows builds, while on demand needs a function and a cache."],
    p: ["A long headline overflows the generated image and is cut off mid-word.", "Platforms keep the first preview they fetched, so a fix to the card is invisible for days."],
    v: "Generate cards for the shortest and longest titles and a right-to-left language, and confirm all text fits, then fetch each page's tags and confirm the image address returns an image of the required size.",
    dep: ["seo-tags", "image-transformations", "asset-metadata"]
  },
  "structured-data-markup": {
    s: "Machine-readable descriptions of page content, such as article, product, event or breadcrumb, embedded in the page so search engines can show richer results.",
    d: "A template builds a data object from the entry's fields, using the vocabulary that matches its type, and embeds it as a script block of structured text. Breadcrumbs derive from the route hierarchy, and organization data comes from global settings. Validation checks required properties. It is hard because the markup must match what is visible on the page, missing fields produce invalid data, and rules from search engines change over time.",
    k: ["Generated from content fields vs written by editors: generation is consistent and follows the model, while hand-written markup is flexible and drifts from the page.", "Strict emission only when all required fields exist vs always emitting: strict emission avoids invalid data, while always emitting leaves gaps that validators flag."],
    p: ["A price in the markup differs from the visible price because they come from different fields.", "Markup is emitted with an empty required property and the page loses its rich result."],
    v: "Run the structured data of a sample of each content type through a validator and confirm zero errors; compare each value with the visible text on the page.",
    dep: ["content-types-and-schemas", "seo-tags", "templating-engine"]
  },
  "search-index-build": {
    s: "A generated file of searchable content, built from the pages, that the browser downloads so it can answer queries without a server.",
    d: "After rendering, a post-build step extracts text, title, headings and URLs from each page, tokenizes and normalizes them, and writes an inverted index, often split into chunks so only needed parts load. A small script loads the chunks and ranks results. Fields may be weighted. It is hard because the index grows with the site, language analysis differs per locale, and the index must exclude unpublished and noindex pages and update with every build.",
    k: ["One index file vs sharded chunks: one file is simple and heavy for large sites, while sharding loads only what a query needs and adds requests and complexity.", "Indexing full text vs titles and headings: full text finds more and makes the index large, while headings keep it small and miss details."],
    p: ["Navigation and footer text is indexed on every page, so common words match everything.", "A page unpublished since the last build remains searchable because the old index was not replaced."],
    v: "Search for a phrase from a new page and confirm it appears after a rebuild; search for text from an unpublished page and confirm it returns nothing; check the downloaded index size against the budget.",
    dep: ["render-stage", "content-collections", "client-side-search"]
  },
  "robots-and-manifest": {
    s: "Small generated files with fixed names that tell crawlers what to avoid and tell browsers how to treat the site, such as robots rules, site verification, manifest and humans files.",
    d: "These are written at the site root from configuration and environment: the robots file lists allowed and disallowed paths and the sitemap location, and differs between production and staging. A web app manifest names the site and icons. Verification files prove ownership to services. It is hard because they are rarely looked at, mistakes are costly, and the staging and production variants must never be swapped.",
    k: ["Generated per environment vs one static file: generation keeps staging closed and production open from one source, while a static file is simple and eventually deployed to the wrong place.", "Disallowing paths in the robots file vs protecting them with access control: the file only asks crawlers to avoid them and itself lists the paths, while access control actually blocks them."],
    p: ["The staging file that disallows everything is deployed to production and removes the site from search.", "A path listed to hide it from crawlers is read by everyone and announces where private pages are."],
    v: "Fetch the root files from staging and production after a deploy and confirm the staging one disallows all, the production one allows public pages and lists the sitemap, and the manifest icons all return images.",
    dep: ["secrets-and-config", "sitemaps"]
  },
});
