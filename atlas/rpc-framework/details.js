// Details for the RPC framework plate, part 1: contract, code generation, evolution, tooling.
ATLAS.details("rpc-framework", {
  "idl-language": {
    s: "The declarative language in which services, methods and message types are written, independent of any implementation language, and from which all callers and servers are generated.",
    d: "The language has a small grammar: declarations of messages, enums, services and options, with typed fields and explicit numbers or names. A parser turns files into a syntax tree, then resolves names, checks types and produces a descriptor. It is deliberately less expressive than a programming language so every target language can represent it. What makes it hard is that its feature set is the intersection of every supported language: anything one target cannot express either becomes forbidden for all or gets a lossy mapping.",
    k: ["Purpose-built schema language vs reusing a general data-description format: a dedicated language gives precise services and evolution rules; a general format reuses existing tools but cannot express methods or reserved numbers.", "Rich type system vs small intersection of targets: richness (generics, inheritance) makes schemas expressive but breaks mapping to some languages; a small core keeps every client usable."],
    p: ["A construct accepted by the compiler but mapped differently per language (default values, maps, large integers) causes callers to disagree about the same message.", "Style drift across teams, with no linting, produces inconsistent naming that becomes permanent once published."],
    v: "Compile one schema file for three target languages, send the same populated message between each pair, and confirm every field, including edge values such as empty strings and the largest integers, arrives identical.",
    dep: ["schema-compiler"]
  },
  "message-schemas": {
    s: "Typed records made of numbered fields: scalars, nested messages, repeated fields and maps. Each message is the unit that is serialized into one request or response.",
    d: "A message declares fields with a type, a name and a stable identifier used on the wire. Fields may be scalars, other messages, lists or maps, and may track presence (set versus default). Nested messages form a tree; the schema must be acyclic in encoding even if types refer to each other. The hard part is presence: whether an unset integer equals zero or is genuinely absent decides whether an update call can distinguish clearing a value from leaving it alone.",
    k: ["Implicit defaults vs explicit presence: defaults give smaller encodings and simpler code; presence lets a patch say 'leave unchanged', at the cost of extra wrapper types or generated has-methods.", "Many small messages vs a few large shared ones: sharing reduces duplication but couples unrelated methods, so a field change for one caller ripples to all."],
    p: ["Reusing one message type as both request and stored record makes every storage change a wire-compatibility break.", "A required-field rule that cannot be relaxed later makes adding or removing that field a flag day."],
    v: "Round-trip a message with every field type, with one scalar unset and another explicitly set to its default, and confirm the receiver reports the difference where the schema says presence is tracked.",
    dep: ["idl-language", "field-numbering"]
  },
  "service-definitions": {
    s: "Declarations naming each service and its methods, with request type, response type and whether either side streams. They define the callable surface and the dispatch key.",
    d: "A service groups methods; each method names one input message, one output message and a streaming flag per direction. The fully qualified service and method name becomes the path used to route the call on the wire and to look up the handler. Method options can attach semantics such as idempotency or HTTP mapping. It is hard because a method signature is permanent: a method takes exactly one message, so every future parameter must be a new field rather than a new argument.",
    k: ["Single request message per method vs positional arguments: one message evolves by adding fields; positional arguments are more natural but cannot change without breaking callers.", "Many narrow services vs few broad ones: narrow services deploy and version independently; broad ones reduce connection and name-resolution overhead but widen blast radius."],
    p: ["Renaming a service or package changes the wire path, so every existing caller fails with 'unimplemented' even though nothing else changed.", "Methods that accept and return generic bags of fields avoid breaks by giving up all type checking."],
    v: "Call a method by its full path using a hand-built request against a running server and confirm it reaches the handler; call a nonexistent path and confirm a distinct 'unimplemented' status.",
    dep: ["idl-language", "message-schemas"]
  },
  "enums-and-unions": {
    s: "Named integer constants and tagged unions (one-of-many fields), the schema's tools for closed sets of choices and mutually exclusive alternatives.",
    d: "An enum maps names to numbers; the wire carries the number. A union lets one of several fields be set, and the encoding records which. Receivers must cope with values they have never seen, because senders may be newer. Generated code usually keeps an unrecognized enum number rather than rejecting it. Unions are hard to evolve: adding a case is compatible, but moving an existing field into or out of a union changes what old receivers understand.",
    k: ["Closed enums that reject unknown values vs open enums that preserve them: closed catches errors early but breaks old receivers when a new value appears; open needs defensive handling in every switch.", "Union fields vs separate optional fields: unions enforce exclusivity and save space; separate fields are simpler to extend but allow invalid combinations."],
    p: ["A switch statement with no default branch crashes or silently misroutes when a new enum value arrives.", "Using the zero value as a real choice makes 'unset' indistinguishable from that choice."],
    v: "Send an enum value and a union case that the receiver's schema does not know. Confirm the receiver does not crash, and that a re-serialized message still carries the unknown value.",
    dep: ["message-schemas", "unknown-field-preservation"]
  },
  "imports-and-packages": {
    s: "Namespaces and file imports that let schemas be split across files and repositories and shared without name clashes.",
    d: "A package prefixes every type and service name; an import makes another file's types visible. The compiler needs a search path to find imports, and resolves them into one descriptor set. Packages become part of the wire name of services, so they are public. Hard problems are dependency shape and distribution: shared base types become a hub every team depends on, and a transitive import change in a common file can force regeneration across the whole organization.",
    k: ["One monolithic schema repository vs per-team repositories: a monorepo gives atomic cross-service changes and one view of compatibility; separate repositories give independent release at the cost of version-skew management.", "Public imports re-exporting types vs direct imports everywhere: re-exports ease moving definitions, but hide where a type really comes from."],
    p: ["Two files defining the same package name with different versions silently shadow each other depending on search-path order.", "Moving a shared type between files without keeping an alias breaks every importer at the same moment."],
    v: "Compile a schema that imports a type from a second package using a clean checkout and an explicit search path, and confirm the descriptor contains both, with fully qualified names and no missing-import errors.",
    dep: ["idl-language", "schema-compiler"]
  },
  "schema-options": {
    s: "Metadata attached to schema elements that does not change the message shape: deprecation marks, idempotency hints, HTTP mappings, validation rules and custom extension values for tools.",
    d: "Options are typed key-value annotations on files, messages, fields, services and methods, defined through an extension mechanism so tools can add their own without changing the language. The compiler carries them into the descriptor, and plugins or the runtime read them. They are the only place to declare things like 'this method is safe to retry' or 'this field is secret'. The difficulty is that options are advisory unless something enforces them, so declared intent and actual behavior can drift.",
    k: ["Annotations in the schema vs sidecar configuration files: annotations stay with the definition and travel with it; sidecars let operators change policy without a schema release.", "Standard options only vs open extension: open extension lets teams add validation and routing hints but fragments tooling support."],
    p: ["A method marked idempotent that is not causes duplicated side effects once automatic retry reads that option.", "Custom options unknown to a given plugin are silently ignored, so a validation rule is never enforced there."],
    v: "Mark a method idempotent, inspect the descriptor to confirm the option is present, then cause a transient failure and confirm the client retry layer reads and honors it, while a method without the option is not retried.",
    dep: ["idl-language", "descriptor-sets"]
  },
  "schema-compiler": {
    s: "The program that parses schema files, resolves imports and types, checks consistency and produces a descriptor, which generators and tools consume.",
    d: "It runs in stages: lexing and parsing, import resolution, name and type linking, then semantic checks such as duplicate field numbers, reserved ranges and enum zero values. The output is a descriptor set describing every file. It then invokes generator plugins, passing the descriptor and parameters, and writes what they return. It is hard because it must give precise error locations and be fast enough to run on every build for thousands of files, while behaving identically across operating systems.",
    k: ["Single compiler front end plus plugins vs each language shipping its own parser: one front end guarantees identical interpretation; separate parsers can optimize for their language but drift apart.", "Strict validation vs permissive acceptance: strictness catches errors at build time but may reject old, already-deployed schemas."],
    p: ["Different compiler versions used by different teams interpret edge cases differently, producing incompatible generated code from the same file.", "Path-handling bugs on one operating system make generation pass locally and fail in the build."],
    v: "Feed the compiler a schema with a duplicate field number and an unresolved import, and confirm it fails with file and line for each error; then compile a valid tree twice and confirm byte-identical output.",
    dep: ["idl-language", "descriptor-sets"]
  },
  "descriptor-sets": {
    s: "A serialized, machine-readable description of every file, message, field and service in a schema, itself encoded with the same wire format it describes.",
    d: "The descriptor is a data structure listing each type with its fields, numbers, types, options and source information. It is the interchange between the compiler and plugins, and can be embedded in a binary or published to a registry. Servers can expose it through reflection so clients that lack generated code can still make calls. Hard issues are size, since large schema trees produce large descriptors, and consistency, since a descriptor embedded at build time can go stale relative to the deployed schema.",
    k: ["Embedding descriptors in every binary vs fetching from a registry: embedding makes each binary self-describing at the cost of size and staleness; a registry keeps one source of truth but adds a dependency.", "Stripping source comments and locations vs keeping them: stripping shrinks descriptors, keeping them enables documentation and rich error messages."],
    p: ["A descriptor built from an older schema is shipped with a newer binary, and reflection-based tools show methods that do not match behavior.", "Including every transitive file in each descriptor bloats startup memory in processes with many services."],
    v: "Dump the descriptor from a running server, decode it, and confirm every method and field number matches the committed schema at the deployed commit, byte-for-byte on names and numbers.",
    dep: ["schema-compiler"]
  },
  "codegen-plugins": {
    s: "Separate programs the compiler launches, giving each a descriptor and receiving generated files back, so new languages and artifact types do not require changing the compiler.",
    d: "A plugin reads a request on standard input containing descriptors and options and writes a response containing file names and contents. Plugins generate message code, service stubs, documentation, validators or gateway configuration. Because they are ordinary programs, they can be versioned and shipped independently. The difficulty is coordination: a plugin generates code that calls a specific version of the runtime library, so the plugin, compiler and library form a compatibility triangle that has to be pinned together.",
    k: ["Out-of-process plugins vs in-process generators: out-of-process isolates languages and crashes and lets anyone write one; in-process is faster and easier to debug but couples release cycles.", "Generating complete serialization code vs generating tables for a runtime interpreter: complete code is fastest; tables give smaller binaries and slower hot paths."],
    p: ["Generated files built with a newer plugin than the runtime library fail at link or load time, often only on one platform.", "Plugin output that embeds timestamps makes every build produce a diff and defeats caching."],
    v: "Run a custom plugin that emits a file listing every method path, regenerate twice and confirm identical output, then change one method and confirm only that entry changes.",
    dep: ["schema-compiler", "descriptor-sets"]
  },
  "stub-generation": {
    s: "Generated client stubs (typed call objects) and server skeletons (abstract handler interfaces) that bind each method in a service to the runtime's call machinery.",
    d: "For each service the generator emits a client class with one method per RPC, which builds a call to the method's path with the right serializers, and a server base type with one abstract method per RPC plus a registration helper that wires paths to handlers. Streaming methods get streaming signatures. Generated code is thin on purpose; the runtime does the work. The hard part is the mapping into each language's idioms for callbacks, futures and streams without losing deadlines, cancellation or status.",
    k: ["Thin stubs delegating to a generic runtime vs fat stubs with embedded logic: thin stubs let runtime fixes ship without regeneration; fat stubs can be faster but must be rebuilt for every fix.", "Interface-based skeletons vs annotation-driven registration: interfaces give compile-time checking of every method; annotations are less boilerplate but fail at startup."],
    p: ["A server skeleton that supplies default 'unimplemented' bodies lets a team forget a method and ship it.", "Generated names that collide with language keywords or existing members compile on one language and break on another."],
    v: "Generate stubs, start a server implementing one method of a two-method service, and confirm the implemented call succeeds while the other returns an unimplemented status instead of hanging or crashing.",
    dep: ["codegen-plugins", "service-definitions", "client-stub-api"]
  },
  "build-integration": {
    s: "The build rules and package layout that run the compiler on every change, version generated code and publish it so services depend on schemas as they do on libraries.",
    d: "Teams wire generation into their build system so schema changes regenerate code with pinned compiler and plugin versions. Some commit generated files; others generate at build time; many publish generated packages per language from a central schema repository. Dependency declarations then pin schema versions. It is hard because generation must be hermetic and incremental across a large graph, and because publishing multiple languages from one schema introduces ordering: consumers need the package before the server that needs it can deploy.",
    k: ["Committing generated code vs generating at build time: committing makes diffs reviewable and builds simple but invites stale files; build-time generation is always fresh but needs tools everywhere.", "Central generated packages vs each service generating its own: central packages guarantee uniformity; local generation avoids a release step but yields many subtly different copies."],
    p: ["Developers hand-edit a generated file to fix a bug, and the change is lost at the next regeneration.", "Local generation using a different compiler version than the build server produces tests that pass on one machine only."],
    v: "Change a field in the schema, run only the standard build on a clean machine, and confirm the new field appears in generated code for every language with no manual step and the previous commit's output is unchanged.",
    dep: ["schema-compiler", "codegen-plugins"]
  },
  "dynamic-messages": {
    s: "A way to build, read and send messages from a descriptor at runtime, with no generated classes, used by generic tools, gateways and proxies.",
    d: "Given a descriptor, a dynamic message offers get and set by field name or number, with the same encoding as generated types. Generic clients use it to call any service whose descriptor they fetched through reflection. Gateways use it to translate JSON to the wire format. It is slower than generated code because field access goes through lookups and allocation, and it is hard to keep type safety, so errors surface at runtime as bad field names or type mismatches.",
    k: ["Dynamic messages vs generated types for tools: dynamic needs no rebuild when schemas change, at the cost of speed and compile-time checks.", "Caching resolved descriptors vs resolving per call: caching is much faster but must be invalidated when the schema changes."],
    p: ["A generic proxy using a stale cached descriptor misreads renamed or renumbered fields without any error.", "Large numbers sent through a dynamic JSON path lose precision if the intermediate type is a floating-point number."],
    v: "Using only a descriptor fetched from a running server, build a request by field name, call a method, and confirm the response decodes to the same values a generated client sees.",
    dep: ["descriptor-sets", "wire-encoding"]
  },
  "field-numbering": {
    s: "Every field is identified on the wire by a stable number, never its name. Numbers are assigned once, never reused, and retired numbers are reserved so they cannot return.",
    d: "Because the wire carries numbers, a field's name can change safely and its number cannot. Low numbers encode in fewer bytes, so frequent fields get them. When a field is removed, its number and name are marked reserved so the compiler rejects reuse. Number ranges may be held back for extensions or for teams. The difficulty is organizational: nothing prevents someone in an unrelated branch from reusing a number except the reservation checks and review, and the failure is silent data corruption.",
    k: ["Numbers on the wire vs names on the wire: numbers give compact encodings and free renaming; names are self-describing but larger and make renames breaking.", "Reserving removed numbers forever vs allowing reuse after a window: forever is safe but exhausts low numbers on long-lived messages; reuse after a window risks old data being misread."],
    p: ["Two branches add different fields with the same number; both pass tests, and merging yields fields that decode as each other's type.", "Changing a field's type but keeping its number leaves stored and in-flight data decoding as garbage."],
    v: "Attempt to compile a schema that reuses a reserved number and confirm the build fails; then decode stored messages written with the old schema using the new one and confirm all values are intact.",
    dep: ["message-schemas", "wire-encoding"]
  },
  "additive-evolution": {
    s: "The discipline that lets schemas change without coordinated deploys: only add optional fields, new methods and new enum values, and never change an existing meaning.",
    d: "Safe changes are those an old reader can ignore and an old writer can omit. A new field is read as its default by old writers' messages; a new method is simply not called by old clients. Each side must be written to tolerate fields it does not know and values that are missing. Hard parts are semantics rather than syntax: a new field that must be set for correct behavior is not backward compatible, even though the compiler accepts it.",
    k: ["Add fields and defaults vs version the whole API: additive change keeps one API and slow migrations; new versions are explicit but double maintenance.", "Tolerate-and-ignore vs fail on unknown input: tolerating enables rolling deploys; failing catches client mistakes sooner but breaks mixed-version fleets."],
    p: ["A new field whose zero value changes behavior makes every old client implicitly request the new behavior.", "Teams read 'additive' as 'free' and add dozens of unused fields that nobody can later remove."],
    v: "Run a client on the prior schema release against a server on the new one, and the reverse, exercising every method in a staging environment; confirm zero errors and identical results for old fields.",
    dep: ["field-numbering", "unknown-field-preservation"]
  },
  "breaking-change-detection": {
    s: "An automated check comparing the proposed schema with the last released one and failing the change if it would break existing callers or stored data.",
    d: "A tool diffs two descriptor sets against a rule list: no removed or renumbered fields, no changed types, no removed methods or changed streaming shape, no moved packages. Rules differ per level: wire compatibility, source compatibility of generated code, and JSON-name compatibility. It runs in code review and as a build gate against a baseline. The hard part is choosing the baseline, since comparing to the main branch can miss a break against what is actually deployed.",
    k: ["Wire-only rules vs also source and JSON rules: wire-only allows more changes; adding source and JSON rules protects callers who regenerate or use a gateway but blocks harmless renames.", "Hard failure with an override vs advisory warning: a hard gate prevents accidents but trains people to override; warnings get ignored."],
    p: ["The baseline is the previous commit rather than the released version, so a break shipped in two small steps is never caught.", "Overrides granted by anyone in the team leave no record of why a break was accepted."],
    v: "Open a pull request that renumbers a field and one that removes a method; confirm the gate fails both with the rule name, and that a purely additive pull request passes.",
    dep: ["descriptor-sets", "field-numbering"]
  },
  "deprecation-policy": {
    s: "The written process for retiring fields and methods: mark, measure remaining use, announce a date, stop serving, then reserve the identifiers.",
    d: "A deprecated field or method stays functional while tooling marks it in generated code and docs. Servers record which callers still use it, using metadata from interceptors and per-method metrics. After usage reaches zero or a deadline passes, the method is removed and its name or number reserved. Because callers include mobile apps and partner systems that update slowly, usage data and owners matter more than the mark. The difficulty is that removing is permanent while measuring is only as good as the traffic you can observe.",
    k: ["Long fixed support windows vs removal on zero usage: windows are predictable for partners but keep dead code; usage-driven removal is faster but needs trustworthy per-caller metrics.", "Soft deprecation warnings vs hard server-side errors: warnings are gentle and easy to ignore; errors force migration but can cause outages."],
    p: ["Usage is measured on only one cluster, so a caller on another still depends on a method that gets deleted.", "A deprecated field is removed from the schema without reserving its number, and it is reused a month later."],
    v: "Pick a deprecated method, list its callers over the last 30 days from server metrics grouped by caller identity, and confirm the count is zero before the removal change merges.",
    dep: ["schema-options", "telemetry-interceptor"]
  },
  "unknown-field-preservation": {
    s: "A parser keeps fields it does not recognize and writes them back unchanged when re-serializing, so intermediaries do not lose data added by newer schemas.",
    d: "When decoding, any field number absent from the local schema is stored in an opaque side buffer with its wire type. When the message is encoded again, those bytes are emitted. This lets a service that reads, modifies and forwards a message coexist with newer producers. It costs memory and prevents some optimizations. It is hard because it interacts with merges and copies: if a code path rebuilds a message field by field, unknown data is dropped without any error.",
    k: ["Preserve unknown fields vs discard them: preserving keeps pass-through services safe during rollout but retains data you cannot validate; discarding is simpler and reduces size.", "Preservation by default vs opt-in: default protects naive services; opt-in avoids memory and security concerns for public-facing parsers."],
    p: ["A gateway copies known fields into a fresh message to 'clean' it, silently dropping every new field newer clients send.", "Unknown fields retained from untrusted input are re-emitted downstream, bypassing validation."],
    v: "Send a message with a field the middle service does not know through that service to a newer backend, and confirm the backend receives the field unchanged.",
    dep: ["wire-encoding", "message-schemas"]
  },
  "version-routing": {
    s: "Placing major versions in the package or path (v1, v2) so incompatible API generations are separate services served side by side and routed independently.",
    d: "When a change cannot be additive, a new package defines the new generation. Both are registered on the same server or on different deployments, and old callers continue on the old path. Adapters translate between generations or share a core implementation. Routing may also use metadata such as a version header or per-tenant settings. The hard part is cost: every generation is code to test, secure and operate, so retirement needs a schedule and the translation layer needs its own tests.",
    k: ["Separate versioned packages vs in-place evolution: separate packages permit real breaks and clean cutover; in-place keeps one surface and avoids duplication but forbids breaking changes.", "Version in the path vs in metadata: the path is visible in logs and routing rules; metadata is invisible to proxies but keeps the name stable."],
    p: ["Adapters between versions become the only place that knows the full semantics, and diverge from both implementations.", "The old version is never retired, and fixes must be backported twice indefinitely."],
    v: "Call the same logical operation through both versions and confirm each returns correct results, then check that per-version request counts appear separately in metrics.",
    dep: ["service-definitions", "imports-and-packages"]
  },
  "server-reflection": {
    s: "A service on the server that returns its own schema descriptors on request, letting generic tools discover methods and message shapes without generated code.",
    d: "The reflection service answers queries such as 'list services' and 'give me the file defining this symbol', returning descriptors from the server's built-in registry. Clients assemble them into a dynamic schema and can call any method. It is typically enabled in development and restricted in production because it reveals the API surface. It is hard because it exposes exactly what is compiled in, which may differ from what documentation says, and because of the security question of who may enumerate internal services.",
    k: ["Reflection enabled in production vs only in development: enabled helps debugging live incidents; disabled hides the API surface from attackers and saves memory.", "Reflection vs a separate schema registry: reflection needs no extra system and matches the running binary; a registry covers services that are down and keeps history."],
    p: ["Reflection left open on an internet-facing port hands attackers a complete map of internal methods.", "The registry includes only generated files linked into the binary, so services built from partial schemas show gaps."],
    v: "Point a generic client at a running server with no local schema, list its services and call one method, confirming the response decodes and matches what the generated client returns.",
    dep: ["descriptor-sets", "dynamic-messages"]
  },
  "command-line-client": {
    s: "A terminal tool for calling any service method with a text-formatted request, used for debugging, scripts and operations.",
    d: "The tool takes an address, a method path and a request body in a text form such as JSON, resolves the schema from reflection or local descriptors, encodes the call, and prints the response, headers and status. It supports metadata flags, deadlines, TLS options and streaming input and output. It is the quickest way to reproduce a production failure. The difficulty is parity: the tool's idea of encoding and defaults must match the real clients, or it will pass where they fail.",
    k: ["Text request bodies vs binary files: text is easy to author and review; binary preserves exact bytes including unknown fields but is hard to read.", "Reflection-driven vs descriptor-file-driven: reflection needs no setup but only works when enabled; descriptor files work offline and in production at the cost of staleness."],
    p: ["Using the tool with plaintext against a TLS-only endpoint yields an opaque connection error rather than a clear message.", "Operators paste credentials into shell history by passing them as command-line flags."],
    v: "Call a unary and a streaming method with the tool, with a one-second deadline, and confirm output includes response, trailing status and metadata, and that a slow handler returns a deadline-exceeded status.",
    dep: ["server-reflection", "dynamic-messages", "request-metadata"]
  },
  "gateway-transcoding": {
    s: "A gateway that exposes RPC methods as REST-style HTTP with JSON bodies, mapping URL paths and query parameters onto request fields, for clients that cannot use the native protocol.",
    d: "Method options define an HTTP verb and path template. The gateway parses the incoming request, fills the request message from path variables, query string and body, calls the backend over the native protocol and renders the response as JSON. It may be generated per service or work from descriptors at runtime. What makes it hard is the mismatch: streaming calls, status code mapping, field naming, large integers and binary fields have no single obvious HTTP form.",
    k: ["Generated gateway code vs runtime transcoding from descriptors: generated code is fast and type-checked; runtime transcoding updates with descriptors and needs no build step.", "Exposing all methods vs an explicit list: all methods is easy but leaks internal calls; an explicit list is safer and needs maintenance."],
    p: ["Status mapping of a single code to different HTTP statuses by different gateways makes clients handle the same failure two ways.", "A path template that binds two fields ambiguously routes requests to the wrong method."],
    v: "Call a method through the gateway with curl and through the native client with the same input, and confirm identical field values, and that a not-found status becomes the documented HTTP 404.",
    dep: ["service-definitions", "json-mapping", "status-codes", "dynamic-messages"]
  },
  "web-client-bridge": {
    s: "A shim that lets browser code call native-style methods, translating to a protocol browsers can send, since pages cannot control HTTP/2 framing or read trailers.",
    d: "Browsers expose fetch with limited access to trailers and no bidirectional streams, so a bridge adapts: it encodes trailers as a final body frame, supports unary and server streaming over ordinary requests, and may use WebSocket for more. A proxy or the server itself translates back to the native protocol. Hard parts include cross-origin rules, credentials, and the absence of client streaming, so the bridge supports less than the full model and developers must know which calls fail.",
    k: ["Server-side native support for the bridge vs a separate translating proxy: native support removes a hop; a proxy leaves servers unchanged but adds a deployment and failure point.", "Restrict to unary and server streaming vs emulate all four shapes: restriction is predictable; emulation over sockets covers more but has weaker flow control and cancellation."],
    p: ["Missing cross-origin headers on the proxy make every browser call fail while command-line tests pass.", "Large streaming responses are buffered by an intermediary, so the page sees nothing until completion."],
    v: "Load a page that calls one unary and one server-streaming method in a real browser, watch the streamed messages arrive incrementally, and confirm a deliberate error shows the correct status code and message.",
    dep: ["message-framing", "trailers", "stream-multiplexing"]
  },
  "mock-servers": {
    s: "In-memory or standalone fake implementations of services, driven by the schema, for testing clients and development without the real backend.",
    d: "A mock registers handlers for every method of a service from the same skeleton the real server uses, returning canned or scripted responses and injected errors, delays and stream interruptions. In-process mocks use a local transport so tests exercise full serialization, interceptors and deadlines instead of bypassing them. It is hard to keep fakes faithful: they drift from real behavior, particularly error cases, ordering and latency, and clients tested only against them break on the real system.",
    k: ["Mock at the transport level vs mock the stub interface: transport-level mocks exercise serialization and interceptors; stub mocks are simpler but hide whole classes of bugs.", "Hand-written fakes vs recorded responses: hand-written fakes express edge cases; recorded responses are realistic but go stale."],
    p: ["A mock that always succeeds instantly means timeout and retry code is never exercised before production.", "Test servers bound to fixed ports collide when tests run in parallel."],
    v: "Run the client's test suite against a mock that returns an unavailable status twice then success, and confirm the retry policy produced exactly three attempts with the configured backoff.",
    dep: ["server-handler-registry", "local-transports", "stub-generation"]
  },
  "traffic-capture": {
    s: "Recording real calls (messages, metadata, timing) for later replay against a new build, so changes can be validated with production-shaped traffic.",
    d: "A capture interceptor or network tap writes serialized requests and responses with metadata and timestamps to storage, with sensitive fields redacted. A replay tool resends them against a candidate server and compares responses, status and latency to the recording. Unlike synthetic tests it surfaces odd real inputs. It is hard because calls are rarely independent: replayed writes mutate state, time-dependent logic differs, and payloads contain personal data that must not be stored or must be scrubbed.",
    k: ["Sampled capture vs full capture: sampling is cheap but can miss rare inputs; full capture is complete and expensive to store and protect.", "Replay read-only methods only vs replay everything into an isolated copy: read-only is safe; full replay tests writes but needs isolated state and resets."],
    p: ["Captured payloads kept without redaction become an uncontrolled copy of customer data.", "Replaying to a shared staging backend triggers real side effects such as email or payments."],
    v: "Capture an hour of read traffic, replay it against the new build and the old, and confirm the diff report lists any response differences by method and request, with the known-safe ones classified.",
    dep: ["server-interceptors", "call-context", "request-metadata"]
  },
  "health-service": {
    s: "A standard service returning serving status per service name, consumed by load balancers, orchestrators and clients to decide whether to send traffic.",
    d: "The server exposes a check method and often a watch stream; each registered service reports serving, not serving or unknown. Handlers update status on startup, dependency failure or shutdown. Callers poll or watch it. A hard design question is what 'healthy' means: shallow checks only prove the process answers, while deep checks that call dependencies can make every instance report unhealthy together during a shared outage and turn a partial failure into a complete one.",
    k: ["Shallow liveness vs deep dependency checks: shallow checks avoid cascading removals; deep checks catch broken instances but can empty the whole pool during a shared dependency failure.", "Polling vs watch stream: polling is simple and stateless; watching updates faster and cuts load but holds a stream open per client."],
    p: ["A server reports serving before caches are warm and migrations are done, and receives traffic it cannot handle.", "Health status stays 'serving' during shutdown, so balancers keep sending new calls to a draining instance."],
    v: "Stop a dependency and observe the status flip within the configured interval, and confirm the balancer stops routing new calls while in-flight calls complete; then start shutdown and confirm status becomes not-serving first.",
    dep: ["server-handler-registry", "client-health-checking", "graceful-shutdown"]
  },
});
