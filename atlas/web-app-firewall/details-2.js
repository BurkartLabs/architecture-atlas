// Details for the web application firewall plate, part 2: attack detection, scoring, bots and rate limits.
ATLAS.details("web-app-firewall", {
  "sqli-detection": {
    s: "Detects attempts to change the structure of a database query through user input, by matching SQL syntax, keywords and operators in decoded request fields.",
    d: "Detection runs on normalized values and looks for quote breaking, boolean tautologies, UNION-style clauses, comment terminators, stacked statements, time-delay functions and metadata queries. Early detectors used regular expressions per pattern; newer ones tokenize the input and ask whether it parses as SQL in several dialect contexts. Each approach is checked against field type and position. The difficulty is that ordinary text such as names with apostrophes or support posts about SQL resembles injection, so sensitivity is tuned per field.",
    k: ["Regular-expression signatures vs. tokenization: signatures are simple to write and audit but easy to evade; tokenizing is harder to bypass but needs a maintained grammar per dialect.", "Inspect all fields vs. only likely ones: all fields catches stored and second-order inputs but raises false positives on free text."],
    p: ["Comment and whitespace tricks inside keywords bypass patterns written for the plain form.", "A legitimate search for a phrase containing the word select and a quote is blocked on a content site."],
    v: "Run a corpus of injection payloads with encodings and dialect variants against a test endpoint and confirm they are blocked, then run a corpus of benign names, addresses and prose and confirm none is.",
    dep: ["tokenizer-detection", "operators", "multiple-decoding-defense"]
  },
  "xss-detection": {
    s: "Detects script and markup injected through input that could execute in another user's browser, by matching tags, event handlers, script URLs and encoded forms.",
    d: "The detector examines decoded fields for HTML elements, attribute event handlers, javascript-scheme URLs, expression constructs and DOM sinks, in the contexts where the application might reflect them. Inspecting only requests misses DOM-based and stored cases, so some products also scan responses. The difficulty is that browsers accept an enormous variety of malformed markup, and that sites with rich text editors legitimately submit HTML.",
    k: ["Pattern signatures vs. an HTML-aware tokenizer: signatures are cheap but miss browser parsing quirks; a tokenizer follows browser rules but costs more and needs updating as browsers change.", "Block on request vs. also inspect responses: request-only is cheap and fast; response inspection catches reflected output but adds buffering."],
    p: ["A payload using an unusual attribute or encoding the signature list does not know executes unblocked.", "A rich-text field is blocked for every post, and the team excludes the whole parameter rather than sanitizing."],
    v: "Submit payloads from a standard cross-site scripting test list in query, form, JSON and header positions and confirm each is blocked, while a rich-text field's legitimate formatting tags on an excluded route pass.",
    dep: ["tokenizer-detection", "html-entity-decoding", "operators"]
  },
  "tokenizer-detection": {
    s: "Detection based on lexing the input into tokens and checking the sequence against grammars, instead of matching text patterns, so rewriting the surface form does not hide it.",
    d: "A small lexer reads a value and classifies pieces as keywords, strings, numbers, operators or comments, ignoring spacing and casing. The detector then checks whether the token stream matches a known fingerprint, or whether it parses in a language context. Because it works on structure, many syntactic evasions disappear. It is faster than running hundreds of patterns, but each language needs its own lexer, and dialects differ.",
    k: ["Fingerprint lookup vs. full parser: fingerprints are very fast and deterministic but need a database of known shapes; a parser handles unknown shapes but costs more per value.", "Detect in one language context vs. several: one context is quick; trying several catches injection into varied backends but raises false positives."],
    p: ["The lexer's rules differ slightly from the database's, so a specific syntax is tokenized differently and not detected.", "A bad token fingerprint matches ordinary prose and blocks a whole class of inputs."],
    v: "Feed the same payload with varied case, whitespace and comments to the detector and confirm the same fingerprint results; feed a benign sentence with similar words and confirm no match.",
    dep: ["transformation-functions", "operators"]
  },
  "command-injection-detection": {
    s: "Detects input meant to run operating system commands on the server, by recognizing shell metacharacters, command names, redirections and substitution syntax.",
    d: "Rules look for command separators, pipes, backticks, substitution forms, common utility names, path references to system files and encoded forms, with positions and surrounding context considered. The patterns fit values that the application might pass to a shell, such as filenames or host fields. It is hard because a bare semicolon or ampersand is common in valid text, so rules require extra context, and because shells have many alternate spellings.",
    k: ["Match command names vs. match syntax: names are clear but easy to disguise by quoting or variable use; syntax catches more variants but is noisier.", "Apply everywhere vs. only to fields known to reach a shell: everywhere is simpler but produces false positives; targeting needs application knowledge."],
    p: ["A shell trick such as inserting empty quotes inside a command name goes unmatched.", "Free-text fields containing semicolons and ampersands trigger the rule, and operators turn it off site-wide."],
    v: "Send payloads for each separator and substitution style against a test route, confirm each is blocked, and confirm ordinary prose with punctuation passes.",
    dep: ["operators", "transformation-functions"]
  },
  "path-traversal-detection": {
    s: "Detects attempts to read or write files outside the intended directory, by finding parent-directory sequences and references to sensitive system paths after decoding.",
    d: "After path canonicalization, rules look for dot-dot sequences, absolute paths, drive letters, null bytes and well-known targets such as password or configuration files, in file, path and URL parameters. It also handles encoded and mixed separator forms. It is hard because the dangerous interpretation depends on the backend filesystem and library, and because relative path syntax appears in legitimate parameters such as redirect targets.",
    k: ["Block any parent-directory sequence vs. block only escapes: blocking all is simple and safe but breaks legitimate relative references; computing the resolved path is precise but requires knowing the base.", "Check the path only vs. all parameters: path-only is cheap; all parameters catches file-name arguments."],
    p: ["Double-encoded sequences survive one decoding pass and reach the backend as traversal.", "A mixed-separator form valid on one operating system is not recognized by rules written for the other."],
    v: "Request a harmless known file outside the web root using plain, single, double and mixed-separator encodings and confirm all are blocked, while a normal nested path passes.",
    dep: ["path-canonicalization", "multiple-decoding-defense", "operators"]
  },
  "ssrf-detection": {
    s: "Detects input that makes the server request internal or sensitive addresses, by inspecting URL-valued parameters for private ranges, metadata endpoints and unusual schemes.",
    d: "Rules look at parameters that hold URLs or hostnames and flag loopback and private addresses, link-local metadata services, unusual schemes and alternate numeric address forms such as decimal or hexadecimal. Some products resolve names to catch hostnames that point inward. Detection at the firewall is partial, since the real fetch happens later and DNS can change between check and use. It is a backstop; the application must also restrict outbound requests.",
    k: ["Static address patterns vs. resolving the name: patterns are fast and have no network dependency but miss names that resolve inward; resolving catches them but adds latency and is racy.", "Block by parameter name vs. by value shape: names are cheap but depend on knowing the application; value shape generalizes but is noisier."],
    p: ["An address in decimal form or with unusual notation does not match the dotted patterns.", "A hostname resolves to a public address when checked and an internal one when the application fetches it."],
    v: "Submit URL parameters pointing to loopback, a private address, a metadata address and obfuscated numeric forms to a test route, and confirm each is blocked while a public URL is allowed.",
    dep: ["operators", "targets-and-variables"]
  },
  "template-injection-detection": {
    s: "Detects input that abuses server-side or client-side template syntax, and related object-expression and deserialization payloads, to run code on the server.",
    d: "Rules recognize expression delimiters, object-navigation chains, class-loading references, serialized-object signatures and known exploit gadgets in decoded parameters, headers and bodies. Many of these arise from specific vulnerability disclosures, so they appear first as virtual patches. The difficulty is breadth: the syntaxes vary by framework, and many look like ordinary braces and dollar signs in valid text.",
    k: ["Generic syntax rules vs. specific exploit rules: generic rules catch variants but produce false positives; specific rules are precise but only cover what has been published.", "Inspect headers and bodies vs. parameters only: broad inspection catches injection in headers but costs more."],
    p: ["An exploit payload hidden in a header the rules do not inspect reaches the vulnerable parser.", "Template-like text in a CMS or documentation site triggers generic rules constantly."],
    v: "Send a harmless detectable expression such as an arithmetic template in each input location and confirm it is blocked; confirm normal text containing braces on a documentation route is not.",
    dep: ["managed-ruleset", "targets-and-variables", "operators"]
  },
  "file-upload-inspection": {
    s: "Checks uploaded files for dangerous names, types and content, and optionally scans them for malware, before they reach the application.",
    d: "The multipart parser exposes the file name, declared type and content. Rules reject executable extensions, double extensions, mismatches between the declared type and magic bytes, and embedded script. Some products pass content to a scanning service or sandbox and wait for a verdict. It is hard because files are large, scanning is slow, and attackers use polyglot files valid as two formats.",
    k: ["Inline scan vs. scan after delivery: inline blocks before the file lands but adds latency and needs buffering; after-delivery is fast but the file may already be reachable.", "Allowlist of types vs. blocklist of dangerous types: allowlist is safer but must list every legitimate format; blocklist is easier but incomplete."],
    p: ["A script embedded in an image passes a content-type check and is served later as HTML.", "Large uploads exceed inspection limits and are passed uninspected."],
    v: "Upload a harmless test file with a double extension, a mismatched declared type, and the standard antivirus test string, and confirm each is blocked or quarantined and logged.",
    dep: ["multipart-parser", "body-size-limits", "operators"]
  },
  "anomaly-scoring": {
    s: "Adding up weighted points from every rule that matches a request and deciding on the total, rather than blocking on the first match.",
    d: "Each matching rule contributes points based on its severity to an inbound score, and a separate decision step compares the total with a threshold at the end of the request phase. The engine therefore evaluates all rules and reports every reason. This reduces the effect of any single false positive and lets operators tune sensitivity with one number. The cost is that every request runs the full ruleset, and that an attack matching only one low-severity rule may fall below the threshold.",
    k: ["Anomaly scoring vs. block on first match: scoring tolerates noisy rules and gives full evidence but costs more CPU; first-match is fast and simple but one false positive blocks a customer.", "Single score vs. per-category scores: a single score is easy to tune; per-category scores keep one noisy category from masking others."],
    p: ["A critical attack matches only one rule scored below the threshold and passes.", "Operators raise the threshold to quiet noise and silently disable protection for single-hit attacks."],
    v: "Send requests that trigger one, two and three rules and confirm the logged score equals the sum of the configured severities and that blocking occurs only at the threshold.",
    dep: ["severity-weights", "blocking-thresholds", "rule-phases"]
  },
  "paranoia-levels": {
    s: "Ordered sensitivity tiers that enable progressively stricter and noisier rules, so each application can choose how much false positive risk it will accept.",
    d: "Rules are tagged with the lowest level at which they apply. At level one only high-confidence rules run; at higher levels more aggressive checks are added, catching more sophisticated attacks and also blocking more legitimate input. Operators raise the level gradually while tuning. It is a coarse but understandable control. The difficulty is that moving up a level changes behavior across the board, so exclusions must be reviewed again.",
    k: ["Few coarse levels vs. per-rule sensitivity: levels are easy to explain and operate; per-rule control is precise but unmanageable at scale.", "Detect-only at the higher level vs. block: running a stricter level in detect-only reveals its false positives in advance at the cost of delayed protection."],
    p: ["A team raises the level without re-running tuning and customers are blocked at peak time.", "A blocking level is one setting for the whole site, so a sensitive payment path is no stricter than a static marketing page."],
    v: "Replay a recorded week of benign traffic at each level in detect-only mode, record the number of events per level, and confirm higher levels add detections for a known evasive attack set.",
    dep: ["anomaly-scoring", "false-positive-cost", "managed-ruleset"]
  },
  "severity-weights": {
    s: "The point values assigned to each severity class of rule, which decide how much one match adds to the anomaly score.",
    d: "Typical schemes give critical matches enough points to block alone, and lower classes progressively fewer, so several warnings must accumulate. The weights are configuration, and each rule inherits one from its severity tag. Tuning a weight changes every rule at that severity. The difficulty is calibration: weights are chosen by judgment, and the same pattern may be strong evidence in one field and weak in another.",
    k: ["Few severity classes vs. per-rule weights: classes are simple and consistent; per-rule weights are precise but each ruleset update can change them.", "Single-hit-blocks for critical vs. require accumulation: single-hit stops clear attacks at once; accumulation reduces the effect of one false match."],
    p: ["A weight is changed for one noisy rule's severity class and unintentionally weakens many unrelated rules.", "Custom rules use a severity chosen casually, and it dominates the total."],
    v: "Change a weight in staging and confirm the logged scores for a fixed replay set change by exactly the expected amount for rules of that severity.",
    dep: ["anomaly-scoring", "rule-language"]
  },
  "blocking-thresholds": {
    s: "The score limits at which a request is blocked, one for the request and one for the response, which are the main dials for trading false positives against missed attacks.",
    d: "At the end of a phase the engine compares the accumulated score with the configured threshold and triggers the action if it is met or exceeded. Thresholds can differ per application, route and phase. Lowering a threshold blocks more; raising it passes more. A common path is to start high in detect-only, then lower in steps as exclusions are added. The difficulty is knowing what a threshold change really buys, because scores are not calibrated probabilities.",
    k: ["Low threshold vs. high threshold: low blocks multi-signal attacks but blocks odd users; high is quiet but passes attacks that match a single moderate rule.", "One threshold vs. per-route thresholds: one is simple; per-route reflects risk, with more settings that drift."],
    p: ["The threshold is raised during an incident to stop complaints and never lowered again.", "Request and response thresholds are confused and the response limit never triggers."],
    v: "Replay known attacks and benign traffic across a range of threshold values and plot detection and false positive counts; confirm the configured value sits at the intended point.",
    dep: ["anomaly-scoring", "decision-actions"]
  },
  "inbound-outbound-scoring": {
    s: "Keeping separate scores for what the client sends and for what the application returns, so data leaks and error disclosure are judged on their own.",
    d: "Inbound rules score the request and decide before it reaches the application. Outbound rules score the response for stack traces, database errors, directory listings, source code and sensitive patterns such as card numbers. The decision may redact or replace the response rather than block it. It needs response buffering, which increases memory use and latency, so many deployments enable it only for selected routes.",
    k: ["Inspect responses vs. requests only: response inspection catches leaks and confirms a successful attack but costs buffering and latency; request-only is cheaper and sees nothing that the app returns.", "Block leaking responses vs. mask the sensitive part: blocking is simple but breaks the page; masking preserves it but needs accurate patterns."],
    p: ["Response buffering holds large downloads in memory and exhausts workers.", "A card-number pattern matches order numbers and masks legitimate page content."],
    v: "Make the backend return a test error page with a stack trace and a fake card number and confirm the outbound rule detects it, scores it separately, and applies the configured action.",
    dep: ["anomaly-scoring", "rule-phases", "body-buffering"]
  },
  "decision-actions": {
    s: "What the firewall does once it reaches a verdict: allow, log, block, drop the connection, redirect, challenge, tag the request or delay it.",
    d: "Rules and scoring set an action, and the engine applies the most severe or the last-set one according to policy. Some actions end the transaction, such as a deny with a status code or a connection reset. Others modify it, such as adding a header the application can read to decide further, or sending the client to a challenge. It is hard because actions must compose: a log action, a tag and a deny set by different rules need a clear precedence.",
    k: ["Silent drop vs. explicit block page: dropping gives attackers little feedback but hurts users who cannot tell why; an explicit page helps support and tells attackers they were detected.", "Tag and pass to the application vs. block outright: tagging lets the application decide with more context but trusts it to act."],
    p: ["A tagged request is not acted on by the application, and the attack succeeds.", "Two rules set conflicting actions and the winner depends on rule order."],
    v: "Trigger each action type on a test route and confirm the observed client behavior and the logged action match, including a case with two rules that set different actions.",
    dep: ["rule-phases", "block-response", "audit-log"]
  },
  "block-response": {
    s: "The response sent to a blocked client: status code, body and headers, usually with an identifier the user can quote to support.",
    d: "A blocked client receives a configured status such as 403, a minimal page with an event ID and no rule details, and sometimes a different treatment for API clients, who get a structured error. The page may also explain how to contact support. The design problem is balance: too much detail teaches an attacker what to evade, too little makes legitimate users unable to get help.",
    k: ["Generic body vs. descriptive reason: generic reveals nothing; descriptive helps support but leaks rule logic.", "Same page for all vs. format by client type: one page is simple; format by type keeps API consumers' parsers working."],
    p: ["The block page includes the matched rule and value, so an attacker iterates on the exact signature.", "API clients receive an HTML block page and fail with a confusing parse error."],
    v: "Trigger a block from a browser and from an API client and confirm each receives the intended format, the correct status and an event ID that can be found in the log, and no rule details.",
    dep: ["decision-actions", "correlation-ids"]
  },
  "bot-fingerprinting": {
    s: "Identifying automated clients by the combination of network, TLS, HTTP and browser characteristics that differ from real browsers.",
    d: "Signals include the order and presence of headers, TLS handshake parameters, HTTP/2 settings, and, with a script, browser properties and rendering behavior. The set is hashed or scored and compared with known bot and browser profiles. It is hard because it is an arms race: tools that drive real browsers or copy their handshake look genuine, and legitimate privacy tools and unusual clients look suspicious.",
    k: ["Passive network fingerprints vs. active browser checks: passive costs nothing to the client and cannot be skipped; active catches more but needs script execution and can be bypassed.", "Block on fingerprint vs. only score it: blocking is decisive but fingerprints collide; scoring combines with other signals."],
    p: ["A popular mobile library shares a fingerprint with a known scraper and is blocked en masse.", "Attackers rotate through real browser profiles, and the fingerprint list is stale within weeks."],
    v: "Request a page with a plain scripting client, a headless browser and a real browser, and confirm the three get distinct scores, with the real browser allowed.",
    dep: ["tls-termination", "http-request-parser", "client-reputation"]
  },
  "client-reputation": {
    s: "A score for a client address or identity, built from past behavior and shared intelligence, that makes the same request more or less suspicious.",
    d: "The firewall keeps local history, such as past blocks and challenge failures per address or token, and may consume external feeds of known scanners, proxies and anonymizing networks. The score feeds the anomaly total or selects a stricter policy. It is hard because addresses are shared by many users behind carrier or corporate gateways, and attackers use fresh residential addresses.",
    k: ["Address-keyed vs. session-keyed reputation: addresses work before any session exists but punish shared addresses; sessions are precise but easily reset.", "Local history vs. external feeds: local is accurate for your traffic but slow to learn; feeds are broad but stale and generic."],
    p: ["A shared gateway address is blocked after one user's attack and thousands of users lose access.", "Reputation entries never expire, so a reassigned address stays penalized."],
    v: "Generate blocks from a test address, confirm its score rises and a benign request from it gets stricter handling, then confirm the score decays after the stated interval.",
    dep: ["rate-limit-counters", "client-ip-resolution", "anomaly-scoring"]
  },
  "javascript-challenge": {
    s: "A page that makes the client run a script, solve a puzzle or prove browser behavior before getting the real content, filtering clients that cannot execute code.",
    d: "On suspicion the firewall serves an interstitial that runs a computation or collects browser signals and submits the result, after which it sets a signed token cookie accepted for a limited time. Simple scripted clients fail. It is hard because of users: it breaks non-browser clients, accessibility tools and API calls, and harms experience. Attackers can use real browsers or solving services, so it only raises cost.",
    k: ["Silent challenge vs. visible interactive challenge: silent is invisible to users but weaker; interactive stops more bots and annoys people.", "Short token lifetime vs. long: short limits reuse of a solved token but repeats the challenge; long is smooth but lets a solved token be shared."],
    p: ["A challenge returned to an API request breaks an integration, because the client cannot run script.", "The token is not bound to the client, so one solved token is distributed to a bot farm."],
    v: "Request a protected page with a simple HTTP client and confirm it receives the challenge and fails; then load it in a real browser and confirm the token is issued and accepted for the configured lifetime.",
    dep: ["bot-fingerprinting", "decision-actions", "behavioral-analysis"]
  },
  "behavioral-analysis": {
    s: "Judging whether a client is automated from what it does over time: request pacing, navigation paths, input timing and the sequence of calls.",
    d: "The firewall or a connected service tracks sessions and extracts features such as request intervals, ratio of pages to assets, order of visited URLs and, with a script, mouse and keyboard timing. A model or rules score the session. It finds bots that copy browser fingerprints perfectly. It is hard because it needs state across requests, latency for the decision means early requests pass, and it requires training data that reflects your own users.",
    k: ["Per-request decision vs. session-level decision: per-request blocks instantly but sees little; session-level sees patterns but allows early requests through.", "Rules over features vs. trained models: rules are explainable and tunable; models find subtle patterns but are opaque and drift."],
    p: ["A legitimate power user exporting data at machine speed is blocked.", "Bots slow down to match human pacing after the thresholds are discovered by probing."],
    v: "Replay a recorded human session and an automated crawl of the same site through the analyzer and confirm the crawl is scored as automated and the human session is not.",
    dep: ["rate-limit-counters", "client-reputation", "bot-fingerprinting"]
  },
  "rate-limiting": {
    s: "Restricting how many requests a client may make in a time window, per route or per account, to stop scraping, brute force and resource exhaustion.",
    d: "Rules choose a key (address, session, account, API key, header) and a limit over a window, and an action such as a delay, a 429 response or a challenge. Algorithms include fixed windows, sliding windows and token buckets, which differ in burst behavior. Limits are set per route, for example tight on login and loose on static files. It is hard because the key is unreliable, and because sensible values come from measured legitimate peaks.",
    k: ["Token bucket vs. fixed window: a bucket allows controlled bursts and is smooth; a fixed window is simpler but allows double the rate at a boundary.", "Per-address key vs. per-account key: address limits work before authentication but punish shared networks; account limits are fair but only apply after login."],
    p: ["A limit keyed on the proxy's address in a forwarded header applies to everyone behind the proxy.", "A limit tuned in a quiet period blocks legitimate users during a sale."],
    v: "Send requests from one test client above the configured rate and confirm the first over-limit request gets the configured response, the counter resets after the window, and a second client is unaffected.",
    dep: ["rate-limit-counters", "client-ip-resolution", "decision-actions"]
  },
  "rate-limit-counters": {
    s: "The storage that counts events per key and time window, kept locally in each node or shared across a fleet.",
    d: "Counters live in worker memory, in a shared memory segment on one host, or in a networked in-memory store used by all nodes. Local counters are fast but each node sees only part of the traffic, so the real limit is multiplied by the node count. Shared counters are accurate but add a network call and a dependency. Entries expire by window and must be bounded in memory, since attackers can create unlimited keys.",
    k: ["Local counters vs. shared counters: local adds no latency and no dependency but is inaccurate across nodes; shared is exact and adds latency and a failure point.", "Exact counts vs. approximate structures: exact is precise but uses memory per key; approximate sketches bound memory and overcount slightly."],
    p: ["An attacker generates millions of distinct keys and fills counter memory, evicting real limits.", "The shared store is slow, and every request waits on it, turning an outage there into an outage everywhere."],
    v: "Send requests across several nodes with a limit of N and confirm the total allowed is close to N for shared counters, and quantify the multiplier for local counters.",
    dep: ["worker-concurrency", "failure-posture"]
  },
  "credential-stuffing-defense": {
    s: "Detecting and slowing automated login attempts that use leaked username and password pairs, by looking at login failure patterns across many accounts and sources.",
    d: "Signals include many failures from a source or distributed across sources, a high ratio of distinct usernames to attempts, logins using known leaked credentials, and bot fingerprints on login routes. The firewall applies stricter limits and challenges only on login and password-reset paths. It is hard because the attack is deliberately distributed and slow, each attempt is valid-looking, and blocking by account lets attackers lock out real users.",
    k: ["Block by source vs. lock account: source blocks do not lock users out but are evaded by rotating addresses; account locks stop the attack but become a denial-of-service tool.", "Check passwords against leaked lists at the firewall vs. in the application: firewall check protects without changes but sees passwords in the clear and needs data handling care."],
    p: ["Attackers use thousands of residential addresses with one attempt each, and per-address limits never trigger.", "Account lockout is used by an attacker to lock out a competitor's users."],
    v: "Simulate a distributed login attack using many source addresses and a list of distinct usernames against a test login route, and confirm the defense triggers on the distinct-usernames signal and legitimate logins still succeed.",
    dep: ["rate-limiting", "bot-fingerprinting", "behavioral-analysis"]
  },
  "api-schema-validation": {
    s: "Checking requests against a declared API description, rejecting unknown paths, methods, fields, types and out-of-range values before they reach the service.",
    d: "The firewall loads a machine-readable API specification and validates each call: the route exists, the method is allowed, required fields are present, types and lengths match, and extra fields are disallowed. This is a positive security model, so it catches attacks no signature knows. It is hard because specifications drift from the real service, and because a strict model needs updating on every deployment.",
    k: ["Strict reject vs. log unknown: strict blocks unexpected calls and breaks clients when the spec lags; logging is safe but not protective.", "Schema validation in the firewall vs. in the service: the firewall protects services that cannot validate themselves but duplicates logic and may differ from it."],
    p: ["The deployed service adds a field but the schema is not updated, and legitimate requests are rejected.", "The schema allows broad types such as free strings, so validation passes injected values."],
    v: "Send requests with an unknown field, a wrong type, an out-of-range value and an undeclared route to a test API, and confirm each is rejected with a logged reason while a conforming request passes.",
    dep: ["json-body-parser", "policy-model", "targets-and-variables"]
  },
});
