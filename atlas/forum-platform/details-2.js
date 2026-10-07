// Details for the forum platform plate, part 2: content model, profiles and messaging, trust and reputation.
ATLAS.details("forum-platform", {
  "categories": {
    s: "The tree of named sections that organizes topics, each with its own description, permissions, defaults and optional moderation rules.",
    d: "A category has a parent, a slug, display settings and a set of security rules saying which groups may see, reply or create topics. Settings can require approval for new topics, restrict tags, set a default watching level or choose a topic template. Category membership is checked on nearly every query, so the tree and its rules are cached. It is hard because rules inherit unevenly, moving a category changes many URLs, and a mistake in security settings exposes or hides large amounts of content.",
    k: ["Strict tree versus flat list with tags: a tree gives clear ownership and permissions, but forces each topic into one place; tags are flexible and have no access control.", "Inherit parent permissions versus set each explicitly: inheritance is concise, but a parent change silently alters many children."],
    p: ["A category made public by mistake exposes its whole history to anonymous readers and crawlers.", "Deleting or moving a category without redirects breaks every existing link into it."],
    v: "Create a private category, post in it, and confirm an anonymous request and a member outside the allowed group both receive not-found, while a member of the group sees it in lists and search.",
    dep: ["permission-model", "groups", "site-settings"]
  },
  "topics": {
    s: "A titled conversation inside a category, holding an ordered run of posts plus state such as pinned, closed, archived, visible and last activity time.",
    d: "A topic row stores the title, category, creator, counts of posts, views and likes, timestamps and state flags, and points to its posts by sequence number. The first post is the opening message. Visibility, closing and pinning change how lists show and sort it. Bumping on new replies updates last activity. It is hard because counters change constantly, because lists sort by activity, and because a topic is read thousands of times for every write.",
    k: ["Denormalized counters on the topic versus counting posts on read: stored counters make lists cheap, but drift when posts are deleted or moved and need periodic repair.", "Archive old topics read-only versus leave them open: archiving blocks necroposting and stale advice, but frustrates members who have a real update."],
    p: ["Reply counters that drift from the real number make lists show a wrong count until a repair job runs.", "Allowing replies on years-old topics revives stale threads that waste moderators' time."],
    v: "Create a topic, add five posts, delete one and move one out. Confirm the topic's reply count, last-activity time and last poster all match the posts actually visible.",
    dep: ["categories", "posts", "primary-store"]
  },
  "posts": {
    s: "A single message in a topic: the raw text a member wrote, its rendered HTML, author, position in the topic, edit history pointer and moderation state.",
    d: "A post stores raw markup, cooked HTML, the topic and sequence number, author, timestamps, flags for hidden, deleted or whisper (staff-only), and counters. Creating one runs validation, spam checks and rate limits, parses and sanitizes the text, assigns the next sequence number inside a lock, and emits events for notifications, indexing and live updates. It is hard because many replies can arrive at once to one topic, ordering must stay stable, and one write triggers many side effects.",
    k: ["Assign sequence numbers under a topic lock versus accept gaps: a lock gives clean, stable numbers, but serializes bursts of replies on hot topics.", "Store raw and cooked text both versus raw only: both costs space, but makes reads fast and lets rules be changed and rebaked."],
    p: ["Two replies arriving together receive the same sequence number and one overwrites or hides the other.", "Side effects run inside the request instead of a queue, so a slow mail relay makes posting time out."],
    v: "Submit fifty replies to one topic concurrently and confirm every one is stored with a unique, gap-free sequence number, and that notifications and search entries follow shortly after through the job queue.",
    dep: ["topics", "markup-parser", "html-sanitizer", "job-queue", "spam-classifier", "rate-limiter"]
  },
  "reply-threading": {
    s: "Records which post a reply answers, and lets the interface show the conversation as a flat timeline, a reply chain or a nested tree.",
    d: "A reply may store a pointer to the post it answers, usually set when the member clicks reply on a specific post or quotes it. Flat topics order by time; others expand the chain above a post, show replies beneath it or build a full tree. The pointer is optional and can be wrong when moved. The challenge is presentation: deep trees are hard to read on narrow screens, and loading a chain of ancestors needs efficient queries.",
    k: ["Flat timeline with reply links versus nested tree: flat is simple and keeps chronology, but long side conversations get scattered; trees preserve context and sprawl.", "Store the direct parent only versus the full path: a parent pointer is small and simple, but fetching all ancestors takes repeated queries."],
    p: ["Moving a post to another topic leaves replies pointing at a parent that is no longer there.", "Deeply nested rendering overflows narrow layouts so the lowest replies become unreadable."],
    v: "Create a chain of five replies, each answering the previous, then open the last. Confirm the ancestors load in one request and in order, and deleting a middle post leaves a visible placeholder.",
    dep: ["posts", "topics"]
  },
  "post-revisions": {
    s: "Keeps each earlier version of an edited post with who changed it and when, so edits can be compared, audited and reverted.",
    d: "On each edit, the previous raw text and metadata are saved as a revision, with the editor and a reason when given. The post shows an edit marker, and viewers can see diffs between versions. Members have a grace period to edit without a revision, and staff can hide a revision or restore one. Revisions of deleted posts remain for review. It is hard because history grows without bound, may contain information a member later wants removed, and must obey the same visibility rules as the post.",
    k: ["Full copy per revision versus stored diffs: full copies are simple to read and use more space; diffs are small and slower and more fragile to reconstruct.", "Grace period with no history versus every edit kept: a grace period avoids noise from typo fixes, but allows quick changes that mislead replies already written."],
    p: ["A member posts something harmful, edits it clean, and without history moderators cannot see what was said.", "Revisions retained after an erasure request keep personal data the member asked to remove."],
    v: "Edit a post twice after the grace period and confirm three versions appear with correct authors and a readable diff. Hide the first revision as staff and confirm ordinary members can no longer view it.",
    dep: ["posts", "primary-store", "permission-model"]
  },
  "topic-lists": {
    s: "The queries that produce latest, new, unread, top, category and tag listings, each filtered by what the member may see and sorted by a defined rule.",
    d: "A list request combines a sort (last activity, creation, votes, score over a period), filters (category, tags, unread state, pinned) and permission checks, then pages the result. The member's read state decorates each row with unread counts. Anonymous lists are cached; personalized ones are mostly not. Indexes must match each sort and filter combination. It is hard because the same screen mixes shared data with per-member state, and offset paging misbehaves while rows reorder as activity arrives.",
    k: ["Offset paging versus keyset paging: offset is simple and shows page numbers, but skips or repeats rows while ordering changes; keyset is stable and cannot jump.", "Compute lists live versus precompute: live results are always fresh and costly under load; precomputed lists are fast but lag behind new activity."],
    p: ["Sorting by activity while paging makes a busy topic appear on two pages and another vanish.", "Filtering by category after fetching a page returns short pages and shows hidden topics to the wrong people."],
    v: "Page through the latest list while another account replies to topics on the first page. Confirm no topic repeats or is skipped, and that topics in categories the viewer cannot see never appear.",
    dep: ["topics", "categories", "tags", "read-state-sync", "permission-model"]
  },
  "tags": {
    s: "Free-form labels attached to topics that cut across categories, with synonyms, groups and per-category rules, and their own list pages and watching levels.",
    d: "Tags are rows linked to topics, with a count per tag and optional restrictions, such as allowed tags per category or tags only staff can apply. Tag synonyms map one tag to another so searches and counts merge. Members can watch or mute tags. Lists by tag use the same permission-aware queries as categories. It is hard because tags sprawl without curation, because synonyms and renames must update many topics, and because tags can be used to evade category rules.",
    k: ["Open tagging versus a curated set: open tags grow vocabulary organically but fragment into near-duplicates; curated tags stay clean and need an owner.", "Tags visible everywhere versus restricted by category: restricting avoids leaking private topics through tag pages, at the cost of extra checks."],
    p: ["A tag page that ignores category permissions reveals titles of private topics.", "Hundreds of near-duplicate tags make filtering useless until someone merges them."],
    v: "Tag topics in a public and a private category with the same tag, and confirm the tag page shows only the public one to an anonymous visitor. Merge two tags and confirm topics carry the surviving tag.",
    dep: ["topics", "categories", "permission-model"]
  },
  "polls": {
    s: "Lets a post carry a question with options that members vote on, with rules for single or multiple choice, visibility of results and closing time.",
    d: "A poll is defined in the post's markup, parsed into a poll record with options, and updated when the post is edited. Votes are rows per member and option. Settings control who can vote, whether results are visible before closing, whether votes are anonymous and when it closes. Changing options after votes exist is restricted. It is hard because the poll lives inside editable text, so edits must not silently invalidate votes, and because counting and one-vote rules need atomic updates.",
    k: ["Poll defined in post markup versus a separate editor object: markup keeps it portable and simple, but edits to the text can accidentally change the poll.", "Public voter lists versus anonymous votes: public lists encourage accountability, but discourage honest answers on sensitive questions."],
    p: ["Editing poll options after voting reassigns votes to different answers without telling voters.", "A race between two clicks lets one member vote twice in a single-choice poll."],
    v: "Create a single-choice poll, vote twice quickly from one account, and confirm exactly one vote is stored. Close the poll and confirm further votes are refused and results display.",
    dep: ["posts", "markup-parser", "primary-store"]
  },
  "bookmarks": {
    s: "Lets a member save a post or topic privately, optionally with a reminder time, and find it again in a personal list.",
    d: "A bookmark is a row linking a member to a post or topic, with an optional name and reminder time. Reminders are checked by a scheduled job and delivered as notifications. The list shows bookmarks with the current state of their targets. Bookmarks are private and not counted publicly. It is hard in small ways: a bookmark's target may be hidden, deleted or moved, and the member should still understand what they saved without seeing content they no longer have access to.",
    k: ["Bookmark the post versus the topic: post bookmarks are precise, but break when posts are moved; topic bookmarks survive moves and lose the exact location.", "Reminders inside the product versus none: reminders add value and a polling job, but become another source of notifications to manage."],
    p: ["A bookmark of a post later made private still displays its title in the owner's list after access is lost.", "Reminder jobs scanning the whole table each minute add steady load as bookmarks grow."],
    v: "Bookmark a post with a reminder in two minutes. Confirm a notification arrives at that time, and after the post is deleted the bookmark list marks it unavailable without showing its text.",
    dep: ["posts", "scheduler", "notification-generator"]
  },
  "drafts": {
    s: "Autosaved, unsent text for a reply, new topic or message, stored per member and per target so work survives closed tabs, lost connections and device changes.",
    d: "The composer saves the draft to the server every few seconds while the member types, keyed by what it will become. A sequence number protects against two tabs overwriting each other: a save with an older number is refused and the member is warned. Drafts are removed when posted or abandoned after a retention period. It is hard because it adds constant small writes, because concurrent devices conflict, and because drafts hold unpublished personal text that must stay private.",
    k: ["Save to the server versus only local storage: server drafts follow the member between devices, but cost writes and expose unsent text to the operator.", "Reject stale saves versus last write wins: rejection prevents silent loss across tabs, but interrupts the member with a conflict message."],
    p: ["Two open tabs overwrite each other, and the member loses the longer draft without warning.", "Drafts retained indefinitely keep sensitive unsent text long after the member forgot it existed."],
    v: "Start a reply on one device, wait for autosave, and open the same topic on another. Confirm the text appears. Edit on both, and confirm the older save is refused with a visible warning.",
    dep: ["composer", "primary-store", "sessions"]
  },
  "topic-restructuring": {
    s: "Staff operations that merge two topics, split posts into a new topic, move posts or whole topics between categories, and fix counts and links afterward.",
    d: "Moving posts rewrites topic and sequence references, recomputes counters on both sides, updates reply pointers, redirects links and notifies affected members. A merge appends the posts of one topic into another in chronological order and leaves a redirect. Splits are the reverse. Each operation is transactional and queued so large topics do not time out. It is hard because posts have many dependents, such as likes, notifications, bookmarks, search entries and quotes, all of which must follow the posts.",
    k: ["Rewrite references in place versus copy and delete: in place preserves ids and likes, but touches many tables; copying is simpler and loses history and permalinks.", "Leave a visible stub versus move silently: a stub explains what happened, but clutters the original thread."],
    p: ["Merging topics with different category permissions exposes posts from a private topic to a public audience.", "Existing links to moved posts break because no redirect is recorded."],
    v: "Split posts 10 to 20 out of a topic, then merge them back. Confirm counters, sequence order, likes and old permalinks all resolve correctly, and that members who could not see the target category cannot see the moved posts.",
    dep: ["posts", "topics", "permalinks-and-redirects", "job-queue", "permission-model"]
  },
  "permalinks-and-redirects": {
    s: "Stable URLs for categories, topics and posts, plus redirects that keep old addresses, imported site paths and renamed slugs working.",
    d: "Topic URLs combine a slug with the topic id, so the id alone identifies it and a changed title does not break links. A post URL adds its sequence number. Redirect rules map old paths, such as those from a previous forum or a moved category, to current destinations. Requests resolve by id first and redirect to the canonical slug. It is hard because links live in search engines, bookmarks and other sites forever, and because redirects can hide permission checks.",
    k: ["Slug plus id versus slug only: including the id makes links survive renames and avoids collisions, at the cost of slightly longer URLs.", "Redirect table versus rewrite at the proxy: a table can be edited by operators and checked for permissions; proxy rules are fast and invisible to the application."],
    p: ["Importing from an old forum without redirect rules breaks years of inbound links and search traffic.", "A redirect that reveals a private topic's new title to someone without access leaks it."],
    v: "Rename a topic and request its old URL. Confirm it redirects once to the new slug with the same id. Request an imported legacy path and confirm it resolves to the migrated topic.",
    dep: ["topics", "posts", "primary-store"]
  },
  "user-profiles": {
    s: "The public page and private settings for each member: name, picture, bio, activity summary, statistics, joined date, links and choice of what to show.",
    d: "A profile aggregates data from several places: stored fields such as bio and location, statistics counted from posts, likes and reading time, and recent activity pulled from topics. Visibility settings let members hide fields, activity or the whole profile from anonymous visitors. Staff see more. Custom fields add community-specific data. It is hard because statistics are expensive aggregations, because privacy settings must apply everywhere the data is shown, and because profiles attract spam links.",
    k: ["Public by default versus private by default: public profiles build community and search visibility, but expose members who did not expect it.", "Live statistics versus periodically summarized: live numbers are exact and expensive; summaries are cheap and slightly stale."],
    p: ["A bio field allows links that spammers fill with promotional content that search engines index.", "A hidden-profile setting that is not honored by the directory or search exposes members who opted out."],
    v: "Set a profile to hide activity, then view it as an anonymous visitor, as another member and as staff. Confirm each sees exactly the fields allowed, and that the user directory and search respect the setting.",
    dep: ["accounts", "custom-fields", "permission-model", "counter-store"]
  },
  "avatars-and-cards": {
    s: "Profile pictures, generated placeholders and the small hover card that shows a member's name, role and short bio wherever their name appears.",
    d: "An avatar is uploaded and resized into standard sizes, or generated from the member's name or an address-based lookup. The user card loads on demand when a name is hovered or tapped, showing roles, badges, a few statistics and actions such as message or follow. Avatar URLs are versioned for caching. Because avatars appear next to every post, they dominate image requests. It is hard because they must be tiny, cacheable and quickly changeable, and because user-supplied images need the same safety checks as other uploads.",
    k: ["Upload only versus lookup by email hash: lookups save members effort, but disclose a hash of the address to a third party.", "Preload card data versus load on hover: preloading feels instant but loads data for names nobody inspects."],
    p: ["Avatars served at full size on every post make long threads heavy and slow on mobile.", "Changing an avatar does not change its cached URL, so the old picture persists for weeks."],
    v: "Change a member's avatar and confirm the new image appears next to their old posts after a refresh, in the right sizes, with a new versioned URL, and the old URL is no longer referenced.",
    dep: ["uploads-and-images", "edge-cdn", "user-profiles"]
  },
  "private-messages": {
    s: "Conversations between chosen members that are visible only to participants, built on the same topic and post model but kept out of lists, search and category rules.",
    d: "A private message is a topic with no category and an explicit list of allowed users and groups. It reuses the composer, notifications and read state. Participants can be added and left; the inbox lists conversations with unread counts. Staff cannot normally read it, except through a deliberate, logged action. It is hard because reusing the topic model risks leaking messages through code paths that only check categories, and because abuse in private channels needs reporting without enabling surveillance.",
    k: ["Reuse the topic model versus separate message tables: reuse gives editing, quoting, notifications and search for free, but every public-oriented query must exclude them.", "Staff can read on report only versus never: report-only access allows investigation of abuse, but is a privacy promise that must be kept and audited."],
    p: ["A listing or search query that forgets to exclude messages exposes private conversations.", "Allowing unlimited messages to strangers turns private messages into a spam channel."],
    v: "Send a message between two members and run every public listing, search and API route as a third member and as an anonymous visitor. Confirm none returns it, and that a flagged message is visible to staff only through the logged path.",
    dep: ["topics", "posts", "permission-model", "notification-generator", "rate-limiter"]
  },
  "group-inboxes": {
    s: "Shared message inboxes for a group, so any member can read and answer conversations sent to the group, with assignment and archiving.",
    d: "A group inbox is a view over private messages whose participants include the group. Members see the same conversation, with unread state tracked per member. Some setups add assignment, so one moderator owns a conversation, and archive or move-to-folder actions that apply to the group's copy. Email can feed it, giving staff a help desk. It is hard because shared state needs rules: who is notified, what unread means for the group, and what happens when membership changes.",
    k: ["Per-member unread state versus shared state: per-member avoids members hiding each other's work, but makes it unclear whether anyone dealt with a message.", "Notify the whole group versus the assignee: whole-group notification avoids drops, but becomes noise for large groups."],
    p: ["A member removed from the group keeps access to its past conversations if the participant list is not recalculated.", "Everyone assumes someone else answered, and a request sits unread for days."],
    v: "Send a message to a group of three, answer it from one member, and confirm the others see the reply, their unread flags clear independently, and a member removed from the group loses access immediately.",
    dep: ["private-messages", "groups", "inbound-email"]
  },
  "mentions": {
    s: "Lets members address others or whole groups with an @name in a post, resolving to a link, a notification, and rules about who may be mentioned.",
    d: "The parser detects @name patterns and matches them against usernames and group names, with completion offered while typing. Resolved mentions render as links and register as targets for the notification generator. Limits cap the number of mentions per post and block mentioning large groups by new members. Mentions of users who cannot see the topic are ignored or warned. It is hard because names can be changed, resemble ordinary text, and offer a way to harass people.",
    k: ["Resolve at write time versus at render time: write-time resolution is stable and cheap, but renamed accounts leave stale mentions; render-time follows renames at higher cost.", "Allow group mentions for everyone versus restricted: restricted limits notification storms, but staff lose a convenient way to reach a team."],
    p: ["A mention of a large group by a new member sends thousands of notifications.", "A mention of someone who cannot see the topic notifies them about content they should not know exists."],
    v: "Post a message mentioning a member, a group and a nonexistent name. Confirm the first two render as links and notify only members who can see the topic, and the third stays plain text.",
    dep: ["markup-parser", "accounts", "groups", "rate-limiter"]
  },
  "mute-and-ignore": {
    s: "Lets a member silence another member's posts and notifications, or mute topics and categories, without involving moderators.",
    d: "Ignoring a user hides their posts behind a collapsed notice, suppresses notifications and messages from them, and removes their replies from the member's unread counts. Muting a topic or category stops notifications and unread badges. The setting is private to the member. Staff are typically exempt from ignoring. It is hard because the rules must be applied in every path that produces notifications, counts and emails, and because ignoring can be used to evade accountability.",
    k: ["Ignore hides content from the ignorer only versus blocking mutually: one-way hiding is simple and private, but the ignored person can still reply to them.", "Time-limited ignore versus permanent: limited ignore cools conflicts and expires naturally, but needs a job and members forget it ended."],
    p: ["Email digests or push alerts built from a different code path still mention an ignored member.", "Members ignore every moderator and then miss important announcements and warnings."],
    v: "Ignore another member, have them reply to your post and mention you. Confirm no notification, email or unread count appears for you, their post is collapsed in the thread, and other members see it normally.",
    dep: ["accounts", "notification-generator", "unread-counters"]
  },
  "user-directory": {
    s: "A searchable, sortable list of members with their activity statistics, filtered by group, giving members a way to find each other and staff a way to find accounts.",
    d: "The directory lists members with columns such as posts, likes given and received, topics created and last seen, sortable by each. Filters limit it to a group, a trust level or a name prefix. It respects profile visibility and may be disabled or limited to logged-in members. Statistics come from summary tables refreshed on a schedule. It is hard because sorting millions of rows by changing statistics is costly, and because it is a convenient target for scraping.",
    k: ["Public directory versus members only: public aids discovery, but makes scraping easy; members-only limits harvesting.", "Precomputed daily statistics versus live: precomputed tables sort quickly, but show numbers that are a day old."],
    p: ["The directory reveals hidden profiles or suspended accounts because it queries the table directly.", "Scrapers page through the entire list and harvest names for spam."],
    v: "Open the directory as an anonymous visitor and a member and sort by posts. Confirm hidden-profile members are absent, order matches true counts within the refresh interval, and rapid paging is rate limited.",
    dep: ["user-profiles", "accounts", "rate-limiter", "counter-store"]
  },
  "trust-levels": {
    s: "A small number of tiers that new members rise through by reading, posting and being liked, with each tier unlocking abilities and loosening restrictions.",
    d: "Every account sits at a level, from a newcomer with tight limits up to a long-standing regular with powers such as editing others' posts, recategorizing topics or handling flags. Levels are held on the account, and every limit and permission can be defined in terms of them. Moderators can also set a level directly. It is hard because the tiers must resist gaming while being reachable by honest people, and because every permission check now consults level.",
    k: ["Earned levels versus manually granted roles: earned levels scale moderation to the community, but can be farmed; manual roles are safe and bottleneck on staff.", "Few coarse tiers versus fine-grained scores: tiers are easy to explain and set rules by, but create cliffs where behavior suddenly changes."],
    p: ["A tier reachable by posting trivial replies lets spammers farm privileges cheaply.", "Demoting a member automatically and silently, with no explanation, drives off good contributors."],
    v: "Create a new account and confirm limits on links and message volume. Raise it through the thresholds with test activity and confirm each new ability becomes available exactly at the level that defines it.",
    dep: ["accounts", "permission-model", "groups"]
  },
  "promotion-evaluator": {
    s: "Periodically computes each member's activity statistics and promotes or demotes them against the requirements of each trust level.",
    d: "Requirements include days visited, topics entered, posts read, time reading, likes given and received, and absence of flags or suspensions. A job evaluates active members on a schedule, or on key events, and updates the level, recording why and notifying the member. Demotion requires a sustained shortfall, not one bad week. Staff can lock a member's level. It is hard because the statistics require wide aggregations, thresholds interact, and an oscillating member can flip level repeatedly.",
    k: ["Evaluate on a schedule versus on events: a schedule batches expensive queries, while events respond quickly and add load when members are active.", "Hysteresis on demotion versus symmetrical thresholds: hysteresis stops flapping, but keeps a declining member at a high level longer."],
    p: ["A threshold bug promotes thousands of accounts at once and gives untrusted users moderator-like powers.", "Level changes flip back and forth every day, so members see abilities appear and disappear."],
    v: "Give a test account activity just under a threshold and confirm no promotion. Add the missing activity, run the job and confirm one promotion with a recorded reason, and a locked account does not change.",
    dep: ["trust-levels", "read-state-sync", "likes-and-reactions", "scheduler", "counter-store"]
  },
  "likes-and-reactions": {
    s: "One-click appreciation on posts, with per-day limits, counted toward the author's reputation and the post's visible score.",
    d: "A like is a row linking member and post, with counters on the post and the author. Daily limits prevent mass liking, and a member cannot like their own post. Some systems allow multiple reaction types. Likes can be removed within a short window. The totals feed lists, top-topic scoring, badges and trust levels. It is hard because it is write-heavy and bursty, because counters must stay consistent with rows, and because likes are easy to farm in rings.",
    k: ["One reaction versus many types: a single like is simple and unambiguous, while many types capture nuance and complicate every aggregate.", "Instant counter updates versus batched: instant counters feel responsive and contend on hot posts; batching smooths writes and lags a few seconds."],
    p: ["Groups of accounts like each other's posts to farm trust levels and badges.", "Counter drift from failed writes leaves a post showing likes that cannot be listed."],
    v: "Like a post, unlike it within the window, and like twenty others to reach the daily limit. Confirm counters on post and author match the like rows each time and the limit blocks the next attempt.",
    dep: ["posts", "primary-store", "rate-limiter", "counter-store"]
  },
  "badge-definitions": {
    s: "The catalog of recognitions a member can earn, each with a name, description, icon, tier, and a rule that defines who qualifies.",
    d: "A badge is defined by a query or event rule, such as first post, one hundred likes or helpful flags, with a grade (bronze, silver or gold), whether it can be earned repeatedly, and whether it is shown on posts. Staff can create custom badges with their own queries. Definitions are data, not code, so operators can change them. It is hard because a poorly designed badge rewards the wrong behavior, and a query-based rule is a place where cost and security issues hide.",
    k: ["Query-defined badges versus fixed code: queries let communities invent badges, but a bad query can be slow or leak data; fixed code is safe and rigid.", "Many small badges versus few meaningful ones: many badges motivate early participation, but inflate until none mean anything."],
    p: ["A badge rewarding post count pushes members to write many short low-quality replies.", "An operator-written query with no limits scans the whole posts table and slows the site."],
    v: "Define a badge for ten likes received, preview its query against test data, and confirm it lists exactly the members who meet the rule and the preview finishes within the allowed time.",
    dep: ["primary-store", "site-settings", "permission-model"]
  },
  "badge-grant-engine": {
    s: "Evaluates badge rules in the background, grants new badges, avoids duplicates, notifies members and revokes badges that were granted by mistake or no longer apply.",
    d: "Some badges fire on events, such as a first like; others are found by a scheduled sweep that runs each badge's query for candidates. The engine records grants with the post that earned them, skips members who already hold single-grant badges and sends a notification. Backfills grant badges for past activity when a new rule appears. It is hard because sweeping many badges over many members is expensive, and a backfill can create a flood of notifications.",
    k: ["Event-driven grants versus periodic sweeps: events are immediate and need hooks in many paths; sweeps are simple and delayed and costly.", "Notify on backfill versus grant silently: silence avoids a flood on launch, but members miss recognition they earned."],
    p: ["A newly added badge triggers a backfill that sends every long-time member dozens of notifications at once.", "Concurrent runs of the same sweep grant duplicates of a one-time badge."],
    v: "Add a badge and run the engine twice. Confirm each qualifying member holds it exactly once, the second run changes nothing, and members receive one notification each, not a burst.",
    dep: ["badge-definitions", "scheduler", "job-queue", "notification-generator"]
  },
  "leaderboards": {
    s: "Ranked lists of members by activity, likes or contribution over a day, month or year, shown on profiles, the directory and community pages.",
    d: "Scores are computed from summary tables: likes received, topics and posts created, solutions accepted, or a custom formula. The board is recalculated on a schedule and cached, with a window such as month or all time. Position can be shown to the member, with settings to hide it. It is hard because rankings steer behavior, so a simple count rewards volume over value, and because recomputing rankings across all members is costly.",
    k: ["Public ranking versus private progress: public rankings drive participation among a few and discourage newcomers; private progress is gentler and less motivating.", "Weighted score versus raw counts: weighting resists spam but needs tuning and is harder to explain to members."],
    p: ["A raw post count ranking pushes members to post filler to climb the board.", "Recomputing all-time rankings on every page view overloads the database."],
    v: "Generate known activity for several test members across two months, run the recomputation and confirm the monthly and all-time boards rank them as the activity requires and a hidden member is absent.",
    dep: ["likes-and-reactions", "scheduler", "counter-store", "user-profiles"]
  },
});
