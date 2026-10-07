// Details for the API client plate, part 2: collections, environments, schema import, authentication.
ATLAS.details("api-client", {
  "collection-tree": {
    s: "The hierarchical store of folders and requests that a person browses, reorders and runs, with stable identifiers so items survive renames and moves.",
    d: "Each node is a folder or a request with a unique identifier, a display name, an order and settings that children may inherit. The sidebar renders it lazily, supports drag-and-drop, bulk actions and filtering, and exposes it to the runner as an ordered execution list. Operations such as move, duplicate and delete must keep references valid, including those held by monitors and links. It is hard because the same tree is edited locally, synced remotely and exported to files, and each needs consistent identity.",
    k: ["Stable generated identifiers versus path-based identity: stable ids survive renames and moves and merge cleanly, but are opaque in files; paths are readable and break on every rename.", "Lazy loading of large trees versus loading all at startup: lazy loading scales, but complicates search and runner ordering."],
    p: ["Duplicating a folder copies identifiers, so sync treats the copy as the original and overwrites it.", "Drag-and-drop of a request into a folder with different inherited auth silently changes how it authenticates."],
    v: "Rename and move a request, then confirm its history, monitor reference and share link still resolve, and that exporting then importing keeps the same order and identifiers.",
    dep: ["local-database", "collection-format"]
  },
  "folder-inheritance": {
    s: "Lets folders and the collection supply defaults such as authentication, headers, scripts and variables that every request below them uses unless it overrides them.",
    d: "At send time the resolver walks from the request up through its folders to the collection, merging settings in a defined order: nearest wins for authentication and headers, and scripts from every level run in sequence. The interface shows where each effective value came from. It reduces duplication across hundreds of requests, and creates action at a distance: editing a folder changes many requests. It is hard to explain the effective result when several levels contribute.",
    k: ["Nearest-wins override versus merge of all levels: override is easy to predict, but cannot add one header while keeping the parent's; merge is flexible and harder to read.", "Scripts running at every level versus only the nearest: running all supports shared setup, but makes order and side effects difficult to trace."],
    p: ["A folder-level header is added to a request that already sets it, producing duplicate headers the server rejects.", "A script at the collection level runs for a health check that should have been unauthenticated."],
    v: "Set a header at the collection, override it in a subfolder, and view the effective request for a leaf: it must show the subfolder value with the source labeled, and the console must match.",
    dep: ["collection-tree", "auth-inheritance", "pre-request-scripts"]
  },
  "request-examples": {
    s: "Saved request and response pairs that document behavior, show edge cases and can be served by a mock or compared against live responses.",
    d: "An example stores the request as sent, the status, headers and body received, and a name. People save one from a live response or write one by hand. Examples drive documentation, mock matching and sometimes contract checks. Variable values may be stored as placeholders or resolved text. It is hard because examples age: the live API changes, and nothing flags the saved one as wrong, and because real responses captured as examples often contain personal or secret data.",
    k: ["Capturing resolved values versus placeholders: resolved values are realistic and run as-is, but freeze one environment and may carry real data.", "Examples as a separate concept versus saved history entries: separate examples are curated and shareable, whereas history is automatic but noisy and temporary."],
    p: ["A saved example holds a customer's real email address and is published with the documentation.", "The mock serves an outdated example for months after the real API changed."],
    v: "Save a live response as an example, change the live API, and confirm a comparison marks the example stale. Then check that the stored text contains no value from a secret variable.",
    dep: ["response-snapshots", "redaction"]
  },
  "collection-variables": {
    s: "Variables that belong to a collection and travel with it, holding defaults such as base paths and identifiers that are not specific to one environment.",
    d: "They sit between environment values and request-local values in precedence. They are stored in the collection file, so they are shared with everyone who has the collection. Scripts can read and write them, which makes them a convenient place to pass data between requests, and a hidden global state. The interface lists them with current and initial values. It is hard to draw the line between a collection variable and an environment variable, and to avoid secrets in a place that syncs.",
    k: ["Collection scope versus environment scope for defaults: collection scope keeps the collection self-contained, but cannot vary by target; environment scope varies by target and needs setup before anything runs.", "Scripts writing to collection variables versus a separate run scope: writing persists data across runs, but mutates shared files; a run scope is clean and forgets everything."],
    p: ["A script stores a token in a collection variable, which then syncs to the whole team.", "Two variables with the same name at different scopes cause a request to use the value the person did not expect."],
    v: "Set a collection variable, a same-named environment variable and a request-local one, and verify the resolved request uses the documented winner at each step as each is removed.",
    dep: ["variable-scopes", "collection-format"]
  },
  "collection-format": {
    s: "The serialized representation of a collection: an ordered schema of items, settings, scripts and variables that is stable enough to diff, merge, convert and keep for years.",
    d: "A document, or a directory of documents, with a version marker, identifiers, items in order, and per-item fields such as method, URL parts, headers, body mode and scripts. Writers must produce deterministic output, with fixed key order and stable formatting, so that version control diffs are small. Readers must tolerate unknown fields from newer versions. It is a public interface in practice: other tools, scripts and repositories depend on it, so every change needs a migration or compatibility rule.",
    k: ["Single document versus a directory of files: a single document is easy to move and conflicts often in version control; a directory merges well and is awkward to share.", "Closed schema versus extensible with unknown fields preserved: closed catches mistakes early, while preserving unknown fields lets older tools round-trip files from newer ones."],
    p: ["Non-deterministic key ordering causes whole-file diffs on every save.", "An older version drops fields it does not understand when it saves, silently destroying a teammate's newer data."],
    v: "Load a file, save it with no edits, and compare bytes with the original: they must be identical. Then load a file with an unknown field and confirm it survives a save.",
    dep: ["workspace-files"]
  },
  "documentation-generator": {
    s: "Builds readable reference pages from a collection's descriptions, parameters and examples, with markdown notes at every level.",
    d: "It walks the tree in order, rendering each request's method, URL, parameters, headers, body and examples, along with markdown descriptions at collection, folder and request level. Parameter tables may be enriched from an imported schema. Output is shown in the tool, exported as static files, or fed to the publishing service. It is hard because descriptions are written by hand and drift from the behavior, and because variables must render sensibly without exposing values.",
    k: ["Generating from the collection versus from the API description: collection-based docs show real usage and examples, but lack completeness; description-based docs are complete and lack realistic flows.", "Markdown descriptions versus structured fields: markdown is flexible and easy to write, while structured fields can be checked and reused."],
    p: ["Documentation renders resolved variable values and exposes an internal hostname.", "Parameters present in the requests but missing in the descriptions appear as undocumented blanks."],
    v: "Generate documentation for a collection with nested folders and a secret variable, and confirm every request appears in order with its examples, and the secret value does not appear.",
    dep: ["collection-tree", "request-examples", "redaction"]
  },
  "variable-scopes": {
    s: "The layered namespaces of variables, such as global, environment, collection, folder, request and run, with defined precedence and rules for where writes land.",
    d: "When a name is resolved, scopes are consulted from narrowest to widest and the first match wins. Scripts and the interface can write to specific scopes, and some scopes are temporary, living only for one run. Each scope has its own storage and sharing rules. The resolver also reports which scope supplied a value. It is hard because the layering that makes collections flexible also makes debugging difficult: the same name can mean different things in the editor, in the runner and in a script.",
    k: ["Many scopes with fixed precedence versus few scopes: many scopes fit varied needs, but increase confusion about where a value came from; few scopes are simple and push complexity into naming conventions.", "Writes to the narrowest scope by default versus to the one that supplied the value: narrow writes avoid side effects, but surprise people who expect the stored value to change."],
    p: ["A script sets a variable at one scope while the request reads another, so it never sees the new value.", "A leftover global shadows a newly added environment variable with the same name."],
    v: "Define the same name in every scope with different values, resolve it, then delete scopes from narrowest to widest and confirm each resolution matches the documented order, as shown by the variable inspector.",
    dep: ["environment-sets", "collection-variables"]
  },
  "template-interpolation": {
    s: "Substitutes variable references in URLs, headers, bodies and scripts with their current values, including nested references and functions, before the request is built.",
    d: "A parser finds reference markers, usually double braces, in every text field and resolves each name through the scope chain. References can nest, call dynamic functions, or appear inside already-structured text where escaping matters. Unresolved names must be reported, not sent as literal text. It runs on every send and on every keystroke for previews, so it must be fast and free of side effects. It is hard because context determines correct escaping, and because a single pass cannot handle values that themselves contain references.",
    k: ["Single-pass versus recursive resolution: single-pass is predictable and cannot loop, but forbids composing variables; recursive composes and can recurse infinitely without a depth limit.", "Failing on unresolved names versus sending the literal text: failing exposes mistakes at once, while sending the literal text lets a person test how the server treats odd values."],
    p: ["An unresolved variable is sent literally and creates a record named with braces on the server.", "A value containing braces is interpreted as a reference, changing the request in an unexpected way."],
    v: "Send a request with one undefined variable and one nested variable. The undefined one must be reported before sending, and the nested one must show its fully resolved text in the console.",
    dep: ["variable-scopes", "dynamic-variables"]
  },
  "environment-sets": {
    s: "Named collections of variable values, such as local, staging and production, which one is active at a time so the same requests target different systems.",
    d: "An environment is a map of names to values with an optional marker per variable for secrecy. The active one is selected in the interface or passed to the runner. Teams share environments for common targets and keep personal ones for their own credentials. Switching is instant and affects every request, so the visible indicator matters. It is hard to keep environments structurally aligned: a variable added to staging and forgotten in production fails only when someone runs against production.",
    k: ["Shared environments versus per-person ones: shared ones keep teams aligned, but need secrets removed; personal ones are safe and drift apart.", "Free-form variables versus a declared set of names: free-form is flexible, while a declared set lets the tool warn when an environment lacks a required name."],
    p: ["A person runs a destructive request while the wrong environment is active, because the indicator was easy to miss.", "A variable exists in one environment only, so the request works there and fails elsewhere."],
    v: "Switch from staging to production and confirm every variable in a request resolves, with missing names reported. Then confirm the visible indicator changed in all open tabs.",
    dep: ["variable-scopes", "initial-vs-current"]
  },
  "dynamic-variables": {
    s: "Built-in generators that produce a fresh value at send time, such as timestamps, unique identifiers, random numbers and sample names, for requests that need new data.",
    d: "A reference such as a function name resolves by calling a generator when the request is built. Typical families are time, identifiers, random text and numbers, and realistic sample data. Each reference evaluates once per request, or once per use depending on the design. Seeding allows reproducibility. It is hard because values used twice, such as in the URL and in a signature, must agree, and because random data in tests makes failures difficult to reproduce.",
    k: ["Evaluating once per request versus once per occurrence: once per request keeps related fields consistent, but cannot make two different values in one body; per occurrence is flexible and breaks matching.", "Pure random versus seedable: seedable runs can be replayed exactly, while pure random explores more input and cannot be repeated."],
    p: ["A timestamp used in the body and a signature differs by a millisecond, failing verification.", "A random value collides with an existing record, causing an intermittent failure that no rerun reproduces."],
    v: "Use the same unique-identifier reference twice in one request and confirm both resolve to the same value, then rerun with the same seed and confirm the generated values repeat.",
    dep: ["template-interpolation"]
  },
  "data-files": {
    s: "Tabular or structured files whose rows feed a collection run, so the same requests execute once per row with that row's values available as variables.",
    d: "The runner loads a file of rows, maps each column or field to a variable name, and runs the chosen requests for each row, exposing the row to scripts and templates. Formats are typically comma-separated or structured documents. Large files are streamed. It is hard because types are lost in text formats, because quoting and encodings vary, and because a row that fails should not stop the whole run unless the person says so.",
    k: ["Typed structured data versus text rows: structured data keeps numbers and nesting, but is harder to author; text rows are easy to edit in a spreadsheet and lose types.", "Loading the whole file versus streaming: loading is simple and supports random access, but large files consume memory."],
    p: ["A leading zero in an identifier column is dropped by a spreadsheet, so every row targets the wrong record.", "A blank trailing line becomes an extra iteration that fails."],
    v: "Run a collection with a three-row data file including a quoted comma and a leading-zero value, and confirm three iterations occur with exact values shown in the results.",
    dep: ["variable-scopes", "iteration-engine"]
  },
  "initial-vs-current": {
    s: "Separates the value that is shared with a team from the value used locally, so people can run requests with their own data without changing what teammates see.",
    d: "Each variable has an initial value that syncs with the workspace and a current value that stays on the machine. Resolution uses the current value if present. This also gives a place for secrets: the shared definition names the variable, and each person supplies the real value. Scripts write to current values, so sync is not triggered by every run. It is hard because the two values diverge unnoticed, and because exports and documentation must choose which to include.",
    k: ["Two-value model versus a single shared value: two values protect secrets and allow personal data, but let a teammate's view differ from yours invisibly; one value is simple and shares everything.", "Showing both values in the interface versus only the effective one: showing both explains differences, but crowds a small table."],
    p: ["A person puts a real key in the initial value and it syncs to the whole workspace.", "Two teammates see different results from the same request because their current values differ."],
    v: "Set an initial and a different current value, sync to a second client, and confirm the second client sees only the initial value, while requests on the first client use the current one.",
    dep: ["variable-scopes", "account-sync", "secret-variables"]
  },
  "openapi-importer": {
    s: "Reads a machine-readable API description and creates folders, requests, parameters, examples and sometimes assertions for every operation it defines.",
    d: "The importer parses the description, resolves references between schema components, and maps each path and method to a request, with parameters, bodies and security schemes translated to the tool's model. Tags may become folders. Example values come from the description or are synthesized. Re-importing should update changed operations without wiping local edits. It is hard because descriptions are large, reference each other in cycles and use composition keywords with no single obvious request body.",
    k: ["Creating a one-time copy versus keeping a link for updates: a copy is simple and independent, but drifts from the description; a link keeps in sync and needs merge rules for local edits.", "Folders by tag versus by path: tags follow how authors group things, but are inconsistent; paths are reliable and produce deep trees."],
    p: ["A re-import overwrites hand-written assertions and scripts attached to the requests.", "A schema with composition keywords yields a body example that the server rejects."],
    v: "Import a description with nested references, then compare the request count and parameters with the operation list. Re-import after adding one operation and confirm only that request is new.",
    dep: ["collection-tree", "example-synthesis", "schema-sync"]
  },
  "graphql-introspection": {
    s: "Queries a graph-style API for its own schema and caches the result, giving the editor its types, fields, arguments and documentation.",
    d: "The tool sends a standard introspection query and stores the returned type system. The editor uses it for completion and validation, and documentation panes render descriptions. Authentication is often required, and many production servers disable introspection, in which case a schema file can be loaded instead. It is hard because the response is large, because deprecated fields still appear, and because the cache must be refreshed when the server changes.",
    k: ["Introspecting live versus loading a schema file: live is current, but is often disabled or restricted in production; files work offline and can be stale.", "Caching per environment versus per collection: per environment tracks differing deployments, but multiplies refreshes."],
    p: ["Introspection is blocked, so completion silently stops and people assume the editor is broken.", "A cached schema from staging is used against production, flagging valid fields as errors."],
    v: "Point the tool at an endpoint with introspection enabled, then disable it and load the schema from a file, and confirm completion and validation behave the same in both cases.",
    dep: ["http-client", "schema-sync"]
  },
  "rpc-descriptors": {
    s: "Loads service and message definitions from definition files or by asking the server for them, so the tool can list methods and build typed requests.",
    d: "Definitions come from source files with their imports, precompiled descriptor sets, or server reflection, which returns descriptors over the same connection. The loader builds an in-memory registry of services, methods and message types, resolving imports from configured paths. It supplies the message builder with fields and the RPC client with method paths and streaming types. It is hard because import paths are fragile, versions of definitions differ across services, and reflection may be disabled.",
    k: ["Server reflection versus local definition files: reflection is always current and needs server support; files work anywhere and can be stale.", "Compiling definitions in the tool versus requiring precompiled sets: compiling is convenient and needs a full parser and path handling; precompiled sets are simple and need a build step."],
    p: ["An import path differs between machines, so a shared collection fails to load definitions for teammates.", "Reflection exposes an older version of a message than the one the client application uses."],
    v: "Load definitions once from files and once by reflection, then compare the listed methods and message fields. Call a method from each and confirm identical responses.",
    dep: ["rpc-client", "workspace-files"]
  },
  "format-converters": {
    s: "Reads requests from other formats, such as command lines, recorded browser traffic and other tools' collections, and writes collections back out to portable forms.",
    d: "Each converter maps between a foreign representation and the internal model. Importers parse command-line text, recorded traffic archives and other collection formats, filling gaps with defaults. Exporters write the collection, an environment, or a single request in a portable form. Mapping is lossy in both directions, so converters report what they could not carry. It is hard because foreign formats have quirks, and because the importer must not execute or trust anything from an untrusted file.",
    k: ["Reporting every unmapped feature versus best-effort silence: reporting protects trust, but overwhelms with warnings; silence is tidy and hides failures.", "Importing scripts verbatim versus translating them: verbatim keeps the author's intent, but may call functions that do not exist; translation helps and is never complete."],
    p: ["A recorded traffic archive imports with live session cookies and tokens inside the requests.", "An exporter drops folder-level authentication, so exported requests run unauthenticated."],
    v: "Import a recorded traffic archive and a command-line request, then export and re-import. Compare the final requests with the originals, and confirm the tool listed every field it could not map.",
    dep: ["collection-format", "redaction"]
  },
  "schema-sync": {
    s: "Compares the imported API description with the live service and with the saved requests, flagging added, removed and changed operations so collections do not silently go stale.",
    d: "On a schedule or on demand, the tool fetches the latest description and diffs it against the version used for the last import. Changes are shown by operation and applied selectively, preserving local edits such as assertions. Some tools also compare live responses against the described schema. It is hard because a description is intent, not behavior, so the live service may differ from both, and because applying updates to hand-edited requests needs careful merge rules.",
    k: ["Automatic apply versus review of each change: automatic keeps collections current, but may overwrite local work; review is safe and gets skipped when changes are many.", "Comparing against the description versus against live behavior: description diffs are cheap and miss real drift; live checks find real drift and need test data."],
    p: ["A removed operation is deleted from the collection along with the tests attached to it.", "The description is updated, the service is not, and the collection now targets endpoints that do not exist."],
    v: "Remove one operation and rename one parameter in the description, run sync, and confirm both appear in the diff, with local assertions preserved after applying.",
    dep: ["openapi-importer", "graphql-introspection", "collection-tree"]
  },
  "example-synthesis": {
    s: "Generates plausible sample values for parameters and bodies from schemas, formats and constraints, so imported requests can be sent or mocked without hand-written data.",
    d: "A generator walks a schema and picks values: explicit examples first, then defaults, then values that respect type, format, enumerations, ranges, patterns and required fields. It handles arrays, nested objects and composed schemas by choosing a branch. Seeding makes output repeatable. It is hard because valid-by-schema is not valid-by-business-rule: a generated identifier will not refer to a real record, and constraints between fields are not expressible in most schemas.",
    k: ["Deterministic placeholders versus random plausible data: placeholders are stable and look artificial; random data resembles reality and changes between runs.", "Preferring authored examples versus synthesizing everything: authored examples are meaningful and often missing; synthesis always produces something and may mislead."],
    p: ["Generated required fields satisfy the schema but fail server-side rules, so imported requests all return validation errors.", "A pattern constraint is ignored and the generated string is rejected."],
    v: "Generate a body from a schema with an enumeration, a numeric range and a pattern, and validate it back against the same schema. It must pass on every one of many seeded runs.",
    dep: ["schema-assertions", "dynamic-variables"]
  },
  "basic-and-bearer": {
    s: "Builds the standard authorization header for a username and password pair or a token, encoding and placing it correctly without the person assembling it by hand.",
    d: "For basic authentication the helper joins the name and password, encodes them and sets the header. For bearer tokens it prefixes the token with the scheme name. Values come from variables, so credentials stay out of the request text. The header is computed at send time and appears in the console. It is hard to be both convenient and safe: these headers are static secrets, easily copied into code snippets, logs and screenshots.",
    k: ["Computing the header at send time versus storing it: send-time computing follows variable changes and keeps secrets in one place; stored headers are simple and go stale.", "Showing the header in the console versus masking: showing helps debugging, while masking protects screen sharing."],
    p: ["The encoded credentials are mistaken for harmless data and pasted into a ticket, though they decode trivially.", "A bearer token with a trailing space fails with a vague authentication error."],
    v: "Send a request with basic authentication to an echo endpoint and decode the received header: it must equal the expected pair, and the saved request text must contain only variable names.",
    dep: ["template-interpolation", "secret-variables"]
  },
  "api-key-auth": {
    s: "Attaches a key to each request in the place the API expects, as a header, a query parameter or a cookie, with the name and value held separately from the request.",
    d: "The helper takes a key name, a value and a location, and injects the pair at send time. Putting a key in the query string means it can end up in server logs, proxy logs and browser history, so the tool may warn. Some APIs accept several placements. The helper cooperates with inheritance so a whole collection can share one key. It is hard because placement is a property of the API, not the tool, and mistakes show up as generic unauthorized responses.",
    k: ["Header placement versus query parameter: headers stay out of most logs, but some APIs only accept query keys, which spread into logs and URLs shared in chat.", "One key for the collection versus per-request keys: one key is easy to rotate, while per-request keys can narrow scope at the cost of maintenance."],
    p: ["A key in the query string is copied with the URL into a shared document.", "A rotated key is updated in one environment and still sent from a stale variable elsewhere."],
    v: "Send with the key in each supported location and confirm the server sees it only where configured. Then rotate the variable and confirm all requests use the new value.",
    dep: ["variable-scopes", "secret-variables", "auth-inheritance"]
  },
  "oauth-flow-runner": {
    s: "Performs token flows such as authorization code with proof key, client credentials and device flow, opening a browser or calling endpoints, and stores the resulting tokens.",
    d: "The runner builds the authorization request with state and a code challenge, opens a browser to the authorization server, receives the callback on a local address or a hosted redirect, then exchanges the code for tokens. Other flows call the token endpoint directly. Parameters such as scopes, audience and client authentication method are configurable. It is hard because each provider deviates slightly from the standard, and because the flow involves a browser, a local listener and secrets in one place.",
    k: ["Local loopback callback versus a hosted redirect: loopback keeps tokens on the machine, but needs a free port and registered address; a hosted redirect is simple and routes codes through a third party.", "Embedded browser versus the system browser: embedded gives control and has no existing sessions; the system browser reuses sign-ins and is more trusted by users."],
    p: ["The state parameter is not verified, leaving the flow open to a forged callback.", "A flow works with one provider and fails with another because the client authentication method differs."],
    v: "Run an authorization code flow against a test authorization server and confirm the state matches, the code is exchanged once with the verifier, and the token appears in the store with its expiry and scopes.",
    dep: ["token-store", "http-client", "tls-stack"]
  },
  "token-store": {
    s: "Keeps access and refresh tokens with their expiry and scope, attaches the right one to each request, and renews expired tokens before sending.",
    d: "Tokens are saved against a configuration, such as a client and scope, with their lifetime. Before a request, the store checks expiry with a margin and, if needed, uses the refresh token or reruns a non-interactive flow. Concurrent requests must share one refresh, not each trigger their own. Rotating refresh tokens invalidate the old one at once. It is hard because refresh races, clock skew and token revocation all cause intermittent failures that look unrelated to authentication.",
    k: ["Refreshing proactively before expiry versus on a 401 response: proactive refresh avoids a failed request, and depends on accurate clocks; reactive refresh is robust to skew and costs an extra round trip.", "Persisting tokens across restarts versus memory only: persisting is convenient and extends the exposure window; memory only is safer and forces re-login."],
    p: ["Two parallel requests both refresh, and with rotation the second invalidates the first, logging the user out.", "Tokens stored in plain text in the workspace file are synced to teammates."],
    v: "Expire a token on purpose and send ten parallel requests: exactly one refresh call must occur, all ten succeed, and the stored token is replaced once.",
    dep: ["credential-store", "oauth-flow-runner", "secret-variables"]
  },
  "request-signing": {
    s: "Computes a signature over parts of the request, such as method, path, headers and body hash, with a secret key, and adds it so the server can verify authenticity.",
    d: "Signing schemes define a canonical string built from specified request parts, a hash or message authentication code over it, and where the result goes. The helper runs last, after variables, other headers and the body are final, because any later change invalidates the signature. Timestamps and nonces limit replay. It is hard because canonicalization rules are exact: header case, query ordering and body encoding all change the signature, so one stray byte fails with an opaque error.",
    k: ["Built-in schemes versus signing in scripts: built-in schemes are tested and easy, but cover only popular algorithms; scripts handle any scheme and put crypto in user code.", "Signing after all transformations versus before: signing last is correct, but means the person cannot see the final signed bytes in the editor."],
    p: ["A proxy or the transport reorders query parameters after signing, so the server computes a different signature.", "Clock skew puts the timestamp outside the accepted window and the failure looks like a bad key."],
    v: "Sign a request, then recompute the signature independently from the logged final request using the documented scheme. The two values must be identical, and the server must accept the call.",
    dep: ["pre-request-scripts", "body-serializers", "secret-variables"]
  },
  "client-certificates": {
    s: "Presents a certificate and private key during the TLS handshake for services that require mutual authentication, chosen per host and kept out of shared files.",
    d: "The tool stores certificate and key file references, or a combined bundle with a passphrase, mapped to host patterns. During the handshake the TLS stack offers the matching certificate. Custom certificate authorities for private services are configured alongside. Paths are local to one machine, and keys are highly sensitive. It is hard because handshake failures give little detail, formats vary, and sharing a collection must not export keys.",
    k: ["Per-host configuration versus per-request: per-host matches how services work and keeps requests clean, but surprises people when a host pattern is broader than intended.", "Referencing key files versus importing them into storage: references avoid copying secrets, and break when files move; importing is portable and enlarges what the tool must protect."],
    p: ["A certificate expires and every request to that host fails with a generic handshake error.", "A shared collection points at a key file path that exists only on the author's machine."],
    v: "Call a test server that requires client certificates, once with the right certificate and once without. Only the first should succeed, and the server log should show the certificate subject.",
    dep: ["tls-stack", "credential-store"]
  },
  "auth-inheritance": {
    s: "Lets a request use authentication defined on its folder or collection, so credentials are set once and shared, and can be overridden or disabled for a single request.",
    d: "Each request has a mode: inherit, none or a specific type. With inherit, the resolver takes the nearest ancestor's configuration. This keeps credentials out of hundreds of requests and makes rotation a single edit. The effective authentication is shown in the editor, including where it came from. It is hard because the open endpoints in a collection, such as login or health checks, must opt out, and because a wrong inherited setting affects many requests at once.",
    k: ["Inherit by default versus explicit per request: inheriting avoids repetition and a mistake at the top affects everything; explicit is verbose and obvious.", "Allowing different types at different levels versus one type per collection: mixing supports varied services, and makes the effective header harder to predict."],
    p: ["The login request inherits bearer authentication and sends a stale token to the endpoint that issues tokens.", "A request moved into another folder silently picks up that folder's credentials."],
    v: "Set authentication on a collection, override it on one folder and disable it on one request. View each effective request in the console and confirm the three different results.",
    dep: ["folder-inheritance", "basic-and-bearer", "token-store"]
  }
});
