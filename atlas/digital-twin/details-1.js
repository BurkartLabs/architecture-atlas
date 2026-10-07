// Details for the digital twin plate, part 1: visualization and applications.
ATLAS.details("digital-twin", {
  "cad-and-scan-conversion": {
    s: "Converts engineering geometry and laser scans into lightweight, tagged meshes the twin can display, keeping the identity of each part so it can be tied to a model asset.",
    d: "Source geometry arrives as solid models, building models or point clouds, usually far too heavy to render. The converter tessellates surfaces, removes hidden interior detail, merges duplicates, builds several simplified versions of each part and writes a compact scene format. It preserves part identifiers and hierarchy so a mesh can be matched to an asset in the model. The difficulty is fidelity and identity: aggressive simplification can delete small but important parts, and exported geometry often loses the names that link it to the plant.",
    k: ["Offline conversion vs on-demand conversion: offline gives fast, predictable viewing, but a revised drawing is not visible until the pipeline reruns.", "Preserve every part vs merge by system: preserved parts allow per-valve coloring and picking; merged meshes load far faster but can only be highlighted as a whole."],
    p: ["Parts export with generated names, so nothing can be matched to the asset model and the twin shows a picture with no live data.", "Millimeter geometry loaded with meter coordinates puts equipment far from where the model says it is."],
    v: "Convert a known assembly, then pick one pump in the viewer and confirm it resolves to the right asset id in the model. Compare the converted bounding box with the drawing's stated dimensions.",
    dep: ["asset-hierarchy", "spatial-reference-frames"]
  },
  "scene-streaming-and-lod": {
    s: "Delivers large scenes to the client in pieces, sending coarse versions first and finer detail only for what the viewer is near, so a whole facility opens quickly.",
    d: "The scene is stored as a spatial tree of tiles, each with several levels of detail. The client requests tiles by camera position and screen-space size, shows coarse tiles immediately, and swaps in finer ones as they arrive, evicting distant ones to stay within memory. A server may instead render remotely and stream video for devices that cannot hold the scene. The hard part is choosing what to fetch next without popping, over networks that may be slow or metered, on devices with small memory.",
    k: ["Client-side rendering vs remote rendering: client-side works offline and scales cheaply, but weak devices cannot hold large scenes; remote rendering costs a server GPU per session.", "Tile by space vs tile by system: spatial tiles suit walkthroughs, while system tiles make it cheap to show only one process line."],
    p: ["Fetching by distance only loads huge distant buildings while small nearby equipment stays crude.", "No cache eviction on a tablet lets the viewer crash after a few minutes of walking through the site."],
    v: "Open the largest facility scene on the weakest supported device over a throttled link and confirm a usable coarse view appears within a few seconds, and memory stays under the device budget during a full walkthrough.",
    dep: ["cad-and-scan-conversion"]
  },
  "viewport-renderer": {
    s: "Draws the converted scene in a browser, headset or desktop client, handling camera movement, picking, highlighting, sections and transparency so people can inspect equipment.",
    d: "The renderer consumes tiles, builds draw calls with instancing for repeated parts and handles selection by rendering identifiers or casting rays. It supports clipping planes, isolation of a system, ghosting of surrounding structures and overlays for labels. Rendering must remain interactive while values change underneath it. Challenges are scene size, transparent layered equipment, picking small parts inside dense piping, and keeping the same look across very different graphics hardware.",
    k: ["Retained scene graph vs per-frame rebuild: retained structures make live recoloring cheap but cost memory; rebuilding is simple but struggles with large models.", "Physically based shading vs flat engineering shading: realism helps non-experts, while flat shading keeps colors readable as status indicators."],
    p: ["Status colors blend with lighting and material tints, so an alarmed part looks normal in shadow.", "Picking ignores clipped geometry, so people select parts they cannot see."],
    v: "Select a valve hidden behind a pipe by isolating its system, confirm the highlight and the property panel match the asset, and hold the target frame rate while recoloring a thousand parts.",
    dep: ["scene-streaming-and-lod"]
  },
  "data-to-visual-binding": {
    s: "Connects model properties to visual changes: a temperature drives a color, a state drives an animation, an alarm drives a flashing outline on exactly the right part.",
    d: "A binding table maps a mesh or part id to an asset property and a rule: color scale, rotation, visibility, label. The binder subscribes to live values, applies the rule when a value changes, and falls back to a neutral appearance when a value is stale or missing. Bindings are authored in an editor and stored with the scene. The hard part is maintenance: engineering changes renumber parts, and bindings silently point at nothing.",
    k: ["Bind to meshes vs bind to asset ids: mesh binding is direct, but breaks on re-export; asset-id binding survives reconversion but needs a reliable mesh-to-asset mapping.", "Rules in the client vs rules computed by the platform: client rules are flexible, but each client can disagree about what counts as an alarm."],
    p: ["Stale values keep their last color, so a dead sensor shows a calm green forever.", "A color scale tuned for one asset is reused on another with a different normal range."],
    v: "Force a known value through a bound property and confirm the part changes to the expected color, then stop the feed and confirm the part shows a distinct stale appearance within the configured timeout.",
    dep: ["viewport-renderer", "quality-flags", "asset-hierarchy"]
  },
  "trend-and-dashboard-views": {
    s: "Charts, gauges and tables that show live and historical values for any asset, laid out from templates tied to asset types so new equipment gets a usable view automatically.",
    d: "Views are defined per asset type and instantiated per asset, pulling live values from subscriptions and history from the query engine. Charts overlay measured values, model expectations and alarm limits. Users build their own boards by dragging properties. Performance depends on downsampling long ranges to a pixel budget. The difficulty is honesty: a smoothed or resampled line can hide the spike that mattered, and mixed units or time zones make comparisons misleading.",
    k: ["Templates per asset type vs hand-built boards: templates give consistency and instant coverage, but cannot show what is unusual about one asset.", "Server-side downsampling vs raw points to the client: server-side keeps pages fast, but the client cannot zoom into detail without another request."],
    p: ["Averaging a long range removes the brief excursion that triggered the alarm.", "Two charts with different time zones or units are compared by eye and a wrong conclusion is drawn."],
    v: "Inject a one-second spike into a month of data and confirm the monthly chart still shows it, with units and time zone labeled, and the view for a newly provisioned asset renders without manual setup.",
    dep: ["historical-query-engine", "units-and-semantics", "asset-type-library"]
  },
  "spatial-and-schematic-views": {
    s: "Non-3D views of the same twin: floor plans, maps, process diagrams and network diagrams with live values, which are often faster for operators than navigating a model.",
    d: "These views are drawn from vector layouts or generated from the relationship graph, then bound to live values the same way 3D parts are. A map places distributed assets by coordinates; a process diagram follows flow connections; a floor plan uses the building frame. Because layout can be derived from relationships, it can be regenerated when the model changes. The hard part is keeping hand-drawn diagrams in step with a plant that keeps being modified.",
    k: ["Generated layout vs drawn layout: generated stays correct as assets change but can look cluttered; drawn is readable but drifts from the model.", "One view for every role vs per-role views: one view builds shared understanding; per-role views reduce clutter but split conversations."],
    p: ["A hand-drawn diagram still shows a removed pump, so operators trust a view of a plant that no longer exists.", "Map coordinates in the wrong reference system place assets kilometers off."],
    v: "Add a new asset and relationship in the model and confirm it appears in the generated diagram without editing, then compare mapped positions of three surveyed assets with their known locations.",
    dep: ["relationship-graph", "spatial-reference-frames", "data-to-visual-binding"]
  },
  "ar-vr-clients": {
    s: "Headset and handheld clients that overlay twin data on the real equipment or place the user in the model, for guided maintenance, walk-throughs and remote assistance.",
    d: "An augmented client must locate itself relative to the model, using markers, spatial anchors or scanned features, then draw values and instructions aligned to real equipment. A virtual client loads the scene and live data and lets several people share it. Both need compact scenes, low latency and a degraded mode without connectivity. The hard problems are registration accuracy on large industrial sites, tracking in featureless or reflective spaces, and safety when a headset hides a hazard.",
    k: ["Marker-based alignment vs feature-based alignment: markers are accurate and simple to deploy but need physical placement; feature-based needs nothing installed but fails in repetitive spaces.", "Cached offline scene vs live-only: offline works in plant areas without coverage, but values shown can be hours old."],
    p: ["Slight misregistration labels the neighboring valve, which is worse than showing no label.", "A headset overlay hides a floor hazard or moving machinery."],
    v: "Stand at three marked locations, check that the overlay lands within a stated tolerance on the real equipment, and confirm the client marks data stale after losing connectivity.",
    dep: ["scene-streaming-and-lod", "spatial-reference-frames", "twin-query-api"]
  },
  "timeline-scrubber": {
    s: "A time control that lets a user move the whole twin, 3D view and charts together, backward through history or forward into a simulation, and compare moments side by side.",
    d: "The scrubber sets a viewing time that all linked views obey. For the past, it asks the replay engine for state at that time; for the future, it reads simulated results from a selected scenario; at the live edge, it follows current state. It supports playback speed, bookmarks of incidents and a split view of two times. The difficulty is coordination: every view must fetch and render for the same instant, and history requests at playback speed can overload storage.",
    k: ["One shared clock for all views vs independent clocks: a shared clock makes comparisons coherent, but a slow view stalls the others.", "Prefetched playback window vs per-frame queries: prefetch plays smoothly at the cost of memory and a delay when jumping far."],
    p: ["Views show different instants after a jump, producing a picture that never actually existed.", "Playback at high speed hammers the history store and slows live users."],
    v: "Jump to a known incident time and confirm that the 3D view, charts and alarm list all show the values recorded at that second, then return to live and confirm all views resume together.",
    dep: ["replay-engine", "point-in-time-reconstruction", "scenario-manager"]
  },
  "alarm-and-event-console": {
    s: "The operator list of active and recent alarms and events from the twin, with priority, asset context, acknowledgement and shelving, designed so important items are not lost in noise.",
    d: "The console subscribes to the event stream, groups alarms by asset and area, ranks by severity and consequence, and tracks acknowledgment, shelving and return to normal. It adds twin context: where the asset is, what depends on it, recent trend and related alarms. Standards for alarm management limit rates and chatter. The hard part is volume: one root failure can cause hundreds of downstream alarms, and a console that shows all of them hides the first.",
    k: ["Show all alarms vs show correlated groups: showing all is complete but floods operators; grouping is readable but a bad grouping hides a real separate fault.", "Platform-side alarm state vs control-system alarm state: the platform view adds context, but two sources of truth can disagree about acknowledgement."],
    p: ["Chattering alarms near a threshold fill the list and push out the one that matters.", "Shelving without expiry leaves a real hazard hidden for weeks."],
    v: "Trip one upstream asset in a test model and confirm one grouped incident with the first-out alarm identified, the correct acknowledgment recorded with user and time, and shelved items returning on schedule.",
    dep: ["alert-correlation", "event-and-alarm-log", "change-propagation"]
  },
  "work-order-integration": {
    s: "Creates and updates maintenance work orders from twin findings and brings completed work back into the model, closing the loop between detection and repair.",
    d: "When a detector or prediction crosses a rule, the integration drafts a work order with the asset, symptoms, evidence links and suggested task, and posts it to the maintenance system through its interface. Status and completion come back, updating the asset's maintenance history and resetting health indicators. Technicians' notes become labeled data for later learning. The hard part is identity and duplication: the same fault can raise repeated orders, and the maintenance system's asset names rarely match the twin's.",
    k: ["Automatic creation vs recommendation for a planner: automatic is fast but spawns noise orders; recommendation keeps a human filter and delays action.", "Two-way sync vs push only: two-way keeps history accurate, but needs conflict rules when both sides edit."],
    p: ["Repeated alerts create dozens of duplicate orders for one fault.", "Completed repairs are not fed back, so the health indicator still reads degraded."],
    v: "Raise a test anomaly on one asset and confirm exactly one order appears with correct asset and evidence, then close it in the maintenance system and confirm the twin's maintenance history updates.",
    dep: ["twin-query-api", "failure-mode-library", "anomaly-feedback-loop", "asset-hierarchy"]
  },
  "operator-guidance": {
    s: "Context-aware recommendations shown to operators: likely cause, suggested checks, procedure links and, for simulation-backed twins, predicted effect of an action.",
    d: "Guidance rules or models take the current alarm set, asset state and mode, and return ranked explanations with supporting evidence and the matching procedure. A simulation-backed version also shows predicted outcomes of candidate actions. The guidance is advisory; operators decide. The hard part is trust: advice must show its evidence, be right often enough to keep attention, and never be presented as an instruction the control system would otherwise reject.",
    k: ["Rule-based guidance vs learned guidance: rules are explainable and auditable but need continual curation; learned guidance adapts but can be unable to say why.", "Advice only vs one-click action: advice is safe, whereas one-click is faster but moves the twin toward being a controller and needs the full command path."],
    p: ["Confident wrong advice during a rare event teaches operators to ignore it.", "Guidance based on stale or flagged data is shown without any mention of its quality."],
    v: "Replay a recorded past fault and confirm the guidance names the actual cause in its top suggestions with evidence attached, and that suppressed or low-quality inputs are listed on screen.",
    dep: ["alert-correlation", "failure-mode-library", "what-if-comparison", "quality-flags"]
  },
  "kpi-and-reporting": {
    s: "Computes and publishes business and engineering measures from twin data, such as availability, energy per unit and maintenance backlog, with consistent definitions across sites.",
    d: "KPIs are defined once as expressions over model properties and history, evaluated on schedules or on demand for any asset, group or site, and published to reports and external analysis tools. Because the asset hierarchy drives roll-up, one definition serves a machine and a fleet. The hard part is definition control: small differences, such as whether planned stops count, make numbers incomparable, and recalculation after corrections can change past reports.",
    k: ["Central KPI definitions vs site-defined: central gives comparable numbers but ignores local reality; site-defined fits but cannot be compared.", "Precomputed roll-ups vs compute on read: precomputed reads are fast but stale after corrections; compute-on-read is current but slow at fleet scale."],
    p: ["A late data correction silently changes a number already sent in a monthly report.", "Roll-ups double-count an asset that appears under two parents."],
    v: "Compute availability for one asset by hand from the event log and confirm it matches the platform's figure, then correct a past reading and confirm the report records a revised value with its reason.",
    dep: ["asset-hierarchy", "historical-query-engine", "event-and-alarm-log", "units-and-semantics"]
  },
  "twin-query-api": {
    s: "The interface through which other systems read the twin: asset structure, current state, history and relationships, with filters, paging and permissions applied.",
    d: "A query layer exposes the model as a graph and the values as current and time-ranged queries, with versioned contracts over HTTP and a streaming option for changes. It enforces access control, translates between model names and external identifiers, and limits query cost. Clients ask for things like all pumps in a plant with temperature above a limit. The hard part is cost control: expressive graph and time queries can scan the whole platform, and a breaking change affects every consumer.",
    k: ["Graph-style queries vs fixed endpoints: graph queries answer questions nobody planned for but can be expensive; fixed endpoints are predictable and easy to cache.", "Versioned contracts vs always-current: versions protect consumers but multiply maintenance; always-current is simple until a model change breaks an integration."],
    p: ["An unbounded history query from a reporting tool slows live operator views.", "Renaming a property in the model breaks external consumers with no warning."],
    v: "Run a filtered graph query against a known model and compare results with a direct database count, then submit a deliberately huge query and confirm it is rejected or limited with a clear error.",
    dep: ["relationship-graph", "current-state-store", "historical-query-engine", "twin-access-control"]
  },
  "event-subscriptions": {
    s: "Push delivery of twin changes, alarms and findings to other systems through subscriptions and webhooks, with filtering, retry and ordering guarantees stated up front.",
    d: "Consumers register interest by asset, property or event type. The platform evaluates changes against subscriptions and delivers them over streaming connections or callbacks, retrying failures and parking undeliverable events. Delivery semantics, such as at-least-once with per-asset ordering, are part of the contract. The difficulty is scale and slow consumers: one subscriber that cannot keep up must not hold back the others, and retries can reorder events.",
    k: ["At-least-once vs at-most-once delivery: at-least-once never loses an event but consumers must tolerate duplicates; at-most-once is simpler and may silently drop one.", "Per-asset ordering vs global throughput: ordering per asset keeps state consistent for consumers, but limits parallelism for a hot asset."],
    p: ["A slow consumer's backlog grows until it exhausts memory or forces dropped events.", "Retried events arrive after newer ones and the consumer applies the old value last."],
    v: "Subscribe a test consumer, change one property, and confirm one delivery with correct payload and sequence. Kill the consumer, change more values, restart, and confirm every change arrives in order.",
    dep: ["change-propagation", "message-broker", "twin-access-control"]
  },
  "extension-framework": {
    s: "A supported way for customers and partners to add views, analytics, importers and rules to the platform without changing its core, with permissions and resource limits.",
    d: "Extensions are packaged with a manifest declaring the data they read, the events they handle and the interfaces they add. The host loads them in isolation, gives them scoped credentials and quotas, and versions the interfaces they use. This lets one platform serve very different industries. The hard part is stability and safety: extensions run next to operational data, so a slow or malicious one must not harm the platform or exceed its permissions.",
    k: ["In-process extensions vs isolated extensions: in-process is fast and simple but a fault takes the host down; isolated is safer at the cost of latency and serialization.", "Stable narrow interface vs broad access: narrow interfaces survive upgrades; broad access is powerful and locks the platform's internals in place."],
    p: ["An extension that polls the query interface in a tight loop degrades the platform for everyone.", "An interface change breaks installed extensions during an upgrade."],
    v: "Install a sample extension with a read-only scope and confirm it can read allowed assets, is denied others, is stopped when it exceeds its quota, and is unaffected by a platform upgrade within the stable interface.",
    dep: ["twin-query-api", "twin-access-control", "tenant-isolation"]
  },
});
