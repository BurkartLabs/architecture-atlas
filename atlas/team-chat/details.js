// Details for the team chat plate, part 1: clients, workspaces and channels, conversation features.
ATLAS.details("team-chat", {
  "client-apps": {
    s: "The web, desktop and mobile programs people use to read and write messages, sharing one protocol and data model but differing in lifecycle, background limits and notification paths.",
    d: "Each client authenticates, loads a snapshot of the user's workspace, opens a persistent connection and renders streams of events. Desktop and web share most logic; mobile adds background execution limits, push wake-ups and battery constraints. Clients must tolerate old server versions and servers must tolerate old clients, because mobile builds linger for months. What makes this hard is the number of simultaneous platform versions, each with its own cache format and bugs, all speaking one evolving protocol.",
    k: ["Shared core logic across platforms vs native per platform: sharing cuts feature drift and duplicate bugs, while native code gives better scroll, input and battery behavior.", "Server-driven feature gating vs client-version checks: server gates let you disable a broken feature instantly, but add a round trip and a dependency on config availability."],
    p: ["A protocol change that old mobile builds misread causes silent data loss in a minority of users for months.", "Treating the desktop client as always online hides bugs that only appear after laptop sleep and network switching."],
    v: "Run the oldest supported client build against the current server and send, edit, react and read a message from it while another client watches; every action must appear correctly on both.",
    dep: ["connection-gateways", "local-cache", "client-sync"]
  },
  "local-cache": {
    s: "A client-side store of recently seen messages, channels and users, so conversations open instantly and keep working through brief network loss.",
    d: "The cache holds channel lists, recent history, user profiles and drafts in a local database or in-memory structures with a size budget. On open, the client paints from cache and then reconciles with the server. Events update it as they arrive. Eviction favors recent and frequently used channels. The difficulty is correctness: cached data can be stale, deleted upstream, or hidden by a permission change, and the cache must converge to the server without the user noticing flicker.",
    k: ["Persistent on-disk cache vs memory only: persistence gives instant cold start and offline reading, but holds sensitive data on lost devices and needs migrations.", "Cache everything vs a small budget: bigger caches reduce loading, but increase staleness surface and storage on low-end phones."],
    p: ["A message deleted for compliance stays readable in local caches because the delete event arrived while the client was offline.", "A schema change in the cache corrupts it on upgrade and forces a slow full reload for every user at once."],
    v: "Open a busy channel with the network disabled and confirm recent history renders. Reconnect, delete one visible message from another client, and confirm it disappears here without a manual refresh.",
    dep: ["client-sync", "event-sequencing"]
  },
  "composer": {
    s: "The input area where people write messages, with formatting, attachments, mentions, emoji completion and drafts that survive switching channels or restarting the app.",
    d: "The composer parses markup as the user types, offers autocomplete for people, channels and emoji, and stages attachments for upload. Drafts are saved per channel and per thread, locally and often synced to the server so they follow the user across devices. It must handle paste of rich content, very long text, input method editors for other scripts, and undo. On send it serializes to the wire format, which is structured blocks or markup rather than raw display text.",
    k: ["Structured rich-text model vs plain markup text: structure makes mentions and links robust, but is harder to implement on every platform and to import from pasted content.", "Server-synced drafts vs local only: synced drafts follow the user, but add write traffic and complicated conflict handling when two devices edit one draft."],
    p: ["A mention typed as text rather than as a structured reference fails to notify the person it names.", "Draft sync that overwrites a newer draft from another device silently destroys half-written messages."],
    v: "Type a message with a mention and formatting in one channel, switch away, kill the app and reopen on another device; the draft must reappear intact, and sending it must notify the mentioned person.",
    dep: ["rich-text-rendering", "mentions", "optimistic-send"]
  },
  "optimistic-send": {
    s: "Showing a sent message immediately in the sender's client under a temporary identity, then confirming or failing it when the server responds.",
    d: "On send the client assigns a client-generated ID, inserts the message locally in a pending state, and posts it. The server acknowledgment carries the canonical ID and timestamp; the real event also arrives over the live connection and must be matched to the pending entry rather than shown twice. If the request fails or times out, the message turns into a visible failure with retry. Retries reuse the client ID so the server can deduplicate. The difficulty is matching, ordering and showing honest state during poor connectivity.",
    k: ["Optimistic display vs waiting for acknowledgment: optimistic feels instant, but must handle failure states and reordering when the server assigns a different position.", "Client-generated IDs vs server-only IDs: client IDs make retries safe and matching simple, but the server must treat them as untrusted and scope them per sender."],
    p: ["A retry without a stable client ID posts the same message twice when the first request actually succeeded.", "A message shown as sent while stuck in a dead-connection queue misleads the sender into thinking it was delivered."],
    v: "Send a message, cut the network before the response, restore it and confirm exactly one copy appears for every participant. Then send with the server rejecting the request and confirm a visible retry option.",
    dep: ["idempotency", "client-sync", "composer"]
  },
  "client-sync": {
    s: "The logic that brings a client's local state up to date after launch, reconnect or sleep, by fetching only what changed instead of reloading everything.",
    d: "On connect the client sends its last known sequence position or per-channel markers. The server either replays missed events or, if the gap is too large, tells the client to refetch a fresh snapshot. The client then fetches history for channels it displays and lazily for the rest. It must merge fetched pages with live events arriving at the same time. The hard part is the boundary: no gap and no duplicate between the snapshot, backfilled history and the live stream.",
    k: ["Event replay vs full resnapshot: replay is cheap for short gaps, but retention of events is finite, so a resnapshot path must exist and be tested.", "Eager vs lazy channel loading: eager loading makes every channel instantly ready, but costs bandwidth and server load for users in hundreds of channels."],
    p: ["Applying live events before the snapshot completes lets older snapshot data overwrite newer events.", "A resync storm after an outage sends every client to refetch at once and prolongs the incident."],
    v: "Put a client to sleep for ten minutes while others post, wake it and compare its channel contents to the server's: no missing, duplicate or reordered messages, and the number of requests stays small.",
    dep: ["resume-replay", "history-pagination", "local-cache"]
  },
  "rich-text-rendering": {
    s: "Turning stored message content, including formatting, code, mentions, emoji and attachments, into safe visual output identically on every platform.",
    d: "Messages are stored as markup or a block tree, with mentions and links as typed references. Renderers on each client resolve references to current names, apply formatting, highlight code, and substitute emoji. Output is sanitized so untrusted content, including from bots, cannot inject scripts or spoof interface elements. Edge cases dominate: nested formatting, huge messages, right-to-left text, messages that mention a renamed user or deleted channel, and bot-sent content using richer blocks than users can compose.",
    k: ["Resolve references at render time vs freeze text at send time: render-time resolution shows current names, but old messages change meaning and cost lookups.", "One shared parser vs per-platform renderers: a shared parser gives identical results, while per-platform rendering handles native selection, accessibility and performance better."],
    p: ["Link text that displays one address while pointing to another enables phishing inside a trusted channel.", "Differences in parsing between platforms make the same message look different, so people argue about what was said."],
    v: "Send a corpus of tricky messages (nested formatting, long code, mentions of renamed users, hostile markup) and compare screenshots on each client; the rendering must match and no script or spoofed control may appear.",
    dep: ["mentions", "link-unfurling"]
  },
  "link-unfurling": {
    s: "Fetching a posted URL and showing a preview card with title, description and image, either by the server or through an app registered for that domain.",
    d: "When a message contains a link, a background job fetches the page, reads its metadata, and attaches a card to the message, which then updates over the live channel. Fetching must go through a hardened proxy with timeouts, size limits and blocks on internal addresses. Apps can register to unfurl links for their own domains, using authenticated access to render private content such as a ticket or document, subject to the viewer's access. Previews are cached and can be disabled per workspace.",
    k: ["Server-side fetching vs client-side fetching: server fetches hide user IP addresses and cache well, but make the server a request-forgery target and bear all the traffic.", "Public metadata vs app-provided private unfurls: apps show rich content, but must check that the viewer, not just the poster, may see it."],
    p: ["An unfurler that follows redirects to internal addresses can be used to probe private network services.", "An unfurl that shows private document titles to channel members without document access leaks content."],
    v: "Post a link to a page, then to an address pointing at an internal metadata service and to a redirect chain; the first shows a card, the others are refused, and the request log shows every fetch came through the proxy.",
    dep: ["job-queue", "interactive-components"]
  },
  "workspace-model": {
    s: "The top-level tenant: a named space containing users, channels, settings, apps and policies, and the unit at which billing, administration and data isolation happen.",
    d: "A workspace owns its members, channels, files, emoji, retention settings and installed apps. It has a unique domain and its own admins. Larger customers group workspaces under an organization that shares identity, policies and sometimes search. Every row in the system carries a workspace ID, which is the primary partitioning key and the boundary for access checks. The hard part is the edge cases: a person belonging to several workspaces, merging or splitting workspaces, and organization-level features that must reach across the tenant boundary safely.",
    k: ["Workspace as hard isolation boundary vs a shared global graph: hard boundaries simplify security and sharding, but make cross-company collaboration require special constructs.", "Per-workspace accounts vs one account across workspaces: one account is friendlier, but ties identity, notification and profile data across tenants with different policies."],
    p: ["A query missing the workspace filter exposes one tenant's data to another, the most serious failure in the system.", "Merging two workspaces without reconciling duplicate users and channel names breaks mentions and permissions."],
    v: "As a user in two workspaces, change a setting in one and confirm it never appears in the other; and run a query for a channel ID from the wrong workspace and confirm it is refused, not merely empty.",
    dep: ["tenant-sharding", "user-accounts"]
  },
  "channels": {
    s: "Named, shared conversation spaces that are either open to everyone in the workspace or restricted to invited members.",
    d: "A channel has an ID, a name, a topic, a visibility (public or private), a member list and a message stream. Public channels can be browsed and joined freely; private ones are invisible to non-members, including in search and counts. Names are unique within a workspace and can change, so references use IDs. Settings such as who may post, thread-only mode or retention are attached to the channel. Conversion between public and private is the dangerous operation, since it changes who can read existing history.",
    k: ["Join-by-default public channels vs invite-only: open channels spread knowledge and reduce silos, but encourage noise and expose accidental sensitive posts.", "Name as identity vs ID as identity: stable IDs survive renames and keep links valid, at the cost of every reference needing resolution to display."],
    p: ["Converting a private channel to public exposes its entire history to the workspace without anyone realizing.", "A name collision during import or rename breaks links and bot configuration that referenced the name."],
    v: "Create a private channel, post a message, and verify a non-member cannot see it in the directory, search, mention suggestions or by direct ID request, and that a member can.",
    dep: ["workspace-model", "membership", "channel-permissions"]
  },
  "direct-messages": {
    s: "Conversations between a fixed set of people, created implicitly the first time they write and identified by the participant set rather than a name.",
    d: "A direct conversation is a channel-like object whose membership is its identity: the same pair or group always maps to the same conversation. Groups beyond a few people are often a separate type with limited size. They have no admin, no discovery and often fixed retention rules. Internally they reuse the channel storage and delivery path, with a deterministic lookup from participant set to conversation ID. Complications include a user deactivated mid-conversation, adding someone to a group, and messages with people outside the workspace.",
    k: ["Participant-set identity vs generated conversation ID: set identity prevents duplicate conversations, but adding a member must create a new conversation or break history.", "Reusing the channel path vs a dedicated storage path: reuse reduces code and bugs, but private conversations then share hot partitions and policy code with channels."],
    p: ["Creating duplicate conversations for the same pair splits history and confuses unread counts.", "Compliance exports that omit direct messages fail the one case regulators care about most."],
    v: "Have two users open a conversation from different clients at the same moment and write; both must end up in one conversation with one history, and a third user cannot read or find it.",
    dep: ["channels", "membership"]
  },
  "membership": {
    s: "The record of which users belong to which channels, with their roles, join times and per-user settings, consulted for delivery, permissions and unread counts.",
    d: "Membership is a many-to-many relation stored by channel and by user, since both lookups are hot: who receives this event, and which channels does this user see. Rows carry per-member state such as notification preference, last read marker and mute. Large channels have hundreds of thousands of rows, so listing, counting and fanout need pagination and cached counts. Joins, leaves, removals and deactivation trigger events, permission cache invalidation and system messages. Consistency matters: a removed member must stop receiving events immediately.",
    k: ["Explicit member rows vs implicit membership by rule (whole workspace): rules save storage for large public channels, but make unread and notification state harder to attach per user.", "Both-direction indexes vs one: two indexes make both lookups fast, but every join and leave must update both consistently."],
    p: ["A removed member whose live connection still holds a subscription keeps receiving messages until reconnect.", "Counting members by scanning rows in huge channels makes the channel header slow and loads the database."],
    v: "Remove a user from a private channel while their client is connected and confirm the server stops sending events for that channel within seconds, and the channel disappears from their list.",
    dep: ["subscriptions", "permission-evaluator"]
  },
  "sidebar-sections": {
    s: "The per-user arrangement of channels and conversations into custom groups, with ordering, collapse state and rules for what is shown or hidden.",
    d: "Each user's sidebar is a personal view over their memberships: sections the user creates, a default ordering, favorites, and filters such as showing only unread. It is stored per user, synced across devices, and applied client-side. Channels with new activity float or bold according to preferences. Large accounts have hundreds of channels, so the sidebar must load quickly from a compact structure rather than from membership rows. The delicate part is syncing edits made on two devices without losing either.",
    k: ["Per-user server-stored layout vs local-only layout: stored layouts follow the user, but need a sync path and conflict policy for concurrent edits.", "Activity-driven reordering vs stable positions: reordering surfaces what matters, but moves things under the cursor and confuses muscle memory."],
    p: ["Last-write-wins sync of the whole layout lets a stale device undo a reorganization done minutes earlier.", "Hidden channels that still produce mentions leave people unaware they are being asked something."],
    v: "Create a section and move a channel on one device while renaming the section on another, then compare both: both edits must survive and the layouts must match.",
    dep: ["membership", "unread-state"]
  },
  "channel-directory": {
    s: "A browsable, searchable listing of channels a person may join, with names, topics, member counts and recent activity.",
    d: "The directory queries public channels plus private channels the user already belongs to, with filters for size, activity and creator. Counts and last-activity values are denormalized because computing them live is too costly. It must never reveal the existence of private channels to non-members, even through counts or suggestions. Recommendations may rank by relevance to the user's team. Archived channels are shown separately. Large workspaces have tens of thousands of channels, which pushes the directory toward its own search index.",
    k: ["Live computed counts vs cached counts: cached values are fast and cheap, but drift and can look wrong right after a burst of joins.", "Directory in the main database vs a search index: an index supports text and sorting at scale, but lags and needs the same permission rules."],
    p: ["Autocomplete suggesting a private channel name to a non-member leaks that the channel exists.", "Stale last-activity data makes dead channels look active and active ones look dead."],
    v: "As a non-member, search the directory for the exact name of a private channel and for a prefix of it; neither may return it. As a member, both must, and the counts must match the member list within a minute.",
    dep: ["channels", "search-indexer", "permission-filtering"]
  },
  "shared-channels": {
    s: "A channel whose messages are visible to members of two or more separate workspaces or organizations, each keeping its own administration.",
    d: "One organization hosts the channel and invites another, which accepts. The platform maps external users into a stub identity in each side, replicates or references messages across tenants, and applies each organization's policies to its own users: retention, download limits, and who may invite. Each side can leave, ending its access while keeping or losing history according to policy. It is hard because tenant boundaries are the main isolation guarantee, and this feature deliberately crosses them while preserving every other boundary.",
    k: ["One canonical copy of messages vs replicated copies per tenant: one copy avoids divergence, but breaks tenant-based sharding and per-tenant retention.", "Host-controlled policy vs intersection of both organizations' policies: host control is simple, intersection respects both customers but can produce surprising restrictions."],
    p: ["A partner organization that retains messages longer than the host's policy keeps data the host believes is deleted.", "Leaving a shared channel without clear history ownership leaves one side with half a conversation."],
    v: "Share a channel between two test organizations, post from each, set a different retention in each, and confirm each side sees the same messages but applies its own policy and cannot see the other's private channels.",
    dep: ["external-connections", "tenant-sharding", "retention-policies"]
  },
  "threads": {
    s: "Replies attached to a parent message, forming a sub-conversation with its own participants, reply count and notification rules, shown apart from the main channel stream.",
    d: "A reply stores a pointer to its parent and, optionally, whether it is also shown in the channel. The platform keeps a thread index with reply counts, participants and last reply time, updated on each reply and used to render the parent summary. Followers of a thread get notifications for new replies, including those who never mentioned. Threads need their own unread state, their own history pagination and their own ordering. Deleting a parent, moving it or applying retention must handle its replies consistently.",
    k: ["Threads as separate message streams vs just a parent pointer in the channel stream: separate streams scale and read cleanly, but fragment context and complicate search and ordering.", "Auto-follow on participation vs explicit follow: auto-follow avoids missed replies, but makes noisy threads a standing interruption."],
    p: ["Reply counts maintained by increment drift when replies are deleted or imported, and show a wrong number forever.", "Retention that deletes a parent but keeps its replies leaves orphaned messages with no context."],
    v: "Post a parent, add replies from three users, delete one reply, and verify the parent shows the right count and participants on every client, and only followers got notified of each reply.",
    dep: ["thread-index", "unread-state", "message-store"]
  },
  "reactions": {
    s: "Lightweight responses, usually emoji, attached to a message by many users, shown as counts with who reacted, and toggled on and off.",
    d: "A reaction is a triple of message, emoji and user, with a count per emoji maintained or derived. Reactions arrive in bursts, especially on announcements, so writes to one message can reach thousands per second. Clients show counts optimistically and receive aggregated updates. Permissions mirror the message's channel. They can trigger notifications for the author, but usually softly. Custom emoji are workspace assets that can be removed, leaving reactions referencing something that no longer exists.",
    k: ["Row per reaction vs aggregated counts only: rows give who reacted and clean undo, but heavy messages become hot rows; counts alone lose attribution.", "Batching reaction events vs sending each: batching reduces fanout under bursts, at the cost of a short delay before everyone's counts update."],
    p: ["A viral message with tens of thousands of reactions turns a single row into a write hotspot that slows the whole channel.", "Deleting a custom emoji without cleaning up leaves broken placeholders on old messages."],
    v: "Have one hundred simulated users react to one message at the same time; the final count must be exactly one hundred on every client, each user's toggle must work, and channel latency must stay normal.",
    dep: ["reaction-store", "event-fanout"]
  },
  "mentions": {
    s: "References inside a message to a person, group, channel or everyone, which resolve to stable IDs and drive notifications and highlight.",
    d: "The composer converts a typed mention into a structured reference, so the server can extract recipients without parsing text. On send, the server expands group mentions into members, checks the sender may use broadcast mentions in that channel, and creates notification triggers. A mention of someone not in the channel may prompt to invite them. Mentions are indexed per user so a mentions view can load quickly. Broadcast mentions in large channels can trigger enormous notification fanout and are often restricted.",
    k: ["Structured IDs vs parsing display names: IDs survive renames and are unambiguous, but pasted or API-sent text needs explicit conversion.", "Open broadcast mentions vs permissioned: open ones are convenient, but one accidental post notifies thousands and wakes people at night."],
    p: ["A bot posting plain text names instead of structured mentions silently fails to notify anyone.", "Mentioning a person who cannot see the channel leaks the message existence or fails silently, depending on policy."],
    v: "Mention a user, a group and a broadcast keyword in a private channel: the member and group members are notified, the non-member is offered an invite and gets nothing, and a user without broadcast rights is blocked.",
    dep: ["user-groups", "notification-rules", "permission-evaluator"]
  },
  "user-groups": {
    s: "Named sets of people, such as a team or on-call rotation, that can be mentioned or added to channels as one unit.",
    d: "A group has an ID, a handle, and a membership list managed by admins, by members or by synchronization from the customer's directory. Mentioning a group notifies its current members at send time. Membership changes must take effect at once for future mentions but never rewrite the past. Groups can be used as audience for channel invites and, in some systems, for permissions. Large groups carry the same fanout risks as broadcast mentions, so they have their own size and posting limits.",
    k: ["Directory-synced groups vs manually managed: synced groups stay correct automatically, but the platform depends on directory timing and mapping rules.", "Expand at send time vs keep as a live reference: expanding fixes the audience for audit and notification, while live references stay current but change the meaning of old messages."],
    p: ["An on-call group that was not updated pages the person who left the rotation last month.", "Allowing anyone to mention a very large group turns a typo into a company-wide notification."],
    v: "Change a group's membership via the directory sync, then mention the group and confirm exactly the new members are notified, and that old messages' recorded audience is unchanged.",
    dep: ["scim", "mentions"]
  },
  "edit-and-delete": {
    s: "Changing or removing a posted message after the fact, with the rules, history and event propagation that keep every client and index consistent.",
    d: "An edit creates a new revision of the message content and emits an update event carrying the new content and an edited marker; the previous revision is kept for audit when policy requires. A delete removes content and emits a tombstone event so caches, search indexes and thread counters update. Permissions define who may edit or delete: author, admins, time limits. Replies to a deleted message, quoted copies, file attachments and notifications already sent are the awkward leftovers.",
    k: ["Soft delete with tombstone vs hard delete: tombstones keep thread structure and make sync simple, but content must be truly purged later for privacy and compliance.", "Keeping all revisions vs only the latest: full history supports audit and discovery, but preserves content users believe they removed."],
    p: ["Edits that update the message store but not the search index let people find text that no longer exists.", "A deleted message remains in push notification payloads, caches and exports long after the visible delete."],
    v: "Edit then delete a message, and check every surface: the channel, a thread, search results, the unfurled copy, the push notification history and an export; each must show the edit or the tombstone, not stale content.",
    dep: ["message-store", "search-indexer", "deletion-engine"]
  },
  "pins-bookmarks": {
    s: "Ways to keep important messages and links within easy reach: pins shared with a channel, and bookmarks private to a person or attached to a channel header.",
    d: "A pin is a flag or relation from a channel to a message, creating a visible list; a bookmark is a saved reference with an optional label, stored per user or per channel. Both reference messages by ID, so they must follow edits and handle deletes and retention. Permissions govern who may pin. Pins are often a quiet source of institutional memory, so they must survive archive and export. Saved-for-later items can attach reminders and a status, bridging into task-like behavior.",
    k: ["Reference by message ID vs copy the content: references stay in sync and respect deletion, but break when retention removes the original.", "Channel-wide pins vs personal bookmarks only: shared pins build common knowledge, but need permission rules and tend to go stale."],
    p: ["A pinned message deleted by retention leaves a dangling pin that shows an empty entry or an error.", "A pin that exposes a message from a thread to people without thread access can reveal content out of context."],
    v: "Pin a message, edit it, then apply a retention rule that deletes it; the pin list must show the edit while it exists and drop the entry cleanly when the message is purged.",
    dep: ["message-store", "channel-permissions"]
  },
  "scheduled-reminders": {
    s: "Messages that are sent later at a chosen time, and reminders that resurface a message or a note for a person at a set moment.",
    d: "A scheduled send stores the draft, target and time, and a scheduler fires it through the normal send path, rechecking permissions and channel state at that moment. A reminder is a timer owned by one user that posts a private notice. Both depend on a distributed scheduler that survives restarts and fires roughly on time without duplicates, even with millions of pending entries. Time zones, daylight saving and users who changed channel membership between scheduling and sending add edge cases.",
    k: ["Persisted scheduler with polling vs per-item timers in memory: polling in time buckets survives restarts and scales, but adds up to a bucket of delay.", "Rechecking permissions at send time vs at scheduling time: send-time checks are correct but can fail silently if the user lost access."],
    p: ["A scheduler that fires an item twice after a failover posts the same message twice.", "A user who loses channel access still has a scheduled message posted if permissions are not rechecked at firing time."],
    v: "Schedule messages across several time zones including a daylight-saving change, restart the scheduler mid-run, and confirm each is sent once at the right local time, and one targeting a now-private channel is refused.",
    dep: ["job-queue", "send-path", "permission-evaluator"]
  },
  "unread-state": {
    s: "The per-user, per-channel record of what is new, with counts and mention flags, shown as badges and used to jump to the first unread message.",
    d: "Unread state is derived from a read marker per member per channel compared with the channel's latest position, plus counts of unread messages and unread mentions. Computing counts exactly across hundreds of channels on every load is expensive, so servers maintain counters incrementally or compute on demand from marker and sequence. Thread unread is a separate state. Muted channels contribute differently. It is hard because it must be correct across devices, quick to compute, and tolerant of messages deleted or edited after being counted.",
    k: ["Maintained counters vs computed from marker and latest position: counters read fast but drift on delete and import; computation is exact but costs on every read.", "Counting every message vs a capped count (99+): caps bound the work and fit the interface, but hide how far behind someone is."],
    p: ["A deleted unread message leaves a badge that cannot be cleared because the count never decrements.", "Counters updated for every member on every message turn a post to a large channel into a million writes."],
    v: "Post twenty messages including two mentions and a deletion in a channel with a user offline; on opening, their badge must match exactly what they then see, and clearing it on one device clears it on all.",
    dep: ["read-markers", "channel-ordering", "membership"]
  },
  "read-markers": {
    s: "A stored pointer per user per channel marking the last message the person has seen, synchronized so that reading on one device clears the others.",
    d: "When a client shows a message to an active user, it advances the marker, usually debounced and monotonic: it only moves forward. The server stores the marker, broadcasts the change to the user's other devices and uses it to clear badges and cancel pending push notifications. Visibility matters: a message loaded in a background window is not read. Thread markers are separate. Concurrent updates from several devices need a merge rule, which is normally taking the maximum position.",
    k: ["Marker only moves forward vs last write wins: monotonic markers resolve device races simply, but a user cannot deliberately mark a message unread without a special reset operation.", "Immediate vs debounced marker writes: debouncing reduces writes dramatically, but a short delay can let a push fire for an already-read message."],
    p: ["Treating a prefetched or backgrounded window as read clears unread state for messages nobody saw.", "A clock-based marker instead of a sequence position misorders when device clocks differ."],
    v: "Read a channel on a laptop while a phone has pending notifications for it; the phone's badge and delivered notifications clear within seconds, and a message that arrives just after the read still shows as unread.",
    dep: ["unread-state", "event-fanout", "channel-ordering"]
  },
  "notification-rules": {
    s: "The logic that decides, for each message and each recipient, whether to interrupt them, on which device and how, from preferences, mentions, activity and presence.",
    d: "For every new message the server evaluates each relevant member: channel-level setting (all, mentions only, nothing), keywords, thread follows, direct message status, do-not-disturb schedule, whether they are active on another device, and workspace policies. The result is a set of delivery intents handed to push, email or in-app paths. Evaluating thousands of members per message is the cost, so rules are applied only to members not already looking at the channel and results are cached. The hard problem is predictability: users must understand why they were, or were not, notified.",
    k: ["Evaluate rules at send time vs at delivery time: send-time evaluation is simple, while delivery-time evaluation uses current presence and settings to suppress stale alerts.", "Delay push when the user is active elsewhere vs send at once: delaying removes duplicate buzzes, but risks late alerts when presence is wrong."],
    p: ["Presence data that says a user is active on a desktop left open overnight suppresses all their phone notifications.", "Rule complexity makes support unable to explain a missed notification, which erodes trust faster than a noisy one."],
    v: "For a fixed matrix of settings (all, mentions, muted, snoozed, active elsewhere) send one message and one mention, and compare actual notifications to the documented outcome for every cell.",
    dep: ["mentions", "presence-service", "do-not-disturb", "push-gateway"]
  },
  "push-gateway": {
    s: "The service that turns notification intents into pushes through each mobile platform's delivery service, handling tokens, payloads, batching and retries.",
    d: "Devices register a token with the server; the gateway maps users to tokens, builds a payload containing a title, preview text and badge, and sends it to the platform delivery service, which relays it to the device. Failures such as invalid tokens must retire the token. Payload size is small, and content may be withheld for privacy so the app fetches the message itself. Delivery is best effort and unordered, so the app reconciles with the server on wake. Collapse keys replace older alerts with newer ones.",
    k: ["Full message text in the payload vs a wake-up only: full text shows instantly and works offline, but exposes content to third-party relays and lock screens.", "Per-message pushes vs coalescing: coalescing prevents a flood during bursts, but may delay or merge the single message that mattered."],
    p: ["Tokens not retired after logout keep delivering one user's messages to a device now used by someone else.", "A badge number set by the push payload disagrees with the server's unread count after missed pushes."],
    v: "Send a mention to a registered phone and confirm the notification arrives with the right text; log out, send again, and confirm the gateway sends nothing and removes the token.",
    dep: ["notification-rules", "job-queue", "sessions"]
  },
  "email-digests": {
    s: "Batched email summaries of missed messages and mentions, sent when a person has been away, with links back into the conversations.",
    d: "A job selects users with unread mentions or direct messages older than a delay who have not been active, groups items by channel, renders an email, and links with signed tokens. It respects notification preferences, quiet hours and a per-user frequency cap. Replies by email may be accepted and posted into the thread, which requires inbound parsing and authenticating the sender. Digests are one of the few paths that copy message content outside the product, so they obey retention and data-loss rules.",
    k: ["Scheduled digest vs immediate email per mention: digests are calmer and cheaper, but delay time-sensitive items; immediate emails are noisy and duplicate push.", "Reply-by-email into threads vs link only: replies are convenient, but inbound sender spoofing and quoted-history parsing are real risks."],
    p: ["A digest sent for messages the user already read on mobile shows stale unread content and feels broken.", "Including private message text in email sends it into mail systems that the workspace's retention policy cannot reach."],
    v: "Leave a user inactive with three unread mentions and observe one email after the configured delay with the right items; read them first on another device and confirm no email is sent.",
    dep: ["unread-state", "job-queue", "notification-rules"]
  },
  "do-not-disturb": {
    s: "User and workspace controls that silence alerts by channel, schedule or temporary snooze, while still recording messages as unread.",
    d: "Settings include a muted flag per channel, a daily quiet-hours schedule in the user's time zone, a manual snooze with an expiry, and sometimes an organization-wide policy. The notification path checks them before sending any alert; urgent exceptions such as direct messages from specific people or emergency broadcasts may bypass quiet hours. The state is visible to others as a status so people know why they may not reply. Time zones, travel and daylight-saving transitions make schedule evaluation surprisingly error-prone.",
    k: ["Evaluate on the server vs on the device: server evaluation prevents wasteful pushes and works across devices, while device evaluation respects local mode but cannot stop delivery.", "Allow bypass for urgent contacts vs absolute silence: bypass helps genuine emergencies, but is abused and weakens the promise of quiet."],
    p: ["Evaluating the schedule in the server's time zone instead of the user's wakes people at three in the morning.", "A snooze that never expires because the expiry job failed leaves someone silently unreachable."],
    v: "Set quiet hours in a time zone different from the server's, send a mention just inside and just outside the window, and confirm only the second alerts while both appear as unread.",
    dep: ["notification-rules", "custom-status"]
  },
  "search-indexer": {
    s: "The pipeline that turns messages, files and metadata into searchable documents, kept near real time with the message store.",
    d: "Every message create, edit and delete emits an event consumed by an indexer that tokenizes content, attaches channel, author, time and access fields, and writes to a search cluster. Indexes are partitioned by workspace so queries stay within a tenant and large tenants can have dedicated shards. Freshness is usually seconds. The indexer must be idempotent, handle out-of-order events, and tolerate cluster backpressure. Deletes and edits are as important as inserts, or removed content stays discoverable.",
    k: ["Index from a change event stream vs dual write from the send path: events decouple sending from search outages, but make search lag when the stream is delayed.", "One index per tenant vs shared indexes with a tenant field: per-tenant indexes isolate and delete cleanly, but thousands of tiny indexes cost heavily in overhead."],
    p: ["A missed delete event leaves a removed message searchable, which becomes a compliance incident.", "A burst import from a single tenant saturates the cluster and delays search for everyone sharing it."],
    v: "Post a message with a unique word, measure seconds until it appears in search, edit it to a different word and delete it; the index must reflect each change within the freshness target.",
    dep: ["message-store", "job-queue"]
  },
  "query-parser": {
    s: "Turns what a person types into a structured query with terms, phrases, and filters such as channel, author, date range and has-file, and supports suggestions as they type.",
    d: "The parser separates free text from operators like from, in, before, has, and quoted phrases, resolves names to IDs (a person's display name to a user ID, a channel name to a channel ID), and builds a query for the search cluster. Resolution must respect who can see the entities. It handles stemming, language differences, typos, and special characters in code or URLs. Autocomplete suggests filters and entities from recent activity. Ambiguous names, renamed channels and former employees are recurring edge cases.",
    k: ["Strict operator syntax vs natural language: operators are precise and predictable, but most users never learn them; natural parsing helps but misfires.", "Resolve names at query time vs store them in the index: query-time resolution reflects renames, but adds lookups and ambiguity."],
    p: ["Suggesting entity names from a global list shows people and private channels the asker should not know about.", "Aggressive stemming breaks searches for identifiers and code where exact tokens matter."],
    v: "Search with a user filter, a channel filter and a date range for a known message, then rename the channel and repeat; the same message is found both times and no suggestion lists inaccessible channels.",
    dep: ["search-indexer", "permission-filtering"]
  },
  "permission-filtering": {
    s: "Guarantees that search results contain only content the asker is currently allowed to read, evaluated against live membership and policy.",
    d: "Two approaches exist: attach access fields (channel IDs, member sets, visibility) to indexed documents and filter by the asker's accessible channels, or retrieve candidates and check each against the permission service. Index-side filtering is fast but needs updates whenever membership changes; post-filtering is always current but wastes work and breaks result counts and paging. Many systems combine: filter by channel list in the query, then verify the top results. Guest accounts, shared channels and removed members all stress this boundary.",
    k: ["Filter inside the search engine vs post-filter results: in-engine filtering is fast and paginates properly, while post-filtering is always correct but slow and distorts counts.", "Include accessible channel IDs in the query vs per-document ACLs: channel lists are compact for most users, but explode for admins or users in thousands of channels."],
    p: ["A member removed from a channel still sees its messages in search until the index permissions update.", "Result counts and facets computed before filtering reveal how many hidden matches exist."],
    v: "Remove a user from a private channel containing a unique term and search for it immediately as that user: zero results, no count hint, and the same search succeeds for a remaining member.",
    dep: ["permission-evaluator", "membership", "search-indexer"]
  },
  "ranking": {
    s: "Orders search results by relevance and usefulness, combining text match with recency, the asker's relationship to the author and channel, and engagement signals.",
    d: "A base text-relevance score is combined with features: how recent the message is, whether it is in a channel the user is active in, whether the author is a frequent contact, whether the message was pinned, reacted to or replied to. Models may be hand-tuned or learned from clicks. Results are grouped by conversation or shown as messages, with snippets that highlight matches. Ranking must be fast, explainable enough to debug, and must not use signals that leak other people's private activity.",
    k: ["Recency-heavy ordering vs relevance-heavy: recency fits finding what was just said, while relevance fits finding a decision made last year.", "Personalized signals vs the same ranking for everyone: personalization finds the right message quicker, but is harder to reproduce when debugging a complaint."],
    p: ["Ranking that boosts by reaction counts from private channels can reveal that a hidden conversation is popular.", "Tuning on click logs rewards what is shown first, so the ranker reinforces its own mistakes."],
    v: "Run a set of known-answer queries (a decision, a person's recent post, a pinned message) and measure whether the target appears in the top three; compare before and after each ranking change.",
    dep: ["search-indexer", "query-parser"]
  },
  "reindexing": {
    s: "Rebuilding or backfilling the search index from the message store after a schema change, cluster migration, outage or tenant import.",
    d: "A reindex job reads messages in batches by workspace and time, rebuilds documents and writes them to a new index, while live updates continue to flow into both old and new until cutover. Throttling protects the message store and the cluster. Progress is checkpointed so failures resume. Deleted content must be skipped and retention honored, or the new index resurrects removed data. For very large tenants it takes days, so it runs at low priority.",
    k: ["Build a new index and swap vs update in place: swapping is safe and reversible, but needs double storage during the build.", "Dual-write during rebuild vs freeze and catch up: dual writing avoids a gap, but doubles load; catch-up is simpler but needs an event log retained long enough."],
    p: ["A backfill that reads from the message store without honoring deletions resurrects purged messages into search.", "An unthrottled rebuild slows the primary datastore and affects sending."],
    v: "Reindex a test workspace containing deleted, edited and migrated messages while posting live; after cutover the document count matches the store's visible messages and no deleted content is searchable.",
    dep: ["search-indexer", "message-store", "deletion-engine"]
  },
  "upload-service": {
    s: "Accepts files from clients and apps, enforces size and type limits, stores them and creates the file record that a message then references.",
    d: "Clients upload directly to object storage through a signed, short-lived URL, or through the service for small files. Large files use resumable, chunked transfer. After upload the service records metadata (name, size, type, owner, workspace), triggers scanning and previews, and returns a file ID to attach to a message. Quotas and plan limits apply. A failed upload must not leave a file visible but empty, and a file that is never attached should expire.",
    k: ["Direct-to-storage upload vs proxied through the service: direct upload saves bandwidth and scales, but moves validation and authorization into signed URL design.", "Attach on upload vs attach on send: attach on send avoids orphaned shares, but lets files sit unreferenced and needs cleanup."],
    p: ["A signed URL with a long lifetime or broad scope lets someone upload to or read from other people's paths.", "Orphaned uploads from abandoned drafts accumulate and consume storage that is never reclaimed."],
    v: "Upload a large file over a connection that drops midway; the transfer resumes, the final size and checksum match, and an upload attempted with an expired URL is rejected.",
    dep: ["file-store", "malware-scanning", "rate-limiter"]
  },
  "file-store": {
    s: "Durable storage for file contents, kept apart from message data, with encryption, lifecycle rules and links from file records to the conversations that shared them.",
    d: "Files live in object storage keyed by an opaque ID, encrypted at rest, sometimes with per-workspace keys. The database holds metadata and a list of channels where the file was shared. Deduplication by content hash saves space but complicates deletion and per-tenant keys. Lifecycle rules move cold files to cheaper tiers and delete expired ones. Egress is served through a CDN or signed URLs. Deletion has to remove every copy: the object, previews, search text and caches.",
    k: ["Content-hash deduplication vs a separate object per upload: dedup saves storage, but makes deletion, legal hold and per-tenant encryption harder to guarantee.", "Public CDN with unguessable URLs vs authenticated delivery: public links are fast and cacheable, but anyone with the link can read the file."],
    p: ["A deleted file still reachable through a cached CDN URL remains readable long after users believe it is gone.", "Deduplicated blobs shared across tenants complicate a customer's right to verified deletion."],
    v: "Upload a file, share it, delete it, then request its URL again and from the CDN edge; both must fail, and a storage listing must show no remaining copies including previews.",
    dep: ["upload-service", "key-management"]
  },
  "previews": {
    s: "Generates thumbnails, rendered first pages, text snippets and playable transcodes of uploaded files so people can see content without downloading it.",
    d: "After upload, a worker pool in a sandbox decodes images, renders documents, extracts text and creates smaller derivatives, storing them next to the original. The same extracted text feeds search. Rendering untrusted files is a major attack surface, so workers are isolated, limited in time and memory, and have no network access. Previews must follow the original's permissions and deletion. Failures must degrade to a generic icon instead of blocking the message.",
    k: ["Generate eagerly at upload vs lazily on first view: eager previews are instant but waste work on files nobody opens; lazy saves compute but makes first view slow.", "In-process decoding vs isolated sandboxed workers: isolation contains exploits from hostile files, at the cost of complexity and per-job overhead."],
    p: ["A crafted file that exhausts memory in the renderer takes down the preview service for every tenant.", "Preview images served without the original's access check leak files that were later made private."],
    v: "Upload an image, a long document and a deliberately malformed file; the first two produce correct previews, the third falls back to an icon within the timeout and the worker stays healthy.",
    dep: ["upload-service", "file-store", "job-queue"]
  },
  "malware-scanning": {
    s: "Scans uploaded files for known malicious content and blocks, quarantines or flags them before other people can download them.",
    d: "On upload a scanner inspects the file with signature and behavior engines, sometimes detonating in a sandbox, and records a verdict. Files are quarantined until a verdict, or available with a warning if scanning is slow. Verdicts can change as signatures update, so rescans occur and can remove files already shared. Enterprise customers may plug in their own scanning or content inspection service. Scanning large archives and encrypted documents is hard and is limited by size and depth.",
    k: ["Block until scanned vs allow with a warning: blocking is safer but delays legitimate files; allowing is fast and risks exposure during the scan window.", "Built-in scanning vs customer-supplied inspection hooks: hooks fit regulated customers' policies, but add latency and an external failure dependency."],
    p: ["Files over the scan size limit are silently skipped, which attackers learn to exploit.", "A scanner outage that fails open lets everything through unnoticed."],
    v: "Upload a standard harmless antivirus test file; it must be blocked or quarantined with a visible reason, and uploading a clean file during a simulated scanner outage must follow the documented fail-closed or fail-open policy.",
    dep: ["upload-service", "job-queue"]
  },
  "file-access-control": {
    s: "Decides who may view or download a file, based on the channels it was shared into, the viewer's membership and workspace policies.",
    d: "A file has no inherent audience; access is derived from the conversations it appears in. A user can open it if they can read any channel or direct message that contains it, or if they own it. Unsharing, deleting the message or removing the viewer from the channel changes access. Download controls may block saving on managed devices. Guests may see only files from their channels. Evaluation happens on each request, and signed links used outside the app must expire quickly.",
    k: ["Access derived from shares vs explicit file ACLs: derivation matches how people think and needs no extra admin work, but checks must scan the file's share list.", "Short-lived signed links vs authenticated requests only: signed links work with plain download tools and caches, but can be forwarded while valid."],
    p: ["Deleting a message does not remove the file's other shares, so the file stays reachable in a channel the poster forgot.", "Cached file responses ignore a later membership change and keep serving the removed member."],
    v: "Share a file into a private channel, remove a member, and fetch the file as that member by URL and through the API; both are denied, and a remaining member succeeds.",
    dep: ["permission-evaluator", "file-store", "membership"]
  }
});
