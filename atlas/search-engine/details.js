// Details for the search engine plate, part 1: result page and query understanding.
ATLAS.details("search-engine", {
  "result-page-assembly": {
    s: "Combines ranked results, snippets, answer boxes, verticals and ads into one response, applying layout rules and deadlines so a slow part degrades the page instead of delaying it.",
    d: "A page builder receives the ranked list, then calls snippet, answer, vertical and suggestion services in parallel with per-call deadlines. It applies layout templates, deduplicates what several sources returned, and records which components appeared for later logging. Components that miss their deadline are dropped and the page ships without them. It is hard because the page is the sum of many independently owned services, each with its own failure modes, and the logged page must exactly match what the person saw or training data is wrong.",
    k: ["Wait for every component vs ship at a deadline: waiting gives complete pages but lets the slowest service set latency; deadlines keep pages fast and sometimes bare.", "One central builder vs per-component rendering: central control keeps layout consistent, but every new feature needs a change in the shared builder."],
    p: ["A component that times out only under load silently disappears from pages at peak, and quality drops without any error.", "The impression log is written from the intended page rather than the delivered one, so click models learn from results nobody saw."],
    v: "Inject a two-second delay into the snippet service and confirm the page still returns within its deadline, with results shown without snippets and the impression log recording the missing component.",
    dep: ["snippet-generation","vertical-blending","fan-out-and-aggregation","title-and-link-display"]
  },
  "vertical-blending": {
    s: "Decides when and where to insert results from specialized collections such as images, news, video, maps or products among the ordinary web results.",
    d: "Each vertical has its own index and its own relevance model. A blender receives a score or trigger from each vertical, estimates how likely the query is to want that content, and chooses a slot on the page or declines. Scores from different systems are not directly comparable, so the blender calibrates them against click and satisfaction data. It is hard because insertion changes the value of the rest of the page, because verticals compete for the top slots, and because a trigger tuned on one query class misfires on neighbors.",
    k: ["Learned cross-vertical calibration vs hand-set slot rules: learning adapts to query classes automatically, but is harder to debug and to override for a specific launch.", "Blend at the page level vs interleave at the result level: page-level slots are predictable, while result-level interleaving can place a vertical item exactly where it belongs at the cost of simpler layouts."],
    p: ["A vertical that over-triggers on ambiguous queries pushes good web results below the fold and nobody notices until engagement falls.", "Vertical scores drift after a model update and silently change blend rates for millions of queries."],
    v: "Run a labeled set of queries known to want images, news or maps and confirm the blender inserts the right vertical at the right slot for each, while leaving navigational queries untouched.",
    dep: ["intent-classification","learned-ranking-models","result-page-assembly"]
  },
  "snippet-generation": {
    s: "Selects the passages of a result document that best show why it matches the query, highlighting query terms and fitting the text to a display length.",
    d: "For each result shown, the snippet service fetches the stored document text from the document store, splits it into passages and scores them against the query terms, their synonyms and proximity. It prefers a passage that reads as a sentence, may use the page's own description field when it matches the query well, and trims to the display width. It is hard because it adds a fetch per result on the critical path, because stored text may be stale against the live page, and because a snippet that misleads about the content is a quality defect.",
    k: ["Query-biased passages vs a fixed page summary: query-biased text shows why the page matched, but costs a document fetch per result and changes for each query.", "Extractive passages vs generated text: extractive snippets are faithful to the source, while generated summaries read better but can state things the page never said."],
    p: ["Snippets built from stale stored text show content that the live page removed, which looks like a bug or a policy violation.", "Highlighting expanded synonyms with no marker confuses people who wonder why the shown words differ from what they typed."],
    v: "Search for a distinctive phrase from the middle of a long page and confirm the snippet contains that passage with the terms highlighted, then search for a different phrase from the same page and confirm the snippet changes.",
    dep: ["document-store-servers","text-analysis","query-parsing"]
  },
  "title-and-link-display": {
    s: "Chooses the title and the displayed address shown for each result, from the page title, headings, anchors and structured data, so the label matches what the page is.",
    d: "The page's own title element is often missing, generic, stuffed with keywords or identical across a site. The selector scores candidates from the title, the top heading, anchor text pointing to the page and the site name, and picks one, truncating to the display width. It also shortens the URL into a readable path and attaches site names or icons. It is hard because rewriting the publisher's title is controversial, and because a title chosen for one query can mislead for another.",
    k: ["Publisher title as written vs rewritten title: faithful titles respect authors and avoid surprises, while rewriting rescues pages with empty or spammy titles.", "One title per page vs a query-dependent title: stable titles are predictable for site owners, while per-query titles can show the most relevant heading."],
    p: ["A rewrite pulls a heading out of context and the result appears to claim something the page does not.", "Displaying the canonical URL instead of the one a person can actually open produces confusion when the two differ."],
    v: "Index pages with empty, duplicated and keyword-stuffed title elements and confirm each result shows a distinct, readable title taken from the best available source.",
    dep: ["html-parsing","anchor-text-aggregation","canonical-selection"]
  },
  "safe-search-filtering": {
    s: "Hides or demotes explicit and harmful results for people who choose it, are minors or are in a restricted locale, using document classifiers and query intent.",
    d: "Classifiers label documents offline with categories such as adult, violent or graphic, stored as index-time attributes. At query time a setting from the account, the device, the network or the locale selects a policy: filter, blur, demote or allow. The query is also classified, because an innocuous document can be the best answer to an explicit query, and the reverse. It is hard because the line is cultural and contextual, because labels must be fresh, and because both over-blocking medical or educational content and under-blocking are real failures.",
    k: ["Filter at the index level vs at result assembly: index-level filtering is cheapest, but rules that vary by locale and setting need result-time control.", "Strict default for everyone vs opt-in strictness: a strict default protects unknowing users, while an opt-in default respects adult intent and reduces false blocks."],
    p: ["A new site that clones popular content with explicit material inserted passes through before the classifier has seen it.", "Over-blocking of health, art or news queries is invisible in aggregate metrics because affected queries are rare."],
    v: "Run a held-out set of explicit and borderline queries with filtering on and off, and confirm explicit documents disappear when on, while medical and educational documents on the borderline set remain.",
    dep: ["harmful-content-classification","intent-classification","personalization-and-locale"]
  },
  "personalization-and-locale": {
    s: "Adjusts results using the person's location, language, device and, where allowed, history, so the same words return the answer that fits this person.",
    d: "Locale features come from the request: language settings, approximate location, device type and region of the serving site. They enter as query context and as ranking features, favoring local businesses and pages in the right language. History-based personalization adds recent queries and topic interests from the account, held on the serving path as a compact profile. It is hard because small gains must be weighed against privacy and filter-bubble concerns, because location can be wrong, and because personalized results cannot be cached and are hard to reproduce for debugging.",
    k: ["Coarse locale only vs per-user history: locale is cacheable and low-risk, while history gains relevance on ambiguous queries at the price of privacy exposure and uncacheable results.", "Personalize in ranking features vs as a late re-rank: features integrate with the model, while a late step is simpler to switch off and audit."],
    p: ["Location inferred from a shared network address sends a person to results for the wrong city.", "A debugging session cannot reproduce a complaint because the profile that shaped the results is not recorded."],
    v: "Issue the same query from two regions and two language settings and confirm the result sets differ in the expected direction, then repeat with personalization disabled and confirm identical results.",
    dep: ["query-frontend","regional-routing","privacy-and-retention"]
  },
  "suggestions-and-related": {
    s: "Offers related searches and follow-up questions after a result page is shown, mined from query reformulations and co-searched topics.",
    d: "Related queries come from sessions: when people issue one query and then another, the second becomes a candidate for the first. Candidates are ranked by frequency, by how often the refinement led to a satisfied click, and by diversity, then filtered for safety and for sensitive topics. Question-style follow-ups can also be derived from document content. It is hard because session logs are sparse for rare queries, because suggestions can leak private searches if thresholds are low, and because suggested text must itself pass policy review.",
    k: ["Mine from sessions vs generate from content: session mining reflects real intent and needs volume, while content generation covers rare queries and risks inventing odd phrasing.", "Minimum frequency thresholds vs coverage: higher thresholds protect privacy and quality, at the cost of no suggestions on the long tail."],
    p: ["A suggestion derived from a handful of users exposes one person's sensitive search.", "Suggestions that echo offensive queries appear because raw frequency is optimized without a policy filter."],
    v: "For a set of common queries confirm the related searches shown match refinements present in the logs above the privacy threshold, and confirm no suggestion appears for queries below it.",
    dep: ["query-log-pipeline","safe-search-filtering","privacy-and-retention"]
  },
  "query-parsing": {
    s: "Turns the raw query string into a structured form: terms, quoted phrases, operators, site and date restrictions, and the language of the text.",
    d: "The parser tokenizes with the same rules the index used, recognizes quotes, exclusion signs, boolean operators and restriction syntax, and produces a tree of required, optional and excluded parts. It must tolerate malformed input, because most queries are not written for a parser. It hands the tree to normalization, rewriting and planning. It is hard because tokenization differs across scripts, because operators have to be distinguished from ordinary punctuation, and because any mismatch with index-time tokenization silently loses matches.",
    k: ["Strict operator grammar vs lenient best-effort parsing: strict grammars are predictable for power users, while lenient parsing serves the majority who never read documentation.", "Share the tokenizer with indexing vs a separate query tokenizer: sharing prevents mismatch, but couples query-side changes to a reindex."],
    p: ["Treating a hyphen in a product code as an exclusion operator removes every matching document.", "A tokenizer change on the query side only makes previously working queries return nothing for one script."],
    v: "Feed a corpus of queries containing quotes, hyphens, operators and mixed scripts, and compare the parse trees against expected output; confirm the same strings tokenize identically at index and query time.",
    dep: ["text-analysis"]
  },
  "query-normalization": {
    s: "Applies the same case folding, accent handling, Unicode normalization and punctuation rules to queries that were applied to documents, so equivalent text matches.",
    d: "Queries arrive in many Unicode forms: composed and decomposed accents, full-width and half-width characters, mixed case, stray whitespace and emoji. Normalization maps them to the canonical form used by the index, and may also segment scripts without spaces. Some languages need stemming or lemmatization applied consistently on both sides. It is hard because normalization is lossy: removing accents merges distinct words in some languages, and aggressive stemming creates false matches that the ranker has to undo.",
    k: ["Aggressive folding vs preserving distinctions: aggressive folding increases recall and tolerates typing without accents, but merges words that differ in meaning.", "Normalize at query time vs store variants in the index: query-time normalization keeps the index small, while stored variants allow exact-form boosts."],
    p: ["Index and query pipelines use different Unicode versions and some characters never match.", "Folding case in a language where case distinguishes words returns pages about the wrong thing."],
    v: "Search each of composed, decomposed and unaccented spellings of a word that appears in indexed documents and confirm all three retrieve it, while a known distinct word does not match.",
    dep: ["query-parsing","text-analysis"]
  },
  "spelling-correction": {
    s: "Detects likely misspellings in a query and either searches the corrected form, suggests it, or leaves the query alone, using query logs and a language model of what people search.",
    d: "Candidates are generated by edit distance and phonetic similarity against a vocabulary built from logs and documents, then scored by how often the corrected query is searched, how well it fits the surrounding words, and whether the original is itself a valid query. The decision is graded: auto-correct when confidence is high, show a suggestion when moderate, otherwise do nothing. It is hard because names, new products and code strings look like typos, and because a wrong auto-correction makes the intended result unreachable.",
    k: ["Auto-correct vs suggest only: auto-correction saves a step when right, while a suggestion is safer for ambiguous strings but costs a click on every typo.", "Log-driven vocabulary vs dictionary: logs capture new names and slang quickly, but also learn common misspellings as if they were valid."],
    p: ["A new brand name is auto-corrected to a common word until the vocabulary catches up, hiding the right result.", "Correction runs before language detection and mangles queries in a language the corrector does not know."],
    v: "Submit a labeled set of misspelled, correctly spelled rare and newly coined queries and confirm misspellings are corrected, valid rare queries are untouched, and new names are not auto-corrected after they appear in logs.",
    dep: ["query-normalization","query-log-pipeline"]
  },
  "query-rewriting": {
    s: "Reformulates a query into one or more variants likely to retrieve better results: dropping filler words, restoring omitted terms, fixing compounds and adding terms from the session.",
    d: "Rewrites come from rules, from mined pairs of queries that users reformulated into each other with success, and from models that map queries to better retrieval forms. Each rewrite carries a confidence and a flag for whether to replace the original or run alongside it. The output goes into the query plan as extra clauses with lower weights. It is hard because a rewrite that helps most queries can destroy a specific one, and because compounding rewrites drift away from what the person typed.",
    k: ["Replace the original vs run rewrites alongside it: replacement is cheaper and cleaner, while parallel clauses protect against bad rewrites at the cost of more retrieval work.", "Mined from logs vs model-generated: mined pairs are grounded in real success, while models generalize to rare queries and can hallucinate intent."],
    p: ["A rewrite dropped a word that was essential, such as a negation or a model number, and returned confident wrong results.", "Rewrite pairs mined from sessions inherit the biases of past ranking and reinforce them."],
    v: "Run a judged query set with rewriting enabled and disabled and confirm the relevance metric improves overall, then inspect the worst-regressing queries to confirm none lost an essential term.",
    dep: ["query-normalization","synonym-expansion","query-log-pipeline","intent-classification"]
  },
  "synonym-expansion": {
    s: "Adds equivalent and related terms to a query, such as abbreviations, alternate names and plural forms, with weights reflecting how safe each equivalence is in context.",
    d: "Synonym pairs are mined from anchor text, query reformulations, click co-occurrence and embedding similarity, then scored by context. The same word pair can be equivalent in one domain and different in another, so expansion is conditioned on neighboring terms and on intent. Expanded terms join the query plan as optional clauses with discounted weights. It is hard because wrong equivalences are subtle and domain-specific, and because every expanded term widens retrieval and cost.",
    k: ["Contextual weights vs global synonym tables: context avoids false equivalences, while global tables are simpler to audit and update by hand.", "Expand at query time vs index time: query-time expansion is flexible and cheap to change, while index-time expansion shifts cost to build and cannot be revised without reindexing."],
    p: ["An abbreviation expanded for a general audience matches a different meaning in a specialized query.", "Synonym lists grow by accretion and nobody can say why a pair is present or whether it still helps."],
    v: "For a judged set including ambiguous abbreviations confirm that expansion improves recall on the intended sense and that the unintended sense does not appear in the top results.",
    dep: ["query-parsing","query-log-pipeline","anchor-text-aggregation"]
  },
  "intent-classification": {
    s: "Labels each query with what the person is trying to do, such as navigate to a site, find information, shop, find a place or get news, plus its language, freshness need and sensitivity.",
    d: "A classifier uses the text, query-log statistics such as which result types people click for this query, the session so far, and entity links. It outputs a distribution over intents and attributes: whether recent results are wanted, whether the query is local, whether it is a question, and whether it touches a sensitive topic. These drive vertical triggering, freshness weighting, ranking model selection and safe-search policy. It is hard because queries are short and ambiguous, and because intent shifts over time with events.",
    k: ["Soft intent distribution vs a single label: distributions let downstream stages hedge on ambiguity, while a single label is simpler to use and to evaluate.", "Per-query statistics vs text-only models: statistics are accurate for head queries but empty for new ones, so text models are needed for the tail."],
    p: ["A breaking event changes what a query means and the stored intent statistics lag by days.", "A misclassified sensitive query receives a casual treatment, such as unfiltered suggestions."],
    v: "Evaluate on a labeled query set covering navigational, local, news and informational cases, check the confusion matrix per class, and confirm a simulated breaking-news query gets its freshness flag within the freshness target.",
    dep: ["query-normalization","query-entity-linking","click-models","query-log-pipeline"]
  },
  "query-entity-linking": {
    s: "Recognizes spans of the query that name known entities and links each to a knowledge graph node, resolving ambiguity using context and popularity.",
    d: "The linker generates candidate entities for each span from an alias dictionary, then ranks them by prior popularity, string match and compatibility with the other words and with the person's context. The linked entities feed intent classification, answer-box triggering and entity-aware retrieval. It is hard because queries give almost no context, because aliases collide across thousands of entities, and because popularity priors favor famous entities and bury the one the person meant.",
    k: ["Prior popularity vs contextual disambiguation: priors are right most of the time and cheap, while contextual models fix the minority of cases that matter most to the person asking.", "Link eagerly vs link only when confident: eager linking powers more answers, but a wrong link leads to a confidently wrong answer box."],
    p: ["A famous entity is linked for a query about a lesser-known one with the same name.", "New entities missing from the alias dictionary are linked to a near-match with similar spelling."],
    v: "Run labeled ambiguous queries such as a name shared by a person, a place and a product with differing context words, and confirm each links to the intended node or declines to link when context is insufficient.",
    dep: ["knowledge-graph-store","query-normalization"]
  },
  "autocomplete-service": {
    s: "Predicts the rest of the query as the person types, returning ranked completions within tens of milliseconds from logged queries filtered for policy and privacy.",
    d: "Completions are stored in a prefix structure mapping partial strings to the most likely full queries, with scores that combine frequency, recency, locale and personal history. Because requests arrive on every keystroke, the service is optimized for latency and caching, and updated often to catch trending queries. Candidates pass a policy filter for offensive, private or dangerous content. It is hard because the volume of requests is far above that of searches, and because completions shape what people search, a feedback loop.",
    k: ["Frequency ranking vs recency-weighted ranking: frequency is stable, while recency catches events but amplifies short-lived spikes and manipulation.", "Server-side completion with caching vs on-device models: server completions use fresh global data, while on-device models avoid sending each keystroke at the cost of staleness."],
    p: ["Coordinated bot queries push an offensive completion into the top slot before filters catch it.", "A rare query containing a person's name or number is suggested to others because the frequency threshold was too low."],
    v: "Type prefixes of known trending, common and filtered queries, and confirm the trending one appears within the freshness target, the common one appears first, and the filtered one never appears; confirm latency at the 99th percentile.",
    dep: ["query-log-pipeline","safe-search-filtering","privacy-and-retention","result-cache"]
  },
  "query-plan-construction": {
    s: "Builds the final retrieval request from the parsed, corrected and expanded query: required, optional and excluded terms with weights, filters, tier choices and a budget.",
    d: "The planner combines the original terms, rewrites, synonyms and entity annotations into a weighted expression, attaches filters such as language, locale, safe-search and date, selects which index tiers and which retrieval methods to use, and sets limits on candidates and time. The plan is the contract with the serving tier, so it is serialized compactly and fanned out. It is hard because the plan trades recall against cost per query, and because bugs here silently change what the whole system retrieves.",
    k: ["Rich plan evaluated on shards vs simple plan with later filtering: rich plans prune early and save work, but make the shard-side evaluator complex and harder to keep consistent across versions.", "One plan for all queries vs plans by query class: classes allow tuned budgets for head and tail queries, at the cost of more configuration to maintain."],
    p: ["A planner release assumes a feature that old shard versions do not yet support, and part of the fleet returns errors during rollout.", "Optional clauses accumulate until each query costs several times more than before without improving results."],
    v: "Log the serialized plan for a sample of queries, replay it against a fixed index snapshot, and confirm results match the expected set; confirm plan cost stays within the per-query budget for the heaviest class.",
    dep: ["query-parsing","query-rewriting","synonym-expansion","intent-classification","index-tier-routing"]
  },
});
