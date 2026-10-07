// Details for the embedded database plate, part 1: application surface and cross-cutting concerns.
ATLAS.details("embedded-database", {
  "connection-handle": {
    s: "The object that represents one open database file inside the host process, owning its pager, schema cache, registered functions, settings and error state.",
    d: "Opening a connection allocates a handle, opens the file through the VFS, and defers reading the schema until the first statement needs it. The handle owns the cache of parsed schema, the list of registered functions and collations, the busy handler, and the last error. Closing it finalizes statements, rolls back open work and releases locks. It is hard because the handle is the unit of isolation: two handles on one file are separate transactions even inside one process, and misuse across threads corrupts state.",
    k: ["One handle per thread vs one shared handle behind a mutex: separate handles scale readers but each carries its own cache; a shared handle saves memory and serializes everything.", "Lazy schema read vs eager read at open: open is cheap and cannot fail on a damaged catalog, but the first query pays the cost and surfaces the error."],
    p: ["Closing a handle with unfinalized statements leaks memory and, in strict builds, refuses to close, leaving the file locked.", "Sharing a handle across threads without the right threading mode produces rare, unreproducible crashes."],
    v: "Open two handles on one file in one process, begin a write on the first, and confirm the second sees the old data and gets a busy error when it tries to write.",
    dep: ["vfs-interface", "page-cache", "schema-load"]
  },
  "open-flags-and-uris": {
    s: "The options given at open time: read-only or read-write, create, in-memory, shared cache, and a URI form that carries per-connection parameters in the file name.",
    d: "The open call takes a path plus flags. A URI path adds query parameters such as mode, cache, VFS name and immutable, parsed before the file is touched. The flags decide whether a missing file is created, whether writes are allowed, and which threading mode applies. Special names select a private temporary database or a purely in-memory one. The hard part is that the same file can be opened with different options by different processes, and the library must make those combinations behave predictably.",
    k: ["URI parameters vs separate API calls: one string can be passed through configuration files and tools unchanged, but typos in parameter names are ignored silently.", "Create-on-open by default vs explicit create flag: scripts just work, but a mistyped path quietly creates an empty database instead of failing."],
    p: ["A mistyped path creates a new empty database, and the application reports no tables rather than a missing file.", "Opening a file on read-only media without the immutable flag still tries to take locks and fails."],
    v: "Open a nonexistent path with the read-write flag but no create flag and confirm it fails; open the same path with create and confirm a zero-length file appears only after the first write.",
    dep: ["vfs-interface", "in-memory-databases"]
  },
  "prepared-statement": {
    s: "A compiled SQL statement held as a bytecode program plus its parameter slots, ready to be bound, stepped and reset many times without recompiling.",
    d: "Preparing runs the whole compiler pipeline once and returns a statement object holding the program, the parameter names, and the result column names and declared types. Stepping runs the program; resetting rewinds it so it can run again with new bindings. Statements are owned by their connection and must be finalized. The engine records the schema version it compiled against so a stale statement can recompile itself. Difficulty lies in lifetime: a live statement holds read locks, so one forgotten statement can block writers.",
    k: ["Compile once and reuse vs compile per call: reuse saves parsing and planning time, but cached statements pin memory and read locks.", "Return only the first statement in a string vs run a whole script: single statements make errors and bindings clear, while scripts need a loop in the caller."],
    p: ["A statement that was stepped but never reset or finalized keeps its read transaction open, so a later writer on another handle waits forever.", "Preparing with a trailing statement in the string silently ignores the remainder unless the caller checks the tail pointer."],
    v: "Prepare a query once, run it ten thousand times with different bindings, and confirm through a profile that the parser and planner ran once while the virtual machine ran ten thousand times.",
    dep: ["statement-code-generator", "bytecode-program", "connection-handle"]
  },
  "parameter-binding": {
    s: "Attaches host values to numbered or named placeholders in a prepared statement so data never passes through SQL text and the statement can be reused.",
    d: "Placeholders in the SQL become slots in the program. The host binds integers, floats, text, blobs, nulls or zero-filled blobs by index, with a destructor callback or a flag telling the engine whether to copy the bytes. Binding does not touch the file. The engine keeps the bound values as cells that the virtual machine reads directly. The difficulty is ownership: a static or transient pointer must be copied, while a large blob should not be, and a wrong choice is either a leak or a dangling read.",
    k: ["Copy on bind vs borrow the host buffer: copying is safe against caller reuse, while borrowing avoids a copy for large blobs but demands the buffer outlive the step.", "Bind by index vs by name: indexes are fast and exact, names survive query edits but need a lookup per bind."],
    p: ["Binding a pointer to a stack buffer with a static-lifetime flag leaves a dangling pointer once the function returns.", "Binding text without the right length convention truncates at an embedded zero byte."],
    v: "Bind a string containing a single quote and a semicolon to a lookup placeholder and confirm the row is found literally and no second statement runs.",
    dep: ["prepared-statement", "registers-and-value-cells"]
  },
  "step-and-column-access": {
    s: "The execution loop of the API: step runs the program until it yields one row or finishes, and column accessors read values from the current row.",
    d: "Each step resumes the virtual machine where it stopped. A result-row opcode pauses it and exposes the registers as columns, which the host reads by index with type-specific getters. Returned text and blobs point into engine memory valid only until the next step or reset. A conversion getter coerces between types on demand. Write statements return done on the first step. The hard part is the pointer lifetime and the stepping contract: work happens lazily, so errors such as constraint violations or lock contention can appear on any step, not at prepare.",
    k: ["Pull one row per step vs materialize the result: stepping keeps memory flat and starts quickly, but holds locks and a cursor open while the host works.", "Return pointers into engine memory vs copy out: no allocation per value, but values die at the next step."],
    p: ["Holding a text pointer across the next step reads freed or overwritten memory.", "Treating the first step's success as proof a write succeeded misses errors raised by commit, which may come on a later step or on reset."],
    v: "Step a query over a large table while updating it from another handle and confirm each row is delivered as the cursor reaches it, with no full result set held in memory.",
    dep: ["prepared-statement", "instruction-dispatch", "registers-and-value-cells"]
  },
  "reprepare-on-schema-change": {
    s: "When the schema changes after a statement was compiled, the engine recompiles it transparently from its original text, so cached statements survive DDL.",
    d: "A compiled program records the schema cookie it saw. At the first step, a transaction-start opcode compares that value with the one in the file header. If they differ, the program stops with a special code, and the API layer recompiles from the saved SQL, rebinds the old parameter values and runs again, a bounded number of times. The interesting part is that recompilation may give a different plan, or fail if a referenced table has been dropped, so a previously working statement can start returning errors.",
    k: ["Automatic recompile vs surfacing an error to the host: callers never see schema churn, but a hidden recompile changes the timing and sometimes the plan.", "Compare cookies at transaction start vs on every access: one check per transaction is cheap, but leaves a window between prepare and step."],
    p: ["A dropped column makes a cached statement fail at step with a message the caller never saw at prepare.", "Recompile loops against a connection that keeps altering the schema can exhaust the retry limit."],
    v: "Prepare a select, add a column from another handle, step the statement and confirm it returns the new column list without the caller preparing again.",
    dep: ["schema-cookie", "prepared-statement", "statement-code-generator"]
  },
  "pragmas-and-config": {
    s: "Statements and library calls that change connection behavior or database settings: cache size, journal mode, synchronous level, foreign keys, page size and limits.",
    d: "Settings arrive as a special statement that is parsed like SQL but handled by a lookup table. Some are per connection and reset on close, such as foreign key enforcement. Some are stored in the file header, such as page size and auto-vacuum mode. Process-wide options, such as the memory allocator, can be set only before initialization. The difficulty is that settings interact with durability and compatibility: a single line can turn off syncs, and a few take effect only when the database is empty.",
    k: ["Settings through SQL vs a separate API: any SQL tool can adjust them, but they cannot be validated by the type system and are easy to misspell.", "Per-connection vs persistent settings: per-connection keeps files portable, but every new connection must repeat the setup or silently run with defaults."],
    p: ["Disabling syncs for an import and forgetting to restore them leaves a production connection that loses data on power failure.", "Setting page size or auto-vacuum on a nonempty database does nothing until a vacuum, with no error."],
    v: "Set the journal mode to the write-ahead log, reopen the file from a new connection, and confirm the mode persists, while a per-connection setting such as foreign keys resets to its default.",
    dep: ["connection-handle", "database-header", "journal-and-sync-modes"]
  },
  "hooks-and-tracing": {
    s: "Callbacks the host can install on a connection to observe or influence activity: commit, rollback, row updates, progress ticks, statement trace and profiling.",
    d: "The engine calls host functions at defined points. A commit hook can veto a commit, an update hook reports the operation, table and row number after each change, a progress hook runs every N virtual-machine instructions and can abort a runaway query, and trace hooks report statement text with bound values expanded. Hooks run on the thread inside the engine, holding its locks. That makes them powerful and dangerous: they must not call back into the same connection in forbidden ways.",
    k: ["In-process callbacks vs polling the database: no latency and exact ordering, but the callback runs inside engine critical sections and can deadlock or corrupt state.", "Progress callback granularity: a small instruction count gives responsive cancellation at some speed cost, a large one lets long single operations run uninterruptible."],
    p: ["Writing to the database from an update hook changes the data being iterated and produces undefined behavior.", "A slow trace callback silently slows every statement because it runs synchronously."],
    v: "Install an update hook, run an insert, and confirm the hook reports the table and new row number; install a progress hook that returns nonzero and confirm a long query stops with an interrupt error.",
    dep: ["connection-handle", "instruction-dispatch"]
  },
  "scalar-functions": {
    s: "Host-supplied functions registered by name and argument count that the SQL engine calls like built-ins, once per row, with typed values in and one value out.",
    d: "The host registers a function pointer with a name, an argument count and flags. During execution a function-call opcode builds argument values, invokes the callback with a context, and reads back the result the callback sets. Flags declare whether the function is deterministic, which lets the planner fold constants and use it in indexes. Auxiliary data can be cached per statement. The hard part is trust: the callback runs inside the engine with full access, and a wrong determinism flag corrupts expression indexes.",
    k: ["Deterministic flag vs unrestricted functions: deterministic functions can be constant-folded and indexed, but a wrongly flagged one makes indexes inconsistent.", "Callbacks in the host language vs built-in only: applications extend SQL freely, but crossing the boundary on every row costs time."],
    p: ["Marking a function that reads the clock or a global as deterministic corrupts any index built on it.", "An exception or long jump crossing the callback boundary leaves the engine in an inconsistent state."],
    v: "Register a function, create an expression index using it, rebuild the index through a drop and create, and confirm the integrity check passes and the index is chosen for a matching query.",
    dep: ["expression-codegen", "registers-and-value-cells", "connection-handle"]
  },
  "aggregate-and-window-functions": {
    s: "Host-defined functions that accumulate state across rows: a step callback per row and a final callback that returns the result, with optional inverse and value callbacks for windows.",
    d: "An aggregate registers step and final callbacks. The engine allocates a small per-group context for the callback state and calls step for each row of the group, then final once. Window functions add an inverse callback that removes a row leaving the frame and a value callback that reads the running result, so sliding frames cost constant work per row. The difficulty is state memory and frame logic: the engine owns the context allocation, and an incorrect inverse gives wrong results only for some frames.",
    k: ["Inverse callback vs recompute each frame: inverse makes sliding windows linear, but it must exactly undo step, including for floating point.", "Engine-owned aggregate context vs host-owned: the engine handles allocation and cleanup on error, but the state size is fixed and small."],
    p: ["A step function that allocates from its own heap and never frees on an aborted query leaks per group.", "Floating-point sums with an inverse accumulate rounding error and drift from a fresh sum."],
    v: "Run a custom sum as a window with a sliding frame and compare every output against the same sum computed without a window frame for each row; all must match exactly.",
    dep: ["scalar-functions", "select-loop-generation", "registers-and-value-cells"]
  },
  "collations": {
    s: "Named rules for ordering and comparing text, built in or registered by the host, used by comparisons, sorting, grouping and indexes.",
    d: "A collation is a comparison function over two byte strings, registered by name. A column, an index or an expression can name one, and the engine passes it to every comparison on that data. A few are built in, such as binary, case-insensitive for ASCII, and trailing-space-insensitive. Because indexes store data in collation order, the collation becomes part of the on-disk structure. The hard part is stability: changing a collation's behavior silently invalidates every index that used it.",
    k: ["Host-defined collations vs built-in only: full language-aware ordering is possible, but the file can no longer be read correctly by a program that lacks the same function.", "Binary default vs locale default: binary is fast, stable and portable, while locale ordering matches user expectations but changes with library versions."],
    p: ["Opening a file with an index on a custom collation from a program that has not registered it fails or returns wrong ordering.", "Upgrading a locale library changes sort order, and existing indexes become subtly corrupt."],
    v: "Create an index using a custom collation, open the file without registering it, and confirm the engine reports an unknown-collation error instead of returning mis-ordered rows.",
    dep: ["comparison-and-coercion", "index-btree", "connection-handle"]
  },
  "virtual-table-interface": {
    s: "A module interface that lets host code present anything as a table: the engine calls cursor methods to open, filter, step and read columns, and offers the planner's constraints.",
    d: "A module implements create, connect, a best-index method, and cursor methods. During planning the engine passes the constraints and ordering it could use, and the module reports a cost, which constraints it will consume, and an index identifier. At run time the filter method receives those values and the cursor yields rows. Modules can also support writes and transactions through optional callbacks. It is hard because the module takes over planning for its table, and its cost estimates determine whether joins are sensible.",
    k: ["Module-reported cost vs engine-estimated cost: the module knows its data, but a bad estimate makes the join order catastrophic.", "Read-only modules vs full transactional ones: read-only is simple, while write support needs the module to take part in commit, rollback and savepoints."],
    p: ["A best-index method that claims to consume a constraint but ignores it returns wrong rows with no error.", "Modules that hold external resources across commits leak them when a transaction rolls back."],
    v: "Query a module-backed table with an equality constraint and confirm through the EXPLAIN output and a call counter that the filter method received the constraint instead of the engine scanning all rows.",
    dep: ["index-selection", "cursor-table", "extension-loading"]
  },
  "extension-loading": {
    s: "A mechanism to load compiled modules at run time from shared libraries, which then register functions, collations or virtual tables on a connection.",
    d: "A load call opens a shared library through the VFS, finds a well-known entry point and calls it with the connection and a table of engine entry points. The extension registers whatever it provides. Loading is disabled by default and can be enabled by API only, not by SQL, so injected statements cannot trigger it. Extensions can also be compiled statically and registered automatically at every open. The problem is that loaded code runs with the host's full privileges.",
    k: ["Loadable libraries vs compile-in only: new features without rebuilding, but a file path becomes an attack surface that needs strict opt-in.", "Entry-point table vs direct linking: one extension binary works with several library versions, at the price of an indirection on every call."],
    p: ["Enabling loading for convenience lets an injected statement run arbitrary native code.", "An extension built against a different library version calls entry points that do not exist and crashes."],
    v: "With loading disabled, attempt a load through SQL and confirm refusal; enable it through the API, load a test extension and confirm its function is callable.",
    dep: ["vfs-interface", "scalar-functions", "virtual-table-interface"]
  },
  "authorizer-callback": {
    s: "A host callback consulted while compiling a statement, asked to allow, deny or ignore each action such as reading a column, writing a table or attaching a file.",
    d: "During name resolution and code generation, the compiler calls the authorizer for each operation with an action code and the object names involved. The callback returns allow, deny (the prepare fails) or ignore (the column reads as null, or the write is skipped). This lets an application accept SQL from semi-trusted sources and restrict it. It runs at prepare time only, not at step, so authorization is a property of the compiled program. The difficulty is completeness: views and triggers cause additional checks.",
    k: ["Compile-time authorization vs run-time checks: no per-row cost and it covers every code path, but cached statements keep the permissions they were compiled with.", "Deny vs ignore: deny fails loudly, ignore lets existing queries keep running with hidden data, which is easy to misread as missing data."],
    p: ["Caching statements across users reuses a program compiled under a more privileged authorizer.", "Forgetting the attach and pragma action codes lets restricted SQL reach other files or change settings."],
    v: "Install an authorizer that denies reads of one column, prepare a query touching it and confirm the prepare fails, while a query over other columns still runs.",
    dep: ["name-resolution", "connection-handle"]
  },
  "full-text-search": {
    s: "An optional virtual-table module that tokenizes text, maintains an inverted index in ordinary tables inside the same file, and answers match queries with ranking.",
    d: "A full-text table stores documents and an inverted index of terms to document lists, kept in shadow tables as segments that are merged in the background of writes. A tokenizer splits and normalizes text. Match queries support phrases, prefixes and boolean operators, and auxiliary functions provide snippets and rank. Because the index lives in the same file, it participates in the same transactions and backups. The hard part is index maintenance: many small segments slow queries, so merging has to be paced against write cost.",
    k: ["Index in shadow tables vs separate files: one file and one transaction keep everything consistent, while index writes enlarge every commit.", "Content stored inside the index vs external content: self-contained tables are simple, while external content saves space but must be kept in sync by triggers."],
    p: ["External content tables drift out of sync when a write path forgets to update the index.", "Never merging segments after bulk loads leaves queries scanning hundreds of tiny segments."],
    v: "Insert documents, run a phrase match, then delete one document from the content and confirm the match no longer returns it and the integrity check of the index passes.",
    dep: ["virtual-table-interface", "table-btree", "scalar-functions"]
  },
  "json-functions": {
    s: "An optional set of functions and table-valued functions for extracting, building and modifying JSON text stored in ordinary columns, with path expressions.",
    d: "JSON is stored as text, or in a compact binary form, in normal columns. Functions parse it on demand, extract values by path, build objects and arrays, and edit documents. Table-valued functions expand a document into rows so it can be joined. Because the data is a typed value inside a dynamically typed engine, it fits naturally, but the engine does not know the shape of the document. The difficulty is parse cost: repeated extraction from the same large document reparses it unless caching or an expression index is used.",
    k: ["Text storage vs binary storage: text is human-readable and portable across tools, while binary parses faster but is opaque to other readers.", "Expression indexes on extracted paths vs scanning: indexes make lookups fast, but only for the exact expression written in the query."],
    p: ["Extracting several paths from one large column per row reparses the document each time and makes scans slow.", "Malformed JSON stored through a plain text column surfaces as errors only when a function reads it."],
    v: "Create an expression index on a JSON path, run an equality query on that path and confirm the plan uses the index and returns the same rows as a full scan with the function.",
    dep: ["scalar-functions", "dynamic-typing", "virtual-table-interface"]
  },
  "spatial-index": {
    s: "An optional virtual-table module providing a multi-dimensional range index, typically an R-tree over bounding boxes, stored in shadow tables of the same file.",
    d: "Each row holds an id and minimum and maximum coordinates in each dimension. The module stores a tree of bounding boxes in shadow tables and answers range queries through the virtual table interface, with the planner passing box constraints. Insertions choose a leaf by least enlargement and split nodes when full. Because it is built from ordinary tables, it is transactional and backed up with the file. The difficulty is selectivity: overlapping boxes degrade search, and coordinates may be stored at reduced precision.",
    k: ["Tree index on boxes vs a pair of ordinary indexes: one tree answers overlap queries directly, where two separate range indexes cannot combine well.", "Reduced-precision coordinates vs full-width: a smaller index and cache footprint, but boxes are rounded outward and results need a final exact check."],
    p: ["Treating a box match as an exact geometry match returns false positives because the index only stores bounding boxes.", "Heavy random deletes and inserts leave overlapping nodes and slow queries until a rebuild."],
    v: "Insert thousands of boxes, run an overlap query, and compare the result set with a brute-force check over the same table; they must be identical.",
    dep: ["virtual-table-interface", "table-btree"]
  },
  "encryption-layer": {
    s: "An optional layer, usually a replacement VFS or a pager hook, that encrypts every page on its way to the file and decrypts it on read, keyed by a passphrase.",
    d: "The layer sits below the pager and above the file. Each page is encrypted with a per-database key derived from the passphrase, and the authentication or nonce data is stored in the reserved bytes at the end of each page. The header or salt is stored so the file can be opened again. It operates on whole pages because the pager only reads and writes pages. The difficulty is everything around the file: journals, logs and temporary files must be protected too, and the memory holds the key and plaintext pages.",
    k: ["Page-level encryption vs column-level: no schema changes and everything including indexes is covered, while the key must be present for any access at all.", "Authentication tag per page vs none: tampering and corruption are detected, but it costs reserved bytes and a failed check makes pages unreadable."],
    p: ["An unencrypted rollback journal or write-ahead log next to an encrypted database leaks recent page contents.", "Losing or changing the passphrase makes the entire file unrecoverable with no partial salvage."],
    v: "Write rows in an encrypted file, search the raw file bytes for a known plaintext string and confirm it is absent, then reopen with a wrong key and confirm a clean failure.",
    dep: ["vfs-shims", "page-size-and-reserved", "file-io-methods"]
  },
  "online-backup-api": {
    s: "An API that copies a live database to another file or connection page by page, restarting if the source changes, so a consistent copy can be taken while it is in use.",
    d: "The caller creates a backup object linking a source and destination connection, then calls step with a page count. Each step reads source pages under a short read lock and writes them to the destination. If another connection modifies the source between steps, the copy restarts for the pages changed; if the same connection writes, the backup is updated in place. Finishing commits the destination. It is hard because progress and consistency pull apart: a busy writer can starve a backup of ever finishing.",
    k: ["Many small steps vs one large step: small steps let writers in between, but a busy source forces repeated restarts; one step locks out writers for the duration.", "Page copy vs logical dump: page copy is fast and bit-exact, while a logical dump can change page size or version but takes a full read and rewrite."],
    p: ["A source with continuous writes from another process restarts the backup forever and it never completes.", "Copying the database file with a file copy tool during a transaction yields a torn file."],
    v: "Run a backup in small steps while another process inserts rows, then open the destination and run the integrity check; it must be consistent and equal to some committed state of the source.",
    dep: ["pager-state-machine", "lock-levels", "connection-handle"]
  },
  "in-memory-databases": {
    s: "A database that lives only in memory, created by a special name, using the same engine and pager with a memory-backed file layer and no durability.",
    d: "Opening the special name creates a private database whose pages live in the heap through an in-memory file implementation. Journaling is skipped or kept in memory because nothing needs to survive a crash. A named in-memory database can be shared among connections in the same process through the shared cache. Temporary tables use the same mechanism with spill to a temporary file. It is hard to keep behavior identical: locks and concurrency still apply, and memory limits are the only bound on size.",
    k: ["Memory-backed pages vs a RAM disk file: no file system involved and fastest, but the data cannot be inspected with external tools or survive process exit.", "Private per-connection vs shared named database: private is simple and isolated, while shared lets a pool see the same data but brings table-level locking."],
    p: ["Every new connection to the plain memory name gets a fresh empty database, which surprises connection pools.", "Large memory databases are limited only by process memory and are lost entirely on a crash."],
    v: "Open the plain memory name on two connections and confirm they cannot see each other's tables; open a named shared one on both and confirm they do.",
    dep: ["open-flags-and-uris", "page-cache", "memory-allocator"]
  },
  "single-file-database": {
    s: "The whole database, tables, indexes and schema, lives in one ordinary file, with a journal beside it only during writes.",
    d: "One file is easy to copy, email, version, back up and ship with an application, and needs no installation or configuration. All structure is found through the header and page one, so the file is self-describing. The cost shows in every layer: space management and growth are done inside the file, concurrency relies on locking that file, and atomic commit needs a second file or a log because one file cannot be updated atomically in place. The file is also a public interface that must remain readable for decades.",
    k: ["One file vs a directory of files: simple deployment and copying, but all objects share one lock domain and one growth pattern.", "Auxiliary journal files beside the database vs inside it: keeping the journal separate makes recovery simple, but the pair must travel together or the copy is unsafe."],
    p: ["Copying the main file while a journal or log exists, without the companion file, produces a corrupt or stale copy.", "Putting the file on a network file system breaks the locking the design relies on."],
    v: "Copy the database file while idle to another machine, open it with a different build of the library, and confirm queries and the integrity check succeed without any other files.",
    dep: ["database-header", "page-layout", "rollback-journal"]
  },
  "in-process-no-server": {
    s: "The engine runs as library code inside the application's process, so a query is a function call, with no network, authentication, scheduler or separate administration.",
    d: "There is no protocol, no listener and no daemon: statements compile and execute on the caller's thread using the caller's memory. Latency is a function call plus file I/O, and a deployed database is just a file. The price is that every guarantee must be provided without a process in the middle: isolation comes from file locks, crashes of the host process are crashes of the database engine, there is no user and permission model beyond file access, and no background threads to tidy up unless the host provides time.",
    k: ["Library vs server process: no round trip and no setup, but no central arbiter, no access control and no shared cache across processes.", "Work on the caller's thread vs background workers: the host controls threading and resources, but cleanup such as checkpoints happens in the caller's commit."],
    p: ["A bug or memory corruption in the host application can corrupt in-memory state of the engine, and thereby the file.", "Assuming the library enforces user permissions: anyone who can read the file can read everything."],
    v: "Run a query with the debugger attached and confirm the whole call, from API to file read, executes on the calling thread with no socket or other process involved.",
    dep: ["connection-handle", "vfs-interface", "memory-allocator"]
  },
  "single-writer-concurrency": {
    s: "At most one connection writes at a time while others read, a deliberate trade of write parallelism for a simple lock model and strong isolation.",
    d: "With whole-database writer exclusion, there is no row lock manager, no deadlock detector and no versioned storage in the rollback journal mode. Readers see a consistent snapshot, and writers wait or fail with busy. The write-ahead log mode lets readers continue during a write. The model works well for typical embedded workloads that are read-heavy and have short writes, and it fails for many concurrent writers. It shapes the API, where busy handling and transaction scope matter, and application design, which must keep write transactions short.",
    k: ["Database-level write lock vs row-level locking: simple, deadlock-free and cheap, but write throughput cannot scale beyond one transaction at a time.", "Rollback journal readers-block-writer vs write-ahead log readers-and-writer: the log removes most stalls but adds checkpoints and a shared-memory index."],
    p: ["A long-running write transaction, or a forgotten open read statement, stalls every other writer and produces busy errors.", "Starting a read transaction and upgrading to write later can fail with busy even with a busy handler, because of a deadlock the engine avoids."],
    v: "Open two connections, begin a write on one, and confirm the other writer waits or gets busy while a reader on a third connection continues in write-ahead log mode.",
    dep: ["one-writer-model", "lock-levels", "write-ahead-log"]
  },
  "durability-contract": {
    s: "A committed transaction survives power loss if the storage honors sync calls; the engine's ordering of writes and syncs is the entire guarantee.",
    d: "Durability is not a feature of one component. The journal or log, the order of page writes, the number of syncs, the header update and the file deletion all contribute, and each assumes properties of the device such as sector atomicity and write ordering after a sync. The contract is tunable: safe settings sync at every commit, and faster settings trade a window of loss or corruption for speed. Because a database is trusted after failures, the engine is tested against simulated power loss rather than only reasoned about.",
    k: ["Sync at every commit vs relaxed syncing: full syncing never loses acknowledged commits, while relaxed syncing is several times faster and risks loss, or corruption, on power failure.", "Trust the drive's sync vs add checksums: simple and fast, but disks that lie about flushes break the contract unless checksums catch the damage."],
    p: ["Devices that acknowledge a flush before data reaches the medium defeat all ordering, and corruption appears only after a power cut.", "Setting syncs off for speed in production and forgetting that the setting persists in the application's configuration."],
    v: "Run the crash simulation that cuts power at every write boundary during a commit, then reopen each resulting file and confirm it contains either all or none of the transaction and passes the integrity check.",
    dep: ["commit-sync-ordering", "storage-assumptions", "crash-simulation"]
  },
  "backward-compatibility": {
    s: "The file format and the API are treated as long-term contracts: files written years ago open today, and files written today can often be read by old versions.",
    d: "The format is documented, versioned in the header, and changed only with read and write version bytes that tell older libraries to refuse or to open read-only. Features are added in ways that old readers ignore where possible. The API keeps old entry points working. This constraint outweighs many optimizations: a better page layout is rejected if it breaks existing files, and decisions such as the type system, the quirks of null handling and the meaning of a rowid are preserved even where they are considered mistakes.",
    k: ["Frozen format with additive changes vs periodic format breaks: files and tools stay interoperable for decades, but design mistakes persist indefinitely.", "Compatibility quirk flags vs fixing behavior: old applications keep working, while new applications must opt in to the corrected behavior."],
    p: ["Using a newer feature, such as a different journal mode or generated columns, makes the file unreadable by an older library that the user still ships.", "Assuming undocumented behavior stays fixed, then breaking when an edge case is tightened."],
    v: "Open a file created by the oldest supported version with the current library and confirm all queries and the integrity check pass; then confirm an older library either opens or refuses a new-feature file explicitly.",
    dep: ["format-versioning", "database-header"]
  },
  "footprint-and-portability": {
    s: "The library stays small, uses little memory and runs on anything with a file system, achieved by few dependencies, compile-time feature switches and a replaceable OS layer.",
    d: "The core is a handful of source files with no external dependencies other than a minimal standard runtime library. Compile-time options remove optional features, shrink caches and select threading mode. Memory use is bounded by configuration, with no hidden pools. The portability layer isolates files, locks, clocks and shared memory. The design avoids threads, background processes and large static tables, so it fits mobile, embedded and constrained devices. The difficulty is keeping optional features optional while the core remains a single coherent piece.",
    k: ["Compile-time feature removal vs run-time switches: smaller binaries and fewer attack surfaces, but every application builds its own variant that needs testing.", "Single self-contained source vs modular libraries: trivial to embed and cross-compile, but the unit is large and recompiles fully for any change."],
    p: ["A build with a different set of compile options than the one tested exposes untested combinations.", "Assuming the default cache and memory settings suit a small device, then exhausting memory on first load."],
    v: "Build with the minimal option set, run the test suite for that configuration, and confirm the binary size and peak resident memory on a basic workload against the documented budget.",
    dep: ["vfs-interface", "memory-allocator", "memory-limits"]
  }
});
