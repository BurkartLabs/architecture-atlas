// Details for the window system & compositor plate, part 3: scene and damage, input routing.
ATLAS.details("window-compositor", {
  "scene-graph": {
    s: "The compositor's tree of everything on screen: surfaces, their subsurfaces, positions, sizes, transforms and visibility, from which each frame is produced and input is resolved.",
    d: "Nodes represent surfaces, groups, decorations and effects, with a position relative to a parent and a stacking order among siblings. Both rendering and input read the same tree: drawing walks it back to front, and hit testing walks it front to back. Commits from clients update nodes, and each change records damage. Keeping one structure for both avoids disagreement between what is drawn and what is clickable. It is hard because the tree changes at arbitrary times from many sources, and every consumer must see a consistent snapshot.",
    k: ["A retained tree versus rebuilding a flat list every frame: retained supports damage tracking and animation with little work, while rebuilding is simpler but wastes effort on static scenes.", "One tree for drawing and input versus separate structures: one tree cannot disagree with itself, but couples the two concerns."],
    p: ["Input resolves against a scene that the next frame has already changed, and a click lands on a window that is no longer there.", "A node is destroyed during traversal and the compositor reads freed memory."],
    v: "Move and restack windows while clicking rapidly; confirm every click is delivered to the window that was visibly under the pointer in the most recently presented frame.",
    dep: ["surface-roles", "stacking-and-layers", "damage-tracking"]
  },
  "stacking-and-layers": {
    s: "The ordering of windows from back to front, grouped into fixed layers such as background, windows, panels and overlays, so each kind of surface stays where it belongs.",
    d: "Within the normal window layer, order follows recent raise events. Above it are panels, full-screen windows, lock surfaces and overlays, in a defined sequence. A window requesting always-on-top is placed in a higher sublayer. Transient windows stay above their parent. The compositor re-sorts when windows are raised, moved between workspaces or made full-screen. It is difficult because rules from several sources conflict, such as a full-screen window and a notification both wanting to be on top.",
    k: ["Fixed named layers versus a single free-form z-order: layers make behavior predictable and let panels never be covered, but constrain unusual designs.", "Raise on click versus raise on focus change: raise on click is explicit, while raising on focus can reorder windows unexpectedly."],
    p: ["A full-screen window sits below the panel because the layer rules were applied in the wrong order.", "A transient dialog drops below its parent after the parent is raised."],
    v: "Open a full-screen video, a panel, a notification and a dialog; confirm the visible order matches the documented layer order and a raised parent always brings its dialog with it.",
    dep: ["scene-graph", "layer-shell-surfaces", "popups-and-transients"]
  },
  "layer-shell-surfaces": {
    s: "Surfaces that anchor to screen edges or fill outputs on named layers, used for panels, wallpapers, launchers, lock screens and overlays that are not ordinary windows.",
    d: "A client creates a surface on the background, bottom, top or overlay layer, anchors it to edges, and may request an exclusive zone and keyboard interactivity (none, exclusive or on demand). The compositor positions it per output and reduces the usable area by the exclusive zone. Since clients can request exclusive keyboard focus, which can lock out the user, the compositor limits it to trusted clients or layers. Hard parts are many outputs, outputs that appear after the client starts, and anchoring with margins.",
    k: ["A dedicated layer protocol versus building shell elements into the compositor: a protocol lets any shell be written as a client, but the compositor must police privilege.", "Exclusive keyboard focus allowed versus restricted: exclusive focus supports launchers and lock screens, but any client could take the keyboard."],
    p: ["A launcher keeps exclusive keyboard focus after being hidden, and no other window receives keys.", "A surface anchored to all four edges on an output that disappears is not moved and stays unreachable."],
    v: "Start a layer client with exclusive keyboard focus and kill it; confirm focus returns to the previous window. Hotplug an output and confirm the client receives a new surface size.",
    dep: ["stacking-and-layers", "output-layout", "client-identity", "keyboard-focus"]
  },
  "popups-and-transients": {
    s: "Menus, tooltips and dialogs that are positioned relative to a parent surface, must stay on screen, and are dismissed by actions elsewhere.",
    d: "A popup requests a position through a rectangle on its parent and a set of gravity, anchor and constraint-adjustment rules. The compositor resolves this against the output so the popup flips or slides when it would run off screen, then tells the client the final geometry. Popups form a stack, where a click outside the top popup dismisses it, and sometimes the whole chain. A grab ensures events go to the popup. The challenge is that the client knows the content and the compositor knows the screen, so each must be given the information needed.",
    k: ["Compositor resolves position from constraint rules versus client computes absolute position: compositor resolution is the only one that can know about monitors and panels, but needs a rule language clients can express.", "Popups grab input versus normal focus rules: grab gives menus their expected dismiss behavior, but a stuck grab can freeze the desktop."],
    p: ["A tooltip near the screen edge is cut off because constraint adjustment was not requested.", "A nested menu stays after the click that should have closed the whole chain."],
    v: "Open a nested menu near each corner of a two-monitor setup and confirm every level is fully visible, correctly nested, and the whole chain closes on a click outside.",
    dep: ["surface-roles", "stacking-and-layers", "pointer-grabs-and-confinement", "output-layout"]
  },
  "damage-tracking": {
    s: "Recording which regions of which surfaces and outputs changed since the last presented frame, so only those pixels are redrawn and, where possible, only those are updated.",
    d: "Clients report damage rectangles in their commits. The compositor transforms them through scale, position and transform into output coordinates and accumulates them per output. With several buffers in rotation, damage must also be kept for each earlier frame, since an older buffer lacks the intermediate changes, which is called buffer age. Redraw is clipped to the union. Damage also tells capture and remote tools what to send. It is hard because anything that changes appearance without the client noticing, such as effects, animations and moved windows, must also add damage, or stale pixels remain.",
    k: ["Tracking damage precisely versus redrawing whole outputs: precise tracking saves power and bandwidth, but any missed case leaves visible artifacts.", "Per-frame damage history using buffer age versus full redraw on swap: history lets triple buffering stay efficient, while full redraw is simpler but costs the most."],
    p: ["A moving window leaves a trail because the region it vacated was never marked damaged.", "A client reports no damage after a change, and the stale content stays on screen."],
    v: "Run an animation with a randomized one-pixel marker in each corner of every surface; confirm no stale pixels remain after each frame while GPU work scales with the changed area.",
    dep: ["scene-graph", "render-damage-clipping"]
  },
  "opaque-and-input-regions": {
    s: "Two region sets per surface: the part that is fully opaque, letting what is behind it be skipped, and the part that accepts pointer and touch input, which may differ from its visible shape.",
    d: "An opaque region tells the compositor that hidden surfaces behind it need not be drawn or damaged, which is a major saving for full-window applications. The input region defines where clicks hit the surface, so shadows and transparent margins can let clicks through. Both are specified by the client in surface coordinates, double-buffered, and must be transformed by scale and transform. Because a wrong opaque region makes the compositor skip drawing something visible, regions are trusted only as far as the compositor can check them against the buffer format.",
    k: ["Trusting client opaque regions versus verifying against buffer alpha: trust is fast, but a mistaken client causes visible holes.", "Input regions as rectangles versus arbitrary shapes: rectangles are cheap to test, arbitrary shapes support odd windows but cost more."],
    p: ["A client declares a translucent area opaque, and the window behind it disappears from the output.", "A transparent shadow keeps its input region and swallows clicks meant for the window underneath."],
    v: "Overlay a window with a transparent edge over another and click through the edge; confirm the click reaches the lower window. Declare a wrong opaque region and confirm the resulting artifact is visible in a screenshot.",
    dep: ["scene-graph", "double-buffered-state", "pointer-hit-testing", "gpu-compositing"]
  },
  "output-layout": {
    s: "The arrangement of all monitors in one global coordinate space, with positions, sizes in logical units, transforms and scale, which decides where windows and the pointer can go.",
    d: "Each output has a position, a mode, a rotation and a scale, and together they define a layout of logical rectangles that may be adjacent, overlapping for mirrors, or non-rectangular. Windows are placed in the global space, and each surface is told which outputs it overlaps so it can pick a scale. The pointer travels between outputs through shared edges. Hard parts are gaps that make the pointer stick, mixed scales where logical sizes differ from pixels, and clients that need to know the visible area on each output.",
    k: ["A single global logical space versus independent per-monitor spaces: global lets windows span monitors and the pointer flow, but mixed scales force fractional logical positions.", "Pointer clamping at layout edges versus wrapping or jump rules: clamping is predictable, but staggered monitors have dead zones the pointer cannot cross."],
    p: ["Two monitors with offset edges leave a strip where the pointer cannot pass.", "A window straddling two monitors with different scales looks blurry or oversized on one."],
    v: "Arrange three monitors with different scales and offsets; drag a window across them and move the pointer around the whole edge, confirming continuous movement and correct size on each monitor.",
    dep: ["multi-monitor-config", "scene-graph", "output-scale-policy"]
  },
  "window-animation": {
    s: "Timed transitions for opening, closing, moving and switching windows, driven by the compositor's frame clock and drawn without involving the client.",
    d: "Animations interpolate position, scale, opacity or effects over a duration, advancing by the frame's presentation time instead of wall-clock to stay smooth. A closing window needs to remain visible after the client has gone, so the compositor keeps its last buffer as a snapshot. Animations add damage on every frame, so they prevent the display from idling and may disable direct scanout. They must also be interruptible: a window moved during its open animation continues smoothly, and a reduced-motion setting disables them.",
    k: ["Animating in the compositor versus asking clients to animate: compositor animation is uniform and cheap on the client, but cannot animate content inside windows.", "Time-based versus frame-count-based advance: time-based remains correct when frames are dropped, but needs a good estimate of the next presentation time."],
    p: ["A closing animation keeps an old buffer alive and leaks memory when many windows close rapidly.", "Animations ignore the reduced-motion setting and cause discomfort for sensitive users."],
    v: "Open and close windows with animation under heavy load and confirm motion follows presentation timestamps without jumps, and that enabling reduced motion removes every animation.",
    dep: ["frame-scheduler", "scene-graph", "damage-tracking", "presentation-feedback"]
  },
  "seat-model": {
    s: "The grouping of input devices and focus into a seat: one keyboard focus, one pointer and any touch devices that together represent one user at one workstation.",
    d: "A seat owns a keyboard state, a pointer and a set of touch points, and tracks which surface has each kind of focus. Clients bind to a seat and are told its capabilities, which come and go as devices attach. Multiple seats allow several users on one machine or a pointer and a tablet acting as independent cursors. Each seat has its own keymap and its own clipboard. The seat is the unit that input routing, grabs and selections attach to, and it makes events from different users never mix.",
    k: ["One seat per workstation versus multiple seats with separate focus: single seat is what almost all desktops need, while multi-seat enables shared machines but multiplies state and testing.", "Capabilities announced dynamically versus fixed at startup: dynamic matches hotplug, but clients must handle devices disappearing while focused."],
    p: ["A keyboard is unplugged and clients keep a reference to a keyboard object that will never send events.", "Two seats share a clipboard unintentionally, leaking data between users."],
    v: "Unplug and replug the only keyboard and confirm clients receive a capability change, then new focus events. On a multi-seat setup, confirm typing on one seat never reaches the other seat's focused window.",
    dep: ["device-discovery", "input-event-routing", "keyboard-layout-engine"]
  },
  "input-event-routing": {
    s: "The decision, for every key, pointer motion, button, scroll and touch event, of which client receives it, taking in grabs, focus, shortcuts, overlays and the lock state.",
    d: "Events from devices pass through ordered stages. The compositor first tests its own consumers: lock state, shell shortcuts, gesture recognizers and active grabs. Whatever survives goes to the focused surface for keys, to the surface under the pointer for pointer events, and to the surface that received the first touch for later touch events. Coordinates are converted into surface-local space. Because this is where the keystroke of one program could reach another, the routing is the principal security boundary of the desktop. The challenge is ordering and corner cases during focus change.",
    k: ["Compositor shortcuts see events before clients versus after: before makes shortcuts reliable, but a bug there can swallow keys from every program.", "Routing by focus alone versus allowing clients to snoop with permission: focus-only is a clean security model, but breaks legitimate tools needing global input."],
    p: ["A key press and its release go to different clients because focus changed between them, leaving a key stuck.", "A bug in a gesture recognizer swallows all pointer events until restart."],
    v: "Press a key, change focus while it is held, and release; confirm the original client receives the release, the new one does not see a stray release, and no stuck-key state remains.",
    dep: ["seat-model", "keyboard-focus", "pointer-hit-testing", "key-binding-dispatch", "gesture-recognition"]
  },
  "keyboard-focus": {
    s: "The single surface that receives key events, how it is chosen by click, hover or policy, and how it changes without losing or misrouting keys.",
    d: "Focus changes send a leave event to the old surface and an enter event, with the currently held keys and modifiers, to the new one. Policy decides what triggers a change: click, pointer entering, a request with a valid activation token, or a window closing. A client cannot give itself focus without a token or user action, which prevents focus stealing. The compositor must also handle windows that never map, disappear while focused, or are hidden by workspace changes.",
    k: ["Click-to-focus versus focus-follows-pointer: click is explicit and avoids accidents, while follows-pointer is faster for tiled and multi-monitor work but can focus unintended windows.", "Activation tokens versus unrestricted requests: tokens stop stealing yet need launchers to cooperate; unrestricted requests are simple but interrupt typing."],
    p: ["The focused window closes and focus falls to none, so the next keystrokes go nowhere.", "A background program steals focus mid-sentence and the typed text, including a password, goes to it."],
    v: "Type continuously while another program tries to raise itself; confirm every keystroke goes to the original window. Close the focused window and confirm focus passes to a sensible next window.",
    dep: ["input-event-routing", "serials-and-ordering", "stacking-and-layers"]
  },
  "pointer-hit-testing": {
    s: "Finding the surface under a pointer position by walking the scene front to back, respecting input regions, layers and grabs, and converting the position to surface-local coordinates.",
    d: "For each motion the compositor determines which surface contains the point in its input region, skipping those with an empty region or marked non-interactive. The result decides enter and leave events and which cursor image to use. If a grab is active, the grabbing surface receives all motion. Scaling and transforms are applied in reverse to give local coordinates, often fractional. It is hard because it runs on every pointer event, so it must be fast, and because the scene may be mid-update.",
    k: ["Hit testing on every motion versus caching the last result: always testing is correct with moving windows, caching is faster but can send events to a stale target.", "Fractional versus integer surface coordinates: fractional preserves precision at high scale, but clients must accept subpixel values."],
    p: ["A window moves under a stationary pointer, but no new motion arrives, so the old window keeps the hover state.", "Rounding with a fractional scale makes the last pixel of an edge unreachable."],
    v: "Place a window under a still pointer and move it away and back; confirm enter and leave events fire without pointer motion, and that edge pixels at a 125 percent scale resolve to the correct window.",
    dep: ["scene-graph", "opaque-and-input-regions", "input-event-routing"]
  },
  "pointer-grabs-and-confinement": {
    s: "Temporary exceptions to normal pointer routing: capturing all pointer events for a drag, locking the pointer in place for games, or confining it to a region.",
    d: "An implicit grab begins when a button is pressed, so that the release and any motion in between go to the same surface even outside it. Explicit protocols let a client lock the pointer position and receive relative motion, or confine the pointer to its window, which suits games and remote desktops. These work only while the client is focused and are removed when focus leaves or on a key combination that the user can always press. Hard parts are releasing a grab on every exit path and restoring the pointer position afterward.",
    k: ["Implicit button grabs versus strict hit testing for every event: implicit grabs make drag operations work reliably, but leave events arriving at a surface the pointer has left.", "Allowing clients to lock the pointer versus always freeing it: locking is essential for games and 3D tools, but a client that never releases it traps the user."],
    p: ["A crashed game leaves the pointer confined and the user cannot reach other windows.", "A grab outlives the surface it belonged to and pointer events are lost."],
    v: "Lock the pointer from a game, kill the game, and confirm the pointer is free and visible immediately. Hold a button, drag outside the window, release, and confirm the release reaches the original window.",
    dep: ["input-event-routing", "pointer-hit-testing", "client-crash-isolation"]
  },
  "gesture-recognition": {
    s: "Turning streams of touch or touchpad points into recognized gestures such as swipe, pinch and rotate, and deciding whether they belong to the compositor or the application.",
    d: "A recognizer watches multiple touch points or touchpad contacts over time, and emits begin, update and end events for a gesture once it matches a pattern. Gestures with several fingers often belong to the system, for workspace switching, while two-finger pinch usually goes to the application. Ambiguity is the central problem: the system cannot know early whether the touch will become a system gesture, so events may be held briefly, or the application's touch is cancelled when the gesture is claimed. Thresholds and conflicts with scrolling need tuning.",
    k: ["Delaying events until the gesture is classified versus forwarding at once and cancelling later: delay avoids spurious input to apps but adds latency; cancelling is responsive but apps must handle cancellations.", "System-wide gestures versus application-owned only: system gestures are consistent, but take away multi-finger input that applications may want."],
    p: ["A three-finger swipe is partly delivered to an application as three separate touches, causing a stray action.", "Thresholds tuned for one display size misfire on another, triggering workspace changes by accident."],
    v: "Perform a three-finger swipe while a drawing application is open and confirm the app receives a cancel for those touches and no stray marks. Pinch inside the app and confirm it receives the gesture.",
    dep: ["touch-tracking", "touchpad-processing", "input-event-routing"]
  },
  "touch-tracking": {
    s: "Tracking each finger from first contact to lift with a stable identifier, and delivering its down, motion, up and cancel events to the surface where it began.",
    d: "Each contact gets an id by the device or compositor. The first down event picks the target surface by hit testing, and all later events for that id go to the same surface, regardless of where the finger moves. A frame event groups simultaneous changes so clients process them together. If the compositor takes over, for example a system gesture, it sends cancel to the client. It is hard to handle devices that report contact ids inconsistently, to keep ids from being reused too quickly, and to map coordinates across rotated and scaled outputs.",
    k: ["Touch targets fixed at touch-down versus following the finger: fixed ids give simple semantics and reliable drags, but a finger that slides to another window cannot interact with it.", "Grouping events into frames versus individual delivery: frames make multi-finger processing consistent, but need a boundary every client must wait for."],
    p: ["A touch id is reused immediately, and a client mixes up the old and new fingers.", "Touch coordinates ignore output rotation, so touches land in the wrong place on rotated screens."],
    v: "Place and lift ten fingers in a random order across two windows and a rotated monitor; confirm each id's events arrive at its original surface with correct local coordinates and balanced down and up pairs.",
    dep: ["input-event-routing", "pointer-hit-testing", "output-layout"]
  },
  "tablet-handling": {
    s: "Support for pen tablets and stylus devices: pressure, tilt, hover distance, tool type and buttons, plus the mapping of the tablet area to the screen.",
    d: "A tablet device reports tools (pen, eraser, brush) entering proximity, then position with pressure and tilt, and button states. The compositor maps the tablet's surface onto an output or region, which may be absolute, and routes events to the surface under the tool. Pen on a screen device must align with the pixels beneath it, including rotation and scale. It is hard to give a pen the pointer behavior of a mouse when needed and richer events when requested, and to keep latency low for drawing.",
    k: ["Pen as an extended pointer versus a separate tool protocol: extended pointer works with all programs, while a separate protocol preserves pressure and tilt but needs application support.", "Absolute mapping to one output versus the entire desktop: one output feels natural on a screen tablet, the whole desktop suits external tablets but stretches the aspect ratio."],
    p: ["The stylus position is offset from the visible tip because rotation or scale was not applied to the mapping.", "Pressure data is dropped on its way through a compatibility path, so strokes have uniform width."],
    v: "Draw slowly and quickly with varying pressure and tilt in a painting program on a rotated, scaled screen tablet; confirm the line follows the tip within a pixel and width tracks pressure.",
    dep: ["input-event-routing", "pointer-hit-testing", "output-layout", "touchpad-processing"]
  },
  "key-binding-dispatch": {
    s: "Matching key combinations against the compositor's own shortcut table before they reach any client, including modifiers, sequences and the handling of key release.",
    d: "The table maps modifier and key combinations to actions: switch workspace, launch, close or move a window. It is checked on key press using the keymap's symbols, and a match consumes both the press and the release, so the focused client sees neither. Some bindings are active even when the session is locked, such as volume keys, and others never. Bindings can be remapped by users through configuration, and may be released, repeated or chained. It is difficult because bindings must not leak a stuck modifier and must work consistently under all layouts.",
    k: ["Binding by symbol versus by physical key: symbols follow the letter printed on the keycap, while physical keys keep shortcuts in the same place across layouts.", "Consuming events versus passing them through: consuming prevents clients from also reacting, but loses keys that the user wanted to reach the application."],
    p: ["A binding consumes the press but not the release, and the client sees a release with no press.", "A binding stays active in the lock state and runs commands on a locked session."],
    v: "Press a bound combination under two layouts and with the lock screen active; confirm the action runs when intended, the focused application receives no stray events, and locked bindings are limited to the allowed set.",
    dep: ["keyboard-layout-engine", "input-event-routing", "key-state-tracking", "session-lock-and-idle"]
  },
});
