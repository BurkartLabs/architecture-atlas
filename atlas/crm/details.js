// Details for the CRM plate, part 1: workspace, mobile, reporting, forecasting.
ATLAS.details("crm", {
  "record-pages": {
    s: "The screen that shows one contact, account or deal: its fields, related records, activity and actions, laid out per object, role and record type.",
    d: "A page is assembled from a layout definition: sections of fields, related lists, a timeline and action buttons. The client fetches the record and its related data in one or a few calls, then hides what field-level security forbids. Layouts differ by record type and user profile, and customers add their own components. It is hard because every field, related list and component is metadata chosen by the customer, so page cost is unbounded and one slow related list slows the whole screen.",
    k: ["One composed fetch for the whole page vs per-component fetches: fewer round trips and consistent data, but one slow or failing part delays everything.", "Customer-assembled layouts vs fixed screens: each team sees only what it needs, at the price of pages nobody at the vendor has ever seen."],
    p: ["A layout with dozens of related lists loads slowly on accounts with tens of thousands of children.", "Hiding a field in the layout without field-level security still leaves it readable through the API."],
    v: "Open an account with 5,000 contacts and 20,000 activities as a restricted user. The page renders in a few seconds, shows only permitted fields, and the related lists page rather than load everything.",
    dep: ["page-layouts-and-record-types","rest-api","field-level-security","activity-timeline"]
  },
  "list-views-and-filters": {
    s: "Saved, shareable lists of records with filter conditions, sorting and chosen columns, used as the daily work queue of most sellers.",
    d: "A view stores an object, a filter expression, column list, sort order and who may see it. Running it compiles the filter against object metadata into a query that respects sharing, then pages the results. Users can edit cells in place, pin views and filter by relative dates or owner. The hard part is performance on customer-defined fields: a filter on an unindexed custom field over millions of rows must either be refused, rewritten or accepted slowly, and the choice shows to users.",
    k: ["Compile filters to the query engine vs filter in application memory: the first scales but is limited by indexes; the second allows any condition but breaks on large objects.", "Personal vs shared views: personal views are free to experiment with, while shared ones become unowned dependencies when their author leaves."],
    p: ["A shared view filtering on a non-indexed formula field times out for everyone once the object grows.", "Relative date filters evaluated in server time zone show the wrong day to remote users."],
    v: "Create a view filtered on owner and a custom picklist over a one-million-row object. It returns the first page quickly, the count matches a direct database query, and a user lacking access to a record never sees it.",
    dep: ["query-engine","object-metadata","sharing-rules","indexing-and-search"]
  },
  "kanban-and-board-views": {
    s: "A card board that groups records, usually deals, by a stage or status field, so users can drag a card to change its value and see totals per column.",
    d: "The board runs a grouped query: records bucketed by a picklist field, with a sum or count per bucket, loaded a page at a time per column. Dragging a card writes the new value through the same save path as any edit, so validation, stage gates and triggers all run. Card contents come from a configurable compact layout. The difficulty is that a drop is a real update which may be rejected, so the UI must undo the move and explain why.",
    k: ["Drag-to-save through the normal save path vs a special fast path: reuses every rule and audit, but a drop can fail and needs a visible rollback.", "Per-column paging vs loading all cards: keeps big stages responsive, while totals in column headers must come from a separate aggregate query."],
    p: ["Two users dragging the same card produce a silent last-write-wins that moves a deal backward.", "Column totals computed from only the loaded cards understate pipeline."],
    v: "Drag a deal to a stage whose gate requires a missing field. The card snaps back, a message names the field, and no history row is written. Drag to a permitted stage and the column totals change by the deal amount.",
    dep: ["pipelines-and-stages","stage-gates","aggregation-engine","validation-rules"]
  },
  "global-search": {
    s: "A single search box that finds contacts, accounts, deals and activities by name, email, phone or text, ranked and filtered to what the user may see.",
    d: "Records are copied into a search index by a change stream with a short delay. A query is tokenized, matched across indexed fields of every searchable object, ranked with boosts for recent or owned records, and then filtered by the user's sharing access. Typeahead returns recent and likely matches while typing. Hard problems are enforcing record-level access without leaking counts, handling phone and email forms that do not tokenize naturally, and indexing custom fields that appear daily.",
    k: ["Filter by access inside the index vs after retrieval: the first keeps pages full and counts honest but needs sharing data in the index; the second is simpler but returns short or empty pages.", "Near-real-time indexing vs synchronous: users find new records within seconds at a fraction of the write cost, but a just-created record may be missing from search."],
    p: ["Phone numbers stored in different formats fail to match the same number typed by a user.", "Result counts that ignore sharing reveal that a hidden record exists."],
    v: "Create a contact with a unique name. It appears in search within the documented delay for its owner and is absent for a user with no access. Searching the phone number in two common formats finds the same record.",
    dep: ["indexing-and-search","change-event-stream","sharing-rules","input-normalization"]
  },
  "activity-timeline": {
    s: "A reverse-chronological feed on a record combining emails, calls, meetings, tasks, notes and field changes, so anyone can see what happened with a customer.",
    d: "The timeline merges activity records related to the record, to its contacts and sometimes to its child accounts or deals, from several tables, sorted by date and filtered by type and visibility. Emails appear as threads and long bodies are collapsed. Items link back to their source. The difficulty is the fan-in: a large account has activity attached to many related records, so the feed needs a precomputed or indexed relationship rather than a live join, and private items must be filtered per viewer.",
    k: ["Query related tables on read vs maintain a materialized feed: reads reflect every edit, but a large account makes them slow; materializing is fast but needs backfill when relationships change.", "Showing rolled-up activity from children vs only direct activity: managers see the full picture, but private conversations may surface where their authors did not expect."],
    p: ["Rolling up contacts' emails onto an account exposes private threads to account teammates.", "Merging a record leaves its old activity unlinked from the survivor and the timeline looks empty."],
    v: "Log an email, a call and a field change on a deal. All three appear in order within seconds. Open the account as a user without access to the email and confirm that item is hidden or redacted.",
    dep: ["email-matching","call-and-meeting-logging","field-history","capture-privacy","tasks-and-reminders"]
  },
  "guided-selling": {
    s: "Prompts inside the workspace that tell a seller what to do next: stale deals, missing contacts, overdue steps and recommended actions, driven by rules or models.",
    d: "A set of conditions evaluated on records and activity produces suggestions: no activity in 14 days, no executive contact, close date passed, a competitor added. Some are static rules per stage, others come from scoring models. Suggestions appear as banners or a work queue, with actions to accept, snooze or dismiss. The hard part is signal quality: a prompt that fires too often is ignored, and one that depends on activity capture is wrong whenever capture fails.",
    k: ["Rule-based prompts vs model-based recommendations: rules are explainable and editable by admins, while models find patterns nobody wrote down but are hard to question.", "Per-stage playbooks vs a single global list: playbooks fit the process, but multiply maintenance as stages are customized."],
    p: ["A staleness rule that depends on emails fires on every deal when email sync is broken.", "Dismissed prompts that reappear daily teach users to ignore the whole feature."],
    v: "Leave a deal with no logged activity past the configured threshold. The prompt appears for its owner, snoozing hides it for the chosen period, and logging a call clears it on the next evaluation.",
    dep: ["pipelines-and-stages","predictive-scoring","activity-timeline","tasks-and-reminders"]
  },
  "mobile-app": {
    s: "The phone and tablet client: a native or hybrid shell with a trimmed set of record pages, lists, search and quick actions designed for use between meetings.",
    d: "The app authenticates the user, downloads a mobile layout and metadata, shows a subset of objects and offers actions such as log a call, update a stage or open a map. It talks to the same APIs as the web client but is tuned for small screens and weak links, caches metadata and loads detail lazily. The hard part is that customer customizations were designed for desktop, so layouts need a mobile variant and large custom components may not run at all.",
    k: ["Native shell with shared metadata-driven screens vs per-screen native code: new custom fields show up without a release, but the look is generic and hard to optimize.", "Subset of desktop features vs full parity: a focused app is usable on a phone, while users hit a wall when a needed screen is missing."],
    p: ["A customer's desktop-only custom component renders blank or breaks the page on mobile.", "Old app versions keep calling API behavior that the server has since changed."],
    v: "On a real phone, install the app, sign in, open a deal, change its stage and log a call. The change is visible on the web client within seconds and the screens were usable at phone size.",
    dep: ["rest-api","page-layouts-and-record-types","authentication-and-sso","offline-store"]
  },
  "offline-store": {
    s: "A local database on the device holding the records a user is likely to need, plus a queue of edits made while disconnected.",
    d: "On login the app chooses a working set, such as owned accounts, recent deals and their contacts, and stores records, metadata and the user's access in an encrypted local database. Reads hit the local store first. Edits are written locally and queued as operations with a timestamp or version. Hard parts are choosing what to cache within device storage, keeping the cache within the user's sharing access when permissions change, and wiping data when the device is lost or the user is deprovisioned.",
    k: ["Cache by working-set rules vs cache everything visible: bounded storage and faster sync, but a record outside the set is unavailable offline at the worst time.", "Queue operations vs queue whole-record writes: operations merge more gracefully, though each field type needs defined merge behavior."],
    p: ["A permission revoked on the server remains readable in the local cache until the next successful sync.", "A queue of many offline edits replays in the wrong order and trips validation rules."],
    v: "Put the device in airplane mode, edit three deals and add a note, then reconnect. All four changes reach the server in order, none is lost, and the local store matches the server afterward.",
    dep: ["mobile-sync","encryption-and-keys","sharing-rules"]
  },
  "mobile-sync": {
    s: "The protocol that sends queued edits to the server and pulls changed records back, detecting and resolving conflicts when both sides changed the same data.",
    d: "The client sends its queue with the version each edit was based on. The server applies each through the normal save path, so validation and triggers run, and answers with accepted, rejected or conflicting results. The client then pulls records changed since its last cursor. Conflicts are resolved per field, last writer wins, or surfaced to the user. The difficulty is rejected edits: the user is no longer present when a validation rule fails hours later, so the app must keep and explain them.",
    k: ["Per-field merge vs whole-record last-write-wins: preserves independent edits to different fields, but needs a version per field and rules for fields that depend on each other.", "Apply through the standard save path vs a bulk shortcut: all rules are enforced, at the cost of slower sync and failures that arrive late."],
    p: ["A rejected offline edit is dropped silently and the user believes it saved.", "A cursor lost or reset forces a full re-download that drains battery and data on a poor link."],
    v: "Edit the same deal field on the phone offline and on the web, then reconnect. The later change wins or a conflict is shown according to the setting, and an edit breaking a validation rule is returned to the user with its message.",
    dep: ["change-event-stream","validation-rules","transactions-and-locking","rest-api"]
  },
  "push-notifications": {
    s: "Alerts sent to a user's phone through the platform's push channel when a record changes, a task is due or an approval is waiting.",
    d: "Events such as assignment, mention, approval request or deal change are matched against each user's notification preferences, rendered to short text with a deep link and handed to the device vendor's push service by token. Delivery is best effort. The server must keep tokens fresh, batch to avoid floods and respect quiet hours. Hard parts are that the payload passes through a third party so it must not contain sensitive detail, and that notification volume decides whether users keep them enabled.",
    k: ["Minimal payload with a fetch on open vs full detail in the push: avoids leaking customer data to the transport and lock screens, but needs a connection to read the content.", "Per-event opt-in vs a digest: opt-in is timely, while digests reduce interruption for high-volume users."],
    p: ["Customer names and amounts in a push payload appear on a locked screen in a meeting.", "Stale device tokens after uninstalls accumulate and slow batches that fail on each one."],
    v: "Assign a deal to a user with the app closed. A notification arrives within seconds, contains no deal amount, and tapping it opens that deal. Disable the event type and confirm the next one does not send.",
    dep: ["change-event-stream","async-job-queue","mobile-app"]
  },
  "capture-tools": {
    s: "Phone-only shortcuts for creating data quickly: scanning a business card into a contact, dictating a call note, and logging a visit from a location.",
    d: "A card scan runs text recognition on a photo and maps lines to name, title, company, email and phone, then proposes a contact and a matching account for the user to confirm. Voice capture transcribes speech into a note and may extract follow-up tasks. Both create records through normal save paths. The hard part is quality: recognition errors on names and numbers, duplicate creation of people already in the system, and consent when audio of other people is recorded.",
    k: ["On-device recognition vs server-side: on-device keeps images private and works offline, while server-side is more accurate and easier to improve.", "Auto-create vs confirm first: auto-creation is fast but pollutes data; a confirm step costs a few taps and catches most errors."],
    p: ["A scanned card creates a duplicate of a contact who already exists with a slightly different spelling.", "Recording a call without notice to the other party breaks consent rules in some jurisdictions."],
    v: "Scan a card for an existing contact. The app proposes a match with the existing record rather than a new one, and a card for a new person creates a contact linked to the right account after confirmation.",
    dep: ["duplicate-detection","mobile-app","contacts","privacy-and-consent"]
  },
  "report-builder": {
    s: "A tool where users pick an object, related objects, fields, filters and groupings to build a tabular, summary or matrix report without writing queries.",
    d: "The builder reads object metadata to offer fields and joins, then stores a report definition: base object, joined objects, filters, groups, summaries and chart. Running it compiles the definition into a query, applies the user's sharing access, and renders rows and subtotals. Hard parts are that the schema is different in every tenant, joins across optional relationships need clear semantics, and a user can build a query that scans the entire database.",
    k: ["Constrain reports to predefined join paths vs free-form joins: predefined paths keep queries predictable and safe, but block reasonable questions users then export to spreadsheets.", "Run as the viewer vs as the author: viewer-scoped results are secure but differ per person; author-scoped results are consistent but can leak data."],
    p: ["A report joining three large objects without a filter times out and consumes resources shared with other tenants.", "Report totals disagree with a list view because the two apply sharing or deleted-record rules differently."],
    v: "Build a summary of open deals by owner and stage. Totals equal a direct query run as the same user, and a user with narrower access sees a smaller total from the same saved report.",
    dep: ["reporting-data-model","aggregation-engine","object-metadata","sharing-rules"]
  },
  "dashboards": {
    s: "Pages of charts, numbers and tables built from saved reports, giving managers a view of pipeline, activity and results that refreshes on a schedule or on demand.",
    d: "A dashboard holds components, each bound to a report with a chart type and display options. Opening it runs each report or reads a cached result, then renders. Components can use the viewer's access or a fixed running user, and filters can apply across components. Hard parts are cost: ten components mean ten queries per viewer, so caching and refresh rules matter, and the fixed-user setting can show figures a viewer should not see.",
    k: ["Cached results with a refresh time vs live queries: fast and cheap for many viewers, while numbers can be minutes or hours old and viewers need to see that.", "Run as a fixed user vs as each viewer: one number for the meeting, versus numbers that respect each person's access."],
    p: ["A dashboard run as an executive shows revenue to every viewer who has the link.", "Many users opening a heavy dashboard at the start of a call overload the reporting tier."],
    v: "Open a dashboard as two users with different territories. Each sees totals matching their own reports when set to viewer access, and the timestamp shows the cached refresh time.",
    dep: ["report-builder","aggregation-engine","sharing-rules","scheduled-reports"]
  },
  "reporting-data-model": {
    s: "The curated set of report types and join relationships that define which objects can be combined in a report and how unmatched records are treated.",
    d: "Each report type names a primary object, the related objects reachable from it and whether each join is inner or outer, such as accounts with or without deals. Custom objects and relationships generate report types automatically or need an admin. A report type controls both what users can ask and how each query is shaped. The difficulty is semantics: a deal with several products produces several rows, so counts and sums multiply unless the model says what is being counted.",
    k: ["Fixed report types vs arbitrary graph traversal: predictable semantics and tested query shapes, at the price of questions that need a new type before they can be asked.", "Outer joins by default vs inner joins: fewer surprises about missing records, but empty rows make summaries harder to read."],
    p: ["Summing deal amount in a report that joins products counts each deal once per product line.", "A newly added lookup field does not appear in any report type until an admin updates it."],
    v: "Report on a deal with three products using the deals-with-products type and verify total amount counts the deal once under the documented rule, while the product count shows three.",
    dep: ["object-relationships","object-metadata","query-engine"]
  },
  "aggregation-engine": {
    s: "The component that computes sums, counts, averages and groupings over large sets of records fast enough for interactive reports and dashboards.",
    d: "It receives a compiled report, runs grouped queries against the record store or a read replica, applies sharing filters, computes subtotals and formats currency and time zones. Optimizations include pre-aggregated rollups, columnar copies of hot objects, and result caches keyed by query and user scope. It must also convert amounts across currencies at the right date. Difficulty comes from sharing: filters per user defeat shared caches, and complex access models force aggregation over visibility tables.",
    k: ["Aggregate on the transactional store vs a separate analytical copy: always current, at the cost of competing with writes; a copy is fast but lags and needs sync.", "Cache per user vs per access scope: scope-level caches are shared among many users, but need exact scope identity or they leak data."],
    p: ["A large unfiltered group-by on the primary database slows saves for the whole tenant.", "Currency conversion at the report date instead of the deal's close date changes closed revenue after the fact."],
    v: "Aggregate one million deals by stage and owner. It finishes within the interactive target, the totals match a direct SQL sum, and a concurrent bulk save of records does not slow beyond its normal baseline.",
    dep: ["query-engine","record-store","indexing-and-search","sharing-rules"]
  },
  "snapshots-and-trending": {
    s: "Stored copies of key fields taken at regular times, so reports can show how pipeline, stage or amount looked last week or last quarter rather than only now.",
    d: "A scheduled job writes selected fields of selected records, such as stage, amount and close date, into a snapshot table with the snapshot date. Reports then compare snapshots or plot a metric over time. Field history can answer some questions, but snapshots are simpler to query across many records. The hard parts are storage growth, deciding which fields and objects to capture before anyone knows the question, and backfilling when a new metric is wanted.",
    k: ["Periodic snapshots vs reconstructing from field history: snapshots are simple and fast to query, while history is exact to the moment but expensive to replay across a whole pipeline.", "Snapshot everything vs a chosen field list: complete but large, versus small but missing the field someone needs next quarter."],
    p: ["A metric needed for a board report was never snapshotted and cannot be reconstructed.", "Snapshot jobs that skip a day on failure leave gaps that look like a pipeline collapse."],
    v: "Compare pipeline by stage for the first day of last month with today. The historical figures equal the numbers recorded on that date, even for deals since edited or deleted.",
    dep: ["field-history","async-job-queue","record-store"]
  },
  "scheduled-reports": {
    s: "Reports and dashboards sent as email or file to people on a recurring schedule, with the data scoped to each recipient's access.",
    d: "A schedule stores the report, recipients, frequency, format and running user. A job runs it, renders a table or attachment and sends it, optionally only when a condition is met. Subscriptions let users add themselves. It must decide whose access applies, handle large outputs by link rather than attachment, and stop for deactivated users. Hard parts are that mail contains customer data outside the system's controls and a schedule keeps running long after its author stops caring about it.",
    k: ["Link to the live report vs attach the data: a link enforces access at open time, while attachments are convenient but copy data beyond control.", "Run as the author vs per recipient: one run is cheap, one per recipient is correct for access but multiplies cost."],
    p: ["Scheduled exports mailed to external addresses leak customer lists.", "A schedule owned by a departed employee silently stops, or keeps running with stale access."],
    v: "Schedule a pipeline report for two recipients with different territories. Each gets figures for their own territory at the set time, and deactivating one user's account stops that delivery.",
    dep: ["report-builder","async-job-queue","sharing-rules","user-provisioning"]
  },
  "warehouse-export": {
    s: "A continuous or scheduled copy of CRM data into an analytical warehouse, where heavy analysis and joins with other business data happen.",
    d: "Changed records are read through bulk queries or the change stream and written as tables of rows with deletes tracked, usually with the field metadata so schema changes carry over. The warehouse supports joins with billing, product usage and support data and long histories the CRM keeps poorly. The difficulty is correctness: deletes, merges, renamed fields and changing picklists must be reflected, and access control does not travel with the data.",
    k: ["Change-stream replication vs periodic full extracts: streams are fresh and light, but can miss events; full extracts are simple and self-correcting but heavy.", "Replicating raw custom schema vs a modeled layer: raw is complete and quick, but each customer's fields need transformation before analysts can use it."],
    p: ["Deleted and merged records stay in the warehouse and inflate customer counts.", "The warehouse copy has no record-level security, so sales data becomes readable by every analyst."],
    v: "Merge two accounts and delete a deal in the CRM. After the next sync the warehouse shows one account with merged children and no deleted deal, and row counts per object match within the sync lag.",
    dep: ["bulk-api","change-event-stream","merge-engine","field-mapping-and-transforms"]
  },
  "forecast-categories": {
    s: "The labels, such as pipeline, best case, commit and closed, that group deals by how likely they are to close, used to build the number a manager reports.",
    d: "Each stage maps to a forecast category by default, and reps or managers may override the category per deal. Totals are computed per category for a period, with commit and closed usually forming the committed forecast. Settings define which amount field counts, such as amount or a quantity or revenue split, and which close dates fall in a period. The hard part is that categories carry judgment: the same stage means different confidence on different teams, so mappings and overrides must be visible and agreed.",
    k: ["Category derived from stage vs set by the rep: derived is consistent and cheap, while rep-set captures judgment but invites sandbagging and inconsistent use.", "Several forecast types (revenue, quantity, product line) vs one: matches how the business sells, at the cost of more rollups and more places for numbers to disagree."],
    p: ["Reps changing close dates, not categories, move deals between periods and distort the forecast.", "A stage renamed by an admin silently remaps to the wrong category."],
    v: "Move a deal from a pipeline stage mapped to best case into commit. The commit total for its period and owner rises by the deal amount and the best case total falls by the same amount.",
    dep: ["pipelines-and-stages","opportunities","forecast-rollups"]
  },
  "forecast-rollups": {
    s: "The calculation that sums each rep's forecast up through the manager hierarchy to teams, regions and the company, per period and category.",
    d: "A rollup takes each owner's deals by category and period and adds their subordinates' submitted totals, following the role hierarchy or a separate forecast hierarchy. Quotas sit beside the totals to show attainment. Deals can be reassigned and territories changed mid-period, so rollups are recalculated when ownership, amounts, dates or hierarchy change. Hard parts are doing this quickly for big hierarchies and keeping figures stable for the period being reviewed.",
    k: ["Recompute on every change vs recompute on a schedule: always current, but a heavy bulk update triggers a storm of recalculation; schedules are cheap but show stale totals during a call.", "Role hierarchy vs a dedicated forecast hierarchy: reuse is simple, while a separate one handles matrix teams and overlays at the cost of maintaining two trees."],
    p: ["A mid-quarter reorg moves deals to a new manager and the old manager's submitted total silently drops.", "A deal owned by someone not in any hierarchy is missing from every rollup."],
    v: "Reassign a committed deal from one rep to another under a different manager. Both managers' rollups change by exactly the deal amount, and the sum across the whole hierarchy is unchanged.",
    dep: ["role-hierarchy","forecast-categories","opportunities","async-job-queue"]
  },
  "quotas-and-targets": {
    s: "The sales targets assigned to reps, teams and territories per period, against which forecasts and closed revenue are measured.",
    d: "Quotas are stored per user or team, per period, product line and measure, often imported from a planning system. Attainment is closed amount divided by quota, and coverage is open pipeline divided by quota. Quotas change with hires, leave and territory changes, and may be prorated. The difficulty is that quota is both data and politics: changes to it mid-period change what people are paid, so edits need approvals and a history.",
    k: ["Import quotas from a planning system vs maintain them in the CRM: imports keep one source of truth for finance, but the CRM can lag behind the latest change.", "Prorate in the system vs by hand: automated proration is consistent, but its rules have to match compensation policy exactly."],
    p: ["A reorganization changes a rep's quota after the quarter began without a recorded effective date.", "A quota assigned to a deactivated user disappears from every rollup."],
    v: "Import quotas for a new quarter and compare each manager's attainment denominator with the planning source. They match for every user, and changing one quota records who changed it and when.",
    dep: ["forecast-rollups","bulk-import-export","field-history","user-provisioning"]
  },
  "forecast-adjustments": {
    s: "A manager's ability to override a rep's submitted forecast with their own judgment, with the original, the adjustment and the reason all kept.",
    d: "Each level of the hierarchy sees its subordinates' submissions and may adjust a total up or down per category, or change individual deals' categories. The adjusted number rolls up while the original remains visible. Reps often cannot see manager adjustments. The hard part is the trail: forecast calls compare commitments over time, so the system must say who changed what, when, and that it differs from the sum of the underlying deals.",
    k: ["Adjust totals vs adjust individual deals: total adjustments are quick but leave no deal-level explanation; deal-level edits are explainable but slow and visible to reps.", "Reps see adjustments vs hidden: transparency builds trust, while hiding avoids arguments but surprises people."],
    p: ["An adjusted total no longer matches its deals, and nobody can explain the gap three weeks later.", "Adjustments are lost when a hierarchy change reassigns the manager."],
    v: "Raise a team's commit by a fixed amount as a manager. The VP's rollup shows the adjusted total, the original submission is still visible, and the change is recorded with user and time.",
    dep: ["forecast-rollups","forecast-categories","field-history","role-hierarchy"]
  },
  "forecast-snapshots": {
    s: "A frozen copy of the forecast, per level, taken when it is submitted or at the start of each period, so leaders can compare what was said then with what happened.",
    d: "On submission or on a schedule, the system stores each owner's totals by category, quota, adjustments and often the deal list behind them. Reports then show forecast accuracy, slippage and how commitments changed week over week. It is separate from live data because deals later change or vanish. Hard parts are storage for deal-level detail, agreeing when a submission becomes official, and handling restated periods when finance corrects history.",
    k: ["Store deal-level detail vs totals only: detail explains accuracy and slippage but is large; totals are cheap but cannot say which deals moved.", "Automatic weekly snapshots vs on submit: automatic is complete, while submit-only reflects what the manager actually committed to."],
    p: ["Snapshots without deal detail say the forecast missed but not why.", "A backdated edit to a closed deal changes live totals but not the snapshot, so reports disagree."],
    v: "Submit a forecast, change several deals, then open the forecast history for that date. It shows the original totals and deal list exactly as submitted and a variance against current actuals.",
    dep: ["forecast-rollups","snapshots-and-trending","record-store","forecast-adjustments"]
  },
  "predictive-scoring": {
    s: "A model that estimates the chance a deal will close, or a lead will convert, from its attributes and activity, and shows that score to sellers and managers.",
    d: "Features come from deal fields, stage age, activity counts, contact engagement and history of similar deals. A model trained on the tenant's own past outcomes, or a shared one, produces a probability with the main contributing factors. Scores are recomputed on a schedule or on change and feed forecasts and prompts. Hard parts are small samples in small tenants, bias from sparse or inconsistent data entry, and users who stop trusting a score they cannot explain.",
    k: ["Per-tenant model vs shared model: per-tenant fits local behavior but needs enough closed deals; a shared model works on day one but ignores local specifics.", "Show the score alone vs with its drivers: a bare score is simple but unquestionable, while drivers invite correction and expose bad data."],
    p: ["A model trained on records with missing outcomes learns that deals nobody updated are losses.", "Reps game the activity inputs the score rewards, and it stops predicting."],
    v: "Back-test the model on last quarter's closed deals held out of training. Predicted probability bands match actual win rates within the stated tolerance, and every score shows its top factors.",
    dep: ["win-loss-analysis","activity-timeline","record-store","async-job-queue"]
  },
});
