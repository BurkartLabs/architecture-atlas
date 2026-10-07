// Details part 2: limits, authorization, schema.
ATLAS.details("graph-query-server", {
  "depth-limiting": {
    s: "A static check that rejects any operation whose selection nesting exceeds a fixed number of levels, stopping recursive queries over cyclic relationships before they execute.",
    d: "After parsing, a visitor walks the selection tree, following fragment spreads, and records the deepest path. Operations over the limit fail validation with an error naming the depth. It is cheap and catches the classic abuse of a cycle such as author to books to author. It is blunt: a shallow query can still be enormously expensive through wide lists, and a legitimate deep query can be rejected. Introspection and fragments need explicit handling so they are neither exempt nor over-counted.",
    k: ["Fixed depth vs cost-based limit: depth is trivial to explain and compute; cost handles wide queries but needs annotations.", "Count fragments as inlined vs once: inlining is accurate but expands cost; counting once misses fragment cycles unless validation forbids them."],
    p: ["A depth limit alone allows a shallow query selecting thousands of aliased copies of an expensive field.", "Forgetting to follow fragment spreads makes the limit bypassable by moving fields into a fragment."],
    v: "Send queries nested one level below and one level above the limit, once inline and once through fragments. Confirm only the deeper ones are rejected, before any resolver runs.",
    dep: ["validation-rules", "document-ast"]
  },
  "complexity-analysis": {
    s: "A pre-execution calculation of how expensive an operation will be, from field weights and list sizes, used to reject or throttle queries that exceed a budget.",
    d: "A visitor multiplies each field's weight by the expected number of items, using pagination arguments such as a first count as the multiplier for child fields, and sums the tree. Operations above the per-request maximum are rejected; the number can also be charged to a caller's budget. Estimates are conservative upper bounds because real list sizes are unknown until execution. Hard parts are choosing weights, handling unbounded lists with no limit argument, and keeping estimates close enough to reality that honest queries pass.",
    k: ["Estimate before execution vs measure during: estimates reject early and cheaply but are approximate; measuring is exact but pays for the work first.", "Per-request ceiling vs per-caller budget: a ceiling stops single huge queries; budgets stop many moderate ones."],
    p: ["Lists without a required size argument make the estimate unbounded or silently one.", "Weights set once and never revisited drift from real backend cost as resolvers change."],
    v: "Request a field with first set to ten and then to ten thousand. Confirm the reported cost scales, the second is rejected, and logged cost correlates with measured backend time across a sample.",
    dep: ["cost-annotations", "document-ast", "variable-coercion"]
  },
  "cost-annotations": {
    s: "Schema metadata that assigns weights to fields and tells the analyzer which arguments set list sizes, so cost reflects what each field does to a backend.",
    d: "Directives or configuration attach a weight to a field and name the arguments that act as multipliers, such as first, last or limit. A field backed by a table scan gets a high weight, a cached field a low one, and a connection field multiplies its children. Defaults apply where nothing is annotated. They live next to the schema so the owner of a resolver sets the cost. The challenge is accuracy: annotations are guesses written by hand, and nothing fails when a resolver slows down.",
    k: ["Annotations in the schema vs a separate config: in the schema, cost travels with the field and its owner; separate config keeps the public schema clean but drifts.", "Static weights vs weights from measured latency: static are predictable; measured track reality but make cost vary between runs."],
    p: ["Unannotated fields default to cheap, so the most expensive new field is free until someone notices.", "Annotating the argument but not the default page size leaves queries with no argument unbounded."],
    v: "Add an expensive resolver without an annotation and compare estimated cost with measured time in tracing. A review check should flag the unannotated field before release.",
    dep: ["schema-directives", "object-and-interface-types"]
  },
  "alias-and-batch-limits": {
    s: "Caps on how many aliased copies of a field one operation may select and how many operations one request may carry, closing the multiplication tricks that bypass per-request limits.",
    d: "Aliases let one query call the same field many times under different names, which defeats a rate limit counted in requests and lets one login mutation try thousands of passwords in a single call. Likewise an array of operations in one HTTP body counts as one request. The validator counts aliases and root fields, the envelope counts batch entries, and both reject or charge for the excess. The difficulty is picking limits generous enough for legitimate pages but small enough to matter.",
    k: ["Hard cap on aliases vs charge each in cost: a cap is simple and stops brute force; charging is fairer to legitimate fan-out but needs cost accounting.", "Disable batching vs count each entry: disabling closes the route; counting keeps its efficiency at the price of more accounting."],
    p: ["Rate limiting by request count lets one request attempt thousands of sensitive mutations through aliases.", "Counting only top-level aliases misses repeated fields nested inside fragments."],
    v: "Send one operation with one hundred aliased login mutations and an array of one hundred operations. Confirm each is rejected or charged as one hundred attempts.",
    dep: ["request-envelope", "validation-rules", "rate-limiting"]
  },
  "rate-limiting": {
    s: "Throttling that charges each caller for the estimated or measured cost of operations against a refilling budget, instead of counting HTTP requests.",
    d: "A limiter keeps a bucket per caller, key or address. Each operation's cost, from analysis before execution and optionally corrected after, is deducted; when the bucket is empty the server returns a limit error with a retry hint. State lives in a shared store so limits hold across server instances. It protects backends from heavy callers. The hard parts are consistency under concurrency, choosing the identity to limit when callers are anonymous, and communicating remaining budget so clients can back off.",
    k: ["Cost-based vs request-count limits: cost matches real load, while request counts are simple and visible to generic proxies.", "Shared central counters vs per-instance local counters: central is accurate but adds a hop and a dependency; local is fast but multiplies the limit by instance count."],
    p: ["Limiting by network address punishes users behind shared addresses and does nothing against distributed callers.", "A rate limiter store outage that fails open removes protection exactly when load is highest."],
    v: "Run a caller at a rate above its budget and confirm responses switch to limit errors with a retry hint, while a second caller on the same instance is unaffected.",
    dep: ["complexity-analysis", "authentication-context"]
  },
  "timeouts-and-cancellation": {
    s: "Deadlines for whole operations and for individual resolvers, plus propagation of client disconnects so abandoned work stops instead of consuming backend capacity.",
    d: "The server starts a deadline when an operation arrives and passes a cancellation signal through the resolver context to every backend call. When the deadline passes or the client disconnects, pending calls are aborted, partial results are discarded or returned with errors, and resources are released. Per-resolver timeouts limit the damage from one slow dependency. Difficulty lies in cooperation: only code that checks the signal actually stops, and mutations cancelled midway can leave partial effects.",
    k: ["One operation deadline vs per-field timeouts: a single deadline is simple; per-field allows partial data when one source is slow but complicates the response.", "Cancel mutations on disconnect vs let them finish: cancelling frees resources but risks half-applied writes; finishing is safer for data."],
    p: ["Resolvers that ignore the cancellation signal keep querying backends long after the response is gone.", "Gateway timeouts shorter than server timeouts leave retried requests running twice."],
    v: "Call a resolver that sleeps ten seconds with a one second deadline, and confirm the error returns at one second and the backend connection is closed, visible in backend active-query counts.",
    dep: ["resolver-context", "backend-resilience"]
  },
  "persisted-only-mode": {
    s: "A server setting that accepts only operations registered in advance by hash and rejects arbitrary query text, shrinking the attack surface to the operations the clients actually use.",
    d: "In this mode the server refuses any request carrying query text and executes only operations found in the persisted store. Parsing, validation and cost analysis happen once at registration, not per request. Public third-party APIs cannot use it, because outside developers need to write their own queries, but first-party apps can. The challenge is the release pipeline: every client build must register its operations before it ships, and old hashes must stay available as long as old clients run.",
    k: ["Persisted-only vs open queries: only registered operations make cost predictable and block probing, but outside developers cannot explore.", "Registered by CI vs by a runtime admin call: CI ties operations to reviewed code; runtime registration is flexible but widens trust."],
    p: ["Enabling it before every client manifest is uploaded breaks live apps with unknown-hash errors.", "Leaving an open fallback for debugging in production reopens the whole attack surface."],
    v: "Send raw query text to the server in this mode and confirm rejection. Send a registered hash and confirm success, with no parse step visible in the trace.",
    dep: ["persisted-queries", "persisted-query-manifest"]
  },
  "introspection-gating": {
    s: "Rules deciding who may run schema introspection and what it reveals, from fully open to disabled or filtered by caller, to limit disclosure of internal structure.",
    d: "A validation rule inspects each operation for introspection meta fields and checks them against policy: open for all, allowed only for authenticated or internal callers, or disabled. Some servers return a filtered schema that omits types the caller cannot see. It reduces reconnaissance but is not an access control, because hidden fields remain callable if guessed, and error messages with did-you-mean suggestions can leak names. Its real value is paired with field-level authorization.",
    k: ["Disable introspection in production vs allow with authentication: disabling is simple but breaks tooling and generators; authenticated access keeps tools working for trusted callers.", "Filtered schema per caller vs one shared schema: filtering reduces exposure but multiplies schemas and complicates caching."],
    p: ["Treating disabled introspection as a security control leaves unauthorized fields callable by anyone who guesses names.", "Suggestion text in validation errors reveals field names even when introspection is off."],
    v: "As an anonymous caller run an introspection query and a misspelled field query. Confirm introspection is refused and the error text contains no suggestions of hidden fields.",
    dep: ["introspection", "authentication-context", "validation-rules"]
  },
  "authentication-context": {
    s: "The step that verifies the caller's credential once per request and builds the context object, holding user, roles, tenant and loaders, that every resolver receives.",
    d: "Before execution, middleware reads a token or session from headers or cookies, validates signature, expiry and audience with the identity provider, and loads claims. The result goes into the per-request context along with per-request services such as loaders. Anonymous requests proceed with an anonymous identity when the schema allows public fields. For long-lived connections, authentication happens at connection start and may need refresh. The difficulty is that authentication succeeding says nothing about what the caller may see, which is decided later per field.",
    k: ["Reject unauthenticated requests at the door vs allow and decide per field: rejecting is simple but prevents public fields; per-field supports mixed access but requires every resolver to check.", "Stateless tokens vs server sessions: tokens avoid lookups but are hard to revoke; sessions revoke instantly but need a store."],
    p: ["Caching identity in a process-wide variable shares one caller's identity with another request.", "Token expiry mid-subscription leaves a stream running with a revoked identity."],
    v: "Send requests with a valid token, an expired token and no token. Confirm the context shows the right identity for each, and an expired one never reaches a resolver.",
    dep: ["http-transport", "resolver-context"]
  },
  "field-authorization": {
    s: "A check at each field or type that decides whether the current caller may read it, applied wherever the field appears, so no query path bypasses it.",
    d: "Because any field is reachable through many paths, authorization at the root is not enough. Checks attach to type and field definitions, through directives, wrappers around resolvers or a policy layer, and read caller identity from the context. On failure the field returns an error or null. The strongest design pushes decisions into one policy function called from the data layer, not repeated in each resolver. Hard parts are performance, since a check per list item can multiply backend calls, and consistency across fields exposing the same object.",
    k: ["Authorization in resolvers vs in a central policy layer: resolver checks are explicit but easy to forget; a policy layer is consistent but needs a model rich enough to express rules.", "Check on the parent object once vs on every field: once is fast; per field gives fine control and costs more."],
    p: ["A new field on an existing type without a check exposes data to everyone allowed to see the type.", "Checking at the root query but not the nested path leaks the same object through a relationship."],
    v: "As a lower-privileged user, reach one protected field through three different paths, such as direct, through a relationship and through a search result. Confirm each denies it.",
    dep: ["authentication-context", "policy-directives", "resolver-context"]
  },
  "policy-directives": {
    s: "Declarative annotations on schema elements, such as requires role or owner only, that the server turns into authorization checks, keeping rules visible in the schema.",
    d: "A directive on a field or type names the rule and its arguments, for example required scopes. At schema construction the server wraps resolvers or registers hooks that evaluate the rule against the context before the resolver runs. Rules are reviewed together with schema changes and can be listed by tooling. They fit simple role and scope checks well; rules depending on the specific object, like ownership, need data access and do not fit a static annotation.",
    k: ["Declarative directive rules vs imperative code: directives are reviewable and uniform but limited; code is expressive but hidden in resolvers.", "Deny by default vs allow by default for unannotated fields: deny is safe but verbose; allow is convenient but leaks new fields."],
    p: ["Directives that exist only in the schema file and are not wired to any enforcement code do nothing.", "A directive on an interface field is skipped when the concrete type overrides the resolver."],
    v: "List every field with no policy and confirm the list is intentional. Call a directive-protected field without the scope and confirm denial and an audit log entry.",
    dep: ["schema-directives", "field-authorization", "authentication-context"]
  },
  "data-level-filtering": {
    s: "Authorization applied to the data fetch itself, so the backend query only returns rows the caller may see, instead of filtering after the fact in memory.",
    d: "Resolvers and loaders add the caller's tenant, ownership or visibility constraints to the query sent to the backend, or rely on database policies bound to the session. Lists, counts and search results are then correct by construction: a total count does not reveal hidden rows, and pagination does not leak gaps. It is hard to retrofit because every access path, including loaders keyed by id, must carry the constraint, and caches keyed by id alone can serve one user another's object.",
    k: ["Filter in the query vs filter results afterward: in-query is secure and efficient; post-filtering is easy to write but leaks counts and wastes work.", "Application-level constraints vs database row policies: database policies cannot be forgotten by a resolver but add per-session setup cost."],
    p: ["A loader keyed only by id returns another tenant's record when a guessed id is requested.", "Counts and cursors computed before filtering reveal how many hidden items exist."],
    v: "As tenant A request a record id owned by tenant B directly and through a list. Confirm both return nothing, and total counts match only tenant A's rows.",
    dep: ["resolver-context", "batch-loader", "relational-connector"]
  },
  "denial-semantics": {
    s: "The choice of what a caller sees when authorization fails: an error, a null, or an empty list, and how that choice interacts with non-null types and information disclosure.",
    d: "On denial a resolver can raise a forbidden error, return null, or behave as if the object does not exist. A forbidden error on a non-null field propagates null to the nearest nullable parent, which may erase a larger result. Returning not found hides existence but is less informative to legitimate clients. The decision must be consistent across fields and documented. It is hard because error and null have different client behavior, and mixing them makes clients unable to distinguish no permission from no data.",
    k: ["Error on denial vs silent null: errors tell clients what happened but reveal that data exists; null hides it but makes bugs look like empty data.", "Make restricted fields nullable vs non-null: nullable fields degrade gracefully; non-null fields turn denial into a failure of the parent."],
    p: ["A denied non-null field nulls out its whole parent object, discarding data the caller was allowed to see.", "Different error text for missing and forbidden objects lets callers probe which ids exist."],
    v: "Request a mix of allowed and denied fields on one object. Confirm allowed fields return, denied ones follow the documented error or null rule, and the response shape is identical across callers apart from that.",
    dep: ["nullability-model", "null-propagation", "error-model"]
  },
  "schema-definition-language": {
    s: "A human-readable text format for declaring types, fields, arguments, directives and descriptions, serving as the single source of truth that clients, tools and the server all read.",
    d: "The definition language declares object, interface, union, enum, input and scalar types, root operation types, and directive definitions, with descriptions in documentation strings. The server parses it into an in-memory schema, validating that references resolve and that implementations satisfy interfaces. The file is versioned in source control and diffed in review. Because it carries no behavior, resolvers must be attached separately, and keeping the two aligned is the main source of runtime surprises.",
    k: ["Schema file as source of truth vs schema generated from code: a file is reviewable and language-neutral; generated schema stays in sync with resolvers but is harder to review.", "One file vs many modules: one file is simple; modules scale across teams but need merge and ordering rules."],
    p: ["Schema and resolvers drift when a field is declared but no resolver exists, so it returns null forever.", "Descriptions omitted on public fields leave clients guessing at units and meaning."],
    v: "Parse the schema file, print it back and diff against the original. Then list every field and confirm each has a resolver or default property lookup, and a description.",
    dep: ["schema-construction"]
  },
  "object-and-interface-types": {
    s: "Object types are named sets of fields that clients select; interfaces declare field sets that several object types share, letting one selection apply across types.",
    d: "An object type lists fields, each with arguments and a return type. An interface lists fields that implementers must provide with compatible types, and queries on an interface may use inline fragments to select type-specific fields. The executor resolves the concrete type at runtime before selecting subfields. Interfaces allow polymorphic lists such as a feed of mixed items. They are hard to change: adding a field to an interface requires every implementer to support it, and removing an implementer can break clients matching on it.",
    k: ["Interfaces vs separate object types with duplicated fields: interfaces permit shared selections and clean clients; duplication is simpler but repeats fields everywhere.", "Fine-grained types vs few wide types: fine-grained gives precise nullability; wide types are simpler but force many nullable fields."],
    p: ["Adding a required field to an interface breaks every existing implementer at schema build time.", "Clients that exhaustively match known implementers fail silently when a new type appears."],
    v: "Query a list of an interface type with inline fragments for each implementer and confirm each element returns the fields of its concrete type and a correct type name.",
    dep: ["schema-definition-language", "abstract-type-resolution"]
  },
  "unions-and-enums": {
    s: "Unions declare a field that may be one of several unrelated object types; enums declare a fixed set of named values, validated by the type system instead of free strings.",
    d: "A union has no fields of its own; clients must use fragments per member type and may ask for the type name. Unions model results like success or a set of typed errors. Enums validate input and output values and serialize as names, not numbers. Both are closed sets in the schema, so adding a member is a change clients can feel: a client switching on an enum or union sees a new value it does not handle.",
    k: ["Union of typed errors vs generic error list: unions make failures part of the contract; generic errors are simpler but untyped.", "Enum vs string with documented values: enums are validated and discoverable but adding a value can break older clients; strings are flexible but unchecked."],
    p: ["Adding an enum value breaks older clients that switch exhaustively and have no default branch.", "Unions with many members make queries verbose and generated client types large."],
    v: "Return each member of a union from a test field, and send an enum input with an invalid name. Confirm every member is selectable and the invalid value is rejected by validation.",
    dep: ["schema-definition-language", "abstract-type-resolution", "input-types"]
  },
  "input-types": {
    s: "Input object types and argument definitions that describe what callers may send: nested structures with required and optional fields and defaults, separate from output types.",
    d: "Inputs are declared separately from outputs since they cannot hold cycles, interfaces or resolvers. A field may be required, optional or have a default, and a mutation commonly takes one input object so it can grow without changing its signature. Validation checks shape and types before any resolver runs; business validation happens in resolvers. The subtlety is the difference between a field omitted and a field set to null, which matters for partial updates.",
    k: ["Single input object vs many arguments: one input extends without breaking callers; many arguments are readable for simple fields.", "Distinguish omitted from null vs treat as the same: distinguishing allows clearing a value in a patch; merging them is simpler but cannot express clear."],
    p: ["Treating null as omitted in an update silently ignores a caller's request to clear a field.", "Reusing one input type for create and update makes required fields wrong for one of them."],
    v: "Send an update with a field omitted and another with the same field set to null. Confirm the stored value is unchanged in the first case and cleared in the second.",
    dep: ["schema-definition-language", "variable-coercion"]
  },
  "custom-scalars": {
    s: "Application-defined leaf types such as dates, identifiers or decimals, each with rules to parse input values and serialize output, validated at the boundary.",
    d: "A custom scalar declares a name and three functions: serialize from the internal value to the wire, parse a variable value, and parse a literal in query text. They give clients a typed name instead of a bare string and centralize validation of formats. The schema alone cannot describe the format, so documentation and a specification link are needed. Hard parts are precision and portability: large integers lose precision as JSON numbers, and time zones and calendars vary.",
    k: ["Custom scalar vs plain string: scalars validate once and generate precise client types; strings are simple but push validation everywhere.", "Decimal as string vs number: strings preserve precision across languages; numbers are convenient but lose digits."],
    p: ["A scalar whose parser throws a bare exception yields an unhelpful internal error instead of a validation message.", "Dates serialized without a time zone are read differently by clients in different regions."],
    v: "Send valid and invalid values for each custom scalar as a variable and as a literal. Confirm invalid ones fail validation with a clear message, and output round-trips exactly.",
    dep: ["schema-definition-language", "variable-coercion"]
  },
  "nullability-model": {
    s: "The rule that every field is nullable unless marked non-null, with list and item nullability set separately, defining what a missing or failed value may look like.",
    d: "A non-null marker promises the field always has a value; if its resolver fails, the null bubbles up to the nearest nullable parent. Lists distinguish a nullable list from nullable items. Making fields nullable by default lets a single failing backend degrade one field, not the whole response, and makes later removal safer. Making them non-null documents guarantees and simplifies client code. The decision is expensive to reverse, since changing nullable to non-null or the reverse is a breaking change either way.",
    k: ["Nullable by default vs non-null by default: nullable survives partial failure and evolves safely; non-null gives simpler client code but amplifies failures.", "Non-null list items vs nullable items: non-null items promise completeness but one bad row erases the list."],
    p: ["Marking a field fed by a flaky backend non-null makes its failure null out the parent and sometimes the whole response.", "Making a previously non-null field nullable breaks generated client types that assumed presence."],
    v: "Force a resolver for a non-null field to fail and confirm the null propagates exactly to the nearest nullable ancestor, with an error at the failing path.",
    dep: ["schema-definition-language", "null-propagation"]
  },
  "schema-directives": {
    s: "Named annotations attached to schema elements or operations that carry metadata or alter behavior, such as deprecation, cost, caching and authorization hints.",
    d: "A directive is declared with a name, arguments and the locations where it may appear. Built-in ones control deprecation and conditional inclusion. Custom ones attach behavior: the server reads them at schema construction and wraps resolvers or registers rules. They let cross-cutting concerns live next to the types they affect. The risk is that a directive is only a label: tooling that does not understand it ignores it, so declaring one does not guarantee it is enforced.",
    k: ["Directives for cross-cutting behavior vs wrapping resolvers in code: directives are visible and uniform; code is explicit and easier to debug.", "Executable directives vs type-system directives: executable ones let clients influence execution; type-system ones are controlled by the schema author."],
    p: ["A directive declared but not implemented gives a false sense of protection.", "Directive order on a field matters when several wrap the resolver, and is rarely documented."],
    v: "Enumerate all custom directives and, for each, find the code that interprets it. Call a field using one and confirm its behavior takes effect.",
    dep: ["schema-definition-language", "schema-construction"]
  },
  "schema-construction": {
    s: "The step that turns type definitions and resolver implementations into one executable schema, validated for completeness, either from a schema file or from code definitions.",
    d: "In schema-first construction a definition file is parsed and resolvers are bound by type and field name. In code-first construction, types are declared in the host language and the schema file is generated. Either way, construction checks that interfaces are satisfied, referenced types exist and root types are present, then applies directives and merges modules. It runs at startup and again on live schema reload. Failures here should stop the server from starting, not appear as runtime errors on the first request.",
    k: ["Schema-first vs code-first: schema-first is a reviewable contract and language-neutral; code-first reduces duplication and keeps types in sync with resolvers.", "Build at startup vs reload live: startup is simple and consistent; live reload permits updates without restart but must swap atomically."],
    p: ["Resolver map keys that misspell a field are silently ignored, leaving the real field with the default resolver.", "Reloading schema while requests are in flight can mix old and new types in one response."],
    v: "Start the server with a resolver for a non-existent field and a missing resolver for a required field, and confirm startup fails or warns for both with names.",
    dep: ["schema-definition-language", "schema-directives"]
  },
  "connection-pagination": {
    s: "A convention for lists in which a field returns a connection holding edges with cursors, plus page information, so pagination is uniform and stable across the schema.",
    d: "Instead of returning a raw list, a field takes first and after arguments and returns edges, each with a node and an opaque cursor, plus a page info object saying whether more pages exist. Cursors encode a position, often derived from a sort key, so insertions do not shift pages as offsets do. The convention supports edge-level data such as the relationship's date. Hard parts are translating cursors into efficient backend queries, supporting backward paging, and handling total counts without scanning.",
    k: ["Cursor connections vs offset and limit: cursors are stable under inserts and scale; offsets are simple and allow jumping to page numbers.", "Include a total count vs omit it: counts help interfaces but can force expensive full scans."],
    p: ["Cursors that encode a position in an unstable sort produce duplicates or gaps between pages.", "Requesting a very large first value defeats pagination unless a maximum page size is enforced."],
    v: "Page through a list with first set to five while inserting rows between requests. Confirm no item appears twice or is skipped, and the final page reports no next page.",
    dep: ["object-and-interface-types", "cost-annotations"]
  },
  "global-object-ids": {
    s: "A convention giving every object a unique opaque identifier across all types, plus a lookup field that fetches any object by it, so clients and caches can refer to objects uniformly.",
    d: "The server encodes the type name and the backend key into one opaque string and exposes it as an id field on nodes. A single node field decodes the id, finds the type and loads the object. Clients use these ids as cache keys and for refetching one object. It also lets federation and caches treat entities uniformly. Hard parts are the opaque encoding, which must not be treated as a contract, and authorization, since lookup by id must apply the same checks as any other path.",
    k: ["Opaque encoded ids vs raw database keys: opaque ids prevent clients from depending on structure but need decoding; raw keys are transparent but collide across types.", "One generic lookup vs per-type lookups: generic is uniform; per-type is more discoverable and easier to authorize."],
    p: ["A generic lookup that skips authorization lets any caller read any object by guessing ids.", "Clients that parse ids break when the encoding changes."],
    v: "Fetch an object by its global id through the generic lookup and compare it field by field with the same object fetched through its normal path. A different tenant's id must return nothing.",
    dep: ["object-and-interface-types", "data-level-filtering"]
  },
});
