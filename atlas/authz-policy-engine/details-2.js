// Details part 2: decision API, evaluation engine, policy models.
ATLAS.details("authz-policy-engine", {
  "check-endpoint": {
    s: "The core call: given a subject, an action and a resource, plus optional context, return allow or deny. Every other query is built from or alongside it.",
    d: "A request names the subject, the action or relation, the resource and any extra context, and the service returns a decision within a latency target of a few milliseconds. It is exposed over a standard remote-call protocol with a request identifier for tracing. Internally it assembles context, evaluates and logs. The difficulty is definition: what counts as the subject when a service acts for a user, and whether an unknown resource is denied or reported as an error, are choices that must be fixed and documented.",
    k: ["Return only allow or deny versus a structured result with reasons: a boolean is cheap and hard to misuse, while a structured result supports obligations and debugging at higher cost.", "Unknown resource as deny versus as an error: deny is safe, but hides misconfiguration, while an error exposes it and may break callers."],
    p: ["A caller that treats any non-error response as allowed grants access when the engine returns a deny in an unexpected shape.", "Ambiguous subject for service-to-service calls makes a service's own rights stand in for the end user's."],
    v: "Call the endpoint for a known allowed and a known denied triple and confirm correct results, a trace identifier in the response, and one decision log entry per call, within the latency target at the 99th percentile.",
    dep: ["request-context-assembly", "rule-evaluator", "decision-log", "api-authentication-and-versioning"]
  },
  "batch-check": {
    s: "Evaluates many subject, action and resource triples in one call, so a page or a workflow pays one round trip and shares context lookups.",
    d: "The request carries a list of checks, possibly with shared context, and the service evaluates them concurrently, deduplicating repeated sub-questions and reusing fetched attributes. The response preserves order and returns each result or error independently. It is the main tool for user-interface hints and list filtering. The difficulty is limits: unbounded batches consume the whole evaluation budget, so the service caps size and time, and decides whether one failed item fails the batch.",
    k: ["Independent per-item results versus all-or-nothing: independent results are resilient, but callers must handle partial failure carefully.", "Share one snapshot for the whole batch versus one per item: a shared snapshot makes results coherent, while per-item reads give lower latency on cold items."],
    p: ["A batch with ten thousand items runs past the timeout and drops the whole page.", "A caller that ignores per-item errors treats missing results as allowed."],
    v: "Send a batch of one hundred mixed triples and confirm results arrive in request order, match one-by-one checks, and that backend lookups are fewer than one hundred through shared context.",
    dep: ["check-endpoint", "request-coalescing", "snapshot-reads"]
  },
  "list-objects-query": {
    s: "Returns the resources of a given type that a subject can perform an action on, answering \"what can this user reach\" rather than \"may they reach this one\".",
    d: "The engine starts from the subject and walks relationships outward, or inverts the policy, to enumerate matching resources, streaming results with a cursor. It supports building navigation, search filters and access reviews. It is much harder than a check: a check follows one path, while listing may touch every object a subject can reach, so cost depends on the size of the answer and on rule shape. Some rules cannot be enumerated efficiently at all.",
    k: ["Walk the graph from the subject versus intersect with the object list: walking is fast for narrow access, while intersecting wins for broad access to a small object set.", "Precomputed per-subject reachability versus on-demand traversal: precomputing makes lists quick but multiplies write cost and storage."],
    p: ["Listing for an administrator with access to everything runs for minutes and consumes the evaluation budget.", "Results that are correct at the first page become stale by the tenth because data changed between requests."],
    v: "For a user with a known set of fifty reachable documents, list objects and confirm exactly those fifty are returned across pages, and that a check on each returns allow and on a sibling returns deny.",
    dep: ["graph-traversal", "consistency-tokens", "tuple-indexes"]
  },
  "list-subjects-query": {
    s: "Returns the subjects who hold a given permission on a given resource, answering \"who can see this\" for reviews, sharing screens and incident response.",
    d: "The engine starts at the resource and walks relationships backward, expanding groups into members and roles into assignees, and returns the subjects or the structure of why each qualifies. Output may be a flat list or a tree that shows paths. Its use is access review and breach response. The difficulty is size and nesting: a permission granted to a company-wide group returns every employee, so interfaces want counts and grouped results rather than raw lists.",
    k: ["Flat subject list versus expanded tree with reasons: a list is simple to export, while a tree explains who got access and how, at greater cost to compute.", "Resolve group membership fully versus stop at the group: full resolution is exact, but may return millions of entries for broad grants."],
    p: ["Expanding wildcard grants such as \"all authenticated users\" produces a meaningless, enormous result.", "A reverse lookup that skips attribute-based rules understates who really has access."],
    v: "Grant a document to one user directly and to a group of ten, then run the query and confirm eleven subjects are returned, with the group path shown for the ten and a direct grant for the one.",
    dep: ["graph-traversal", "nested-groups", "tuple-indexes"]
  },
  "partial-evaluation": {
    s: "Evaluates a policy with some inputs unknown and returns a residual condition on those inputs, which can be turned into a database filter or search query.",
    d: "Given the known subject and action but an unknown resource, the evaluator simplifies the policy as far as it can and outputs what remains, such as \"resource owner equals user or department equals engineering\". A translator converts that residual into the query language of a data store. This avoids fetching and checking each row. The difficulty is coverage: only a subset of expressions translate cleanly, and the translator must refuse unsupported ones rather than approximate them in a way that over-grants.",
    k: ["Translate residuals to the store's query language versus post-filter: translation is efficient and keeps pagination right, but needs a translator per store and limits expressiveness.", "Fail when a rule cannot be translated versus ignore it: failing is safe and visible, while ignoring is convenient and silently widens access."],
    p: ["A translator that drops an untranslatable deny clause returns rows the user must not see.", "A residual with many alternatives yields a query too slow to run."],
    v: "Request partial evaluation for a user with an owner-or-team rule, apply the residual as a database filter, and confirm the returned rows equal those found by checking every row individually.",
    dep: ["rule-evaluator", "expression-language", "policy-compiler"]
  },
  "decision-response": {
    s: "The shape of an answer: the decision itself, the policy version used, optional reasons, and obligations the caller must carry out, such as masking a field.",
    d: "Beyond allow or deny, a response may carry the matched rules, a policy revision, a decision identifier for log correlation, and obligations or advice. Obligations tell the caller to do something along with the allow, such as redact a column, require a second factor or record a justification. The hard part is enforcement of obligations: the engine can ask, but only the caller can do it, and a caller that ignores an unknown obligation grants more than intended.",
    k: ["Obligations in the response versus separate policy at the caller: obligations keep rules central, but depend on every caller understanding them.", "Return reasons always versus on request: always on speeds debugging, but leaks policy structure to untrusted callers and costs bytes and time."],
    p: ["A caller that ignores obligations it does not recognize turns a conditional allow into a full allow.", "Detailed denial reasons shown to end users reveal what exists and how to get around the rule."],
    v: "Send a request whose policy grants read with a mask obligation and confirm the response includes the decision, policy revision, decision identifier and the obligation, and that the log entry shares that identifier.",
    dep: ["rule-evaluator", "explanation-generator", "policy-version-control"]
  },
  "api-authentication-and-versioning": {
    s: "Authenticates the callers of the decision and administration APIs, limits what each may ask, and keeps request formats stable across engine versions.",
    d: "Callers present machine credentials, such as mutual TLS or signed tokens, and each is limited to specific namespaces and operations: a service may check, an admin console may write. Quotas and rate limits protect the engine. The API is versioned, with additive changes within a version and deprecation windows between versions. The difficulty is the check call itself: asking the engine whether any user may do something is a powerful oracle, so it must be restricted to trusted callers.",
    k: ["Per-service credentials versus one shared credential: per-service allows revocation and attribution, but needs issuing and rotation machinery.", "Strict versioning with long deprecation versus frequent breaking change: stability protects callers, while change velocity is higher without it."],
    p: ["An unrestricted check endpoint lets a compromised low-trust service map out who can access what.", "A silent field change breaks old callers, who then default to treating errors as allow."],
    v: "Call the check API with a credential scoped to another namespace and confirm a refusal; call an old API version after a new release and confirm identical results for the same request.",
    dep: ["tenant-isolation", "check-endpoint"]
  },
  "request-context-assembly": {
    s: "Gathers everything a decision needs: subject identity and attributes, resource metadata, the environment and any caller-supplied context, before rules are evaluated.",
    d: "The request carries some data, such as claims from a validated token and the request time. The assembler fetches the rest from attribute sources, a relationship store or a local cache, within a strict deadline, and merges them with defined precedence between caller-supplied and engine-fetched values. The challenge is trust: caller-supplied attributes are convenient and fast, but a compromised caller can claim anything, so rules must know which attributes are verified.",
    k: ["Trust caller-supplied attributes versus fetch them: supplied is fast and avoids lookups, but lets a misbehaving caller assert its own privileges.", "Fetch all attributes eagerly versus lazily when a rule needs them: lazy avoids wasted lookups, but makes latency depend on which rules fire."],
    p: ["Letting a caller override the subject's department attribute lets any service escalate a user.", "A slow attribute source stalls every decision that needs it."],
    v: "Send a request whose supplied department attribute conflicts with the directory's value and confirm the engine uses the directory value, and that a missing attribute yields a documented default rather than an error.",
    dep: ["subject-attribute-sync", "resource-attribute-fetch", "environment-context", "token-claims"]
  },
  "policy-matching-index": {
    s: "Narrows thousands of rules to the few that could apply to a request, indexing by resource type, action and other fixed fields before any expression is run.",
    d: "On load, rules are indexed by the cheap, discrete parts of their targets: resource type, action and sometimes a path prefix. At decision time the engine looks up candidates and runs only those. Without it, evaluation time grows with the total size of policy. The difficulty is correctness: a rule whose target is too clever for the index must still be found, so a rule that cannot be indexed goes in a fallback list that every request scans.",
    k: ["Index on a fixed set of fields versus a general decision tree: fixed fields are simple and predictable, while a tree prunes more but costs complexity and build time.", "Build the index at load versus lazily: load time makes decisions uniformly fast, while lazy shortens startup but adds first-use latency."],
    p: ["A rule with a wildcard target lands in the fallback list and slows every request as the list grows.", "An index built from a stale policy revision misses a newly added rule."],
    v: "Load ten thousand rules, send a request that should match three, and confirm via evaluator counters that only a small candidate set was run and latency is flat as total rules increase.",
    dep: ["policy-compiler", "schema-and-types"]
  },
  "rule-evaluator": {
    s: "Executes the matched rules against the assembled context and returns each rule's effect, with deterministic behavior and bounded cost.",
    d: "The evaluator walks the compiled form of each candidate rule, evaluating conditions over attributes, set membership and relationship checks, and yields an effect plus a trace of what it consulted. Evaluation is side-effect free and ideally pure, so results can be cached and replayed. The hard parts are undefined values, such as a missing attribute in a comparison, and keeping the cost of expressions bounded, so both are given strict, documented semantics.",
    k: ["Undefined treated as false versus as an error: false is forgiving and fails closed for allow rules, but turns a missing attribute into a silent mismatch.", "Interpreted tree versus compiled bytecode: an interpreter is simple and debuggable, while compiled forms are faster, at the cost of a build step and harder traces."],
    p: ["A deny rule whose condition is undefined because an attribute is missing does not fire, so access that should be blocked is allowed.", "Non-deterministic functions such as the current time make a decision impossible to replay."],
    v: "Evaluate the same request twice with the same context and confirm identical results and traces; remove a required attribute and confirm the documented outcome, not a crash.",
    dep: ["policy-compiler", "expression-language", "request-context-assembly"]
  },
  "combining-algorithms": {
    s: "Defines how multiple rule outcomes, some allowing and some denying, become one decision, for example deny wins or first applicable.",
    d: "Several rules may match one request with different effects. A combining algorithm turns them into one answer: deny-overrides, permit-overrides, first-applicable, or an explicit priority. The same algorithm applies within and across policy sets, and a default decision applies when none match. The difficulty is intuition: authors imagine each rule alone, and a combination such as a broad permit and a narrow exception behaves differently under each algorithm.",
    k: ["Deny overrides versus first applicable: deny overrides is safe and order-independent, while first applicable is easier to read, but makes rule order security-critical.", "Default deny versus default allow when nothing matches: default deny is safe for unknown cases, whereas default allow suits open systems and risks exposure."],
    p: ["Reordering rules in a first-applicable policy during a cleanup silently changes who has access.", "Mixing algorithms across policy sets leaves no one able to predict the result."],
    v: "Present a request matching one allow rule and one deny rule and confirm the result under the configured algorithm; switch algorithms in a test and confirm the expected change.",
    dep: ["rule-evaluator", "deny-and-exceptions"]
  },
  "graph-traversal": {
    s: "Answers relationship checks by walking edges from a subject toward a resource, following rewrite rules, with depth limits, cycle handling and parallel exploration.",
    d: "A check such as \"can this user edit that document\" expands into sub-questions: is the user an owner, or an editor, or a member of a group that is, or an editor of the parent folder. The traversal evaluates these in parallel, short-circuits on the first success for unions, and tracks visited nodes to avoid cycles. Reads go through the tuple indexes. It is hard because fan-out is large, so engines bound depth and breadth and cache intermediate results.",
    k: ["Forward search from the subject versus backward from the resource: the cheaper direction depends on whether users or objects have more edges, so engines estimate or run both.", "Parallel exploration versus sequential: parallel cuts latency, but multiplies load on the store and complicates short-circuiting."],
    p: ["A deeply nested group chain with a cycle loops forever without visited tracking.", "A popular group with a million members makes naive expansion read a million edges."],
    v: "Build a nesting of five groups plus a cycle, run a check that is allowed only through the deepest path, and confirm it returns allow, ends in bounded time, and reports the path.",
    dep: ["tuple-indexes", "relation-rewrite-rules", "evaluation-limits", "snapshot-reads"]
  },
  "evaluation-limits": {
    s: "Caps the time, depth, memory and number of lookups a single decision may use, so one pathological request cannot starve the rest.",
    d: "Each request has a deadline, a maximum traversal depth, a limit on store reads and a cap on expression cost. When a limit is hit the engine returns a defined outcome: deny with a distinct reason code, or an error the caller must treat as deny. Limits are set per route and per tenant. The difficulty is tuning: too tight and legitimate deep hierarchies are refused, too loose and one tenant's expensive rule harms everyone.",
    k: ["Deny on limit versus error: deny is simple and safe, but conflates a real refusal with a resource problem, while an error is honest but must be handled by every caller.", "Per-request limits versus per-tenant budgets: per-request is easy and fair, while tenant budgets stop a flood of individually cheap requests."],
    p: ["A limit hit that returns plain deny looks like a permission failure, and users file access tickets for a performance fault.", "Limits applied only to checks, not list queries, leave the expensive path unprotected."],
    v: "Create a hierarchy deeper than the depth limit, run a check through it, and confirm a distinct limit-exceeded reason, an incremented metric, and that other requests keep their normal latency.",
    dep: ["graph-traversal", "rule-evaluator"]
  },
  "explanation-generator": {
    s: "Produces a human-readable account of why a decision came out as it did: the rules that fired, the relationships followed and the attributes that mattered.",
    d: "During evaluation the engine records a trace of consulted rules and edges; the generator turns the trace of the deciding path into a short chain, such as \"allowed because user is a member of the group that is an editor on the parent folder\". It supports support staff, developers and auditors. The challenge is cost and disclosure: traces slow evaluation, so they are produced on demand by re-evaluating, and showing them to end users reveals internal structure.",
    k: ["Always trace versus re-evaluate on demand: always tracing makes every decision explainable, but adds overhead, while on-demand needs the same inputs to still be available.", "Minimal deciding path versus full trace: the minimal path is readable, while the full trace shows rejected alternatives that explain surprising denies."],
    p: ["An explanation generated against current data differs from what happened at decision time and misleads an investigation.", "Exposing explanations to end users discloses group names and internal roles."],
    v: "Ask why a known allowed request succeeded and confirm the explanation lists each relationship in the path in order; ask why a denied one failed and confirm it names the missing permission.",
    dep: ["rule-evaluator", "graph-traversal", "decision-log"]
  },
  "role-based-model": {
    s: "Grants permissions to named roles and assigns roles to subjects, so access is understood and audited as who holds which job rather than per-person rights.",
    d: "A role is a set of permitted actions, usually on resource types. A subject holds roles directly or through groups, and a check asks whether any held role includes the action. It is simple, easy to explain to auditors and fast to evaluate. It struggles with scale in variety: as exceptions grow, organizations create a role per variation, and role explosion makes the model as hard to reason about as the per-person rights it replaced.",
    k: ["Coarse roles versus fine roles: coarse roles are few and understandable, but over-grant, while fine roles fit needs and multiply into thousands.", "Static role assignment versus assignment derived from attributes: static is auditable, whereas derived roles stay current automatically but are less visible."],
    p: ["Role explosion, where hundreds of near-duplicate roles exist, makes reviews meaningless.", "A role created for one project and never removed accumulates unrelated permissions over time."],
    v: "Assign a user the viewer role, confirm reads succeed and writes fail, then remove the role and confirm both fail, with the change visible in the next check without a restart.",
    dep: ["policy-store", "tuple-model", "nested-groups"]
  },
  "hierarchical-roles": {
    s: "Lets one role inherit all the permissions of another, such as admin including editor including viewer, so higher roles need not repeat lower ones.",
    d: "Roles form a partial order, and holding a role implies holding everything below it. The engine expands inheritance at load, flattening it into a set per role, or at check time by following inherit edges. It keeps role definitions short. The difficulty is evolution: adding a permission to a base role grants it to everyone above, which may be unintended, and inheritance across scopes, such as organization role over project role, must be defined carefully.",
    k: ["Inheritance versus explicit lists: inheritance is concise and consistent, while explicit lists make each role's content visible and changes local.", "Single versus multiple inheritance: multiple inheritance models real organizations, but creates ambiguity and cycles that must be rejected at load."],
    p: ["Adding a sensitive permission to a base role silently grants it to every role above.", "A cycle in the inheritance graph makes expansion loop or crash on load."],
    v: "Define editor inheriting viewer, add a permission to viewer, and confirm that an editor-holding user gains it immediately; introduce an inheritance cycle and confirm the load is rejected with the cycle path.",
    dep: ["role-based-model", "static-analyzer"]
  },
  "attribute-based-model": {
    s: "Decides from properties of the subject, resource, action and environment, such as department, sensitivity label and time of day, so rules fit situations roles cannot.",
    d: "A rule is a condition over attributes: the subject's clearance must be at least the resource's classification, the resource's region must match the subject's, access only during the shift. The same rules cover millions of resources without per-resource assignments. The costs are visibility and data: nobody can easily list who can access what, since it depends on attribute values, and the rules are only as good as the freshness and accuracy of attributes.",
    k: ["Attributes versus roles: attributes express fine-grained and contextual rules without enumeration, but make access reviews and reverse queries hard.", "Central attribute store versus attributes at request time: central is consistent and auditable, while request-time attributes are fresh but unverifiable."],
    p: ["A mislabeled sensitivity attribute silently exposes a document, and no assignment exists to review.", "Rules that depend on dozens of attributes become unreadable and untested."],
    v: "Set a document's sensitivity to restricted, check access for users with and without clearance, and confirm results; change one attribute and confirm the next check reflects it within the freshness bound.",
    dep: ["expression-language", "subject-attribute-sync", "resource-attribute-fetch"]
  },
  "relationship-based-model": {
    s: "Derives permission from how a subject is connected to a resource through a graph of relations like owner, member and parent, which fits shared and nested content.",
    d: "Data is stored as edges, such as \"user A is editor of document B\" and \"document B is in folder C\", and a schema defines derived relations, for example that folder editors can edit contained documents. A check is graph reachability. It matches products where users share things with each other and hierarchies nest. The difficulty is scale and consistency: the graph holds billions of edges, checks are traversals, and a permission change is a write that must be ordered against reads.",
    k: ["Relationship graph versus roles with scopes: the graph models sharing and nesting naturally, but costs a large store and consistency machinery.", "Derive permissions at check time versus materialize them: derivation keeps writes cheap and data small, while materializing makes checks fast and writes expensive."],
    p: ["A single wide edge, such as a company-wide group granted everything, makes traversals huge.", "Graph edges not removed when a resource is deleted leave stale access when ids are reused."],
    v: "Share a folder with a group, add a document to the folder, and confirm group members can open it; move the document out and confirm access disappears on the next consistent read.",
    dep: ["tuple-model", "graph-traversal", "relation-rewrite-rules"]
  },
  "scoped-roles": {
    s: "Binds a role to a scope, such as an organization, project or single resource, so the same role name carries different power in different places.",
    d: "An assignment is a triple of subject, role and scope. A check finds roles held at the resource's scope or any enclosing scope and tests them for the action. This keeps role counts small while letting a person be an admin of one project and a viewer of another. The difficulty is the scope tree: its structure must be known to the engine, moves of resources between scopes change who has access, and inheritance direction must be explicit.",
    k: ["Inherit down the scope tree versus no inheritance: inheritance makes organization admins implicitly powerful everywhere, and no inheritance requires many explicit assignments.", "Scope as part of the assignment versus a role per scope: scope-in-assignment keeps the role list short, but makes assignment records the main thing to audit."],
    p: ["Moving a project to a new organization silently changes who inherits access to it.", "A role granted at organization scope for convenience reaches every project, including ones created later."],
    v: "Make a user project-admin on one project, confirm full control there and a refusal on another, then move the first project under a different organization and confirm inherited access changes as designed.",
    dep: ["role-based-model", "resource-hierarchy-edges", "delegated-administration"]
  },
  "ownership-and-sharing": {
    s: "Grants rights from creating or being given a resource: owners control it, and can share it with people, groups or links at chosen levels.",
    d: "The creator becomes an owner by an automatic relationship. Owners may add editors, commenters and viewers, set link sharing, and transfer ownership. Sharing records are relationships, so the graph model handles them, and revoking a share removes an edge. It matches how documents and files are used. The problems are transitivity and leakage: sharing a folder shares everything inside, a viewer's re-share rights need defining, and link-based access creates principals that are not users.",
    k: ["Owners may reshare freely versus restricted resharing: free sharing is how collaboration spreads, but data escapes the owner's intent.", "Public link sharing as a special principal versus authenticated-only: links are convenient and widely used, but bypass identity and cannot be audited per person."],
    p: ["Sharing a folder exposes documents added to it afterward that the owner never reviewed.", "When an owner leaves, orphaned resources have no one able to change their access."],
    v: "As an owner, share a document with a viewer, confirm read works and write fails, then revoke and confirm access ends on the next consistent read, with the share and revoke both in the log.",
    dep: ["relationship-based-model", "relationship-write-api", "resource-hierarchy-edges"]
  },
  "deny-and-exceptions": {
    s: "Rules that remove access granted elsewhere, such as blocking a suspended user or denying deletion on records under legal hold, regardless of other grants.",
    d: "Most models grant; deny rules subtract. A deny takes effect through a combining algorithm in which deny overrides, or through exclusion edges in a graph, such as \"viewers but not blocked\". It supports legal holds, separation of duty, and emergency lockouts. The difficulty is evaluation cost and comprehension: a deny must be checked even when an allow is found, which defeats short-circuiting, and a person reading a grant cannot know a hidden deny cancels it.",
    k: ["Explicit deny rules versus grant-only models: deny expresses exceptions and emergency blocks directly, but breaks short-circuit evaluation and complicates reasoning.", "Deny at the resource versus global deny: resource-level deny is targeted, while global deny is quick during an incident and broad in effect."],
    p: ["A deny rule defined in a lower-priority policy set is never consulted, and the block does not work.", "Deny rules accumulate without owners, and no one dares remove them."],
    v: "Grant a user edit, add a deny on the same resource for that user, and confirm checks return deny with the deny rule named; remove it and confirm edit is restored.",
    dep: ["combining-algorithms", "rule-evaluator"]
  },
});
