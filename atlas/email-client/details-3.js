// Details for the email client plate, part 3: organization and search, notifications, local storage.
ATLAS.details("email-client", {
  "threading-engine": {
    s: "Groups messages into conversations using reference headers, falling back to subject and participant heuristics, and keeps the grouping stable as new mail and edits arrive.",
    d: "The standard method links each message to the identifiers it replies to and references, building a tree and then flattening it for display. Missing parents are tolerated by creating placeholders. Some systems also match normalized subjects within a time window. Servers may supply their own thread identifiers. Grouping runs at insert time and updates incrementally. It is hard because headers are dropped by some clients, because merging two threads after the fact changes many rows, and because subject matching groups unrelated mail.",
    k: ["Header-based threading vs subject-based: headers are accurate and miss clients that omit them, subject matching catches those and merges unrelated mail.", "Use the server's thread identifiers vs build locally: server ids are consistent across devices but absent on many servers, local building works everywhere and can differ between devices."],
    p: ["A recurring subject such as 'Weekly report' merges months of separate conversations into one thread.", "A late message that bridges two threads triggers a rewrite of thousands of rows and a visible reshuffle."],
    v: "Import a corpus of 10,000 messages with known thread structure and confirm grouping matches the expected threads; add a bridging message and confirm threads merge once without duplicates.",
    dep: ["message-database", "header-cache"]
  },
  "labels-and-folders": {
    s: "The data model for placing messages: exclusive folders, multi-membership labels or both, with a mapping to what each server supports.",
    d: "A folder model places a message in exactly one location and moving changes it. A label model lets a message carry several tags and be present in many views without copies. Servers differ, so the client maps its model to the server's: labels exposed as folders appear as duplicates, and mapping 'archive' differs across them. The model also defines special folders and how deleting or moving updates the server. It is hard because the mapping must keep the user's mental model consistent while the server model is different.",
    k: ["Labels as the core model vs folders as the core: labels allow flexible views, folders are simple and match most servers and user expectations.", "Represent label-as-folder duplicates as one message vs separate entries: one message is faithful to the user's idea, but requires tracking every server location."],
    p: ["Treating a server's labels-as-folders as separate messages shows each message several times and counts it as several unread.", "Deleting from a label view removes the message from every label instead of just that one."],
    v: "On a label-based server, add two labels to one message and confirm it appears once in each label view, counts once in unread totals, and removing one label leaves the other intact.",
    dep: ["message-database", "folder-discovery"]
  },
  "rules-engine": {
    s: "Applies user-defined conditions and actions, such as move, label, flag or forward, to incoming and existing mail, either on the client or on the server.",
    d: "Rules have conditions on headers, body, size and sender, and actions on the matched message. Server-side rules run at delivery, even when no client is running, and can be edited through a sieve-style protocol; client-side rules run during sync and only when the client is open. Order and stop-processing flags matter. It is hard because client and server rules overlap and conflict, because forwarding actions can leak mail, and because a wrong rule applied to a large mailbox is hard to reverse.",
    k: ["Server-side rules vs client-side rules: server-side work with every device and when closed, client-side support any condition but run late and per device.", "Rules run on existing mail vs only new: retroactive helps cleanup and can restructure a mailbox in one click."],
    p: ["Two devices each running the same client-side rule move a message twice or fight over its location.", "A forwarding rule created or modified by an attacker silently copies all mail elsewhere."],
    v: "Create a rule moving mail from a sender to a folder, deliver a matching message with the client closed, and confirm it is already in the folder on the server when the client next opens.",
    dep: ["message-database", "imap-client", "labels-and-folders"]
  },
  "spam-handling": {
    s: "Moves suspected junk aside and learns from the user's corrections, using server verdicts, local filtering or both, while keeping false positives recoverable.",
    d: "Servers usually score messages on delivery and file them in a junk folder or mark them with headers. The client may add a local filter trained on messages the user marks as spam or not spam. Reports can go back to the provider. Junk is kept for a limited time and shown with a reason. It is hard because a false positive hides a message the user needs, because training data is personal, and because spammers adapt to the filter.",
    k: ["Rely on the server's filter vs run a local one: the server sees more traffic and signals, a local filter learns personal patterns and costs battery and storage.", "Delete junk automatically vs retention period: automatic deletion saves space, retention allows recovery from false positives."],
    p: ["A legitimate message in the junk folder goes unseen because notifications are off for it.", "Marking a mailing list as spam instead of unsubscribing trains the filter against mail the user wants."],
    v: "Mark a message as not spam, confirm it moves to the inbox on the server and similar future mail from the sender is no longer filed in junk; confirm junk older than the retention period is purged.",
    dep: ["message-flags", "labels-and-folders", "imap-client"]
  },
  "search-index": {
    s: "A local full-text index over headers and bodies that returns ranked results in milliseconds across years of mail, kept in step with sync.",
    d: "Documents are messages with fields for sender, recipients, subject, body text and attachment names, tokenized with language-aware rules and stored in an inverted index. Updates arrive as messages are added, changed or deleted by sync. Queries combine terms with field filters, dates and flags. Ranking weighs recency, field and term frequency. Messages not downloaded can be searched only if headers are indexed or the server is asked. It is hard because indexing competes with sync for battery and disk and because index and cache can disagree.",
    k: ["Local index only vs also ask the server: local is instant and offline, server search covers messages never downloaded but is slow and varies by provider.", "Index body text fully vs headers and snippets: full is complete and large, partial is small and misses words in the middle."],
    p: ["An index not updated on delete returns messages that no longer exist, and opening them errors.", "Rebuilding the index after a schema change takes hours in a large mailbox and the app searches nothing meanwhile."],
    v: "Search for a rare word known to be in one message among 300,000 and confirm it returns within 100 ms, that deleting the message on another device removes it from results after sync, and that results match a scan of the cache.",
    dep: ["message-database", "body-store", "plain-text-converter"]
  },
  "query-parser": {
    s: "Turns what the user types into a structured query: terms, quoted phrases, field filters, date ranges and flags, with forgiving handling of typos and partial input.",
    d: "The parser recognizes operators such as from, to, has attachment, before and after, resolves relative dates, and treats the rest as free text. It compiles to a query for the local index and, when needed, the server's own search syntax. Suggestions can complete names and folders as the user types. It is hard because users type natural language and a strict grammar fails them, because server syntaxes differ, and because the same text must produce the same results locally and remotely.",
    k: ["Strict operator syntax vs natural-language guessing: strict is predictable and teachable, guessing is friendlier and surprises.", "One query language translated to each server vs passing text through: translation gives consistent behavior but loses features, passthrough exposes each server's quirks."],
    p: ["A relative date such as 'last week' resolved in the wrong time zone includes or excludes the edge days.", "Operators with unmatched quotes cause the whole query to fail instead of degrading to plain terms."],
    v: "Run the query 'from:alex has:attachment after:2026-01-01' and confirm results match a manual filter of the cache; run it with an unmatched quote and confirm it still returns something sensible.",
    dep: ["search-index", "saved-searches"]
  },
  "snooze-reminders": {
    s: "Hides a message until a chosen time and then returns it to the inbox, and reminds the user if a sent message gets no reply.",
    d: "Snoozing records a wake time against the message and moves it out of the inbox view or into a hidden folder. At the time it reappears, often flagged unread, and a notification may fire. Follow-up reminders watch a sent thread and trigger when no reply arrives by a date. State is stored locally and sometimes on the server so every device agrees. It is hard because reappearance depends on the app or the device being awake and because server-side support varies.",
    k: ["Store snooze state on the server vs locally: server state is consistent across devices and may not exist for the provider, local state works everywhere and diverges.", "Move the message to a hidden folder vs hide via a local flag: moving is visible to other clients and survives reinstall, a flag is invisible and lost with local data."],
    p: ["A snoozed message on a device that was off at wake time resurfaces hours late or never.", "Snooze state kept only locally is lost on reinstall, so the message vanishes forever."],
    v: "Snooze a message for two minutes, close the client and confirm that when reopened after the time the message is back in the inbox on both the device and a second client.",
    dep: ["message-flags", "labels-and-folders", "wake-scheduling"]
  },
  "message-flags": {
    s: "The per-message state — read, flagged, answered, forwarded, draft, deleted — and how local changes and server changes to it are tracked.",
    d: "Standard flags are small booleans stored with each message locally and on the server, along with optional user keywords. Changes made on the device are queued and sent as flag updates; changes made elsewhere arrive during sync. Marking read is the most frequent write. Flags drive counts, notifications and rules. It is hard because the same flag can be changed on two devices, because some servers keep no custom keywords, and because answered and forwarded flags need setting at the right moment of sending.",
    k: ["Set flags locally and push later vs wait for the server: local feels instant and handles offline, waiting is accurate and unresponsive.", "Store flags as individual columns vs a bitmask: columns are readable and filterable, a bitmask is compact and faster to update in bulk."],
    p: ["Marking read locally and failing to push leaves the message unread on every other device.", "Flagging 'answered' at compose instead of at successful send marks mail answered when the reply failed."],
    v: "Mark a message read offline, reconnect, and confirm the server shows it read; toggle the flag on a second device and confirm the first updates on next sync.",
    dep: ["message-database", "offline-queue"]
  },
  "saved-searches": {
    s: "Named queries shown as virtual folders, such as unread mail, flagged mail or mail from a team, which update as new mail arrives.",
    d: "A saved search stores the parsed query, an optional scope of accounts and a display name. It evaluates against the local database whenever its results are needed and subscribes to changes so counts update. Some are server-defined and synced, others local only. Built-ins like unread or starred use the same mechanism. It is hard because count queries must be cheap on huge mailboxes, because local and server versions differ, and because the meaning of a saved search depends on index freshness.",
    k: ["Evaluate live on demand vs maintain materialized results: live is always right and costs time on large mailboxes, materialized is fast and needs careful invalidation.", "Sync saved searches to the server vs keep them local: synced searches follow the user, but need provider support and a syntax that every client understands."],
    p: ["Counts for a heavy saved search computed on every change make the interface stutter.", "A saved search referencing a deleted folder shows empty with no hint why."],
    v: "Create a search for unread mail from a sender, deliver a matching message and confirm the virtual folder count increments immediately without a manual refresh.",
    dep: ["query-parser", "search-index", "message-database"]
  },
  "archive-retention": {
    s: "Moves mail out of the inbox into long-term storage and enforces age or size limits, locally and on the server, including legal or organizational holds.",
    d: "Archiving moves a message to an archive folder or removes the inbox label. Retention policies delete or move mail by age, applied by the server for organizational mail and by the client for local cache. Holds prevent deletion regardless of other rules. Exporting or backing up a mailbox in a portable format is part of this layer. It is hard because policies may be set by administrators and conflict with user actions, and because deletion is permanent.",
    k: ["Archive as a separate folder vs as the absence of an inbox label: a folder is portable and visible, label-removal is cheaper but invisible in other clients.", "Client-enforced vs server-enforced retention: server rules apply regardless of device, client rules are flexible and are skipped when the app is closed."],
    p: ["A retention rule applied to the wrong folder removes mail the organization is required to keep.", "Archiving to a folder name that does not exist on the server creates a local-only location that vanishes on resync."],
    v: "Archive a message, confirm it leaves the inbox on all devices and is in the archive on the server; set a 30-day rule on a test folder and confirm older test messages are removed while a held one is kept.",
    dep: ["labels-and-folders", "message-flags", "imap-client"]
  },
  "push-registration": {
    s: "Registers the device with a platform push service and with the mail provider so new mail triggers a wake-up without the app holding a connection.",
    d: "The client obtains a device token from the platform, sends it with the account identity to the provider or a relay, and renews it when it changes or expires. On new mail the server sends a small signal; the platform wakes the app, which then syncs. Content is not trusted to the push payload alone. It is hard because tokens change, because relays are third parties, because registrations must be removed when an account is deleted, and because push is unreliable and cannot be the only path.",
    k: ["Direct provider push vs a relay: direct reveals less to third parties but needs per-provider support, a relay works with any server and sees metadata.", "Silent wake-up then sync vs full content in the payload: silent keeps content off the push network, and costs extra delay and a network round trip."],
    p: ["A stale token after reinstall leaves mail arriving only when the app is opened, with no error shown.", "Leaving registrations behind after account removal sends notifications about a deleted account."],
    v: "Send a message to the account with the app closed and the device idle and confirm a notification arrives within seconds; remove the account and confirm the server no longer pushes to the device.",
    dep: ["account-manager", "credential-store", "network-awareness"]
  },
  "idle-connections": {
    s: "Keeps long-lived connections open so the server can announce new mail immediately, using the mail protocol's idle mode on desktops and where background connections are allowed.",
    d: "The client opens a connection to the server, selects a folder and enters a waiting state where the server sends notifications of changes. Firewalls and mobile networks drop quiet connections, so the client refreshes it periodically and reconnects on failure with backoff. One connection per watched folder, or one for the inbox plus periodic polling for others, is typical. It is hard because each connection costs battery and a server slot, and because silently dead connections look alive.",
    k: ["One persistent connection per folder vs inbox only plus polling: per-folder is current everywhere and heavy, inbox-only is light and late elsewhere.", "Long keepalive intervals vs short: long saves battery and loses connections to middleboxes, short keeps them alive and costs more."],
    p: ["A connection silently dropped by a network device stays 'open' on the client, so no new mail arrives for hours.", "Hundreds of accounts each holding several connections exhaust server connection limits."],
    v: "With the app open on an idle network, deliver a message and confirm it appears within seconds; block the connection silently at the network and confirm the client detects it and recovers within the keepalive interval.",
    dep: ["imap-client", "connection-pool", "retry-backoff"]
  },
  "background-fetch": {
    s: "Periodically wakes the app, within platform limits, to poll for new mail and keep the cache current when push is unavailable or unreliable.",
    d: "The platform grants short background execution windows at times it chooses based on battery, usage and network. In each window the client syncs the most important folders, updates counts and optionally prefetches bodies, and must finish within the allowed time. Combined with push, it repairs missed signals. It is hard because the platform gives no guarantee of when or how long, because aborting mid-sync must leave consistent state, and because aggressive use gets the app throttled.",
    k: ["Short narrow sync in the window vs full sync: narrow always completes and leaves work for later, full is thorough and risks being killed halfway.", "Poll on a fixed schedule vs adaptive: fixed is predictable, adaptive follows how often mail arrives and how the user reads."],
    p: ["Exceeding the window gets the app terminated mid-write and the next launch recovers from half-applied changes.", "Polling too eagerly makes the platform deprioritize the app so even push-triggered wakes are delayed."],
    v: "Leave the app in the background overnight with no push, and confirm the cache holds mail from each window with no corrupted state; confirm the inbox opens instantly with all of it.",
    dep: ["sync-scheduler", "wake-scheduling", "incremental-sync"]
  },
  "notification-rules": {
    s: "Decides which new messages interrupt the user: by account, folder, sender, label, importance and time of day, with quiet hours and per-conversation muting.",
    d: "After sync identifies a new message, the rules evaluate it against the user's settings and any importance signal such as known contact, direct recipient or flagged thread. The result is none, silent badge, quiet entry or a sound. Muting a conversation or sender suppresses it. Rules run locally so they work for push-triggered syncs. It is hard because notifying for everything trains people to disable notifications, and importance signals are guesses.",
    k: ["Notify for everything in the inbox vs only important mail: everything is simple and noisy, important-only reduces interruptions and risks silently missing a message.", "Local evaluation vs server-side decision: local can use the contact list and rules, server-side avoids waking the device at all."],
    p: ["A mailing-list reply flagged as important wakes the user at night.", "Importance heuristics that treat all mail from new senders as unimportant hide the first message from a new client."],
    v: "Set quiet hours and mute one thread, deliver mail to the muted thread and a new one from a contact during quiet hours, and confirm neither makes a sound while both appear in the list.",
    dep: ["message-database", "address-book", "labels-and-folders"]
  },
  "badge-counts": {
    s: "The unread number on the app icon, tabs and folder entries, kept consistent with the actual state across accounts and devices.",
    d: "The count is derived from the local database by a defined rule: unread in the inbox, across all accounts, or only notified messages. It updates when flags change locally, on sync, and when the app is not running via push payloads that carry an increment or the full number. It is hard because the app icon number must be right when the app is closed, because multiple devices each compute their own, and because definitions differ between what users expect and what servers report.",
    k: ["Count from local state vs trust the server's number: local is instant and offline-safe, server numbers are authoritative and lag.", "Update the badge from the push payload vs only after sync: payload updates are immediate and can drift, sync-based are accurate and late."],
    p: ["Reading a message on another device leaves the first device's badge stuck at the old number.", "Counting junk or archived mail inflates the badge so users stop trusting it."],
    v: "Receive three messages, read one on another device, and confirm the app icon badge shows two within one sync cycle on the first device, even with the app closed.",
    dep: ["message-database", "push-registration", "message-flags"]
  },
  "notification-dedup": {
    s: "Prevents repeated alerts for the same message across devices, across push and sync paths, and across accounts that deliver duplicates.",
    d: "A notification is keyed by account and message identity. Before showing one, the client checks whether it was already shown, read, or dismissed on this device, and clears it when the message is read elsewhere. Several paths can announce the same message: a push, a persistent connection and a background poll. It is hard because message identifiers differ between paths, because dismissal on one device should clear others when possible, and because duplicates of the same mail in two accounts look like distinct messages.",
    k: ["Dedup by message identifier vs by content hash: identifiers are exact when stable, hashes catch the same mail delivered twice at the cost of merging distinct identical mail.", "Remote-clear notifications read elsewhere vs leave them: clearing keeps the tray accurate, leaving avoids silent push traffic."],
    p: ["Notification triggered by both a push and a poll shows twice for the same message.", "A notification stays on the lock screen after the message was read on a laptop."],
    v: "Deliver a message while both the push path and a background poll are active and confirm exactly one notification appears; read it on another device and confirm it is removed from the first.",
    dep: ["notification-rules", "local-id-mapping", "message-flags"]
  },
  "wake-scheduling": {
    s: "Coordinates when the client wakes the device and radio, grouping sync, sends and retries into few, short windows to save battery.",
    d: "Rather than each task waking the device on its own timer, the scheduler batches work and asks the platform for execution at allowed times, honoring power saver mode, data saver and network type. Urgent work such as a user-triggered send runs immediately, background polling and prefetch wait for good conditions such as charging and unmetered networks. It is hard because the platform's constraints change by version, and the requirements of timeliness and battery directly conflict.",
    k: ["Batch work into windows vs run tasks as they arise: batching saves battery and delays low-priority work, immediate is responsive and costly.", "Respect data saver and battery saver strictly vs override for mail: respecting is polite and misses mail, overriding gets mail and angers users."],
    p: ["Each feature registering its own timers wakes the device constantly and the app appears at the top of battery usage.", "Prefetching large attachments on cellular data exhausts a user's plan."],
    v: "Measure battery drain over 24 hours on an idle device with a typical mailbox, and confirm the radio wakes only in batched windows and the app's share of power stays under the target set for it.",
    dep: ["network-awareness", "sync-scheduler"]
  },
  "notification-actions": {
    s: "Buttons and quick replies within a notification, such as archive, delete or reply, that act on a message without opening the app.",
    d: "Each notification carries action identifiers. Tapping one launches a short background task that applies the change to the local store, queues the server update, and removes the notification. Quick reply collects a short text and queues a send. The actions must work when the app is not running and must handle messages that no longer exist. It is hard because background time is short, because the action needs credentials and a consistent store, and because accidental taps on delete must be undoable.",
    k: ["Queue the action for later vs execute and wait for confirmation: queuing is instant and resilient, waiting is accurate and may be killed by the platform.", "Offer destructive actions on notifications vs only safe ones: destructive saves time but makes accidental loss easy."],
    p: ["A notification action on a message already deleted elsewhere errors silently and leaves the notification.", "Quick reply sends with the wrong identity because no compose context was loaded."],
    v: "Trigger an archive action from a notification with the app closed, and confirm the message is archived locally immediately, on the server after sync, and the notification clears.",
    dep: ["offline-queue", "message-flags", "outbox-queue"]
  },
  "message-database": {
    s: "The local structured store of message metadata, folders, threads, flags and relationships, queried by every view and by the sync engine.",
    d: "An embedded transactional database holds one row per message with indexed fields: account, folder, sync identifiers, dates, sender, subject, flags, thread, size and storage references. Writes arrive in batches from sync and from local actions inside transactions; reads come from many views at once. Change notifications drive the interface. It is hard because mailboxes have millions of rows, because the schema must evolve across versions without losing data, and because corruption or a crash mid-write must not lose the cache.",
    k: ["One database for all accounts vs one per account: one makes unified views and search simple, per-account isolates removal and failures.", "Normalized schema vs denormalized summary rows: normalized stays consistent and joins slowly, denormalized makes list queries fast and must be kept in step."],
    p: ["A long write transaction during initial sync blocks the interface's reads and the list freezes.", "Storing the folder hierarchy by name instead of identifier breaks when a folder is renamed."],
    v: "Insert one million messages, confirm common list and count queries return in tens of milliseconds, kill the process mid-sync, and confirm it reopens consistent with no corruption.",
    dep: ["schema-migrations", "local-id-mapping"]
  },
  "body-store": {
    s: "Stores message bodies and raw sources on disk separately from metadata, with a policy for which are kept in full and which are fetched on demand.",
    d: "Bodies are large and read infrequently relative to metadata, so they live in files or a blob store referenced by the database. The store can hold the raw source, decoded text, or both. Policy decides how much to keep per folder and age: a recent window in full, older mail as headers only. Reading an absent body triggers a fetch. It is hard because storage is limited on phones, because partial bodies must be tracked, and because file system errors must not leave dangling references.",
    k: ["Store raw source vs only decoded content: raw preserves signatures and allows re-parsing, decoded saves space and processing at read time.", "Keep a recent window fully offline vs everything: a window controls space and offline use is limited to it, everything is complete and may fill the device."],
    p: ["Deleting body files without clearing database references leaves messages that appear downloaded and open blank.", "Storing every body forever on a phone fills storage and the OS evicts the whole app cache."],
    v: "Set the offline window to 30 days, sync, switch to airplane mode and confirm messages within the window open fully and older ones show a clear 'not downloaded' state.",
    dep: ["message-database", "cache-eviction"]
  },
  "header-cache": {
    s: "A compact copy of the fields needed to draw lists and group threads — addresses, dates, subject, references and preview — kept for every message even when bodies are not.",
    d: "During sync the client fetches envelope data and selected headers for all messages, storing them in normalized form: parsed addresses, decoded subject, date in a comparable form, size, flags and the reference headers for threading. Previews are added when bodies arrive. This lets lists, sorting, grouping and header search work offline for the whole mailbox. It is hard because decoding must happen once at sync rather than per scroll, and because headers from the server can be malformed or inconsistent between protocol views.",
    k: ["Store decoded fields vs raw header text: decoded makes lists fast and loses the original for diagnostics, raw is faithful and costs decoding on every read.", "Fetch all headers for all folders vs only recent: all supports complete search and sorting, recent saves time and space on large archives."],
    p: ["Date parsing at display time with inconsistent rules sorts messages in a different order than the server.", "Missing references in cached headers split threads that the server had grouped."],
    v: "Sync a 100,000-message folder, go offline, sort by sender and by date, and confirm lists draw in under a second with correct names and sort order.",
    dep: ["message-database", "charset-decoder"]
  },
  "attachment-cache": {
    s: "Holds downloaded attachment files and temporary copies with their own size limit and cleanup, separate from message bodies.",
    d: "Attachments fetched for viewing or saving go to a cache keyed by message and part. The cache has a size ceiling and removes least recently used files, unlike bodies that follow the sync window. Files opened with an external application are copied to a temporary location that is removed on exit or after a delay. Some clients let users pin attachments for offline. It is hard because the platform may delete cache files at will and because large files must be fetched in the background with resume.",
    k: ["Separate cache with a size limit vs sharing the body store: separate lets large files be evicted without losing mail, sharing is simple and mixes lifetimes.", "Encrypt cached attachments vs store plain: encryption protects against device loss and costs CPU, plain is simpler and exposed."],
    p: ["Temporary copies left in a shared folder expose sensitive attachments to other applications and users.", "A cache entry for a half-downloaded file is later opened as if complete and shows corruption."],
    v: "Open a 50 MB attachment, confirm it is cached, fill the cache past its limit with others and confirm the least recently used goes first; interrupt a download and confirm it resumes without corruption.",
    dep: ["body-store", "partial-fetch", "encryption-at-rest"]
  },
  "offline-queue": {
    s: "A durable list of changes made locally — flag changes, moves, deletes, drafts — waiting to be sent to the server, applied in order when a connection is available.",
    d: "Each user action updates the local store at once and writes a queue entry describing the server-side operation with the identifiers it needs. A worker replays entries when online, retries temporary failures, drops entries made moot by later ones (flag then unflag) and reports permanent failures. Entries touching messages not yet on the server wait for the identifiers the server assigns. It is hard because the queue must survive crashes, preserve ordering, and reconcile with changes made elsewhere while offline.",
    k: ["Optimistic local update with a replay queue vs blocking on the server: optimistic is instant and needs rollback logic, blocking is simple and unusable offline.", "Coalesce redundant queue entries vs replay each: coalescing saves traffic and complicates ordering, replaying everything is simple and slow."],
    p: ["A move queued for a message that another device already deleted fails permanently and retries forever.", "Crash between applying locally and writing the queue entry loses the change on the server while the device shows it done."],
    v: "Go offline, archive ten messages and mark five read, kill the app, reconnect and confirm all fifteen changes appear on the server exactly once, in order.",
    dep: ["message-database", "imap-client", "retry-backoff"]
  },
  "cache-eviction": {
    s: "Chooses what to delete from the local cache when storage is short: old bodies, attachments, rendered previews, while never deleting unsent work.",
    d: "Eviction ranks content by age, size, last access, whether the message is flagged or starred and whether it exists on the server. Content that cannot be re-fetched, such as unsent drafts or pending operations, is never evicted. The headers and index stay so mail remains listed and searchable, and bodies are re-fetched on demand. Triggers include a size limit, low device storage and an explicit action. It is hard because eviction must not remove content during sync or viewing, and because users expect offline mail to remain.",
    k: ["Evict by least recent access vs by age: access follows use, age is predictable and may delete the mail being referenced.", "Keep starred and recent items pinned vs pure ranking: pinning protects what matters, and can fill the cache with an unreasonable set."],
    p: ["Evicting a body while it is opened produces a blank pane or crash.", "Evicting content whose server copy was deleted loses the only copy of the message."],
    v: "Fill the cache to its limit, trigger eviction and confirm older unflagged bodies are removed, headers remain searchable, drafts and queued operations are untouched, and an evicted message re-downloads on opening.",
    dep: ["body-store", "attachment-cache", "message-database"]
  },
  "schema-migrations": {
    s: "Versioned changes to the local database structure, applied on upgrade without losing the cache or the user's unsent work, with a fallback to a clean resync.",
    d: "Each app version has a schema number. On startup the migrator applies ordered steps in a transaction: add columns, rebuild indexes, transform data. Where a change is too costly or risky, it drops the derived cache and resyncs from the server, preserving local-only data such as drafts, outbox entries and settings. Downgrades are usually unsupported. It is hard because mailboxes are large, so a migration can take minutes, and because failing in the middle must be recoverable.",
    k: ["Migrate in place vs wipe and resync: in place keeps offline data and takes time and risk, resync is simple and costs bandwidth and an empty period.", "Run migration at startup vs lazily in the background: startup is simple and blocks launch, background keeps the app available and complicates code with old and new shapes."],
    p: ["A migration interrupted by the platform killing the app leaves a half-changed schema that the next launch cannot open.", "Wipe-and-resync that also drops the outbox loses unsent mail."],
    v: "Upgrade a copy of a large real mailbox database through every version in order, confirm counts, flags and drafts are identical before and after, and that killing mid-migration then relaunching completes cleanly.",
    dep: []
  },
  "encryption-at-rest": {
    s: "Protects the local cache of mail, attachments and credentials on disk against device loss, using keys held in the platform's secure store.",
    d: "The database and files are either stored on an encrypted volume managed by the platform, or encrypted by the app with a key derived from a device-bound secret or a user passcode. Credentials and tokens always use the platform's secure storage. Search indexes and previews fall under the same protection. It is hard because encrypted databases cost speed, because backups and device migration must not copy plaintext or lose the key, and because background syncs while the device is locked need the key available.",
    k: ["Rely on the platform's file protection vs encrypt in the app: platform protection is free and varies by device, app encryption is uniform and adds cost and key management.", "Key available only after unlock vs after first unlock: stricter blocks background sync while locked, looser lets sync run and widens the exposure."],
    p: ["Plaintext previews or search indexes stored outside the encrypted area expose mail from a lost device.", "Restoring a backup to a new device without the key leaves an unreadable database and no resync."],
    v: "Image the storage of a locked device and search it for known message text and a known password; no plaintext is found, and after unlock the app opens the mailbox normally.",
    dep: ["credential-store", "message-database", "body-store"]
  },
  "local-id-mapping": {
    s: "Maps stable client-side identifiers to the server's changing identifiers for messages and folders, so references survive moves, resets and resyncs.",
    d: "Servers identify messages by numbers that are unique only within a folder and valid only while the folder's reset counter is unchanged; moving a message creates a new identifier. The client assigns its own durable identifier and keeps a mapping to current server ones, with other identifiers such as message-id headers for matching. Threads, notifications, drafts and operations refer to the local identifier. It is hard because mapping must be rebuilt after a reset and a moved message must not look like a delete plus a new message.",
    k: ["Local identifiers with a mapping table vs using server identifiers directly: local keep references stable across moves and resets at the cost of a mapping to maintain.", "Match moved messages by header identifiers vs treat as new: matching preserves state such as flags and notes, but headers can be missing or duplicated."],
    p: ["Using server numbers as keys after a folder reset points existing references at different messages.", "Treating a move as delete plus add loses flags, labels and the thread position."],
    v: "Move a message between folders on another device, sync, and confirm the local record keeps its local identifier, flags and thread, and no duplicate or deleted entry appears.",
    dep: ["message-database", "uid-validity"]
  }
});
