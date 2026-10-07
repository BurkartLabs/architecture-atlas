// Details for the graphics editor plate, part 3: multiplayer, sync, commands and undo.
ATLAS.details("graphics-editor", {
  "multiplayer-server": {
    s: "The service that hosts one live document per room: it accepts operations from every connected client, resolves their order, persists the result and broadcasts it.",
    d: "Each open document maps to one in-memory authoritative state on one server process, so all writers meet in one place. Clients connect over a persistent socket, send operations and receive the merged stream. The server validates operations against the schema and access rules, applies them, appends to a journal and periodically snapshots. A router sends all clients of a document to the same process. It is hard because one popular document must scale to hundreds of editors on a single process, because the process can fail mid-session, and because documents must be loaded and evicted quickly.",
    k: ["One authoritative process per document vs peer-to-peer merging: a single authority gives simple ordering and access control, but is a scaling limit and a failover problem.", "Applying operations in memory first, persisting asynchronously vs synchronous writes: asynchronous is fast but loses a brief window on crash."],
    p: ["A server crash between acknowledgment and journal write silently drops accepted edits.", "Routing changes during deploys put two processes in charge of one document."],
    v: "Connect 100 simulated editors to one document, kill the server process mid-session and confirm clients reconnect to a new process, converge on identical state, and no acknowledged edit is missing after reload.",
    dep: ["sync-protocol", "merge-semantics", "server-snapshots-and-compaction", "realtime-access-control"]
  },
  "sync-protocol": {
    s: "The wire format and message flow between client and server: handshake, initial state load, operation streaming, acknowledgments, resync and version negotiation.",
    d: "A client opens a connection with a token and document id and receives the current state, usually a snapshot plus recent operations. After that, operations flow both ways as small property-level changes with sequence numbers. Clients apply their own edits optimistically and reconcile on acknowledgment. Heartbeats detect dead connections, and a resync path rebuilds state when sequences diverge. Messages are batched and compressed. It is hard because loading a very large document must be streamed in priority order, and because protocol changes must interoperate with older clients still open in browser tabs.",
    k: ["Property-level operations vs whole-node updates: property-level merges more edits and uses less bandwidth, but the protocol has more message types.", "Optimistic local apply vs waiting for the server: optimistic feels instant, but must handle correction when the server's order differs."],
    p: ["A client misses a message after a network blip and drifts silently because sequence numbers are not checked.", "An old tab speaks a previous protocol version and corrupts state after a server upgrade."],
    v: "Cut a client's network for ten seconds during active edits from others, restore it and confirm the client detects the gap, resyncs, and ends with a state byte-identical to the server's.",
    dep: ["merge-semantics", "change-tracking", "document-schema-and-migration"]
  },
  "merge-semantics": {
    s: "The rules that combine concurrent edits to the same document into one result that every client reaches: per-property last-writer wins, ordered sequences and tree moves.",
    d: "Most design tools use a server-ordered model of property registers: each node property holds one value and the later operation wins, which needs no heavy conflict machinery. Child order uses fractional positions, so inserts between two siblings do not renumber the list. Moves of nodes between parents need cycle prevention and tie-breaking when two users move the same node. Deletions remove a node and its subtree; later edits to deleted nodes are discarded. It is hard because text content needs finer merging than whole values, and because intent, such as two people resizing an auto layout frame, is not captured by property values.",
    k: ["Server-ordered last-writer-wins vs a full operational transform or text-style CRDT: simple registers are cheap and predictable, but concurrent edits to one property lose one side's work.", "Fractional ordering keys vs integer indices: fractional keys avoid renumbering, but keys grow long after many inserts in one spot."],
    p: ["Two users reparent each other's containers and the tree briefly forms a cycle.", "Fractional keys grow without bound when items are repeatedly inserted at the same place, bloating the file."],
    v: "Have two clients concurrently move the same node, edit the same color and insert layers at the same index. Confirm both converge to identical trees with no cycle, and sibling order is deterministic.",
    dep: ["node-identity-and-references", "scene-graph", "z-order-and-layering", "property-model"]
  },
  "presence-and-cursors": {
    s: "Ephemeral per-user state shared live: cursor position, selection, viewport, current tool and name color, shown on the canvas and in a participant list.",
    d: "Presence is sent on a separate lightweight channel from document operations, at a throttled rate, and is never persisted. Each client draws other participants' cursors, selection outlines and optionally viewport frames on the overlay, interpolating between updates so movement looks smooth. A follow mode locks one user's viewport to another's. Participants who stop sending are expired after a timeout. It is hard because updates scale with the square of participants, and because cursor positions must be translated through each viewer's coordinate space, and hidden when the owner is outside the visible area.",
    k: ["Sending presence at a fixed rate vs on change only: fixed rate is simple and smooth, but wastes bandwidth when users are idle.", "Showing everyone's cursors vs limiting to nearby ones: limiting reduces clutter in big sessions, but hides the sense of who is working where."],
    p: ["Presence updates share a queue with document operations, so a burst of cursors delays real edits.", "Ghost cursors remain after a laptop sleeps because expiry relies on a clean disconnect."],
    v: "Join with 50 simulated participants moving cursors constantly and edit a shape. Confirm cursors move smoothly, a closed lid removes a cursor within the timeout, and edit latency does not rise measurably.",
    dep: ["sync-protocol", "overlay-renderer", "selection-and-marquee"]
  },
  "offline-and-reconciliation": {
    s: "Letting a client keep editing without a connection, storing operations locally, and merging them with everyone else's changes on reconnect, with clear handling of conflicts.",
    d: "While offline, the client keeps applying edits to its local state and queues them in durable storage. On reconnect it fetches the server changes since its last known version and replays its own queue on top, using the same merge rules as live editing. Edits to nodes deleted meanwhile are dropped, and the user is told. A long offline period can be large, so the client may rebase against a new snapshot. It is hard because merging weeks of changes can overwrite colleagues' work, because schemas may have changed in between, and because users need to see what was lost.",
    k: ["Replaying a local queue vs diffing final states: replay preserves intent per operation, but is slow and fragile after long gaps; diffing is simple but loses order.", "Allowing offline edits to anything vs only to documents already cached: broad offline use is friendly, but needs far more local state and testing."],
    p: ["A week-old offline queue replays against moved and deleted nodes and silently discards work with no report.", "The queue lives in volatile storage and is lost when the browser clears site data."],
    v: "Edit a document offline for an hour while another user restructures it online, then reconnect. Confirm non-conflicting edits survive, the dropped edits are listed with their node names, and the final state matches on both clients.",
    dep: ["sync-protocol", "merge-semantics", "local-cache", "offline-first-consistency"]
  },
  "server-snapshots-and-compaction": {
    s: "Periodic condensation of the operation journal into a compact full-state snapshot, so documents load quickly and the journal does not grow without bound.",
    d: "The server appends every accepted operation to a journal, then at intervals writes a snapshot of the whole document state and truncates operations older than it. Loading a document reads the latest snapshot plus the journal tail. Compaction also drops overwritten property values and deleted subtrees, and may rebalance fractional keys. Snapshots feed version history, thumbnails and the API. It is hard because compacting a document while people are editing must not lose or reorder operations, and because snapshot size and load time grow with document size.",
    k: ["Frequent snapshots vs rare snapshots: frequent snapshots give fast loads and short replay, but cost write bandwidth and compute on large files.", "Keeping the full journal for history vs compacting: a full journal supports fine-grained history, but loads slowly and grows without limit."],
    p: ["Compaction runs concurrently with writes and omits operations accepted during the snapshot.", "A snapshot is written non-atomically and a crash leaves a half-written file as the latest."],
    v: "Generate ten million operations on one document, compact while editors keep working and reload. Confirm load time stays within the budget, no accepted operation is missing, and the journal shrank accordingly.",
    dep: ["file-format", "multiplayer-server", "file-integrity"]
  },
  "realtime-access-control": {
    s: "Enforcement of roles on every live operation: viewers cannot write, commenters write only comments, and revoked sessions are cut off, with validation of each operation's content.",
    d: "On connection the server resolves the user's role and attaches it to the session. Every inbound operation is checked against role, the target node's lock state and schema validity before being applied. Some properties may be restricted even for editors, such as library-managed components or locked layers. Role changes and revocations arrive on a control channel and update or close live sessions. It is hard because operations from a plugin or API act with the user's role, because clients can send crafted messages, and because validation must be cheap enough to run on every operation.",
    k: ["Validating every operation server-side vs trusting client checks: server validation is the only secure choice, but costs CPU on the hot path.", "Cutting a session instantly vs at the next token refresh: instant is safer, but more disruptive to people legitimately finishing work."],
    p: ["A viewer's client is modified to send write operations and the server accepts them because only the UI hid the tools.", "An operation referencing a locked node is accepted as the lock check uses stale state."],
    v: "As a viewer, send a hand-crafted edit operation over the socket. Confirm the server rejects it, logs the attempt and leaves the document unchanged, while the same operation from an editor session succeeds.",
    dep: ["permissions-and-sharing", "sync-protocol", "document-schema-and-migration"]
  },
  "command-system": {
    s: "The single path through which every edit passes: a named, parameterized change that is validated, applied to the model, recorded for undo and sent to sync.",
    d: "A command describes a change as operations on node properties, structure or content, along with enough information to invert it. The system applies it inside a transaction, updates the model, emits change events for the renderer and panels, and forwards the resulting operations to the sync layer. Tools, panels, shortcuts and plugins all go through it. A central path means save, sync, undo and change tracking never miss an edit. It is hard because every new feature must express its changes as operations, and because commands must stay valid when other users have changed the same nodes.",
    k: ["Commands as inverse-capable operations vs state snapshots: operations are compact and merge with sync, but each needs a correct inverse.", "One command path for all sources vs separate local paths: one path guarantees consistency, but makes quick local-only previews harder."],
    p: ["A feature mutates the model directly, so its edits are neither undoable nor synced.", "A command's inverse is computed from stale values and restores the wrong data after remote changes."],
    v: "Perform every kind of edit from tool, panel, shortcut and plugin. Confirm each appears in the undo stack, reaches a second client and survives reload, and no edit changes the file without a recorded operation.",
    dep: ["property-model", "scene-graph", "change-tracking", "sync-protocol"]
  },
  "undo-redo-stack": {
    s: "The ordered history of local changes that can be reversed and replayed, with grouping so one user action undoes as one step.",
    d: "Each completed transaction is pushed on an undo stack with the inverse operations needed to reverse it; undo applies the inverse and pushes the original onto a redo stack. A new edit clears the redo stack. Selection and viewport changes may be recorded so undo restores what the user was looking at. Memory is bounded by step count and by size, particularly for raster edits. It is hard because raster changes need tile deltas rather than whole-layer copies, and because multiplayer makes a plain stack incorrect when others have edited the same thing in between.",
    k: ["Inverse operations vs full snapshots: inverses are small and work in multiplayer, but are error-prone; snapshots are safe but costly for large documents.", "Unlimited history vs a capped stack: unlimited helps users recover, but raster history can use gigabytes."],
    p: ["Redo applies after an unrelated new edit because the redo stack was not cleared.", "Undo steps for brush strokes each keep full-layer copies and exhaust memory after a few dozen strokes."],
    v: "Make 100 mixed edits, undo all, then redo all. Confirm the document is byte-identical at both ends and to its original, and that memory use stays under the stated budget with raster edits included.",
    dep: ["command-system", "transaction-coalescing", "tiled-image-store"]
  },
  "per-user-undo": {
    s: "Undo that reverses only your own changes in a shared document, without disturbing other people's edits that came after, and without producing states nobody made.",
    d: "Each client keeps its own stack of its own operations. Undoing sends the inverse as a new operation, so it merges with everyone else's changes in the normal way. If another user has since changed the same property, the undo either restores the old value, skips that part or does nothing, by a stated rule. Deleted nodes are restored with their original ids. It is hard because an inverse computed earlier may not apply cleanly later, and because users must understand why an undo seems to do nothing.",
    k: ["Restoring the old value even if someone else changed it vs skipping contested properties: restoring respects the user's intent but may erase a colleague's newer edit.", "A global shared history vs per-user stacks: global is simpler, but lets one person undo another's work."],
    p: ["Undoing a delete restores the node under a parent that no longer exists, and it lands at the root.", "An undo overwrites a colleague's edit made seconds later, with no indication."],
    v: "User A moves a box, user B recolors it, then A undoes. Confirm the box returns to its original position while B's color remains, and neither client shows an intermediate state.",
    dep: ["undo-redo-stack", "merge-semantics", "node-identity-and-references"]
  },
  "transaction-coalescing": {
    s: "Grouping many small changes into one atomic, undoable and syncable unit: a drag, a typing burst, a brush stroke or a multi-node operation.",
    d: "A transaction opens at the start of a gesture, collects operations as they happen, and commits once at the end. Intermediate states can be applied locally for preview and sent to peers at a throttled rate, while history receives only the final step. Typing and scrubbing merge consecutive edits of the same property within a time window. Aborting rolls back every operation in the transaction. It is hard because streaming intermediate state to collaborators sends noise, but withholding it makes drags look frozen, and because a crash mid-transaction must not leave half-applied results.",
    k: ["Streaming intermediate drag states vs sending only the final state: streaming lets others watch, but costs bandwidth and can show bad intermediate geometry.", "Time-window merging of edits vs explicit boundaries: merging by time needs no tool support but can join unrelated edits."],
    p: ["A tool forgets to commit on pointer-up when focus is lost, and the next edit joins the previous transaction.", "Merging typing in two different fields into one undo step reverts both at once."],
    v: "Drag a slider through 200 values while a collaborator watches, then undo. Confirm peers saw smooth intermediate updates, the undo stack received one step, and one undo restored the original value.",
    dep: ["command-system", "sync-protocol"]
  },
  "change-tracking": {
    s: "Recording exactly which nodes and properties changed, so rendering, panels, saving, sync and library checks update only what is affected.",
    d: "The command system emits fine-grained change events: node created, removed, reparented, property set. Subscribers register for the nodes or properties they care about. A dirty set accumulates affected nodes until the end of the frame, at which point the renderer, the layers panel and the inspector refresh. Derived values such as layout and component overrides propagate dirtiness through dependencies. It is hard because one property change can invalidate many dependent values, such as an auto layout change moving siblings and an instance override, and because missed events produce stale visuals.",
    k: ["Fine-grained property events vs coarse node-level dirtiness: fine-grained saves work in big documents, but costs more bookkeeping and subscribers.", "Pushing events immediately vs batching per frame: batching avoids repeated work, but delays observers by up to one frame."],
    p: ["A derived-value dependency is not registered, so an override change fails to refresh instances until reload.", "Subscribers that never unsubscribe leak memory across thousands of opened pages."],
    v: "Change one component property in a file with 10,000 instances. Confirm exactly the affected instances repaint, unaffected nodes do not, and the invalidation count equals the instance count.",
    dep: ["scene-graph", "property-model", "dirty-rectangles"]
  },
  "snapshot-checkpoints": {
    s: "Full-state captures taken at intervals or before risky operations, used to recover from corrupt history, bound replay cost and offer named restore points.",
    d: "A checkpoint serializes the document state at a known operation sequence number. Local checkpoints are kept before large operations such as library updates, imports or merges, so those can be reverted even when operation-based undo is impractical. Server checkpoints seed loading and version history. Incremental checkpoints share unchanged subtrees with earlier ones to save space. It is hard because large documents make full captures slow, so they must be taken off the main thread without blocking edits, and because restoring must reconcile with a live session.",
    k: ["Structural sharing between checkpoints vs independent copies: sharing saves memory and time, but requires immutable or copy-on-write data.", "Automatic checkpoints before risky actions vs relying on undo: checkpoints are safer for bulk changes, but cost time and storage."],
    p: ["A checkpoint is taken on the main thread and freezes the editor for seconds on large files.", "Restoring a checkpoint discards remote edits that arrived after it was taken."],
    v: "Run a library update that changes 5,000 instances, then restore the checkpoint taken before it. Confirm the document equals its prior state exactly, and edits made by others since then are preserved.",
    dep: ["undo-redo-stack", "server-snapshots-and-compaction", "file-format"]
  },
});
