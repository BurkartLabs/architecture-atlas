// Details for the email client plate, part 1: interface, composing, contacts.
ATLAS.details("email-client", {
  "folder-tree": {
    s: "The navigable list of mailboxes, folders and labels for each account, with unread counts, special folders such as inbox, sent and trash, and user-created hierarchy.",
    d: "The tree is built from the local folder table, not from live server queries. Special-use folders are identified by server-declared attributes first, then by localized name guesses. Counts come from the local database and update as sync changes flags. Folders can be subscribed or hidden, collapsed, and reordered. It is hard because servers disagree: some allow nested folders with different separators, some expose labels as folders, and counts for huge folders must be cheap to maintain incrementally.",
    k: ["Counts from local aggregates vs asking the server: instant and offline-safe, but they drift when sync is behind.", "Folders and labels shown as one tree vs separate concepts: simple to learn, but a message that carries three labels appears in three places and the tree misleads about where it lives."],
    p: ["Guessing the sent or trash folder from its name picks the wrong one for a user with a localized server, so deletes go to the wrong place.", "Recomputing counts by scanning the folder on every change stalls the interface in large mailboxes."],
    v: "Mark one message read on a second device, sync, and confirm the unread count on the folder drops by exactly one without a full refresh. Rename a folder on the server and see it renamed locally.",
    dep: ["message-database", "folder-discovery", "labels-and-folders"]
  },
  "message-list": {
    s: "A virtualized, sortable list of message summaries (sender, subject, snippet, date, flags) that stays smooth over hundreds of thousands of rows by reading only visible rows from the local cache.",
    d: "Only the rows near the viewport are materialized. Each row reads a precomputed summary from the metadata database, with a snippet and a thread count when grouped. Sorting and filtering run as indexed queries. Selection state, focus and scroll position survive refreshes because rows have stable identities. Updates from sync arrive as change notifications and patch the visible window instead of reloading it. Hard problems are keeping scroll position steady when new mail inserts above, and rendering sender names, dates and snippets quickly in many scripts.",
    k: ["Query-driven list vs in-memory array: a query scales to any mailbox size but needs change notifications to stay current; an array is simpler and breaks at scale.", "Snippets stored at sync time vs computed on display: storing costs space and body parsing during sync, computing makes scrolling slow."],
    p: ["Inserting new mail above the viewport jumps the list and moves the message the user was about to tap.", "Loading full bodies for every row to build snippets makes first scroll after sync take seconds."],
    v: "Open a mailbox of 200,000 messages, drag the scrollbar from top to bottom, and confirm frames stay smooth and memory stays flat. Receive a message while scrolled partway and confirm the view does not move.",
    dep: ["message-database", "header-cache", "message-flags"]
  },
  "conversation-view": {
    s: "Shows a thread as one ordered conversation, collapsing quoted history and already-read messages, so replies are read in context instead of as separate items.",
    d: "The view takes the thread produced by the threading engine and lays out each message as a card, expanding unread ones and collapsing the rest. Quoted text from earlier messages is detected and folded, which depends on recognizing reply markers across languages and clients. Each card renders in its own safe renderer instance. Actions apply per message or to the whole thread. It is hard because one thread can mix many senders, formats and security states, and loading dozens of rendered bodies must not freeze the interface.",
    k: ["Render all expanded cards at once vs lazily as they scroll into view: eager is simpler to search and print, lazy keeps long threads responsive but complicates find-in-page.", "Collapsing quoted text by heuristic vs keeping everything: folding saves reading time, but wrong guesses hide new text typed inside a quote."],
    p: ["Quote detection that folds a reply written inline within quoted text hides the answer the reader wanted.", "A thread built from loose subject matching merges two unrelated conversations into one view."],
    v: "Open a 40-message thread with mixed plain and HTML replies and confirm quoted history is folded, the newest unread message is expanded, and opening it takes under a second.",
    dep: ["threading-engine", "sandboxed-renderer", "body-store"]
  },
  "reading-pane": {
    s: "The area where one message is displayed: headers, rendered body, attachment strip and action bar, together with the state that decides what is blocked and what is trusted.",
    d: "Selecting a message loads headers from the cache and requests the body. If the body is not local it is fetched on demand and a placeholder shows. The body passes through decoding, sanitizing and the sandboxed renderer. The pane shows the sender's verified identity, any blocked remote content banner, and attachments. It marks the message read after a delay or on action. The difficulty is latency and safety together: display should feel immediate, yet nothing is shown before it has been made safe.",
    k: ["Mark read on selection vs after a dwell time: immediate marking is simple, while a delay avoids marking mail read as the user arrows past it.", "Pre-fetching bodies of nearby messages vs fetching on selection: prefetch feels instant but spends data and battery on mail never read."],
    p: ["Showing the unsanitized preview text before the safe render completes lets a crafted message flash active content.", "Marking read before the body actually loaded leaves the user with a read message they never saw."],
    v: "Select a message not yet cached with the network on, confirm a placeholder appears then the sanitized body, and with the network off confirm a clear offline notice instead of an empty pane.",
    dep: ["html-sanitizer", "sandboxed-renderer", "sender-authentication", "partial-fetch"]
  },
  "unified-inbox": {
    s: "A merged view that combines the inboxes of every configured account into one list, sorted together, while still tracking which account each message belongs to.",
    d: "The view is a query over the local database across accounts, filtered to each account's inbox folder. Replies and actions are routed back to the owning account and its default sending identity. Counts sum across accounts. It is hard because the accounts have different capabilities: one may have labels, another folders, another no server-side flags. Operations like archive must map to each account's own semantics. Performance must not degrade when one account has far more mail than the others.",
    k: ["A real merged query vs a view built by combining per-account lists: a query sorts and pages correctly, merging in memory is easier but breaks paging.", "Unified actions mapped to least common behavior vs full per-account behavior: uniform interface, but features such as labels disappear in the merged view."],
    p: ["Replying from the unified view with the wrong default identity sends mail from an address the recipient did not write to.", "One slow or failing account stalls or empties the merged list if the query waits on every source."],
    v: "Configure two accounts, receive one message in each, and confirm both appear in date order in the unified list; reply to each and confirm the sent mail leaves from the matching account.",
    dep: ["message-database", "account-manager", "identity-selector"]
  },
  "keyboard-shortcuts": {
    s: "Key bindings for reading, moving, archiving, replying and searching, usually configurable and often modeled on other clients so power users can process mail without a pointer.",
    d: "A binding table maps key sequences to named commands, with contexts such as list, reading pane and compose. Single-key shortcuts only work when no text field has focus. Chords and vim-style sequences need a timeout state machine. Commands are the same ones the menus and toolbar invoke, so there is one implementation per action. It is hard because keyboard layouts differ, shortcuts conflict with platform and assistive-technology keys, and a single-key delete or send must be reversible.",
    k: ["Single-key shortcuts vs modifier combinations: single keys are fast for triage but collide with typing; modifiers are safe but slower.", "Fixed bindings vs fully remappable: fixed is easier to document and support, remappable serves each user but makes help text and screenshots wrong."],
    p: ["A shortcut that fires while focus is in a text field deletes or sends a message while the user is typing.", "Bindings defined by key position rather than character break on non-US keyboard layouts."],
    v: "Press the archive key with focus in the list and confirm the message moves; press the same key while typing in the search box and confirm it types a character and no message moves.",
    dep: ["message-list", "bulk-selection"]
  },
  "bulk-selection": {
    s: "Selecting many messages or whole threads, including select-all across a folder larger than what is loaded, and applying move, label, delete or flag actions to the set.",
    d: "Selection is a set of identifiers or a query-defined range such as everything matching a search. Actions are enqueued as operations against the local store immediately and sent to the server in batches. Select-all across a large folder must act on the query, not on the loaded rows, and the interface has to say how many messages that is. It is hard because a range selection can change while an action runs, because servers limit batch size, and because a mistake on thousands of messages must be undoable.",
    k: ["Selecting identifiers vs selecting a query: identifiers are exact but cannot cover unloaded messages; a query covers everything but can change underneath.", "Applying locally first vs waiting for the server: local-first feels instant, but failures must roll back visibly."],
    p: ["Select-all that only acts on the 50 loaded rows tells the user 'all done' while the rest of the folder is untouched.", "Deleting a large set with no undo and no count confirmation turns a misclick into lost mail."],
    v: "Select all in a folder of 5,000 messages, move them, and confirm the count shown matches, all 5,000 appear in the target on the server afterward, and an undo returns them.",
    dep: ["offline-queue", "message-flags", "labels-and-folders"]
  },
  "quick-actions": {
    s: "Touch gestures and hover controls, such as swipe to archive or snooze, that act on a message from the list without opening it.",
    d: "Gestures are bound to a user-chosen action set and map to the same commands as menus. The list row shows the action and its color while dragging, commits past a threshold, and offers a brief undo. Actions run against the local store first. It is hard because gestures conflict with system navigation, with scrolling and with accessibility switches, and because the meaning of 'archive' or 'delete' differs by account: some servers have no archive folder.",
    k: ["Destructive gesture with undo bar vs confirmation dialog: undo keeps the flow fast, but a lost undo window means permanent loss for non-trash actions.", "One gesture set for all accounts vs per-account: consistent muscle memory, but archive may mean move-to-folder on one account and remove-label on another."],
    p: ["A swipe near a screen edge triggers the system back gesture instead, or both, confusing the user about what happened.", "Archive on an account without an archive folder silently deletes."],
    v: "Swipe a message to archive, confirm it leaves the list and appears in the archive on the server, tap undo within the window and confirm it returns to the inbox.",
    dep: ["message-list", "labels-and-folders", "offline-queue"]
  },
  "accessibility-layer": {
    s: "Semantic structure, focus order, labels and announcements that let screen readers, switch controls, magnification and keyboard-only users read and write mail.",
    d: "The list, thread and compose views expose roles, states and relationships to the platform accessibility tree. Dynamic changes such as new mail or a sent message are announced politely rather than stealing focus. Message content is the hard part: sanitized HTML from strangers has no guarantee of headings, alt text or reading order, so the client adds structure where it can, offers a plain-text view, and respects text scaling and high contrast. Gestures need non-gesture equivalents.",
    k: ["Rendering message bodies with the platform's accessible text engine vs a custom surface: native is accessible by default, custom gives control over safety and layout but must rebuild accessibility.", "Announcing every new message vs summarizing: full announcements overwhelm during a burst, summaries lose detail."],
    p: ["Focus jumping to the top of the list after each sync interrupts a screen-reader user mid-sentence.", "Remote images with no alt text and blocked by default leave blind users with unlabeled placeholders."],
    v: "Using only a screen reader and keyboard, open the inbox, read a thread, reply and send. Every control is announced with a name and role, and focus never jumps unexpectedly.",
    dep: ["message-list", "reading-pane", "compose-window"]
  },
  "settings-ui": {
    s: "Preferences for accounts, display, notifications, signatures, privacy and advanced behavior, with defaults safe for most people and per-account overrides.",
    d: "Settings are stored locally, some synced across devices, and read by the components they control. Each has a default, a scope (global or account) and sometimes a policy override set by an organization that locks it. Changes must apply without restart where possible. The challenge is the settings that carry security meaning: loading remote images, link handling and certificate exceptions are easy to make convenient and dangerous, so their defaults and wording matter.",
    k: ["Few options with good defaults vs many options: fewer is easier to support and secure, more satisfies expert users but multiplies untested combinations.", "Synced settings vs per-device: sync keeps behavior consistent, but a setting right for a laptop (notify on every mail) is wrong for a phone."],
    p: ["A global 'always load images' toggle with no per-sender scope undoes tracking protection for everyone.", "Managed policy overrides that silently ignore the user's change leave them thinking the setting is broken."],
    v: "Change a setting, relaunch, confirm it persisted; set a managed policy locking it and confirm the control shows as locked with a reason and the value cannot be altered.",
    dep: ["account-manager"]
  },
  "compose-window": {
    s: "The editing surface for new messages, replies and forwards: recipients, subject, body, attachments and send controls, coordinating drafts, validation and the actual submission.",
    d: "Opening compose creates a draft record seeded from context: reply headers, quoted text, signature and chosen identity. Fields edit that draft and autosave. On send the window validates recipients, builds the final message and hands it to the outbox rather than talking to the network itself, so it can close immediately. It is hard because a compose session can last hours, outlive the app, be opened on multiple devices and be interrupted by account changes, expired credentials or lost connectivity.",
    k: ["Hand off to the outbox vs send inline: handing off lets the window close and survives crashes, while inline sending can report errors immediately but blocks the user.", "Modal compose vs independent windows or tabs: modal is simple, independent supports referencing other mail while writing at the cost of state management."],
    p: ["Closing compose without clear draft state loses a long message when the user assumed it was saved.", "Replying while the original is deleted on another device leaves broken reply headers and a missing quote."],
    v: "Start a reply, kill the app mid-sentence, relaunch, and confirm the draft reopens with all text, recipients and attachments; send it and confirm the recipient sees correct threading headers.",
    dep: ["draft-autosave", "outbox-queue", "recipient-validation", "message-builder", "rich-text-editor"]
  },
  "rich-text-editor": {
    s: "An editing component that produces formatted body text, lists, links and inline images, and converts it into HTML and plain-text alternatives suitable for mail.",
    d: "The editor keeps a document model, renders it, and serializes to a restricted HTML subset that other clients display predictably, because mail HTML cannot assume modern CSS. It also generates a plain-text part. Pasting from web pages and word processors brings arbitrary styles that must be cleaned. It is hard because recipients' clients differ greatly, because replying inside a quoted message needs correct nesting, and because spell-check, undo and input methods for many languages must all work.",
    k: ["Restricted HTML output vs full HTML: restricted renders consistently across clients, full gives designers freedom that breaks in the recipient's viewer.", "Rich text default vs plain text default: rich is expected by most, plain is smaller, safer to quote and preferred by technical lists."],
    p: ["Pasting styled web content carries hidden elements and huge inline styles that bloat the message and break in other clients.", "Converting to plain text by stripping tags yields a text part that no longer matches the HTML meaning."],
    v: "Write a message with a list, a link and bold text, send it to two different viewers and a text-only reader, and confirm all three show equivalent content and structure.",
    dep: ["plain-text-converter", "html-sanitizer"]
  },
  "reply-quoting": {
    s: "Builds the quoted history for replies and forwards, with attribution lines, correct reply-to and reference headers, and the chosen posting style (above, below, inline).",
    d: "The reply starts from the original message's sanitized content, adds an attribution line with date and author, and prefixes or nests the quote. It sets recipients from reply-to, from and recipient lists, depending on reply or reply-all, and writes headers that reference the original so threads connect. Forwarding can inline the message or attach it whole. It is hard because the original may be HTML-only, huge, or contain content that should not travel, and because mailing lists add their own reply-to conventions.",
    k: ["Quote the sanitized rendered version vs the raw source: sanitized is safe and compact but drops fidelity, raw keeps everything including risky content.", "Reply-all by default vs reply: reply-all prevents dropped recipients, reply prevents accidental broadcast."],
    p: ["Quoting the original HTML verbatim re-inserts tracking pixels or hidden content into the outgoing message.", "Dropping the reference headers makes the reply start a new thread in other people's clients."],
    v: "Reply to a message in a thread and confirm the sent copy carries in-reply-to and reference headers naming the parent, and the recipient's client groups it in the same conversation.",
    dep: ["html-sanitizer", "threading-engine", "message-builder"]
  },
  "signature-manager": {
    s: "Stores signatures per identity, inserts them in the correct place for new messages and replies, and keeps them out of the quoted history.",
    d: "A signature is rich or plain text attached to an identity, with rules for new mail, replies and forwards. The compose window inserts it above or below the quote at the right position and marks it so changing identity swaps it. Images in signatures need to be embedded or referenced. It is hard because organizations manage signatures centrally, because HTML signatures render differently everywhere, and because a signature-delimiter convention matters for clients that strip it from replies.",
    k: ["Signature as a marked region in the draft vs appended at send time: a region lets the user see and edit it, appending avoids stale text but hides what will be sent.", "Embedded images vs remote links: embedded always show but inflate every message; remote ones are blocked by many recipients."],
    p: ["Switching identity leaves the old signature in place so mail from one role carries another's contact details.", "A large embedded logo repeated in every reply grows long threads by megabytes."],
    v: "Create two identities with different signatures, switch between them in a draft, and confirm exactly one signature is present at the right position and the sent message carries that one.",
    dep: ["identity-selector", "rich-text-editor"]
  },
  "identity-selector": {
    s: "Chooses which address, display name, signature and sending server a message uses, defaulting by reply context and allowing aliases per account.",
    d: "An identity binds an email address, display name, reply-to, signature and the account whose server will send it. Defaults come from the folder or recipient the original message was sent to, so a reply goes out from the address that was written to. Aliases may be discovered from the server or entered by hand. It is hard because servers may refuse to send as an address they do not own or rewrite the sender, and the visible from address must be consistent with what the authentication checks will see.",
    k: ["Auto-pick identity from the received address vs a fixed default: auto matches the sender's expectation, a default is predictable but replies from the wrong persona.", "Local-only aliases vs server-registered: local is easy to set up, server-registered is accepted by the provider and passes authentication."],
    p: ["Sending as an alias the server does not permit results in a silent rewrite or a bounce long after the user left.", "Replying from the account default exposes a private address to a contact who only knew the alias."],
    v: "Receive mail addressed to an alias, reply, and confirm the sent message's from address is the alias and the recipient's header analysis shows it passing sender checks.",
    dep: ["account-manager", "smtp-client"]
  },
  "draft-autosave": {
    s: "Continuously saves the in-progress message as a draft, locally and usually to the server, so work survives crashes, device switches and closed windows.",
    d: "Changes are debounced, written to the local store immediately and uploaded to the drafts folder on the server on a slower cadence. Server drafts are replaced rather than edited, because most protocols cannot modify a stored message in place; the old one is deleted after the new one is stored. Editing the same draft on two devices raises conflicts. It is hard because uploading every few seconds generates traffic and server churn, and because a failed delete leaves duplicate drafts.",
    k: ["Local save on each change with periodic server upload vs server-only save: local never loses text offline, server-only avoids divergence but fails without connectivity.", "Replace the stored draft vs keep revisions: replacing keeps the folder clean, revisions allow recovery at the cost of clutter."],
    p: ["Upload then delete without atomicity leaves several stale copies of one draft visible on other devices.", "A draft open on two devices silently overwrites the other's edits."],
    v: "Type in compose, disable the network, force-quit, relaunch and confirm the text returned; reconnect and confirm exactly one draft exists in the server's drafts folder.",
    dep: ["message-database", "offline-queue", "imap-client"]
  },
  "outbox-queue": {
    s: "A durable queue of messages waiting to send, with their state, retry schedule and error status, separate from drafts and sent mail.",
    d: "Sending moves a complete built message into the outbox with a state: waiting, sending, failed or held. A worker submits it through the account's server when connected, then files a copy into the sent folder if the server does not do it, and removes the entry. Failures are classified as temporary (retry) or permanent (the server refused a recipient) and shown to the user. It is hard because a crash between submission and removal can send a message twice, and because rejected recipients may mean partial delivery.",
    k: ["Client files the sent copy vs relying on the server to: client control works everywhere but can duplicate on servers that also save, relying on the server avoids duplicates but is not universal.", "Retry automatically vs stop on first failure: retries survive flaky networks, but retrying a permanently refused message wastes effort and hides the error."],
    p: ["A crash after the server accepted the message but before the entry was cleared sends it again on restart.", "An undeliverable item stuck in the outbox with no visible error leaves the user thinking mail went out."],
    v: "Send with the network off, confirm the message shows in the outbox, restore the network and confirm it is delivered once, appears in sent exactly once and the outbox is empty.",
    dep: ["smtp-client", "message-database", "retry-backoff"]
  },
  "undo-send": {
    s: "Holds a message for a short, user-set delay after pressing send so it can be recalled before it leaves the device.",
    d: "The message is placed in the outbox in a held state for a few seconds, with a visible undo control. If the user undoes, it returns to compose as a draft; otherwise the hold expires and normal sending proceeds. The delay is purely local: once the server has accepted a message nothing can retrieve it. It is hard because the app can be closed during the hold, because the delay must not make the message look slow, and because users assume it is a recall feature that works afterward.",
    k: ["Client-side hold vs server-side recall: client-side is reliable and universal, server recall exists only within one provider and fails for external recipients.", "Short fixed delay vs configurable: fixed is simple, configurable fits more users but a long delay makes urgent mail late."],
    p: ["Quitting during the hold either drops the message or sends it immediately depending on an untested path.", "Users believe undo works after delivery, and the interface text does not correct that."],
    v: "Send, press undo inside the window and confirm nothing reaches the server and the draft reopens; send again with no undo and confirm delivery happens after the delay and not before.",
    dep: ["outbox-queue", "compose-window"]
  },
  "send-scheduling": {
    s: "Delays delivery to a chosen time, either by holding the message locally until then or by storing it on a server that supports scheduled submission.",
    d: "The user picks a time, often with time zone awareness for the recipient. If the client holds it, the device must be on and connected at that time, which a phone or sleeping laptop cannot promise. If the server holds it, the client submits with a future delivery time or stores it in a scheduled folder. It is hard because device clocks drift, daylight saving shifts local times, and a promise to send at 8:00 must survive a restart, a changed time zone and a revoked credential.",
    k: ["Server-held vs client-held schedule: server-held sends even if the device is off but depends on provider support, client-held works everywhere and fails when the device sleeps.", "Absolute instant vs local wall-clock time: instants are unambiguous, wall-clock matches intent across a daylight saving change."],
    p: ["A laptop asleep at the scheduled time sends the message hours later or not at all, with no notice to the user.", "Credentials expire before the send time and the message fails with no one watching."],
    v: "Schedule a message two minutes ahead, disconnect from the network for one minute and reconnect, and confirm it leaves at the scheduled time once; schedule another across a time zone change and confirm the instant is preserved.",
    dep: ["outbox-queue", "wake-scheduling"]
  },
  "recipient-validation": {
    s: "Checks addresses and warns about likely mistakes before sending: malformed addresses, missing attachments, external recipients, large reply-alls and lookalike domains.",
    d: "Addresses are parsed against the standard's address grammar, including display names and quoted local parts, and optionally checked for domain existence. Heuristics scan the body for words like 'attached' with no attachment, compare recipients to the original thread to spot additions, and flag recipients outside the user's organization. Warnings must be rare enough to be read. It is hard because the address grammar is permissive and real addresses are odd, and because a false warning teaches users to dismiss all of them.",
    k: ["Strict grammar check vs permissive parsing: strict catches typos, permissive accepts real unusual addresses that strict rules reject.", "Warn on suspicious situations vs block: warnings preserve user control, blocking prevents leaks in regulated settings but frustrates legitimate cases."],
    p: ["A strict validator rejecting a valid address with plus signs or new top-level domains blocks legitimate mail.", "Frequent false warnings train users to click through the one that mattered."],
    v: "Type a message saying 'see attached' with no file and confirm a warning appears before send; add a valid address with a plus tag and confirm it is accepted and delivered.",
    dep: ["address-book", "autocomplete-index"]
  },
  "message-builder": {
    s: "Assembles the final message from draft state: headers, a multipart body with text and HTML alternatives, attachments and inline images, with correct encoding and identifiers.",
    d: "The builder writes the required headers, a unique message identifier, date, and references. It produces a multipart structure: alternatives for text and HTML, wrapped with related parts for inline images and mixed for attachments. Non-ASCII headers and bodies are encoded, and long lines folded. Large attachments are encoded as text, which grows size by about a third. It is hard because small structural mistakes render differently in different clients, and because signing and encryption must wrap the exact bytes that are sent.",
    k: ["Always include a plain-text alternative vs HTML only: both is larger and takes work to generate, HTML-only breaks text clients and spam filters penalize it.", "Standard encodings for header text vs raw UTF-8: standard encoding works with every relay, raw is cleaner but fails through servers that lack the extension."],
    p: ["Bad boundary strings or unencoded non-ASCII headers produce garbled subjects at the recipient.", "Computing size after encoding is skipped, so a message passes the local limit and is rejected by the server."],
    v: "Build a message with HTML, text, one inline image and one attachment, send it to three different clients and confirm each shows the formatting, the image inline, and the file attached with the right name and type.",
    dep: ["plain-text-converter", "message-encryption", "signature-verifier"]
  },
  "address-book": {
    s: "The local store of people and their addresses, drawn from the user's own entries, synced address books and addresses seen in mail.",
    d: "Each contact has names, addresses, phone numbers and optional photos, with a source and a unique identity. Records come from several places: manual entry, synced contact collections, and automatically collected correspondents. Fields map between several formats. The store supports quick lookup by any name part. It is hard because the same person has many records, because merging or editing synced contacts must write back correctly, and because contact data is personal and needs the same access care as mail.",
    k: ["Automatically collect every correspondent vs only explicit contacts: collecting makes autocomplete useful, but fills the book with newsletters and no-reply addresses.", "Own store vs the platform's shared contacts: shared is consistent across apps, but gives an app broader access and fewer features."],
    p: ["Auto-collected addresses from bulk mail pollute autocomplete so real people are buried.", "Editing a synced contact locally and losing the edit on the next sync overwrite."],
    v: "Add a contact in the book, then type part of their name in compose and confirm it appears; edit them on the server and confirm the change shows locally after sync.",
    dep: ["message-database", "contact-sync"]
  },
  "autocomplete-index": {
    s: "A fast ranked index over names and addresses that suggests recipients as the user types, weighted by how recently and often they are used.",
    d: "Entries are drawn from contacts, recent correspondents and directory results. Matching is prefix and token based across display names and addresses, ignoring case and accents. Ranking combines frequency, recency, whether the user sent to the address versus only received from it, and the chosen identity's account. The index updates incrementally. It is hard because it must answer in milliseconds on every keystroke, handle scripts without word separators, and avoid suggesting retired or misspelled addresses.",
    k: ["Rank by recency and frequency vs alphabetically: usage ranking puts likely recipients first, but can bury a person written to once a year.", "Local index only vs also asking a directory: local is instant and private, directory queries find colleagues but add latency and network dependence."],
    p: ["A typo'd address sent once stays high in ranking and gets chosen again.", "Suggestions from the wrong account's contacts leak a private contact into a work message."],
    v: "Type three letters of a frequent correspondent and confirm they are the first suggestion within 100 ms; send to a different person with the same prefix several times and confirm ranking changes.",
    dep: ["address-book", "directory-lookup", "message-database"]
  },
  "contact-sync": {
    s: "Keeps the local address book consistent with contact collections on servers, using incremental change detection and mapping fields between formats.",
    d: "Contacts sync through a standard contacts protocol or a provider's own interface. The client keeps a token or ETag per collection, fetches changed entries, and uploads local edits. Each entry maps to the local model and back, preserving unknown fields so a round trip does not drop data. Photos and groups may sync separately. It is hard because formats lose fidelity in translation, because conflicting edits need a rule, and because large address books must sync without blocking mail.",
    k: ["Preserve unknown fields on round trip vs normalize to the local model: preserving avoids damaging other apps' data, normalizing keeps code simple.", "Server wins on conflict vs last-writer wins: server-wins is predictable, last-writer respects fresh local edits but depends on clocks."],
    p: ["Dropping fields the client does not understand silently deletes data users entered in another app.", "A full resync each time instead of change tokens makes large address books slow and costly."],
    v: "Edit a contact's phone number on the server and a different field locally, sync, and confirm both edits survive on both sides with no duplicates.",
    dep: ["address-book", "account-manager", "network-awareness"]
  },
  "directory-lookup": {
    s: "Queries an organization's central directory for people, rooms and groups so recipients not in the user's own contacts can be found and expanded.",
    d: "The client queries a directory over a network protocol or a provider interface with the user's credentials, sending the typed text and receiving matching entries. Results are cached briefly. Groups may be expanded by the server at send time or by the client into addresses. It is hard because queries must be rate limited and cancellable as the user types, because directories can be huge, and because access rules decide what the user may see.",
    k: ["Query on every keystroke vs after a pause: every keystroke feels instant but floods the server, a pause adds delay but is polite.", "Expand a group on the client vs send to the group address: expanding shows exact recipients and can be edited, group addressing lets membership change after sending."],
    p: ["Uncancelled earlier queries return after later ones and overwrite the suggestion list with stale results.", "Caching directory entries too long suggests people who have left the organization."],
    v: "Type a colleague's name not in the local book, confirm the directory result appears with a clear source label, select it, and confirm the sent message uses the exact directory address.",
    dep: ["autocomplete-index", "credential-store", "tls-layer"]
  },
  "contact-merge": {
    s: "Detects and merges duplicate contact records for one person across sources, while keeping links back to each source so edits can be written back.",
    d: "Candidate duplicates are found by shared addresses, phone numbers and similar names. A merged view presents one person with combined fields, but the underlying source records stay separate and linked. Rules decide which value is primary. Users can confirm, split or ignore suggestions. It is hard because names are ambiguous, because a shared family address must not merge two people, and because unmerging after the fact needs the original links preserved.",
    k: ["Virtual merge over linked sources vs destructive merge: virtual is reversible and keeps sync intact, destructive is simpler but cannot be undone.", "Automatic merging on exact address match vs asking: automatic is invisible but wrong for shared addresses, asking is correct and interrupts."],
    p: ["Merging two people who share a household or role address makes mail go to the wrong person.", "Destructive merges deleted on one source reappear after the next sync."],
    v: "Create the same person in two sources, confirm one merged entry appears, split it, and confirm both source records are intact and unmodified on their servers.",
    dep: ["address-book", "contact-sync"]
  },
  "group-lists": {
    s: "Local and server groups of recipients, plus handling of mailing list conventions, so one name can address many people.",
    d: "A group is a named list of addresses stored locally or on a server. Selecting it expands to individual recipients or keeps the group address depending on type. Mailing list mail carries list headers that identify the list and offer unsubscribe or post actions, which the client can surface. Reply behavior depends on the list's reply-to settings. It is hard because group membership changes and a locally expanded group goes stale, and because replying to a list versus the author is a common, costly mistake.",
    k: ["Expand groups at compose time vs at send time: at compose the user sees and edits recipients, at send picks up current membership but hides who gets it.", "Use list headers to offer a list reply action vs rely on reply-to: headers are explicit and reliable when present, reply-to is universal but ambiguous."],
    p: ["A stale local group sends confidential mail to someone who left the team.", "Reply-all on a list message copies the sender and the list, so the author gets two copies."],
    v: "Create a three-person group, address a message to it, and confirm the sent message lists the three addresses; open a list message and confirm unsubscribe and list-reply actions appear.",
    dep: ["address-book", "recipient-validation", "directory-lookup"]
  }
});
