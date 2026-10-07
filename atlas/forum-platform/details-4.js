// Details for the forum platform plate, part 4: search, extension, portability, storage, caching and cross-cutting concerns.
ATLAS.details("forum-platform", {
  "search-indexer": {
    s: "Turns posts, topics, titles, tags, categories and member names into index entries, updated as content changes and rebuilt in bulk when rules change.",
    d: "On post creation, edit, deletion or move, a job reads the cooked text, strips markup, extracts titles and tags, and writes a document to the index with the topic, category and author. It combines a topic's posts for topic-level ranking. Visibility changes, such as a hidden post or a category move, must update entries. A full reindex rebuilds everything in batches. It is hard because index and database drift apart, and large reindexing competes with live traffic.",
    k: ["Index in the same transaction versus asynchronously: same-transaction keeps results exact, but couples posting to the index's availability; asynchronous lags a little and survives outages.", "Index each post versus one entry per topic: per-post gives precise snippets, and per-topic gives better topic ranking and a smaller index."],
    p: ["A post hidden or moved but not reindexed keeps appearing in results with its old text.", "A full reindex run in the daytime starves the live site of database capacity."],
    v: "Create a post, search for a unique word and confirm it appears within seconds. Edit the word, delete the post, and confirm results update each time. Run a reindex and confirm counts match the database.",
    dep: ["job-queue", "posts", "text-index", "markup-parser"]
  },
  "text-index": {
    s: "The data structure that maps words to the posts containing them, normalized for case, accents and word forms, with positions for phrase matching.",
    d: "Text is split into tokens, folded to lowercase, stripped of accents, reduced to stems and filtered of very common words, per the site's language. The index maps each term to document ids and positions, with a separate field weighting for titles. It may live inside the primary database or in a dedicated search service. Both approaches need tuning for each language. It is hard because tokenization differs by language, the index grows with content, and its size and freshness affect cost.",
    k: ["Database-native full text versus a dedicated search service: native text is one system with transactional freshness, but limited in relevance features; a service scales and adds operations and sync work.", "Stemming versus exact terms: stemming finds variants and also unrelated words that share a stem."],
    p: ["A language configured wrongly makes common words unsearchable or breaks matching of accented names.", "The index outgrows memory and every query becomes disk bound."],
    v: "Index posts in the site's language and search for a plural form, an accented spelling and an exact phrase. Confirm each returns the expected posts, and that phrase search respects word order.",
    dep: ["primary-store", "localization"]
  },
  "query-parser": {
    s: "Interprets what the member typed: plain words, quoted phrases, and filters such as category, user, tag, date and status, into a structured query.",
    d: "The parser splits the string into terms and operators, recognizes filters like in:category, by:user, before:date or status:open, and builds a query for the index plus conditions on the database. Unknown syntax is treated as plain text. Query length and complexity are limited. The same parser serves the full search page and the quick menu. It is hard because members expect forgiving behavior, filters must obey permissions, and expensive queries can be sent by anyone, including anonymous visitors.",
    k: ["Strict operator syntax versus natural language: operators are precise and need learning; natural language is friendly and unpredictable.", "Anonymous search allowed versus members only: open search aids discovery and exposes the site to scraping and load."],
    p: ["A filter value such as a category name that is not checked against permissions confirms private categories exist.", "Unbounded wildcard or very long queries consume the search service."],
    v: "Run queries combining a phrase, a user filter, a date range and a category filter. Confirm results match all conditions, an overlong query is refused, and a private category's name returns no results to outsiders.",
    dep: ["text-index", "permission-model", "rate-limiter"]
  },
  "ranking": {
    s: "Orders matching results by text relevance combined with recency, activity, likes, whether it is the opening post and whether the topic is solved or pinned.",
    d: "A text score from term frequency and field weights is blended with signals: newer posts and recently active topics rank higher, likes and reads add weight, titles count more than bodies, and low-trust content or closed topics may be down-ranked. Weights can be adjusted by operators. Results are grouped by topic with a best-matching snippet. It is hard because quality is subjective, signals can be gamed, and tuning one query class worsens another.",
    k: ["Recency-heavy versus relevance-heavy: recency finds current answers and buries classic threads; relevance finds canonical threads and surfaces stale advice.", "Group by topic versus list posts: grouping reads like a result page, and loses the individual best post."],
    p: ["Boosting by likes lets a popular off-topic post outrank the accepted answer.", "Weights tuned on one community's content perform poorly after the site's mix of topics changes."],
    v: "Prepare topics where an old canonical thread, a recent duplicate and a short title match exist. Confirm the intended ordering for a set of reference queries and record any query whose ordering changes after a tuning edit.",
    dep: ["text-index", "likes-and-reactions", "topics"]
  },
  "search-visibility-filter": {
    s: "Ensures a member only gets results from content they may see, by applying category, group, private-message and deletion rules to every search.",
    d: "Each query carries the searcher's allowed category ids and group memberships, and the index filters by them, or results are checked against permissions after retrieval. Private messages are included only for participants. Hidden, deleted and pending posts are excluded except for staff. The filter must cover autocomplete, related topics and any API search. It is hard because filtering after retrieval wastes work and shortens pages, filtering before requires the index to hold access data, and either must stay in sync.",
    k: ["Filter inside the index query versus after retrieval: inside is correct and efficient but needs access fields kept current; after is simple and yields short or empty pages.", "Include private messages in the same index versus separately: one index is simple and risks leaks; a separate one isolates them and doubles upkeep."],
    p: ["Autocomplete or related-topic suggestions skip the filter and reveal private titles even though the main search is safe.", "Access data in the index goes stale after a group change, and results leak or vanish."],
    v: "As each role from anonymous to staff, search for a unique word placed in a public, restricted, private and deleted post and a message. Confirm only the permitted ones appear in results, suggestions and the API.",
    dep: ["permission-model", "search-indexer", "groups", "private-messages"]
  },
  "related-topics": {
    s: "Suggests other topics similar to the one being read or written, using shared terms, tags and category, to reduce duplicates and help readers continue.",
    d: "When a topic is shown, a query uses its title and first post keywords to find similar topics, boosts shared tags and category, and filters by permission and read state. The composer uses the same engine to suggest existing topics while the member types a title. Results are cached per topic. It is hard because similarity from keywords alone is weak, results go stale, and showing duplicates at composition time is the most valuable and the least reliable use.",
    k: ["Keyword similarity versus learned embeddings: keywords are cheap, explainable and local; embeddings find better matches and need a model and storage.", "Compute at view time versus precompute: view time is fresh and loads search on every page; precomputed is cheap and lags new topics."],
    p: ["Suggestions list topics from a category the reader cannot access, leaking their titles.", "Weak matches fill the space with unrelated topics, and readers learn to ignore it."],
    v: "Create two topics on the same narrow subject and confirm each lists the other as related, ordered by closeness, and that a private topic on the same subject never appears for an outsider.",
    dep: ["text-index", "tags", "search-visibility-filter", "hot-topic-cache"]
  },
  "autocomplete": {
    s: "Fast suggestions as the member types in the search box or composer: matching users, tags, categories, emoji and topic titles.",
    d: "Each keystroke after a short delay asks a lightweight endpoint for matches by prefix. Users, groups and tags use dedicated indexes ordered by relevance such as recent interaction; topic titles use the search index. Results come with small payloads. The endpoints are rate limited and cached briefly. It is hard because it fires constantly, must respond in tens of milliseconds, and each source needs its own permission rules, especially for users and private groups.",
    k: ["Prefix matching versus fuzzy matching: prefix is fast and predictable; fuzzy forgives typos and costs more compute.", "Per-keystroke requests versus a locally cached list: requests stay fresh, and local lists are instant for small communities and fail at scale."],
    p: ["A user-name completion endpoint lets scrapers enumerate every member by iterating prefixes.", "Without request cancellation, slow older responses overwrite newer ones and show wrong suggestions."],
    v: "Type a prefix quickly and confirm suggestions track the final text, requests stay under the rate limit, results contain only users and tags visible to the typist, and median response is within the target.",
    dep: ["text-index", "accounts", "tags", "rate-limiter", "search-visibility-filter"]
  },
  "plugin-api": {
    s: "The supported way for operators to add server and client behavior: new models, routes, settings, interface components and extensions to existing features.",
    d: "A plugin is a package declaring its code, assets, settings, database migrations and version compatibility. It registers extension points: new fields on core objects, extra routes, additions to the editor, background jobs and changes to rendering. The core loads plugins at boot and guards them with versions. It is hard because plugin code runs with full access, core upgrades break plugins that use internals, and a defective plugin can take down the site.",
    k: ["Narrow supported extension points versus full access to internals: narrow points keep upgrades safe and limit what plugins can do; full access is powerful and breaks on every release.", "Install at runtime versus at build time: runtime is flexible and operationally risky; build time is auditable and needs a rebuild."],
    p: ["A plugin written against internal code breaks silently after a core update and corrupts data.", "An unreviewed plugin runs with database access and exfiltrates member email addresses."],
    v: "Install a test plugin adding a field and a route, then upgrade the core. Confirm the plugin loads, its migration ran once, the route works, and a plugin declaring an incompatible version is refused with a clear message.",
    dep: ["event-hooks", "site-settings", "schema-migrations", "custom-fields"]
  },
  "event-hooks": {
    s: "Named points in the core, such as post created, user promoted or topic closed, where plugins and internal modules can listen and react.",
    d: "The core emits an event with a payload at defined moments, and registered handlers run synchronously or via the job queue. Filters let a handler change a value before it is used, such as the post's text or a permission result. Handlers are ordered and isolated, so an error in one is logged and does not stop the operation. It is hard because every event is a promise to keep its name and payload stable, and synchronous handlers add latency to the request.",
    k: ["Synchronous handlers versus queued handlers: synchronous can veto or modify the action and slow it; queued run later and cannot affect the outcome.", "Allow handlers to change values versus observe only: modification enables features, and makes behavior depend on plugin order."],
    p: ["A slow synchronous handler on post creation makes every reply take seconds.", "Two plugins change the same value and the result depends on load order, which differs between environments."],
    v: "Register a handler on post creation that records an event and one that raises an error. Create a post and confirm the post is saved, the first handler ran once, and the error was logged without failing the request.",
    dep: ["job-queue", "plugin-api"]
  },
  "theme-system": {
    s: "Lets operators change the look and layout with stylesheets, templates, components and settings, packaged as installable themes with optional child themes.",
    d: "A theme bundles style variables, stylesheet files, template overrides and small scripts, with its own settings. The interface is built from components with documented extension slots. Color schemes support light and dark; variables keep the palette consistent. Themes can be previewed per member and kept in source control. It is hard because template overrides depend on internal markup that changes, themes can break the mobile layout, and a custom script runs in every member's browser.",
    k: ["Variables and extension slots versus replacing templates: variables and slots survive upgrades, while template overrides allow anything and break when markup changes.", "One theme per site versus selectable by members: one is consistent and easy to support; selectable serves preference and multiplies testing."],
    p: ["A template override copied from an older version hides new features or breaks the layout after upgrade.", "A theme's script from an untrusted source can read everything a member sees."],
    v: "Apply a theme changing colors and a header component, then view it on phone and desktop, in light and dark. Upgrade the core and confirm the theme still renders and its settings remain.",
    dep: ["site-settings", "client-app", "server-rendered-pages"]
  },
  "site-settings": {
    s: "Hundreds of operator-adjustable options, with types, defaults, validation and categories, changeable at runtime and applied across all server processes.",
    d: "Each setting has a name, type, default, allowed range, description and optional dependency on others. Changes are saved in the database, cached in memory, and broadcast so all processes pick them up without restart. Settings are grouped in the admin area and searchable. Changes are logged. It is hard because there are so many that interactions are unclear, some are security relevant and need protection, and a bad value can make the site unusable.",
    k: ["Database-stored runtime settings versus configuration files: runtime settings change instantly with audit; files are versioned and need deployment.", "Many fine-grained settings versus opinionated defaults: many options fit more communities and overwhelm administrators; defaults are simpler and fit fewer."],
    p: ["A single mistyped value, such as a rate limit of zero, locks every member out of posting.", "Settings changes propagate to some processes but not others and produce inconsistent behavior."],
    v: "Change a setting in the admin interface and confirm every server process applies it within seconds without restart, the change is logged with actor and previous value, and an out-of-range value is refused.",
    dep: ["primary-store", "message-bus", "audit-logging"]
  },
  "webhooks": {
    s: "Sends signed HTTP requests to registered addresses when events happen, such as a new topic or post, so other systems can react without polling.",
    d: "An administrator registers a target address, a secret and the event types. When an event fires, a job builds a payload, signs it with the secret and posts it, recording the response. Failures are retried with growing delay and then disabled after repeated failure. Delivery history is viewable. It is hard because deliveries can arrive out of order or twice, target servers are slow or hostile, and the forum must not be coerced into requests to internal addresses.",
    k: ["At-least-once with retry versus best effort: retry avoids lost events and produces duplicates receivers must tolerate; best effort is simpler and loses events.", "Include full content versus identifiers: full content saves a call, but sends private text to external systems."],
    p: ["A webhook to an internal address makes the forum probe the private network for an attacker.", "A failing endpoint is retried forever and clogs the job queue."],
    v: "Register a test receiver, create a post and confirm one signed delivery arrives and verifies. Make the receiver fail and confirm retries back off and the hook is disabled after the limit, with history shown.",
    dep: ["event-hooks", "job-queue", "site-settings"]
  },
  "rest-api": {
    s: "The documented HTTP interface to nearly everything the site does, returning JSON, used by the web client, mobile apps and integrations.",
    d: "Routes cover topics, posts, users, categories, search, notifications and administration. Authentication is by session or API key, and every route applies the same permission checks as the interface. Responses are paginated, with stable fields and versioned changes. Writes validate input and return errors in a consistent shape. Rate limits apply per key. It is hard because the web client uses it too, so changes can break outside clients, and because each route is a place a permission check can be forgotten.",
    k: ["The client's own API is the public API versus a separate stable one: sharing avoids duplicate work, but locks internal changes into compatibility; separate is stable and doubles upkeep.", "Offset pagination versus cursors: offset is easy and misbehaves as data moves; cursors are stable and less convenient."],
    p: ["An undocumented field removed in an update breaks integrations that quietly relied on it.", "A route returns objects without permission filtering that the interface applies elsewhere."],
    v: "Call every read route as anonymous, member and admin with the same private-category fixtures and confirm results match the interface for that role. Confirm error responses use one shape and pagination returns no duplicates.",
    dep: ["permission-model", "api-keys", "rate-limiter", "sessions"]
  },
  "custom-fields": {
    s: "Operator-defined extra data on users, topics, posts or categories, stored and shown by configuration or plugin without changing the core schema.",
    d: "Fields have a name, type and a target object, and are stored in key-value tables or a flexible column. They appear in profile forms, sign-up, filters or templates, and are exposed by the API if allowed. Plugins attach their own fields. Validation and visibility are per field. It is hard because key-value storage is slow to query and index, fields can hold personal data that must be exported and erased, and permissions must follow each field.",
    k: ["Generic key-value table versus real columns: key-value needs no migrations and is slow to filter; columns are fast and need schema changes.", "Expose to the API by default versus opt-in: default exposure is convenient and leaks; opt-in is safer and easy to forget."],
    p: ["Personal data in a custom field is not included in export or erasure because those jobs only know core columns.", "Filtering by a custom field scans the whole key-value table and slows the site."],
    v: "Add a field on profiles, fill it and confirm it appears in the profile form, the API only when enabled, the user's data export, and is removed on account deletion.",
    dep: ["primary-store", "user-profiles", "plugin-api"]
  },
  "localization": {
    s: "Translates the interface into many languages, with plural and gender rules, dates and numbers formatted by locale, and per-member language choice.",
    d: "Strings are stored in translation files keyed by name, with placeholders and plural forms. The language comes from the member's setting or browser. Dates, numbers and sorting follow the locale. Right-to-left languages need mirrored layout. Translations are contributed by a community platform and updated with releases. Notifications and email use the recipient's language, not the actor's. It is hard because partial translations produce mixed-language pages and string concatenation breaks in other grammars.",
    k: ["Translate user-facing strings only versus also content: interface strings are finite and complete, while content translation is a separate product problem.", "Recipient's language for email versus site default: recipient's language is considerate and requires rendering per language."],
    p: ["A message built by joining fragments reads wrongly or breaks in languages with other word order.", "A missing translation key shows its raw identifier to members."],
    v: "Switch to a right-to-left language and one with many plural forms. Confirm layout mirrors, counts use correct plural forms, and an email to a member in that language is sent in it.",
    dep: ["site-settings", "accounts"]
  },
  "export-jobs": {
    s: "Produces downloadable copies of a member's own data or of the whole site for backup, compliance requests or migration.",
    d: "A member can request their posts, uploads, bookmarks and settings; staff can export users, categories and reports. A job collects the data into files, packages them, stores the archive, and emails a link that expires. Large exports run in the background with limits so only one runs at a time. The format must be documented. It is hard because exports gather personal data from many tables, including those added by plugins, and the download link itself must be protected.",
    k: ["Machine-readable open format versus a readable report: open formats allow moving elsewhere; readable reports are friendlier and harder to re-import.", "Include other people's content that the member quoted versus only their own: including quotes is context and shares other people's words."],
    p: ["Export misses data stored by plugins and custom fields, which defeats its purpose as a data-access response.", "The download link is guessable or never expires and exposes someone's archive."],
    v: "Request an export for an account with posts, uploads and custom fields. Confirm the archive contains each, the link works for the owner only, and it expires after its stated time.",
    dep: ["job-queue", "object-storage", "outbound-email", "custom-fields", "permission-model"]
  },
  "import-tools": {
    s: "Scripts and tools that bring users, categories, topics, posts, messages and uploads from another forum or mailing list into the platform.",
    d: "An importer reads the source database or export files, maps source ids to new ids, converts markup, creates staged accounts for authors so they can claim them later, and builds redirects from old URLs. It runs in batches and can resume. Post-processing rebakes content, recalculates counters, and builds the search index. It is hard because source data is dirty, markup converts imperfectly, and identity matching of authors by email must not link the wrong accounts.",
    k: ["Staged accounts versus sending every member an invitation: staging leaves history attributed and waiting to be claimed; invitations may annoy people who never asked for one.", "One large run versus incremental runs: incremental allows a trial and a final catch-up run; one run is simpler and risky."],
    p: ["Converted markup lets raw HTML through unsanitized, creating a stored script hole.", "A failed run leaves half-imported topics and no way to resume without duplicates."],
    v: "Import a sample of three hundred topics, run it again and confirm no duplicates. Spot check attribution, formatting and links, confirm old URLs redirect, counters match, and search finds imported text.",
    dep: ["accounts", "posts", "html-sanitizer", "permalinks-and-redirects", "job-queue"]
  },
  "backups": {
    s: "Regular copies of the database and uploads, with retention, off-site storage and a tested way to restore the site, including to a different server.",
    d: "A scheduled job dumps the database consistently and archives uploads, or uses storage-level snapshots, then copies them to a separate location with a retention rule such as daily for a week and monthly for a year. Restore means loading the dump and files, running migrations and rebuilding derived data and caches. Backups are encrypted because they hold everything. It is hard because an untested backup is only a hope, and restoring takes hours under pressure.",
    k: ["Logical dumps versus storage snapshots: dumps are portable across versions and slow on large data; snapshots are fast and tied to the platform.", "Frequent backups versus long retention: frequent narrows data loss, long retention helps late-discovered damage, and both cost storage and privacy exposure."],
    p: ["Backups stored on the same host as the site are lost with it.", "A restore has never been tried, and the dump turns out to be incomplete when it is needed."],
    v: "Restore the latest backup into an empty server, start it, and confirm it boots, recent topics and uploads are present, search works after a rebuild, and a login succeeds. Record how long it took.",
    dep: ["primary-store", "object-storage", "scheduler", "schema-migrations"]
  },
  "admin-reports": {
    s: "Dashboards of site health and community activity: signups, posts, visits, response times, flags, moderator workload and traffic sources.",
    d: "Reports query summary tables built by scheduled jobs, so they do not scan raw data, and show time series with comparisons to the previous period. Problem checks list issues such as stale jobs, failed emails, outdated versions and low disk space. Moderators see response time to flags. Reports can be exported or emailed. It is hard because queries on large tables are expensive, definitions such as active user vary, and showing everyone too much invites misleading numbers.",
    k: ["Precomputed summaries versus live queries: summaries are cheap and a day old; live queries are exact and load the primary database.", "Few agreed metrics versus customizable reports: a few metrics are comparable and may miss what an operator needs."],
    p: ["An unindexed report query run on the production database slows the site for everyone while it runs.", "Counting bots and crawlers as visitors inflates traffic and hides real trends."],
    v: "Generate known activity over a week and confirm each report's totals equal the counts in the database for the same period and definition, and that opening the dashboard does not raise response times on a busy site.",
    dep: ["scheduler", "primary-store", "counter-store"]
  },
  "audit-logging": {
    s: "Structured logs of requests, errors, jobs, emails and security events, kept for operators to diagnose problems and trace what happened.",
    d: "Each request records route, status, duration, account and address; errors record stack traces with context; jobs and mail record outcome. Security events such as failed logins and permission denials are separated. Logs go to files or a central service with rotation, and sensitive values such as passwords and tokens are masked. It is hard because logs are both the best diagnostic and a privacy hazard, because volume is large, and because retention must follow data-protection promises.",
    k: ["Central log service versus local files: central search and alerting make incidents faster, and ship personal data out of the host; local files are simple and hard to search across servers.", "Log full request bodies versus metadata: bodies help debugging and capture secrets and content; metadata is safer and sometimes insufficient."],
    p: ["Logs record password reset tokens or session cookies in URLs, so anyone with log access can take over accounts.", "No rotation fills the disk, and the site stops writing."],
    v: "Trigger a failed login, a permission denial, a job failure and a server error. Confirm each appears once with correlated request id, and that no password, token or email body appears in the log text.",
    dep: ["primary-store", "accounts"]
  },
  "data-queries": {
    s: "A guarded way for administrators to run read-only queries against a copy of the data to answer one-off questions and build custom reports.",
    d: "An admin writes a query, with parameters, in a restricted form; it runs on a replica or inside a read-only transaction with a time limit and row limit, and results can be shown, downloaded or scheduled. Saved queries can be shared with groups. Access is limited and logged. It is hard because arbitrary query access exposes personal data and private messages, and expensive queries can overwhelm a database unless limited.",
    k: ["Run on the primary versus on a replica: the primary is current and at risk from heavy queries; a replica isolates load and lags slightly.", "Open schema access versus a curated set of views: open access answers anything, and reveals private data; views limit exposure and answer less."],
    p: ["A query without a time limit holds locks or exhausts connections and stalls the site.", "A shared saved query exposes email addresses to a group that should not see them."],
    v: "Run a long query and confirm it is cancelled at the time limit, a write statement is refused, results are capped, and the access appears in the log with who ran which query.",
    dep: ["read-replicas", "permission-model", "audit-logging"]
  },
  "primary-store": {
    s: "The relational database holding accounts, categories, topics, posts, relations, settings and state, the single source of truth that everything else derives from.",
    d: "Tables model users, topics, posts and their many relations, with indexes matching the lists and lookups described elsewhere. Writes are transactional so a post, its counters and its notifications queue stay consistent. Reads dominate, so queries are tuned and cached. Large tables such as posts and notifications need careful indexing and sometimes partitioning. It is hard because denormalized counters drift, because hot topics create contention, and because the schema accumulates years of plugin and feature additions.",
    k: ["Normalized tables versus denormalized counters and summaries: normalized is correct and slow for lists; denormalized is fast and needs repair jobs.", "One database versus separate stores for search, jobs and caching: one is simple and easy to back up; separate stores each do their job better and multiply operations."],
    p: ["Missing index on a common list query turns a growing table into the cause of outages.", "Long transactions during posting hold row locks and make hot topics time out."],
    v: "Load a realistic dataset, run the slowest ten queries from production logs with the query planner and confirm each uses an index and finishes within its budget, while concurrent posting to one topic shows no lock timeouts.",
    dep: ["schema-migrations"]
  },
  "schema-migrations": {
    s: "Versioned scripts that change the database structure as the software evolves, run automatically on upgrade and safe to run on a large live table.",
    d: "Each migration has a version and an up step, and the system records which have run. Core and plugin migrations are ordered together. On large tables, changes are done in ways that avoid long locks: adding columns without defaults that rewrite the table, building indexes concurrently, and backfilling in batches. Destructive changes are split across releases so old code keeps working. It is hard because upgrades run while the site is live and rollback is rarely possible.",
    k: ["Run migrations at deploy versus as a separate step: at deploy is simple and ties availability to the migration; a separate step allows safe timing.", "Expand then contract in two releases versus a single change: two releases keep old and new code compatible, and take longer."],
    p: ["A migration that locks a large table for minutes takes the site down during an upgrade.", "A plugin's migration fails halfway and leaves the schema in a state no version expects."],
    v: "Run the pending migrations on a copy of production data while a load test runs, and confirm the site stays responsive, each migration is recorded once, and re-running changes nothing.",
    dep: ["primary-store"]
  },
  "object-storage": {
    s: "Durable file storage for uploads, avatars, backups and export archives, addressed by key and served directly or through the CDN.",
    d: "Files are written under generated keys, with metadata for type and size, and read back by key or signed temporary link. Private files, such as uploads in restricted categories or messages, require authorization before serving. Lifecycle rules remove temporary objects. Local disk or a remote object service can implement it. It is hard because access control must apply to files as well as posts, and orphaned files accumulate when posts are deleted.",
    k: ["Remote object service versus local disk: a service scales, survives host loss and costs per request; local disk is simple and ties files to one server.", "Public URLs versus signed temporary links: public URLs cache well and are guessable if shared; signed links control access and defeat shared caching."],
    p: ["Files from a private message are served at a permanent public URL that anyone with the link can open.", "Deleting a post leaves its uploads in storage forever, and storage cost grows without bound."],
    v: "Upload a file in a private category and fetch it with and without authorization. Confirm only the authorized request succeeds, the link stops working after expiry, and deleting the post eventually removes the file.",
    dep: []
  },
  "read-replicas": {
    s: "Copies of the primary database that serve read queries and take over if the primary fails, with replication lag and failover as the main concerns.",
    d: "Changes stream from the primary to one or more replicas, which handle anonymous reads, reports and queries. The application routes writes to the primary and reads to a replica, except where freshness matters, such as right after a member posts. A failover process promotes a replica when the primary is lost and redirects connections. It is hard because lag makes recent writes invisible, failover can lose the last writes, and mistaken promotion can create two primaries.",
    k: ["Read your own writes from the primary versus accept lag: reading from the primary after writing is correct and increases primary load; accepting lag is cheap and confuses authors.", "Automatic failover versus manual: automatic recovers in seconds and risks split-brain; manual is safe and slow."],
    p: ["A member posts and the next page, served by a lagging replica, shows the reply missing, so they post it again.", "Two nodes both believe they are primary after a network partition and accept writes."],
    v: "Post a reply and reload immediately while replica lag is artificially raised, and confirm the author still sees it. Stop the primary and confirm a replica is promoted and the site accepts writes within the target time.",
    dep: ["primary-store"]
  },
  "job-queue": {
    s: "A queue and worker pool that run slow or deferrable work outside the request: sending mail, indexing, image processing, notifications, imports and webhooks.",
    d: "Code enqueues a named job with arguments; workers pick jobs by priority and run them with a time limit, retrying failures with backoff and recording errors. Queues are separated so a flood of one kind does not block urgent jobs. Jobs must be safe to run twice. Dead jobs can be inspected and re-run. It is hard because jobs fail in ways that look like success, retries multiply side effects, and queue backlog is an invisible way for the site to degrade.",
    k: ["Separate queues per priority versus one queue: separate queues keep urgent mail flowing during an import, and need capacity planning for each.", "At-least-once with idempotent jobs versus at-most-once: at-least-once loses nothing and demands idempotent code; at-most-once is simple and drops work."],
    p: ["A retried notification job runs after a partial success and sends duplicates.", "A queue backlog grows silently, and email and search lag for hours before anyone notices."],
    v: "Enqueue a mix of urgent and bulk jobs, kill a worker mid-job and confirm the job is retried exactly once to completion, urgent jobs run within seconds despite the bulk backlog, and queue depth is visible on a dashboard.",
    dep: ["primary-store", "counter-store"]
  },
  "scheduler": {
    s: "Runs recurring tasks on a schedule, such as digests, badge sweeps, trust evaluation, cleanup, backups and reminders, ensuring each runs once across all servers.",
    d: "Tasks declare an interval or time of day. A scheduler process, or a lock held across processes, enqueues the job when due, and the job queue executes it. Missed runs after downtime are skipped or caught up by rule. Each run records its start and outcome. Tasks are spread over time to avoid load spikes. It is hard because running on several servers can double-fire tasks, clocks drift, and long tasks overlap their next run.",
    k: ["Single scheduler with failover versus every node tries with a lock: a single scheduler is simple and needs failover; locks tolerate node loss and rely on correct locking.", "Catch up missed runs versus skip: catching up repairs state and can create a thundering burst after downtime."],
    p: ["Two servers both run the daily digest, and members receive it twice.", "A task takes longer than its interval and runs concurrently with itself, doubling load."],
    v: "Run three servers with the scheduler for one hour of short intervals and confirm each task runs exactly once per interval, overlapping runs are prevented, and run history shows start time and outcome.",
    dep: ["job-queue", "counter-store"]
  },
  "hot-topic-cache": {
    s: "Keeps the rendered or assembled data of frequently read topics in fast memory, so the busiest threads are served without the database.",
    d: "On a read, the application looks up the topic's page by key, built from topic id, page, the viewer's permission class and format. A miss builds the page from the database and stores it with a short lifetime. A new reply changes the last page, so it is invalidated or updated; earlier pages remain valid. Per-member pieces such as read state are added after the cached part. It is hard because correctness depends on the cache key including everything that changes the output.",
    k: ["Cache shared page data and add personal parts afterward versus cache per member: shared caching hits often and requires merging; per-member caching is simple and has a low hit rate.", "Short lifetime versus event-based invalidation: lifetime is simple and shows stale content; invalidation is accurate and needs every write path to remember it."],
    p: ["The cache key ignores permission class, so a private topic's cached page is served to an anonymous reader.", "Every reply invalidates the entire topic, and a popular thread stampedes the database."],
    v: "Request a popular topic repeatedly and confirm database queries drop to near zero after the first. Post a reply and confirm the next request shows it, while a viewer lacking access receives no cached content.",
    dep: ["counter-store", "topics", "permission-model", "cache-invalidation"]
  },
  "page-cache": {
    s: "Stores complete rendered pages for anonymous visitors and crawlers, served by the web tier without running application code for most hits.",
    d: "Requests with no login cookie for public routes are answered from a cache keyed by path and format. The first request renders and stores the page; later ones are served directly for a short period. Logged-in requests bypass it. Expensive crawlers and links from popular sites mostly land here. It is hard because it must never serve a page that depends on who is asking, because stale pages outlive deletions, and because cookies and query strings fragment the cache.",
    k: ["Cache for anonymous only versus all users with edge includes: anonymous-only is safe and covers most traffic; broader caching saves more and needs per-user fragments.", "Short lifetime versus purge on change: a lifetime of seconds bounds staleness with no coordination, while purge gives freshness and depends on reliable signals."],
    p: ["A page rendered for a logged-in staff member is stored and then served to anonymous visitors.", "A deleted post continues to be served from cache after the moderator removed it."],
    v: "Request a public topic as anonymous twice and confirm the second is a cache hit with no application work. Delete a post and confirm the cached page is refreshed within the stated bound, and logged-in requests never hit it.",
    dep: ["server-rendered-pages", "counter-store", "cache-invalidation"]
  },
  "edge-cdn": {
    s: "A network of servers near readers that serves static assets, images and cached anonymous pages, absorbing most traffic before it reaches the site.",
    d: "Static bundles, avatars and uploads carry long lifetimes and versioned URLs, so a change makes a new URL. Anonymous pages may be cached for short periods, with purge by tag or path when content changes. The edge also terminates connections, blocks abusive traffic and compresses responses. It forwards the real client address in a header. It is hard because stale or mis-keyed content is served far from the source, and caches cannot know what is private.",
    k: ["Cache pages at the edge versus only static assets: page caching offloads most reads and risks leaks and staleness; assets only is safe and leaves the origin busy.", "Purge on change versus short lifetimes: purge is fresh and needs integration; lifetimes need nothing and show stale content."],
    p: ["Private responses without correct cache directives are stored at the edge and served to other visitors.", "The origin sees the edge's address for everyone, so rate limits and bans apply to all members at once."],
    v: "Request an asset and a public page twice from distant locations, confirm hits are served from the edge, then change the page and purge, confirm fresh content, and verify a logged-in response carries headers that prevent caching.",
    dep: ["page-cache", "cache-invalidation", "object-storage"]
  },
  "counter-store": {
    s: "A fast in-memory key-value store used for counters, rate limits, presence, message bus backlog, sessions and short-lived caches shared by all application servers.",
    d: "Keys have expiry and simple data types such as counters, lists and sets. Application servers share it so limits, caches and presence agree across processes. It is not the source of truth: everything in it can be rebuilt or lost without data loss, though losing it suddenly slows the site. Memory is bounded with eviction rules. It is hard because teams start using it as storage, because eviction can remove things that matter, and because it becomes a single shared dependency.",
    k: ["Treat as disposable versus persist to disk: disposable keeps design honest and makes restarts a cold start; persistence smooths restarts and encourages relying on it.", "One shared instance versus separate per purpose: one is simple and lets a cache flood evict sessions; separate instances isolate and cost more."],
    p: ["A cache flood evicts session and rate-limit keys, logging everyone out and disabling limits at once.", "A restart empties it, and every cache misses and sends the whole traffic to the database."],
    v: "Flush the store on a running site under load and confirm no data is lost, sessions and limits recover, and the database survives the cold-start spike. Fill it past capacity and confirm eviction does not remove sessions.",
    dep: []
  },
  "cache-invalidation": {
    s: "The logic that removes or refreshes cached data when the underlying data changes, tracking which cached pages, fragments and counts depend on which records.",
    d: "On a write, the application identifies affected keys: the topic's last page, category lists, user card, counts, permission sets. It deletes them directly, or bumps a version number embedded in keys so old entries are never read again. Changes of permissions, groups and settings touch many keys at once, so they use broad versioning. It is hard because every write path must remember every dependent key, and a single omission shows stale content until it expires.",
    k: ["Delete specific keys versus version bumps: specific deletion is precise and easy to miss; version bumps are broad and always correct, and waste cache.", "Event-driven invalidation versus short lifetimes: events give freshness and require discipline; lifetimes are forgiving and let stale data show."],
    p: ["A new write path, such as an import or plugin, changes data without invalidating dependent keys.", "A broad version bump after each small change keeps the hit rate near zero."],
    v: "For each kind of write (reply, edit, move, delete, permission change) check every dependent view, and confirm each shows the new state on the next request. Record which views relied on expiry instead.",
    dep: ["counter-store", "message-bus"]
  },
  "permissions-everywhere": {
    s: "Almost every read and write answers the question of who may see or do this, so the permission model shapes data layout, queries, caches, search, notifications and exports.",
    d: "Visibility depends on the category, the viewer's groups and trust level, and per-object states, and it must hold in lists, search, notifications, email, live updates, the API, exports and caches. Each of those is a separate chance to leak. The decision has to be made early: express permissions as data a query can filter by, keep one source of truth, and test the same matrix against every surface. Retrofitting it later means auditing every path.",
    k: ["Filter in the query versus check after fetching: filtering returns correct pages efficiently and needs permissions as indexable data; checking afterward is easy and gives short pages and wasted work.", "Keep permission-aware caches versus bypass caches for members: keyed caches keep speed, and bypassing is safe and expensive."],
    p: ["One surface, such as email digests or autocomplete, skips the check and leaks titles of private topics.", "Permissions change but derived data (search entries, caches, notifications) keeps the old access."],
    v: "Take a fixed set of roles and objects and run the same visibility matrix against lists, topic pages, search, autocomplete, notifications, email, live updates, API and export. Every cell must match the intended table.",
    dep: ["permission-model", "search-visibility-filter", "cache-invalidation"]
  },
  "read-heavy-scaling": {
    s: "A community is read far more than written, and most readers are anonymous, so the design scales by serving reads from caches and replicas and keeping writes small.",
    d: "Typical traffic is dominated by anonymous page views, crawlers and a long tail of old topics, while a small share of members write. Capacity is therefore bought with caching layers, replicas and queues that take slow work off the write path, not with a bigger primary. Hot topics, link spikes and crawlers define peaks. The decision is where to draw the line between shared cached content and personal state, and to measure the real read-to-write ratio before choosing an architecture.",
    k: ["Cache aggressively and accept staleness versus serve fresh from the database: caching absorbs spikes and complicates correctness; fresh data is simple and fails under load.", "Scale the primary up versus add replicas and caches: up is simple and has a ceiling; out removes the ceiling and adds lag."],
    p: ["A single post to a social site sends ten times normal traffic to one thread and exhausts the database.", "Crawlers read every old topic and evict the hot working set from caches."],
    v: "Replay production traffic proportions plus a ten-times burst on one topic against a staging copy, and confirm response times stay within the target and database query volume rises far less than the request volume.",
    dep: ["page-cache", "read-replicas", "hot-topic-cache", "job-queue"]
  },
  "abuse-by-design": {
    s: "Any open community is attacked constantly by spammers, harassers and scrapers, so limits, trust and review are part of every feature rather than added later.",
    d: "Each feature that lets someone create content, send a message, upload a file, mention a person or register is a channel for abuse. The platform assumes new accounts are untrusted, rate limits every write, scores content, makes reporting easy and gives staff fast ways to undo damage. The decision is what each trust level may do and how much friction legitimate newcomers will tolerate. Defenses are layered because no single one stops a determined attacker.",
    k: ["Tight defaults for newcomers versus welcoming defaults: tight defaults suppress abuse and cost real growth; welcoming defaults feel open and need more cleanup staff.", "Automated action versus human review: automation is fast and makes mistakes at scale; review is accurate and slow."],
    p: ["A new feature, such as polls or uploads, ships without rate limits and becomes the spam vector within days.", "Defenses tuned against yesterday's spam fail silently when attackers change tactics."],
    v: "Run a scripted attacker with fresh accounts against registration, posting, messaging, uploading and mentioning. Confirm each channel is limited, the activity lands in the queue, and staff can reverse it in one action.",
    dep: ["rate-limiter", "trust-levels", "spam-classifier", "review-queue", "bulk-cleanup"]
  },
  "privacy-and-retention": {
    s: "Posts are public, but accounts hold personal data and private conversations, so what is stored, who sees it and how long it is kept must be designed, including deletion and export.",
    d: "Personal data lives in accounts, emails, addresses in logs, messages, drafts, revisions, uploads, backups and the text of other people's posts. Laws and member expectations require access, correction, export and erasure. The architecture has to know where personal data is, limit what is collected, set retention for logs and deleted content, and let erasure reach derived copies. Decisions made early are the only cheap ones, since finding scattered data later is expensive.",
    k: ["Anonymize content on erasure versus delete it: anonymizing keeps conversations intact and keeps text that may identify the person; deleting is complete and damages threads.", "Short retention for logs and deleted content versus long: short reduces risk and loses investigative history; long helps appeals and holds more data."],
    p: ["A new plugin or log line stores personal data in a place the export and erasure jobs do not know about.", "Backups keep erased data indefinitely, and a restore reintroduces it."],
    v: "Create an account with content in every place the platform stores data, then export and erase it, and search the database, logs, search index, caches and a restored backup for the member's identifiers. None should remain except where policy says.",
    dep: ["account-deletion", "export-jobs", "audit-logging", "backups"]
  },
  "consistency-and-staleness": {
    s: "Counters, caches, indexes and replicas are all copies that lag the database, so every feature needs a stated tolerance for how stale it may be and a way to repair drift.",
    d: "Reply counts, unread counts, search results, cached pages, rankings and digests are derived data. They are updated by events, jobs or schedules, and any of those can be late or lost. Some views must be exact, such as the author seeing their own post; others may be minutes old. The decision is made per feature: what is the source of truth, how stale is acceptable, and which repair job reconciles drift. Without it, bugs appear as numbers that slowly stop matching.",
    k: ["Update derived data in the transaction versus afterward through events: in-transaction is always consistent and slows and couples writes; events are fast and can lag or be lost.", "Periodic repair jobs versus trusting the events: repair jobs fix drift and cost scans; trust is cheap and lets errors accumulate."],
    p: ["A lost event leaves a counter permanently wrong because nothing ever recomputes it.", "An author is shown a stale page after posting and posts again, creating a duplicate."],
    v: "Inject failures (drop events, lag a replica, kill a worker) during a posting load test, then run the repair jobs. Compare every counter, index entry and cache against the database and confirm they agree.",
    dep: ["read-replicas", "job-queue", "counter-store", "search-indexer", "cache-invalidation"]
  },
  "extensibility-boundaries": {
    s: "Operators want to change behavior without forking, so the platform must decide which parts are open to plugins, themes and settings and which are fixed for safety and upgradeability.",
    d: "Every extension point is a promise: its name, inputs and behavior must survive upgrades, and everything outside it is free to change. Plugins run with the platform's full privileges, so the line also decides what third-party code can read and break. A narrow, documented surface keeps upgrades safe and limits features; a wide one invites an ecosystem and fragile sites. The decision includes versioning, compatibility checks and what happens when an extension misbehaves.",
    k: ["Small stable API versus open internals: a small API keeps upgrades safe and frustrates ambitious plugins; open internals enable anything and break on release.", "Run plugins in-process versus isolated: in-process is fast and fully trusted; isolation limits damage and costs performance and capability."],
    p: ["Popular plugins depend on internals, so the platform cannot change them without breaking thousands of sites.", "A plugin bypasses the permission model and exposes private data through its own route."],
    v: "Upgrade the core across two versions with a representative set of plugins and themes installed. Confirm those using only documented points keep working, incompatible ones are disabled with a clear message, and the site stays up.",
    dep: ["plugin-api", "event-hooks", "theme-system", "permission-model"]
  },
});
