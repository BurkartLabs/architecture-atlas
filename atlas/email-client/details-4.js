// Details for the email client plate, part 4: sync engine, accounts, protocol clients, cross-cutting concerns.
ATLAS.details("email-client", {
  "sync-scheduler": {
    s: "Decides which accounts and folders to synchronize, when, and in what priority, balancing freshness against battery, data use and server limits.",
    d: "The scheduler keeps a work list of folders with reasons for syncing: a push signal, an open view, a periodic timer, a user pull-to-refresh or a completed local change. It orders them by priority (the open folder and inbox first), limits concurrency per account to the server's connection limits, and defers background work under power or network constraints. It is hard because triggers overlap and must be collapsed to avoid duplicate syncs, and because one slow or failing account must not starve the others.",
    k: ["Event-driven sync vs fixed polling: events are timely and efficient where available, polling works everywhere and wastes work.", "Per-account queues vs a global queue: per-account respects server limits and isolates failures, global gives better overall prioritization."],
    p: ["Every trigger starting its own sync produces several simultaneous syncs of the same folder that fight over state.", "A failing account retried at full speed drains battery while delivering nothing."],
    v: "Trigger a push, a pull-to-refresh and a timer within one second for one folder and confirm exactly one sync runs; fail one account's server and confirm the others sync on time.",
    dep: ["incremental-sync", "connection-pool", "retry-backoff"]
  },
  "folder-discovery": {
    s: "Learns the server's folder list and attributes, detects creation, rename and deletion, and maps special-purpose folders to the client's roles.",
    d: "The client requests the hierarchy with the server's special-use attributes, separators and subscription state. It compares against local folders using stable identifiers where the server provides them, otherwise by name. New folders are added, missing ones removed after confirming, and renames recognized rather than treated as delete plus create. Roles for inbox, sent, drafts, trash, junk and archive are assigned from attributes. It is hard because renames look identical to delete-and-create on many servers and the full list can be very large.",
    k: ["Subscribe to everything vs only chosen folders: everything is complete and syncs useless folders, chosen saves resources and hides mail.", "Treat a vanished folder as deleted at once vs after confirmation: immediate is simple, confirmation avoids dropping a cache when a server glitch hides a folder."],
    p: ["Treating a rename as delete plus create re-downloads the folder and loses local state such as flags and offline copies.", "Assigning the trash role by name picks a user folder called 'Deleted' as the real one."],
    v: "Rename a folder with 5,000 messages on the server and confirm the client shows it renamed with no re-download and flags intact; create a nested folder and confirm it appears in the right place.",
    dep: ["imap-client", "labels-and-folders", "local-id-mapping"]
  },
  "initial-sync": {
    s: "The first full synchronization of an account: downloading the folder list, then headers for the mailbox, newest first, so the user can read mail before it finishes.",
    d: "The sync begins with folders, then the inbox, fetching headers in batches by date window, newest first, and bodies only for a recent set. Older headers continue in the background. Progress and a usable state are shown early. Resumability is required: a restart continues from the last saved boundary. It is hard because mailboxes can hold millions of messages, because servers throttle heavy first connections, and because showing partial results must not mislead about completeness.",
    k: ["Newest first with background backfill vs oldest first or all at once: newest first makes the app usable quickly and leaves the archive incomplete for a while.", "Limit the sync window by date vs sync everything: a window is quick and small, everything enables full offline search and takes hours."],
    p: ["Opening a million-message mailbox with a single enormous request times out and restarts from the beginning each time.", "Search results that look complete while the backfill is only half done mislead users about missing mail."],
    v: "Add an account with 500,000 messages and confirm the inbox is usable within seconds, backfill continues across a restart without repeating work, and the final local count matches the server's.",
    dep: ["folder-discovery", "partial-fetch", "message-database"]
  },
  "incremental-sync": {
    s: "Brings the cache up to date after the first sync by asking the server only for what changed since the last known point, using protocol change tokens and counters.",
    d: "The client stores a position per folder: the highest identifier seen, a change counter or a state string. A sync asks for new messages above that identifier and for flag changes since the counter, and compares the server's message list with local to find deletions when the server lacks change reports. Results apply in one transaction and the position advances only after commit. It is hard because protocols differ in whether deletions and flag changes can be asked for at all, and because a failed sync must be safely repeatable.",
    k: ["Use change counters where supported vs full comparison: counters are cheap and exact when available, a full comparison works everywhere and costs time and traffic.", "Advance the sync position after commit vs as data arrives: after commit is safe to retry, early is faster to resume and loses changes on a crash."],
    p: ["Advancing the position before changes are saved loses updates after a crash and the cache stays wrong until a full resync.", "Fetching only new messages misses flag changes and deletions made elsewhere."],
    v: "Make changes on another device (new mail, a flag, a delete), sync, and confirm local state equals the server with traffic proportional to the three changes, not the mailbox size.",
    dep: ["imap-client", "message-database", "flag-reconciliation", "expunge-handling"]
  },
  "uid-validity": {
    s: "Detects that a server has renumbered a folder, so every locally stored identifier for it is invalid and the cache must be rebuilt rather than trusted.",
    d: "Each folder has a validity value that the server changes whenever its message numbering restarts, for example after a restore or rebuild. The client compares the stored value to the current one at each folder open. On mismatch it discards identifier mappings and re-matches messages by headers, keeping the local content where possible. It is hard because wrongly trusting old identifiers makes the client act on different messages than the user intended, and because some servers change the value needlessly.",
    k: ["Rebuild the mapping by matching messages vs discard the folder cache: matching preserves local state and costs work, discarding is simple and re-downloads everything.", "Check on every open vs only on connect: every open is safest and chatty, on connect misses a change during a long session."],
    p: ["Ignoring a changed validity makes flag changes and deletes apply to unrelated messages.", "A server that changes the value on every login causes a full re-download each time."],
    v: "Simulate a server rebuild that changes the folder validity and renumbers messages, then confirm the client detects it, remaps messages by header identifier, and no flag or delete is applied to the wrong message.",
    dep: ["imap-client", "local-id-mapping"]
  },
  "flag-reconciliation": {
    s: "Merges flag changes made on the device with those made elsewhere on the server, deciding the final state for each message.",
    d: "Local changes sit in the queue with the state they started from; server changes arrive in incremental sync. For each message the reconciler compares both with the last known common state. If only one side changed, it wins; if both changed to different values, a rule applies, commonly that read and flagged states merge by union and deletion beats other changes. The result is written locally and any needed update sent. It is hard because flags are small, frequent and set concurrently, and because protocols do not report who changed what.",
    k: ["Three-way merge against the last known state vs last-writer-wins: three-way detects real conflicts and needs stored base state, last-writer is simple and loses edits.", "Treat 'read' as monotonic (once read stays read) vs strict merge: monotonic matches user expectation and prevents flapping, strict is literal and annoying."],
    p: ["Two devices toggling the same flag keep flipping it back and forth on each sync.", "Without a stored base state a local unread-to-read change cannot be told apart from a server change and one is lost."],
    v: "Offline on device A mark a message read, on device B flag it, then sync both and confirm the final state is read and flagged on both and nothing flips afterward.",
    dep: ["message-flags", "incremental-sync", "offline-queue"]
  },
  "conflict-resolution": {
    s: "Rules for the cases where local and server states cannot both stand: a message moved and deleted, a draft edited twice, a folder renamed locally and on the server.",
    d: "Conflicts occur when queued local operations target state that has changed remotely. The resolver classifies them: harmless (repeat a done operation), recoverable (the target moved so retarget it) or a true conflict. Policies pick a side or keep both, as with two versions of a draft saved side by side. Decisions are logged and unresolvable cases are shown to the user. It is hard because rules must be deterministic across devices and avoid data loss, since deleting is irreversible.",
    k: ["Prefer the server state vs prefer local intent: server is consistent for all devices and drops edits, local intent respects the user's recent action and can overwrite others' changes.", "Keep both versions vs choose one: keeping both loses nothing and clutters, choosing is tidy and sometimes wrong."],
    p: ["Resolving a conflict toward deletion discards a draft the user spent an hour writing.", "Rules that differ between versions of the app make devices disagree about the same conflict."],
    v: "Edit one draft on two offline devices and sync both; confirm neither text is lost, both versions are available, and the result is the same on each device.",
    dep: ["offline-queue", "incremental-sync", "draft-autosave"]
  },
  "expunge-handling": {
    s: "Processes deletions: marking messages deleted, moving them to trash, and the final removal that the server performs later, reconciled with the local cache.",
    d: "On many servers deleting is two steps: a flag, then a later purge that actually removes the message, so a flagged message may still exist. The client chooses between moving to trash and flagging and purging, hides flagged messages from views, and removes local copies when the server confirms removal. Incremental sync must detect messages that disappeared without a notification. It is hard because the protocols differ and a message can vanish from the server for reasons other than the user.",
    k: ["Move to trash vs flag and purge: trash is recoverable and matches user expectations, flag-and-purge is faster and permanent.", "Detect deletions by comparing identifier lists vs server reports: comparison works everywhere and scales poorly, reports are cheap and need protocol support."],
    p: ["Purging immediately skips the trash and a mistaken delete cannot be undone.", "A failed deletion detection leaves 'ghost' messages that open to an error after being removed elsewhere."],
    v: "Delete a message on another device, sync, and confirm it disappears locally within one sync; delete locally and confirm it reaches the trash on the server and can be restored.",
    dep: ["incremental-sync", "message-database", "imap-client"]
  },
  "partial-fetch": {
    s: "Downloads only the parts of a message that are needed now: headers first, then the text body, then attachments on demand, including resuming interrupted transfers.",
    d: "Protocols let the client request the structure of a message, then individual parts, even byte ranges of a part. The client fetches headers and structure during sync, the text part when the user opens the message or by prefetch rules, and attachments only when asked. Interrupted downloads resume from the last byte received. It is hard because structure descriptions vary between servers, because partial content must be marked complete or not, and because some servers do not implement range requests.",
    k: ["Fetch the body on open vs prefetch: on open saves data and shows a delay, prefetch is instant and spends data on unread mail.", "Fetch parts separately vs the whole message: separate saves data on big attachments and costs round trips, whole is simpler and wasteful."],
    p: ["Treating a truncated download as complete shows messages cut off mid-sentence with no indication.", "Requesting parts for servers that do not honor ranges downloads the entire message repeatedly."],
    v: "Open a message with a 20 MB attachment on a throttled connection and confirm the text appears without waiting for the attachment, and an interrupted attachment download resumes rather than restarting.",
    dep: ["imap-client", "body-store", "attachment-cache"]
  },
  "autodiscovery": {
    s: "Finds the server settings for an email address automatically: a provider settings database, DNS records, well-known configuration URLs and probing of common host names.",
    d: "Given an address, the client tries in order: a bundled or online provider database keyed by domain, domain-published configuration files and DNS service records, then guessed host names and port and security combinations. It confirms by connecting and testing authentication. Results give server names, ports, security mode and authentication method for incoming and outgoing mail. It is hard because lookups reveal the address to third parties, because guesses can send credentials to the wrong host, and because misconfigured domains return plausible wrong answers.",
    k: ["Query the domain's own configuration vs a central database: domain-owned is accurate and unauthenticated, a central database covers more domains and is a third party.", "Probe ports and security modes vs fail with a message: probing succeeds for more users, and sends connection attempts and possibly credentials to hosts guessed from the domain."],
    p: ["Sending a password to a guessed host over an unauthenticated connection gives credentials to whoever answers.", "Fetching configuration over plain HTTP lets a network attacker substitute a server of their choice."],
    v: "Add accounts for a known provider, a custom domain with published records and one with none; confirm the first two configure with no input, the third asks for manual settings, and no credentials were sent before the server identity was verified.",
    dep: ["server-config-db", "tls-layer", "network-awareness"]
  },
  "account-wizard": {
    s: "The guided flow that takes an address and credentials to a working account: discovery, authentication, test connection, folder selection and first sync.",
    d: "The wizard asks for the least it can, runs discovery, then performs real tests: it connects to the incoming server, logs in, lists folders, and opens a test submission to the outgoing server without sending mail. Errors are mapped to plain causes: wrong password, disabled access, certificate problem, blocked network. It then sets defaults and starts the first sync. It is hard because failures are cryptic, providers require extra steps like application passwords, and each retry risks account lockout.",
    k: ["Test both incoming and outgoing before finishing vs finish and fail later: testing finds problems while the user is present and is slower, deferring is quick and hides errors.", "Guided setup for known providers vs a generic manual form: guided is easiest and needs maintenance per provider, manual is flexible and error prone."],
    p: ["Repeated failed logins during guesses lock the account and the user blames the app.", "A wizard that reports 'could not connect' for a certificate problem sends users down the wrong path."],
    v: "Set up an account with a wrong password, a blocked port and a correct login, and confirm each failure shows a specific actionable message and only the correct login completes with a working send and receive test.",
    dep: ["autodiscovery", "credential-store", "oauth-flow", "account-manager"]
  },
  "credential-store": {
    s: "Holds passwords, access tokens and refresh tokens for each account in the platform's protected storage, released only to the components that need them.",
    d: "Secrets are written to the operating system's keystore or an app-protected vault, keyed by account. Components request a credential at connect time, never cache it in logs or plain settings, and clear it from memory after use. Access tokens are refreshed when they expire, and the new ones replace the old atomically. Removing an account deletes its secrets. It is hard because multiple processes (main app, background worker, extension) share the secrets, because refresh tokens are long-lived and valuable, and because backups must not carry them.",
    k: ["Platform keystore vs app-managed encryption: the keystore is hardened and varies by platform, app-managed is uniform and the key still has to live somewhere.", "Store the password vs only tokens: tokens can be limited and revoked, passwords work with every server and are more damaging if stolen."],
    p: ["Logging a connection command with its authentication string writes the secret to diagnostic files.", "A refresh race between the app and a background worker invalidates the token and logs the user out."],
    v: "Inspect logs, settings files, backups and crash reports after setup and use; confirm no secret appears. Delete the account and confirm the keystore entries are removed.",
    dep: []
  },
  "oauth-flow": {
    s: "Authenticates against providers using their authorization page and tokens instead of the user's password, then renews access tokens in the background.",
    d: "The client opens the provider's sign-in page in a system browser or secure web session, receives an authorization code with a code challenge to prevent interception, exchanges it for an access token and a refresh token, and presents the access token to the mail server using a token-based login mechanism. When the token expires it refreshes it silently. Revocation and consent changes surface as login failures. It is hard because each provider differs in scopes, redirect rules and token lifetimes, and because failures need the user to sign in again.",
    k: ["System browser for sign-in vs an embedded web view: the system browser is trusted and shares sessions, an embedded view is smoother and can see credentials.", "Request minimal scopes vs broad: minimal limits damage if a token leaks, broad avoids later re-consent when features expand."],
    p: ["Embedded sign-in views let the app observe passwords and teach users to type them anywhere.", "An expired refresh token with no visible prompt makes mail silently stop syncing."],
    v: "Sign in using the browser flow, confirm the client never sees the password, revoke access from the provider's side and confirm the client shows a clear re-authentication prompt on the next sync.",
    dep: ["credential-store", "tls-layer", "network-awareness"]
  },
  "account-manager": {
    s: "Keeps the list of configured accounts and their identities, folders and settings, and enables, disables, reorders and removes them cleanly.",
    d: "Each account has a server configuration, credentials reference, identities, sync preferences and its own cache. The manager starts and stops each account's sync and push, isolates failures, and handles removal by deleting the cache, credentials, registrations and queued work. Several accounts at the same provider may share limits. It is hard because accounts differ in capabilities, because one account's failure must not affect others, and because deletion must be complete.",
    k: ["Isolated state per account vs shared services: isolation limits the effect of failures and costs resources, sharing is efficient and couples accounts.", "Disable an account without deleting its cache vs only remove: disabling keeps data for later and consumes storage, removal frees it and requires a full sync to restore."],
    p: ["Removing an account but leaving its push registration or cache means notifications and data for a deleted account remain.", "A misbehaving account that loops on errors drains the battery across all accounts."],
    v: "Add three accounts, break one's server, and confirm the other two sync normally; remove the broken one and confirm its cache, credentials, push registration and queued work are all gone.",
    dep: ["credential-store", "sync-scheduler", "message-database"]
  },
  "server-config-db": {
    s: "A maintained database of settings for known providers and domains, used to configure accounts without guessing, and updated independently of the app.",
    d: "Entries map domains and MX patterns to server names, ports, security and authentication methods, plus notes such as a required application password or provider quirks. The database ships with the app and can be refreshed from a service. It is also where workarounds for provider bugs live. It is hard because providers change settings, because custom domains hosted at a provider need mapping through DNS records, and because an out-of-date entry breaks setup for every user of that provider.",
    k: ["Bundled with the app vs fetched online: bundled works offline and goes stale, online is fresh and requires trust and a network call revealing the domain.", "Match on the email domain vs on the MX records: the domain is quick and misses hosted custom domains, MX records find hosted mail and need a DNS lookup."],
    p: ["A stale entry with a retired server name makes setup fail for everyone on that provider after release.", "Matching a custom domain on a suffix pattern applies a provider's settings to an unrelated host."],
    v: "Check each bundled entry against a connection test in a scheduled run and confirm all hosts resolve and negotiate the listed security mode; look up a hosted custom domain through its records and get the right provider.",
    dep: ["network-awareness"]
  },
  "certificate-handling": {
    s: "Validates the server's certificate chain, name and validity during connection, and handles failures and exceptions in a way users can understand without being talked into unsafe choices.",
    d: "After the handshake the client checks the chain against the platform's trust store, the host name against the certificate and the expiry. Failures are shown with details. Self-signed servers in organizations or home setups may be accepted by pinning a specific certificate, with alerts if it changes. Revocation checks may apply. It is hard because users click through warnings, because pinning requires handling legitimate renewals, and because failures often reflect networks rewriting traffic.",
    k: ["Allow user exceptions vs hard fail: exceptions support home and internal servers and invite blind acceptance, a hard fail is safe and blocks legitimate setups.", "Pin the exact certificate vs the issuing key: exact is strict and breaks at each renewal, issuer pinning survives renewals and trusts the issuer more."],
    p: ["A permanent exception for a host stays in place after the certificate changes to an attacker's.", "Accepting any certificate to 'make it work' disables protection of passwords and mail on the network."],
    v: "Connect to servers with an expired, a wrong-name and a self-signed certificate; confirm each is refused with a specific reason and an exception pins only the exact certificate and prompts again when it changes.",
    dep: ["tls-layer", "credential-store"]
  },
  "account-health": {
    s: "Watches each account for failures and slowdowns, such as login errors, quota limits and sync stalls, and tells the user what is wrong and what to do.",
    d: "Components report outcomes to the monitor: login succeeded or failed, last successful sync time, error classes, quota use, and server notices. It maps patterns to messages such as 'sign in again', 'mailbox full' or 'server unreachable', and shows state per account. Persistent errors escalate from a quiet indicator to a visible notice. Diagnostic logs support troubleshooting, with secrets removed. It is hard because errors are cryptic and transient failures are common, so alerts must be rare and accurate.",
    k: ["Alert after several consecutive failures vs on the first: several avoids false alarms and delays real alerts, the first is quick and noisy.", "Collect diagnostic logs by default vs on request: default helps troubleshooting and increases privacy exposure, on request protects privacy and loses the history."],
    p: ["A silent sync failure for days leaves the user missing mail without any indication.", "Diagnostic logs including message subjects or credentials get shared in a support request."],
    v: "Revoke an account's access, sync, and confirm an indicator appears with a 'sign in again' action within one cycle; fill the mailbox quota and confirm a distinct message appears.",
    dep: ["account-manager", "sync-scheduler", "retry-backoff"]
  },
  "imap-client": {
    s: "Speaks the stateful mailbox-access protocol: listing folders, selecting one, fetching headers and parts, setting flags and moving messages, with the mailbox remaining on the server.",
    d: "The client opens a connection, authenticates, selects a folder and issues commands tagged so replies match requests. It uses extensions where present: change tracking, idle notification, partial fetch, move and special-use folders. The server keeps state per connection, so the client tracks which folder is selected and pipelines commands. The mailbox stays authoritative on the server. It is hard because implementations interpret the protocol differently, extensions are optional, and replies can arrive in any order and interleave with unsolicited updates.",
    k: ["Use extensions where advertised vs a baseline-only client: extensions cut traffic sharply and multiply code paths, baseline works with all servers and is slow on large mailboxes.", "Several parallel connections vs one: parallel speeds sync and risks server connection limits, one is simple and slow."],
    p: ["Server-specific quirks in how flags or lists are returned break assumptions and corrupt local state for one provider.", "Issuing commands for the wrong selected folder after a pipeline reorder changes mail in an unintended folder."],
    v: "Run the client against several server implementations with a standard scenario (list, fetch, flag, move, delete, idle) and confirm identical local results and no protocol errors in logs.",
    dep: ["protocol-parser", "capability-negotiation", "connection-pool", "tls-layer"]
  },
  "smtp-client": {
    s: "Submits outgoing messages to the user's mail server over an authenticated, encrypted connection, reporting acceptance or refusal for each recipient.",
    d: "The client connects to the submission service, upgrades to encryption, authenticates, then declares the sender, recipients and the message data. The server accepts or rejects each recipient and the message as a whole, and may enforce size limits and sender rules. Acceptance means the server took responsibility for delivery, not that it arrived; later failures come back as bounce messages. It is hard because partial recipient acceptance needs handling and because a lost reply after the data is sent leaves it unknown whether the message was accepted.",
    k: ["Authenticated submission through the user's server vs direct delivery to recipient servers: submission uses the provider's reputation and is the norm, direct fails with most receiving filters.", "Resend when the final reply is lost vs treat as sent: resending risks duplicates, assuming sent risks losing the message."],
    p: ["A connection lost after the message data was sent but before the reply leads to a duplicate on retry.", "Ignoring per-recipient refusals tells the user a message was sent when part of the list never received it."],
    v: "Send to three recipients where one is refused, and confirm the message is delivered to two, the user sees which one failed and why, and killing the connection after data transfer produces at most one copy.",
    dep: ["protocol-parser", "tls-layer", "capability-negotiation", "connection-pool"]
  },
  "pop-client": {
    s: "A simple download-oriented protocol client that retrieves messages from a server, optionally deleting them there, with little notion of folders or flags.",
    d: "The client authenticates, lists messages with sizes and unique identifiers, downloads the ones not yet seen and, depending on settings, deletes them or leaves them. There are no server folders, no flags and no sync of read state, so state is only local. It still serves legacy and simple providers. It is hard because tracking which messages are new relies on unique identifiers some servers do not provide consistently, and because multiple devices cannot share state.",
    k: ["Leave messages on the server vs delete after download: leaving allows other devices to fetch and grows the mailbox, deleting saves server space and makes this device the only copy.", "Poll on an interval vs idle: polling is the only option and delays arrival and costs traffic."],
    p: ["Deleting after download on a device whose disk fails loses the only copy of the mail.", "Servers that change identifiers cause the same messages to be downloaded repeatedly."],
    v: "Fetch from a test mailbox with leave-on-server on and confirm each message downloads exactly once across ten polls, and with deletion on confirm the server mailbox is empty afterward.",
    dep: ["protocol-parser", "tls-layer", "connection-pool"]
  },
  "proprietary-sync-client": {
    s: "An adapter for a provider's own synchronization protocol, which carries mail, contacts and calendars together and has its own change tracking and policy rules.",
    d: "Some providers expose a richer, vendor-specific protocol over HTTP with a single sync state per collection, server-side change tracking, direct push through a held request and device policy enforcement such as required passcode or remote wipe. The adapter maps its model onto the client's own, handling collections, change tokens and folder types. It is hard because the protocol is complex, versions differ, documentation lags real behavior, and policy requirements reach into device settings.",
    k: ["Native support for the provider's protocol vs standard protocols only: native gives push and groupware features and costs a large adapter, standard is simple and loses features.", "Honor server device policies vs refuse accounts requiring them: honoring enables managed use and gives the server control over the device, refusing preserves user autonomy."],
    p: ["Version differences in the protocol cause sync to silently skip some item types.", "A policy requirement the client cannot satisfy leaves the account half-working with unclear errors."],
    v: "Connect to a test server for the protocol, create, change and delete a message and a contact elsewhere, and confirm each change reaches the client once and the sync token advances correctly.",
    dep: ["tls-layer", "connection-pool", "capability-negotiation"]
  },
  "jmap-client": {
    s: "A client for the modern JSON-over-HTTP mail protocol, which batches operations in one request and reports changes through state strings.",
    d: "Requests contain a list of method calls whose results can feed later calls, so one round trip can query, fetch and update. Objects such as mailboxes, emails and threads have state strings, and the client asks for changes since a known state. Push uses event streams or platform notifications. The server provides thread identifiers and efficient search. It is hard because server support and extensions vary, and because the client must handle result back-references and partial failures within a batch.",
    k: ["Batched method calls vs separate requests: batching cuts round trips and complicates error handling, separate requests are simple and slower.", "Rely on server-side threads and search vs build locally: server versions are consistent across devices and cannot be used offline."],
    p: ["Treating a batch as all-or-nothing hides that some methods failed and later ones ran on stale results.", "A state string expired by the server needs a full resync that the client does not handle."],
    v: "Run a query, fetch and flag update as one batch against a test server, confirm one round trip, then change state elsewhere and confirm a changes request returns only the difference.",
    dep: ["tls-layer", "connection-pool", "capability-negotiation"]
  },
  "connection-pool": {
    s: "Manages a bounded set of authenticated connections per account, shared among sync, fetch, send and idle tasks, and respects the server's limits.",
    d: "Each account has a cap on simultaneous connections from its server. The pool leases connections to tasks by priority, keeps one dedicated to waiting for changes, reuses idle ones and closes those unused. It tracks authentication state and the selected folder, and replaces broken connections. It is hard because servers close idle connections silently, because user-facing requests must jump ahead of background sync, and because exceeding the connection cap makes the server reject the login.",
    k: ["Small pool per account vs many connections: small respects limits and serializes work, many speeds up sync and triggers refusals.", "Keep connections open vs open on demand: open reduces latency and holds server slots, on demand is clean and pays the setup cost each time."],
    p: ["Background sync holding all connections makes opening a message wait behind it.", "Leaked connections after an error eventually fill the server's limit and block all logins."],
    v: "Start a large background sync and open a message simultaneously; confirm the open completes promptly on a reserved or prioritized connection and the server never sees more connections than its limit.",
    dep: ["tls-layer", "credential-store", "retry-backoff"]
  },
  "protocol-parser": {
    s: "Reads server responses in their wire formats, including literals, lists and nested structures, defensively and incrementally as bytes arrive.",
    d: "Responses are text lines with embedded binary literals, parenthesized lists and quoted strings, or structured documents. A streaming parser consumes them as they arrive, handles lengths declared in advance, and yields typed results. It tolerates unknown extensions and vendor oddities, enforces limits on sizes and nesting, and never trusts lengths blindly. It is hard because it faces untrusted input from servers that may be buggy or hostile, and because errors in framing desynchronize the whole connection.",
    k: ["Strict grammar vs tolerant parsing: strict detects server bugs early and fails on quirky real servers, tolerant works everywhere and may hide errors.", "Stream results as they arrive vs buffer whole responses: streaming bounds memory for large fetches, buffering is simpler to write."],
    p: ["Trusting a declared literal length allocates gigabytes from a hostile or broken server.", "A framing error mid-response misreads the following response as part of it and corrupts state silently."],
    v: "Feed the parser captured sessions from many servers plus fuzzed and truncated input; confirm it parses all valid ones identically, rejects malformed ones with bounded memory and never hangs.",
    dep: []
  },
  "capability-negotiation": {
    s: "Learns which optional protocol features a server supports and selects the best code path, with workarounds for known server defects.",
    d: "On connect, and again after authentication, the client reads the server's advertised capability list and records it per account. Feature code checks it: use idle if offered, use change tracking if offered, otherwise fall back. Known-bad servers are matched by greeting or version and get adjusted behavior. It is hard because advertised capabilities are sometimes wrong, because they change after login and encryption, and because each combination is a path that needs tests.",
    k: ["Trust advertised capabilities vs verify by probing: trusting is fast and breaks on servers that lie, probing is safe and costs time.", "Quirk table for known servers vs generic defensive code: a table fixes known cases precisely and needs upkeep, generic handles unknown servers and is slower."],
    p: ["Reading capabilities before encryption is established lets a network attacker strip features such as the upgrade to TLS.", "A capability cached across server upgrades keeps the client using a removed feature."],
    v: "Connect to servers with different capability sets and confirm the client picks the matching code paths; strip the encryption advertisement in transit and confirm the client refuses to proceed unencrypted.",
    dep: ["protocol-parser"]
  },
  "tls-layer": {
    s: "Encrypts and authenticates connections to mail servers, from direct encrypted connections or upgrades on plain ports, and refuses downgrades.",
    d: "Connections use encryption from the first byte or upgrade in place using a protocol command. The layer sets minimum versions and cipher choices, validates certificates through the certificate handling component, and supports client certificates where needed. It enforces the configured mode and does not silently fall back to plain text. It is hard because the upgrade-in-place mode is exposed to stripping attacks, because old servers need old settings, and because interception by security software rewrites certificates.",
    k: ["Encrypted from the first byte vs upgrade in place: first byte has no downgrade window, upgrade works on one port and must be required explicitly.", "Allow old protocol versions for legacy servers vs refuse: allowing keeps old systems working and exposes users to known attacks, refusing is secure and breaks them."],
    p: ["An 'opportunistic' upgrade setting lets an attacker remove the upgrade offer so passwords go in plain text.", "Sending credentials before certificate validation completes gives them to an impostor server."],
    v: "Connect through a proxy that removes the upgrade offer and confirm the client aborts; capture traffic during normal use and confirm no credentials or message content appear in plain text.",
    dep: ["certificate-handling"]
  },
  "retry-backoff": {
    s: "Schedules repeated attempts after failures with increasing delays and random jitter, and distinguishes temporary from permanent errors.",
    d: "Each failure is classified: network error or server busy means try again, bad credentials or a refused recipient means stop. Delays grow exponentially up to a cap with random variation so many clients do not retry together. Successful operations reset the delay. Limits keep a message or account from retrying forever. User actions can bypass the wait. It is hard because classification relies on error codes with inconsistent meaning, and because repeated failed logins lock accounts.",
    k: ["Exponential backoff with jitter vs fixed interval: backoff protects the server and delays recovery, fixed is simple and creates retry storms.", "Retry login errors vs stop at the first: retry covers temporary server faults and risks lockout, stopping is safe and needs the user for transient problems."],
    p: ["Retrying a failed login at full speed locks the account and floods the provider after an outage.", "Without a cap, a permanent failure retries forever and shows a perpetual spinner."],
    v: "Simulate server outage for ten minutes and confirm attempt intervals grow with jitter to the cap, recovery happens within one interval after the server returns, and a wrong password is attempted once with no retries.",
    dep: ["network-awareness"]
  },
  "network-awareness": {
    s: "Tracks connectivity, network type, metered state and proxy configuration, and adapts when the network changes, rather than treating every failure as a server problem.",
    d: "The client listens to platform network events to know when it is online, on a metered connection or behind a captive portal, and which proxy applies. It pauses sync when offline, restricts large downloads on metered networks, resets connections after a network change and detects captive portals that answer with fake responses. It resolves names with the platform resolver. It is hard because 'online' is a guess, because networks change mid-operation, and because proxies and portals break protocols in ways that resemble server bugs.",
    k: ["Trust the platform's connectivity signal vs probe the server: the signal is cheap and sometimes wrong, probing is accurate and costs traffic.", "Pause large transfers on metered networks vs honor requests: pausing protects the user's plan and delays mail, honoring is fast and costly."],
    p: ["A captive portal that returns web pages instead of server responses is read as a protocol failure and credentials are retried against it.", "Connections not reset after switching from Wi-Fi to cellular hang until a long timeout."],
    v: "Switch from Wi-Fi to cellular during a sync and confirm connections are re-established within seconds and sync completes; join a captive-portal network and confirm the client reports it and sends nothing sensitive.",
    dep: []
  },

  "untrusted-input": {
    s: "Every message, attachment, header and link is written by a stranger, and the server may be wrong or hostile too, so no input is trusted until it has passed a boundary.",
    d: "This shapes every layer. Parsers have limits and recover from malformed data, the renderer isolates content, attachments are never executed automatically, links are inspected, and server responses are validated as strictly as message content. The design question is where the trust boundaries sit and what is allowed to cross them, so a failure in one component does not become a compromise of the account. It is the reason sanitizing, sandboxing and policy exist as separate components with independent checks.",
    k: ["Several independent boundaries vs one strong filter: layered checks cost more and survive a single bug, one filter is simpler and a single bypass defeats everything.", "Isolate rendering in a separate process vs in-process safety: isolation contains exploits and costs resources, in-process is efficient and relies on code correctness."],
    p: ["Two components parsing the same message differently let content pass the scanner and still reach the display.", "Treating a trusted server's data as safe lets a compromised or malicious server attack the client."],
    v: "Run a corpus of hostile messages, attachments and server responses through the full client, and confirm nothing executes, no unexpected network request is made, and the process stays within bounded resources.",
    dep: ["html-sanitizer", "sandboxed-renderer", "mime-parser", "protocol-parser"]
  },
  "offline-first": {
    s: "The device holds the data it needs and works without a connection, treating the network as an unreliable way to catch up rather than a requirement for every action.",
    d: "Reading, searching, composing, organizing and queuing sends all operate on local state. The interface never blocks on the network, and each action returns immediately with the server update queued. This forces durable queues, stable local identifiers, conflict rules and a sync engine that can be interrupted at any point. It also decides what to keep locally. The cost is complexity: every operation exists in a local and a remote form, and the two must converge.",
    k: ["Local-first with a queue vs server-first with caching: local-first is fast and works offline, at the price of conflict handling that server-first avoids.", "Large offline window vs small: large supports travel and search and consumes storage, small is light and limits what works without a signal."],
    p: ["An action that waits for the server freezes the interface on a poor connection.", "Offline changes without a durable queue vanish when the app is killed."],
    v: "Use the client for an hour in airplane mode: read, search, organize, compose and send; then reconnect and confirm every action reached the server once and the state matches.",
    dep: ["offline-queue", "message-database", "body-store", "incremental-sync"]
  },
  "consistency-and-identity": {
    s: "The server is the source of truth, several devices change the same mailbox, and identifiers change; the design must decide how copies converge and how a message is recognized as the same one.",
    d: "Identity decisions include which identifiers are stable (server numbers per folder, message-id headers, local identifiers) and how they map after moves and resets. Consistency decisions include which operations commute, which conflicts have rules and which need the user. Eventually consistent copies are normal here, but the interface must not show states that mislead, such as a deleted message still counted unread. These choices affect sync, the cache, notifications and every user-visible state.",
    k: ["Stable local identifiers vs server identifiers: local survive moves and resets and need a mapping layer, server are simple and break at the first reset.", "Merge states from both sides vs last writer wins: merging keeps both devices' intent, last writer is simple and loses changes."],
    p: ["Assuming identifiers are globally unique leads to acting on the wrong message after a folder renumber.", "Treating sync as eventually correct without bounds lets a stuck sync leave a device wrong for days."],
    v: "Run two devices and a server through randomized sequences of reads, moves, deletes and flags with random disconnects, and confirm all three converge to the same state with no message lost or duplicated.",
    dep: ["local-id-mapping", "flag-reconciliation", "conflict-resolution", "uid-validity"]
  },
  "protocol-diversity": {
    s: "Accounts reach different servers with different protocols and different interpretations of the same protocol, so the client needs one internal model and adapters that hide the differences.",
    d: "The client defines a common model of accounts, folders, messages and operations, and each protocol client implements it, reporting what it can and cannot do. Features degrade by capability: no server-side search, no change tracking, no labels. Quirks of specific servers are handled in adapters or tables, not in the interface. This makes support for a new provider a contained task, and it makes the common model the lowest common denominator unless capability flags reach the interface.",
    k: ["A narrow common model vs exposing protocol-specific features: narrow keeps the interface simple and hides useful abilities, exposing gives power and spreads special cases.", "Test against real servers vs mocks: real servers find quirks and are slow and flaky, mocks are fast and encode our assumptions."],
    p: ["A feature built on one server's behavior fails on others because capabilities were assumed.", "Provider-specific code leaking into the interface layer makes every new provider a risk to the existing ones."],
    v: "Run the same functional test script against each supported protocol and several server implementations and confirm identical outcomes except for features explicitly flagged as unsupported.",
    dep: ["imap-client", "jmap-client", "proprietary-sync-client", "capability-negotiation"]
  },
  "privacy-and-tracking": {
    s: "A mail client sits between a person and everyone who writes to them, so what it fetches, reports and stores must not reveal when, where or whether messages are read.",
    d: "Privacy decisions cut across rendering, networking and storage. Remote content is blocked or proxied, links are stripped of tracking identifiers, read receipts are off by default, lookups for keys and directories are minimized, and diagnostic data omits message content and secrets. On the device, caches and indexes are protected. Each choice weighs privacy against appearance, convenience or function, and defaults decide the outcome for most people.",
    k: ["Private by default with opt-in loading vs open by default with opt-out: private protects everyone and degrades some mail, open looks better and exposes most users.", "Route fetches through an intermediary vs direct: an intermediary hides the user's address and sees the traffic, direct is simple and reveals more."],
    p: ["One setting that loads remote images for everything undoes all tracking protection at once.", "Telemetry or crash reports containing subjects or addresses leak the mail it was meant to protect."],
    v: "Receive messages from a test sender designed to log requests, read them with default settings, and confirm the sender's logs record nothing; inspect diagnostics and confirm no message text or address appears.",
    dep: ["remote-content-blocker", "tracking-defense", "encryption-at-rest", "key-discovery"]
  },
  "resource-budgets": {
    s: "Mail is always on and phones have limited battery, storage and data, so every component works against budgets for radio wakeups, memory, disk and bandwidth.",
    d: "The design sets limits and priorities: how often the radio may wake, how much each sync may read, how much storage the cache may use and how much memory rendering may take. Work is batched, deferred when conditions are poor, and cancelled when it no longer matters. Large mailboxes and huge messages are the test cases. These budgets conflict with freshness and offline use, so they are settings with defaults chosen to be acceptable on the weakest supported device.",
    k: ["Fixed budgets by default vs adaptive to device state: fixed is predictable and wasteful on good conditions, adaptive uses what is available and is hard to reason about.", "Spend on prefetch for speed vs save for battery: prefetch makes reading instant and wastes resources on unread mail."],
    p: ["Unbounded work on huge mailboxes or messages makes the app the top battery consumer and gets it throttled.", "Memory-heavy rendering of many messages at once gets the app killed in the background and loses state."],
    v: "On a low-end device with a 500,000-message account, run 24 hours with typical use and confirm battery drain, storage growth and peak memory stay within published targets.",
    dep: ["wake-scheduling", "cache-eviction", "partial-fetch", "network-awareness"]
  }
});
