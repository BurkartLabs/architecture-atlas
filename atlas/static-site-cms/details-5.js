// Details for the static site generator & CMS plate, part 5: checks, previews and triggers, deployment.
ATLAS.details("static-site-cms", {
  "content-validation": {
    s: "Checking every entry against its schema and extra editorial rules, such as required fields, length limits, valid references and unique slugs, before it can be published.",
    d: "Validation runs on save in the editor, on publish, and again during the build over all entries. It applies the schema's constraints, then project rules such as maximum title length, required alt text, no empty blocks and no references to unpublished entries. Results list entry, field and message. It is hard because the build-time check must not be weaker than the editor's, rules must be fast across tens of thousands of entries, and new rules fail old content that nobody is assigned to fix.",
    k: ["Blocking on errors vs warning: blocking guarantees the rule, while warnings keep publishing moving and let problems pile up.", "Same rules in editor and build vs separate sets: sharing keeps behavior consistent, while separate sets let the build be stricter and surprise editors."],
    p: ["A new rule fails two thousand old entries and blocks every publish until someone clears them.", "Validation runs only in the editor, so content imported by script reaches the site unchecked."],
    v: "Import an entry with an empty required field and a reference to an unpublished entry, run the build, and confirm both are reported with entry and field and that the build refuses to publish.",
    dep: ["content-types-and-schemas", "relations-and-references", "content-loading"]
  },
  "broken-link-checks": {
    s: "A post-build crawl of the generated output that verifies internal links, anchors and optionally external links all resolve, and fails or reports on those that do not.",
    d: "The checker reads the output files, extracts links from each page, and resolves them against the set of generated paths, anchors, and redirect rules. External links are fetched with limits, caching and retries. Results list the source page and target. It is hard because external sites fail intermittently, rate limit checkers and change over time, so external checks are noisy, while internal checks are exact and should always block.",
    k: ["Blocking on internal failures only vs on all: internal failures are certain and cheap to block on, while external ones would make builds fail for reasons outside the team's control.", "Checking in each build vs on a schedule: each build gives fast feedback on internal links, while a scheduled run suits slow external checks and finds link rot between deploys."],
    p: ["An external check that runs in every build fails randomly and trains people to ignore failures.", "Links created in script or injected after load are invisible to a checker that reads static files."],
    v: "Delete a page linked from three others, build, and confirm the report lists all three sources and the missing target and that the build fails; confirm a redirect target counts as resolving.",
    dep: ["render-stage", "redirects", "file-based-routing"]
  },
  "html-and-accessibility-checks": {
    s: "Automated tests of the generated pages for valid markup and common accessibility failures such as missing labels, poor contrast, absent landmarks and heading order.",
    d: "A tool loads representative built pages in a headless browser or parses their HTML, applies rule sets, and reports violations with element and rule. Checks cover markup validity, text alternatives, form labels, color contrast, focus order basics and language attributes. Results block a build or open work. It is hard because automated rules catch only part of the real problems, pages differ by content so samples miss cases, and rules produce false positives that teams stop reading.",
    k: ["Checking every page vs a representative sample: every page catches content-specific problems, while a sample is faster and misses unusual entries.", "Blocking on any violation vs on new violations only: blocking on any is strict and stalls adoption on a site with debt, while a baseline lets teams improve gradually."],
    p: ["The check passes because it tests templates with sample content, while real entries lack alt text or use skipped heading levels.", "Contrast is checked in the default theme and fails in the dark one."],
    v: "Publish a page with an unlabeled input, a low-contrast link and a skipped heading level, run the checks, and confirm each violation is reported with the page and element.",
    dep: ["render-stage", "asset-metadata", "components"]
  },
  "performance-budgets": {
    s: "Declared limits on page weight, script size, image bytes and load timings, checked after each build so growth is caught before it reaches visitors.",
    d: "A budget file lists limits by page type, such as total transfer size or script size. After the build, a check measures the output files and, for timing budgets, loads pages in a controlled browser with throttled network. Exceeding a limit fails the build or comments on the change. It is hard because lab measurements differ from real visitors, limits need regular review, and one editor adding a large image to a page can break a budget the developers met.",
    k: ["Static size budgets vs timed lab measurements: size is exact and repeatable, while timing shows real experience and varies between runs.", "Failing the build vs reporting: failing keeps limits real, while reporting is less disruptive and is ignored."],
    p: ["A budget measured only on the home page lets article pages with large embedded galleries grow unchecked.", "Timing checks on a shared runner are noisy and fail randomly."],
    v: "Add an oversized image to one article, run the build, and confirm the budget check names the page and the amount over the limit and fails; remove the image and confirm it passes.",
    dep: ["render-stage", "asset-bundling", "image-optimization"]
  },
  "visual-regression": {
    s: "Comparing screenshots of built pages against approved baselines to catch unintended changes in layout, spacing and styling.",
    d: "A test run loads selected pages and components in a headless browser at chosen widths, takes screenshots, and compares them to stored baselines, flagging differences above a threshold. A reviewer accepts changes that were intended, updating the baseline. Content that changes, such as dates and rotating items, is masked or frozen. It is hard because small rendering differences across machines cause false failures, baselines need careful storage, and covering every layout and content combination is impossible.",
    k: ["Whole-page screenshots vs component-level: whole-page tests the real result and fails on any content change, while component tests are stable and miss integration.", "Strict pixel comparison vs tolerance: strict catches everything and fails on noise, while tolerance is stable and lets subtle changes through."],
    p: ["Fonts rendering slightly differently on the runner and a laptop produce failures on every run.", "Baselines are accepted in bulk without looking, so real regressions are approved."],
    v: "Change a spacing value in a shared layout, run the check, and confirm the affected pages are listed with a visible highlight of the difference, and that unrelated pages show no difference.",
    dep: ["render-stage", "build-runners"]
  },
  "style-and-spelling-lint": {
    s: "Automated checks on the text of entries for spelling, house style, banned phrases, reading level and consistency, run when editors save or when a build starts.",
    d: "Rules run on the extracted text: dictionaries with a site glossary, patterns for product names and prohibited terms, sentence length, and consistency in capitalization or dates. Results appear as suggestions in the editor and as a report in the build. Language-specific rules apply per locale. It is hard because false positives annoy editors, names and technical terms need a growing glossary, and rules for one language are meaningless in another.",
    k: ["Blocking vs advisory: blocking enforces rules for legal or brand terms, while advisory suggestions respect editors' judgment and are skipped under deadline.", "Central glossary vs rules in each project: a central glossary is consistent across sites, while local rules fit each product and diverge."],
    p: ["A spelling check applied to a translated entry using the source language's dictionary flags every word.", "Code samples and quoted text are checked as prose and flood the report."],
    v: "Save an entry with a misspelling, a banned term and a brand name in the wrong case, and confirm each is flagged in the editor with its location and that a code block in the same entry is skipped.",
    dep: ["content-loading", "localized-fields", "editing-ui"]
  },
  "draft-preview": {
    s: "Rendering an unpublished entry as it will look when live, through a private address, so editors can check it without publishing.",
    d: "The editor opens a preview address containing a signed, short-lived token. The preview server fetches the draft from the content API, renders it with the production templates and layout, and returns the page. Related content is drawn from drafts or published copies per rule. It is hard because the preview must use exactly the production code, draft content may reference other drafts, and a preview address that leaks gives anyone the unpublished page.",
    k: ["Preview rendered on demand by a server vs a full static preview build: on-demand is instant for one page and needs a live server, while a static build is faithful and slow.", "Token in the address vs login on the preview host: a token is easy to share with reviewers and can leak, while a login is safer and harder for outside reviewers."],
    p: ["A preview link sent in a chat is forwarded and the unreleased page is visible for weeks.", "The preview environment runs older template code than production and shows a layout that will not ship."],
    v: "Open the preview of a draft with a valid token and confirm it renders; use an expired or altered token and confirm refusal; confirm the public site returns not found for the same entry.",
    dep: ["headless-content-api", "templating-engine", "api-authentication", "drafts-and-states"]
  },
  "preview-deployments": {
    s: "A complete, separately addressed build of a branch or content change, created automatically so reviewers can inspect the whole site before it is merged or published.",
    d: "When a change request is opened, a trigger starts a build with that change, deploys the output to a unique address, and posts the link back to the request. The preview uses the real build pipeline and either draft or branch content. It is removed when the request closes. It is hard because it multiplies build cost, the address must be private or marked noindex, and external services such as forms and analytics must not be fed test data.",
    k: ["Full-site preview per change vs only changed pages: full sites are faithful and slow, while changed-page previews are fast and miss side effects such as navigation.", "Private access vs public unguessable addresses: private access prevents leaks and complicates sharing with reviewers outside the company."],
    p: ["A preview deployment indexed by search engines creates duplicates of the real site.", "Previews connect to the production form service and test submissions arrive as real leads."],
    v: "Open a change request, confirm a unique address is posted within the target time showing the change, confirm it carries a noindex signal and requires access, and confirm it disappears after the request closes.",
    dep: ["build-orchestrator", "static-hosting", "rebuild-triggers", "build-runners"]
  },
  "webhook-emitters": {
    s: "Notifications sent by the CMS or repository when content changes, telling build systems and other services what happened so they can react.",
    d: "On events such as publish, unpublish, delete or schema change, the system sends an HTTP request to each registered address with an event type, entry identifier and time, signed so the receiver can verify the sender. Failed deliveries retry with backoff and are logged. Receivers decide whether to rebuild. It is hard because delivery is at least once, so events arrive duplicated and out of order, and because a burst of edits can send hundreds of events for one logical change.",
    k: ["Small events with identifiers vs full content in the payload: identifiers are light and require a fetch, while full payloads are convenient and larger and can be stale on arrival.", "Signed requests vs a secret in the address: signatures prove the sender and allow rotation, while a secret in the address is simple and ends up in logs."],
    p: ["Events delivered twice trigger two builds, and out-of-order delivery makes an older state the final build.", "An unsigned endpoint accepts forged requests and anyone can trigger builds."],
    v: "Publish an entry, confirm one signed event is received with the correct identifier; break the receiver, confirm retries occur and then stop at the limit; send a forged request and confirm it is rejected.",
    dep: ["headless-content-api", "job-queue", "secrets-and-config"]
  },
  "rebuild-triggers": {
    s: "The rules that decide which events start a build, for which site and environment, such as publish, merge, schedule or manual request.",
    d: "A receiver accepts events from the CMS, repository or scheduler and maps each to a build job for a target environment. Rules may ignore drafts, filter by content type or branch, and pass parameters such as which pages changed. The job goes to a queue. It is hard because too many triggers waste cost on identical builds, too few leave the site stale, and a mapping mistake can deploy draft content to production.",
    k: ["Trigger on every change vs only on publish: every change keeps previews fresh and costs builds, while publish-only is cheap and shows no work in progress.", "Event carries what changed vs always full build: event details enable scoped rebuilds, while full builds ignore them and are always correct."],
    p: ["A draft save fires the production trigger and the build publishes unfinished work.", "A trigger with no filter runs a full build for each of fifty edits an editor makes in an hour."],
    v: "Save a draft, publish another entry, and merge a code change; confirm only the second and third start production builds, the first starts none, and each build record names the event that caused it.",
    dep: ["webhook-emitters", "build-queue", "build-orchestrator"]
  },
  "build-queue": {
    s: "A queue that orders, debounces and deduplicates build requests, so bursts of changes result in one build instead of many.",
    d: "Requests enter a queue per site and environment. A debounce window waits for quiet before starting; identical pending requests are merged; a running build is either allowed to finish with the next one queued, or canceled when a newer one arrives. Priorities let urgent publishes jump ahead. It is hard because debounce adds delay to every publish, canceling builds can leave nothing deployed during a long burst, and the queue must survive restarts without losing requests.",
    k: ["Cancel the running build for newer requests vs finish then run the next: canceling saves time and may never finish during constant edits, while finishing guarantees steady output.", "Long debounce window vs short: long windows merge bursts and delay urgent fixes, while short windows publish quickly and build more."],
    p: ["Editors working constantly keep resetting a long debounce, and nothing publishes for an hour.", "Requests held only in memory are lost when the service restarts, and the site misses an update."],
    v: "Send twenty change events within ten seconds, then confirm exactly one build starts after the window and includes all changes; send an urgent publish and confirm it is built ahead of pending low-priority work.",
    dep: ["job-queue", "build-runners"]
  },
  "impact-scoping": {
    s: "Working out from a content change which pages are affected, so triggers can request a partial build of only those pages.",
    d: "The trigger receives an entry identifier. A lookup against the saved dependency graph or reverse reference index returns the pages that used that entry, its terms, listings and global data. The scoped list is passed to an incremental build. If the change is to a schema or template, it widens to everything. It is hard because the graph can be stale or incomplete, correctness depends on having every dependency, and a conservative fallback to full builds must remain in place.",
    k: ["Scoped builds on every change vs full builds on every change: scoped builds are fast and risk stale pages if the graph is wrong, while full builds are slow and always right.", "Graph from the previous build vs computed from the content API: the saved graph is cheap and may lag, while computed impacts are fresh and cost queries."],
    p: ["A page listing the five latest posts is not included in the scope when a new post is published.", "The graph file was lost with the cache, so the scope is empty and nothing rebuilds."],
    v: "Publish one post and compare the scoped build's output with a full build of the same state; they must be identical, and the scope must have included index, tag, feed and sitemap pages.",
    dep: ["dependency-tracking", "media-usage-tracking", "incremental-builds", "rebuild-triggers"]
  },
  "scheduled-rebuilds": {
    s: "Builds started by a clock instead of a change, to publish scheduled entries, refresh external data and catch time-dependent output.",
    d: "A scheduler enqueues builds at fixed intervals or specific times, such as every hour or at a scheduled publish time. The build asks the content layer what is visible now, refreshes caches of external sources, and regenerates pages with time-based content such as upcoming events. It is hard because the interval sets how stale the site can get, frequent runs waste resources when nothing changed, and a build triggered from a missing or empty source must not publish a broken site.",
    k: ["Fixed interval vs timed to known publish moments: intervals are simple and late by up to an interval, while precise times need a list of upcoming events and a scheduler that updates.", "Skip the build when nothing changed vs always build: skipping saves cost and needs reliable change detection, while always building is simple and wasteful."],
    p: ["A scheduled build runs while an external source is down and publishes with its data missing.", "Schedules kept in a separate system drift from the content, and a scheduled publish never builds."],
    v: "Schedule an entry for the next scheduler tick and an external data refresh, then confirm the entry appears on the first build after its time and that the refresh log shows fetch times and results.",
    dep: ["scheduled-publishing", "external-data-sources", "build-queue"]
  },
  "deploy-artifact": {
    s: "The output folder packaged with its manifest and metadata as one immutable, versioned unit that can be uploaded, activated and restored.",
    d: "After a successful build, the output is verified against its manifest, optionally compressed, and uploaded as a set of files or an archive under a unique build identifier along with metadata such as source revision and time. Files already present by content hash are skipped to save upload. The artifact is never modified after upload. It is hard because large sites mean tens of thousands of files, partial uploads must not become visible, and the artifact must record exactly what was built from which inputs.",
    k: ["Whole archive upload vs file-level sync: archives are simple and atomic, while file-level sync uploads only changes and needs ordering and cleanup rules.", "Compressing at build vs letting the host or edge do it: pre-compressing saves work per request and doubles stored files, while edge compression is simpler and varies by host."],
    p: ["A deploy interrupted partway leaves new HTML pointing at assets that were never uploaded.", "Artifacts without a source revision cannot be matched to the content that produced them."],
    v: "Deploy, then compare the hash of every file in the host with the manifest and confirm all match; interrupt a deploy midway and confirm visitors still receive the previous complete version.",
    dep: ["build-orchestrator", "object-storage", "fingerprinting"]
  },
  "static-hosting": {
    s: "Servers or storage that deliver the generated files directly over HTTP, with no application code, at a fixed cost per amount of traffic.",
    d: "The host maps request paths to files, adds cache and content-type headers, serves compressed variants, returns a not-found page, and applies redirect and header rules from configuration. Storage is replicated, and each deploy is a separate immutable version. Some include branch addresses and edge functions. It is hard because hosts differ on trailing slashes, index files, case sensitivity and rule syntax, so a site that works locally can behave differently in production.",
    k: ["Dedicated static host vs object storage behind a delivery network: dedicated hosts include rules and previews, while object storage is cheap and flexible with more setup.", "Clean URLs without extensions vs files with extensions: clean URLs read better and rely on the host's resolution rules, while extensions work everywhere."],
    p: ["A path works locally with a trailing slash and returns not found in production, where the host expects a folder index.", "Mixed-case file names serve on a case-insensitive laptop and fail on the case-sensitive host."],
    v: "Request every URL in the sitemap on the live host and confirm each returns success with the expected content type and cache headers; request a made-up path and confirm the custom not-found page with a not-found status.",
    dep: ["deploy-artifact", "object-storage", "response-headers"]
  },
  "atomic-deploys-and-rollback": {
    s: "Switching all visitors to a new version in one step, and switching back to a previous one just as quickly if it turns out bad.",
    d: "Each deploy is uploaded as a separate version and is not served until activated. Activation updates a pointer from the live address to the new version, so every request sees either all old or all new files. Rollback moves the pointer back to a kept version. Old versions are retained for a period. It is hard because cached copies at the edge still hold old files for a time, dependent services such as forms may differ between versions, and rollback must include any data or configuration that changed.",
    k: ["Pointer switch between full versions vs overwriting files in place: pointer switches are atomic and cost storage, while overwriting is cheap and exposes mixed versions during upload.", "Keeping many old versions vs a few: many allow deep rollback and cost storage, while few are cheap and limit how far back you can go."],
    p: ["A rollback restores old HTML but cached assets at the edge are new, and pages render with mismatched styles.", "Old versions are pruned and the one needed for rollback no longer exists."],
    v: "Deploy a visible change, then roll back, and confirm the previous content is served worldwide within the cache time to live; request pages during the switch and confirm none mix old and new assets.",
    dep: ["deploy-artifact", "static-hosting", "cdn-cache-invalidation"]
  },
  "cdn-distribution": {
    s: "Serving the site's files from many locations near visitors through a caching network, with the static host as the origin it fetches from.",
    d: "Requests go to an edge location, which returns a cached copy if present and fresh, otherwise it fetches from the origin and stores it according to cache headers. Fingerprinted assets get long lifetimes; HTML gets short ones or a revalidation rule. Compression, protocol upgrades and image delivery happen at the edge. It is hard because every cached item has a lifetime and a purge path, and what is wrong at the origin stays visible until it expires or is purged. The cdn plate covers the network itself.",
    k: ["Long cache lifetimes for pages vs short: long lifetimes give speed and lower origin load, while short lifetimes show updates fast and cost more requests.", "Serving stale content while refreshing vs always revalidating: stale-while-refreshing is fast and briefly out of date, while revalidating is current and adds latency."],
    p: ["HTML cached for a day makes a corrected page appear fixed only for visitors whose copy has expired.", "Query strings and cookies are included in the cache key, so every visitor misses and the origin takes all traffic."],
    v: "Request a page twice from a distant location and confirm the second response is a cache hit with a low latency, and that the cache headers match the configured lifetime for pages and for fingerprinted files.",
    dep: ["static-hosting", "response-headers", "domains-and-tls"]
  },
  "cdn-cache-invalidation": {
    s: "Removing or marking stale cached copies at the edge after a deploy or content change, so visitors receive the new version promptly and the origin is not flooded.",
    d: "After activation, the pipeline sends a purge request for specific paths, tags or the whole site. Tag-based purge lets the build label pages with the entries they used and purge exactly the pages affected by a change. Short lifetimes and revalidation reduce the need. Purges propagate across locations in seconds, not instantly. It is hard because purging everything sends all traffic to the origin at once, and missing one path leaves a stale page for the full lifetime.",
    k: ["Purge everything on each deploy vs purge only changed paths: purging everything is simple and causes an origin load spike, while targeted purging is efficient and depends on a correct list.", "Tag-based purge vs path-based: tags purge related pages from one call, while paths are simple and need the full affected list from the build."],
    p: ["A purge request fires before the new version is active, and the edge refetches and caches the old content.", "A page listing recent posts is not in the purge list when a post is added, and stays stale."],
    v: "Publish a change affecting a post and the home page listing, run the purge, and confirm both URLs return the new content from several locations within the stated propagation time, while unrelated pages stay cached.",
    dep: ["cdn-distribution", "impact-scoping", "atomic-deploys-and-rollback"]
  },
  "redirects": {
    s: "Rules mapping old URLs to current ones with permanent or temporary status, so moved and renamed pages keep their inbound links and search ranking.",
    d: "Redirects come from a rules file, from content fields recording previous slugs, or from the CMS which writes one when a URL changes. The build outputs them in the host's format, as edge rules or small pages with refresh instructions as a fallback. Chains are flattened, and rules are validated to avoid loops. It is hard because large lists slow matching, rule syntax differs by host, and redirects accumulate for years and must never silently drop.",
    k: ["Rules at the edge vs HTML redirect pages: edge rules return real status codes and need host support, while HTML pages work anywhere and signal less to search engines.", "Recording previous slugs automatically vs writing rules by hand: automatic records never forget a rename, while hand-written rules are flexible and are missed."],
    p: ["A rename creates a chain of three redirects that slows visitors and some crawlers abandon.", "Two rules form a loop and the browser reports too many redirects."],
    v: "Rename a published page, rebuild, and request the old URL; confirm a single permanent redirect to the new URL; run the full list through a checker for loops and chains longer than one hop.",
    dep: ["permalinks", "static-hosting", "content-validation"]
  },
  "response-headers": {
    s: "HTTP headers the host attaches to responses, controlling caching, security, content types, compression and cross-origin access, configured per path pattern.",
    d: "A configuration file maps path patterns to headers: long immutable caching for fingerprinted files, short or revalidated caching for HTML, a restrictive content security policy, framing and referrer rules, and correct types for unusual files. The build can generate it from the asset manifest. It is hard because different hosts read different formats, a strict policy breaks inline scripts and third-party embeds, and an error in a pattern silently applies to the wrong paths.",
    k: ["Strict content security policy from the start vs permissive then tightened: strict policies prevent whole classes of attack and break embeds immediately, while permissive ones are easy and rarely tightened.", "Generated header rules vs hand-written: generated rules follow the asset manifest, while hand-written ones are clear and drift."],
    p: ["A policy blocks the inline script of an analytics snippet and nobody notices because no test loads the page in a browser.", "A pattern intended for assets also matches HTML and caches pages for a year."],
    v: "Request an HTML page, a fingerprinted asset and an image with a header inspection tool, and confirm each carries the intended cache, type and security headers; load the page in a browser and confirm no policy violations in the console.",
    dep: ["static-hosting", "fingerprinting"]
  },
  "domains-and-tls": {
    s: "Attaching custom domain names to the site and providing certificates for encrypted connections, including redirecting variants of the address to one canonical host.",
    d: "DNS records point the domain at the delivery network. The platform requests and renews certificates automatically after proving control of the domain, and serves them on every edge. Rules redirect the bare domain, the www variant and plain HTTP to the canonical address, and enable strict transport security. It is hard because DNS changes propagate slowly, certificate renewal can fail silently and expire, and preview and staging addresses need their own names and certificates.",
    k: ["Platform-managed certificates vs self-managed: managed certificates renew automatically and tie you to the platform, while self-managed give control and a renewal job to monitor.", "One canonical host with redirects vs serving all variants: a canonical host avoids duplicate content, while serving all is simpler and splits search ranking."],
    p: ["A certificate fails to renew because a DNS record changed, and visitors get warnings on a Monday morning.", "The www and bare domains both serve pages with no redirect, and links split between them."],
    v: "Request the bare domain, the www variant and the plain HTTP address, and confirm each redirects in one step to the canonical HTTPS address with a valid certificate and at least thirty days before expiry.",
    dep: ["cdn-distribution", "secrets-and-config"]
  },
});
