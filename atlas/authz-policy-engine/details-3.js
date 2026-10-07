// Details part 3: policy language, relationship store, attributes and context.
ATLAS.details("authz-policy-engine", {
  "policy-syntax-and-parser": {
    s: "The surface form of policy, whether a purpose-built declarative language, structured configuration or a restricted subset of a general language, and the parser that reads it.",
    d: "The parser turns text into a syntax tree, reporting errors with line and column and recovering enough to list several at once. Purpose-built syntax reads like rules, such as \"allow editors to update documents\", while configuration formats are easy to generate by tools. The parser rejects constructs the evaluator cannot handle. It is hard to get right because the grammar becomes a compatibility contract: every published policy depends on it, and adding syntax later must not change how existing text parses.",
    k: ["Purpose-built language versus a data format: a language reads naturally and enables strong checks, while a data format is easy for tools to emit but gets verbose as rules grow.", "General-purpose code versus restricted language: general code is flexible, but is hard to analyze, bound and prove safe."],
    p: ["A parser that accepts ambiguous input lets two engine versions read the same rule differently.", "Poor error messages lead authors to guess, and guessing at security rules ends badly."],
    v: "Feed the parser a rule with a missing bracket and confirm an error with line and column; feed a corpus of every previously published policy and confirm each parses to the same tree as before.",
    dep: []
  },
  "schema-and-types": {
    s: "Declares the resource types, relations, actions and attribute types that policy may refer to, so a rule naming something that does not exist is caught at load.",
    d: "A schema lists object types with their relations and permissions, attribute types and allowed values, and how types relate. The compiler checks every rule against it and the write API validates relationship tuples against it. It makes tools possible: completion, analysis and generated client code. The difficulty is evolution: changing a type or removing a relation invalidates stored data and running policy, so schema changes need compatibility checks and staged migration.",
    k: ["Strict schema versus schema-less policy: strict catches typos and enables analysis, while schema-less is quick to start and silently accepts misspelled attributes.", "Schema owned centrally versus per team: central ownership keeps it coherent, per-team ownership scales but needs rules for cross-references."],
    p: ["A misspelled attribute name in a schema-less rule evaluates to undefined, and the rule never fires.", "Removing a relation that stored tuples still use leaves orphaned data that the engine cannot interpret."],
    v: "Reference an undeclared relation in a rule and confirm the load fails; write a relationship tuple with an undeclared type and confirm the write API rejects it.",
    dep: ["policy-syntax-and-parser"]
  },
  "expression-language": {
    s: "The small language for conditions inside rules: comparisons, set operations, string and time functions, with deliberately limited power so evaluation always ends quickly.",
    d: "Expressions combine attribute references, literals, boolean operators, set membership and a fixed library of functions such as prefix matching, CIDR containment and date arithmetic. There are no unbounded loops and no side effects, so cost is predictable and results are cacheable. Extension functions are registered by the host. The tension is expressiveness: every function added is something authors will use, tests must cover and the formal tools must understand.",
    k: ["Non-Turing-complete expressions versus a full scripting language: limited expressions guarantee termination and analysis, but some real rules need workarounds.", "Built-in function library versus user-defined functions: built-ins are reviewed and fast, while user functions add power and arbitrary cost and risk."],
    p: ["A regular expression function with backtracking lets a crafted input burn CPU in the decision path.", "Time functions that read the clock at evaluation make replay disagree with history."],
    v: "Evaluate each library function against a table of edge cases, including empty sets and missing values, and confirm results; run an adversarial regular expression input and confirm it ends within the cost limit.",
    dep: ["policy-syntax-and-parser", "schema-and-types"]
  },
  "relation-rewrite-rules": {
    s: "Rules in a relationship schema that define one relation in terms of others, such as \"editors are also viewers\" or \"viewers of a folder can view its documents\".",
    d: "A schema declares, for each relation, how it is computed: directly stored, as a union of other relations, as an intersection or exclusion, or by following a link to a parent and taking a relation there. The engine compiles them into the expansion that graph traversal performs. This is how nesting and inheritance are expressed without copying edges. The difficulty is analysis: rewrites can be recursive, deep or expensive, and exclusions are non-monotonic, so a new edge can remove access.",
    k: ["Rewrites at check time versus materialized implied edges: rewrites keep storage small and writes cheap, while materialization speeds checks and complicates updates.", "Allow exclusion in rewrites versus unions only: exclusion expresses blocks, but breaks monotonic caching and reasoning about additive changes."],
    p: ["A recursive rewrite across parent links on a very deep tree makes every check expensive.", "A new exclusion edge removes access that caches built from additive assumptions still grant."],
    v: "Define document viewer as editor or parent folder viewer, add a user as folder viewer, and confirm access to a contained document and none after the document is moved to an unrelated folder.",
    dep: ["schema-and-types", "tuple-model"]
  },
  "modules-and-imports": {
    s: "Splits policy into modules by team or domain with explicit imports, so a large organization can maintain rules independently without name collisions.",
    d: "Each module declares a namespace and exports types, rules or helper definitions that others may import. The compiler resolves imports, checks versions and detects cycles, then links modules into one bundle. A shared base module may define standard roles, with product teams extending it. The difficulty is boundaries: a module that overrides another's rule changes global behavior, so linking must either forbid redefinition or make its priority explicit.",
    k: ["Allow modules to extend others versus closed modules: extension enables shared bases, but lets one team change the meaning of another's names.", "Pin imported module versions versus track latest: pinning is reproducible and can lag security fixes, while tracking latest gets fixes and surprise changes together."],
    p: ["Two modules defining the same role name merge silently, and permissions of one team spread to the other.", "A fix to a base module requires every dependent team to rebuild before it takes effect."],
    v: "Import a shared module into two team modules, change a helper in the shared one, and confirm both teams' bundles rebuild and decisions change as expected, with no collision warnings.",
    dep: ["policy-syntax-and-parser", "policy-compiler"]
  },
  "policy-compiler": {
    s: "Transforms parsed, type-checked policy into the internal form the evaluator runs, building indexes, resolving references and optimizing without changing meaning.",
    d: "The compiler resolves names, checks types against the schema, expands macros and rewrites, simplifies constant expressions, and emits a compact form plus the matching index. It records a content hash so a bundle is identified by what it contains. Compilation happens in the authoring pipeline, not on the request path. The challenge is semantic fidelity: an optimization that is subtly wrong changes decisions across the fleet, so compilers are tested against a reference interpreter.",
    k: ["Ahead-of-time compile versus load-time compile in each engine: ahead-of-time gives one tested artifact, while load-time lets each engine optimize for itself and risks divergence.", "Aggressive optimization versus plain translation: optimization lowers latency, but each transform is a risk to semantics."],
    p: ["An optimizer bug that folds a condition incorrectly changes decisions only for rare inputs and escapes tests.", "A compiler version upgrade changes bundle hashes and makes rollbacks look like new releases."],
    v: "Compile a policy corpus and compare decisions from the compiled form with a reference interpreter over a million generated requests; confirm zero differences and a stable hash across repeated builds.",
    dep: ["policy-syntax-and-parser", "schema-and-types", "expression-language"]
  },
  "static-analyzer": {
    s: "Checks policy without running it: unused definitions, unreachable rules, overly broad grants, dangerous patterns and violations of organization-specific lint rules.",
    d: "The analyzer walks the syntax tree and compiled form to flag wildcard grants on sensitive types, rules that reference nonexistent attributes, roles that can never be assigned, shadowed or duplicate rules, and unbounded recursion. Organization rules can be added, such as forbidding grants to all users on certain types. It runs in the editor, in review and in the build. The difficulty is signal: too many warnings train authors to ignore them, so severity and suppression with justification need design.",
    k: ["Block the build on errors versus warnings only: blocking enforces standards, but can stall an urgent fix, while warnings are skipped under pressure.", "Built-in checks versus organization-defined checks: built-ins are broadly valid, but only local checks encode company rules such as data residency."],
    p: ["Silent suppression comments without owner or expiry hide real problems for years.", "A linter that runs only on the changed file misses interactions with other modules."],
    v: "Add a wildcard grant on a type tagged sensitive and confirm the analyzer fails the build naming the rule and the organization check that was violated.",
    dep: ["policy-syntax-and-parser", "schema-and-types"]
  },
  "tuple-model": {
    s: "The record format for a relationship: an object, a relation and a subject, optionally with a condition or expiry, stored as one edge of the graph.",
    d: "A tuple reads as \"object O has relation R to subject S\", for example a document and its editor, where the subject may itself be a set of subjects, such as the members of a group. Extra fields may hold an expiry time or a named condition with parameters. Tuples are small, immutable facts that are added or deleted, never edited. The difficulty is volume and identity: billions of tuples must be addressed unambiguously, so naming and identifier stability are critical.",
    k: ["Subject may be a set versus individuals only: sets give groups and nesting in one record, but make reads more complex than flat lookups.", "Tuples with expiry and conditions versus plain edges: conditions add expressiveness and time-limited access, but make cached answers depend on parameters."],
    p: ["Reusing an identifier after deletion attaches old relationships to a new, unrelated object.", "Without expiry, temporary access granted for a contractor lasts forever."],
    v: "Write a tuple with an expiry one minute ahead, confirm a check allows, wait past expiry and confirm a check denies without any delete having been issued.",
    dep: []
  },
  "relationship-store-engine": {
    s: "The durable, strongly consistent database that holds all tuples and serves reads at a chosen point in time, built for very high read volume and ordered writes.",
    d: "It stores tuples in an ordered, replicated key-value or relational layout, assigns every write a position in a global order, and keeps multiple versions so reads can be served as of a past timestamp. Reads vastly outnumber writes, so it is replicated for reads. Writes need a transaction across the replicas that holds them. The difficulty is the combination: strong ordering across regions, versioned reads and low latency pull in different directions.",
    k: ["Globally ordered writes versus per-region stores: a global order gives correct revocation semantics, while per-region stores are faster and let regions disagree.", "General-purpose database versus purpose-built store: general databases are mature and operable, whereas purpose-built stores tune layout for graph reads and are harder to run."],
    p: ["Garbage collection of old versions too soon breaks reads pinned at older timestamps.", "A single hot object receiving many writes becomes a bottleneck on one shard."],
    v: "Write a tuple, read at the returned position and confirm it is present, read at an earlier position and confirm it is absent, then fail a replica and confirm reads and writes continue.",
    dep: ["tuple-model", "tuple-indexes", "high-availability"]
  },
  "tuple-indexes": {
    s: "Secondary orderings over the tuples that make both directions of lookup fast: all subjects for an object relation, and all objects a subject relates to.",
    d: "Besides the primary ordering by object, the store keeps an index ordered by subject, so reverse lookups do not scan everything. Indexes cover common prefixes such as object type plus relation. Each write updates all indexes in one transaction. They are what makes list queries and traversal affordable. The cost is write amplification and storage, and the planning problem of which orderings to build, since each extra index slows writes and uses space.",
    k: ["Index both directions versus only the object direction: both make reverse queries fast, while one halves write cost and makes list queries slow.", "Covering indexes versus lookups back to the table: covering avoids extra reads, but stores more data per index."],
    p: ["A missing reverse index makes a list-objects query scan the whole store the first time an administrator runs it.", "An index update that lags the primary ordering returns inconsistent results."],
    v: "Run a list-objects query on a store with one hundred million tuples and confirm it reads only entries for that subject, using the store's query statistics, and returns in the target time.",
    dep: ["tuple-model", "relationship-store-engine"]
  },
  "nested-groups": {
    s: "Groups that contain other groups, so membership is computed transitively; the main way large organizations manage who has access to what.",
    d: "A group membership edge's subject may be another group's members, so a user belongs to everything reachable upward. Checks resolve membership by traversal, or from a precomputed closure that is updated when memberships change. Nesting mirrors organizational charts and team structures. The difficulty is depth and size: big groups with deep nesting make traversal slow, and a single membership change near the top can alter the effective membership of many thousands of users.",
    k: ["Compute membership on demand versus keep a materialized closure: on demand is simple and always current, while a closure is fast to read and expensive to update.", "Limit nesting depth versus unlimited: limits protect latency and prevent cycles, but force flattening of real organizational structures."],
    p: ["A cycle between two groups, created by two well-meaning administrators, makes membership checks loop.", "Adding a group to a large parent silently grants access to everyone in the child."],
    v: "Nest three groups, add a user to the innermost, and confirm membership and access through the outer group; remove the middle link and confirm access ends at the next consistent read.",
    dep: ["tuple-model", "graph-traversal", "tuple-indexes"]
  },
  "resource-hierarchy-edges": {
    s: "Parent-child edges between resources, such as an organization, project, folder and document, so permissions on a container apply to what it holds.",
    d: "Each resource has a parent relationship, and the schema declares which relations flow downward. A check on a document consults the document, then its folder, then up the chain. Moving a resource changes one edge and thereby its inherited access. It avoids writing a permission record for each document. The difficulty is depth and fan-in: very deep trees make traversal slow, and moving a large folder changes permissions on many resources at once.",
    k: ["Inherit through parent edges versus copy permissions to children: inheritance is cheap to write and always current, while copying makes each check fast and goes stale.", "Single parent versus multiple parents: single parent is easy to reason about, while multiple parents allow shortcuts and add ambiguity."],
    p: ["Moving a folder out of its organization leaves children retaining cached access for the old parent.", "Unbounded folder depth lets users create chains that make every check slow."],
    v: "Create a three-level hierarchy, grant a user viewer on the top, and confirm access at the bottom; move the bottom resource to another tree and confirm access is lost without any permission change on it.",
    dep: ["tuple-model", "relation-rewrite-rules"]
  },
  "relationship-write-api": {
    s: "The interface for adding and removing tuples, with preconditions, atomic batches and a returned consistency position, which is how applications keep permissions in step with their data.",
    d: "Applications call it when users share, join, move or delete things. A write request carries updates, optional preconditions such as \"only if this tuple does not exist\", and receives a token naming the new position. Batches apply atomically. The API validates against the schema and checks that the caller may change that relationship. The difficulty is coordination with the application's own database: two stores must change together, and a failure between them leaves permissions and data disagreeing.",
    k: ["Write permissions in the same transaction as the data versus afterward through an outbox: same transaction is not possible across two systems, while an outbox gives eventual agreement and a window of mismatch.", "Preconditions on writes versus blind writes: preconditions prevent races and duplicates, at the cost of retries."],
    p: ["A resource created in the application database whose permission write fails exists with no owner and no one can open it.", "A deleted resource whose permission cleanup fails keeps a dangling grant."],
    v: "Create a resource and a share together, confirm the write returns a position token, check with that token and see allow; submit a write violating a precondition and confirm nothing changed.",
    dep: ["tuple-model", "schema-and-types", "relationship-store-engine", "write-ordering"]
  },
  "relationship-change-stream": {
    s: "An ordered feed of every tuple change, used to keep caches, indexes, search filters and downstream systems current without polling.",
    d: "The store emits each committed change with its position, in order, to consumers that persist their own cursor. Consumers include cache invalidators, derived reverse indexes, audit archives and replicas in other regions. A consumer that falls behind can resume from its cursor or rebuild from a snapshot. The challenge is retention and ordering: the stream must be kept long enough for slow consumers, and a consumer must apply changes in order or reach wrong conclusions.",
    k: ["Push stream versus polling of changes since a position: push is timely, and polling is simple and resilient to consumer restarts.", "Long retention versus snapshot plus short stream: long retention supports slow consumers, while snapshots bound storage but need a bootstrap path."],
    p: ["A consumer that skips a deletion event keeps serving access that was revoked.", "Retention shorter than a consumer's outage forces a full, expensive rebuild."],
    v: "Pause a consumer for ten minutes during a burst of changes, resume it from its cursor, and confirm it applies every change in order and its derived state matches the store.",
    dep: ["relationship-store-engine", "write-ordering"]
  },
  "subject-attribute-sync": {
    s: "Brings facts about people and services, such as department, employment status and clearance, from the identity provider or directory into a form the engine can read quickly.",
    d: "A connector pulls or receives changes from the directory and writes them into the engine's attribute store or a cache, normalizing names and types. Rules then read attributes locally instead of calling out per request. Termination and role changes must propagate promptly. The difficulty is delay and mapping: directories change on their own schedule, source fields rarely match rule vocabulary, and there is a window in which a departed employee still has attributes that grant access.",
    k: ["Push events from the directory versus periodic full sync: events are quick and efficient, while full sync heals missed events and costs load.", "Copy attributes into the engine versus query the directory live: a copy is fast and independent, while live queries are fresh and slow and couple availability."],
    p: ["A missed termination event leaves the account's attributes intact until the next full sync, days later.", "Attribute names changed in the directory silently stop matching rules."],
    v: "Change a user's department in the directory, measure the time until a rule keyed on department reflects it in a check, and confirm it is within the stated freshness bound.",
    dep: ["attribute-freshness-rules", "external-data-connectors"]
  },
  "resource-attribute-fetch": {
    s: "Retrieves properties of the thing being accessed, such as owner, classification, region or status, from the application or its catalog at decision time.",
    d: "Resources are owned by applications, so their attributes live in the application's database. The caller may send them with the request, the engine may fetch them through a connector, or a synchronized copy may be consulted. Which attributes a rule reads decides how much data crosses. The difficulty is who is trusted: caller-supplied values are fast but can be wrong, and fetching adds latency and a dependency on another service in the decision path.",
    k: ["Caller sends resource attributes versus engine fetches them: sending keeps the engine stateless and fast, while fetching is trustworthy but adds a hop.", "Synchronized copy versus live fetch: a copy is quick and may be stale, while live fetch is current and fails when the owner is down."],
    p: ["A classification changed in the application but not in the engine's copy leaves a document readable under the old label.", "A fetch to a slow resource service stalls every decision for that type."],
    v: "Change a document's classification in the application and confirm the next check reflects it within the bound; block the resource service and confirm the documented fallback applies.",
    dep: ["external-data-connectors", "attribute-freshness-rules"]
  },
  "environment-context": {
    s: "Facts about the circumstances of a request, such as time, network location, device posture, authentication strength and risk score, that rules may require.",
    d: "Some of it arrives with the request, such as source address and the strength of the authentication used, and some comes from services that assess device health or risk. Rules combine it with identity: access to payroll only from managed devices, or only after a second factor within the last fifteen minutes. The difficulty is provenance: each value has a different source and trust level, and signals like location are easy to spoof when supplied by the client.",
    k: ["Signals from the caller versus from a trusted signal service: caller-supplied is simple and unverifiable, while a signal service adds a dependency and a trusted source.", "Step-up requirement in the response versus hard deny: step-up lets the user fix the condition, but requires the caller to implement the challenge."],
    p: ["Trusting a forwarded client address header lets an attacker claim an internal network.", "A risk score that is unavailable defaults to low, so an outage of the risk service disables the control."],
    v: "Send the same request from a managed and an unmanaged device context and confirm allow and deny, with the denial reason naming the posture requirement.",
    dep: ["request-context-assembly", "token-claims"]
  },
  "token-claims": {
    s: "Subject facts carried in a signed token from the identity provider, such as identifier, groups and authentication time, that the engine can trust without a lookup.",
    d: "The enforcement point validates the token's signature, issuer, audience and expiry, and passes the verified claims into the request. Rules read groups and roles directly. This avoids a directory call per request. The cost is that claims are frozen at issuance: a user removed from a group keeps the claim until the token expires, so token lifetimes bound how stale permission information can be, and large claim sets bloat every request.",
    k: ["Short-lived tokens with claims versus long-lived tokens with lookups: short lifetimes bound staleness without calls, but increase refresh traffic.", "Roles in the token versus only the subject identifier: claims are fast and self-contained, while identifier-only keeps one source of truth and costs a lookup."],
    p: ["A token carrying a role removed an hour ago is still honored until it expires.", "Skipping the audience check lets a token issued for one service be used against another."],
    v: "Remove a user from a group, make a request with a token issued before the change, and confirm the result matches the documented staleness bound; confirm a token with the wrong audience is rejected.",
    dep: ["attribute-freshness-rules"]
  },
  "external-data-connectors": {
    s: "Adapters that let the engine read data from systems it does not own, such as directories, databases and catalogs, with timeouts, caching and credentials handled in one place.",
    d: "A connector declares what it provides and how to call it, and the engine invokes it during context assembly or in a sync job. It applies a per-call deadline, caches results with a time to live, limits concurrency and records failures. Credentials belong to the connector, not to policy authors. The difficulty is blast radius: a slow external source can stall the decision path, so connectors need circuit breakers and a defined answer for failure.",
    k: ["Fetch inside the decision versus synchronize in the background: inline is fresh and risks latency and outages, while background sync is fast and bounded stale.", "Generic connector interface versus bespoke integrations: a generic interface lowers the effort for new sources, but loses source-specific optimizations."],
    p: ["A connector without a timeout lets one slow directory take down all decisions that read it.", "Connector credentials stored in policy files end up in version control."],
    v: "Make the external source respond slowly and confirm decisions return within the deadline using the documented fallback, a breaker opens and an alert fires, then closes after recovery.",
    dep: ["evaluation-limits"]
  },
  "attribute-freshness-rules": {
    s: "States how old each attribute may be when a decision uses it, per attribute and per sensitivity, and what happens when it is older.",
    d: "Every attribute source carries an age: when it was last synchronized or fetched. Policy or configuration states a maximum age, for example sixty seconds for account status and a day for department. When the value is too old the engine refreshes it, falls back to deny, or marks the decision as stale in the log. The difficulty is choosing bounds: tight bounds cost load and availability, loose ones keep access alive after circumstances change.",
    k: ["Tight bounds on sensitive attributes only versus uniform bounds: targeted bounds spend freshness where it matters, but require classifying every attribute.", "Refresh on expiry versus serve stale and refresh in background: refresh-on-expiry is correct and adds tail latency, while stale-serving is fast and permits old facts."],
    p: ["One global freshness setting is either too loose for account status or too costly for everything else.", "Stale attributes are used silently with no mark in the log, so audits cannot tell."],
    v: "Set a sixty-second bound on account status, disable the sync, and confirm that after sixty seconds decisions either refresh the value or deny, and that the log marks staleness.",
    dep: []
  },
});
