// Details for the web application firewall plate, part 1: cross-cutting concerns, policy management, tuning.
ATLAS.details("web-app-firewall", {
  "evasion-resistance": {
    s: "The design goal that a payload gets the same verdict however it is encoded, split, padded or delivered, because attackers search for the form the rules do not recognize.",
    d: "Evasion is the central adversarial problem. Attackers try alternate encodings, case and whitespace tricks, comments inside keywords, oversized bodies that exceed inspection limits, unusual content types, split payloads across parameters and protocol quirks. Resistance is not one component: it comes from normalization matching the backend, limits that fail safely, rules written against decoded fields, and regular testing with mutated attack corpora. It is hard because the firewall has to predict the behavior of software it does not control.",
    k: ["Block on uncertainty vs. pass on uncertainty: refusing unparseable or oversized input closes bypasses but blocks odd legitimate clients.", "Many layered weak detectors vs. a few strong ones: layering catches variants but multiplies false positives and cost.", "Continuous mutation testing vs. periodic review: automation finds bypasses earlier but needs a maintained corpus and tooling."],
    p: ["A new encoding in a framework the firewall has never seen opens a silent bypass until someone tests it.", "Rules that match the raw string, not the decoded field, pass every encoded variant."],
    v: "Replay one known attack payload in a dozen encodings, case variants and placements (query, header, JSON, multipart), and confirm each is blocked with the same rule and score.",
    dep: ["multiple-decoding-defense", "parser-differentials"]
  },
  "parser-differentials": {
    s: "Any gap between how the firewall parses a request and how the backend parses it. The attacker hides a payload in the gap, where the firewall sees nothing and the application sees an attack.",
    d: "The firewall and the application are two independent parsers of the same bytes. They can disagree on duplicate parameters, header folding, line endings, content-type precedence, multipart boundaries, JSON duplicate keys, path separators and chunked framing. Wherever they disagree, a payload can be invisible to one and live in the other. The defense is either strict rejection of ambiguous requests or modeling each backend's behavior exactly. Both are hard because backends differ per framework, version and configuration.",
    k: ["Reject ambiguous requests vs. model each backend: rejection is simple and safe but breaks sloppy clients; modeling is accurate but must track every backend change.", "Normalize and forward the cleaned request vs. forward the original: forwarding the cleaned form makes both sides agree but alters traffic the application may depend on."],
    p: ["Duplicate parameter names are joined by one parser and last-wins in another, so the payload hides in the part the firewall never evaluates.", "A framework upgrade changes parsing behavior and quietly invalidates the firewall's assumptions."],
    v: "Send requests with duplicate parameters, conflicting content types and malformed boundaries to a test backend and confirm the firewall inspects the same values the backend logs, or rejects the request.",
    dep: ["http-request-parser", "parameter-pollution-handling", "multipart-parser"]
  },
  "false-positive-cost": {
    s: "The weighing of a wrongly blocked legitimate request against a missed attack, which sets default thresholds, rollout speed and how much tuning effort the product demands.",
    d: "A blocked customer is a visible, immediate cost; a missed attack is usually invisible until it is a breach. That asymmetry pushes teams to switch the firewall to detection-only and never go back. The cost depends on the application: a checkout page, a content editor and a public read-only API tolerate very different rates. Treating false positives as a measured quantity per route, with a budget and an owner, is what keeps blocking mode switched on.",
    k: ["Strict defaults vs. permissive defaults: strict catches more but floods operators with exclusions; permissive ships quickly but leaves gaps nobody revisits.", "Per-route sensitivity vs. one global level: per-route fits the real risk but makes policy much larger to maintain."],
    p: ["No one owns the false-positive rate, so the first outage from a block moves everything to detection-only permanently.", "Tuning effort is measured in tickets closed, not in protection retained, so exclusions pile up without review."],
    v: "Compute blocked-legitimate requests per thousand for each application from triaged logs, and confirm a threshold alert exists and has an owner.",
    dep: ["false-positive-triage", "paranoia-levels", "rule-exclusions"]
  },
  "inspection-depth-vs-latency": {
    s: "The trade between how deeply every request is examined and how much time and memory that costs, decided as a budget rather than rule by rule.",
    d: "Each additional rule, body parse, decode pass and outbound check adds work on every request. Teams usually set a per-request latency target, such as a few milliseconds at the median, and a hard ceiling for the tail. Depth is then spent where risk is highest: full inspection for login and write endpoints, header-only checks for static assets, and size caps on bodies. It is hard because cost is workload-dependent, and a single pathological input can be thousands of times more expensive than a typical one.",
    k: ["Inspect everything vs. inspect by route risk: uniform inspection is simple to reason about but spends budget on static assets; risk-based inspection needs accurate route classification.", "Synchronous inspection vs. asynchronous after-the-fact analysis: sync can block, async cannot but adds no latency."],
    p: ["Latency is measured on average requests, so one crafted input burns the whole worker and becomes a denial of service.", "Adding rules one at a time never trips an alert, until the sum doubles p99."],
    v: "Load test with production-shaped traffic, plus a set of worst-case payloads, and compare p50 and p99 added latency with and without the firewall against the stated budget.",
    dep: ["latency-budget", "rule-cost-profiling", "body-size-limits"]
  },
  "failure-posture": {
    s: "What the firewall does when it is overloaded, misconfigured, crashing or unable to parse: let traffic through unprotected, or refuse it and cause an outage.",
    d: "Every failure mode needs an explicit answer. Fail-open keeps the site up but turns the firewall off exactly when something is wrong, which can be when an attack is in progress. Fail-closed protects but makes the firewall a single point of outage. Most deployments choose per failure type: fail closed on parsing errors for sensitive routes, fail open on log pipeline outages, and shed load by dropping optional checks first. The posture must be tested, because it is rarely exercised in normal operation.",
    k: ["Fail open vs. fail closed: open favors availability and hides gaps; closed favors security and makes the firewall a hard dependency.", "Global posture vs. per-route posture: global is predictable; per-route matches risk but adds more states to test."],
    p: ["A health check that tests the process but not rule loading keeps a firewall with an empty ruleset in rotation.", "Fail-open is never exercised, so when it is needed it turns out to be broken or unnoticed."],
    v: "Kill the rule engine process, corrupt a ruleset and exhaust memory in a staging environment, then confirm traffic follows the documented posture and an alert fires within the stated time.",
    dep: ["fail-open-fail-closed", "load-shedding", "config-versioning-rollback"]
  },
  "data-privacy": {
    s: "The handling of personal and secret data that passes through the firewall, which sees passwords, tokens and payment fields in the clear and can leak them through its own logs.",
    d: "Because the firewall terminates encryption and reads bodies, it handles everything users submit. That puts it in scope for privacy and payment rules. Controls include masking known sensitive fields before logging, limiting how much of a body is stored, restricting who can read logs, setting retention periods, and keeping inspection data inside a region. The difficulty is that the most useful forensic detail, the exact payload, is the most sensitive, so teams must choose what to lose.",
    k: ["Log full payloads vs. log matched fragments only: full payloads make triage and forensics easy but create a store of secrets; fragments reduce exposure but can hide context.", "Central log analysis vs. in-region storage: central tooling is simpler; in-region storage satisfies data residency but fragments investigation."],
    p: ["A password submitted in a form field that is not on the redaction list appears in plain text in an audit log for months.", "Debug logging enabled during an incident captures full bodies and is never switched off."],
    v: "Submit a request containing a test password and card number through every logged field, then search raw log storage for those strings and confirm none appears.",
    dep: ["sensitive-data-redaction", "audit-log", "tls-termination"]
  },
  "policy-model": {
    s: "The data structure that says which rules and settings apply to which traffic, with inheritance from a global default down to a single route or application.",
    d: "A policy binds a ruleset, a mode (detect or block), thresholds, exclusions and rate limits to a scope such as a host, path, method or tenant. Scopes inherit from broader ones, and the most specific match wins. The engine evaluates the effective policy for each transaction, which usually means resolving the scope once and caching the result. The difficulty is making inheritance understandable: operators need to see why a given request was handled the way it was.",
    k: ["Inheritance with overrides vs. flat per-scope policies: inheritance reduces repetition but makes the effective policy hard to see; flat policies are explicit but drift apart.", "Policy objects vs. raw rule files: objects can be validated and edited safely; raw files are more flexible but easy to break."],
    p: ["An override at a narrow scope silently disables a rule that the global policy was meant to enforce everywhere.", "Two scopes match with equal specificity and the winner depends on load order."],
    v: "For a sample request, ask the management API for the effective policy and the matched scope, and confirm it equals what the engine logged for that transaction.",
    dep: ["rule-language", "decision-actions"]
  },
  "policy-as-code": {
    s: "Keeping firewall policy as versioned text files in a repository, so every change is reviewed, tested and reproducible rather than made by hand in a console.",
    d: "Policy, exclusions and custom rules are stored in source control, validated by a linter and tested against a corpus of known-good and known-bad requests in continuous integration, then deployed by a pipeline. The approach gives an audit trail, peer review and the ability to recreate an environment. It is hard because many exclusions are discovered during incidents, when people reach for the console, so the console and repository drift apart unless the console is read-only.",
    k: ["Repository as source of truth vs. console as source of truth: the repository gives review and history; the console is faster in an emergency.", "Pre-merge tests on sample traffic vs. trust in review: tests catch rules that block real traffic but need a representative corpus."],
    p: ["An emergency console edit is never back-ported, and the next deploy removes the fix and re-opens the incident.", "The test corpus contains no traffic for a new route, so a bad rule passes CI."],
    v: "Make a trivial change via a pull request, watch it pass the sample-traffic tests and deploy, and confirm the running configuration's version identifier matches the commit.",
    dep: ["policy-model", "config-versioning-rollback", "ruleset-regression-testing"]
  },
  "per-application-policies": {
    s: "Separate policies, thresholds and exclusions for each protected application, so a legacy app that needs loose rules does not weaken a modern one on the same firewall.",
    d: "Shared firewalls front many applications, each with its own framework, risk and tolerance for blocking. Per-application policy selects a ruleset version, paranoia level, body limits, content types and exclusions by hostname or path. The firewall resolves the application early, since the choice affects parser selection. The hard part is multi-tenant isolation: one tenant's custom rule or traffic spike must not affect another's inspection, latency or logs.",
    k: ["One shared policy vs. one per application: shared is simple and consistent; per-application fits real behavior but multiplies configuration to maintain.", "Tenant-editable policy vs. operator-controlled policy: self-service is faster but lets a tenant weaken protection or write a rule that burns shared CPU."],
    p: ["A wildcard host match sends a new application to the permissive policy of a neighbor.", "A tenant's costly custom regex slows every tenant on the same workers."],
    v: "Send the same attack to two applications with different policies and confirm each is handled per its own policy, with logs attributed to the correct application.",
    dep: ["policy-model", "worker-concurrency"]
  },
  "config-versioning-rollback": {
    s: "Immutable, numbered snapshots of the full firewall configuration with a one-step return to the previous good version, because a bad rule change can take down the whole site.",
    d: "Each change produces a new version containing rules, policy and exclusions. Engines load a version atomically: they compile it beside the running one, validate it, and then switch new transactions over while in-flight ones finish on the old version. Rollback is just switching to an earlier version. The difficulty is making the switch fast and reliable under load, and ensuring all nodes converge on the same version rather than leaving a mixed fleet.",
    k: ["Atomic switch vs. in-place edit: atomic switching avoids half-applied rules but needs memory for two copies.", "Automatic rollback on error spike vs. manual rollback: automatic limits damage but can hide a real attack behind a revert; manual is slower but deliberate."],
    p: ["Nodes pick up the new version at different times, so the same request is blocked by one and passed by another.", "The rollback target was itself compiled with a ruleset that has since been removed from the update channel."],
    v: "Deploy a rule that blocks a test path, then roll back; confirm every node reports the earlier version identifier within the stated time and the path is allowed again.",
    dep: ["rule-compiler", "management-api"]
  },
  "staged-rule-rollout": {
    s: "Releasing a new or changed rule to a small share of traffic or to detection-only first, then widening only if the false positive rate stays acceptable.",
    d: "A new rule runs in log-only mode on all traffic, or in blocking mode on a canary slice, while metrics compare its hit rate against a baseline. If hits on known-good traffic stay near zero, the rollout widens in steps. This bridges the gap between a vendor's release and a customer's traffic, which the vendor never saw. It is hard because the interesting false positives are rare and appear only on long-tail routes, so a short canary can miss them.",
    k: ["Detect first, then block vs. block immediately: detect-first prevents outages but delays protection for a window the attacker can exploit.", "Percentage-of-traffic canary vs. canary by application: percentage is statistically cleaner; by application contains the blast radius to owners who can respond."],
    p: ["A rule soaks for ten minutes in the quiet hour, then blocks the nightly batch upload.", "Emergency rules skip the stage and block production traffic on first deployment."],
    v: "Release a test rule at one percent in blocking mode and confirm its hit and block counts appear only on that slice, with the remaining traffic unaffected.",
    dep: ["detection-only-mode", "metrics-and-dashboards", "config-versioning-rollback"]
  },
  "management-api": {
    s: "The programmatic interface for reading and changing policy, exclusions, rulesets and mode, used by the console, automation and incident responders.",
    d: "The API exposes create, read, update and delete operations for policies and rules, plus operations such as deploy, roll back and fetch effective configuration. Changes are validated before activation and attributed to an identity. It is used by pipelines and by other security tools, for example to push an emergency block. It is hard because it is a privileged control plane: an attacker who can call it can switch the firewall off, so it needs strong authentication, narrow roles and rate limits.",
    k: ["Declarative whole-config replacement vs. incremental changes: replacement is idempotent and diffable but risks overwriting concurrent edits; incremental is flexible but harder to reason about.", "Synchronous apply vs. asynchronous deploy: synchronous gives clear results; asynchronous scales across a fleet but needs status tracking."],
    p: ["A long-lived automation token with write access is leaked, and it can disable blocking everywhere.", "Concurrent edits from console and pipeline overwrite each other without a conflict error."],
    v: "Call the API to add a block rule with a restricted role, check it is audited with identity and timestamp, and confirm the same call fails with a read-only role.",
    dep: ["policy-model", "config-versioning-rollback"]
  },
  "learning-mode": {
    s: "A phase in which the firewall observes real traffic to build a model of what normal requests look like, such as expected parameters, types and lengths, before enforcing anything.",
    d: "During learning the firewall records, per route, which parameters appear, their value patterns, lengths, content types and methods. It then proposes a positive security policy, for example that a user id is digits only. Enforcement turns the learned shape into rules. It helps with applications whose behavior is stable, and it reduces hand tuning. It is hard because learned data may include attack traffic, which then becomes normal, and applications change with each release.",
    k: ["Positive model learned from traffic vs. negative signatures only: positive rules catch unknown attacks but need retraining on every change; signatures need no training but only match known patterns.", "Short learning window vs. long: short is quick but misses rare paths; long delays protection and can learn attacks."],
    p: ["Traffic during the learning window includes an ongoing scan, and the scanner's payload shape is learned as legitimate.", "A new release adds a parameter and every request to the route is blocked until retraining."],
    v: "Run learning on a staging copy, deploy the proposed model in detect-only mode, then replay held-out normal traffic and confirm violations stay under the agreed rate.",
    dep: ["detection-only-mode", "audit-log", "false-positive-triage"]
  },
  "detection-only-mode": {
    s: "Running all rules and writing the verdicts to the log while letting every request through, so operators see what would be blocked before turning on blocking.",
    d: "The engine evaluates the full ruleset and records matches and scores, but the final action is overridden to allow. It is the standard first step of a deployment and of every ruleset upgrade, and it gives data to tune from. Teams use it per application or per rule. It is risky as a resting state: it protects nothing, can lull teams into false confidence, and quietly becomes permanent when nobody owns the move to blocking.",
    k: ["Global detect-only vs. per-rule detect-only: global is simple but leaves everything unprotected; per-rule lets proven rules block while new ones soak.", "Time-boxed detection vs. open-ended: a deadline forces a blocking decision, while open-ended avoids rushed cutovers that cause outages."],
    p: ["The site stays in detection-only for years, and the security team reports the firewall as deployed.", "Detection-only still performs full body buffering, so it costs latency without any benefit if nobody reads the logs."],
    v: "Send a known attack in detection-only mode and confirm it reaches the backend, appears in the log with rule ids and score, and flips to a block response when mode is set to blocking.",
    dep: ["decision-actions", "audit-log"]
  },
  "false-positive-triage": {
    s: "The process of reviewing blocked or flagged requests, deciding whether each was legitimate, and routing the result to an exclusion, a rule fix, or an application fix.",
    d: "Operators sort log events by rule and route, look at the matched field and value, and decide: real attack, legitimate but unusual, or a bug in the rule. The output is an exclusion, a bug report to the ruleset maintainer, or a change request to the application team. Grouping by rule and parameter turns thousands of events into a few decisions. It is hard because judging intent from one request is uncertain, and because the logged evidence may be redacted.",
    k: ["Triage by rule vs. by route: by rule fixes common causes broadly; by route fits the owner's knowledge of the application.", "Fix the application vs. exclude in the firewall: fixing removes the root cause but depends on another team; excluding is immediate but weakens protection."],
    p: ["A rule that fires on a legitimate form is excluded across the whole site instead of for that field.", "Redacted logs leave triagers unable to see the payload, so they guess and allow."],
    v: "Pick one day of blocks, classify a random sample by hand, and compare the measured false positive rate with the dashboard figure; confirm each class led to a recorded action.",
    dep: ["audit-log", "rule-exclusions", "tuning-recommendations"]
  },
  "rule-exclusions": {
    s: "Targeted instructions that stop a specific rule from inspecting a specific field, path or parameter, used to remove false positives without disabling the rule.",
    d: "An exclusion names a rule, rule group or tag and a target such as one request parameter, cookie or header, usually combined with a path or method. The engine skips the matching rule for that target only. Exclusions can be applied before or after the rule engine loads the ruleset, and many are generated from a catalog for common applications. The hazard is accumulation: each exclusion is a small blind spot that reviewers forget.",
    k: ["Excluding a target from a rule vs. disabling the rule on a route: target exclusion keeps the rest of the protection; disabling is simpler to write but opens a larger blind spot.", "Exclusion by rule id vs. by tag: ids are precise but break when ids change in an update; tags survive updates but may cover more than intended."],
    p: ["An exclusion for a rich-text field on one page is written without a path, so it applies to every request with that parameter name.", "Rule ids change in a ruleset upgrade and exclusions silently stop matching or start matching a different rule."],
    v: "Submit the legitimate value to the excluded field and confirm it passes, then submit the same attack to a different field and the same rule still blocks it.",
    dep: ["exclusion-scoping", "rule-language", "targets-and-variables"]
  },
  "exclusion-scoping": {
    s: "The dimensions that narrow an exclusion, such as path, method, parameter name, content type, client or time, so it covers as little as possible.",
    d: "A well-scoped exclusion combines several conditions: this rule, this parameter, this path, this method. Scoping is evaluated by the engine at the point of the rule, and tools show how many requests each exclusion would affect. The tightest scope that still removes the false positive is the goal. It is hard because narrow scopes break when application routes change, and broad scopes are tempting because they do not.",
    k: ["Narrow scope vs. broad scope: narrow limits the blind spot but needs maintenance when routes change; broad needs no maintenance but quietly becomes a bypass.", "Scope by client identity vs. by request shape: client-based scoping fits trusted partners but fails if the credential is stolen."],
    p: ["A scope using a path prefix also matches an attacker-controlled path segment appended to it.", "Scopes using case-sensitive paths miss the same path in another case and block it again."],
    v: "For each exclusion, list the requests it matched in the past week and confirm every one is a request the exclusion was meant to cover, and none came from unexpected paths.",
    dep: ["rule-exclusions", "path-canonicalization", "targets-and-variables"]
  },
  "allowlists": {
    s: "Rules that let traffic from trusted clients, addresses or paths skip some or all inspection, used for health checks, internal scanners and partner integrations.",
    d: "An allowlist entry matches on client address, network, credential or header, and sets the transaction to bypass certain phases or the whole engine. Typical entries cover load balancer health checks, vulnerability scanners run by the owner, and payment provider callbacks. It improves performance and removes noise. It is dangerous because anything on the list is uninspected, so attackers target the criteria: spoofed headers, compromised partner hosts or shared address ranges.",
    k: ["Full bypass vs. reduced inspection: full bypass avoids all false positives but trusts the source completely; reduced inspection retains protection against a compromised partner at some cost.", "Address-based vs. credential-based allowlisting: addresses are simple but can be shared or spoofed behind proxies; credentials are stronger but need distribution."],
    p: ["An allowlist keyed on a forwarded-for header can be satisfied by any client who sets the header.", "A partner's address range is reassigned and strangers inherit the bypass."],
    v: "Send an attack payload from an allowlisted source and from a non-listed one, and confirm only the second is blocked; then spoof the identifying header from a third source and confirm it is not allowed.",
    dep: ["client-ip-resolution", "policy-model"]
  },
  "tuning-recommendations": {
    s: "Automated suggestions that analyze logged false positives and propose specific exclusions or threshold changes, for an operator to approve.",
    d: "A job aggregates matches by rule, route and parameter, compares them with traffic that was independently judged legitimate, and ranks candidate exclusions by how many safe requests they would free and how much exposure they add. The operator sees the proposed exclusion with evidence. It reduces toil on large estates. It is hard because the system cannot know intent: a pattern frequent in logs may be an ongoing attack, so approval must stay human.",
    k: ["Automatic application vs. human approval: automatic keeps up with change but may whitelist an attack; approval is safer but creates a queue.", "Learning from live traffic vs. from labeled samples: live traffic is plentiful but unlabeled; labeled samples are reliable but small."],
    p: ["A sustained scan is the most frequent event for a rule, and the system recommends excluding it.", "Recommendations are generated from redacted logs and propose scopes too broad to be safe."],
    v: "Seed the log with known-good traffic that triggers a rule and known-bad traffic that triggers the same rule, and confirm the proposed exclusion covers the first set without matching the second.",
    dep: ["false-positive-triage", "audit-log", "exclusion-scoping"]
  },
  "audit-log": {
    s: "The per-transaction record of what the firewall saw and decided: matched rules, scores, the offending field and value, the action taken and the policy version in force.",
    d: "For blocked and flagged requests the engine writes a structured entry with timestamp, client, request line, selected headers, the list of matched rules with the data that matched, the total score and the final action. Entries go to files, a stream or a collector. It is the evidence behind triage, tuning and incident response. It is hard because volume is large during attacks, entries can contain secrets, and the log pipeline must never slow the request path.",
    k: ["Structured records vs. free text: structured entries are searchable and parseable; free text is easier to read but harder to analyze.", "Synchronous write vs. buffered asynchronous write: synchronous is never lost but adds latency; asynchronous is fast but can drop entries during a crash or overload."],
    p: ["Logging on the request path blocks workers when the log disk fills, and a logging problem becomes an outage.", "Entries omit the policy version, so an event cannot be matched to the rules that actually produced it."],
    v: "Trigger a known rule and find the entry within seconds, then confirm it contains the rule id, matched field and value (redacted as configured), score, action and the active configuration version.",
    dep: ["sensitive-data-redaction", "correlation-ids", "decision-actions"]
  },
  "log-sampling": {
    s: "Recording only a share of events, or only the first few per client or rule, to keep volume and storage within limits during floods of attacks.",
    d: "Sampling can be uniform, per rule, per client or adaptive: full detail for rare events and counts only for floods. Blocked requests from one scanner may be summarized as one entry with a counter after the first few. Allowed traffic is usually sampled far more heavily than blocked traffic. It protects the pipeline and cost, but it harms analysis: sampled data skews estimates of false positive rates and may drop the single event that mattered.",
    k: ["Uniform sampling vs. adaptive: uniform keeps statistics simple; adaptive preserves rare events but complicates rate estimates.", "Sample on allowed traffic vs. on blocked: sampling allowed traffic loses little evidence; sampling blocks can lose forensic detail on an attack."],
    p: ["Dashboards multiply sampled counts without correcting for the rate, and report wrong volumes.", "The only request that exploited a bug was in the unsampled share and no record exists."],
    v: "Generate a known number of blocked requests in a flood and compare the log's recorded count (including summary counters) with the generated total, within the documented tolerance.",
    dep: ["audit-log", "metrics-and-dashboards"]
  },
  "sensitive-data-redaction": {
    s: "Masking passwords, tokens, card numbers and other secrets in logged requests, by field name, header or pattern, before anything is written.",
    d: "A configured list of header names, cookie names, parameter names and value patterns is replaced with a mask in log entries, and sometimes in the matched-data field too. Some products also drop whole bodies on named routes. It runs just before logging, after rules have inspected the original values. It is hard because secrets appear in unexpected places: nested JSON keys, URL paths, error messages or free-text fields, and a name-based list misses them.",
    k: ["Name-based masking vs. pattern-based: names are cheap and precise but miss unknown fields; patterns catch more but cost CPU and have false matches.", "Mask by default and allow-list fields vs. log by default and mask a list: default-mask is safe but less useful; default-log is useful and leaks."],
    p: ["A new API parameter named for a secret in a form of its own is not on the list and is logged in clear.", "Masking runs after the log line is serialized, so the original value remains in a buffer or crash dump."],
    v: "Send requests carrying marker secrets in headers, cookies, query, form, JSON and path, then search all stored logs and dumps for the marker strings and confirm none is present.",
    dep: ["audit-log", "targets-and-variables"]
  },
  "correlation-ids": {
    s: "A unique identifier attached to each transaction and passed to the application and logs, so a firewall event can be joined to application logs and user reports.",
    d: "The firewall generates or accepts an identifier, adds it to the request forwarded upstream, writes it to its own log and often returns it in a response header. A support agent holding a block page ID can find the exact event. It also ties together multi-stage events such as a rule match and a later rate limit. It is hard to do safely: accepting an identifier from the client allows log injection or spoofing, so many products always generate their own.",
    k: ["Generate always vs. trust the client's value: generating prevents forgery but breaks trace continuity; trusting preserves end-to-end traces from upstream proxies.", "Show the ID on block pages vs. hide it: showing it lets users report problems quickly but gives attackers a log-search key."],
    p: ["Accepted client IDs include newline characters that forge extra log lines.", "The identifier is not passed upstream, so the application's logs cannot be joined to the block."],
    v: "Send a request, read the identifier from the response header, and find that exact value in the firewall log and in the backend's access log for the same request.",
    dep: ["audit-log", "upstream-connection-pool"]
  },
  "metrics-and-dashboards": {
    s: "Aggregated counters and charts of requests, blocks, rule hits, scores, latency and errors, which show trends and anomalies faster than reading logs.",
    d: "The engine exports counters by rule, application, action and result, and timing histograms for inspection. Dashboards show block rate, top rules, top clients and added latency; alerts fire on spikes. This is where operators notice a bad rule release or an attack. It is hard because high-cardinality labels such as client address or path overwhelm the metrics store, and because aggregates hide the long tail of rare rules.",
    k: ["Per-rule metrics vs. aggregate only: per-rule shows exactly which rule changed; aggregate is cheaper but forces a log search to diagnose.", "Metrics at the firewall vs. derived from logs: in-engine metrics are fast and cheap; log-derived metrics are richer but delayed."],
    p: ["A block rate alert based on a fixed threshold fires every night at batch time and is muted, then misses a real spike.", "Per-client labels create millions of series and bring the metrics system down."],
    v: "Deploy a rule that blocks a known test path, request it repeatedly, and confirm the dashboard's rule hit counter and block rate move within the refresh interval and an alert threshold fires.",
    dep: ["audit-log", "rule-cost-profiling"]
  },
  "siem-export": {
    s: "Forwarding firewall events to a central security information system in a standard format, so they can be correlated with identity, network and endpoint events.",
    d: "Events are shipped by syslog, a message queue or an HTTP collector in a structured format. The central system joins them with other sources to spot campaigns: the same address probing the firewall, then logging in elsewhere. Mapping fields consistently, such as client address, rule id and severity, is most of the work. It is hard because event volume can overwhelm the receiver and because delivery gaps leave holes in investigations.",
    k: ["Push events vs. pull from storage: push is near real time; pull lets the receiver control load but adds delay.", "Send all events vs. only blocks and high severity: all events enable hunting but cost far more; filtered events are cheap but hide reconnaissance."],
    p: ["The collector is down for hours and events are dropped instead of buffered, leaving a gap in an incident timeline.", "Field names change in a firewall upgrade and correlation rules in the receiver silently stop matching."],
    v: "Generate a block, then find it in the central system with the same rule id, client and correlation ID, and confirm the event time is within the agreed delay.",
    dep: ["audit-log", "correlation-ids", "sensitive-data-redaction"]
  },
});
