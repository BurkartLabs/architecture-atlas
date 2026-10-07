// Details for the search engine plate, part 3: duplicates, link graph, quality and spam, knowledge graph.
ATLAS.details("search-engine", {
  "exact-duplicate-detection": {
    s: "Finds documents whose normalized content is byte-for-byte identical by comparing content fingerprints, so only one copy needs indexing and ranking.",
    d: "After boilerplate removal, the main content is normalized and hashed. Documents with equal hashes are placed in one cluster. A lookup against a store of known fingerprints lets intake decide quickly whether a new document duplicates one already seen. Hashing the cleaned content rather than the raw bytes catches pages that differ only in timestamps or ads. It is hard because small differences change the hash, because hash collisions must be handled, and because the choice of what to normalize decides what counts as identical.",
    k: ["Hash the cleaned main content vs the full page: cleaned hashing finds more true duplicates, but depends on extraction being stable between fetches.", "Check at intake vs in batch: intake checks stop duplicates from entering the index, while batch checks see the whole corpus and catch late duplicates."],
    p: ["Two pages share a template with little content and get hashed together after extraction removed everything distinguishing them.", "Extraction changes and every fingerprint changes at once, which looks like the whole web was rewritten."],
    v: "Fetch the same article via two URLs with different ads and timestamps and confirm both land in one cluster, then fetch two different short pages built on the same template and confirm they remain separate.",
    dep: ["boilerplate-removal","raw-document-store","canonical-selection"]
  },
  "near-duplicate-detection": {
    s: "Detects documents that are almost the same, such as a page with a changed date or a lightly edited copy, using similarity fingerprints that tolerate small differences.",
    d: "Documents are reduced to compact signatures such as locality-sensitive hashes of shingles or weighted-feature hashes, so similar texts have signatures that differ in few bits or share many sketch values. Candidate pairs are found by bucketing signatures and then verified with a similarity threshold. The result feeds clustering, canonical selection and query-time dedupe. It is hard because the threshold trades merging genuine variants against keeping copies, because scale requires approximate methods, and because short pages produce unreliable signatures.",
    k: ["Strict threshold vs loose: a strict threshold keeps real variants separate and leaves more copies, while a loose one saves space and risks merging different articles.", "Whole-document signature vs passage-level: whole-document signatures are cheap, while passage-level detection finds partial copying and costs much more."],
    p: ["Product pages that differ only in one model number are merged into a single cluster.", "Short documents such as forum posts collide because there is too little text to fingerprint."],
    v: "Test with labeled pairs of exact copies, lightly edited copies, quotations and unrelated pages, and confirm precision and recall at the chosen threshold meet targets for each class.",
    dep: ["exact-duplicate-detection","text-analysis","syndication-clustering"]
  },
  "canonical-selection": {
    s: "Chooses the one URL that represents each cluster of duplicates and consolidates link and signal credit onto it, following declared hints where they agree with evidence.",
    d: "Evidence includes the publisher's canonical declaration, redirects, sitemap listings, link counts, URL cleanliness, protocol and host preferences, and page quality. The selector weighs these and may override a declaration that contradicts the rest. The chosen canonical receives the cluster's accumulated links and anchor text, and others are folded into it. It is hard because declarations are frequently wrong or abused, because choosing a non-preferred URL harms the publisher, and because the decision must be stable, since flipping canonicals splits signals.",
    k: ["Trust declared canonicals vs infer from signals: trusting is predictable for publishers, while inference resists errors and abuse at the cost of surprising site owners.", "Re-evaluate often vs keep decisions stable: frequent re-evaluation tracks changes, while stability avoids oscillation that dilutes signals."],
    p: ["A wrong canonical declaration points every page of a site at its home page and removes thousands of pages from results.", "The canonical flips between two URLs on alternate crawls and links are split between them."],
    v: "Create a cluster with conflicting hints and confirm the selected canonical matches the documented priority order, that link credit accumulates on it, and that the choice remains stable across repeated runs.",
    dep: ["exact-duplicate-detection","near-duplicate-detection","redirect-and-soft-404-handling","link-graph-store"]
  },
  "redirect-and-soft-404-handling": {
    s: "Follows redirect chains to their destinations, treats permanent and temporary moves differently, and detects error pages that return a success status as if they were content.",
    d: "Redirects are recorded as edges, with chains collapsed and loops detected. Permanent redirects pass signals to the target and eventually drop the old URL from the index, while temporary ones keep the source. Soft 404 classifiers identify pages that say a page is missing, or show an empty search, but return a success status; such pages are excluded. It is hard because redirect semantics are misused at scale, because a redirect to an unrelated page is itself a soft error, and because false positives remove real pages.",
    k: ["Collapse chains at intake vs record each hop: collapsing simplifies the graph, while recording every hop preserves evidence for abuse detection.", "Classify soft 404s by text patterns vs by learned models: patterns are cheap and transparent, while models handle many languages and layouts and can misjudge sparse pages."],
    p: ["A site redirects every missing page to its home page and the home page absorbs signals meant for hundreds of dead URLs.", "A legitimate page with the word 'not found' in its content is classified as a soft error and dropped."],
    v: "Set up a permanent redirect, a temporary redirect, a loop and a success-status error page, and confirm each is handled according to its rule with signals moved only for the permanent redirect.",
    dep: ["crawler-interface","link-graph-store","html-parsing"]
  },
  "syndication-clustering": {
    s: "Groups the original of an article with its republished copies and mirrors, so the engine can credit the original and avoid showing every copy.",
    d: "Copies of news and posts appear on many sites with changed headers and surrounding text. Clustering uses near-duplicate signatures, first-seen times, links from copies to originals and publisher declarations to identify the cluster and estimate the source. Query time grouping shows one representative and may keep a licensed partner visible. It is hard because first-seen time is only as good as crawl order, because the original is not always the best result to show, and because attribution decisions affect revenue of publishers.",
    k: ["Prefer the earliest copy vs the highest quality copy: the earliest copy credits originators, while the highest quality copy may give people a better page and rewards copyists.", "Fold copies in the index vs at query time: folding in the index saves space, while query-time folding can adapt to locale and the person's context."],
    p: ["A scraper that is crawled faster than the original is chosen as the source of the article.", "Folding hides the local-language or licensed copy that a particular reader should have seen."],
    v: "Publish a test article, then mirror and lightly edit it on other hosts, and confirm the cluster picks the original under the documented rule and shows only one member in the result list for a matching query.",
    dep: ["near-duplicate-detection","link-graph-store","canonical-selection"]
  },
  "link-extraction": {
    s: "Pulls every outgoing link from each parsed page with its anchor text, surrounding context and attributes, producing the edges the link graph is built from.",
    d: "While parsing, the extractor records each hyperlink's resolved target URL, visible anchor text, nearby text, position on the page, and attributes such as nofollow or sponsored. Links inside boilerplate, such as navigation and footers, are marked since they carry less editorial meaning. Links created by scripts appear only after rendering. It is hard because links number in dozens or hundreds per page, because relative references must be resolved correctly, and because treating every link as a vote ignores how links were obtained.",
    k: ["Keep every link vs drop boilerplate links: keeping everything preserves information, while dropping boilerplate reduces noise and storage and discards signal about site structure.", "Extract from raw HTML vs rendered pages: raw extraction is cheap, while rendered extraction finds script-created links at a substantial cost."],
    p: ["Resolving relative links against the wrong base URL creates edges to pages that do not exist.", "Link attributes declaring paid or untrusted links are ignored and manipulated links count as votes."],
    v: "Parse a page with absolute, relative, nofollow and script-generated links and confirm the extracted edges, anchors and attributes match the expected set, with the script link present only when rendering is enabled.",
    dep: ["html-parsing","javascript-rendering","boilerplate-removal"]
  },
  "link-graph-store": {
    s: "Stores the web's directed graph of pages and links, with sources and targets mapped to compact identifiers, queryable by in-links and out-links at host and page level.",
    d: "Billions of pages and hundreds of billions of edges are stored sorted and compressed, in both directions, since authority computation needs out-edges while anchor text needs in-edges. Identifiers are assigned densely for compression. Host-level and domain-level graphs are derived for aggregate signals. Edges carry timestamps and attributes, and old edges expire when pages disappear. It is hard because the graph is large and changes continuously, because canonicalization changes node identity, and because adversaries add edges at scale.",
    k: ["Page-level graph vs host-level graph: page-level edges are precise and enormous, while host-level graphs are small and fast and lose detail.", "Rebuild from scratch vs incremental edge updates: rebuilds are simple and consistent, while incremental updates keep the graph fresh and complicate compaction."],
    p: ["Canonical mapping changes and edges point to retired identifiers, quietly losing links.", "Expired pages' edges remain and give authority to dead URLs."],
    v: "Pick a page with known in-links and out-links, query both directions, and confirm counts and targets match the source documents; confirm that after canonical merge, links appear under the canonical identifier.",
    dep: ["link-extraction","distributed-storage","canonical-selection"]
  },
  "anchor-text-aggregation": {
    s: "Collects the text of links pointing at each page, weights it by the linking source's reliability, and stores it as a description of the page written by others.",
    d: "For each target, anchor texts from all in-links are grouped, counted and normalized, with duplicates from one host collapsed so a single site cannot dominate. Weights reflect the source's authority and relevance. The result becomes an index field consulted in retrieval and scoring, often outweighing the page's own text for navigational queries and for pages with little text. It is hard because anchors are a prime manipulation target, because aggregation must drop boilerplate links, and because stale anchors persist after a page changes.",
    k: ["Count all anchors vs one per source host: counting all is simple and manipulable, while one per host resists link farms and underweights large genuine communities.", "Raw anchor strings vs normalized and clustered phrases: raw strings are exact, while clustering reduces noise and merges variants."],
    p: ["A coordinated campaign links a page with a chosen phrase from many sites and the page ranks for it though its content does not support the phrase.", "Generic anchors such as 'click here' are indexed as meaning and match unrelated queries."],
    v: "Link a test page from several sites with a distinctive phrase and confirm the page becomes retrievable by that phrase in proportion to the weights, then link from many pages on one host and confirm the weight does not grow.",
    dep: ["link-graph-store","link-authority-scoring","link-spam-filtering"]
  },
  "link-authority-scoring": {
    s: "Computes a query-independent importance score for each page and host from link structure, using iterative propagation where links from important pages count for more.",
    d: "A random-surfer style iteration distributes each node's score along its out-links until values converge, with damping to handle dead ends and loops. Variants seed trust from reviewed sites and propagate it, or compute topic-specific scores. The score is stored per page and host, and read as a ranking feature. It is hard because the computation is a large iterative graph job, because scores skew toward old, well-linked sites, and because raw link counting is the most gamed signal on the web.",
    k: ["Page-level vs host-level authority: page-level scores distinguish a strong page on a weak site, while host-level scores are stable and cheaper and blur differences.", "Trust seeded from reviewed sites vs pure link flow: seeding resists spam farms and encodes the reviewers' biases, while pure flow is neutral and easier to manipulate."],
    p: ["A link farm exchanges links with a few high-authority pages and inherits enough score to outrank real sources.", "New high-quality pages have no in-links yet and are ranked behind stale ones."],
    v: "Run the computation on a small graph with known structure and compare scores against an independent solver, and confirm that adding a link from a trusted node raises the target's score while links from a known farm do not.",
    dep: ["link-graph-store","link-spam-filtering","graph-compute-jobs"]
  },
  "link-spam-filtering": {
    s: "Identifies and discounts manipulated links, such as link farms, paid links and comment spam, so they do not feed authority or anchor text.",
    d: "Detection uses graph patterns (dense clusters with little outside linking, reciprocal exchange, sudden bursts), link attributes, anchor text distributions that look engineered, and the quality of the source pages. Suspect links are removed from the graph or reduced in weight, and sources can be penalized as a whole. Manually reviewed examples train and evaluate models. It is hard because legitimate communities also form dense clusters, because attackers adapt quickly, and because hard penalties on a wrong judgment harm honest publishers.",
    k: ["Discount suspect links silently vs penalize the linking site: discounting is low risk and gives attackers no feedback, while penalties deter more and can hit innocent sites.", "Graph-structure detection vs content-based detection: graph methods catch farms at scale, while content methods catch single manipulated pages and are costlier."],
    p: ["A legitimate niche community with dense mutual links is flagged and loses authority.", "Attackers learn thresholds from observed outcomes and tune farms to just stay below them."],
    v: "Plant a synthetic link farm and a legitimate dense forum community in a test graph, and confirm the farm's contribution to target scores is removed while the community's is retained.",
    dep: ["link-graph-store","spam-classification","anchor-text-aggregation"]
  },
  "graph-compute-jobs": {
    s: "Distributed batch jobs that run iterative algorithms over the link graph, including authority propagation, host aggregation and connected-component analysis, on a regular schedule.",
    d: "Graph partitions are spread across workers that exchange messages along edges for many supersteps until values converge. Jobs read the graph snapshot, write scores keyed by identifier, and publish them to the feature store. Checkpointing allows recovery from machine loss. Jobs run daily or weekly, with partial recomputation for hot regions. It is hard because stragglers delay every iteration, because partitioning skewed graphs creates hot workers, and because a bad snapshot yields scores that propagate for a whole cycle.",
    k: ["Full recomputation vs incremental updates: full runs are simple and consistent, while incremental updates are fresher and harder to prove correct.", "Synchronous iterations vs asynchronous propagation: synchronous runs are deterministic and wait for the slowest worker, while asynchronous runs converge faster and are harder to reproduce."],
    p: ["A truncated input snapshot gives most pages near-zero authority and the output is published without a sanity check.", "A single very high-degree node overloads one worker and the job runs for days."],
    v: "Run the job on a snapshot with a known answer, kill a worker mid-run, and confirm it recovers from a checkpoint and produces the same scores, then confirm published score distributions pass the sanity checks.",
    dep: ["batch-compute","link-graph-store","distributed-storage","cluster-scheduling"]
  },
  "page-quality-model": {
    s: "Estimates query-independent quality from content, structure, citations and user behavior, favoring original, accurate and useful pages over thin or deceptive ones.",
    d: "A model is trained on human quality ratings of sampled pages and uses features such as depth and originality of text, authorship and sourcing signals, reading experience, ad density, link reputation and aggregated engagement. Output is a score or class stored per document, used in first-stage scoring and in the ranker. It is hard because quality is subjective and domain-dependent, because ratings are expensive and limited, and because publishers will optimize to whatever the model rewards.",
    k: ["Model trained on rater judgments vs behavioral proxies: rater judgments reflect stated guidelines and are costly, while behavior is plentiful and rewards what is clicked.", "Page-level score vs blending with the site-level score: page-level scores fit mixed sites, while the site-level prior stabilizes pages with few signals."],
    p: ["The model learns length as quality and long padded articles outscore concise accurate ones.", "Rater guidelines drift from what users want and the model follows the guidelines."],
    v: "Score a held-out rated sample and confirm agreement with raters at the target level, and confirm a set of known thin and padded pages scores below a set of well-sourced pages of similar topic.",
    dep: ["boilerplate-removal","link-authority-scoring","judged-relevance-sets","click-models","site-level-quality"]
  },
  "site-level-quality": {
    s: "Aggregates page quality and spam evidence into a score for a whole site, so new or sparse pages inherit a reasonable prior and low-quality sites are demoted as a whole.",
    d: "Site scores combine the distribution of page scores, ratings of sampled pages, reputation signals, how a site is cited, and history of policy violations. Subsites or sections can be scored separately when quality differs. The score is used as a prior in ranking and as a gate for trust. It is hard because a bad section can drag down a good site and the reverse, because scores update slowly, and because publishers appeal demotions that depend on aggregates they cannot see.",
    k: ["Site-wide scoring vs section-level scoring: site-wide scores are simple and punish hosted content from third parties, while section-level scoring is fairer and needs structure detection.", "Slow-moving scores vs fast reaction: slow updates are stable against noise, while fast reaction catches compromised sites quickly and can overreact."],
    p: ["A compromised site's injected spam pages drag down the score of the legitimate pages for weeks.", "A site hosting third-party content inherits the worst contributor's penalty across all of it."],
    v: "Compare site scores to rater-assessed site quality on a sample, and verify that cleaning a site of spam raises its score within the documented recovery period.",
    dep: ["page-quality-model","spam-classification","link-authority-scoring"]
  },
  "spam-classification": {
    s: "Classifies pages as spam when they exist to manipulate rankings rather than help readers, using content, link, behavior and hosting features, and removes or demotes them.",
    d: "Spam takes many forms: keyword stuffing, doorway pages, scraped content, hidden text, cloaking and auto-generated pages. Classifiers combine text statistics, markup oddities, link patterns, domain registration and hosting features. Output is a probability used for demotion or exclusion, and confirmed spam feeds back into link filtering. It is hard because spam evolves in response to detection, labeled data ages quickly, and the cost of a false positive is a legitimate publisher's livelihood.",
    k: ["Remove from the index vs demote: removal saves cost and hides all of a spam site, while demotion is reversible and lets a wrong call be tolerated.", "One general classifier vs specialists per spam type: a general model is easy to maintain, while specialists track specific tactics well and multiply the systems to retrain."],
    p: ["A new spam technique evades models trained on last year's spam until labelers find enough examples.", "A classifier flags dense but legitimate pages such as directories or data tables."],
    v: "Evaluate on a freshly labeled sample of recent spam and clean pages, confirm precision and recall meet targets, and confirm flagged pages drop in rankings for their target queries.",
    dep: ["html-parsing","link-spam-filtering","cloaking-detection","adversarial-seo-defenses"]
  },
  "cloaking-detection": {
    s: "Detects sites that show the crawler different content than users see, by comparing fetches made with different identities and by rendering pages.",
    d: "A site can detect the crawler by its address or user agent and serve it keyword-rich text while sending visitors something unrelated. Detection fetches the same URL as a browser-like client from ordinary addresses, renders it, and compares content, links and redirects with the crawler's copy. Large differences trigger review or penalty. It is hard because dynamic pages legitimately vary by person, location and time, because comparison needs a similarity measure that tolerates that variation, and because cloakers can try to detect the checker as well.",
    k: ["Compare against browser-like fetches vs rely on user reports: active comparison finds cloaking systematically, while reports are cheap and reach only visible cases.", "Strict difference threshold vs tolerant threshold: strict thresholds catch subtle cloaking and flag personalized pages, while tolerant ones miss it."],
    p: ["Personalized or geo-targeted pages are flagged as cloaking because the comparison fetch came from a different place.", "The checker is identified by its address range and shown the same clean version as the crawler."],
    v: "Stand up a test site that serves different content by user agent and address, and confirm the system flags it, while a site that varies only in geo-targeted prices and ads is not flagged.",
    dep: ["javascript-rendering","raw-document-store","crawler-interface"]
  },
  "generated-content-detection": {
    s: "Estimates whether text was mass-produced by automation without added value, to demote scaled low-value pages while leaving helpful machine-assisted content alone.",
    d: "Features include statistical regularities of text, repetition across a site, templated structure, missing sourcing, and site-level publishing patterns such as thousands of pages appearing at once. The target is low value at scale rather than any use of automation, and decisions rely on whether content helps readers. Output feeds quality and spam models. It is hard because detectors of text style are unreliable and easily evaded, so site-level behavior and value signals do more work than text-level detection.",
    k: ["Detect by text style vs by publishing patterns and value: style detectors are cheap and unreliable, while pattern and value signals are robust and need site-level aggregation.", "Penalize all scaled content vs only low-value content: blanket policies are simple to state and punish good work, while value-based policies are fair and harder to apply."],
    p: ["Style-based detection flags non-native or formulaic human writing as generated.", "A publisher dumps tens of thousands of auto-generated pages into the index before site-level signals catch up."],
    v: "Measure detector performance on a labeled mix of human, generated low-value and generated useful pages, and confirm the system demotes the scaled low-value group without penalizing the useful group beyond tolerance.",
    dep: ["page-quality-model","spam-classification","site-level-quality"]
  },
  "harmful-content-classification": {
    s: "Labels pages containing adult, violent, hateful, dangerous or deceptive material so safe-search and policy rules can filter or demote them.",
    d: "Multi-label classifiers read text, images and page context, and output category scores with confidence. Labels are stored as document attributes, and the serving path applies them according to safety settings and legal rules for the region. Borderline cases go to human review, and reviewed samples measure accuracy per category and language. It is hard because categories are defined by policy that varies by place, because context decides meaning, and because labels have to cover every language and media type.",
    k: ["Single threshold per category vs context-dependent thresholds: a single threshold is easy to audit, while context-aware thresholds reduce false blocks in news and education.", "Classify at crawl time vs on demand: crawl-time labels are cheap at query time, while on-demand classification adapts to new policies but adds latency."],
    p: ["A policy change requires relabeling billions of documents and for weeks the index holds old labels.", "Coverage is weak in low-resource languages and harmful content in them goes unfiltered."],
    v: "Evaluate each category on a labeled multilingual set, confirm per-language precision and recall meet targets, and confirm a policy change propagates to serving labels within the stated time.",
    dep: ["text-analysis","language-detection","safe-search-filtering"]
  },
  "entity-extraction": {
    s: "Finds mentions of people, places, organizations, products and other named things in document text and marks their type and position.",
    d: "Sequence-labeling or span-detection models run over the cleaned text, using language-specific components and a dictionary of known aliases. Output is a list of mentions with type and confidence. Extraction runs at index time for every document and at query time on short strings with different statistics. It is hard because names are ambiguous with common words, because new entities appear constantly, and because accuracy varies by language and genre.",
    k: ["Dictionary matching vs learned extraction: dictionaries are precise for known names and miss new ones, while learned models find unseen names and add false mentions.", "Extract everything vs only entities in the knowledge graph: extracting everything finds new candidates, while restricting to known entities keeps annotations clean."],
    p: ["Common words that are also brand names are tagged as entities everywhere.", "Boilerplate sections such as footers produce thousands of mentions of the publisher and distort topic signals."],
    v: "Run extraction on a labeled sample in several languages and confirm span-level precision and recall per type meet targets; confirm mentions inside removed boilerplate are not produced.",
    dep: ["text-analysis","boilerplate-removal","language-detection"]
  },
  "entity-resolution": {
    s: "Decides which mentions and records refer to the same real-world entity, and merges or separates them, to give each entity one identity across sources.",
    d: "Candidate pairs are generated by blocking on names and attributes, then scored on name similarity, shared attributes, relationships and context, and clustered into entities. Merging is conservative, since a wrong merge corrupts facts. Merges and splits are recorded so identities remain stable and so that downstream references can be updated. It is hard because the same name belongs to many entities, because sources conflict, and because a merge decision invalidates facts attached to both records.",
    k: ["Conservative merging vs aggressive merging: conservative merging avoids corrupting entities and leaves duplicates, while aggressive merging gives complete entities and mixes in wrong facts.", "Stable identifiers with redirects vs reassigning identifiers: stable identifiers protect references, while reassignment is simpler and breaks downstream data."],
    p: ["Two people with the same name and occupation are merged and the answer box shows a blend of both biographies.", "A split leaves facts attached to the wrong half and nothing flags it."],
    v: "Test on labeled pairs that include same-name distinct entities and different-name same entities, confirm precision and recall meet targets, and confirm identifier redirects work after a merge.",
    dep: ["entity-extraction","knowledge-graph-store","structured-source-ingestion"]
  },
  "relation-extraction": {
    s: "Derives facts such as birth date, capital of or acquired by from text and structured markup, attaching confidence and a source to each.",
    d: "Patterns and models identify a relation between two entity mentions in a sentence, or a value for an entity's attribute on a structured page. Facts are scored by the number and independence of sources, extraction confidence and source reliability, and written as candidate triples awaiting reconciliation. It is hard because language expresses relations in countless ways, because the web contains false claims, and because a fact repeated by copies looks like many confirmations.",
    k: ["Rely on repeated confirmation vs source reliability: repetition is a simple signal that copies can fake, while reliability weighting resists copying and needs reliability estimates.", "High precision extraction vs high recall: high precision keeps the graph clean and grows it slowly, while high recall grows fast and requires reconciliation."],
    p: ["A popular false claim copied across many sites is accepted as established fact.", "Extraction misreads a negation and stores the opposite of what the page says."],
    v: "Extract relations from a labeled sample and confirm precision per relation type; seed a false fact on duplicated pages and confirm it stays below acceptance because the sources are not independent.",
    dep: ["entity-extraction","entity-resolution","near-duplicate-detection"]
  },
  "structured-source-ingestion": {
    s: "Loads curated and licensed structured data, such as reference datasets, markup on pages and publisher feeds, into the knowledge graph with provenance.",
    d: "Sources arrive in different schemas and update cycles. An ingestion layer maps each to the graph's schema, validates types and ranges, attaches provenance and license terms, and writes candidate facts. High-quality curated sources are trusted more than extracted ones and may override them. Licensing limits what can be displayed. It is hard because schemas differ and drift, because sources contradict each other, and because license terms must follow each fact to the point of display.",
    k: ["Strict schema mapping vs flexible ingestion with later cleaning: strict mapping keeps the graph consistent and rejects data that is nearly good, while flexible ingestion gains coverage and hurts quality.", "Prefer curated sources on conflict vs vote across sources: preferring curated data is predictable, while voting corrects curated errors and can overrule correct but minority data."],
    p: ["A source changes its format and a silent parse failure writes empty values over valid facts.", "License terms are dropped during ingestion and restricted data appears in public answers."],
    v: "Ingest a source with a schema change and a license restriction, and confirm the validation rejects the bad batch, existing facts remain unchanged, and restricted facts carry their license flag to the answer service.",
    dep: ["entity-resolution","knowledge-graph-store","distributed-storage"]
  },
  "knowledge-graph-store": {
    s: "Holds entities, attributes and relations with provenance and confidence, supporting lookup by identifier, alias and relation for query understanding and direct answers.",
    d: "Facts are stored as typed triples with source, time and confidence, partitioned for scale and indexed by entity, by alias and by relation. A serving copy is optimized for low-latency lookups by the frontend, with a separate batch copy for analysis. Conflicting facts are reconciled by policy, and updates are versioned. It is hard because the schema must evolve without breaking consumers, because time-varying facts need validity ranges, and because errors surface as authoritative-looking answers.",
    k: ["Fixed schema vs open schema: a fixed schema supports reliable consumers, while an open schema accepts new relations quickly and fragments the data.", "Store one best value vs all candidate values with provenance: one value is fast to serve, while keeping candidates allows correction and audit at the cost of reconciliation at read time."],
    p: ["A stale fact such as a position holder remains after a change because validity time was not recorded.", "A schema change breaks a consumer that assumed a relation always had one value."],
    v: "Look up a set of entities by alias and identifier and confirm the returned facts, provenance and validity match source data; update a fact and confirm the serving copy reflects it within the target time.",
    dep: ["entity-resolution","structured-source-ingestion","relation-extraction","distributed-storage"]
  },
  "document-entity-annotation": {
    s: "Attaches the entities a document is about, with salience scores, to the document's index record, so retrieval and ranking can match on things instead of strings.",
    d: "After extraction and resolution, each document gets a list of entity identifiers with how central each is, based on position, frequency and structure. Annotations are written as index fields and as ranking features, and as entity-to-document postings used to retrieve pages about an entity. It is hard because salience is noisy, because updates to the graph need annotations refreshed across the index, and because over-annotation makes pages match queries they only mention.",
    k: ["Annotate at index build vs at serving time: build-time annotation is cheap at query time, while serving-time annotation always uses the latest graph and costs latency.", "Annotate all mentions vs only salient ones: all mentions help recall and add noise, while salient-only annotation increases precision and misses secondary topics."],
    p: ["After an entity merge the document annotations still point to the old identifiers until the next rebuild.", "A page that merely lists many names is annotated with all of them as topics."],
    v: "For documents about a given entity and documents that only mention it in passing, confirm the salience score separates them, and that an entity query ranks the first group above the second.",
    dep: ["entity-extraction","entity-resolution","knowledge-graph-store","index-build-pipeline"]
  },
});
