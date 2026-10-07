// Details for the web application firewall plate, part 3: rule engine, managed rulesets, normalization.
ATLAS.details("web-app-firewall", {
  "rule-language": {
    s: "The declarative syntax in which rules are written: what to look at, how to test it, which transformations to apply first, and what to do on a match.",
    d: "A rule names one or more targets, an operator with an argument, optional transformations, and actions and metadata such as id, phase, severity, tags and message. Languages are either directive-based text or structured documents, and most allow conditions over several fields. A good language is readable by reviewers and strict enough to validate before deployment. It is hard because small syntax choices carry big semantics, such as what happens when a target is missing.",
    k: ["Purpose-built rule language vs. a general scripting language: a restricted language can be analyzed for cost and safety; scripting is flexible but can hang or escape.", "Text directives vs. structured documents: text is compact and familiar to practitioners; structured data is easier to generate and validate with tools."],
    p: ["A missing target is treated as an empty string and the rule silently never matches.", "Rule ids are reused or omitted, so exclusions and reports refer to the wrong rule."],
    v: "Load a rule file with a deliberate syntax error and a deliberate unknown target, and confirm the loader rejects it with a line-specific message instead of loading a partial ruleset.",
    dep: ["targets-and-variables", "operators", "transformation-functions"]
  },
  "rule-phases": {
    s: "The ordered stages of a transaction, such as request headers, request body, response headers and response body, at which rules run once their input is available.",
    d: "Rules are assigned a phase, and the engine runs them as the data arrives: header rules first, which can block before the body is read, then body rules once buffered, then response rules, then logging. Splitting by phase lets cheap early checks stop requests before expensive parsing. It is hard because a rule needs fields that exist only in a later phase, and because decisions made in an early phase cannot see later evidence.",
    k: ["Few coarse phases vs. fine-grained streaming stages: coarse phases are simple to reason about; streaming stages reduce latency and memory but complicate state and rule writing.", "Decide at end of request phase vs. decide on first match: ending the phase allows scoring across all rules; early exit saves work."],
    p: ["A rule placed in the header phase references body data that has not been parsed yet and never fires.", "Early allow decisions skip later phases and let a body attack through."],
    v: "Place a header rule and a body rule on the same test request and confirm from the trace that the header rule fires before the body is buffered and the body rule fires after.",
    dep: ["rule-language", "http-request-parser", "body-buffering"]
  },
  "targets-and-variables": {
    s: "The named parts of a transaction a rule can inspect: request line, headers, cookies, query and body parameters, uploaded files, response data and engine state.",
    d: "The engine exposes collections, for example all argument names, argument values, cookie values and headers, and individual members selected by name or pattern. It also provides derived values such as the client address, matched-rule counts and scores, and variables rules can set for later rules. Parsers fill these collections, so what is exposed depends on content type handling. Selecting targets precisely is both a performance and a correctness issue.",
    k: ["Inspect names as well as values vs. values only: names catch payloads in keys but double the work.", "Wide collections vs. specific members: wide covers new parameters automatically but is noisy; specific is exact and requires maintenance."],
    p: ["Rules inspect argument values but not argument names, so a payload placed in a JSON key is never seen.", "A rule targets a header the proxy overwrites, so it examines a value the client did not send."],
    v: "Send a payload in a parameter name, value, cookie, header and JSON key in turn, and confirm from the trace which collections each rule examined and that all positions are covered.",
    dep: ["http-request-parser", "form-and-query-parser", "json-body-parser"]
  },
  "operators": {
    s: "The tests a rule applies to a target: regular expression match, phrase match, equality, comparison, length, address range, and detectors such as SQL or script recognizers.",
    d: "An operator takes the transformed target value and an argument and returns match or no match, optionally capturing text for later rules or logs. Phrase operators use a multi-pattern matcher; regular expression operators use a backtracking or automaton engine; detector operators call specialized libraries. Operator choice drives cost. It is hard because an expensive operator on a wide target set is evaluated for every request, and some operators have inputs that cause explosive running time.",
    k: ["Regular expressions vs. phrase lists: expressions are expressive but costly and risky; phrase lists are fast and bounded but cannot express structure.", "Negated operators vs. positive checks: negation (not in the allowed set) is powerful for positive security but easy to get wrong when a field is missing."],
    p: ["A regular expression with nested repetition takes seconds on a crafted value and stalls the worker.", "A negated match fires on every request lacking an optional header."],
    v: "Time each operator on benign and worst-case inputs of the maximum allowed length and confirm each stays under its per-rule time budget.",
    dep: ["multi-pattern-matcher", "regex-timeout-guards"]
  },
  "transformation-functions": {
    s: "Functions applied to a target before the operator runs, such as decode, lowercase, remove whitespace, strip comments or normalize paths, so that rules match canonical text.",
    d: "A rule lists transformations in order and the engine applies them to a copy of the value, caching results when several rules use the same chain. They make one rule cover many encodings. Order matters: decoding before lowercasing differs from the reverse. The difficulty is that every transformation must mirror what the backend does, and that transformed values cost CPU and memory on every rule that asks for them.",
    k: ["Per-rule transformation chains vs. normalize once up front: per-rule is flexible and explicit; once-up-front is cheaper and consistent but cannot serve a rule needing the raw value.", "Cache transformed values vs. recompute: caching saves CPU but holds copies in memory."],
    p: ["A chain applies a decode step once and the payload is encoded twice.", "A transformation the backend does not apply makes the rule match values the application treats differently."],
    v: "Pass a value through each chain with known inputs and compare the output with the expected canonical text, then check that the same chain produces the same text as the backend's own decoding.",
    dep: ["url-decoding", "multiple-decoding-defense", "unicode-normalization"]
  },
  "rule-chaining": {
    s: "Linking rules so a later rule runs only if an earlier one matched, allowing a verdict that depends on several conditions together.",
    d: "A chained rule set expresses AND: all links must match for the action to fire, and each link can inspect a different target. Chains express rules such as a particular path with a particular method and a suspicious parameter. Some engines also support flags and counters that carry state to later rules. It is hard because chains are harder to read, cost depends on short-circuit order, and a bug in one link silently disables the whole rule.",
    k: ["Cheap conditions first vs. most selective first: cheap-first saves CPU; selective-first reduces later evaluation but may cost more up front.", "Chains vs. flags and later rules: chains are self-contained; flags are reusable across many rules but spread logic around."],
    p: ["The action is attached to the wrong link, so it fires on the first match instead of the whole chain.", "A chain that references a variable set by a skipped rule never matches."],
    v: "Test each link in isolation and the chain together: confirm the action fires only when all conditions are true, and not when any single one is false.",
    dep: ["rule-language", "operators", "targets-and-variables"]
  },
  "multi-pattern-matcher": {
    s: "A matching engine that searches for thousands of literal strings or patterns in one pass over the data, instead of testing each one separately.",
    d: "Phrase lists and many regular expressions are compiled into one automaton or prefilter that reports every pattern found while scanning the value once. This makes large managed rulesets feasible: cost grows with input size, not with rule count. Some designs use a literal prefilter to decide which full expressions to run. It is hard because the compiled structure can use a lot of memory, compile slowly, and need a rebuild for each ruleset update.",
    k: ["Automaton over all patterns vs. one pattern at a time: the automaton is far faster per request but costs memory and compile time; one at a time is simple and can be bounded per rule.", "Prefilter then verify vs. match fully in the automaton: prefilters are cheap and safe but verification still costs; full matching is complete but heavier."],
    p: ["Compiling a large ruleset takes minutes and blocks reload during an emergency update.", "Case-folding behavior in the matcher differs from the transformations, so some patterns never match."],
    v: "Load a ruleset of several thousand phrases and measure per-request time for a fixed input; confirm it stays nearly flat as phrases are added and that every phrase is found when embedded in test text.",
    dep: ["operators", "rule-compiler"]
  },
  "rule-compiler": {
    s: "The component that parses, validates and optimizes rules into an executable form, loads it atomically, and rejects a configuration that would be unsafe or too costly.",
    d: "On load it parses the rule files, resolves references and macros, checks ids, targets and operators, estimates cost, orders rules by phase, and builds the matcher structures. Good loaders report the file and line of each error and can run in a check-only mode in CI. It makes the running engine immutable and thread-safe. It is hard because loading must not interrupt traffic, and because compile errors found at runtime are costly.",
    k: ["Compile at load vs. interpret at match: compiling is faster at runtime but slows reload; interpreting reloads quickly and runs slower.", "Fail the whole load on one bad rule vs. skip the rule: failing is safe but can block an urgent update; skipping keeps the system up with a gap."],
    p: ["A new ruleset passes syntax checks but is too large to fit the memory limit and the worker is killed.", "A skipped bad rule is logged once and nobody notices the missing protection."],
    v: "Load a ruleset containing one invalid rule and confirm the loader reports its location and either rejects the whole set or loads with an explicit warning, according to policy, and the old version remains active.",
    dep: ["rule-language", "multi-pattern-matcher", "config-versioning-rollback"]
  },
  "managed-ruleset": {
    s: "A maintained collection of detection rules supplied by a vendor or open community, covering common attack classes and known application vulnerabilities.",
    d: "The ruleset contains generic rules for injection, scripting, protocol abuse and scanners, plus application-specific packs. It is versioned, categorized by attack class, tagged with severity and paranoia level, and tested by its maintainers against sample traffic. Operators enable categories, set levels and add exclusions. It saves most teams from writing detections. It is hard because its authors cannot see your traffic, so every deployment inherits false positives and must tune.",
    k: ["Generic ruleset vs. application-specific packs: generic works everywhere but is noisy; specific packs are precise for one framework but only help those who run it.", "Rely on vendor tuning vs. maintain a fork: vendor tuning is cheap but generic; a fork fits your traffic and must be re-merged on every release."],
    p: ["The ruleset is enabled with default settings and the team assumes it has been tuned for their application.", "A fork is never re-merged and falls years behind new attack techniques."],
    v: "Run the ruleset's published test suite for attack classes against your deployment and confirm the rule ids that block each, then replay benign production samples and count false positives.",
    dep: ["rule-language", "paranoia-levels", "ruleset-update-channel"]
  },
  "ruleset-update-channel": {
    s: "The delivery path that brings new and changed rules to every firewall node, with integrity checks and a choice between automatic and reviewed updates.",
    d: "Updates are published as signed packages or pulled from a repository, verified, staged and activated. Cloud-delivered services update the fleet themselves, often within hours of a disclosure; self-managed deployments schedule updates. The channel carries emergency rules separately from regular releases. It is hard because it is a supply chain: a compromised or faulty update reaches every node, and a delayed update leaves a window for exploitation.",
    k: ["Automatic updates vs. reviewed updates: automatic closes exposure windows quickly but can break production; reviewed is safer for availability and slower for security.", "Signed packages vs. trusting the transport: signatures survive a compromised mirror but need key management."],
    p: ["An update changes rule ids, and exclusions stop applying until someone notices.", "The update server is unreachable for weeks and the firewall quietly runs stale rules."],
    v: "Publish a test rule update, confirm every node verifies its signature and activates it within the stated time, and that a tampered package is refused and alerts.",
    dep: ["managed-ruleset", "rule-version-pinning", "staged-rule-rollout"]
  },
  "virtual-patching": {
    s: "A rule written to block exploitation of a specific known vulnerability in the protected application, deployed before the application itself can be fixed.",
    d: "When a flaw is disclosed, rules are written for the vulnerable route, parameter and exploit shape, and shipped within hours. They are narrow, which keeps false positives low. They buy time while the application team tests and releases a patch. It is a stopgap. It is hard because the exploit has many variants, the rule is written from limited information, and attackers modify payloads quickly after a public rule appears.",
    k: ["Narrow exploit-specific rule vs. broad class rule: narrow has almost no false positives but misses variants; broad catches variants but may block legitimate use of the same route.", "Ship quickly in detect mode vs. block at once: block stops exploitation now but risks outages; detect is safer and leaves the window open."],
    p: ["A patched application keeps its virtual patch for years, and the rule's false positives accumulate.", "The rule matches only the published proof-of-concept and not simple variants."],
    v: "Use the published exploit against a vulnerable test instance with the rule on and confirm it is blocked; then try several payload variants and record which are still blocked.",
    dep: ["managed-ruleset", "ruleset-update-channel", "custom-rules"]
  },
  "rule-version-pinning": {
    s: "Fixing a deployment to a specific ruleset version and moving it forward deliberately, so an update cannot change behavior unexpectedly.",
    d: "Each application or environment names the ruleset version it runs. A new version is first deployed to a test environment or detect-only, compared with the pinned version on identical traffic, and promoted when the differences are understood. Pinning supports reproducibility, audits and rollbacks. It is hard because pinned versions age, and the longer you stay, the larger and riskier the eventual jump.",
    k: ["Pin and promote vs. float on latest: pinning controls change but needs a promotion process; floating is automatic and exposes you to surprises.", "Pin per application vs. fleet-wide: per-application allows slow movers; fleet-wide is simple but forces everyone at once."],
    p: ["A pin is set during an incident and is forgotten, leaving rules a year out of date.", "Exclusions written against one version silently mismatch the next."],
    v: "Pin an application to an older version, publish a new one, and confirm the application's logged ruleset version stays unchanged until promoted.",
    dep: ["managed-ruleset", "config-versioning-rollback"]
  },
  "custom-rules": {
    s: "Rules written by the operating team for its own application: business-specific blocks, exceptions, rate limits, and temporary responses to incidents.",
    d: "Custom rules express knowledge only the owner has: this admin path is internal, this parameter is always numeric, this partner uses a specific header. They run alongside managed rules, usually in a reserved id range and phase positions. They are reviewed as code. They carry risk: they have no vendor testing, a performance mistake affects all traffic, and they outlive the person who wrote them.",
    k: ["Custom rules vs. fixing the application: custom rules are fast and independent of the app team; fixing removes the cause but takes longer.", "Free-form rules vs. a template library: templates are safer and testable; free-form handles unusual cases with more risk."],
    p: ["An expensive regular expression in a custom rule is deployed without cost review and raises latency for all traffic.", "Temporary incident rules have no owner or expiry and accumulate."],
    v: "Add a custom rule for a test path in staging, confirm it fires with the expected id, check its measured cost against the budget, and confirm it carries an owner and expiry in its metadata.",
    dep: ["rule-language", "rule-cost-profiling", "ruleset-regression-testing"]
  },
  "ruleset-regression-testing": {
    s: "Automated replay of known attacks and known-good traffic against a candidate ruleset, to confirm detection did not drop and false positives did not rise.",
    d: "A corpus of labeled requests is replayed through a test instance. Attack cases assert that a given rule or score is produced; benign cases assert none. The corpus includes captured production samples, public exploit sets, and cases added after every incident. It runs on every rule change in CI. It is hard because the benign corpus must reflect real traffic, which is sensitive to store, and because passing tests can create false confidence.",
    k: ["Replay recorded production traffic vs. synthetic cases: recorded is realistic but contains personal data; synthetic is safe and misses the quirks of real clients.", "Assert on exact rules vs. assert on blocked or not: exact detects behavior drift; blocked-or-not is robust to renumbering."],
    p: ["The benign corpus is three months old and lacks a new route, so a rule that blocks it passes CI.", "Tests assert only that the attack is blocked, not that the right rule blocked it, and an unrelated rule hides a regression."],
    v: "Introduce a deliberate regression, such as disabling one detection rule or adding a rule that blocks a known-good request, and confirm the pipeline fails with the specific case named.",
    dep: ["rule-compiler", "managed-ruleset", "policy-as-code"]
  },
  "url-decoding": {
    s: "Converting percent-encoded and plus-encoded characters in the path, query and form data back into the characters the application will see.",
    d: "The engine decodes percent sequences into bytes and then characters, handles the plus sign as a space in forms, and deals with invalid sequences, such as a bare percent sign or incomplete hexadecimal digits, the same way the backend does. It is the base of every other check. It is hard because backends differ on invalid input, on overlong or non-shortest encodings and on whether the path is decoded before or after routing.",
    k: ["Strict reject on invalid sequences vs. best-effort decode: rejecting closes ambiguity but breaks sloppy clients; best-effort matches lenient backends but leaves a differential.", "Decode once vs. decode until stable: once matches normal behavior; until stable defeats double encoding but can alter legitimate percent text."],
    p: ["A malformed sequence is skipped by the firewall and decoded by the backend into a quote character.", "The plus sign is decoded as a space in a path where the backend keeps it literal."],
    v: "Send requests with valid, invalid, overlong and double-encoded percent sequences to a test backend, and confirm the firewall's decoded value matches the value the backend reports in each case.",
    dep: ["parser-differentials", "form-and-query-parser"]
  },
  "multiple-decoding-defense": {
    s: "Detecting and handling payloads encoded two or more times, where one layer is removed by an intermediary and the next by the application.",
    d: "Chained proxies, frameworks and application code each decode input, so a doubly encoded value becomes dangerous only after a later decoding step. Defenses decode repeatedly up to a limit and inspect each layer, or flag any value that still contains encoded text after one pass. They must avoid false positives on legitimate percent signs. The difficulty is knowing how many times the specific backend decodes.",
    k: ["Inspect every decoding layer vs. only the final one: every layer catches payloads for different backend depths but costs more; final-only is cheap and misses partial decodes.", "Block any remaining encoding vs. decode further: blocking is simple and strict; decoding further is lenient and bounded by a limit."],
    p: ["The decoding depth limit is lower than the number of layers an attacker uses, and the remainder passes.", "Legitimate encoded URLs in redirect parameters are flagged and blocked."],
    v: "Submit a test payload encoded one, two, three and four times and confirm which layers are detected, and that the highest depth the backend actually decodes is covered.",
    dep: ["url-decoding", "transformation-functions", "parser-differentials"]
  },
  "charset-normalization": {
    s: "Interpreting bytes in the character encoding the backend will use, so that text rules see the same characters as the application.",
    d: "Requests may declare an encoding in headers or content, or none, and the backend may apply defaults or guess. The firewall must pick the same interpretation, then convert to a common internal form such as UTF-8 for inspection. Encodings with multi-byte sequences can hide a quote or angle bracket inside a lead byte. It is hard because declared and actual encodings may disagree and because legacy encodings still exist in real traffic.",
    k: ["Trust the declared charset vs. detect: declared follows the standard and can be wrong; detection matches the content and may differ from the backend.", "Reject non-UTF-8 vs. convert: rejection is safe and breaks legacy clients; conversion supports them with a risk of mismatch."],
    p: ["A multi-byte sequence in a legacy encoding swallows the byte of a quote in the firewall's view but not the backend's.", "Overlong UTF-8 sequences are accepted by the backend and not decoded by the engine."],
    v: "Send the same payload in several declared and undeclared encodings to a test backend and confirm the firewall's decoded characters equal those the backend reports for each.",
    dep: ["unicode-normalization", "http-request-parser", "parser-differentials"]
  },
  "unicode-normalization": {
    s: "Mapping visually or semantically equivalent Unicode characters to one canonical form, so lookalike and compatibility characters cannot hide a keyword.",
    d: "Unicode offers many ways to write the same text: full-width letters, composed and decomposed accents, compatibility forms and invisible characters. Some backends or databases fold these to ASCII after the firewall has inspected the original. Normalization applies a standard form, strips invisible characters, and sometimes maps best-fit characters to ASCII to match backend folding. It is hard because the right mapping depends on what the backend does, and over-normalizing creates false positives for non-English text.",
    k: ["Aggressive best-fit folding vs. standard forms only: aggressive catches backend-specific folding but misreads real non-Latin text; standard forms are safe and miss quirks.", "Normalize for inspection only vs. also forward normalized text: inspection-only leaves traffic unchanged; forwarding makes the backend agree but changes user content."],
    p: ["A full-width angle bracket passes the firewall and is folded to an ASCII one by the application.", "Aggressive folding blocks legitimate names in other scripts."],
    v: "Send keywords written in full-width, composed and zero-width-padded forms to a test backend and confirm the firewall's normalized text matches the keyword and the rule fires.",
    dep: ["charset-normalization", "transformation-functions"]
  },
  "path-canonicalization": {
    s: "Reducing a URL path to its canonical form by resolving dot segments, repeated separators, encoded separators and case, as the backend's routing would.",
    d: "The engine collapses repeated slashes, resolves current- and parent-directory segments, handles encoded slashes and backslashes, strips path parameters where the backend does, and applies case rules matching the filesystem. Rules for admin paths and file access then match the canonical path. It is hard because web servers, frameworks and file systems differ, and one mismatch lets an attacker reach a protected route by an alternate spelling.",
    k: ["Canonicalize to match the backend vs. reject non-canonical paths: matching preserves odd but valid URLs; rejecting is simple and safe for strict applications.", "Case-insensitive vs. case-sensitive matching: insensitive matches case-folding file systems; sensitive matches strict routers."],
    p: ["A rule blocking an admin path is bypassed by an extra slash or a trailing path parameter the backend ignores.", "Backslashes are treated as separators by one component and as literal characters by another."],
    v: "Request a protected path using dot segments, doubled slashes, encoded separators, mixed case and path parameters, and confirm each variant is evaluated against the same path rule as the plain form.",
    dep: ["url-decoding", "parser-differentials", "http-request-parser"]
  },
  "html-entity-decoding": {
    s: "Converting HTML entities and character references into characters, because a browser, and some applications, do so before a script payload takes effect.",
    d: "Entities such as named, decimal and hexadecimal references, with or without a trailing semicolon, are decoded for inspection of values that may be reflected into markup. Some contexts decode further, such as attribute values and script URLs. It supports cross-site scripting detection. It is hard because browsers accept malformed entities that standards do not, and decoding in all fields gives false positives on text that merely mentions entities.",
    k: ["Decode for all fields vs. only likely reflected fields: all is safe and noisy; selected fields reduces false positives and risks missing a sink.", "Browser-compatible lenient decoding vs. standard strict decoding: lenient matches what a browser executes; strict is simpler and misses malformed forms."],
    p: ["An entity without a semicolon is decoded by browsers and ignored by the firewall.", "Documentation pages that discuss entities generate constant false positives."],
    v: "Submit a script payload encoded using named, decimal, hexadecimal and semicolon-less entities and confirm each decodes to the same text for the detector and is blocked.",
    dep: ["transformation-functions", "xss-detection"]
  },
  "header-normalization": {
    s: "Cleaning request headers by lowercasing names, merging repeats, unfolding continuation lines and removing ambiguous or hop-by-hop headers before inspection.",
    d: "The engine treats header names case-insensitively, joins repeated headers in the way the standard allows, rejects obsolete line folding and whitespace before the colon, and strips headers that clients should not set, such as internal trust or forwarding headers. It also checks conflicting length and chunking headers, which are the basis of request smuggling. It is hard because the same header can be interpreted differently by successive proxies.",
    k: ["Reject malformed headers vs. repair them: rejecting stops smuggling ambiguity but breaks odd clients; repairing preserves traffic and risks disagreement.", "Strip untrusted forwarding headers at the edge vs. pass through: stripping keeps identity trustworthy; passing through preserves information from earlier proxies."],
    p: ["Both a length and a chunked encoding header are accepted, and the firewall and backend disagree on where the request ends.", "A client-supplied forwarding header is trusted by the application as the true client address."],
    v: "Send requests with conflicting length and chunking headers, folded lines and spoofed forwarding headers to a test backend and confirm each is rejected or normalized as documented.",
    dep: ["http-request-parser", "client-ip-resolution", "parser-differentials"]
  },
  "parameter-pollution-handling": {
    s: "Deciding how repeated parameters and ambiguous parameter syntax are interpreted, so a payload cannot be split or hidden across several copies of a name.",
    d: "Some backends take the first value of a repeated parameter, some the last, some join all with a separator, some build an array. The firewall must inspect each copy individually and the combined value, because a payload split across copies exists only after joining. It also handles semicolon separators, array notation and mixed query and body parameters of the same name. It is hard because the combination rule is backend-specific.",
    k: ["Inspect every copy and the joined form vs. only one interpretation: both catches split payloads but doubles work; one interpretation is cheaper and misses disagreements.", "Reject duplicate names vs. allow: rejecting is simple and safe for strict APIs; allowing is needed for forms with multiple selections."],
    p: ["A payload is split across two copies of a parameter and joined by the backend, while each half looks harmless alone.", "The query and body contain the same name and the firewall inspects only one source."],
    v: "Send a payload split across duplicate parameters, in query and body, and confirm the firewall inspects each part and the joined value in the way the backend combines them.",
    dep: ["form-and-query-parser", "targets-and-variables", "parser-differentials"]
  },
});
