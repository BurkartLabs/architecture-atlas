// Details for the window system & compositor plate, part 1: shell, data exchange, accessibility and text input.
ATLAS.details("window-compositor", {
  "window-management-policy": {
    s: "The rules that decide where new windows appear, how big they are, which one is raised or focused, and how windows react to resize, minimize and full-screen requests.",
    d: "Clients only request states such as maximized, full-screen or minimized; the policy decides whether to grant them. It chooses initial placement, cascades or centers windows, remembers positions, handles parent and child relationships, and decides what takes focus when a window closes. It runs inside the compositor or in a separate shell process that receives window events and sends back configuration. The difficulty is that clients assume they can position themselves, while the compositor must keep all windows consistent across monitors and workspaces.",
    k: ["Policy inside the compositor versus a replaceable shell process: in-process is faster and simpler, while a separate shell lets distributions change behavior but adds a protocol and a window of inconsistent state.", "Client-proposed versus compositor-decided geometry: letting clients suggest sizes preserves their layout needs, but the compositor must be able to override them without flicker."],
    p: ["A new window steals focus while the user is typing, and keystrokes land in the wrong program.", "Restored positions place a window off screen after a monitor is removed."],
    v: "Open windows on two monitors, unplug one, and confirm every window is reachable on the remaining output. Then launch a program from a terminal while typing and confirm focus does not change.",
    dep: ["surface-roles", "scene-graph", "keyboard-focus"]
  },
  "tiling-and-snapping": {
    s: "Layout engines that arrange windows in non-overlapping regions, either automatically as a tree of splits or manually by dragging windows to screen edges and zones.",
    d: "A tiling layout maintains a tree or list of windows per workspace and assigns each a rectangle, resizing them as windows open, close or move. Snapping is the manual version, with edge zones and keyboard shortcuts. The layout sends configure requests to clients and waits for their acknowledgement before showing the result, so tiles do not reveal half-resized content. It is hard because clients have minimum sizes, aspect constraints and slow redraws, and the layout must respect them without leaving gaps.",
    k: ["Automatic tree layouts versus free-floating with snapping: automation removes manual arrangement but surprises users when it rearranges; snapping is predictable but needs constant effort.", "Applying layout instantly versus waiting for client acknowledgement: waiting avoids torn frames but makes the layout feel slower when one client stalls."],
    p: ["A client with a minimum size larger than its tile overflows and covers a neighbor.", "Resizing many tiles at once makes slow clients visibly lag behind the layout."],
    v: "Tile four windows, drag a divider continuously, and confirm no window shows stale or stretched content for more than a frame while neighbors keep exact, gapless edges.",
    dep: ["window-management-policy", "scene-graph", "double-buffered-state"]
  },
  "workspaces-and-virtual-desktops": {
    s: "Named groups of windows of which only one set is visible at a time per monitor, letting users organize many windows without a large screen.",
    d: "Each workspace owns a list of windows. Switching sets visibility on the scene graph, usually with an animation, and moves focus to the last-used window there. Windows may be pinned to all workspaces. Workspaces can be a fixed grid, a dynamic list that adds one when the last is used, or tied to individual monitors. Hard parts are windows that move themselves between workspaces, per-monitor versus global switching, and notifying clients that they are hidden so they stop drawing.",
    k: ["Global workspaces versus per-monitor workspaces: global is simple to explain, per-monitor suits users who keep one screen constant and change the other, at the cost of more state.", "Hiding workspace windows by unmapping versus keeping them in the scene as invisible: unmapping saves work but loses animation continuity and preview thumbnails."],
    p: ["Hidden windows keep rendering and presenting frames, wasting power.", "A dialog attached to a window on another workspace is stranded and unreachable."],
    v: "Switch away from a workspace running an animation and confirm the client stops receiving frame callbacks; switch back and confirm it resumes and focus returns to the previous window.",
    dep: ["scene-graph", "stacking-and-layers", "frame-callbacks"]
  },
  "window-decorations": {
    s: "Title bars, borders, resize handles and window buttons, drawn either by the compositor for every window or by each client for its own windows.",
    d: "With compositor-drawn decorations, windows look consistent and the compositor controls resize and move directly. With client-drawn decorations, toolkits integrate controls into the window content and the compositor only provides hit regions for resizing and shadows. A negotiation lets each client say which it wants. Decoration geometry also feeds window placement, shadows count as part of the window for hit testing but not for tiling, and the client must declare which part is the actual content.",
    k: ["Compositor-side versus client-side decoration: server-side gives uniform behavior and lets frozen windows still be moved or closed, while client-side gives toolkits design freedom but breaks consistency.", "Shadows as part of the surface versus compositor-drawn: surface shadows are flexible, but they enlarge buffers and complicate tiling, damage and screen capture."],
    p: ["A frozen client with its own title bar cannot be moved or closed because no component draws working buttons.", "Invisible shadow regions receive clicks and block the window underneath."],
    v: "Freeze a client with a client-drawn title bar and confirm the compositor still offers a working close and move on it. Verify clicking the shadow margin passes through to the window below.",
    dep: ["surface-roles", "opaque-and-input-regions", "hang-detection"]
  },
  "task-switcher-and-overview": {
    s: "The window-switching interfaces: a list invoked by a key chord and a full-screen overview showing thumbnails of every window and workspace.",
    d: "The switcher orders windows by recent use, which the compositor tracks from focus changes. The overview renders live thumbnails by drawing each surface at reduced size into the scene, which means it can reuse the compositor's own render path without a capture permission. It takes keyboard focus for its duration and releases it cleanly if a window closes mid-switch. It is hard because window lists change while the UI is open, and because thumbnails of many large buffers cost texture memory and GPU time.",
    k: ["Live thumbnails versus cached snapshots: live ones are accurate and animate, but cost draw time for every window; snapshots are cheap but go stale.", "Overview as a shell-owned surface versus a compositor-internal mode: internal is smoother and sees private surfaces, while a shell surface is easier to replace and cannot see more than any client."],
    p: ["A window closes while the switcher highlights it, so the chosen target is gone when the key is released.", "Opening the overview with dozens of 4K windows stalls the GPU for several frames."],
    v: "Open the overview with thirty windows running video and measure frame times; confirm the animation holds the display's refresh rate and recent-use order matches actual focus history.",
    dep: ["scene-graph", "keyboard-focus", "gpu-compositing", "texture-import-cache"]
  },
  "panels-and-docks": {
    s: "Persistent bars along screen edges holding launchers, clocks, system status and window lists, reserving space so ordinary windows do not cover them.",
    d: "A panel is a client that requests an edge-anchored surface on a special layer and an exclusive zone, which the compositor subtracts from the usable area used by window placement and maximize. Panels receive window lists through a management protocol and may hide automatically on approach. Complexity comes from multiple monitors, each with its own usable area, from overlapping panels that must negotiate space, and from panels that start before the outputs exist.",
    k: ["Exclusive zones declared by clients versus fixed shell areas: client-declared is flexible and supports third-party panels, but needs rules for conflicts between several clients claiming the same edge.", "Auto-hide versus always visible: auto-hide frees space, but the pointer must trigger it reliably and full-screen windows must not be disturbed."],
    p: ["Two panels claim the same edge and the usable area shrinks to nothing.", "The panel starts before a monitor appears and is then lost on hotplug because it was tied to a removed output."],
    v: "Start a panel, plug in a second monitor, and confirm each output reports the correct reduced usable area and maximized windows stop at the panel edge on both.",
    dep: ["layer-shell-surfaces", "output-layout", "window-management-policy"]
  },
  "notification-surfaces": {
    s: "Transient pop-ups, banners and a notification history, shown above windows without stealing focus and honoring do-not-disturb and full-screen states.",
    d: "A notification service receives messages from programs through a separate bus interface, then draws them as surfaces on an overlay layer. The compositor does not own the content, but must place the surfaces above everything, outside the usable area, and decide whether they interrupt full-screen or locked sessions. Actions on a notification activate the sending program, which requires a token that lets it request focus. Difficulty comes from stacking several, timing, and avoiding leaking content to the lock screen.",
    k: ["Always-on-top overlay surfaces versus integration into the shell's own UI: overlays are simple and replaceable, shell integration gives better coordination with focus and presentation state.", "Showing content on the lock screen versus hiding it: showing is convenient but exposes private text to anyone nearby."],
    p: ["Notification banners pop over a full-screen presentation and expose private messages to an audience.", "Clicking an action fails to focus the sending program because the activation token was not passed along."],
    v: "Send a notification while a game runs full-screen with do-not-disturb on and confirm it is suppressed; send one while locked and confirm its body text is hidden.",
    dep: ["layer-shell-surfaces", "session-lock-and-idle", "keyboard-focus"]
  },
  "session-lock-and-idle": {
    s: "Detection of user inactivity, dimming, blanking and screen locking, with the guarantee that while locked nothing but the lock screen is visible or can receive input.",
    d: "An idle timer is reset by input events and paused by programs that inhibit it, such as video players. When it expires the compositor dims, turns the outputs off, and starts a lock client. The lock protocol makes the compositor hide all other surfaces and send input only to the lock client, on every output, including ones attached later. The hard part is the guarantee: if the lock client crashes, the compositor must stay locked rather than reveal the desktop.",
    k: ["Lock screen as an ordinary client trusted by protocol versus compositor-built: a client is replaceable and themeable, but the compositor must treat its death as a locked state, not an unlocked one.", "Idle inhibitors honored by any client versus gated by permission: open honoring supports video, but any program can keep a screen awake and unlocked."],
    p: ["The lock client crashes and the compositor falls back to showing the desktop instead of a blank locked screen.", "A newly plugged-in monitor shows the desktop because only the existing outputs were covered."],
    v: "Lock the session, kill the lock client, and confirm all outputs remain blank with input ignored. Plug in a new monitor while locked and confirm it too shows only the locked state.",
    dep: ["input-event-routing", "scene-graph", "output-layout", "client-crash-isolation"]
  },
  "shell-extension-api": {
    s: "The interface through which third-party code changes shell behavior, such as adding panels, tweaking window rules or drawing effects, and the limits placed on that code.",
    d: "Extensions may run inside the shell process with full access to its objects, as scripts in an embedded runtime, or as separate clients speaking privileged protocols. In-process extensions are powerful and can change nearly anything, but a faulty one can freeze the entire desktop. Out-of-process ones are safer but can only do what the protocols expose. Versioning is the main burden: internal structures change between releases, breaking extensions that reached into them.",
    k: ["In-process scripting versus out-of-process privileged clients: in-process offers full power and low latency, while out-of-process isolates crashes and permissions but limits what is possible.", "Stable public API versus unrestricted internals: a stable API keeps extensions working across releases but slows internal change."],
    p: ["An extension that blocks in an event handler freezes every window on the desktop.", "An update changes internal structures and silently disables extensions, with no explanation to the user."],
    v: "Install an extension that deliberately loops forever and confirm the watchdog disables it and the desktop recovers within seconds. Upgrade the shell and confirm incompatible extensions are listed, not silently dropped.",
    dep: ["window-management-policy", "compositor-event-loop", "hang-detection"]
  },
  "clipboard-and-selections": {
    s: "Copy and paste between programs: a source offers data in several formats, a target requests one, and the bytes pass directly between them through a pipe.",
    d: "The source announces which formats it can provide; the compositor records the offer and tells the focused client. On paste, the target requests a format, and the compositor gives the source a pipe to write into and the target the other end. Because the data is produced on demand, the source must be alive at paste time, unless a clipboard manager copies and holds it. Selection ownership is tied to input serials so that a background program cannot overwrite the clipboard unprompted. Primary selection and clipboard are separate.",
    k: ["Lazy transfer from the source versus copying into the compositor at copy time: lazy avoids large copies and supports rich formats, but loses the data when the source exits.", "Letting only focused clients read the clipboard versus any client: focus-gated stops silent snooping, but breaks clipboard managers and remote desktops that legitimately need background access."],
    p: ["The source application quits and the pasted content disappears, because no manager held a copy.", "A hung source blocks the paste, freezing the target while it waits on the pipe."],
    v: "Copy text in one client, exit that client, and confirm paste still works when a manager is running. Attempt a read from an unfocused client and confirm it is refused.",
    dep: ["wire-protocol", "serials-and-ordering", "keyboard-focus", "legacy-selection-bridge"]
  },
  "drag-and-drop": {
    s: "Moving data by dragging it from a window in one program onto a window in another, with the compositor mediating offers, hover feedback and the final drop.",
    d: "At drag start the source supplies an offer and an icon surface. While the pointer moves, the compositor sends enter, motion and leave events to whichever surface is underneath, and the target answers which actions and formats it accepts, so the cursor shows copy, move or not allowed. On release the target requests a format and the data flows the same way as a paste. A drag grabs the pointer, so ordinary routing is suspended. It must also work for touch and with a keyboard modifier changing the action.",
    k: ["Compositor-mediated drag with an icon surface versus client-drawn feedback: mediated works across all clients and monitors, but the protocol is stateful and fiddly.", "Data transferred on drop versus on hover: on-drop avoids needless work, but previews cannot show real content before release."],
    p: ["The source window closes during a drag and the target waits indefinitely for data that will never arrive.", "A grab left active after an error leaves the pointer unable to click anything."],
    v: "Drag a file onto another program while switching workspaces mid-drag and with the source killed; confirm the drag state is released and the cursor returns to normal in every case.",
    dep: ["clipboard-and-selections", "pointer-grabs-and-confinement", "cursor-surfaces", "pointer-hit-testing"]
  },
  "screen-capture": {
    s: "Recording or taking pictures of outputs and individual windows, by copying composed frames, with the formats and timing needed for screenshots, recording and streaming.",
    d: "The compositor offers a capture interface that either copies the composed output into a client-provided buffer or hands out a stream of GPU buffers with damage information. Capturing a single window means drawing it alone, without anything on top. Efficient capture shares GPU memory without copies back to the CPU. Hard parts are cursor inclusion, matching the display's scale and color space, and not slowing the main frame path when a recorder runs.",
    k: ["Capturing the composed output versus per-window rendering: composed is simple and exact, but per-window capture is needed to exclude other content, at extra render cost.", "Pull per-request copies versus a push stream of frames: pull suits screenshots, while a stream with damage lets recorders skip unchanged areas."],
    p: ["Capturing from the CPU path stalls the compositor and drops frames for every user while a recording runs.", "Captured colors differ from the display because the capture ignores the output's color transform."],
    v: "Record a video of a scrolling window and confirm the compositor's frame rate does not drop while capturing. Compare a screenshot to the display's content and verify identical size and color.",
    dep: ["gpu-buffer-sharing", "damage-tracking", "gpu-compositing", "capture-permission-broker"]
  },
  "capture-permission-broker": {
    s: "The service that lets users approve or deny which programs may capture the screen or windows, and which shows an indicator while capture is active.",
    d: "Because capture reads other programs' content, ordinary clients are denied it. A privileged portal service receives requests through a message bus, shows a picker for the output or window, and returns a restricted handle to the requester. The compositor checks that handle against the grant and ends capture when the grant is revoked. The picker must be drawn by a trusted component, since a program must not be able to approve itself. Sandboxed applications rely on this service for every capture.",
    k: ["Per-session approval versus remembered grants: remembering is less annoying, but a remembered grant lets a compromised program record silently later.", "A trusted picker in the shell versus the requesting program's own UI: the shell's picker cannot be spoofed, but ties the feature to one desktop environment."],
    p: ["A recording continues with no visible indicator after the user believed it had stopped.", "A program can capture without a request because it connects to the privileged protocol directly."],
    v: "Start capture from a sandboxed program with no grant and confirm it is refused. Grant it, confirm an indicator appears, revoke it, and confirm frames stop arriving at once.",
    dep: ["client-identity", "screen-capture", "security-and-isolation"]
  },
  "remote-desktop-export": {
    s: "Exposing the desktop to a remote viewer: sending frames out and accepting synthetic pointer and keyboard input back, under the same permissions as local capture.",
    d: "A remote session combines a capture stream with an input injection channel. Frames are compressed by an encoder, often using GPU video hardware fed directly from shared buffers. Input arrives through a privileged interface and is injected as if from a virtual device, so that all routing, focus and shortcuts work as normal. The compositor needs a virtual output for headless machines. Hard parts are latency, cursor shape sent as metadata rather than pixels, and revoking the session instantly.",
    k: ["Capture and encode on the compositor host versus pixel streaming from a separate display server: co-located is efficient, a separate server isolates sessions but adds a copy.", "Cursor sent as metadata versus composited into frames: metadata keeps cursor movement responsive on the viewer, but needs extra protocol work."],
    p: ["Injected input bypasses the lock screen guarantee because it is treated as a trusted device.", "Remote latency climbs because every frame is copied through system memory before encoding."],
    v: "Connect remotely, type and move the pointer, and confirm the focused app receives input. Lock the session remotely and confirm injected input cannot dismiss the lock without credentials.",
    dep: ["screen-capture", "assistive-input-injection", "capture-permission-broker", "gpu-buffer-sharing"]
  },
  "global-shortcut-registry": {
    s: "A registry through which programs ask to be notified of key combinations even when they are not focused, such as media keys or push-to-talk.",
    d: "Normally only the focused client sees keys. A global shortcut lets the compositor watch for a registered combination and deliver an activation to its owner, without revealing any other keys. Registration goes through a permission service, so the user can see and rebind them, and conflicts with compositor shortcuts are shown. It is hard because layouts change which key makes a combination, because key release matters for push-to-talk, and because the feature is a standing hole for keyloggers if too general.",
    k: ["Registering named actions the user binds versus letting programs pick key combinations: named actions let users resolve conflicts, but need extra UI for rebinding.", "Delivering only activation versus raw key events: activation only prevents snooping, but cannot support programs that need continuous key state."],
    p: ["Two programs claim the same combination and the second silently never fires.", "A shortcut defined for one layout fires on the wrong physical key after the user switches layouts."],
    v: "Register a shortcut from an unfocused program, press it under two different layouts, and confirm only that program is notified and receives no other key events.",
    dep: ["key-binding-dispatch", "keyboard-layout-engine", "client-identity"]
  },
  "accessibility-bridge": {
    s: "The channel by which assistive technology reads a structured tree of every program's interface elements, states and text, and learns when they change.",
    d: "Toolkits publish an object tree describing buttons, text and focus, over a message bus, independent of pixels. Screen readers and switch controllers subscribe to it. The compositor contributes window-level facts: which window is focused, geometry, and which are hidden. It also supplies the actions assistive technology needs, such as focus changes and moving a pointer to coordinates. The challenge is that every program must opt in, and that the pixel tree and accessibility tree must agree about what is on screen.",
    k: ["A separate accessibility bus versus delivery inside the display protocol: a separate bus is toolkit-independent, but must be kept in step with window focus and stacking owned by the compositor.", "Opt-in publishing by applications versus automatic inference from pixels: inference reaches unmodified programs, but is unreliable and slow."],
    p: ["A program renders custom controls with no accessibility tree, and appears as one blank region to a screen reader.", "Window focus changes arrive on the accessibility bus before the compositor confirms them, so speech announces the wrong window."],
    v: "Open a program with a screen reader running and confirm every control is announced. Move focus between windows and confirm the announced window always matches the one receiving keys.",
    dep: ["keyboard-focus", "assistive-input-injection", "wire-protocol"]
  },
  "assistive-input-injection": {
    s: "A privileged way for assistive tools to produce synthetic keys and pointer actions, for switch access, voice control and on-screen controls.",
    d: "Such tools need to type for users who cannot, move the pointer for users who cannot hold a mouse, and act on elements by name. The compositor offers virtual keyboard and pointer devices that the tool can drive; events enter the same routing path as hardware events. Because this capability is a complete keylogger or remote control in the wrong hands, it is restricted to explicitly trusted clients, and the compositor shows or logs its use. Timing and key-state correctness matter: stuck modifiers or lost releases make every program misbehave.",
    k: ["Virtual devices through the compositor versus kernel-level input injection: compositor-level can be per-session and permission-checked, while kernel-level works everywhere including login screens but needs system privilege.", "Granting the capability per client versus per session: per client limits damage, but assistive tools often need long-lived access."],
    p: ["A crash after pressing a modifier leaves it logically held, so every following key is interpreted as a shortcut.", "Any client that connects can inject keys because the privilege check was left at the transport level."],
    v: "Press a modifier through the virtual keyboard, kill the tool, and confirm the compositor releases the key. Attempt injection from an unprivileged client and confirm it is rejected.",
    dep: ["input-event-routing", "client-identity", "key-state-tracking", "security-and-isolation"]
  },
  "magnifier-and-color-filters": {
    s: "System-wide display adjustments for low vision and color deficiency: zoom regions that follow the pointer or caret, contrast inversion and color filters.",
    d: "The magnifier draws the scene scaled up around a focus point, following the pointer, keyboard focus or text caret, which the compositor learns from the input system and from the accessibility bridge. Color filters are fragment operations or lookup-table adjustments applied to the final image. Doing this in the compositor means every program is affected, with no cooperation needed. The difficulty is keeping the pointer and the displayed focus aligned, preserving sharpness when zooming, and not breaking direct scanout or color management.",
    k: ["Zooming by re-rendering the scene at higher resolution versus scaling the finished frame: re-rendering stays sharp, while scaling is cheap but blurry.", "Applying filters in the final output stage versus per surface: output-stage affects capture and everything including the cursor, per surface can spare a video but costs more passes."],
    p: ["With zoom active, direct scanout is disabled and the display loses a frame of latency without any warning.", "The zoomed view lags the caret, so users type blind to what they have just entered."],
    v: "Enable 4x magnification and type in an editor; confirm the zoomed view follows the caret within a frame and text remains sharp rather than a stretched bitmap.",
    dep: ["gpu-compositing", "effects-pipeline", "accessibility-bridge", "gamma-lut-pipeline"]
  },
  "keyboard-layout-engine": {
    s: "The component that converts hardware key positions into characters and symbols according to the user's layout, modifiers, groups and dead-key and compose rules.",
    d: "The kernel reports a position code, not a letter. A keymap compiled from layout, variant and option names maps each position and modifier state to a symbol, with several groups for switching languages. The compositor keeps the state (shift, lock, group, held dead keys), updates it for each event, and tells clients the keymap and modifier mask so they can interpret raw codes themselves. Compose sequences and dead keys combine presses into accented characters. It is hard because shortcuts must work for every layout and layouts change while keys are held.",
    k: ["Clients interpret raw codes using a shared keymap versus the compositor sending characters: sharing the keymap keeps repeat and shortcuts flexible, while sending characters is simpler but loses position information games need.", "One global layout versus a layout per window: per window follows user context, but surprises users when focus changes silently switch the layout."],
    p: ["A layout switch while a key is held leaves the release interpreted in the wrong group.", "Shortcuts are bound to characters, so they move to unreachable keys on non-Latin layouts."],
    v: "Type the same shortcut and a dead-key accent under two layouts and confirm the intended result each time, and that games reading raw key positions are unaffected by the layout.",
    dep: ["key-state-tracking", "input-method-framework", "seat-model"]
  },
  "input-method-framework": {
    s: "The service for entering text in scripts that need composition, such as phonetic or stroke-based systems, by turning key sequences into candidate lists and committed text.",
    d: "An input method engine runs as a separate client. The compositor routes key events to it while a text field is active, and the engine returns preedit text (shown underlined in the field), a candidate list shown near the cursor, and final committed text. The text input protocol connects the application's field to the engine, reporting the cursor rectangle and surrounding text. It is hard because focus must change atomically for both the application and the engine, and because the candidate window must be placed correctly, even on scaled or rotated displays.",
    k: ["Engine as a separate client versus loaded into every application: separate isolates crashes and keeps one implementation, but needs a protocol and careful focus handoff.", "Keys go through the engine before the application versus after: before lets the engine consume composing keys, but adds a hop to every key press."],
    p: ["Keys typed during a focus change reach the application and the engine out of order, producing garbled text.", "The candidate window appears at the wrong place on a scaled monitor because coordinates were not translated."],
    v: "Type a multi-step composition with candidates in two programs, switching windows mid-composition; confirm no preedit text is left behind and committed text is correct and in order.",
    dep: ["text-input-protocol", "keyboard-layout-engine", "keyboard-focus", "input-event-routing"]
  },
  "text-input-protocol": {
    s: "The protocol between a focused text field and the input method or on-screen keyboard: enable and disable, cursor position, surrounding text, preedit and commit.",
    d: "When a text field gains focus it enables text input and sends content type hints (password, number, email), the cursor rectangle and the text around the cursor. The input method replies with preedit text, deletions around the cursor, and committed text, all applied atomically in one batch tied to a serial so it can be rejected if the field has changed. Hints let a keyboard show the right layout and let password fields avoid prediction. It is hard to keep in step across asynchronous processes without applying edits to stale text.",
    k: ["Batched edits with a serial versus streaming individual operations: batching stays consistent with changing text, but costs latency and requires clients to resend state.", "Sharing surrounding text versus keeping it private: sharing enables better prediction, but leaks content to the input method process, so it is withheld for password fields."],
    p: ["The user types quickly, edits arrive against old text, and characters land at the wrong position.", "A password field reveals its contents to the input method because the content hint was ignored."],
    v: "Type quickly in a field while the input method is delayed by a second, and confirm the final text is correct. Focus a password field and confirm no surrounding text is sent.",
    dep: ["serials-and-ordering", "keyboard-focus", "wire-protocol"]
  },
  "on-screen-keyboard": {
    s: "A virtual keyboard drawn on the display for touch devices and accessibility, which appears when a text field is focused and shifts content so the field stays visible.",
    d: "The keyboard is a client on an overlay layer that reserves screen space. It responds to text input enable events, shows a layout fitting the content hint, and sends keys through a virtual keyboard or committed text. The compositor or toolkit must move or resize the focused window so the field is not covered, and must hide the keyboard when focus leaves text. Hard parts are focus races, because showing the keyboard must not take keyboard focus away from the field, and consistent behavior with physical keyboards attached.",
    k: ["Keyboard as an overlay that covers content versus resizing the application: overlay is simple and does not need application support, resizing keeps fields visible but requires cooperation from clients.", "Sending committed text versus synthetic key events: committed text is reliable for composition, key events work for programs that only understand keys."],
    p: ["The keyboard covers the field being edited because the window was not moved.", "Tapping a key takes focus from the text field, so the keyboard closes and typing stops."],
    v: "Tap a field near the bottom of a touch screen and confirm the keyboard appears, the field remains visible above it, and typed characters arrive while the field stays focused.",
    dep: ["text-input-protocol", "layer-shell-surfaces", "assistive-input-injection"]
  }
});
