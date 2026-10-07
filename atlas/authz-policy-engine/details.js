// Details part 1: administration, testing and verification, enforcement points.
ATLAS.details("authz-policy-engine", {
  "policy-authoring-console": {
    s: "The interface where administrators and developers write, edit and preview policy and relationship data, with validation as they type and a view of what the change would affect.",
    d: "A web console and a command-line tool both talk to the same administration API. They offer a text editor with schema-aware completion, a form view for common role assignments, and a diff against the active version. Saving runs the parser and static analyzer before anything is stored. The hard part is serving two audiences: security engineers who want precise text, and business owners who want to tick boxes without understanding evaluation order.",
    k: ["Text editor versus form builder: text gives full expressiveness and reviewable diffs, while forms are safer for non-experts but hide the rules they generate.", "Direct edit versus edit through version control: a console that writes live is fast, but bypasses review and leaves no clean history."],
    p: ["A console that applies changes instantly lets a typo reach production with no review and no way to see who made it.", "Forms that generate policy text nobody reads leave rules no human can explain later."],
    v: "Edit a rule in the console, introduce a type error, and confirm it is rejected with a line number before saving. Fix it and confirm the diff against the active version shows exactly the change.",
    dep: ["policy-syntax-and-parser", "static-analyzer", "policy-store"]
  },
  "policy-version-control": {
    s: "Keeps every policy and schema revision with author, time and message, so any decision can be tied to the exact rules in force and any change can be reverted.",
    d: "Policy lives in a repository or an equivalent versioned store, with immutable revisions identified by a hash or sequence number. Each activated bundle records the revision it was built from, and every decision log entry carries that identifier. Branches allow staged work and pull-request style review. The difficulty is that policy has companion data, such as role assignments, that changes on a different clock, so a revision of rules alone does not reproduce an old decision.",
    k: ["Policy in a code repository versus in the engine's own database: a repository gives mature review and tooling, while an internal store keeps one system of record but needs its own history features.", "Version rules and data together versus separately: together makes decisions reproducible, separately lets data change constantly without a policy release."],
    p: ["Rolling back rules without rolling back the schema they depend on leaves the engine rejecting every request.", "Data changes outside version history make an old incident impossible to reconstruct."],
    v: "Pick a decision from last week in the log, check out the revision it names and replay the request against it; confirm the replay returns the same result and reasons.",
    dep: ["policy-store"]
  },
  "change-review-workflow": {
    s: "Requires a second person, and for sensitive areas the owning team, to approve a policy change before it is activated, with automated checks gating the request.",
    d: "A proposed change opens a request that triggers the unit tests, static analysis and an impact report. Ownership metadata on each policy namespace routes the request to the right approvers, and sensitive areas require more than one. Approval produces a signed record linked to the revision. The hard problem is review quality: a thousand-line diff to a role table gets approved without reading, so the workflow depends on summarizing the effective change in terms of who gains or loses access.",
    k: ["Mandatory human approval versus automatic merge on green checks: approval catches intent errors that tests cannot, but slows urgent fixes and breeds rubber-stamping.", "Approvers by code ownership versus by security team: owners know the domain, while a central team sees cross-domain effects and becomes a bottleneck."],
    p: ["An emergency bypass path that is used routinely becomes the real process and removes the review it was meant to preserve.", "Approvers shown only a textual diff cannot tell that one line grants every employee access."],
    v: "Open a change that widens access to a protected namespace and confirm it cannot be activated until the namespace owner approves, and that the approval is recorded against the revision.",
    dep: ["policy-version-control", "policy-impact-analysis", "policy-unit-tests"]
  },
  "delegated-administration": {
    s: "Lets team leads and resource owners grant access within their own area without being able to change anything outside it, avoiding a central administrator for every request.",
    d: "Administrative rights are themselves permissions in the model: a subject may assign roles only on a given scope, and only roles at or below their own level. The engine checks these rights when a relationship write or role assignment arrives. Common needs are time-limited grants and approval chains. The difficulty is privilege escalation: a delegate who can grant a role that includes the right to grant roles can rebuild the whole tree, so the grant rules need explicit ceilings.",
    k: ["Grant-what-you-hold versus separate administrative roles: the first is simple and intuitive, but gives every holder of a power the ability to spread it.", "Owner-managed access versus central control: owner control scales with the organization, at the cost of inconsistent practice and harder audits."],
    p: ["Permission to assign roles that includes assigning the role-assigner role lets a delegate create unlimited administrators.", "Delegation never revoked after a team lead leaves leaves orphaned administrators."],
    v: "As a team lead, grant a member a role on your own project and confirm it works; attempt the same grant on another team's project and a role above your own, and confirm both are refused and logged.",
    dep: ["role-based-model", "relationship-write-api", "scoped-roles"]
  },
  "tenant-and-namespace-admin": {
    s: "Creates and configures isolated partitions of policy and data, one per customer, product or environment, each with its own schema, administrators and quotas.",
    d: "A namespace owns a schema, a policy set, a relationship store partition and a list of administrators. Creating one provisions storage, default roles and API credentials. Quotas bound how many relationships or policy rules it may hold. Sharing across namespaces is either forbidden or done through explicit references. The hard part is lifecycle: deleting a tenant must remove its data everywhere, including caches, logs and backups, and moving a tenant between clusters must not drop access mid-move.",
    k: ["One namespace per tenant versus one shared schema with a tenant attribute: separate namespaces isolate failures and customization, but multiply operational objects.", "Hard quotas versus soft limits: hard quotas protect neighbors, while soft limits avoid surprising an important customer with sudden denials."],
    p: ["A deleted tenant's relationships left in a cache or index can resurface when the identifier is reused.", "No quota lets one tenant's runaway import fill storage for everyone."],
    v: "Create a tenant, write relationships, then delete it; confirm that checks return not-found, that its storage partition is empty and that a new tenant with the same name starts with no access.",
    dep: ["tenant-isolation", "policy-store", "schema-and-types"]
  },
  "policy-impact-analysis": {
    s: "Computes who would gain or lose access, and on which resources, if a proposed change were activated, so reviewers see consequences instead of syntax.",
    d: "The analyzer evaluates a sample or the full set of recent decisions, or enumerates subject and resource pairs, under both the current and the proposed policy, and reports the differences grouped by role, resource type and subject count. For relationship models it can compute reachability changes by diffing graph traversals. The difficulty is scale: the space of possible requests is enormous, so analysis relies on sampling, on logs of real traffic and on symbolic methods that reason over whole classes of requests.",
    k: ["Replay of recent traffic versus exhaustive enumeration: replay is cheap and relevant to real use, but misses rare paths that an attacker would try.", "Per-subject report versus summarized by role: subject-level detail is precise but overwhelming, while role summaries are readable but can hide individual exceptions."],
    p: ["An analysis based on last week's traffic reports zero impact for a quarterly workflow that the change breaks.", "Reports that list thousands of affected users are dismissed unread."],
    v: "Propose removing a role from a group of fifty users, run the analysis and confirm it lists those fifty users and the resources they lose, then activate and check that observed denials match.",
    dep: ["decision-log", "rule-evaluator", "shadow-evaluation"]
  },
  "policy-unit-tests": {
    s: "Executable examples of the form \"this subject may or may not do this action on this resource\" that run against the policy in isolation before every change.",
    d: "A test file declares fixtures, such as relationships, attributes and a time, and a table of expected decisions, including expected denials. The runner loads the candidate policy into a throwaway evaluator and compares each answer and, optionally, the reasons. Tests run in the review pipeline and locally. The hard part is meaningful coverage: authors write the cases they expect to pass, and the dangerous bugs are the unexpected grants that no one thought to assert against.",
    k: ["Example-based tests versus property-based tests: examples are easy to read and document intent, while properties such as \"no external user reaches a private document\" catch cases nobody listed.", "Tests next to the policy versus in a separate suite: colocation keeps them current, but a separate suite resists being edited to make a failing change pass."],
    p: ["A suite made only of allow cases passes against a policy that allows everything.", "Tests that depend on live attribute lookups fail intermittently and are ignored."],
    v: "Change a rule to broaden access and confirm at least one test fails, naming the expectation violated. Revert, and confirm all tests pass in under a few seconds.",
    dep: ["rule-evaluator", "policy-compiler"]
  },
  "decision-replay": {
    s: "Re-runs logged historical requests against a different policy or data snapshot to find which decisions would change before the new version goes live.",
    d: "The replayer reads decision logs, reconstructs each request with its recorded context, and evaluates it under a candidate policy using the data as it was at the time or as it is now. A diff report lists flipped decisions. It needs the log to record the full input and the policy revision. The difficulty is determinism: if the original decision used attributes fetched live, the replay cannot reproduce them unless they were captured, and logs that omit them make replay approximate.",
    k: ["Replay with logged context versus current data: logged context isolates the policy change, while current data answers what would happen now but mixes two kinds of change.", "Full-traffic replay versus sampled: full replay finds rare breaks, at the cost of compute and handling the privacy of everything logged."],
    p: ["Logs that store only the decision, not the inputs, make replay impossible for attribute-driven rules.", "Replaying production requests in a test environment copies personal data into a less protected place."],
    v: "Replay one day of logged decisions against the current policy and confirm zero flipped decisions; then replay against a candidate that tightens one rule and confirm exactly the expected requests flip.",
    dep: ["decision-log", "rule-evaluator", "policy-version-control"]
  },
  "shadow-evaluation": {
    s: "Runs a candidate policy alongside the live one on real traffic, returning only the live answer while recording where the two disagree.",
    d: "The decision service evaluates each request twice, once with the active policy and once with the candidate, and logs a disagreement record when results differ. Enforcement uses only the live result. Disagreement rates by route and subject type tell the team whether a rollout is safe. The difficulty is cost and side effects: doubling evaluation raises latency and load, so shadowing is often sampled or run asynchronously, and the candidate must never trigger obligations such as notifications.",
    k: ["Inline shadow versus asynchronous shadow: inline sees exact live context, but adds latency, while asynchronous is cheaper and may see slightly different data.", "Shadow for every request versus a sampled fraction: full shadowing finds rare disagreements, while a sample can miss the one request class that breaks."],
    p: ["A candidate that fires obligations such as audit alerts or approvals while shadowed creates noise or real effects.", "Promoting after a quiet hour misses a weekly job that exposes the disagreement."],
    v: "Activate shadowing for a candidate that removes one role's access, drive requests from that role, and confirm live decisions are unchanged while the disagreement log shows each affected request.",
    dep: ["rule-evaluator", "decision-log", "policy-activation"]
  },
  "access-simulation": {
    s: "Answers what-if questions, such as what a given user can reach or whether a hypothetical person in a given role could read a given record, without touching real data.",
    d: "A simulator takes a hypothetical subject with chosen roles, attributes and relationships, overlays them on a snapshot of policy and data, and runs checks or list queries against it. Administrators use it before granting access, and auditors use it to test separation-of-duty claims. It reuses the production evaluator for fidelity. The challenge is making the overlay behave as a real subject would, including inherited groups and attribute-derived roles, without writing anything durable.",
    k: ["Overlay on production data versus a copied sandbox: an overlay is accurate and current, but needs read access to sensitive data, while a copy is safer and goes stale.", "Reuse the production evaluator versus a separate simulator: reuse guarantees the same answers, a separate one can be faster but drifts."],
    p: ["A simulator that skips attribute-derived roles reports a user cannot reach data they actually can.", "Simulation results shown to users leak the existence of resources they cannot see."],
    v: "Simulate a new hire with the standard onboarding roles and confirm the reported reachable resources match what an actual account with those roles can open after creation.",
    dep: ["list-objects-query", "rule-evaluator", "request-context-assembly"]
  },
  "formal-verification": {
    s: "Uses logic solvers to prove properties about a policy, such as \"no external user can ever read a record marked confidential\", across all possible requests.",
    d: "The policy is translated into logical constraints, and a solver searches for any request that violates a stated property, returning a counterexample or a proof. It can also compare two policy versions for equivalence or containment. The method needs a policy language with simple, decidable semantics. Difficulties are scope and trust: the proof covers the model of the policy, not the code that implements it, and expressive features such as arbitrary functions fall outside what a solver can handle.",
    k: ["Restrict the language to a verifiable subset versus allow full expressions: a subset enables proofs and fast evaluation, while full expressions fit more needs but cannot be proven.", "Prove properties versus test examples: proofs cover every request, but writing the property correctly is hard and a wrong property proves nothing useful."],
    p: ["A proof of a property that omits a critical attribute gives false confidence while the real hole stays open.", "A solver that times out on a large policy is silently treated as a pass."],
    v: "State a property, introduce a rule that violates it, and confirm the verifier returns a concrete counterexample request. Remove the rule and confirm it reports the property holds.",
    dep: ["policy-compiler", "schema-and-types", "static-analyzer"]
  },
  "conflict-and-gap-detection": {
    s: "Finds rules that contradict each other, rules that can never fire, and requests that no rule addresses, so policy behavior is intended rather than accidental.",
    d: "Analysis walks the compiled policy to find overlapping rules with opposite effects, dead rules shadowed by earlier ones, and resource types or actions with no matching rule and so only the default. Reports list each with the rules involved. Combining algorithms define which conflicts matter. The difficulty is volume: large policy sets produce hundreds of benign overlaps, so useful tools rank by whether the conflict can arise for real subjects and resources.",
    k: ["Report every overlap versus only reachable ones: complete reports miss nothing but bury the real problems, while reachability filters need data and can hide a rare case.", "Fail the build on a conflict versus warn: failing forces cleanup, though it blocks emergency changes for pre-existing conflicts."],
    p: ["An unmatched action silently falls to the default decision, so a new endpoint ships either wide open or unusable.", "Teams suppress warnings wholesale to get a build through."],
    v: "Add two rules matching the same request with allow and deny, and confirm the analyzer reports both rules and the effective result under the configured combining algorithm.",
    dep: ["combining-algorithms", "policy-matching-index", "static-analyzer"]
  },
  "coverage-analysis": {
    s: "Measures which rules, roles and resource types were exercised by tests or by real traffic, and flags the ones that never were as unproven or unused.",
    d: "Instrumentation in the evaluator records which rules contributed to each decision. Aggregating over a test run gives test coverage, and over production logs gives usage. Rules never used in production are candidates for removal, and rules never covered by tests are risks. The difficulty is interpretation: rare but critical rules, such as break-glass access, are meant to be unused, so a coverage number cannot be turned into an automatic cleanup.",
    k: ["Rule-level versus decision-path coverage: rule coverage is simple and cheap, while path coverage finds untested combinations but grows combinatorially.", "Prune unused rules automatically versus review them: automation keeps policy small, but removes emergency rules that are rarely and critically needed."],
    p: ["Treating a high coverage percentage as quality while tests assert nothing about denials.", "Removing a rule unused for ninety days breaks a quarterly report."],
    v: "Run the test suite with coverage on, list rules with zero hits, and confirm that a rule you know is untested appears in the list with its location.",
    dep: ["rule-evaluator", "policy-unit-tests", "decision-log"]
  },
  "gateway-enforcement": {
    s: "A reverse proxy or gateway asks the engine before forwarding each request, protecting many services with one policy at the edge.",
    d: "The gateway extracts the subject from a validated credential, maps the HTTP method and path to an action and resource, calls the decision API, and either forwards the request or returns a refusal. It often copies decision attributes into headers for downstream use. This gives uniform coverage and needs no change to services. The limit is coarseness: the gateway knows routes, not records, so it cannot decide that this user may read only their own orders.",
    k: ["Coarse checks at the gateway versus fine checks in services: the gateway is uniform and cheap to adopt, but only services know which records a request touches.", "Gateway-only enforcement versus defense in depth: one point is simple to reason about, while internal services reachable another way are left unprotected."],
    p: ["Internal services reachable directly, bypassing the gateway, are not protected at all.", "Route-to-action mapping drifts from service routes, leaving new paths unguarded."],
    v: "Send a request without permission to a protected route and confirm a refusal at the gateway and no call reaches the service; send an allowed one and confirm it passes with identity headers set.",
    dep: ["check-endpoint", "token-claims", "unreachable-engine-handling"]
  },
  "service-sidecar": {
    s: "A decision agent that runs next to each service instance, answering checks over a local connection from a locally held copy of policy and data.",
    d: "The sidecar receives bundles from the control plane and serves the same decision API on a local socket, so a check costs microseconds with no network hop. Services call it as if it were the central engine. It keeps working if the control plane is down, using the last good bundle. The difficulty is the data: policy is small, but relationship or attribute data can be large, so sidecars hold a subset and fall back to a remote call for the rest.",
    k: ["Local sidecar versus central service: local gives low latency and independence from the network, but spreads copies that can disagree and need updating.", "Full data copy versus partial plus fallback: a full copy is fastest, but cannot fit large graphs and widens the damage of a compromised host."],
    p: ["A sidecar that stops receiving updates keeps granting access that was revoked long ago, with no visible error.", "Every instance holding sensitive data copies it onto many more hosts."],
    v: "Stop the control plane, confirm checks still succeed from the cached bundle, then revoke a role and confirm the sidecar reports its bundle age and rejects once updates resume.",
    dep: ["bundle-distribution", "rule-evaluator", "local-data-replication"]
  },
  "in-process-library": {
    s: "Embeds the evaluator inside the application so a check is a function call, with no network, at the cost of tying the engine's release cycle to every service.",
    d: "The application links the evaluator and loads a policy bundle, calling it with a request object. Latency is smallest and there is no extra process, which suits very high call rates and offline clients. Updates arrive by polling or a push channel. The cost is coupling: every service must upgrade the library to get engine changes, versions of the evaluator differ across the fleet, and a bug in it runs in the same process as business code.",
    k: ["Embedded versus remote evaluator: embedding removes a hop and a failure mode, but forces coordinated upgrades and one-per-service resource use.", "One library for all languages versus per-language ports: one core, usually bound through WebAssembly or a native interface, keeps semantics identical, whereas ports each need conformance tests."],
    p: ["Different library versions across services evaluate the same policy differently during a rollout.", "A library that panics on malformed policy brings down the host application."],
    v: "Run the shared conformance suite against each embedded build and confirm identical decisions across all of them; update one service's library and confirm the others are unaffected.",
    dep: ["rule-evaluator", "policy-activation"]
  },
  "data-layer-filtering": {
    s: "Applies authorization inside the database query itself, by adding predicates or row-level rules, so a query returns only rows the subject may see.",
    d: "Two approaches exist. The engine converts a policy into a query condition through partial evaluation and the application appends it to its query, or the database enforces row-level rules by reading a session setting that identifies the subject. Either way, the filter runs where the data is, so pagination and counts stay correct. The difficulty is translation: not every rule maps to a database predicate, and a condition requiring graph traversal can be slow or impossible.",
    k: ["Query predicate from partial evaluation versus post-filtering results: predicates keep pagination and performance right, but only handle rules the database can express.", "Application-supplied filters versus database-enforced rules: database enforcement cannot be forgotten by a developer, but moves policy logic into a second place."],
    p: ["A query path that forgets the appended predicate returns every row, and tests with a single user do not notice.", "Session subject settings that leak across pooled connections expose one user's rows to the next."],
    v: "As a restricted user, run the same list query as an administrator and confirm the row set is a strict subset, the total count matches it and a direct fetch of a hidden row returns not-found.",
    dep: ["partial-evaluation", "decision-response", "attribute-based-model"]
  },
  "list-filtering": {
    s: "Reduces a collection, such as a search result or inbox, to the items the caller may see, without checking each item individually at large cost.",
    d: "Strategies include asking the engine for the objects a subject may reach and intersecting with the query, converting policy to a filter pushed into search, or checking items in batches after fetching and dropping denied ones. The right choice depends on selectivity. The challenge is paging: filtering after the fact yields short pages and wrong totals, while filtering before requires the engine to produce candidate sets that stay consistent with the data being listed.",
    k: ["Filter before the query versus after: before keeps pages full and counts honest, while after is simple but wastes work and can leak information through counts.", "Ask for the allowed set versus check each candidate: the allowed set is quick when small, but a subject with access to millions makes it impractical."],
    p: ["Result counts or facets computed before filtering reveal the existence of items the user cannot see.", "A page that is mostly filtered out looks empty and the user stops paging."],
    v: "As a user with access to two of one thousand matching items, run a search and confirm exactly two results, a correct total, and no hidden item appears in counts or suggestions.",
    dep: ["list-objects-query", "batch-check", "data-layer-filtering"]
  },
  "ui-capability-hints": {
    s: "Tells the interface what the current user may do, so buttons and menus the user cannot use are hidden or disabled instead of failing after a click.",
    d: "On page load, the client asks for a set of capabilities, such as edit, share and delete, for the objects in view, using a batch check, and renders controls accordingly. The result is a hint, not enforcement: the server still checks every action. It improves experience and avoids probing. The difficulty is cost and staleness: a page of fifty rows with five actions each is hundreds of checks, and a hint cached in the browser may no longer match after a permission change.",
    k: ["Hide controls versus show disabled: hiding is cleaner, while disabled controls with an explanation tell users what to request.", "Compute hints on the server in the page payload versus ask from the client: server inclusion saves a round trip, but couples page rendering to the engine's latency."],
    p: ["Treating a hidden button as security lets anyone who calls the endpoint directly do the action.", "Hints computed once per session stay wrong after the user's role changes."],
    v: "Remove a user's edit permission while their page is open, reload, and confirm the edit control is gone; call the edit endpoint directly and confirm the server still refuses.",
    dep: ["batch-check", "decision-response", "consistency-tokens"]
  },
  "unreachable-engine-handling": {
    s: "Defines what an enforcement point does when the decision service times out or errors: deny, allow, or use a cached answer, per route and per risk.",
    d: "Every caller wraps the decision call with a timeout, retries with a limit, and a fallback policy. Safe defaults are deny for sensitive operations and a short-lived cached decision for read-mostly paths. A circuit breaker avoids hammering a struggling engine. Telemetry counts fallbacks so they are visible. The difficulty is that a blanket rule is wrong both ways: fail-closed everywhere turns an engine outage into a total outage, and fail-open turns it into a security incident.",
    k: ["Fail closed versus fail open: closed protects data but couples availability to the engine, whereas open keeps service running at the price of unauthorized access during the incident.", "Serve a stale cached decision versus deny: stale decisions keep users working, but may honor a permission just revoked."],
    p: ["A fail-open default added during a past outage and never revisited quietly remains in production.", "Retries without a limit multiply load on an already struggling engine."],
    v: "Block the engine's network path in a test environment and confirm sensitive routes return a refusal, cached read routes continue within their bound, and a fallback counter and alert fire.",
    dep: ["decision-cache", "check-endpoint", "high-availability"]
  },
});
