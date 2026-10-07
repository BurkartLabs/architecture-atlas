// Details for the VR & AR runtime plate, part 2: input, passthrough and scene understanding, anchors, comfort.
ATLAS.details("xr-runtime", {
  "action-system": {
    s: "Applications declare abstract actions such as select, grab or move, grouped into sets, and the runtime delivers their state, regardless of which physical device produces it.",
    d: "An application creates action sets containing boolean, float, vector2, pose and haptic actions, suggests bindings for each known device, and attaches the sets to a session. Each frame it syncs, activating the sets it wants, and reads action state with flags saying whether the value is active and when it last changed. The runtime resolves bindings, applies user remapping and merges multiple sources. The difficulty is the model's strictness: sets are attached once per session, and actions with no active binding look the same as released ones unless the application checks the active flag.",
    k: ["Actions bound by the runtime vs raw button polling: users can remap and new devices work without changes, but applications cannot rely on a specific physical button.", "Attaching action sets once vs dynamic creation: the runtime can optimize and validate bindings up front, but applications must plan every action in advance."],
    p: ["Reading an action's value without checking the active flag treats an unbound or unfocused input as released.", "Suggesting bindings for only one device model leaves other controllers with no input at all."],
    v: "Run the same application with two different controller types and with hands only; confirm the same select and grab actions fire on each using the runtime's bindings, with no application code branching on device.",
    dep: ["interaction-profiles","binding-remap","app-focus-and-visibility"]
  },
  "interaction-profiles": {
    s: "Named descriptions of each kind of input device, listing its buttons, sticks, triggers, poses and haptics as paths, so bindings can be written once per device family.",
    d: "A profile defines input source paths for a device type, such as a trigger value or a grip pose, and the output paths for vibration. Applications suggest bindings from their actions to those paths; the runtime picks the profile matching the connected device and may fall back to a compatible one. New hardware often ships by emulating an older profile. The challenge is evolution: profiles are fixed contracts, so a controller with extra buttons needs an extension, and applications that bind only to the oldest profile miss new features.",
    k: ["Fixed per-device profiles vs a fully generic input model: bindings can be precise about physical layout, but each new device requires a new profile or compatibility mapping.", "Runtime fallback to compatible profiles vs strict matching: new hardware works with old applications, but defaults may not match the new layout well."],
    p: ["Binding only to the newest controller profile leaves users with older devices unable to select anything.", "A fallback that maps a thumbstick click to the wrong action causes accidental exits."],
    v: "Connect a controller whose profile the application never listed, and confirm the runtime selects a compatible profile and every declared action still produces input.",
    dep: ["controller-radio","device-abstraction"]
  },
  "binding-remap": {
    s: "Lets the user, or the runtime on their behalf, change which physical input triggers each action, including swapping hands and accessibility layouts.",
    d: "Applications supply suggested bindings; the runtime may expose a settings interface where the user overrides them per application and per device. Common uses are left-handed layouts, replacing a hard-to-reach button, and single-handed or seated play. The runtime stores the overrides and applies them when resolving actions, with no change in application code. The difficulty is coverage: it works only for actions the application declared, and application designs that depend on two-handed chords cannot be remapped without breaking their meaning.",
    k: ["Runtime-level remapping vs in-application settings: every application supports it uniformly, but the runtime cannot know when two actions must not share a button.", "Per-application overrides vs one global layout: users can tune each experience, but must repeat the work for each."],
    p: ["Remapping two actions onto the same button silently makes one unusable.", "Overrides keyed to a device serial number are lost when the user replaces a controller."],
    v: "Swap the dominant hand in settings and confirm the aim and grab actions follow the other controller in an unmodified application, and that the setting persists across a restart.",
    dep: ["action-system","interaction-profiles"]
  },
  "controller-poses": {
    s: "Delivers the position and orientation of each held controller as grip and aim poses, with tracking flags and the predicted pose for the display time.",
    d: "Pose actions expose a grip pose, where the hand holds the device, and an aim pose, the direction it points. Applications locate them in a chosen space at a given time, and the runtime returns position, orientation, velocities and validity flags. Controller tracking uses infrared markers seen by headset cameras, plus inertial data; when the controller leaves the camera view the pose degrades to inertial-only prediction. The challenge is giving a usable pose when sources disagree, and telling the application how much to trust it so it can fade a virtual hand instead of snapping.",
    k: ["Separate grip and aim poses vs one pose: each feels natural for its use, but applications must pick the right one.", "Reporting tracking quality flags vs always returning a position: applications can degrade gracefully, but many ignore the flags."],
    p: ["Using the grip pose to aim causes pointers to point slightly wrong from the user's perspective.", "Ignoring the position-valid flag lets a hand fly to the origin when tracking is lost."],
    v: "Hold a controller behind the back and confirm position-valid turns false, orientation stays valid, and the pose resumes without a jump when it returns to view.",
    dep: ["controller-tracking","action-system","pose-prediction"]
  },
  "hand-interaction": {
    s: "Turns tracked finger joints into interaction poses such as pinch point, poke tip and aim ray, so applications get stable input without parsing the skeleton themselves.",
    d: "The runtime exposes joint poses and also derived interaction signals: pinch strength, grab strength, a poke position at the fingertip, and an aim ray that originates at the shoulder and passes through the hand. Aim rays are filtered and biased because raw finger direction is jittery and tires the arm. They feed the action system as if from a controller. The difficulty is that hands have no buttons: false activation from moving a hand near an object, and missed pinches when fingers occlude each other, must be handled by thresholds and hysteresis.",
    k: ["Runtime-provided pinch and aim signals vs raw joints: consistent behavior and less code, but applications cannot tune thresholds for precision tasks.", "Shoulder-based aim ray vs finger-pointing ray: arm fatigue and jitter drop, at the cost of rays that do not match what the user thinks they point at."],
    p: ["A pinch threshold with no hysteresis makes objects flicker between held and dropped at the boundary.", "Using joint data when tracking confidence is low produces collapsed or inverted fingers."],
    v: "Pinch slowly to the threshold and confirm select activates once at a consistent strength, stays active as strength varies slightly, and releases cleanly, across ten repetitions with both hands.",
    dep: ["hand-skeleton-fitting","action-system","gaze-and-pinch"]
  },
  "gaze-and-pinch": {
    s: "A look-and-pinch interaction where the eyes choose a target and a finger gesture confirms it, with the gaze direction kept private until the pinch happens.",
    d: "The user looks at an item and pinches. The runtime tells the application where the gaze pointed only at the moment of the pinch, not continuously, so the application learns what was selected without receiving a gaze stream. Highlighting on hover is done by the runtime or the compositor without the application seeing it. This depends on eye tracking accuracy and calibration. The difficulty is precision at small targets, since the eye drifts and tracking error is a degree or more, and privacy: continuous gaze reveals interest, attention and health information.",
    k: ["Discrete gaze at the pinch moment vs a continuous gaze stream: privacy is protected, but applications cannot build gaze-only experiences or analytics.", "Eye selection with hand confirmation vs controller pointing: lower effort and no devices to hold, but accuracy falls on small targets."],
    p: ["Making targets too small for the tracking error leads to frequent mis-selection.", "Exposing gaze when no pinch occurred leaks what the user looked at to the application."],
    v: "Select a grid of targets of decreasing size by gaze and pinch, and confirm accuracy exceeds 95 percent above a documented size, and that no gaze sample reaches the application between pinches.",
    dep: ["eye-tracking-pipeline","hand-interaction","biometric-data-gating"]
  },
  "haptic-output": {
    s: "Sends vibration to controllers, as simple pulses or sampled waveforms, with the runtime handling duration, priority and stopping when focus changes.",
    d: "An output action requests a haptic event with amplitude, frequency and duration. Richer runtimes accept buffers of sampled amplitude played back at the actuator rate. The runtime stops haptics when the application loses focus or the session ends, and merges requests from several sources. Actuators differ greatly, so the same request feels different on each device. The challenge is latency and portability: a pulse must arrive in tens of milliseconds to match a visual collision, and a strong effect on one device can be inaudible or painful on another.",
    k: ["Parametric pulses vs sampled waveforms: pulses are portable and cheap, while waveforms give detailed texture but depend on actuator capability.", "Runtime stopping haptics at focus loss vs application control: a stuck motor is impossible, but background applications cannot give feedback."],
    p: ["Starting a long vibration and failing to stop it leaves the controller buzzing after an error.", "Assuming one amplitude value feels equal on all devices makes effects too strong on some."],
    v: "Trigger a 20 millisecond pulse on a virtual collision and measure with an accelerometer on the controller; confirm vibration begins within 30 milliseconds of the visual contact and stops when focus is lost.",
    dep: ["action-system","controller-radio"]
  },
  "virtual-keyboard": {
    s: "A system keyboard shown in space for text entry, positioned near the user, fed by controller rays, hand pokes or gaze, and delivering text to the focused application.",
    d: "When an application requests text input, the runtime opens a keyboard panel and returns characters, composition text and editing commands through events. It can be driven by pointing, poking keys with fingertips, or gaze and pinch, and may offer dictation. It sits in a system layer so applications cannot read keys typed in other contexts. It is hard because typing in the air is slow and tiring, so autocorrect and layout must compensate, and because text, especially passwords, must be protected from both the application and screen capture.",
    k: ["System-provided keyboard vs application-drawn: consistent, accessible and secure, but the application cannot customize layout or integrate it into its scene.", "Fingertip poking vs ray pointing: direct and intuitive, but without tactile feedback and with fatigue; rays are precise but unnatural."],
    p: ["Placing the keyboard out of arm's reach, or inside the user's virtual body, makes poking impossible.", "Keyboard contents visible to screen capture expose passwords entered inside the headset."],
    v: "Type a 20-word passage with each input method, confirm text arrives complete and correctly composed, and confirm a screen recording of the headset does not show the characters typed into a password field.",
    dep: ["hand-interaction","system-overlays","permissions-and-privacy"]
  },
  "system-gestures": {
    s: "Reserved gestures and buttons owned by the runtime, such as opening the menu, recentering and taking a screenshot, that no application can override.",
    d: "A gesture such as a palm-up pinch, a long press of a controller button or a double tap on the headset opens the system menu or triggers recentering. The runtime consumes these events before applications see them, so it can always get the user out of a stuck application. It must tell accidental movement from intent: reaching for something, scratching the face or talking with hands should not trigger it. The problem is balance. Reserved inputs shrink the vocabulary available to applications, and a gesture that is easy to trigger by accident is worse than none.",
    k: ["Reserved system input vs full application control: the user can always escape or recenter, but applications lose some buttons and poses.", "Gesture vs dedicated button: a button is reliable and cheap to detect, while a gesture works with hands only but misfires."],
    p: ["A system gesture that overlaps a common application movement opens the menu constantly during play.", "Allowing applications to suppress the system button traps users in a broken session."],
    v: "Perform the system gesture, and ordinary gestures such as waving and scratching the face, 100 times each; confirm the menu opens for at least 98 of the intended gestures and for none of the incidental ones.",
    dep: ["hand-detection","system-overlays","app-focus-and-visibility"]
  },
  "passthrough-capture": {
    s: "Reads the headset's outward-facing cameras and processes the images into a live view of the real room, including exposure, color, noise and field alignment.",
    d: "Color or monochrome cameras at the front of the headset capture the scene. An image pipeline applies exposure control, white balance, noise reduction and lens correction, then hands frames to a reprojection stage. Frames go through a hardware path, not the application, so applications never see raw camera data unless permission is granted. The difficulty is that cameras sit centimeters from the eyes, so the image has the wrong viewpoint, and the pipeline must be fast: capture-to-display delay for passthrough is felt directly as the world lagging behind head movement.",
    k: ["Dedicated hardware path from camera to display vs general GPU processing: latency is lower and power drops, but there is less room for image enhancement.", "Color vs monochrome cameras: color gives a natural view, but monochrome has better low-light sensitivity and lower cost."],
    p: ["High exposure time in dim rooms creates motion blur and a swimming image during head movement.", "Letting the application pull raw frames by default exposes everything in the user's room."],
    v: "Wave a hand in front of a clock in a dim room and measure capture-to-photon time with an external camera; confirm it is under 20 milliseconds and that no raw frame is readable by an application without a grant.",
    dep: ["camera-capture-and-exposure","passthrough-reprojection","permissions-and-privacy"]
  },
  "passthrough-reprojection": {
    s: "Warps each camera image to the user's actual eye position and the current head pose so that real objects appear at the correct place, size and depth.",
    d: "The camera views from a different point than the eye, so each frame is re-rendered from the eye's viewpoint using a depth estimate, either a stereo-derived depth mesh or a fixed proxy surface, then re-projected to the head pose at display time. Near objects such as hands are especially prone to distortion. The compositor then blends virtual layers over the result. The difficulty is depth errors: edges of hands stretch, thin objects tear and surfaces close to the user warp when the head moves, and each of these makes the real world look wrong.",
    k: ["Depth-mesh reprojection vs a fixed proxy surface: accurate close up, but expensive and artifact-prone at depth edges; a proxy is cheap but distorts nearby objects.", "Warping at display time vs at capture time: the world stays locked to head motion, at the cost of another compositor pass on the critical path."],
    p: ["Bad depth near the hands makes fingers warp and stretch, which reads as a broken view.", "Skipping the latest head pose on passthrough makes the room slosh while virtual content stays steady."],
    v: "Hold a ruler at arm's length and read it through passthrough; confirm its apparent size and position match the real ruler within 2 percent and that it stays steady during fast head turns.",
    dep: ["passthrough-capture","depth-sensing","rotational-timewarp","layer-composition"]
  },
  "environment-blend": {
    s: "Defines how virtual imagery combines with the real world: opaque for virtual reality, additive for see-through glass, alpha-blended over passthrough video.",
    d: "The runtime reports which blend modes the device supports and the application chooses one per frame. Opaque ignores the real world. Additive adds the virtual light to what the user sees through the optics, so black is invisible and darker colors cannot be drawn. Alpha blend mixes with a camera image, so correct alpha and premultiplication matter. It affects rendering choices throughout: shadows, dark objects and edges must be authored differently. Mistakes show as halos, wrong brightness or content that vanishes against a bright room.",
    k: ["Additive see-through optics vs video passthrough: the real world is seen at full fidelity and low latency, but virtual objects are translucent and cannot show black.", "Per-frame blend mode vs a session-wide mode: applications can switch between virtual reality and mixed reality, at the cost of a visible transition."],
    p: ["Rendering a black background in additive mode shows nothing, so dark UI disappears.", "Passing straight alpha where premultiplied is expected gives bright fringes around objects."],
    v: "Render a white and a black square in each blend mode on the device and confirm additive hides the black square, alpha blend shows it over the camera view, and opaque hides the room.",
    dep: ["layer-composition","passthrough-capture"]
  },
  "depth-and-occlusion": {
    s: "Provides per-pixel distance to real surfaces so virtual objects can be hidden by real ones, such as a hand or a table, and placed convincingly in the room.",
    d: "A depth source, either a time-of-flight sensor or stereo matching of camera images, is turned into a depth image aligned to each eye. The compositor or application compares it to virtual depth and masks virtual pixels behind real ones. Hands often get a dedicated mask. Depth is noisy, lower resolution than the display and weak on glass, mirrors and thin objects, so edges shimmer. The hard part is making occlusion fast enough and stable enough that it improves rather than breaks the illusion.",
    k: ["Hardware depth sensor vs stereo estimation from cameras: a sensor is accurate on plain surfaces but costs power and fails in sunlight; stereo works anywhere but is noisy.", "Per-pixel occlusion vs hand-only masks: full occlusion is convincing but costly; hand masks are cheap and cover the most noticeable case."],
    p: ["Noisy depth at silhouettes makes virtual objects flicker along the edge of real ones.", "Glass and mirrors report the wrong distance, so objects appear to sit behind a window."],
    v: "Place a virtual cube behind a real chair and a real box and confirm that the chair legs and box edges hide it correctly within 1 centimeter, stably over 30 seconds of head movement.",
    dep: ["depth-sensing","passthrough-reprojection"]
  },
  "plane-detection": {
    s: "Finds flat surfaces in the room, such as floor, walls, ceiling and tables, and reports them with extent, orientation and a stable identity.",
    d: "From the reconstructed geometry or depth images, the runtime fits planes, merges patches that belong together, and classifies them by orientation and size. Applications subscribe to plane events and receive polygons with a pose, which they use to place content on a table or hide it behind a wall. Planes grow, split and merge as the user explores, so identity is hard to maintain. Noise creates ghost planes, glossy or dark surfaces are missed, and a reliable bounding polygon needs more scanning than users expect.",
    k: ["Continuous detection vs a one-off scan: planes follow changes in the room, but identities shift and applications must handle updates; a scan is simple but goes stale.", "Plane polygons vs full mesh: small and easy to use for placement, but they lose clutter and curved surfaces."],
    p: ["Treating a plane id as permanent breaks when two planes merge and the original id disappears.", "A table's glossy top is never detected, so content sinks through it."],
    v: "Scan a room containing a table and sofa, then confirm the floor, table top and walls are detected as planes within 2 centimeters of tape-measured positions and that placing a cube on the table rests exactly on its surface.",
    dep: ["mesh-reconstruction","depth-sensing","semantic-labels"]
  },
  "mesh-reconstruction": {
    s: "Builds a triangle mesh of the surrounding room from depth data, updated as the user moves, so content can collide with and be hidden by real geometry.",
    d: "Depth frames are fused into a volumetric representation, such as a signed distance field, using the head pose, then converted to a mesh in chunks. Chunks update as new data arrives and age out when stale. Applications get meshes in anchor-relative coordinates for physics and occlusion. The difficulty is cost and quality: fusion uses a lot of memory and compute, moving objects and people leave ghosts, and the mesh must stay aligned with the world as the map is corrected, which it can't do automatically.",
    k: ["Volumetric fusion vs sparse point maps: dense surfaces that support physics and occlusion, but much higher memory and power.", "Chunked incremental updates vs rebuilding the whole mesh: lower latency and cost, with seams and version handling the application must absorb."],
    p: ["A person walking through the room leaves a ghost surface that blocks virtual objects.", "Mesh chunks not moved after a map correction drift relative to the physical walls."],
    v: "Scan a room, move a chair, rescan, and confirm the old chair surface is removed within 30 seconds and that a thrown virtual ball bounces off the walls and floor at the correct positions.",
    dep: ["depth-sensing","visual-inertial-odometry","anchor-drift-correction"]
  },
  "semantic-labels": {
    s: "Classifies parts of the scene as floor, wall, door, window, table and similar, so applications can place content sensibly without analyzing geometry themselves.",
    d: "A trained model runs on camera or depth images, or on mesh regions, and assigns labels with confidence to detected planes and objects. Applications ask for, say, all walls or the largest table, and receive geometry with labels. Scene understanding systems can also record object bounding boxes. Labels are probabilistic and context dependent: a bed can be read as a sofa, and new rooms differ from the training data. They are also revealing, since a labeled room describes a person's home and possessions.",
    k: ["On-device classification vs cloud analysis: room data never leaves the device and works offline, but models are limited by device compute and accuracy.", "Coarse labels vs open-vocabulary recognition: coarse labels are predictable for applications, but miss domain-specific objects."],
    p: ["Trusting a low-confidence label places a window poster on a door.", "Providing the full labeled scene discloses what a person owns to any application with room permission."],
    v: "Label ten rooms of varied furniture and lighting; confirm walls, floors and doors reach at least 95 percent correct and that an application without scene permission receives no labels.",
    dep: ["plane-detection","mesh-reconstruction","permissions-and-privacy"]
  },
  "room-mapping": {
    s: "Builds and stores a persistent map of a space, so the headset recognizes where it is when it returns and applications can rely on a consistent coordinate frame.",
    d: "As the user moves, the tracking system accumulates keyframes and landmarks into a map, tagged with a space identity. When the headset powers on it matches current camera views against saved maps to relocalize, and then continues in that map's frame. Maps may be merged, updated or discarded, and may be large. Difficulties include change: furniture is moved, lighting differs by season, and two similar rooms confuse the matcher. Maps are also detailed records of a person's home, so storage and deletion policy matter.",
    k: ["Persistent maps vs a fresh map each session: anchors and room setup survive restarts, but storage and privacy burdens grow and stale maps cause misalignment.", "Single large map vs per-room maps: continuous coverage is smoother, while per-room maps are easier to update and delete."],
    p: ["Relocalizing in a similar-looking room places anchors in the wrong place with full confidence.", "Maps kept after the user leaves a location leave a detailed model of a private space on the device."],
    v: "Map a room, power-cycle the headset and re-enter; confirm relocalization completes within five seconds, with the world origin within 1 centimeter and 0.5 degree of the earlier session.",
    dep: ["map-and-relocalization","loop-closure","permissions-and-privacy"]
  },
  "spatial-anchors": {
    s: "A pose in the tracked world that the runtime keeps attached to the same physical spot as the map improves, so content placed on it does not drift.",
    d: "An application creates an anchor at a pose and time and receives a handle; each frame it locates the anchor's space to get its current pose. The runtime attaches the anchor to nearby map features and updates it when loop closure or relocalization changes the map. Anchors report tracking state: located, lost or paused. The hard part is the trade-off between creating many anchors for accuracy, since each requires map support, and keeping the tracker's work bounded; anchors too far from the content produce visible slip.",
    k: ["Many local anchors vs one world origin: content stays accurate near each anchor, but too many anchors cost memory and tracking updates.", "Runtime-adjusted anchor poses vs application-held fixed transforms: errors are corrected automatically, but applications must query every frame."],
    p: ["Placing content far from its anchor makes it swing as the map is adjusted.", "Treating a lost anchor as still valid draws objects where the tracker no longer knows the place is."],
    v: "Place an anchor with a virtual marker on a wall mark, walk away through a loop of the building and return; confirm the marker is within 1 centimeter of the physical mark.",
    dep: ["room-mapping","anchor-drift-correction","reference-spaces"]
  },
  "anchor-persistence": {
    s: "Saves anchors so they survive session and power cycles, and restores them when the headset recognizes the same place.",
    d: "An application asks the runtime to save an anchor, receiving a persistent identifier. Later it loads the identifier and gets an anchor tied to the stored map data. The runtime stores the anchor along with the map features needed to find it, and restores it after relocalization. Anchors can be listed and deleted by the user or application. The difficulty is staleness and capacity: moved furniture invalidates anchors, maps are bounded in number and size, and an identifier saved by a different application or user must not be loadable by another.",
    k: ["Persistent anchors tied to a map vs application-stored coordinates: positions are corrected as the map improves, but they depend on the map surviving.", "Per-application storage quotas vs shared pool: one application cannot exhaust anchor storage, but users run out for each independently."],
    p: ["Saving a persistent id to the cloud without the map makes it useless on another device.", "Persisted anchors in a room that changed reappear floating where the table used to be."],
    v: "Save five anchors, reboot, relocalize, and confirm all five load with positions within 1 centimeter of their previous locations; delete one and confirm it cannot be loaded.",
    dep: ["spatial-anchors","room-mapping"]
  },
  "shared-anchors": {
    s: "Lets several users, each in their own headset, agree on a common coordinate frame in the same room so shared virtual objects appear in the same physical place.",
    d: "One device creates an anchor and shares it, through a service or a local channel, along with the map data needed to find it. Other devices download it, localize against it, and then compute their transform to the shared frame. Objects placed relative to it appear in the same real spot for everyone. The difficulty is that map data is both large and sensitive, and each device's tracker has its own error, so alignment can differ by centimeters between users and shift as one of them re-maps.",
    k: ["Cloud-mediated sharing vs local peer-to-peer: works across rooms and time and has easy permissions, but depends on connectivity and moves room data to a service.", "Visual map sharing vs a marker or QR alignment: markers are simple and robust, but need a fixed physical code and limit freedom."],
    p: ["Sharing the map data with the anchor exposes images of the room to every participant.", "Users who joined at different times see slightly different positions as each tracker corrects itself."],
    v: "Two headsets join the same anchor and each points at the same corner of a virtual object; confirm both rays land within 2 centimeters of each other and remain so after one user walks around the room.",
    dep: ["spatial-anchors","anchor-persistence","permissions-and-privacy"]
  },
  "anchor-drift-correction": {
    s: "Adjusts anchors when tracking revises the map, such as at a loop closure, and informs applications that the world moved so content follows the real room.",
    d: "Visual-inertial tracking accumulates small errors over time. When the headset returns to a known place, loop closure corrects the map and shifts landmarks, and anchors tied to them move too. The runtime changes anchor poses smoothly, spreading the correction rather than snapping, and flags the discontinuity. Applications that cache world poses show content jumping. The hard part is hiding the correction without leaving anchors permanently misplaced, and keeping the result consistent across all anchors and the meshes attached to them.",
    k: ["Smooth blending of corrections vs immediate snap: no visible jump, but content is briefly misaligned and transitions must be tuned.", "Correcting anchors with the map vs freezing them: anchors stay true to the room, but code and physics objects built on them see motion."],
    p: ["Applications that cache an anchor's pose across frames show content jumping after a loop closure.", "Applying a large correction in one frame is felt as a sudden jerk of the world."],
    v: "Walk 50 meters in a loop, return, and observe an anchor placed at the start; confirm its apparent shift is applied over at least one second with no single frame moving it more than a few millimeters.",
    dep: ["loop-closure","map-and-relocalization"]
  },
  "world-recentering": {
    s: "Resets the origin and forward direction of the local coordinate frame to the user's current position, and tells applications when it happens.",
    d: "The user holds a button or the runtime detects a changed standing position; the local space's origin moves to the head's current position and the forward direction to its facing, while floor level is kept. Applications receive an event with the change, and reference spaces update. It is how a seated user starts forward-facing in any chair. It is hard because content built relative to the old origin must be moved or not, depending on its type: head-locked UI should follow, world content such as a cockpit should not, and anchors must stay where they are.",
    k: ["Moving the origin vs moving the content: simple for the runtime, but world-locked content seems to teleport unless the application compensates.", "User-initiated recentering vs automatic: the user keeps control and avoids surprises, but forgetting to recenter leaves a stuck forward direction."],
    p: ["Recentering while the user is near a wall moves the play area through the boundary.", "Applications that ignore the recenter event leave the scene facing the old direction."],
    v: "Turn 90 degrees, recenter, and confirm the application receives one event, the head pose yaw reads zero, floor height is unchanged, and anchors remain at their physical positions.",
    dep: ["reference-spaces","spatial-anchors"]
  },
  "boundary-system": {
    s: "Lets the user define a safe play area, shows its edge when they approach it, and clears the view to the real room when they cross it.",
    d: "During setup the user draws the floor area with a controller or the system detects it, giving a polygon stored with the map. As the head or hands approach the edge, a grid fades in; past the edge, passthrough or a warning replaces the application. Applications query its size and can adapt content. It is hard because the boundary must be correct and persistent over restarts and for different rooms, and because a late warning hurts people: a boundary that is slightly off, stale after furniture moved, or ignores hands and controllers fails at the moment it is needed.",
    k: ["User-drawn boundary vs automatically detected: users decide what is safe, but they make errors; automatic detection follows the real room, but can miss glass or low obstacles.", "Soft grid warning vs hard cut to passthrough: the grid is less disruptive, but a fast-moving user may cross it before reading it."],
    p: ["A boundary saved in one room and reused in another places the edge in a wall.", "A boundary that tracks only the head lets a swinging arm hit furniture."],
    v: "Define a 2 by 2 meter area, walk toward the edge at normal speed, and confirm the warning appears at least 50 centimeters before the edge, and that a controller crossing it also triggers it.",
    dep: ["room-mapping","proximity-warnings","system-overlays"]
  },
  "proximity-warnings": {
    s: "Detects nearby people, pets or obstacles that were not in the boundary, and shows a warning or the real view before the user hits them.",
    d: "Depth sensing and camera analysis look for objects entering the space close to the user, and the runtime fades in passthrough contours at a safe distance, or fully switches to the real view if the object is close. It can also warn about a boundary breach by hands. It runs on a high-priority path independent of the application, so it still works in a crashed or heavy application. The difficulty is false alarms and misses: moving shadows and screens cause false triggers, while transparent and thin obstacles such as glass and cords are not detected.",
    k: ["Always-on proximity detection vs boundary-only safety: finds new hazards, but costs continuous sensor power and has false alarms.", "Fade-in contours vs a hard cut: less disorienting and keeps immersion, but may be too slow for fast-moving obstacles."],
    p: ["A glass door or thin cord is invisible to depth sensing and offers no warning.", "Frequent false alerts make users disable the feature entirely."],
    v: "Have a person walk toward a headset wearer at 1 meter per second and confirm the real view appears at least 1 meter before contact, in 20 trials, with fewer than 2 false alarms in 10 minutes of empty room.",
    dep: ["depth-sensing","system-overlays","passthrough-capture"]
  },
  "comfort-vignette": {
    s: "A runtime-controlled dimming or narrowing of the field of view during artificial movement, which reduces the visual-vestibular conflict that causes motion sickness.",
    d: "When an application moves the camera without the user moving, as with joystick locomotion or turning, the eyes report motion while the inner ear does not. A vignette hides the peripheral part of the image, where motion is most provoking, during acceleration and rotation. The runtime can apply it as a compositor effect independent of the application, scaled by detected virtual motion. The difficulty is that it is a trade between sickness and immersion, and sensitivity varies widely between people.",
    k: ["Compositor-side vignette vs application-implemented: works for every application and users can enable it globally, but the compositor only sees pose, not intent.", "Always-on vs adaptive: simple and effective, but reduces immersion even during steady motion; adaptive reacts to speed but can flicker."],
    p: ["Applications that apply their own vignette on top of the runtime's double the effect and shrink the view too far.", "A vignette that responds slowly to a sudden turn appears after the discomfort began."],
    v: "Run a standard locomotion scene for 15 minutes with the vignette off and on across 20 test participants, and confirm the self-reported discomfort score is lower with it, and that it engages within one frame of motion starting.",
    dep: ["layer-composition","comfort-constraint"]
  },
  "frame-budget-governor": {
    s: "Allocates the shared GPU, CPU and memory budget between the compositor, tracking and applications so the display deadline is met even when an application is heavy.",
    d: "The governor measures per-frame costs and the time left before display deadlines. It sets the compositor's work to a fixed, small slice with priority, grants the application what remains, and signals applications to reduce load when the margin shrinks. In severe cases it triggers reprojection or lowers the refresh rate. It balances several consumers with different timelines: tracking must run on a steady clock, the compositor must finish before scanout, and the application is flexible. Estimating costs ahead of time is difficult, because scene complexity can change from one frame to the next.",
    k: ["Strict reservation for compositor and tracking vs shared best effort: the display never starves, but applications get a smaller guaranteed share.", "Reactive downgrade vs predictive: reacting is simple but the first slow frame is already late; prediction needs good cost models."],
    p: ["Giving applications the whole GPU leaves no time for the compositor, which then misses every deadline.", "Reacting only after a missed frame causes oscillation between high and low quality."],
    v: "Run a scene that doubles its GPU cost every 10 seconds and confirm the compositor never misses a scanout deadline, the application receives a load-reduction signal before the first dropped frame, and refresh behavior matches policy.",
    dep: ["gpu-priority-preemption","performance-levels","thermal-and-power-policy"]
  },
  "performance-levels": {
    s: "A small set of preset CPU and GPU clock levels that applications request and the runtime grants, trading speed against heat and battery life.",
    d: "The application asks for a level for each of CPU and GPU, such as power saving, sustained or boost. The runtime maps the request to clocks, subject to thermal and battery state, and tells the application if it was lowered. Levels are coarse so they are portable across devices. They also determine whether tracking and the compositor have the headroom they need. It is hard because the best level changes during use: loading screens need boost but sustained play needs the level the device can hold without throttling.",
    k: ["Named coarse levels vs direct clock control: portable and safe, but cannot express the exact frequency the application needs.", "Application-requested vs runtime-chosen: the application knows its load, but the runtime knows temperature, and may override."],
    p: ["Requesting the boost level for the whole session heats the device until it throttles harder than a sustained level would.", "Never lowering the level during menus drains the battery for no gain."],
    v: "Request each level in turn while running a fixed load and confirm the runtime reports the granted level, the measured clocks match, and the sustained frame rate over 30 minutes is highest at the sustained level.",
    dep: ["thermal-and-power-policy","frame-budget-governor"]
  },
  "dynamic-resolution": {
    s: "Hints from the runtime telling the application to raise or lower its render resolution as load changes, so that quality adapts before frames are dropped.",
    d: "The runtime watches the margin between the application's frame time and the deadline, and publishes a suggested resolution scale and an indication of GPU headroom. The application resizes its viewport inside the swapchain, which keeps its images fixed in size but renders fewer pixels, and records the sub-rectangle it used in the layer. Because the compositor samples only that region, changes are seamless. It is difficult to tune: scale changes are visible as shimmering, rapid oscillation is worse than a steady lower value, and some content scales better than others.",
    k: ["Resizing the viewport within a fixed swapchain vs recreating the swapchain: instant and cheap, but memory is allocated at the maximum size.", "Runtime hints vs application heuristics: the runtime sees compositor load, while the application knows which scenes are costly."],
    p: ["Changing the scale every frame makes the picture shimmer and is more noticeable than a steady drop.", "Reporting a scale in the layer that differs from what was rendered crops or stretches the image."],
    v: "Ramp scene load until GPU time exceeds the budget and confirm the hint falls within three frames, the viewport rect in the submitted layer matches the rendered area, and the frame rate holds at target.",
    dep: ["frame-budget-governor","layer-submission","swapchains"]
  },
  "thermal-and-power-policy": {
    s: "Rules that keep a device below its safe skin and chip temperatures, by lowering clocks, brightness or refresh rate and warning the user before it must shut down.",
    d: "Sensors report chip and surface temperatures and battery state. The policy raises a thermal level as limits approach, first reducing background work and tracking rate, then lowering performance levels, panel brightness and refresh rate, and finally warning and pausing. Standalone headsets are worn against the face, so surface temperature limits are strict. The challenge is predicting: heat takes minutes to build and minutes to clear, and the useful response is early, gentle degradation instead of a late hard throttle in the middle of an experience.",
    k: ["Gradual early throttling vs hard late limits: the experience degrades smoothly, but the device runs slower than it could briefly.", "Reducing tracking cost vs reducing application cost: tracking quality drops without the application noticing, but it harms the user experience more directly."],
    p: ["Letting heat build before reacting causes a sudden drop from 90 to 45 frames per second.", "Throttling the tracking rate to save power increases latency and leads to drift."],
    v: "Run a heavy load in a 30 degree room for an hour and confirm the surface temperature never exceeds the documented limit, performance steps down gradually with notice, and the frame rate stays above the minimum.",
    dep: ["performance-levels","device-abstraction"]
  },
});
