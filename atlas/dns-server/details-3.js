// Details for the DNS server plate, part 3: authoritative serving, zone data, signing, transfers and updates.
ATLAS.details("dns-server", {
  "authoritative-answering": {
    s: "The core logic that takes a query for a name in a served zone and builds the correct response: answer, referral, alias, wildcard match or proof of absence.",
    d: "The server finds the zone containing the name, looks up the name in it, and decides among outcomes by a fixed algorithm: exact match, alias, delegation below the name, wildcard, or nonexistence. It sets the authoritative flag, includes needed additional records, and for signed zones attaches signatures and proofs. It is hard because the algorithm has many ordered edge cases, and an error produces answers that look plausible, are cached, and break only particular names.",
    k: ["Precomputing answers per name vs building them per query: precomputed answers are fast and consistent but costly to update and store; per-query building is flexible and handles wildcards and dynamic policy at some CPU cost.", "Strictly following the lookup algorithm vs special-casing for speed: strictness avoids incorrect corner cases; shortcuts raise throughput but introduce hard-to-find divergences."],
    p: ["Returning NXDOMAIN for a name that has descendants but no data of its own breaks tools that probe the tree.", "Missing the authoritative flag on a valid answer makes resolvers treat it as a lower-trust referral."],
    v: "Run a conformance suite of queries covering exact, alias, wildcard, delegated and missing names against a test zone and compare each reply's section contents and flags to a reference implementation's.",
    dep: ["zone-lookup","wildcard-synthesis","referral-and-glue","nxdomain-and-nodata"]
  },
  "zone-lookup": {
    s: "The data structure and procedure that, given a name, finds the zone that holds it and the matching node within the zone, usually in a tree keyed by reversed labels.",
    d: "First the server chooses the most specific zone it serves that is an ancestor of the query name, then finds the node in that zone's tree. Trees are ordered by label from the root downward, so wildcard checks, delegation cuts and the next existing name for denial proofs fall out of the traversal. It is hard because lookups must be very fast with millions of names, and must handle case-insensitive comparison and canonical ordering exactly.",
    k: ["Tree of labels vs hash table of full names: a tree supports ordered operations, delegations and denial proofs naturally; a hash table has fast exact lookups but needs extra structures for those cases.", "Immutable snapshots for readers vs locking: snapshots avoid lock contention under heavy reads and require copying or versioning when zones change."],
    p: ["Comparing names with a byte comparison that ignores the canonical label order breaks denial proofs.", "Deep zones with many siblings under one label turn a lookup into a linear scan."],
    v: "Load a zone with a million names and query a random sample, confirming every query hits the right node and that median lookup time stays within a few microseconds in a benchmark.",
    dep: ["in-memory-zone-store","memory-management"]
  },
  "wildcard-synthesis": {
    s: "Generating an answer for a name that does not exist by using a wildcard record at the nearest enclosing name, copying its data under the queried name.",
    d: "A record owned by a name with an asterisk as its first label matches names below it that do not otherwise exist. The server finds the closest existing ancestor, checks for a wildcard beneath it, and returns the wildcard's data with the query name as owner. It does not apply when the name exists with other types, or below a delegation. It is hard because the matching rules are subtle and signatures must cover the wildcard, with proof that no closer name exists.",
    k: ["Using wildcards vs listing names explicitly: wildcards cover unbounded names with one record but hide typos and make mapping unclear; explicit names are clear at the cost of maintenance.", "Wildcard match at the first existing ancestor only vs searching further up: the first-ancestor rule is the standard and predictable; broader matching surprises zone owners."],
    p: ["Assuming a wildcard answers for every type leads to a missing-type surprise when the name exists with another type.", "A wildcard shadowed by an unrelated empty non-terminal returns nothing for names under it."],
    v: "Define a wildcard and a specific name beside it, then query a random label, the specific name and a name of a different type, and confirm each receives the answer the matching rules require.",
    dep: ["zone-lookup","authoritative-answering","denial-chains"]
  },
  "referral-and-glue": {
    s: "Responding with a delegation when the queried name lies below a zone cut, listing the child's name servers and any address glue the client needs to continue.",
    d: "When the lookup crosses a cut into a delegated child zone, the server returns a non-authoritative response with the child's NS records in the authority section and address records for in-zone servers in the additional section. In signed zones it adds the delegation signer record or proof that none exists. It is hard because stale glue breaks delegation, and because glue must be kept consistent with the child's own data.",
    k: ["Including glue only when required vs always: required-only keeps replies small and avoids stale data; always including saves resolvers a lookup but grows replies and risks inconsistency.", "Serving referrals for names below the cut vs answering from stored child data: serving the parent's view is correct and avoids leaking unauthorized data; storing both in one server confuses which is authoritative."],
    p: ["Glue left in the parent after a name server's address changed sends resolvers to the old address.", "Returning child data as authoritative from a parent server gives out unsigned or outdated records."],
    v: "Query a name below a delegation and confirm the reply lacks the authoritative flag, lists the child's NS records, contains glue for in-zone servers and no glue for out-of-zone ones.",
    dep: ["zone-lookup","authoritative-answering"]
  },
  "nxdomain-and-nodata": {
    s: "The two negative outcomes: the name does not exist at all, or it exists but has no record of the requested type, each with its own response code and caching rules.",
    d: "A missing name yields the nonexistent-name code, an existing name without that type yields success with an empty answer. Both include the zone's SOA so resolvers can cache the result, and in signed zones carry denial proofs. The distinction matters, because a resolver treats nonexistence as covering all types and subnames. It is hard because empty non-terminals, names that have descendants without data, must return the no-data case, not nonexistence.",
    k: ["Distinguishing the two precisely vs returning one error: precision is required for correct caching and for tools; collapsing them is simpler and breaks subtree assumptions.", "Including the SOA in every negative reply vs leaving it out: the SOA is required for negative caching; omitting it saves bytes and makes resolvers fall back to default timers."],
    p: ["Returning nonexistence for an empty non-terminal causes resolvers to cache the whole subtree as missing.", "Omitting the SOA in a negative reply makes negative caching unpredictable."],
    v: "Query a missing name and an existing name with an unused type, and confirm the first returns the nonexistent-name code and the second returns success with no answer, each carrying the SOA.",
    dep: ["authoritative-answering","soa-and-negative-ttl","rcodes-and-flags"]
  },
  "soa-and-negative-ttl": {
    s: "The zone's start-of-authority record, holding its serial, timers and the value that determines how long negative answers are cached.",
    d: "The SOA names the primary server, a contact, the serial that signals changes, and refresh, retry, expire and minimum timers. Negative answers are cached for the lesser of the SOA's own TTL and its minimum field, so that value is operationally the negative TTL. Secondaries use the timers to pace polling. It is hard because one record serves two jobs, replication control and cache control, and wrong values make zones stale or missing names stay invisible.",
    k: ["Short negative TTL vs long: short lets new names appear quickly and raises load from lookups of missing names; long reduces load and delays visibility.", "Conservative refresh and expire timers vs aggressive: conservative timers reduce polling and tolerate longer primary outages; aggressive timers keep copies fresher but stop answering sooner when the primary is lost."],
    p: ["An expire timer shorter than a realistic primary outage makes secondaries stop serving the zone entirely.", "Leaving the minimum field at an old large default delays new names for days."],
    v: "Inspect a negative response's SOA and confirm the returned TTL equals the lesser of the SOA TTL and minimum, then confirm a client cache honors it by timing a second lookup.",
    dep: ["resource-record-format","serial-numbers"]
  },
  "any-and-meta-queries": {
    s: "Handling of special query types: requests for all types at a name, zone transfer requests, and queries about the server itself, each with its own limits.",
    d: "ANY asks for every record set at a name. It is a debugging aid and an amplification tool, so many servers answer with a minimal placeholder instead. Transfer types are routed to the transfer code. Other meta types, such as the server's version or identity, are handled by special rules or disabled. The difficulty is keeping debug usefulness while not giving attackers large answers or version data for exploit targeting.",
    k: ["Full ANY answers vs minimal answers: full ones aid debugging and cause amplification; minimal ones are small and force diagnosticians to ask for specific types.", "Exposing server identity vs hiding it: identity helps operators find which anycast site answered; hiding it denies attackers information about software versions."],
    p: ["Answering ANY with every record set over UDP is a ready-made amplifier.", "Version strings that reveal exact software let attackers pick known exploits."],
    v: "Send an ANY query for a name with many types and confirm the reply is small and flagged as minimal, then query for the identity string and confirm only a site label, not a software version, is returned.",
    dep: ["authoritative-answering","minimal-responses","axfr"]
  },
  "zone-file-format": {
    s: "The text format for describing a zone: one record per line with owner, TTL, class, type and data, plus directives for origin, default TTL and file inclusion.",
    d: "Zone files are the portable way to express and exchange zones. Names may be relative to an origin, TTL and class can be inherited, and parentheses allow multi-line records. Every record type defines its own text syntax for its data. It is hard because the format is permissive and has many corner cases: relative versus absolute names with and without a trailing dot, escaped characters, and comments, so a typo can silently create a record under the wrong name.",
    k: ["Text zone files as source of truth vs a structured database: text is portable, diffable and reviewable; structured storage supports validation, concurrency and APIs at the cost of tooling.", "Allowing includes and generators vs flat files: macros shorten large repetitive zones but make the final content harder to see and review."],
    p: ["A missing trailing dot makes a name relative, so it becomes the origin appended to itself.", "A forgotten serial increment means secondaries never see the edit."],
    v: "Load a zone file with relative and absolute names, then dump the loaded zone and confirm every owner name appears fully qualified as intended, with the TTLs inherited as written.",
    dep: ["resource-record-format","record-types"]
  },
  "zone-loader": {
    s: "The parser and validator that reads zone data from a file, transfer or database into the server's structures and rejects zones that violate the rules.",
    d: "The loader tokenizes the text or wire data, builds record sets, and checks structure: exactly one SOA, apex NS records, no alias coexisting with other data at a name, glue presence for in-zone servers, and signing consistency. Errors may reject the whole zone or just the bad record. Large zones load incrementally to avoid long stalls. It is difficult because a half-loaded or mistakenly accepted zone is served immediately and cached widely.",
    k: ["Reject the zone on any error vs skip bad records: rejecting protects against partial data and keeps the old version serving; skipping loads what it can and silently drops names.", "Load in the serving thread vs in a background thread: foreground loading is simple and stalls queries; background loading needs a handoff mechanism and extra memory."],
    p: ["Accepting an alias record next to other data at the same name creates answers that differ between resolvers.", "Loading a multi-gigabyte zone in the query path stalls answering for seconds."],
    v: "Load a zone with a deliberate violation, such as an alias beside an address record, and confirm the load is rejected with the line number while the previous version continues to answer queries.",
    dep: ["zone-file-format","in-memory-zone-store","atomic-zone-swap"]
  },
  "in-memory-zone-store": {
    s: "The compact in-memory representation of loaded zones, optimized for fast read-only lookups, with the data of each name stored once in a form ready to send.",
    d: "Most authoritative servers keep the entire zone in memory in a tree, with record sets stored in wire format or close to it so that building a reply is mostly a copy. Updates build a new version rather than mutating in place. Memory use matters: millions of names of a hosted-DNS provider can dominate machine memory, so deduplicating shared data and compressing names pays off. It is hard to balance read speed, update cost and memory.",
    k: ["Store records in wire format vs parsed structures: wire format makes replies nearly free to produce; parsed structures are easier to modify and inspect.", "Copy-on-write versions vs in-place mutation: versions give readers consistent snapshots without locks; in-place mutation is lean but needs locking or careful ordering."],
    p: ["Memory sized for one version fails when old and new versions coexist during a reload.", "Per-record overhead dominates memory for zones with millions of tiny records."],
    v: "Load a zone of ten million records, measure memory per record, serve a replayed query load and confirm replies are identical to those from a reference loading of the same file.",
    dep: ["memory-management","zone-loader"]
  },
  "database-backed-zones": {
    s: "Reading zone data from a relational or key-value database at query time or on change, so editing happens through the database and not through files.",
    d: "The server queries the store, or is notified of changes and refreshes in-memory copies. This supports web portals, large customer zone counts and multi-writer workflows through standard database tools. Direct per-query access adds latency and makes the database a single point of failure, so servers cache heavily. It is hard to retain correctness: DNS requires a consistent zone snapshot, and a row-by-row read can mix records from before and after an edit.",
    k: ["Per-query database lookups vs loading into memory: per-query is always fresh and slow; loading is fast and needs change notification to stay current.", "Storing records in normalized rows vs whole zone blobs: rows allow queries and edits of single records; blobs are simple to snapshot and replicate."],
    p: ["Database outage with no cache turns into total DNS failure.", "Reading records without a consistent snapshot returns a zone with some old and some new data."],
    v: "Edit a record in the database and confirm the server returns the new value within the stated refresh bound, then stop the database and confirm the server keeps answering from its last good copy.",
    dep: ["in-memory-zone-store","zone-loader","change-journal"]
  },
  "change-journal": {
    s: "An append-only log of the differences between successive versions of a zone, used to send incremental transfers and to recover after a restart.",
    d: "Each change to a zone, whether from an edit, a dynamic update or a transfer, is recorded as the records removed and added between one serial and the next. The journal lets secondaries ask for only what changed since their serial and lets the primary restore state after a crash. It must be trimmed or it grows without limit. It is hard because it must be written durably before changes are visible and kept consistent with the zone file.",
    k: ["Keeping long history vs short: long history lets slow secondaries use incremental transfers; short history saves space and forces full transfers more often.", "Fsync every change vs batch writes: syncing each change prevents loss after a crash but limits update rate; batching raises throughput and risks losing recent updates."],
    p: ["A journal that no longer matches the zone file after manual edits causes bad incremental transfers.", "Trimming the journal past a slow secondary's serial forces repeated full transfers."],
    v: "Make a series of changes, restart the primary, and confirm the zone returns at the latest serial and an incremental request from an older serial returns exactly the changes in order.",
    dep: ["serial-numbers","ixfr"]
  },
  "serial-numbers": {
    s: "The version number in a zone's SOA record, compared by wrap-around arithmetic, that tells secondaries whether the zone has changed and in which direction.",
    d: "Every change must increase the serial so secondaries know to fetch. Comparison uses sequence-space rules that handle wrap past the 32-bit limit. Common schemes are a date plus a counter, a simple counter or the time in seconds. A serial that goes backwards or jumps beyond half the space makes secondaries ignore or reject updates. It is hard in multi-writer or signed setups where each system might increment independently.",
    k: ["Date-based serials vs plain counters: dates are readable but limit changes per day; counters allow any number of changes and carry no meaning.", "Manual increments vs automatic: manual gives control and invites forgotten increments; automatic ensures every change is visible and requires care when several systems generate zones."],
    p: ["Resetting a serial lower during a migration leaves secondaries serving old data indefinitely.", "Two independent signers incrementing separately produce serials that diverge between servers."],
    v: "Make an edit without raising the serial and confirm secondaries do not pick it up, then raise it and confirm every secondary reaches the new serial within the refresh timer.",
    dep: ["soa-and-negative-ttl"]
  },
  "atomic-zone-swap": {
    s: "Replacing a zone's served data by switching to a fully built new version in one step, so queries never see a half-loaded or mixed zone.",
    d: "The new version is loaded and validated beside the live one. Once complete, the server switches a pointer, and queries already in flight finish against the old version, which is freed after the last reader leaves. Without it, a query during a reload could see missing names or a new SOA with old data. It requires memory for both versions at once, and care that signatures, journal and notifications are updated in the same step.",
    k: ["Build-then-swap vs update in place: swap gives consistent snapshots and clean rollback at double memory; in-place is lean and exposes transient states.", "Reference counting vs epoch reclamation for old versions: reference counts are simple and cost on every query; epochs make reads free but delay freeing memory."],
    p: ["A swap before signatures are ready serves unsigned or mismatched data to validators.", "A leaked reader keeps the old version alive and memory grows with every reload."],
    v: "Reload a large zone repeatedly while a client queries a name present in both versions and confirm there is never a failure or empty answer, and memory returns to baseline after each swap.",
    dep: ["in-memory-zone-store","zone-loader"]
  },
  "key-storage-hsm": {
    s: "Where signing keys live and how they are protected: files, a hardware module that signs without exposing the key, or a managed key service.",
    d: "The signing process needs a private key for each signing role. Hardware modules keep the key inside the device and perform signatures on request, at limited speed, with access controlled by credentials and audit. Software keys are fast and easy to automate but can be copied. Backup, split custody and recovery procedures decide whether a lost device ends the zone or not. It is hard to combine security, availability and throughput.",
    k: ["Hardware-protected keys vs files: hardware prevents extraction and adds cost, latency and a vendor dependency; files are fast and portable and as safe as the host.", "Keeping the master key offline vs online: offline keys are safest and require manual signing steps; online keys automate signing and are exposed to host compromise."],
    p: ["A hardware module failing with no backup of its key loses the zone's ability to roll keys safely.", "Signing rates limited by the device cannot keep up with a large zone's re-signing cycle."],
    v: "Generate a key in the device, sign a test zone, confirm the signatures validate, then attempt to export the private key and confirm the device refuses.",
    dep: ["key-roles","zone-signer"]
  },
  "key-roles": {
    s: "The division of signing keys by purpose: a key-signing key that anchors trust with the parent, and zone-signing keys that sign the bulk of the records and change often.",
    d: "The key-signing key signs only the zone's key record set and is referenced by the parent's digest, so changing it needs parent coordination. Zone-signing keys sign everything else and can be replaced frequently without involving the parent. Some deployments use a single combined key for simplicity. The split reduces how often the parent must be updated and allows stronger protection for the rarely used key, at the cost of more states to manage.",
    k: ["Split keys vs a single key: splitting allows frequent zone-key changes without parent updates; a single key reduces moving parts and makes each rollover involve the parent.", "Algorithm choice by size vs by compatibility: smaller signatures make responses fit in UDP; wider support helps validators but may produce larger responses."],
    p: ["Using the key-signing key for routine record signing makes it as exposed as the zone key.", "Choosing an algorithm some validators do not support makes the zone appear unsigned or bogus to them."],
    v: "Inspect the zone's key records and signatures and confirm only the key set is signed by the key-signing key, other sets are signed by the zone-signing key, and the parent's digest matches the former.",
    dep: ["key-storage-hsm","zone-signer"]
  },
  "zone-signer": {
    s: "The process that adds a signature to every record set in a zone, refreshes signatures before they expire and updates denial records when names change.",
    d: "The signer walks the zone, signs each record set with the current key, includes validity timestamps, and builds the chain of denial records. Afterward it watches for changes, re-signs only affected sets, and renews signatures well before expiry. Outputs are written to the zone and the serial incremented. It is hard because signature lifetimes are a hard deadline: a stalled signer takes a zone offline for every validator when signatures lapse.",
    k: ["Signing in the zone pipeline vs on the serving machine: pipeline signing keeps keys off the edge and requires transfers; on-server signing is flexible and spreads key exposure.", "Short signature lifetimes vs long: short lifetimes limit replay of old data and need reliable signing; long lifetimes tolerate signer outages and let stale data persist."],
    p: ["A signer that stops without alerting causes a simultaneous validation failure when signatures expire.", "Re-signing the whole zone at once creates huge transfers and load spikes."],
    v: "Check every record set's signature expiry time and confirm the earliest is still further away than the configured safety margin, and that a changed record gets a new signature immediately.",
    dep: ["key-roles","denial-chains","clock-sync"]
  },
  "online-signing": {
    s: "Producing signatures at query time for generated answers, so wildcards, health-checked or geography-based records can be signed even though no stored record exists.",
    d: "When the answer is computed per query, the server signs it on demand with a key available online. To avoid proving a specific name's nonexistence with stored chains, it can return a minimal denial proof that covers the name with a made-up range. This costs CPU per query, caches signatures when answers repeat, and puts a signing key on the serving machine. It is hard to scale and to protect.",
    k: ["Online signing vs precomputed signatures: online allows dynamic answers; precomputed is faster and lets keys stay offline but cannot sign generated data.", "Fixed-range minimal denial vs full chains: minimal denial needs no stored chain and reveals nothing; full chains are standard and cannot cover dynamic names."],
    p: ["A key that must stay online on every edge site multiplies the places it can be stolen.", "Signature computation under a flood becomes the bottleneck and raises latency."],
    v: "Query a dynamically generated name and confirm a valid signature covers the answer, then measure the signing rate under load and confirm it exceeds the expected peak query rate.",
    dep: ["key-storage-hsm","denial-chains","authoritative-answering"]
  },
  "denial-chains": {
    s: "The signed records linking existing names together so a validator can prove that no name or type exists between two points, using either readable or hashed names.",
    d: "Each existing name gets a record naming the next existing name and listing the types it has. A response for a missing name returns the record that spans it, plus its signature. The hashed variant orders names by a hash, so adjacent names are not revealed, at the cost of computation and weaker aggregate caching. Maintaining the chain on every add or removal is a core cost of signing. It is hard because of opt-out for large delegation-heavy zones and the parameters' CPU cost.",
    k: ["Readable chains vs hashed chains: readable chains permit aggressive caching and expose all names to anyone who walks them; hashed chains resist walking, cost more CPU and can be reversed by guessing.", "Opt-out for delegations vs full coverage: opt-out shrinks chains for huge zones of unsigned delegations and lets unsigned names be added unnoticed."],
    p: ["Setting a large number of hash iterations lets each negative answer burn validator CPU.", "A chain not updated with a new name makes the new name appear nonexistent to validators."],
    v: "Add a name to a signed zone and confirm the chain entry before it points to the new name, the new name's entry points onward, and queries for names around it validate.",
    dep: ["zone-signer","nxdomain-and-nodata"]
  },
  "key-rollover": {
    s: "The scheduled, careful replacement of a signing key, publishing the new key before it is used and removing the old one only after caches have forgotten it.",
    d: "A rollover follows a timeline: publish the new key, wait for caches to hold it, sign with it, wait for old signatures to expire from caches, then remove the old key. Changing the key-signing key additionally requires updating the parent's digest and waiting for its TTL. Two methods exist: pre-publication of the new key, and double signing of the key set. It is hard because the waiting times depend on every cache's TTL, and any mistake is a validation outage.",
    k: ["Frequent rollovers vs rare: frequent ones exercise the process and limit exposure of a stolen key; rare ones reduce risk of a mistake and leave the process untested.", "Pre-published new key vs double signature: pre-publication keeps responses small; double signature switches quickly and enlarges every response during the transition."],
    p: ["Removing the old key before signatures that use it have expired from caches breaks validation for some resolvers.", "Updating the parent's digest before the new key is published makes the whole zone bogus."],
    v: "Run a rollover in a staging zone and validate through resolvers with warmed caches at every step, confirming no step produces a validation failure, and that the old key is gone at the end.",
    dep: ["key-roles","ds-publication","ttl-and-staleness"]
  },
  "ds-publication": {
    s: "Getting the digest of the zone's key-signing key into the parent zone, where it forms the link in the chain of trust, and keeping it in step with key changes.",
    d: "The zone owner computes a digest of the key and submits it to the registrar or registry, which publishes it in the parent. Some parents support automated discovery, where they poll the child for a signal record that announces the new digest. Without publication the zone is treated as unsigned. It is hard because the parent is a separate organization with its own process, so mistakes there cannot be fixed instantly.",
    k: ["Manual submission through a registrar vs automated child-signaled updates: manual works everywhere and is slow and error-prone; automation is quick and requires parent support and trust in the signal.", "Publishing digests for several keys vs one: several allow overlapping rollovers; one is simple and makes rollover timing tighter."],
    p: ["Publishing a digest for a key that is not in the zone makes the zone bogus.", "Removing the digest without waiting for its TTL leaves some resolvers with a stale chain."],
    v: "Query the parent for the zone's digest record and confirm it matches the digest computed from the zone's current key-signing key, and that validating resolvers mark answers secure.",
    dep: ["key-roles","delegation-monitoring"]
  },
  "primary-secondary-model": {
    s: "The replication design in which one server holds the master copy and edits, and other servers fetch copies of the zone from it, so all answer identically.",
    d: "The primary owns changes and increments the serial; secondaries poll or are notified, then transfer the zone. Secondaries can chain from other secondaries. A hidden primary, not listed in the delegation, is common: it takes edits and only feeds the public-facing servers. The model is simple but has a single point of change. It is hard because a secondary serving stale data is invisible to clients, and the expire timer is the only brake.",
    k: ["Hidden primary vs visible primary: hidden primaries reduce attack surface and keep editing off public servers; visible ones are simpler and take query load.", "Chained secondaries vs all pulling from the primary: chains reduce primary load and add propagation delay and failure dependencies."],
    p: ["A secondary that cannot reach the primary keeps serving old data until expiry and nobody notices.", "A chain with one broken middle server stalls every server behind it."],
    v: "Change the zone on the primary and confirm every secondary reports the new serial and answers with new data within the notify plus transfer time, listing any that lag.",
    dep: ["notify-messages","axfr","ixfr","refresh-retry-expire"]
  },
  "notify-messages": {
    s: "A message the primary sends to secondaries after a zone change, telling them to check the serial now instead of waiting for the next refresh interval.",
    d: "After a new version loads, the primary sends a notification to each configured secondary. The secondary responds, then queries the SOA and transfers if the serial is higher. Notifications are unauthenticated hints and are rate-limited, since the secondary only acts after checking the primary itself. They cut propagation from the refresh interval to seconds. It is hard because notifications are unreliable datagrams that may be lost, so the refresh timer must remain as the backstop.",
    k: ["Push notification plus polling vs polling alone: notification gives fast updates and extra configuration; polling is simple and as slow as the refresh timer.", "Authenticating notifications vs accepting by address: authentication prevents forged triggers and requires keys everywhere; address checks are simple and spoofable."],
    p: ["Notifications sent to the wrong address, after a server move, silently leave a secondary stale until refresh.", "Unlimited notifications let a forger trigger repeated checks at a secondary."],
    v: "Edit a zone on the primary and confirm each secondary logs a received notification and begins a transfer within seconds, then block notifications and confirm updates still arrive at the next refresh.",
    dep: ["primary-secondary-model","refresh-retry-expire","tsig-authentication"]
  },
  "axfr": {
    s: "The full zone transfer: a secondary requests an entire zone over a stream connection and the primary sends every record, starting and ending with the SOA.",
    d: "The secondary opens a TCP connection and sends a transfer request. The primary streams the zone's records in one or more messages, bracketing them with the SOA, and the secondary builds a new copy and swaps it in. Because it can be large, it must be authenticated and often goes over encrypted channels. It is hard because transfers are heavy: a big zone transfers megabytes per secondary, and an unauthorized transfer exposes every name in the zone.",
    k: ["Full transfer vs incremental: full transfer is simple and always correct and costs bandwidth; incremental saves bandwidth and needs journal state at the primary.", "Open transfers vs restricted: open transfers help debugging and expose the whole zone to enumeration; restricted ones need keys and addresses managed."],
    p: ["Leaving transfers open to anyone lets attackers list every host name in a zone.", "A transfer interrupted midway must not replace the previous good copy."],
    v: "Request a transfer from an allowed secondary and confirm the received zone matches the primary record for record with equal SOA at start and end, and confirm a denied host gets a refusal.",
    dep: ["tcp-transport","tsig-authentication","transfer-access-control"]
  },
  "ixfr": {
    s: "The incremental transfer: a secondary sends its current serial and the primary replies with only the records removed and added since that version.",
    d: "The primary looks up the secondary's serial in its journal and sends a sequence of deltas from that point forward, or falls back to a full transfer if history is unavailable or longer than the full zone. It works over UDP for tiny changes and TCP otherwise. It makes large zones with frequent small changes cheap to keep in sync. It is hard because journal discipline is needed and any divergence between the journal and the real zone silently corrupts secondaries.",
    k: ["Incremental transfer with fallback to full vs full only: fallback keeps secondaries correct when history is lost; full only is simpler and wasteful.", "Applying deltas in place vs rebuilding then swapping: in place is fast and risks a half-applied state on error; rebuild is safe and costs memory."],
    p: ["A delta applied to the wrong base version produces a zone that differs from the primary without any error.", "Journal trimming that outpaces slow secondaries causes constant full transfers."],
    v: "Change one record in a large zone and confirm a secondary transfers only the removed and added records, then compare the secondary's data to the primary's for an exact match.",
    dep: ["change-journal","tcp-transport","tsig-authentication"]
  },
  "tsig-authentication": {
    s: "Shared-secret message signing that lets two servers prove who sent a request or reply and that it was not changed, used to protect transfers, notifications and updates.",
    d: "Each message carries a signature computed over its contents plus a timestamp, using a secret key shared by both ends and named in the message. The receiver recomputes it and rejects mismatches or messages outside the allowed time skew. It authenticates each transaction without needing certificates. It is hard because secrets must be distributed and rotated across servers, and because clocks that drift beyond the allowed skew make valid messages fail.",
    k: ["Shared secrets vs certificate-based channels: shared secrets are simple, fast and need careful distribution; certificates scale to many parties and need a trust infrastructure.", "Tight clock skew vs loose: tight limits shrink the window for replaying captured messages and fail on poorly synchronized clocks."],
    p: ["One key shared across every server and purpose means a leak compromises all operations.", "Clock drift makes transfers fail with authentication errors that look like key problems."],
    v: "Send a signed transfer request with the right key and confirm it succeeds, then send one with a wrong key and one with a timestamp outside the skew and confirm each is rejected.",
    dep: ["clock-sync","message-header"]
  },
  "transfer-access-control": {
    s: "Rules that decide which clients may request zone transfers, notifications or updates, by address, key or both, per zone.",
    d: "Each zone has access lists naming allowed requesters and the keys they must use. The server checks the list before sending any zone data or accepting any change. Defaults should deny. Combining address and key checks limits damage if either is compromised. The challenge is keeping lists accurate as servers are added and removed, and avoiding broad network ranges that include untrusted hosts.",
    k: ["Address plus key vs one factor: both factors stop spoofed addresses and stolen keys alone; one factor is easier to manage and weaker.", "Per-zone lists vs global lists: per-zone limits exposure and costs maintenance; global lists are easy and give every secondary every zone."],
    p: ["A broad allow range for a cloud network includes machines belonging to other tenants.", "Default-allow on a new zone exposes it until someone notices."],
    v: "Request a transfer from a listed address with the right key, from a listed address without a key, and from an unlisted address, and confirm only the first succeeds and the others are refused and logged.",
    dep: ["tsig-authentication","axfr"]
  },
  "dynamic-updates": {
    s: "A protocol for adding, changing and deleting records in a live zone by sending update messages, used by hosts and servers to register their own names.",
    d: "An update message names the zone and lists prerequisites and changes; the primary checks authorization, applies all changes atomically, increments the serial and notifies secondaries. Common users are address assignment systems and directory services. Authorization is by key, name-based policy or address. It is hard because many writers race, because stale registrations accumulate, and because signed zones must be re-signed for every change.",
    k: ["Name-scoped update policy vs whole-zone permission: scoped policy lets each host change only its own names; whole-zone permission is simple and gives each client control of everything.", "Atomic prerequisites vs blind updates: prerequisites avoid overwriting data other parties created; blind updates are simple and prone to conflicts."],
    p: ["Clients allowed to update any name can hijack the names of other machines.", "Unrefreshed registrations from machines that left the network accumulate and return wrong addresses."],
    v: "Send an authorized update that adds a record and confirm the change appears with a higher serial and secondaries follow, then send one from an unauthorized key and confirm it is refused with no change.",
    dep: ["tsig-authentication","change-journal","notify-messages","zone-signer"]
  },
  "refresh-retry-expire": {
    s: "The three SOA timers that pace a secondary: how often to check for changes, how soon to retry after failure, and how long it may serve without hearing from the primary.",
    d: "After the refresh interval a secondary checks the primary's serial. If it cannot reach it, it retries at the retry interval. If the failure lasts past expire, the secondary stops answering for the zone. The values balance freshness, load and tolerance for outages. With notifications the refresh is a backstop. It is hard because expire is a hard stop: a long primary outage can turn into total zone failure.",
    k: ["Long expire vs short: long expire keeps zones answering through long primary outages and keeps stale data; short expire limits staleness and risks zone-wide failure.", "Frequent refresh vs rare: frequent refresh keeps copies fresh at some load; rare refresh relies on notifications entirely."],
    p: ["An expire value of a few days fails over a long weekend outage.", "A retry interval that is too short hammers a recovering primary with requests."],
    v: "Isolate a secondary from the primary and confirm it retries at the configured interval, continues answering until the expire time, and then returns server failures for the zone.",
    dep: ["soa-and-negative-ttl","primary-secondary-model"]
  },
});
