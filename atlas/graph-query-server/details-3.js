// Details part 3: parsing, validation, evolution, execution.
ATLAS.details("graph-query-server", {
  "lexer-and-parser": {
    s: "Turns request text into tokens and then into a syntax tree, reporting precise line and column for errors, and bounded so hostile input cannot consume unlimited time or memory.",
    d: "The lexer splits text into names, punctuators, numbers, strings and comments; the parser applies the grammar for operations, fragments, selections, arguments, values and directives. It stops at the first syntax error with a location. Input size and token counts are capped because a parser can be attacked with huge or deeply nested documents, which can overflow the stack. Parsing is purely syntactic: it knows nothing about the schema, which is why a valid parse may still fail validation.",
    k: ["Fail on first error vs recover and continue: failing fast is simple and cheap; recovery gives editors many diagnostics but is complex.", "Recursive descent vs iterative parsing: recursion is clear but needs depth limits; iteration resists stack overflow at the cost of complexity."],
    p: ["No token limit lets a megabyte of nested braces exhaust the stack or CPU before any limit runs.", "Unicode and escape handling differences between lexer and clients cause strings to differ after round trip."],
    v: "Send documents with one syntax error, ten thousand nested braces and a ten megabyte string. Confirm the first returns a located error and the others are rejected quickly without memory growth.",
    dep: ["request-envelope"]
  },
  "document-ast": {
    s: "The in-memory tree of operations, fragments, selections and values that parsing produces, which validation, cost analysis and execution all read.",
    d: "Each node records its kind, name, arguments, directives, child selections and source location. Fragment definitions are kept in a map by name, and variable definitions carry types and defaults. Because several phases walk the same tree, it is treated as immutable and may be cached by query hash. Visitors implement validation, depth and cost checks, and planning. The difficulty is size: a large document with many aliases and fragments expands into a tree that costs memory and visit time.",
    k: ["Immutable shared trees vs per-request mutable copies: immutable trees can be cached and shared across requests; mutation is convenient for transforms but needs copies.", "Retain source locations vs drop them: locations make errors precise but add memory per node."],
    p: ["A transform that mutates a cached tree changes what the next request executes.", "Walking fragments inline expands cost exponentially when fragments reference each other repeatedly."],
    v: "Parse one document, run two different analyses on it and confirm the tree is unchanged between them, with a hash comparison of its serialized form.",
    dep: ["lexer-and-parser"]
  },
  "validation-rules": {
    s: "A fixed set of static checks run against the document and schema before execution: known fields, correct argument types, fragments that apply, unique names and no cycles.",
    d: "Each rule is a visitor over the tree with the schema's type info. Rules check that fields exist on the parent type, required arguments are present, variables are used and typed compatibly, fragments are defined, used and acyclic, and merged fields are consistent. The server adds custom rules for depth, cost and policy. Errors are collected and returned together. Validation is where cost lives for invalid or hostile requests, so it should be fast and ordered to fail cheaply, and is skipped for trusted persisted operations.",
    k: ["Validate every request vs cache validation results by hash: validating each is simple and always current; caching saves CPU but must be cleared on schema change.", "Collect all errors vs stop at first: collecting helps developers; stopping saves work against hostile input."],
    p: ["Disabling validation for speed lets malformed operations reach the executor with undefined behavior.", "Cached validation results survive a schema reload and accept removed fields."],
    v: "Submit documents violating each rule: unknown field, wrong argument type, unused variable, fragment cycle. Confirm each returns the specific error with a location and none runs a resolver.",
    dep: ["document-ast", "object-and-interface-types"]
  },
  "operation-selection": {
    s: "Choosing which operation in a multi-operation document to run, by name, and refusing ambiguous requests, along with checks that the operation type is allowed on this transport.",
    d: "A document may hold several named operations and fragments. The request's operation name picks one; a document with a single operation needs no name; ambiguity is an error. The selected operation's type, query, mutation or subscription, is checked against the transport: mutations over GET are refused, subscriptions need a streaming transport. The selection also supplies the root type and its variable definitions. It is small but is where several safety rules sit, including blocking write operations on cacheable routes.",
    k: ["Require operation names vs allow anonymous: required names give clean metrics and allow-listing; anonymous operations are convenient for exploration.", "Run only the named operation vs run all: running one is the standard and predictable behavior; running all would multiply cost."],
    p: ["Allowing mutations over GET lets cross-site links and prefetchers write data.", "A missing operation name against a multi-operation document returns an unhelpful generic error."],
    v: "Post a two-operation document with no name, a valid name and a wrong name, and a mutation over GET. Confirm ambiguity, selection and refusal behave as specified.",
    dep: ["document-ast", "http-transport"]
  },
  "variable-coercion": {
    s: "Conversion and validation of the variable map against the operation's declared variable types, applying defaults and parsing scalars before execution begins.",
    d: "For each variable definition, the server takes the supplied JSON value, applies the default if absent, coerces it to the declared input type, including nested input objects, lists and enums, and calls custom scalar parsers. Failures stop the operation before any resolver runs, with a message naming the variable. Argument values in the document that reference variables are then substituted. A subtle area is list coercion, where a single value is accepted as a one-element list, and null handling for required types.",
    k: ["Coerce before execution vs lazily at the field: upfront coercion fails the whole request early and consistently; lazy coercion delays errors and mixes them with data.", "Strict types vs lenient conversions: strictness catches client bugs; leniency such as accepting a number for a string hides them."],
    p: ["Variables never validated against size lets a huge list reach a resolver as one argument.", "A default applied for a missing value but not for an explicit null surprises callers."],
    v: "Send variables with a wrong type, a missing required value, an unknown enum name and a nested input with a bad field. Confirm each produces a variable-level error and no resolver runs.",
    dep: ["input-types", "custom-scalars", "document-ast"]
  },
  "parsed-document-cache": {
    s: "A bounded in-memory cache from query text or hash to a parsed and validated document, so repeated operations skip the parse and validation work.",
    d: "After a document passes parsing and validation, it is stored keyed by a hash of its text together with the schema version. A hit goes straight to execution with fresh variables. The cache is size-bounded with eviction, since callers can send unique text to fill it. It is shared by all requests, so cached documents must be immutable. The key must include everything that affects validation: schema version, the rule set and the caller's policy where rules differ.",
    k: ["Cache by exact text vs by normalized form: exact is cheap to compute; normalization raises hit rate but costs CPU per request.", "Unbounded cache vs LRU with a size cap: unbounded is simple until unique queries exhaust memory; a cap trades some misses for safety."],
    p: ["Caching by text without the schema version serves removed fields after a schema reload.", "Attackers sending unique documents evict hot entries, reducing hit rate when it matters."],
    v: "Run the same operation one thousand times and confirm the trace shows a parse and validate on the first only. Reload the schema and confirm the next call re-validates.",
    dep: ["document-ast", "validation-rules"]
  },
  "deprecation": {
    s: "A first-class marker on fields, arguments and enum values that tells clients to stop using them, with a reason, while the server continues to serve them until removal.",
    d: "A built-in directive flags an element as deprecated with a human-readable reason that points to the replacement. Introspection exposes it, editors strike it through, linters warn, and generators can mark generated code. The server keeps resolving the field and records its use so owners know when removal is safe. It is only effective when paired with usage data and a removal policy, since a deprecation nobody tracks stays forever.",
    k: ["Deprecate then remove vs keep forever: removal keeps the schema small but needs usage evidence and notice; keeping is safe but the schema grows.", "Reason text with replacement vs bare flag: a pointer to the replacement speeds migration; a bare flag leaves clients guessing."],
    p: ["Deprecating a field without tracking usage means removal happens blind or never.", "Deprecated arguments that are required cannot be removed without a breaking change."],
    v: "Deprecate a field, run the editor language service and introspection, and confirm both show the reason. Confirm usage tracking then counts calls to it by client.",
    dep: ["schema-directives", "field-usage-tracking"]
  },
  "breaking-change-detection": {
    s: "A comparison of two schema versions that classifies each difference as breaking, dangerous or safe, so incompatible changes are caught before they deploy.",
    d: "A differ walks old and new schemas: removed types or fields, changed argument types, newly required arguments and nullable-to-non-null changes on input are breaking; new enum values and union members are dangerous because clients may not handle them; additions are safe. Output attaches to a pull request or a deploy gate. It judges the schema alone, without knowing client behavior, so it overstates risk for unused elements and understates it for subtle semantic changes.",
    k: ["Block on any breaking diff vs consult usage data: blocking is strict; checking actual usage allows safe removals of unused fields.", "Diff in CI vs diff at publish: CI gives early feedback; publish-time enforcement cannot be skipped."],
    p: ["Semantic changes such as a field now returning a different unit are invisible to a structural diff.", "Reporting dangerous changes as safe lets a new enum value crash older clients."],
    v: "Remove a field and change an argument to required in a branch. Confirm the diff lists both as breaking with their paths, and that adding an optional field is reported safe.",
    dep: ["schema-definition-language", "schema-registry"]
  },
  "field-usage-tracking": {
    s: "Collection of which fields, arguments and enum values clients actually request, by client name and version, to show what can be safely changed or removed.",
    d: "At validation or execution, the server records the schema coordinates touched by each operation, keyed by client identifier from a request header, and ships aggregated counts to a store. Queries over the store answer questions such as which clients still use a deprecated field and when it was last seen. It makes schema change a data-driven decision. Hard parts are cost at high traffic, hence sampling or per-operation aggregation, and trustworthy client identification.",
    k: ["Record per operation hash vs per field per request: per hash is cheap and exact; per field is simple but multiplies volume.", "Require client names vs accept anonymous traffic: names make owners reachable; requiring them rejects unidentified callers."],
    p: ["Sampling can miss a rare client that uses a field once a month.", "Clients sending a generic name make usage impossible to attribute."],
    v: "Call a deprecated field from two named client versions and confirm the store shows two rows with correct counts, and that the last-seen time updates within the aggregation delay.",
    dep: ["operation-naming", "validation-rules"]
  },
  "schema-registry": {
    s: "A service that stores every published schema version, its checks and its history, and is the source of truth for what the running servers should serve.",
    d: "Teams publish a schema with a version, variant or environment name. The registry runs checks, such as breaking-change detection, composition and operation checks, stores the result and serves the latest approved schema to servers or the router. It keeps history so a rollback restores a known schema. Servers either poll it or are pushed updates. It becomes critical infrastructure: if it is down, new schemas cannot roll out, and servers need a cached last-good schema.",
    k: ["Servers pull the schema from the registry vs ship it in the image: pulling allows live updates; baking in is reproducible and needs no runtime dependency.", "One registry for all environments vs separate per environment: one gives history in one place; separate isolates production from experiments."],
    p: ["A server that cannot start without reaching the registry turns a registry outage into a full outage.", "Publishing from developer machines bypasses checks that CI enforces."],
    v: "Publish a change that fails a check and confirm it is refused with the reason and not served. Then stop the registry and confirm a restarting server loads its last-good schema.",
    dep: ["breaking-change-detection", "schema-publishing"]
  },
  "schema-publishing": {
    s: "The CI step that checks a proposed schema against the registry and operation history, then publishes it atomically with the deploy that implements it.",
    d: "On each merge, the pipeline extracts the schema from code or file, runs lint and diff, validates recorded operations against it, and publishes to the registry as part of the deployment. Publication should follow the new code becoming healthy, and not precede it, or clients may see fields no server implements. For federated setups, the subgraph publishes its schema and composition runs. The challenge is ordering across multiple services and rollbacks.",
    k: ["Publish before deploy vs after: before lets clients rely on fields not yet served; after is safe for additions but delays clients.", "Publish on merge vs on release: merge is continuous but exposes unreleased work; release gates it behind a decision."],
    p: ["Publishing before the new code is live exposes fields that fail at runtime.", "Rolling back code without rolling back the registry advertises fields the old code lacks."],
    v: "Merge a change adding a field. Confirm the registry version changes only after the instance serving it passes its health check, and the field resolves immediately after.",
    dep: ["schema-registry", "breaking-change-detection", "operation-checks"]
  },
  "additive-only-policy": {
    s: "The rule that the public schema only grows: new fields, types and optional arguments are added, and existing ones are deprecated and kept until usage reaches zero.",
    d: "Instead of numbered versions, the one schema evolves compatibly. Changes that would break clients are done by adding a replacement, deprecating the old element, tracking usage and removing only after a notice period. Semantic changes get a new field name. It spares clients from migrating on a schedule they do not control, at the price of a growing schema and long-lived legacy resolvers. It is a policy backed by tooling, not a feature of the language.",
    k: ["Versionless evolution vs versioned endpoints: one schema is simpler to operate and keep consistent; versions allow clean breaks but multiply deployments.", "Long deprecation windows vs short: long windows protect slow clients; short windows reduce legacy code."],
    p: ["Changing field meaning while keeping its name breaks clients without any schema diff.", "Deprecated fields with no removal date accumulate until the schema is mostly legacy."],
    v: "Pick the last ten schema changes and classify each as additive or breaking. All breaking ones must have an approved exception and a recorded usage-zero date.",
    dep: ["deprecation", "breaking-change-detection", "field-usage-tracking"]
  },
  "execution-engine": {
    s: "The component that runs a validated operation: it walks the selection tree from the root, calls resolvers, completes values and builds the response in the shape the client asked for.",
    d: "Given a schema, document, variables and context, the engine selects the operation, builds the root value and executes fields. For each object it collects the fields to run, resolves them (in parallel for queries, in order for mutations), then recursively completes each result according to its declared type. Errors are recorded with paths and execution continues where nullability allows. The output mirrors the query's shape. The engine is where performance, error semantics and concurrency policy meet, so changes to it affect every request.",
    k: ["Breadth-first by level vs depth-first per field: breadth-first batches sibling work and suits loaders; depth-first is simpler and yields results sooner.", "Interpreted tree walk vs compiled query plans: walking is flexible; compiling per document can be much faster for repeated operations but is complex."],
    p: ["Unbounded concurrency over a large list floods backends with simultaneous calls.", "Engine-level exceptions that are not caught per field turn one bad resolver into a whole-request failure."],
    v: "Run a nested query with a known resolver call graph and record calls in order. Confirm sibling fields start together for queries, one at a time for mutations, and the response matches the requested shape.",
    dep: ["field-collection", "resolver-functions", "value-completion"]
  },
  "field-collection": {
    s: "The step that flattens a selection set, including fragments, inline fragments and conditional directives, into the ordered set of fields to resolve for a given object type.",
    d: "For one object, the engine gathers fields from the selection, expands fragments whose type condition matches the object's concrete type, honors skip and include conditions after variable substitution, and groups fields by response key so aliases and repeats merge. Merged fields have their subselections combined. Validation has already ensured merged fields are compatible. Order follows first appearance, which fixes response key order. It is hot code, run for every object in a list, so caching its result per type and selection pays off.",
    k: ["Collect per object vs cache per type and selection: per object is simple; caching avoids repeating work across a large list at the cost of memory.", "Defer type-condition checks to runtime vs precompute: runtime is flexible; precompute speeds but needs the type known upfront."],
    p: ["Ignoring skip conditions that depend on variables executes fields the client excluded.", "Repeated collection over a ten thousand item list dominates execution time."],
    v: "Query a list of an interface type with overlapping fragments and a skip condition. Confirm each element returns merged fields once, excluded fields are never resolved, and the response key order matches the query.",
    dep: ["document-ast", "abstract-type-resolution"]
  },
  "resolver-functions": {
    s: "The functions bound to schema fields that produce each field's value from the parent object, arguments and context, calling backends or computing results.",
    d: "A resolver receives the parent value, the field's coerced arguments, a shared context and info about the field's position. It returns a value, a promise or a stream. Most fields use a default that reads a property from the parent, so resolvers are written only where data must be fetched or computed. Resolvers should be thin: translate arguments, call a service layer, shape the result. Putting business rules inside them couples them to the graph and makes them hard to test or reuse.",
    k: ["Thin resolvers over a service layer vs logic in resolvers: a service layer is testable and reusable; inline logic is quick but ties business rules to the schema.", "Fetch in the parent and read properties vs fetch per field: parent fetching is efficient but over-fetches; per field fetches only what is selected but multiplies calls."],
    p: ["Resolvers that fetch inside loops issue one backend call per list item.", "A resolver that mutates the shared context creates order-dependent bugs between sibling fields."],
    v: "Call each resolver in isolation with a fake context and compare its output with the response from an end-to-end call for the same field. They must agree, including for null and error cases.",
    dep: ["resolver-context", "data-source-abstraction"]
  },
  "resolver-context": {
    s: "The per-request object passed to every resolver, holding the caller's identity, request-scoped loaders, backend clients, the cancellation signal and tracing handles.",
    d: "The server builds it once per operation: authentication result, request id, loaders created fresh so their caches are scoped, and clients for backends. Resolvers read from it instead of globals, which keeps them testable and request-isolated. It must never hold state that persists across requests, and anything mutable in it is shared by concurrent resolvers. For subscriptions, the context is built per connection or per event depending on whether identity or data scoping is needed.",
    k: ["Rich context with services vs minimal context with imports: rich context is easy to fake in tests; imports are simple but hide dependencies.", "Context per request vs per event on subscriptions: per event reflects current identity but costs setup each time."],
    p: ["Creating loaders at process scope leaks cached data across callers.", "Putting a mutable cache into context shared between concurrent resolvers produces races."],
    v: "Fire two concurrent requests as different users each asking for the same object. Confirm each resolver sees only its own identity and its loader caches never return the other user's data.",
    dep: ["authentication-context", "request-scoped-loaders"]
  },
  "abstract-type-resolution": {
    s: "Determining the concrete object type of a value returned for an interface or union field, so the executor knows which subselections and fragments apply.",
    d: "After a resolver returns a value for an abstract type, the engine calls a type resolver, often reading a discriminator field or testing each possible type's predicate, to name the concrete type. Then fragments for that type are applied. A wrong or missing answer is an error. Type resolution runs per element in lists, so it must be cheap. The challenge is that data from backends often lacks an explicit type tag, so the resolver must infer one from shape.",
    k: ["Discriminator field vs shape-based inference: a discriminator is fast and explicit; inference needs no extra data but is fragile when shapes overlap.", "Resolve on each item vs at the parent: per item is general; resolving once at the parent is faster when a list is homogeneous."],
    p: ["Shape-based checks that match two types return the wrong concrete type for some rows.", "A new backend type with no mapping fails every query that reaches it with an opaque error."],
    v: "Return one value of each concrete type through an interface field and confirm the reported type name and the selected fields are right for each. An unmapped value must yield a located error.",
    dep: ["object-and-interface-types", "unions-and-enums"]
  },
  "value-completion": {
    s: "The recursive step that checks a resolver's returned value against the field's declared type, serializing leaves and expanding objects and lists into subselections.",
    d: "For leaf types, the value is serialized by the scalar or enum. For lists, each item is completed in turn. For objects, subfields are collected and executed with the value as parent. For non-null types, a null result is an error. Promises and streams are awaited here. Completion enforces the schema as a runtime contract, so a resolver returning the wrong shape surfaces as an error at the field, not as a corrupt response. It is the main place type errors in resolvers show up.",
    k: ["Strict completion vs coercing leniently: strict surfaces resolver bugs immediately; lenient hides them behind surprising output.", "Await list items sequentially vs concurrently: concurrent is faster but multiplies in-flight backend work."],
    p: ["Returning a number where the schema declares a string produces an error in production but passes loose unit tests.", "Very large lists complete synchronously and block the event loop for other requests."],
    v: "Make a resolver return a wrong type, a null for a non-null field and a list with one bad item. Confirm each yields an error at the exact path and surrounding fields remain intact where nullable.",
    dep: ["nullability-model", "custom-scalars", "null-propagation"]
  },
  "null-propagation": {
    s: "The rule that an error or null in a non-null position replaces the nearest nullable ancestor with null, bounding the damage of one failure to a defined part of the response.",
    d: "When completing a non-null field fails, the failure is raised to the parent object. If the parent is itself non-null the failure continues upward until a nullable position absorbs it, or the whole data becomes null. Each such error is recorded with its path, so clients can see where it started. This is deterministic and lets clients reason about partial results. The cost is blast radius: one flaky field in a non-null chain can null out a large object, so nullability design determines resilience.",
    k: ["Short non-null chains vs deep: short chains limit blast radius; deep chains promise more but fail large.", "Propagate to nearest nullable vs fail the whole request: nearest-nullable gives partial data; failing everything is simpler but fragile."],
    p: ["Marking nearly every field non-null turns single failures into empty responses.", "Clients that read only data and ignore errors treat nulled-out parts as legitimately missing."],
    v: "Fail a deeply nested non-null leaf and confirm the nearest nullable ancestor is null, siblings above it still return, and the error path points to the failing leaf.",
    dep: ["nullability-model", "error-model"]
  },
  "error-model": {
    s: "The standard response shape for failures: an errors array with message, path, locations and extensions, returned alongside whatever data could still be produced.",
    d: "Each error carries a human message, the path to the field, source locations and an extensions map where servers put a machine-readable code. Request-level failures such as syntax errors return only errors; field-level failures return data with errors. Errors from backends are wrapped so internal details are not exposed: clients get a code and a safe message, logs get the cause. The design question is domain errors, which many schemas model as typed results so expected failures are part of the contract.",
    k: ["Errors array for everything vs typed domain errors in the schema: the array is uniform; typed results make expected failures explicit and checkable by clients.", "Mask internal error messages vs pass through: masking prevents leaks but slows debugging unless a trace id links to logs."],
    p: ["Passing a database error message through to clients leaks table names and query text.", "Clients that branch on message text break whenever wording changes; machine codes are needed."],
    v: "Trigger a validation error, a domain error and an internal exception. Confirm each returns a distinct code, no stack trace or backend text, and a request id that finds the full cause in logs.",
    dep: ["resolver-functions", "error-classification"]
  },
  "parallel-execution": {
    s: "Running sibling fields of a query concurrently, bounded by limits, so independent backend calls overlap and total latency tracks the slowest path instead of the sum.",
    d: "For query operations the engine starts all sibling resolvers at once and awaits them together, descending as each completes. Latency becomes the longest chain of dependent fields. Concurrency is capped globally or per backend so a wide list does not open thousands of simultaneous calls. Combined with batching, siblings enqueue keys in the same tick, and the batch fires once. The difficulty is unfairness and overload, and that results interleave nondeterministically, which complicates tracing and tests.",
    k: ["Unbounded fan-out vs capped concurrency: unbounded minimizes latency but can overwhelm backends; a cap protects them with higher tail latency.", "Concurrent siblings vs sequential: concurrency is faster; sequential gives deterministic order and lower peak load."],
    p: ["A list of one thousand items with a per-item call opens a thousand backend connections at once.", "Shared mutable state in resolvers produces races that only appear under concurrency."],
    v: "Query three independent fields each sleeping one second. Confirm the total is about one second, and with a concurrency cap of one it is about three seconds.",
    dep: ["execution-engine", "batch-loader"]
  },
  "serial-mutation-execution": {
    s: "The rule that root mutation fields run one after another in the order written, so later mutations see earlier effects, while their subselections still resolve normally.",
    d: "Top-level mutation fields execute strictly in sequence: each completes, including its selection of the result, before the next starts. This makes batches of writes in one request deterministic. A failure in a non-null mutation field stops propagation per the nullability rules but does not undo earlier ones: there is no transaction around the operation unless the application adds one. It is the main reason mutations are slow compared with queries, and the reason to keep them few per request.",
    k: ["Serial root mutations vs parallel: serial makes ordering well defined; parallel is faster but order-dependent writes would race.", "Rely on one mutation per request vs multi-mutation batches: one is simple and retry-safe; batches save round trips and need compensating logic."],
    p: ["Assuming a multi-mutation request is atomic leaves partial writes when the second one fails.", "Retrying a whole multi-mutation request after a timeout repeats the writes that already succeeded."],
    v: "Send a document with three mutations where the second fails. Confirm the first has committed, the second reports its error, and the third is run or skipped according to the documented rule.",
    dep: ["execution-engine", "error-model"]
  },
});
