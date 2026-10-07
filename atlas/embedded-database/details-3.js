// Details for the embedded database plate, part 3: schema and typing, B-trees, file format, pager.
ATLAS.details("embedded-database", {
  "dynamic-typing": {
    s: "Types belong to values, not columns: each stored value is null, integer, real, text or blob, and any column can in principle hold any of them.",
    d: "A value's storage class is chosen when it is stored, and is recorded in the record header as a serial type that also encodes its size. Integers use the smallest of several widths. A column's declared type does not reject other classes; it only sets an affinity that nudges conversion. This makes the engine forgiving with sloppy input and simplifies schema changes, but means the engine cannot assume uniform data in a column. The difficulty is that comparisons and sorting across classes need a defined order, and applications may rely on accidental type enforcement.",
    k: ["Typed values vs typed columns: flexible storage and easy imports, but bad data is accepted unless constraints or strict tables reject it.", "Variable-width integers in the record vs fixed width: small values use one byte, but every read decodes the header to find the width."],
    p: ["A text value stored in an integer column sorts after all numbers, which breaks range queries without any error.", "Applications that rely on the declared type to reject bad input discover that the engine accepted it."],
    v: "Insert an integer, a real, a text and a blob into one column, read them back with their type function, and confirm each class is preserved and the sort order is null, numbers, text, blob.",
    dep: ["record-format", "registers-and-value-cells"]
  },
  "type-affinity": {
    s: "A column's declared type maps to a preferred storage class, and stored values are converted toward it when the conversion is lossless, but never rejected.",
    d: "The declared type name is mapped by substring rules to one of five affinities: text, numeric, integer, real or blob. On storing, text that looks like a number is converted to a number in a numeric-affinity column, numbers are converted to text in a text column, and so on, but only when the round trip is exact. Comparisons apply affinity of a column to the other operand too. Hard because the rules are subtle and apply in both stores and comparisons, so the same expression can behave differently with and without a column reference.",
    k: ["Affinity as a preference vs enforced types: data from loose sources loads without errors, but type surprises appear later at query time.", "Declared-type substring matching vs a fixed type list: any familiar type name works, but an unusual name can land in an unexpected affinity."],
    p: ["Leading zeros in an identifier stored in a numeric column are lost because the text converts to an integer.", "Comparing a text column to a numeric literal converts the literal, but an expression on the column loses the affinity and compares differently."],
    v: "Store the text '007' into an integer-affinity column and a text-affinity column and confirm the first returns 7 and the second returns the original text.",
    dep: ["dynamic-typing", "comparison-and-coercion"]
  },
  "comparison-and-coercion": {
    s: "The rules for ordering and equating values of different storage classes, applying affinity conversions to operands, and honoring collation for text.",
    d: "Values of different classes order as null, then numbers, then text, then blobs. Numbers compare numerically, with integer and real compared exactly. Text compares using the collation chosen from the left operand's column, then the right's, then the default. Before comparing, affinity conversions apply to operands depending on whether each is a column. Null in a comparison produces null, not false. It is hard because the same logic must be implemented identically in the interpreter, in index key comparison and in the planner's use of constants.",
    k: ["Fixed cross-class order vs raising type errors: mixed data sorts deterministically, but a comparison across types is silently meaningful.", "Collation taken from the left operand first vs explicit only: most queries need no annotation, but results depend on operand order."],
    p: ["Comparing a column to a value of a different class uses conversions that hide the index and may reorder results.", "Index keys and run-time comparisons using different rules would return rows missing from the index."],
    v: "Sort a column containing null, integers, reals, text and blobs and confirm the order follows the documented class ranking, with integers and reals interleaved by numeric value.",
    dep: ["type-affinity", "collations"]
  },
  "schema-table": {
    s: "A special table on page one that holds the text of every table, index, view and trigger definition, with the root page number of each tree.",
    d: "Each row records an object's type, name, owning table, root page and original SQL. The catalog is just a table in the same file and is read with the same machinery as any other, so no separate metadata store exists. Creating an object runs ordinary inserts and updates on this table. Reading the schema means reading these rows and parsing the SQL text. This is simple and self-describing, but it makes DDL a normal write, and the original text, including comments, is preserved forever.",
    k: ["Catalog as SQL text vs structured records: no separate format to version, and old files stay readable, but loading requires parsing every definition.", "Root pages stored in the catalog vs a fixed layout: objects live anywhere in the file, but a corrupt catalog row orphans a whole tree."],
    p: ["Editing the catalog directly with writable schema enabled can leave the file unopenable by corrupting a definition.", "A schema with thousands of objects makes every new connection spend time parsing before its first query."],
    v: "Create a table and an index, read the catalog rows and confirm each has the original SQL text and a root page number that the integrity check finds as a valid tree.",
    dep: ["table-btree", "database-header"]
  },
  "schema-load": {
    s: "Reads the catalog and parses each definition into in-memory table, index and trigger structures when a connection first needs them or after the schema changes.",
    d: "On the first statement of a connection, or when the schema cookie shows a change, the loader scans the catalog table and runs the parser on each definition in a mode that builds structures but does not modify the file. Statistics rows are read afterward. The structures are cached on the connection and shared among statements. A cookie mismatch discards and reloads everything. It is hard because load happens inside a read transaction and must tolerate a malformed catalog, and because for large schemas it is a measurable startup cost.",
    k: ["Load the entire schema vs load objects on demand: simple name lookup and no partial states, but startup time grows with the number of objects.", "Reload everything on any change vs incremental update: simple correctness, but one DDL statement makes every other connection reload."],
    p: ["Frequent DDL from one connection makes all others reload the schema on their next statement, which looks like random latency spikes.", "A malformed catalog row can make the entire database fail to open."],
    v: "Open a database with ten thousand tables, time the first statement against the second, and confirm that the first pays the parse cost and the second does not.",
    dep: ["schema-table", "parser-grammar", "table-statistics"]
  },
  "schema-cookie": {
    s: "A counter in the file header that increments on every schema change, letting connections and prepared statements detect when their cached view of the schema is stale.",
    d: "Each DDL transaction increments the cookie as part of its write. Every connection stores the value it loaded. At transaction start, the program compares the header's cookie with its own; a mismatch triggers a reload or a statement recompile. Because the cookie is read from page one under a read lock, the check is cheap and race-free with respect to writers. It is hard because it is the only change signal between processes, so every path that alters the schema must bump it, including incremental changes.",
    k: ["A single global counter vs per-object versions: one comparison per transaction is cheap, but every change invalidates every statement.", "Check at transaction start vs at each table access: a single cheap check, but the schema cannot change mid-transaction because the lock prevents it."],
    p: ["A tool that edits the catalog without bumping the cookie leaves other processes using an outdated schema.", "Heavy DDL traffic produces constant statement recompilation across processes."],
    v: "From one process alter a table, then from another process run a cached statement and confirm it recompiles and sees the new column.",
    dep: ["database-header", "schema-load"]
  },
  "rowid-tables": {
    s: "The default table form: rows are keyed by a hidden 64-bit integer, which a column declared as an integer primary key aliases, and the tree stores the whole row in its leaves.",
    d: "Every row has a signed 64-bit key. A column declared integer primary key becomes that key, so lookups by it are a single tree search. New rows get the largest key plus one, unless a separate monotonic mode is requested that never reuses numbers. Other indexes store the rowid as the pointer back to the row. It is hard because rowids can be reassigned after a compaction if the table has no alias column, and because other tables storing them as foreign references would break.",
    k: ["Hidden rowid key vs clustering on the declared primary key: fast insertion order and simple secondary indexes, but a non-integer primary key needs a second index.", "Reuse of freed rowids vs strictly increasing: compact and simple, while strict mode needs a counter table and costs a write."],
    p: ["Relying on an implicit rowid as a stable identifier breaks when a vacuum renumbers rows of a table with no integer key alias.", "Inserting the maximum value makes the next automatic key choose randomly and may fail on a full space."],
    v: "Delete the highest row, insert a new row without a key and confirm the key is reused; repeat in the monotonic mode and confirm it is not reused.",
    dep: ["table-btree", "index-btree"]
  },
  "clustered-key-tables": {
    s: "An alternative table form with no hidden rowid, stored as an index tree keyed on the declared primary key, so the primary key lookup needs only one tree.",
    d: "These tables store the full row inside an index B-tree whose key is the primary key columns followed by the other columns. Lookups by primary key search one tree, and secondary indexes store the primary key instead of a rowid as the row pointer. This saves space and a tree for tables with a natural composite key. The tree must handle long keys, so rows with large values use overflow differently. Hard parts include the wider secondary index entries and the lack of a cheap numeric identifier.",
    k: ["Cluster on the primary key vs rowid with a separate unique index: one tree and half the writes for key-value shaped tables, but secondary indexes grow with the key size.", "Index-format tree for the whole row vs table-format leaves: key comparison covers all columns, but large rows suffer because interior pages hold whole keys."],
    p: ["A wide primary key is repeated in every secondary index entry and bloats them.", "Wide rows in an index tree reduce the fan-out of interior pages and deepen the tree."],
    v: "Create the same table in both forms with a three-column key, insert a million rows, and compare file size and lookup page reads; the clustered form must use fewer reads for key lookups.",
    dep: ["index-btree", "record-format"]
  },
  "foreign-key-enforcement": {
    s: "Optional checking that references between tables stay valid, with cascading actions and deferral, switched on per connection rather than stored with the file.",
    d: "Declared foreign keys are parsed and stored in the schema, but enforcement is a per-connection setting that is off by default for compatibility. When on, inserts and updates in the child verify a matching parent key; deletes and updates in the parent run the declared action: restrict, cascade, set null or set default. Deferred keys count violations and check at commit. Enforcement is compiled into the statement as extra lookups, so it needs an index on the parent key to be fast. Hard because parent changes can cascade through trigger-like chains.",
    k: ["Enforcement off by default vs on: old applications and files keep working, but new applications must remember to switch it on every connection.", "Child-side index required for speed vs automatic: the schema author controls cost, but a missing index turns each parent delete into a full scan."],
    p: ["A connection that does not enable the setting writes rows that violate the declared keys, with no error.", "A parent delete without an index on the child column scans the child table for each deleted row."],
    v: "With enforcement on, delete a parent row that has children under each declared action and confirm restrict fails, cascade removes children, and set null updates them.",
    dep: ["constraint-checks", "index-selection", "pragmas-and-config"]
  },
  "table-btree": {
    s: "The tree for a rowid table: interior pages hold only keys and child pointers, and leaf pages hold full rows, so range scans by rowid read leaves in order.",
    d: "A table tree is a B+ tree keyed on the 64-bit rowid. Interior cells hold a child page number and a key bound; leaf cells hold the key and the record, with overflow when the record is large. Because interior pages have no data, they pack many children and the tree stays shallow: a few levels reach millions of rows. Leaves are not chained by sibling pointers, so scans move through the parent. The hard part is maintaining structure through inserts and deletes without leaving poorly filled pages.",
    k: ["Data only in leaves vs data in all nodes: high fan-out and shallow trees, but every lookup must reach a leaf.", "No sibling pointers vs linked leaves: simpler updates and balancing, but a scan must use the parent to find the next leaf."],
    p: ["Random inserts of rowids cause page splits throughout the tree and a half-empty file.", "Deleting most rows leaves sparse pages until a vacuum rebuilds the file."],
    v: "Insert a million sequential rows, read the page count and tree depth through the stats pragma or the page dump, and confirm depth is small and range scans return rows in key order.",
    dep: ["page-layout", "cell-format", "balancing", "overflow-pages"]
  },
  "index-btree": {
    s: "The tree for an index: every page holds keys made of the indexed column values plus the rowid or primary key, sorted by the index's collations and orders.",
    d: "An index tree is a B-tree whose entries are records containing the indexed values followed by the row locator. Both interior and leaf cells hold full keys, so search can end at an interior node. Entries are compared with the per-column collation and sort direction. Uniqueness is enforced by seeking before insertion. Partial indexes store only rows matching a condition, and expression indexes store computed values. The difficulty is key size, since long keys reduce fan-out, and keeping index and table consistent on every write.",
    k: ["Full keys in interior pages vs prefix compression: simple comparison and search, but long keys reduce fan-out.", "Locator appended to the key vs separate pointer: entries are unique and sorted by locator within a key, but every entry grows by the locator size."],
    p: ["An index on a long text column makes each entry large and the tree deep and slow.", "A function used in an expression index that changes behavior leaves entries that no longer match the table."],
    v: "Insert rows, then run the integrity check which compares every table row to its index entries, and confirm the counts and values match with no missing or extra entries.",
    dep: ["page-layout", "record-format", "collations", "balancing"]
  },
  "record-format": {
    s: "The byte layout of a row or index entry: a header of variable-length integers giving each column's type and size, followed by the packed column values.",
    d: "A record begins with the header length, then one serial-type varint per column, then the values with no padding. The serial type tells both the storage class and the byte length: small integers use zero to eight bytes, text and blobs use their length encoded in the type. Reading column N means walking the header to compute its offset, which is why cursors cache the header parse. Adding a column later does not rewrite rows, because missing trailing values read as the default. Hard because every reader must validate lengths against the record bounds.",
    k: ["Self-describing records vs fixed-schema rows: dynamic typing and cheap column addition, but each read parses the header.", "Smallest-integer encoding vs fixed width: compact storage for typical values, but variable offsets prevent random column access."],
    p: ["A corrupt header claiming a huge length makes a naive reader walk past the page unless lengths are checked.", "Adding a column with a non-null default needs a stored default, since old rows were not rewritten."],
    v: "Insert a row with integers of varying magnitude, dump the raw record bytes and confirm the serial types and widths match the encoding rules, and that a row written before ADD COLUMN returns the default.",
    dep: ["cell-format", "dynamic-typing"]
  },
  "cell-format": {
    s: "The layout of one entry within a page: a payload size and key as variable-length integers, then the payload, with an overflow page pointer if the payload does not fit.",
    d: "Cells differ by page type. A table leaf cell holds payload size, rowid and the record. A table interior cell holds a child pointer and a rowid. An index cell holds payload size and the key record. Varints encode up to 64 bits in one to nine bytes with the high bit as a continuation flag, so small numbers cost one byte. If a payload exceeds a threshold derived from page size, the first part stays inline and the rest goes to overflow. The hard part is exact arithmetic for thresholds, which defines the file format.",
    k: ["Variable-length integers vs fixed-width fields: compact cells and more per page, but parsing cannot jump to fixed offsets.", "Inline threshold tuned to keep several cells per page vs inline everything: ensures a minimum fan-out, but large rows always touch overflow pages."],
    p: ["An off-by-one in the inline threshold calculation makes an engine write files other versions cannot read.", "Varint decoding that trusts a continuation bit past nine bytes overruns on corrupt data."],
    v: "Write payloads exactly at, one below and one above the inline threshold, and confirm via a page dump that only the last case produces an overflow pointer and all read back identically.",
    dep: ["page-layout", "overflow-pages"]
  },
  "page-layout": {
    s: "How a tree page is organized: a small header, an array of two-byte cell pointers growing downward, free space in the middle, and cells packed from the page end upward.",
    d: "The header holds the page type, offset of the first free block, cell count, start of the cell area and, for interior pages, the rightmost child pointer. Cell pointers are kept in sorted key order, so binary search runs over them while cells are stored in insertion order at the end. Inserting a cell adds a pointer and places the cell in free space; deleting removes the pointer and leaves a hole. Page one also holds the file header at its start. Hard parts are keeping all offsets valid and detecting corrupt pointers.",
    k: ["Pointer array plus cell heap vs sorted cells in place: inserts move only two-byte pointers, but free space gets fragmented inside the page.", "Two-byte offsets vs larger: compact, but limits page size to 64 KiB, with special encoding for the largest size."],
    p: ["A cell pointer that points outside the page on a corrupt file must be rejected, or a reader walks into other memory.", "Many deletes fragment the cell area until the page must be defragmented to fit one more cell."],
    v: "Fill a page with cells, delete alternate ones and insert another large cell, and confirm that the page defragments and the integrity check finds consistent offsets.",
    dep: ["cell-format", "in-page-free-space"]
  },
  "overflow-pages": {
    s: "Chains of pages that hold the part of a large value that does not fit in a tree cell, linked by a next-page pointer and read in sequence.",
    d: "When a record exceeds the inline limit, the cell keeps a prefix and a pointer to the first overflow page. Each overflow page holds a next-page number and the page's worth of payload. Reading the tail requires following the chain, so reading the middle of a huge blob costs a page read per link, though a per-cursor cache of the chain can skip ahead. Deleting a row frees the whole chain. With auto-vacuum the pointer map tracks the chain. Hard because chains must be freed and relocated consistently.",
    k: ["Linked chain vs a tree of pages for large values: trivial to implement and free, but random access is linear in value size.", "Overflow only for large values vs spilling every record beyond a size: small rows stay in one page read, but big rows scatter across pages."],
    p: ["Reading the last bytes of a hundred-megabyte blob walks the entire chain unless an incremental blob handle caches offsets.", "Updating a large row rewrites its whole chain, causing heavy writes."],
    v: "Store a one-megabyte blob, read the last byte through the incremental blob API and count page reads; then delete the row and confirm all its overflow pages appear on the free list.",
    dep: ["cell-format", "freelist", "pointer-map-and-autovacuum"]
  },
  "btree-cursor": {
    s: "A position within one tree that supports seek, next, previous, insert and delete, holding a stack of pages from root to the current cell.",
    d: "A cursor records the path of pages it descended, the cell index on each, and flags for validity. Seek compares a key through interior pages to a leaf. Next and previous move within the leaf or ascend to a parent to move across. Writes through a cursor modify its leaf and may trigger balancing. Other cursors on the same tree are told the tree changed, and must save their key and restore by seeking again before use. It is hard because cursors reference page memory that can be moved by a split.",
    k: ["Save and re-seek other cursors after a write vs keep them live across restructuring: keeps tree code simpler and safe, but a restored cursor pays a seek.", "Keep the whole path vs only the leaf: fast neighbor movement, but more state to fix after balancing."],
    p: ["A cursor used after another cursor's insert without being restored reads a cell from the wrong place.", "Cursor held open across commit in a mode that allows it can reference pages that were rolled back."],
    v: "Open a cursor, insert enough rows through another cursor to force a split, then advance the first cursor and confirm it continues from the correct key with no skipped or repeated rows.",
    dep: ["table-btree", "index-btree", "page-references-and-dirty-list"]
  },
  "balancing": {
    s: "The redistribution of cells among a page and its siblings when a page overflows or underflows, keeping the tree height uniform and pages reasonably full.",
    d: "When an insert does not fit, the tree gathers the page and up to two siblings, computes a new division of the cells across up to three pages plus a possible new page, rewrites them, and updates the parent divider cells, possibly propagating up. Deletion that leaves a page nearly empty triggers the same procedure to merge. When the root fills it is split and a new root created above, so the root page number never changes. Hard because the work touches several pages, and must be atomic under journaling.",
    k: ["Redistribute among siblings vs split a single page: fewer pages and fuller pages, but each balance touches and journals several pages.", "Fixed root page vs new root on growth: schema entries keep stable root numbers, but the root splits by copying its content to a child."],
    p: ["An append-only workload with plain splitting leaves pages half full unless the rightmost leaf is split specially.", "A balance step that fails midway with an I/O error must leave the tree intact through the journal."],
    v: "Insert keys in random order until the tree is three levels deep, then delete most of them, and run the integrity check to confirm sorted order, parent dividers and fill invariants hold at every step.",
    dep: ["page-layout", "page-references-and-dirty-list", "freelist"]
  },
  "in-page-free-space": {
    s: "Tracking and reclaiming unused bytes inside a page: a chain of free blocks, a count of fragmented bytes and defragmentation when a cell needs more room.",
    d: "Deleting a cell turns its bytes into a free block linked into a list kept in address order, with adjacent blocks merged. Gaps of one to three bytes are too small to hold a block header and are counted as fragments. Inserting first tries the gap between pointers and cell area, then free blocks, and if the total free space suffices but is scattered, the page is defragmented by copying cells together. It is hard because accounting must be exact: the header's free-byte total is validated by the integrity check.",
    k: ["Free-block chain plus occasional defragmentation vs compaction on every delete: deletes are cheap and rewrite little, but inserts sometimes pay for a full rearrangement.", "Count tiny fragments instead of tracking them: keeps the header small, but those bytes are recovered only by defragmentation."],
    p: ["A mismatch between the fragment count and the real gaps leads the integrity check to report corruption on an otherwise working file.", "Workloads with many size-changing updates fragment pages and trigger frequent defragmentation."],
    v: "Delete every other cell from a full page, check that the free space and fragment totals in the header equal the actual gaps found by a page walk, then insert a large cell and confirm it fits after defragmentation.",
    dep: ["page-layout", "cell-format"]
  },
  "database-header": {
    s: "The first 100 bytes of the file: magic string, page size, format versions, page counts, free-list head, schema cookie, text encoding and a few application-visible numbers.",
    d: "The header lives at the start of page one and describes how to read the rest. It holds the page size, the read and write format versions, the number of pages, the first free-list trunk page and its count, the schema cookie, the file change counter, the default encoding, the auto-vacuum root, a user version and an application id. Readers validate it before trusting anything else. Because every connection reads it at transaction start, it is also the coordination point between processes. Hard because every field is a compatibility contract.",
    k: ["A small fixed header on page one vs a separate metadata file: the file stays self-contained, but page one is touched by almost every write.", "Application-defined fields in the header vs a user table: a cheap version number readable without parsing SQL, but only a few integers are available."],
    p: ["Opening a file whose header page-count is stale after a crash needs a rule to recompute it, or reads fail beyond the old end.", "A tool that writes the header in place without the journal can leave a file with mismatched counters."],
    v: "Dump the first 100 bytes of a new database and confirm the magic string, page size, encoding and version bytes; commit a change and confirm the change counter increments.",
    dep: ["page-size-and-reserved", "freelist", "format-versioning"]
  },
  "page-size-and-reserved": {
    s: "The fixed size of every page, a power of two between 512 bytes and 64 KiB, and an optional number of reserved bytes at the end of each page for extensions.",
    d: "Page size is chosen at creation, stored in the header and fixed until a vacuum rebuilds the file. Larger pages give higher fan-out and fewer I/Os for scans but cost more to rewrite and journal per change. The reserved region at the end of every page is left unused by the engine, so an extension such as encryption or checksums can store a nonce or tag per page. Hard because the trade-off interacts with the device block size: a page smaller than the sector is not atomically written.",
    k: ["Small pages vs large pages: small pages reduce write amplification and cache waste for random updates, while large pages speed scans and reduce tree depth.", "Reserved bytes per page for extensions vs none: checksums and encryption become possible without changing the format, but every page loses capacity."],
    p: ["Setting the page size on a nonempty database silently has no effect until a vacuum.", "A page size smaller than the physical sector makes a torn write possible within one page."],
    v: "Create databases with 4096 and 65536 byte pages, load the same data and compare file size, tree depth and the time of a full scan; confirm the stored header page size matches.",
    dep: ["database-header", "page-layout"]
  },
  "freelist": {
    s: "A list of pages no longer used by any tree, stored as trunk pages that each hold the numbers of many leaf pages, reused before the file grows.",
    d: "When a page is freed, such as after a delete empties it or a table is dropped, it joins the free list. The header points to the first trunk page; each trunk holds a next-trunk pointer and an array of free leaf page numbers, so many pages are tracked in a few pages. Allocation takes from the list first and extends the file only if empty. Freed pages are not returned to the operating system until a vacuum. Hard because the structure must be updated within the same transaction as the tree change.",
    k: ["Trunk pages with arrays of leaves vs a linked list of free pages: allocation touches few pages for many frees, but a corrupt trunk loses many pages at once.", "Reuse freed pages first vs always append: bounded file size, but data from many deletions scatters across the file."],
    p: ["After deleting most of a table the file does not shrink, and the free pages hold stale data until overwritten.", "A free-list count in the header that disagrees with the chain is reported by the integrity check as corruption."],
    v: "Delete half the rows of a large table, confirm the free-page count rises and the file size is unchanged, then insert the same volume and confirm the file size is still unchanged.",
    dep: ["database-header", "page-layout"]
  },
  "pointer-map-and-autovacuum": {
    s: "In auto-vacuum mode, special pages map each page to its parent type and owner so the engine can move pages and shrink the file at each commit.",
    d: "With auto-vacuum on, pointer-map pages are interspersed in the file, each recording for the pages after it whether that page is a tree root, a free page, an overflow page or an interior or leaf, and which page points to it. At commit, free pages near the end are swapped with used ones so the file can be truncated, and the map is used to fix the single pointer that refers to each moved page. Hard because the map must be kept exact on every allocation, free and balance, which costs extra writes.",
    k: ["Auto-vacuum with a pointer map vs periodic full vacuum: the file shrinks continuously and cheaply per commit, but pages fragment and every write updates the map.", "Incremental mode vs full: the host controls when free pages are reclaimed, but the file can stay large until it asks."],
    p: ["Turning auto-vacuum on or off requires a full vacuum, and doing neither leaves the setting inert.", "Auto-vacuum scatters pages, so scans of a table that was once contiguous become more random reads."],
    v: "In auto-vacuum mode delete most rows and commit, and confirm the file size shrinks at commit with no vacuum, and the integrity check passes.",
    dep: ["freelist", "overflow-pages", "balancing"]
  },
  "vacuum": {
    s: "A command that rebuilds the whole database into a fresh file, packing pages, resetting fragmentation and optionally changing page size, then replaces the original.",
    d: "Vacuum copies all schema and data into a temporary database through ordinary SQL, creating trees in order so pages fill densely, then copies the result back page by page over the original inside a transaction protected by the journal. It needs free disk space up to about twice the database size. A variant writes the compacted copy to a new file instead, leaving the source untouched. It is hard because it is a long exclusive operation and rowids of tables without an integer key may change.",
    k: ["Full rebuild vs in-place compaction: results in the most compact and ordered file and can change page size, but needs temporary space and an exclusive lock for the whole run.", "Vacuum into a new file vs over the original: the original is untouched and can be kept as a backup, but the application must switch files afterward."],
    p: ["Running vacuum on a nearly full disk fails midway and, with an interrupted copy, relies on the journal to restore the original.", "Vacuum blocks all readers and writers for the duration, which looks like an outage on large databases."],
    v: "Fragment a database with random inserts and deletes, run vacuum, and confirm the file is smaller, the page count equals tables plus indexes in use, and query results are unchanged.",
    dep: ["freelist", "external-sorter", "rollback-journal"]
  },
  "format-versioning": {
    s: "Version bytes in the header tell an older library whether it can read, or also write, a file that uses newer features, and what to do if it cannot.",
    d: "The header stores a file-format read version and a write version. If the read version exceeds what a library understands, it refuses to open; if only the write version exceeds it, it opens read-only. Newer features are introduced behind these numbers, for example the move to the write-ahead log, which sets both versions so that older libraries do not corrupt a log they do not understand. Rules also govern the schema format number, which controls how definitions are interpreted. Hard because each addition must be invisible to old files and safe for old readers.",
    k: ["Separate read and write version numbers vs one: an older library can still read a file that only newer writers may change, but two numbers must be set correctly for each feature.", "Gate features by version vs by schema content: simple checks at open, but a file stays at the high version even after the feature is unused."],
    p: ["Switching a database to the write-ahead log makes it unreadable to old libraries the application also ships.", "A tool that rewrites the header and forgets the version bytes silently downgrades the protection."],
    v: "Set a file's write version above the library's supported value and confirm the library opens it read-only and refuses writes; set the read version above and confirm it refuses to open.",
    dep: ["database-header"]
  },
  "page-cache": {
    s: "A fixed pool of in-memory page images, indexed by page number, that serves reads without disk access and holds modified pages until commit.",
    d: "The cache is a hash table from page number to a page structure with its data buffer, flags and reference count. A get either returns the cached page or reads it from the file via the VFS. Pages that are dirty are linked in a list ordered for writing. Each connection has its own cache by default, so two connections to one file hold separate copies, validated against the file change counter. Hard because data must be coherent across connections without shared memory, so a cache is dropped when another connection changed the file.",
    k: ["Private cache per connection vs shared cache: no cross-connection locking and simple isolation, but memory is duplicated and a change by another connection flushes the cache.", "Own cache vs rely on the OS page cache: control over eviction and dirty-page ordering, but data is cached twice."],
    p: ["Many connections to the same file multiply memory use because each holds its own copy of hot pages.", "Cache validation relying on the change counter fails if an external tool changes the file without updating it."],
    v: "Read a table twice on one connection and count file reads; the second read must issue none. Change the file from another connection and confirm the first connection discards its cached pages.",
    dep: ["pager-state-machine", "cache-replacement", "file-io-methods"]
  },
  "cache-replacement": {
    s: "Chooses which unreferenced cached page to evict when the pool is full, writing it out first if dirty, and spilling dirty pages to the file before commit when memory runs out.",
    d: "Unpinned pages sit on a recently-used list. When a new page is needed beyond the cache limit, the oldest clean page is recycled. If only dirty pages remain, one must be written out, which requires its original content to be in the journal and the journal synced first, so the safe order is maintained. In log mode, spilled pages go to the log. Hard because spilling dirty pages before commit is the only way a transaction can exceed memory, but it forces extra journal syncs.",
    k: ["Spill dirty pages when full vs refuse the transaction: large transactions work in small memory, but each spill adds sync work and slows the transaction.", "Prefer evicting clean pages: avoids writes and syncs, but may discard pages that will be needed again soon."],
    p: ["A very large transaction with a small cache performs repeated journal syncs during the transaction and becomes slow.", "Setting the cache too small causes thrash where every access misses, even for a small working set."],
    v: "Run a bulk insert larger than the cache and confirm it completes, that the journal contains the original pages of everything spilled, and that a crash during it leaves the original database intact.",
    dep: ["page-cache", "rollback-journal", "commit-sync-ordering"]
  },
  "pager-state-machine": {
    s: "The pager's lifecycle states: open, reader, writer-locked, writer-cached, writer-dirty, writer-finished and error, each limiting which operations and files are legal.",
    d: "Every pager call is legal only in certain states, and transitions follow lock acquisition and journal progress. Reading requires a shared lock and a validated cache. Beginning to write takes a reserved lock and opens the journal lazily. The first page modification writes that page's original content to the journal, moving to dirty state. Commit passes through finished state back to open. An I/O error moves to error state, which forces a rollback before further use. Hard because the state machine is the main defense against corruption on error.",
    k: ["Explicit states with assertions vs implicit flags: every impossible transition is caught in tests, but the machine has many states to reason about.", "Open the journal lazily at first write vs at transaction start: read-only transactions never create files, but the first write pays an extra step."],
    p: ["Ignoring an error-state return and continuing to use the pager can write pages from a failed transaction.", "A hot journal left from a previous crash must be recovered in the transition into reader state before any read."],
    v: "Inject an I/O error during commit, confirm the pager enters error state and refuses further writes, and that closing and reopening the database recovers a consistent state.",
    dep: ["page-cache", "transaction-states", "lock-levels", "rollback-journal"]
  },
  "page-references-and-dirty-list": {
    s: "Reference counts that pin pages while code uses them, and the ordered list of modified pages that the pager writes at commit.",
    d: "Every get-page call increments a count and every release decrements it; a page with a nonzero count cannot be evicted. A page must be marked writable before modification, which journals its original content once per transaction and puts it on the dirty list. Pages are written in file order when possible to help the device. Values borrowed by the virtual machine hold references. Hard because a leaked reference pins memory and blocks eviction, and a missing write mark corrupts the file without an error.",
    k: ["Explicit write marking before modification vs copy-on-write on every get: pages are journaled only when really changed, but every modification site must remember to mark.", "Ordered dirty list vs write in eviction order: sequential writes are faster on most devices, but need sorting at commit."],
    p: ["Modifying a page without marking it writable changes the cache but never reaches the journal or file, losing the change on commit.", "A reference never released keeps the page pinned, and the cache cannot shrink below the pinned set."],
    v: "Run a workload under a reference-leak detector in debug builds and confirm all page references are zero after each statement and the dirty list is empty after commit.",
    dep: ["page-cache", "rollback-journal"]
  },
  "memory-mapped-io": {
    s: "An option to read database pages by mapping the file into the address space, avoiding a copy into the page cache for reads while writes still go through the pager.",
    d: "When enabled up to a size limit, the pager maps the file and returns pointers directly into the mapping for read-only pages, skipping the cache and a system call. Writes still copy the page into a cache buffer so journaling works, and the map is refreshed when the file grows. It reduces copying and system calls for read-heavy loads. Hard because an I/O error on a mapped file shows up as a signal rather than a return code, and truncation by another process can fault.",
    k: ["Map the file vs read into cache: fewer copies and syscalls, but errors surface as faults and the OS decides what stays resident.", "Map only up to a limit: bounds address space on constrained devices, but data beyond the limit uses the ordinary path."],
    p: ["A file truncated or on failing media while mapped crashes the process with a fault instead of an error code.", "Mapping a database on a network or removable file system can behave unpredictably."],
    v: "Enable the mapping, run a read-only scan and confirm through the I/O counters that reads no longer pass through the cache path, and results match an unmapped run.",
    dep: ["page-cache", "file-io-methods"]
  },
  "cache-sizing": {
    s: "The configured limit on pages or bytes held in the cache, per connection or pooled, trading memory against disk reads, with a soft limit on total heap use.",
    d: "The cache size can be set in pages or in kilobytes per connection, and a global pool option lets many connections share one budget. The default is small to suit constrained devices. Performance depends on the working set: when it fits, reads hit memory; when not, the cache thrashes. Memory accounting counts page buffers and the structures that wrap them. Hard because the best setting depends on the device, the workload and the memory of the host, and a connection pool multiplies it.",
    k: ["Small default cache vs large: safe on small devices, but servers and bulk jobs usually need tuning.", "Per-connection budget vs a global pool: easy to reason about per connection, but a pool prevents many connections from exceeding total memory."],
    p: ["Setting a generous cache on each of a hundred pooled connections multiplies memory by a hundred.", "Leaving the small default for a large working set makes a read-heavy service dominated by system calls."],
    v: "Run the same read workload with several cache sizes and plot reads against size; confirm reads drop sharply once the working set fits and memory use matches the setting.",
    dep: ["page-cache", "memory-limits"]
  }
});
