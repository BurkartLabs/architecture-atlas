// Details for the issue tracker plate, part 1: boards and backlogs, queries, reporting, notifications.
ATLAS.details("issue-tracker", {
  "backlog-ranking": {
    s: "Keeps every item in a user-controlled order so a drag on a backlog or board persists, survives concurrent edits and is cheap to store.",
    d: "Each item carries a rank value that sorts it within a project or board. Inserting between two neighbors computes a value between theirs, so only one item is written per drag. Ranks are strings or fractions in a space that can be rebalanced when gaps run out. The server, not the client, assigns the new rank from the neighbors the client names, which lets two people drag at once without overwriting each other. It is hard because ordering must stay consistent across several boards and filtered views of the same items.",
    k: ["Fractional ranks vs integer positions: inserting touches one row instead of renumbering the list; the cost is that gaps eventually exhaust and a background rebalance is needed.", "Server-computed rank from named neighbors vs client-sent absolute position: concurrent drags merge sensibly; the client must send stable neighbor ids and handle a stale neighbor being moved or deleted."],
    p: ["Two items end up with identical ranks after concurrent inserts, and their relative order flips on every reload.", "A rebalance job rewrites ranks for a large project and floods the change history and notifications."],
    v: "Drag an item between two others in two browser sessions at nearly the same moment, reload both, and confirm both sessions show the same order and only the moved items have a new rank value.",
    dep: ["rank-store"]
  },
  "kanban-board": {
    s: "Renders items as cards in columns that map to workflow states, with optional swimlanes and work-in-progress limits, and turns drags into transitions.",
    d: "A board is a saved query plus a mapping from columns to statuses. Cards are grouped by column and optionally by lane such as assignee or epic. Dropping a card into another column asks the workflow for the matching transition, so guards and required fields still apply, and a refused move snaps back. Column limits are checked at drop time and shown as warnings. The hard part is that one column may map to several statuses, several boards may show the same item, and the board must update live when others edit.",
    k: ["Columns mapped to many statuses vs one status per column: teams can simplify the board without touching the workflow; a drop into a multi-status column must choose a target and can surprise people.", "Hard vs soft work-in-progress limits: hard limits block the move and enforce discipline; soft limits only warn and avoid blocking urgent work, but get ignored."],
    p: ["A drop that needs a screen of required fields silently fails because the board has no place to ask for them.", "Live updates arrive out of order and a card appears in two columns until the next refresh."],
    v: "Drag a card to a column whose transition has a guard the user fails, and confirm the card returns with a reason shown. Then drag it where allowed and confirm the item's status and history record changed.",
    dep: ["backlog-ranking", "transitions", "saved-filters"]
  },
  "sprint-planning": {
    s: "Groups items into time-boxed iterations with a committed scope, and handles starting, closing and carrying unfinished work into the next one.",
    d: "A sprint is an object with dates, a goal and a set of member items. Adding an item records the membership with a timestamp, because later reports need to know what was in scope at the start versus added mid-sprint. Closing a sprint moves unfinished items to the next sprint or backlog and freezes the committed totals. Capacity checks compare estimates against team availability. The difficulty is that an item can belong to several sprints over time, so membership is history, not a single field.",
    k: ["Membership as timestamped events vs a single current-sprint field: reports can reconstruct scope creep; every query for current sprint becomes a join or a derived field.", "Auto-carryover on close vs manual triage: carryover saves effort and keeps nothing orphaned; it also hides chronic overcommitment unless carried items are flagged."],
    p: ["Closing a sprint with an unfinished child item leaves the parent counted as complete in velocity.", "Editing estimates after the sprint starts rewrites the committed total and makes the burndown meaningless."],
    v: "Start a sprint with five items, add one and remove one mid-sprint, close it, and confirm the report shows five committed, one added, one removed, with unfinished items moved to the next sprint.",
    dep: ["field-definitions", "change-history", "backlog-ranking"]
  },
  "timeline-view": {
    s: "Lays items on a calendar axis by start and due dates, grouped by parent, showing overlaps and dependency arrows for roadmap-style planning.",
    d: "The view reads date fields and hierarchy, groups items under epics or releases, and draws bars with dependency links between them. Dragging a bar edits the date fields through the same write path as any other edit. Items without dates are listed separately or inferred from their children or sprint. Computing and rendering must handle thousands of bars, so the server returns only the visible window and the client virtualizes rows. The difficulty is that dates are optional, may disagree between parent and child, and dependencies can contradict them.",
    k: ["Parent dates derived from children vs set independently: derived dates never disagree, but a plan cannot be written top-down; independent dates allow top-down plans and invite inconsistency.", "Server-side windowing vs loading everything: large roadmaps stay responsive; panning needs round trips and dependency arrows crossing the window edge need extra data."],
    p: ["A bar dragged past a blocker is saved without warning and the dependency line now runs backward.", "Items with no dates vanish from the view and people assume they are not planned."],
    v: "Create a parent with two dated children, drag one child later, and confirm the parent's rollup range extends and any dependent item is flagged as starting before its blocker ends.",
    dep: ["hierarchy-levels", "dependency-graph", "rollups", "field-definitions"]
  },
  "saved-views": {
    s: "Stores a named combination of query, columns, grouping and sort order that a person or team can reopen, share and subscribe to.",
    d: "A saved view bundles the filter expression with presentation settings: visible columns, sort keys, grouping, and the board or list layout. It has an owner and a sharing scope of private, team or everyone. Opening it re-runs the query live. When fields or statuses referenced by the view are renamed or removed, the stored form must either follow the rename by id or degrade visibly. The hard part is that views are small configuration objects that accumulate by the thousands and silently break as the schema changes.",
    k: ["Referencing fields by id vs by name: renames never break the view; stored text is unreadable to humans and import and export need translation.", "Per-user vs shared defaults: personal views stay tidy; shared ones become the team's definition of work and need an owner who keeps them current."],
    p: ["A deleted custom field leaves the view returning an error instead of results, and people stop trusting it.", "A shared view edited by one person changes what the rest of the team sees without notice."],
    v: "Save a view filtering on a custom field, rename that field, and confirm the view still opens with the same results and the new name shown in its column header.",
    dep: ["query-language", "field-definitions", "groups-and-roles"]
  },
  "bulk-edit": {
    s: "Applies one change, such as a field value, transition or move, to many selected items at once with a preview, per-item validation and partial-failure reporting.",
    d: "The user selects items from a result set and chooses operations. The server expands the selection, checks the caller's permission and field validity for each item, and queues the operation so a large selection does not hold a request open. Each item succeeds or fails on its own, because workflows, required fields and permissions differ between items. Progress and a failure list are shown afterward. The difficulty is validity: an operation valid for most items is invalid for a few, and the combination of transitions and field contexts is unbounded.",
    k: ["Run asynchronously per item vs one transaction: one bad item never blocks the rest; partial results mean cleanup of half-applied intent.", "Preview of invalid items before applying vs apply and report: previews prevent surprises but must run the same validation twice and can be stale by apply time."],
    p: ["A bulk transition fires notifications and automation rules for every item and floods people and the rule engine.", "A selection defined by a live query is re-evaluated at apply time and includes items that were not on screen."],
    v: "Select two hundred items, of which three lack a required field for the chosen transition, and confirm one hundred ninety-seven change, three are listed as failed with reasons, and history shows one entry per changed item.",
    dep: ["background-jobs", "transitions", "field-definitions", "rate-limiting"]
  },
  "query-language": {
    s: "A text language for selecting items by field, state, relation, date and user, with boolean operators, functions and ordering, used by boards, filters, rules and the API.",
    d: "Users write expressions like a status in a set, assignee equal to the current user, and updated within the last seven days. The grammar covers comparison, set membership, text match, relative dates, functions that expand to values at run time, history operators, and sort clauses. Field names resolve through the field model so renamed or custom fields work. Errors are reported with position and suggestions, and an autocomplete service uses the same grammar. The difficulty is the surface area: every field type needs operators, and every function needs defined semantics and cost.",
    k: ["A text language vs only a visual builder: power users express complex logic and share it as plain text; beginners need the builder and both must stay in sync.", "Functions evaluated per query vs materialized values: results stay fresh; expensive functions such as membership expansion can make one query very slow."],
    p: ["A clause on a field that exists only in some projects silently matches nothing in the others.", "Relative date functions evaluate in the server time zone and give wrong results for users elsewhere."],
    v: "Run a query combining a set of statuses, the current user and a relative date, and compare its result list with a hand-written SQL equivalent against the store; confirm the two return the same item keys.",
    dep: ["field-definitions", "query-compiler"]
  },
  "query-compiler": {
    s: "Parses a query into a syntax tree, validates it against field types and permissions, and translates it into a plan for the store and the search index.",
    d: "The compiler resolves names to field ids, checks that operators fit field types, expands functions, and then chooses a backend. Simple filters on indexed fields go to the relational store or the search index; text and complex combinations go to the search engine. It injects the caller's permission restrictions as an additional clause, applies limits on result size and cost, and can return an explain plan. The hard part is that two backends must give the same answer, and a clause that cannot be pushed down has to be evaluated after retrieval.",
    k: ["Compile to the search index vs the relational store: the index handles text and wide filters fast but lags; the store is current but struggles with arbitrary combinations.", "Reject expensive queries vs run with a timeout: rejection is predictable and protects the shared service; timeouts allow legitimate large reports at the cost of unpredictable failures."],
    p: ["The index and store interpret an operator differently, so the board and the filter page show different counts for the same query.", "A user query with many nested clauses produces a plan so large it times out the search cluster."],
    v: "Compile one query with a known mixture of indexed and non-indexed clauses, check the explain output chooses the expected backend, and verify the result count equals a count taken directly from the item store.",
    dep: ["query-language", "field-value-storage", "search-index-pipeline", "search-permission-filtering"]
  },
  "filter-builder": {
    s: "A form-based editor that assembles queries from field, operator and value pickers, so users who do not know the language can build and refine filters.",
    d: "The builder reads the field catalog and offers operators and value choices that fit each field type: user pickers, status lists, date ranges. Every change produces a query string and a live result count, and a query written by hand can be loaded back into the builder when it uses only constructs the builder supports. Value suggestions come from the same service as the language's autocomplete. The difficulty is round-tripping: the builder must not rewrite or drop parts of a query it cannot represent.",
    k: ["Round-trip every query vs a builder subset: users move freely between modes; the builder must express everything or warn visibly when it cannot.", "Live result counts per edit vs counts on apply: instant feedback guides refinement; each edit costs a query against shared infrastructure."],
    p: ["Switching from text mode to the builder drops an unsupported clause and widens the result set without warning.", "A user picker offers former employees because suggestions ignore active state."],
    v: "Write a query by hand with one unsupported clause, open it in the builder, and confirm the unsupported part is preserved and marked rather than removed, and the result count is unchanged.",
    dep: ["query-language", "field-definitions", "field-contexts"]
  },
  "full-text-search": {
    s: "Finds items by words in titles, descriptions, comments and text fields, using an inverted index with stemming, phrase matching and per-field weighting.",
    d: "Text from items is analyzed into tokens, normalized for case, accents and word forms, and stored in an inverted index alongside structured fields. Queries combine text clauses with filters in one request. Highlighting returns snippets, and a typo-tolerant mode matches near misses. Comments and attachments may be indexed as child documents. The difficulty is analysis across languages and identifiers: item keys, file names and code tokens need tokenizers that differ from prose, and rich text must be flattened without markup.",
    k: ["One shared analyzer vs per-field analyzers: one is simple and consistent; per-field analysis tokenizes keys and prose correctly at the cost of more configuration.", "Index attachments vs only metadata: users find content in files; extraction is slow, costly and a security surface for malformed documents."],
    p: ["Searching for an item key such as a project prefix and number splits it into tokens and returns thousands of unrelated hits.", "Newly created items are missing from results for minutes because indexing runs behind a queue."],
    v: "Create an item containing a rare word in a comment, search for that word, and confirm the item is returned within the documented delay with the snippet highlighting the comment text.",
    dep: ["search-index-pipeline", "rich-text-fields", "search-permission-filtering"]
  },
  "search-ranking": {
    s: "Orders search results by relevance, blending text match, field weights, recency, the viewer's own activity and exact key matches.",
    d: "Scoring starts with a text relevance model, then boosts items whose key or title matches exactly, items the viewer reported, is assigned, or recently viewed, and items in states that are not closed. Per-field weights make a title match worth more than a comment match. A quick-search box and a full results page may use different recipes. Hard because ranking quality is subjective, personalization needs per-user signals, and tuning one query class can degrade another.",
    k: ["Personalized boosts vs identical ranking for everyone: people find their own work first; results differ between viewers, which makes support and reproduction harder.", "Hand-tuned weights vs learned ranking: weights are explainable and predictable; learned models need click data and are hard to debug."],
    p: ["Closed old items outrank open current ones because they have more comment text.", "Typing an exact item key does not put that item first because a text match elsewhere scores higher."],
    v: "Search for the exact key of an item and for a distinctive title phrase, and confirm the matching item is first in each case, with a closed duplicate with the same phrase ranked below the open one.",
    dep: ["full-text-search", "search-index-pipeline"]
  },
  "saved-filters": {
    s: "Persists a named query with an owner and sharing scope so boards, dashboards, subscriptions and rules can all refer to the same definition.",
    d: "A filter is a stored query string plus metadata: owner, scope and favorite flags. Other objects refer to it by id, so editing it changes every board and gadget that uses it. Sharing is evaluated against the permission model, and the stored query is re-run as the viewing user, not the owner, so two people see different results from the same filter. The difficulty is dependency: deleting or editing a filter affects objects the editor cannot see.",
    k: ["Reference by id vs copy on use: one edit updates every consumer; a careless edit breaks many boards at once.", "Run as the viewer vs run as the owner: viewers never see unauthorized items; subscription emails and rules need a defined identity and may differ from what the owner sees."],
    p: ["An owner leaves, the account is deactivated, and every board built on their filter stops loading.", "A filter that includes a function tied to the current user returns different items in a scheduled report than on screen."],
    v: "Share a filter that uses the current-user function with a second user, open it as both, and confirm each sees their own items while the board that uses it updates after the filter is edited.",
    dep: ["query-language", "groups-and-roles"]
  },
  "search-permission-filtering": {
    s: "Restricts every search and query result to items the caller may see, by adding permission clauses to the query and checking again on returned items.",
    d: "At query time the compiler turns the caller's identity into a filter: projects they can browse, security levels they hold, and items they are directly granted. This clause is applied inside the index query so counts and facets are correct. For safety, returned items may be re-checked against the authoritative permission model before display. Permissions change faster than index data, so the clause must come from the live model, not from copies stored on documents. The hard part is complexity: permission schemes with many projects and levels create very large clauses.",
    k: ["Filter inside the index vs filter after retrieval: correct counts and paging; the clause can be huge, whereas post-filtering is simple but leaks counts and breaks paging.", "Permissions stored on documents vs computed per query: stored values are fast but go stale and need reindexing on every permission change; computed values are current but cost more per query."],
    p: ["A user removed from a project still sees its items in search for several minutes because permission data was cached on the index.", "Facet counts include items the user cannot open, revealing that hidden work exists."],
    v: "Create an item restricted to one group, search for its unique title as a member and as a non-member, and confirm only the member sees it, and that result and facet counts for the non-member exclude it.",
    dep: ["permission-schemes", "item-level-security", "groups-and-roles", "search-index-pipeline"]
  },
  "burndown-charts": {
    s: "Plots remaining work against time within a sprint or release, rebuilt from the history of estimate and status changes rather than the current values.",
    d: "For each day the chart needs the remaining estimate of the committed scope on that day. It is computed by replaying change history: items added or removed from scope, estimate edits, and status changes that mark work done. Results are cached as daily snapshots. The ideal line is drawn from start to end. Hard because the answer depends on past states, scope changes appear as jumps that look like progress or regression, and time zones and non-working days shift the daily boundary.",
    k: ["Replay history on demand vs store daily snapshots: replay is exact and flexible; snapshots are fast and make old charts stable even after history is edited, but cannot answer new questions retroactively.", "Count points vs count items: points weight large work; items are robust to poor estimates but treat a one-hour fix like a month of work."],
    p: ["A late estimate change erases points that were burned, so the line jumps up on the last day.", "Items moved out of the sprint look like completed work if scope changes are not separated from finished status."],
    v: "Run a sprint with known scripted changes: ten points added at day one, two points added at day three, three points done at day four. Confirm the chart shows those values on those days.",
    dep: ["sprint-planning", "change-history", "estimation-and-velocity"]
  },
  "cycle-time-metrics": {
    s: "Measures how long items take between workflow states, such as in progress to done, and reports distributions and percentiles instead of averages.",
    d: "Each transition is a timestamped event in history. Cycle time is the interval between two chosen status categories; lead time runs from creation. Reports show a scatter of completed items, rolling averages, and percentile lines such as the eighty-fifth. Items that bounce between states have several intervals and rules must decide how to count them. Hard because workflows differ between projects, so metrics must be defined over status categories, and long-running unfinished items are missing from completed-only statistics.",
    k: ["Measure by status category vs by specific status: comparable across projects with different workflows; loses detail of individual stages.", "Percentiles vs averages: percentiles describe what to promise and resist outliers; averages are easier to explain but hide the long tail."],
    p: ["Items reopened after completion are counted twice or not at all, depending on the rule, and the figures drift between reports.", "Bulk-closing a stale backlog creates a spike of items with absurd cycle times."],
    v: "Transition a test item through known states with timestamps set a known number of hours apart, and confirm the report shows that exact elapsed time for the chosen start and end categories.",
    dep: ["change-history", "resolution-fields", "state-machine"]
  },
  "cumulative-flow": {
    s: "Stacks the count of items in each workflow stage over time so bottlenecks, growing queues and throughput are visible as the width of bands.",
    d: "For each day the report counts items per status category, built from state-change history, and draws the counts as stacked areas. A widening band marks a queue; parallel bands show steady flow. The query uses the board's filter and column mapping. It needs a daily snapshot or an efficient history scan because replaying every item's history for every day is costly on large projects. Hard because items are created, deleted and moved between filters, and the chart must reflect the filter as it was.",
    k: ["Pre-aggregated daily counts vs on-demand replay: fast and cheap to render; changing the filter or mapping requires recomputing the stored series.", "Count by column vs by status: columns match what the team sees; statuses are stable when the board is rearranged."],
    p: ["Deleting items rewrites the past because their history is gone, and earlier bands shrink.", "A column mapping change reclassifies all historical items and the chart shows an artificial jump."],
    v: "Move five items from one column to another on a known date, and confirm the band for the destination widens by five on that date while the source band narrows by five, with the total unchanged.",
    dep: ["kanban-board", "change-history", "state-machine"]
  },
  "dashboards": {
    s: "Pages of configurable gadgets such as filter results, charts and counters, each backed by a saved query and refreshed on its own schedule.",
    d: "A dashboard is a layout of gadgets; each gadget stores its type, settings and a reference to a filter. Rendering runs each gadget's query as the viewer, so the page can show different numbers to different people. Results are cached for a short time per gadget and viewer. Extension apps may supply additional gadget types. Hard because a page with twenty gadgets issues twenty queries, and one slow gadget must not block the rest or exhaust the search cluster.",
    k: ["Run as the viewer vs a cached shared result: viewers see only what they may; caching per viewer multiplies load, whereas a shared cache risks leaking restricted counts.", "Each gadget loads independently vs one page query: independent loading isolates slow gadgets; one combined request is more efficient but fails as a whole."],
    p: ["A gadget on a deleted filter shows an empty chart rather than an error, and the number is read as zero.", "A heavily shared dashboard with auto-refresh on every gadget generates constant load on the index."],
    v: "Open a dashboard with a filter-results gadget as two users with different permissions and confirm each sees only items they can open, and that one gadget with a deliberately slow query does not delay the others.",
    dep: ["saved-filters", "query-compiler", "app-framework"]
  },
  "estimation-and-velocity": {
    s: "Captures size estimates on items and derives how much a team finishes per iteration, so plans can be sized from past throughput.",
    d: "Estimates are fields such as story points or time. Velocity sums the estimates of items completed in each sprint, and forecasts take a rolling average or range. Rollups aggregate child estimates to parents. Teams may use points, hours or just item counts, and the tracker must handle mixed units across projects without adding unlike things. Hard because estimates change after the fact, items complete partially, and the number is easily misused as a performance target.",
    k: ["Points vs time estimates: points abstract from individuals and calendars; time maps to capacity and billing but invites false precision.", "Count completion at the final transition vs proportionally: simple and unambiguous; proportional credit reflects partial work but is hard to define."],
    p: ["Changing the estimation field's unit mid-project mixes old and new values in totals.", "Items split to match a point target inflate velocity without delivering more."],
    v: "Complete a sprint with items of known estimates, one unfinished, and confirm the velocity equals the sum of the completed estimates only and the forecast range uses the last several sprints.",
    dep: ["field-definitions", "sprint-planning", "rollups"]
  },
  "sla-timers": {
    s: "Starts, pauses and stops clocks on an item against a target such as time to first response, honoring business calendars, and flags breaches.",
    d: "An SLA definition names a start condition, a stop condition, optional pause conditions, a goal that depends on item attributes such as priority, and a calendar of working hours. When the item changes, the timer service evaluates conditions and recomputes the remaining time and the projected breach time. A scheduled job fires warnings and breach events that notifications and automation consume. Hard because calendars, time zones, holidays and pause rules multiply, and the timer must be recalculated correctly when a past field changes.",
    k: ["Stored breach timestamp vs computed on read: a stored time lets queries and rules find soon-to-breach items cheaply; it must be recomputed whenever any input changes.", "Pause on waiting states vs always run: pausing is fair to the support team; it can be gamed by bouncing items into the paused state."],
    p: ["A change of calendar or goal definition does not recompute running timers, and breaches fire at the old time.", "Daylight-saving transitions shift working-hour boundaries and produce negative or doubled elapsed times."],
    v: "Create an item with a four-hour goal under a nine-to-five calendar at four in the afternoon, and confirm the breach time lands the next morning at the correct hour, and that a pause for one hour moves it by one hour.",
    dep: ["field-definitions", "scheduled-rules", "state-machine", "background-jobs"]
  },
  "comments-and-mentions": {
    s: "Lets people discuss an item in threaded or flat comments with rich text, mentions that notify specific users, and visibility restrictions.",
    d: "A comment is a timestamped record owned by an author and attached to an item, with rich text, optional restriction to a group or role, and an edit history. Mentions are parsed from the text into user references and become notification triggers. Comments may be created by email, apps or rules as well as the interface. They are indexed for search and listed in the activity stream. Hard because the same content must be sanitized, rendered consistently, searchable, deletable on request, and hidden from users who lack access to a restricted comment.",
    k: ["Mentions stored as user ids vs as text: renaming or deactivating a user does not break them; the text must be rendered and parsed at both ends.", "Restricted comments inside one thread vs a separate internal channel: one thread keeps context; mixed visibility makes notifications and search more error-prone."],
    p: ["A restricted comment is included in an email notification sent to a watcher outside the restricted group.", "Editing a comment re-triggers mentions and notifies people a second time."],
    v: "Post a comment that mentions one user and restricts visibility to a group, and confirm the mentioned user is notified only if they belong to the group, and the comment is absent from search for others.",
    dep: ["rich-text-fields", "groups-and-roles", "notification-rules", "item-store"]
  },
  "watchers": {
    s: "Records which users follow an item, automatically or by choice, so notifications can be addressed to people with a stake in it.",
    d: "A subscription links a user to an item, a project or a filter. People are added automatically when they create, are assigned or comment, and can opt out. Watching a project or filter creates dynamic membership evaluated at event time. The notification service expands watchers when an event arrives, then filters by permission. Hard because the number of watchers on popular items can be large, auto-subscription makes the list grow with every touch, and removing access must also remove the subscription effect.",
    k: ["Auto-subscribe on participation vs explicit follow only: people stay informed without effort; inboxes grow noisy and people are subscribed to things they stopped caring about.", "Dynamic filter subscriptions vs per-item lists: filter-based following scales with new items; evaluation at event time is costly and must run as the subscriber."],
    p: ["A user who loses project access still receives email about items because watcher rows are not checked at send time.", "Mass imports auto-subscribe the importing account to thousands of items."],
    v: "Comment on an item as a new user and confirm they are added as a watcher, receive the next update, can unwatch, and then receive nothing; then remove their project access and confirm no further delivery.",
    dep: ["notification-rules", "permission-schemes", "item-store"]
  },
  "notification-rules": {
    s: "Maps events such as created, assigned, commented or transitioned to the set of recipients and the messages sent, by project-level and personal preferences.",
    d: "An event from the log is matched against a notification scheme listing which roles are told about which event types: reporter, assignee, watchers, mentioned users, custom groups. Each recipient then applies personal settings, such as skipping their own changes, choosing a channel, or muting an item. The service renders a template with changed fields and the recipient's locale. Hard because one change can raise several events, recipients overlap between rules, and permissions must be checked per recipient as they were at the time of the event.",
    k: ["Scheme per project vs global rules: projects control their own noise; many differing schemes are hard to audit and users cannot predict messages.", "Per-recipient render vs one render for all: per-recipient content respects permissions and locale; it multiplies work and delivery volume."],
    p: ["A field change by a rule or import produces a storm of notifications because suppression applies only to interface edits.", "A recipient is listed twice through two roles and gets duplicate messages."],
    v: "Assign an item to another user, confirm exactly one notification arrives to the assignee and none to the actor, with the changed fields and the assignee's locale; repeat with the actor set to be notified of own changes.",
    dep: ["event-log", "watchers", "permission-schemes", "digest-batching"]
  },
  "digest-batching": {
    s: "Collapses bursts of changes to one item or many items into one message per recipient per interval, so edits do not each produce an email.",
    d: "Instead of sending immediately, the notification service holds events for a short window keyed by recipient and item, merges field changes into one summary, and sends when the window closes. Users may also choose daily or weekly digests that group by project. Merging must keep the net change, so a field changed and reverted inside the window produces no mention. Hard because the batching windows add delay and state, and a crash or restart must not lose or double-send the held events.",
    k: ["Short merge window vs immediate send: far fewer messages; changes are delayed a minute or more, which hurts urgent alerts.", "Net-change summaries vs a full change list: concise and readable; detailed lists preserve the sequence for audit but overwhelm readers."],
    p: ["A process restart drops the in-memory window and the pending notifications are never sent.", "A comment and an unrelated field change are merged and the comment's mention is lost in the summary."],
    v: "Edit one item five times within the batching window and confirm exactly one message is sent after the window with the net changes, and that an urgent event type such as assignment is delivered without waiting.",
    dep: ["notification-rules", "background-jobs", "event-log"]
  },
  "email-delivery": {
    s: "Sends rendered notifications through mail and chat gateways with retries, bounce handling, threading headers and sender authentication.",
    d: "Rendered messages are queued per channel. A sender pool hands them to the mail relay or chat API, records the result, retries transient failures with backoff, and marks addresses that bounce repeatedly. Message headers carry the item key so replies thread together and can be routed back into the item. Rate limits of external gateways constrain throughput. Hard because delivery is outside the tracker's control: providers throttle, filter and defer, and a stuck queue delays every tenant's mail.",
    k: ["Shared sending pool vs per-tenant queues: a shared pool uses capacity efficiently; one tenant's burst delays others unless fairness is enforced.", "Sender address per tenant vs one address: per-tenant addresses improve reputation isolation and branding; they require domain verification and more configuration."],
    p: ["A retry after an ambiguous timeout sends the same email twice.", "Bounce data is not fed back, so the system keeps mailing dead addresses and its sender reputation falls."],
    v: "Send a notification to a mailbox that rejects it and a mailbox that accepts it, and confirm the failure is retried then recorded as bounced, the success threads under the item key, and a resend does not duplicate.",
    dep: ["background-jobs", "notification-rules", "rate-limiting"]
  },
  "inbound-email": {
    s: "Turns incoming mail to a project address into new items or comments, mapping senders, subjects, quoted text and attachments.",
    d: "A mail receiver accepts messages for a project address, authenticates the sender, and decides whether the message creates an item or replies to an existing one by looking for an item key or thread headers. It strips quoted history and signatures, converts the body to rich text, saves attachments, and maps the sender to a user or an anonymous requester. Hard because mail is hostile and inconsistent: spoofed senders, loops with auto-replies, huge attachments, and clients that format replies in unpredictable ways.",
    k: ["Create anonymous requesters vs require known users: open intake suits support desks; open addresses invite spam and need strict limits.", "Thread by headers vs by subject key: headers are precise; subject keys survive clients that drop headers but can attach mail to the wrong item."],
    p: ["An auto-reply from the tracker is received by the same inbox and creates a loop of items.", "Quoted text is not stripped and every reply repeats the whole earlier conversation in the item."],
    v: "Send a message to a project address, confirm an item is created with the subject as title and attachment saved; reply to the notification and confirm it becomes a comment on that item with quoted text removed.",
    dep: ["comments-and-mentions", "item-types", "attachments", "rate-limiting"]
  },
  "activity-stream": {
    s: "A reverse-chronological feed of changes across items, projects or a person, built from the event log and filtered by what the viewer may see.",
    d: "The feed reads events from the log, groups consecutive changes by actor and item, and renders each as a readable sentence. It is available per item, per project, per user and as a syndicated feed. Each entry is checked against the viewer's permissions at read time. Paging uses a cursor, and the stream may be materialized per project to avoid scanning the whole log. Hard because the volume is large, permission checks apply per entry, and grouping rules decide whether the feed reads as a story or as noise.",
    k: ["Materialized feed per project vs query over the event log: reads are fast; storage grows and permission changes require care.", "Group by actor and window vs show every change: readable summaries; granular audit questions need the raw history instead."],
    p: ["Entries for items that became restricted still show their titles in the project feed.", "A bulk change produces thousands of feed entries that bury all other activity."],
    v: "Make three edits on an item as one user within a minute and confirm the feed shows one grouped entry listing them; restrict the item and confirm a user without access no longer sees the entry.",
    dep: ["event-log", "change-history", "item-level-security", "permission-schemes"]
  },
});
