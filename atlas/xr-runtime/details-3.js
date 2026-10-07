// Details for the VR & AR runtime plate, part 3: compositor, reprojection and latency, optics.
ATLAS.details("xr-runtime", {
  "frame-scheduler": {
    s: "Decides when each application should start rendering and when the compositor should begin its own work, so finished images arrive just before each display refresh.",
    d: "The scheduler knows the display period, the compositor's cost, and recent application render times. It computes the predicted display time and releases the application's wait call early enough for the application to finish, while keeping the pose as fresh as possible. It adapts to each application's measured cost, and it may halve the application rate when the application cannot keep up. The difficulty is a moving target: render costs vary frame to frame, and releasing too early adds latency while releasing too late misses the refresh and forces a repeat or reprojected frame.",
    k: ["Releasing the application as late as safely possible vs as early as possible: late release gives fresher poses and lower latency, but leaves no slack for a slow frame.", "Adaptive per-application timing vs a fixed offset: handles different workloads, but oscillates when load changes quickly."],
    p: ["Scheduling from a stale cost average starts the application too late after a heavy scene change.", "Keeping the full refresh rate while the application can only reach half leads to uneven frame delivery that looks like judder."],
    v: "Log application end-frame time against the compositor deadline for 10,000 frames across scene loads; confirm fewer than 0.1 percent of frames miss, and that the average pose age at render start is under the documented value.",
    dep: ["display-timing","pose-prediction","frame-budget-governor"]
  },
  "display-timing": {
    s: "Tracks when the panel actually refreshes and scans out, including its refresh rate and the lag between submission and light, so every other stage can aim at the right moment.",
    d: "The display driver reports vertical sync events with timestamps and the panel's scanout pattern: global, or rolling from one edge, where the last row lights later than the first. The compositor uses these to predict the display time of each frame and to apply per-row warp corrections for rolling displays. Variable refresh rate adds another degree of freedom. The challenge is drift and uncertainty: clocks differ between the GPU, panel and sensors, link delay changes, and a small error becomes a visible one at head-turn speeds.",
    k: ["Using measured scanout timing vs a nominal refresh period: predictions are accurate even as timing drifts, but the runtime needs continuous measurement and filtering.", "Global vs rolling scanout assumption: global is simple, but rolling displays need row-dependent prediction or one edge shows more latency."],
    p: ["Assuming a nominal 90 Hz when the panel really runs 89.9 slowly shifts predictions until frames are visibly late.", "Ignoring rolling scanout makes the top and bottom of the image disagree about where the world is."],
    v: "Capture the panel with a high-speed camera while it shows a timestamp pattern, and confirm measured scanout time for the top and bottom rows matches the driver's reported timing within 0.5 millisecond.",
    dep: ["display-driver","sensor-time-sync"]
  },
  "layer-composition": {
    s: "Combines all submitted layers and system overlays into one image per eye, resampling each from its render pose to the final display pose in a single GPU pass.",
    d: "For each output pixel the compositor samples the layers in order, applying their poses, alpha and sorting, then applies distortion correction in the same pass to avoid resampling the image more than once. Projection layers carry the main scene; flat layers are sampled directly. It must complete in a fraction of a frame at all times. The challenge is the cost of many layers at high resolution, since sampling bandwidth is limited, and keeping filtering good enough that text on a layer is crisp while the head moves.",
    k: ["Single-pass composition with distortion vs separate passes: fewer samples and sharper results, but the shader is complex and hard to extend.", "Compositor-side layers vs application-rendered into one image: sharper text and reprojection per layer, but fixed capacity and blending rules."],
    p: ["Resampling an image twice, once for composition and once for distortion, blurs text noticeably.", "Exceeding the layer sampling budget forces the compositor to miss its deadline for every application."],
    v: "Submit a projection layer and four text layers, capture the output, and confirm 10-point text is legible at the stated angular resolution and the compositor GPU time stays within its allotted slice.",
    dep: ["distortion-mesh","quad-and-cylinder-layers","gpu-priority-preemption"]
  },
  "quad-and-cylinder-layers": {
    s: "Layer types for flat or curved surfaces such as video, text and menus, which the compositor samples directly from the application's texture at full display resolution.",
    d: "A quad layer places a rectangle in space with a pose and size; a cylinder layer wraps a curved strip around the user. The application draws into a texture at the layer's native pixel density and the compositor resamples it for each eye and head position, reducing blur compared with rendering it into the main scene. Video players and user interface panels use them. The hard part is choosing a texture size and filtering mode: too small is blurry, too large wastes memory and bandwidth, and mipmapping must be controlled for text.",
    k: ["Dedicated layers vs rendering UI into the main scene: text is sharper, pose-corrected and cheaper, but depth interaction with the 3D scene is limited.", "Cylinder vs flat quad for wide panels: a cylinder keeps every part at a similar distance from the eye, but needs a more complex sampling path."],
    p: ["Mismatched layer texture and display pixel density blurs text even though the layer is sampled directly.", "Layers drawn at the wrong depth order with the 3D scene appear in front of objects that should hide them."],
    v: "Place a text panel at 1.5 meters and compare its sharpness with the same text rendered into the main scene; confirm the layer reads small text at least one size smaller and stays stable under head movement.",
    dep: ["swapchains","layer-composition"]
  },
  "depth-submission": {
    s: "Lets applications submit their depth buffer with the color image so the compositor can reproject positions accurately and place layers and overlays at correct depths.",
    d: "The application attaches a depth swapchain image and its near and far range to the projection layer. The compositor uses it for positional timewarp, for hiding system overlays behind application geometry, and for mixed reality occlusion against real objects. Depth format, direction (reversed or standard) and range must be reported exactly. It is difficult because depth costs bandwidth and memory, because applications render depth in many conventions, and because errors are subtle: a wrong near plane gives mild distortions that appear only during head translation.",
    k: ["Submitting depth vs color only: positional correction and correct occlusion become possible, but the application pays extra memory and bandwidth.", "Reversed-depth conventions vs standard: better precision for distant objects, but the runtime must be told the convention or it misreads it."],
    p: ["Submitting depth with the wrong near and far values warps objects incorrectly during head translation.", "Submitting depth that is not final, such as before transparent objects, makes later layers sit in the wrong place."],
    v: "Submit depth for a scene with a near object and a far one, translate the head sideways 20 centimeters in a held frame, and confirm the parallax between objects matches the true geometry within 1 percent.",
    dep: ["swapchains","positional-timewarp"]
  },
  "shared-texture-import": {
    s: "Moves application images to the compositor without copying, by sharing GPU memory and synchronization primitives between processes and graphics interfaces.",
    d: "The compositor, running in its own process and possibly using a different graphics interface from the application, imports the application's swapchain images as external memory, and uses shared fences or semaphores to know when rendering has finished. Creating the swapchain with the right usage flags and format is required, or import fails. The hard part is synchronization across process and API boundaries: any missing fence produces tearing or garbage visible only occasionally, and different drivers accept different export mechanisms.",
    k: ["Zero-copy sharing vs copying each frame: the saved bandwidth and latency are significant at high resolution, but driver compatibility and synchronization are fragile.", "Explicit fences vs implicit driver synchronization: explicit is portable and predictable, but easy to get wrong."],
    p: ["A missing GPU fence shows the previous frame's contents for one eye intermittently.", "An application with a graphics device on a different GPU than the display cannot share memory without a copy."],
    v: "Run an application on a multi-GPU machine with a known pattern per frame and confirm the compositor displays each frame completely, with no tearing in a 30 minute run, and report which path was used.",
    dep: ["display-driver","gpu-priority-preemption"]
  },
  "gpu-priority-preemption": {
    s: "Gives the compositor's GPU work higher priority than the application's, and the ability to interrupt long application jobs, so the display deadline is met anyway.",
    d: "The compositor creates its GPU queue with high or real-time priority. When it has work due, the driver preempts the application's running commands at the finest granularity the hardware supports, runs the composition and warp, then resumes the application. Preemption granularity is the key: if the GPU can only switch between whole draw calls, one long draw call delays the compositor and causes a missed frame. The issue is hardware dependent and often poorly documented, and a heavy application can still starve it if preemption is coarse.",
    k: ["Hardware preemption vs cooperative limits on application work: preemption protects the display from any application, but cooperative limits work on every GPU.", "Reserving a fixed GPU slice vs priority only: a slice guarantees time but wastes it when idle, while priority is efficient but depends on preemption granularity."],
    p: ["A single very long draw call on a GPU with coarse preemption delays the compositor by several milliseconds.", "Compute workloads run by an application can hold the GPU even where graphics preemption works."],
    v: "Submit a deliberate 20 millisecond GPU workload from the application and confirm the compositor still completes its pass within its budget and presents on time, with the measured preemption delay below the documented value.",
    dep: ["display-driver","device-abstraction"]
  },
  "multi-app-compositing": {
    s: "Places the visible output of several applications into one scene, sorting by depth, resolving overlap and handling different frame rates and render poses.",
    d: "Each application's layers are collected in a shared space; the compositor orders them by distance from the user, clips them to their volumes, and applies per-application reprojection since each rendered at different times. Windows can use the compositor's sampling to remain sharp. Immersive applications take over the whole view. It is hard because applications operate independently: depth can conflict, one slow application must not slow others, and the combined sampling cost scales with the number of visible layers.",
    k: ["Per-application reprojection vs one global pass: each application stays correct at its own rate, but costs scale with the number of applications.", "Depth-sorted blending vs per-pixel depth: sorting is cheap and robust for windows, but interpenetrating volumes need real depth data."],
    p: ["Sorting only by layer center places a large panel in front of a small one that is actually closer.", "Applications at 30 frames per second in a 90 Hz scene look stuck unless each is reprojected."],
    v: "Open three windows at 30, 60 and 90 frames per second plus an overlay, move the head, and confirm each window tracks smoothly with correct overlap and the compositor stays on its deadline.",
    dep: ["layer-composition","rotational-timewarp","frame-budget-governor"]
  },
  "motion-to-photon-budget": {
    s: "The end-to-end allowance, typically under about 20 milliseconds, from a head movement to the display showing it, divided among sensing, prediction, rendering, composition and scanout.",
    d: "Each stage has a share: sensor sampling and transport, tracking computation, pose prediction, application render, composition, link to display, panel scanout and pixel response. Because rendering takes longer than the allowed total, the system predicts motion ahead and then applies a late correction with the newest pose just before scanout. The budget is therefore an allocation problem: stages that cannot be shortened must be hidden by prediction or reprojection, and each prediction interval adds error that grows with the square of time for accelerating heads.",
    k: ["Short pipeline with late correction vs deep pipeline with prediction: late correction gives fresher poses and low error, but needs a fast compositor path.", "Spending the budget on higher resolution vs lower latency: sharper images look better in stills, but latency is felt as sickness."],
    p: ["Optimizing one stage while another grows keeps the total unchanged and wastes the work.", "Measuring only the application's frame time reports a healthy number while the user feels 50 milliseconds."],
    v: "Measure the full path with a photodiode on a motion rig and report a per-stage table; confirm the total at the 99th percentile is within the target and every stage's reported time sums to the measured whole.",
    dep: ["latency-profiler","pose-prediction","late-latching"]
  },
  "pose-prediction": {
    s: "Estimates where the head and hands will be at the moment the frame is displayed, a few milliseconds to tens of milliseconds ahead of the latest sensor sample.",
    d: "A motion model, typically constant velocity or acceleration, is applied to the latest fused pose and inertial rates to extrapolate to the predicted display time. Queries from the application and the compositor use the same predictor at different times, so each gets the right pose for its moment. Prediction improves with shorter horizons, so it is combined with late correction. It is hard because head motion is not smooth: starts and stops cause overshoot, hands move faster than heads, and the longer the horizon, the more a wrong guess shows as wobble.",
    k: ["Constant-velocity extrapolation vs learned or acceleration models: simple and stable, but overshoots on abrupt starts and stops.", "Query by time stamp vs fixed prediction horizon: the same predictor serves every consumer, but timestamps must be right."],
    p: ["Predicting too far ahead overshoots when the head stops, which looks like a spring-back wobble.", "Using application time rather than the display time offsets the prediction by a whole frame."],
    v: "Record real head traces, predict 20 milliseconds ahead, and compare against the measured pose; confirm the 95th percentile angular error is under the documented value, and that error on stops does not exceed it.",
    dep: ["sensor-fusion-filter","display-timing","coordinate-frames-and-time"]
  },
  "late-latching": {
    s: "Reads the newest head pose after rendering has begun, and patches it into the frame's view matrices at the last possible moment, so the application's pose is fresher.",
    d: "The application records GPU commands that read the view matrices from a memory location that the runtime updates just before the GPU needs it. The pose used is therefore sampled a few milliseconds later than when the application began, shortening effective latency without shortening the render. It requires cooperation: the application must use the buffer and the runtime must know when the GPU will read it. It is difficult to coordinate with caches and synchronization, and applications that bake poses into culling or shadow decisions are not fully corrected.",
    k: ["Late latching vs only a pose at frame start: lower perceived latency without shortening the pipeline, but needs engine integration and may mismatch culling.", "Latching in the application vs relying on compositor warp: it improves the application's own image, while compositor warp corrects only rotation, cheaply."],
    p: ["Culling with the early pose and rendering with the late one makes objects at the screen edge pop in and out.", "Patching a buffer the GPU already read has no effect, and the extra complexity brings nothing."],
    v: "Compare the measured pose age at the moment of GPU read with and without latching during fast head turns, and confirm it falls by the render time minus the latch margin, with no visible edge popping.",
    dep: ["pose-prediction","frame-loop"]
  },
  "rotational-timewarp": {
    s: "Re-samples the finished image for the newest head orientation just before display, correcting rotational latency cheaply but not changes in position.",
    d: "The compositor takes the pose used for rendering and the latest predicted pose, computes the rotation between them, and warps the image accordingly in the distortion pass. Rotation of the head is the largest and fastest cause of visible error, and the warp uses no depth, so it costs little. Pixels outside the original rendered image are filled by border color or stretch, so applications render slightly larger fields of view. The hard part is that it corrects only rotation: moving the head makes near objects look stuck, which is fixed only by positional warp.",
    k: ["Rotation-only warp vs full positional warp: negligible cost and works with any content, but near objects lag during head translation.", "Warping at the latest possible moment vs at a fixed time: freshest pose, but the compositor must finish exactly on schedule."],
    p: ["No margin in the rendered field of view shows black or smeared edges when the head turns.", "Warping with the wrong render pose recorded in the layer makes the world sway."],
    v: "Spin the headset at 100 degrees per second with a high-contrast grid scene; with a 50 millisecond application delay confirm that with warp the grid stays within 0.5 degrees of correct, and that without it the error is much larger.",
    dep: ["layer-submission","distortion-mesh","pose-prediction"]
  },
  "positional-timewarp": {
    s: "Uses depth to shift each pixel to account for head translation since rendering, so nearby objects stay locked when the head moves sideways.",
    d: "With the depth buffer and the change in head position, the compositor re-projects each pixel to its new place, either by ray-marching through depth or by warping a depth mesh. Near objects move more than far ones, so the correction is nonuniform and reveals areas that were hidden behind foreground objects. Those disocclusion holes are filled by smearing or inpainting. It costs more than rotation warp and depends on accurate depth. The difficulty is artifacts: thin objects, transparencies and reflections have no single correct depth, and the filled holes show as shimmering borders.",
    k: ["Full positional reprojection vs rotation-only: translation judder is fixed, but cost and artifacts at depth edges rise.", "Depth-mesh warp vs per-pixel search: the mesh is cheaper and smooth, while the search handles detail but is expensive."],
    p: ["Transparent and reflective surfaces have wrong depth and visibly smear under warp.", "Without depth submission from the application, the compositor guesses a plane and near objects distort."],
    v: "Translate the head 15 centimeters sideways while showing a near and a far object, and confirm the near object's parallax stays within 5 percent of ground truth and hole artifacts are under the documented area.",
    dep: ["depth-submission","rotational-timewarp","layer-composition"]
  },
  "asynchronous-reprojection": {
    s: "Runs the warp on its own schedule, independent of the application, so a late or dropped application frame is replaced by the previous frame corrected to the newest pose.",
    d: "The compositor loop runs at the display rate regardless of the application. If a new frame is ready, it warps that one; if not, it re-uses the last frame and warps it to the current pose. Head tracking therefore stays smooth even when the application runs at half rate or hitches, while animations in the scene slow down. This requires GPU preemption so the warp is never late. It is hard because the fallback masks problems: users get no head-tracking judder, but moving objects stutter, and persistent reuse can hide that the application is too slow.",
    k: ["Always-on async warp vs only when the application misses: stable head tracking at all times, but the compositor spends power on every frame.", "Dropping to half-rate application with reprojection vs full-rate with lower quality: preserves detail, but moving objects look choppy."],
    p: ["Hand-held objects move at half rate while the head runs at full rate, which is noticeable and sometimes sickening.", "Developers see a steady display and do not realize the application is missing deadlines."],
    v: "Block the application for 100 milliseconds once per second and confirm the head-locked and world scenery stay locked to head motion with no visible jump, while the frame-timing overlay reports each reused frame.",
    dep: ["rotational-timewarp","gpu-priority-preemption","frame-scheduler"]
  },
  "motion-vector-synthesis": {
    s: "Generates intermediate frames from the previous frame and per-pixel motion vectors, so a content that renders at half the display rate still appears smooth.",
    d: "The application supplies motion vectors and depth along with color; the runtime extrapolates the next frame by moving pixels along their vectors, in addition to the head-pose warp. Animated objects and the user's hands then move at the full display rate. The compositor must resolve overlaps and fill gaps, and it may use a learned model. The difficulty is quality: fast, unpredictable motion, transparency, particles and view-dependent shading produce ghosting, and errors are more disturbing in stereo, where each eye can have a different artifact.",
    k: ["Synthesized frames vs lowering resolution for full rate: full-speed motion at half the render cost, but visible artifacts where prediction fails.", "Application-supplied motion vectors vs estimated from images: accurate and cheap, but requires engine support and correct vectors for every moving object."],
    p: ["Missing motion vectors for particles or transparent objects cause trailing ghosts.", "Applying synthesis when the application already runs at full rate adds latency and artifacts for no benefit."],
    v: "Run a scene with a moving object at half the display rate with synthesis on and off; confirm perceived smoothness and measured object position error per synthesized frame are lower with it, and ghosting area is under the specified amount.",
    dep: ["asynchronous-reprojection","depth-submission"]
  },
  "judder-and-persistence": {
    s: "The two display artifacts of motion: judder from frames shown at uneven or low rates, and smear from pixels staying lit while the head moves.",
    d: "When the head turns, the eye tracks a stationary virtual object, so any time the image is held fixed on the panel, the object smears across the retina. Low persistence displays light each frame briefly, reducing smear but needing high brightness, and low refresh rates make flicker visible. Frame rate changes and missed frames cause judder, a double-image stutter. The runtime chooses refresh rate and persistence, and reprojection stays aligned to them. The hard part is tradeoffs: shorter persistence cuts blur and costs brightness, and higher refresh costs power and GPU time.",
    k: ["Low persistence vs full persistence: sharp images during head motion, but dimmer output and visible flicker at low refresh rates.", "Higher refresh rate vs lower rate with synthesis: smoother and lower latency, but more power, heat and GPU load."],
    p: ["Picking a refresh rate that the application cannot reach produces constant judder, worse than a lower stable rate.", "Strobing at a rate the eye can see gives flicker headaches in peripheral vision."],
    v: "Display a grid while turning the head at 120 degrees per second at several persistence settings and confirm measured smear width matches panel specification, and that no flicker is visible at the selected refresh rate.",
    dep: ["display-timing","display-driver","panel-color-correction"]
  },
  "lens-distortion-correction": {
    s: "Pre-warps every image with the inverse of the lens's own distortion, so that after passing through the optics straight lines appear straight.",
    d: "A wide-field lens bends the image into a pincushion shape. The runtime applies the opposite barrel distortion with a model fitted to each lens design or each unit, as polynomial coefficients or a mesh. The correction must depend on the eye relief and interpupillary distance as the lens moves relative to the eye. Applications render a normal projection and never see this. The challenge is exactness: tiny errors in the center are invisible, but errors at the edge cause swimming of the world during head rotation, and resampling quality affects sharpness.",
    k: ["Model-based correction vs per-pixel measured maps: models are compact and adjustable for IPD, but maps capture manufacturing variation that models miss.", "Correcting in the compositor vs in the application: one implementation serves every application and combines with timewarp, but applications lose control of sampling."],
    p: ["Using a design-nominal model on a unit with a tolerance error makes straight edges curve at the periphery.", "Ignoring IPD changes leaves a correction that is right for the wrong eye position."],
    v: "Display a rectilinear grid, photograph it through a calibrated camera behind the lens at several positions, and confirm lines deviate from straight by less than 0.2 degrees across the field.",
    dep: ["optical-calibration","distortion-mesh","ipd-and-eye-relief"]
  },
  "chromatic-aberration-correction": {
    s: "Corrects the lens's tendency to focus red, green and blue at slightly different positions, by sampling each color channel with its own distortion.",
    d: "Because the lens bends wavelengths differently, a white edge shows colored fringes. The compositor warps the red, green and blue channels with separate distortion maps so that they converge after the lens. It triples sampling cost in the warp pass, though the three share work. For panels with different subpixel layouts the mapping must match the physical position of each channel. The difficulty is calibration: the offsets are only a fraction of a pixel and shift with eye position, and an error appears as color fringing on bright high-contrast text.",
    k: ["Per-channel warp vs a single warp: removes fringes on high-contrast edges, but increases sampling work and bandwidth.", "Correcting in software vs lens design: software is flexible and cheap on weight, but the optical design could have prevented it at a cost in size."],
    p: ["Using green-channel correction for all channels leaves red and blue fringes at text edges.", "Applying the correction before the panel's own subpixel mapping inverts its direction."],
    v: "Render white text on black, photograph it through the lens at the periphery, and confirm color fringe width is below a quarter of a pixel and not asymmetric between left and right eye.",
    dep: ["lens-distortion-correction","panel-color-correction"]
  },
  "distortion-mesh": {
    s: "A grid of sample positions that the compositor uses to apply lens correction, timewarp and chromatic correction in one resampling pass.",
    d: "The mesh stores, for each vertex, where to read for each color channel, and optionally a per-row time for rolling-scanout panels. The compositor renders it as a triangle mesh over the display with the layers as textures, so the GPU's interpolation does the correction. Timewarp transforms are applied on top. A single pass preserves sharpness. The hard part is resolution and cost: a coarse mesh creates facets at the edges, a fine mesh costs vertices, and each unit's mesh must be stored and updated when IPD is adjusted.",
    k: ["Mesh-based warping vs a per-pixel shader function: cheap interpolation in fixed hardware, but accuracy depends on the mesh density.", "One mesh with warp and correction vs layered passes: sharper and faster, but harder to debug when one component is wrong."],
    p: ["A mesh too coarse at the periphery creates visible straight segments where curves should be.", "Updating the mesh for IPD mid-frame shows a distorted image for one frame."],
    v: "Compare mesh output against an analytic per-pixel computation across the field and confirm the maximum position error is under 0.1 pixel, and that GPU time for the warp pass is within its allotted slice.",
    dep: ["lens-distortion-correction","chromatic-aberration-correction","display-driver"]
  },
  "optical-calibration": {
    s: "Measures each headset's actual lens and panel alignment at the factory and stores the result, so the runtime can correct for manufacturing variation unit by unit.",
    d: "On the production line, cameras image test patterns through each lens to measure distortion, color offsets, panel position and tilt. The coefficients are written to the device's storage and read by the runtime at start. Some systems repeat this on the device after a repair or drop. The data feeds the distortion mesh and the view poses relative to the head. It is difficult because small calibration errors show up as mismatched eyes, which cause eye strain, and because physical shifts over the product's life, such as a loosened lens, are not captured by the factory data.",
    k: ["Per-unit factory calibration vs a single design-level model: eyes match and wide-field edges are accurate, but production time and storage per device increase.", "Field recalibration vs factory only: corrects aging and repairs, but requires a procedure the user can follow."],
    p: ["Applying calibration for the wrong unit after a lens swap leaves left and right eyes mismatched.", "Storing calibration only on the cloud leaves an offline device with the generic model."],
    v: "Calibrate five units and test each with a grid pattern; confirm residual alignment error between eyes is below 0.1 degrees after correction, and that swapped calibration data is detected and reported.",
    dep: ["firmware-and-updates","sensor-calibration"]
  },
  "ipd-and-eye-relief": {
    s: "Adapts rendering and distortion to the spacing between the user's eyes and the distance from eye to lens, set by a dial, motors or eye tracking.",
    d: "Interpupillary distance sets how far apart the two virtual cameras sit and where lenses are positioned. If the lens positions are adjustable, a sensor reads the position; otherwise the runtime asks for a measured value or estimates it from eye tracking. Eye relief changes field of view and distortion. The runtime updates view poses and distortion mesh accordingly. It is hard because a wrong value is felt as incorrect scale or eye strain, but users cannot tell what is wrong, and because it changes during use as the headset shifts on the face.",
    k: ["Mechanical IPD adjustment vs software-only: the lenses align with the eyes for sharpness at the edge, but add moving parts and sensors.", "Measured per-user eye position vs a fixed default: accurate scale and comfort, but needs eye tracking and calibration."],
    p: ["A wrong IPD setting makes the world look too large or too small and tires the eyes.", "Headset slipping during active use shifts eye relief and degrades sharpness without any notice."],
    v: "Set the dial to each marked IPD value and confirm the runtime reports it within 0.5 millimeter and that rendered camera separation, measured from view poses, matches.",
    dep: ["optical-calibration","eye-tracking-pipeline","proximity-and-wear-sensors"]
  },
  "fixed-foveation": {
    s: "Renders the center of each view at full resolution and the edges at lower resolution in a fixed pattern, because lens sharpness falls off toward the periphery.",
    d: "The application renders with variable shading rates or multiple viewports at reduced density outside a fixed central region, and the compositor upsamples the result. Savings come from pixel shading cost, which can fall by a third or more. The pattern matches the lens's sharp region rather than the user's gaze. The runtime exposes the supported modes and levels. It is hard to tune: aggressive settings visibly shimmer at the edges, and content with fine detail such as text or thin lines in the periphery degrades first.",
    k: ["Fixed lens-matched foveation vs none: large shading savings with little visible loss, but it limits quality for off-center details.", "Higher foveation level on weaker devices vs uniform: keeps frame rate, but peripheral shimmer becomes noticeable."],
    p: ["Placing a HUD in the low-density periphery makes text blurry.", "Applying foveation after post-processing wastes the saving, since the heavy passes already ran at full cost."],
    v: "Render a detail test pattern at each level and confirm shading cost falls by the documented amount while a viewer reading chart letters in the central 30 degrees sees no difference from uniform rendering.",
    dep: ["view-configuration","distortion-mesh"]
  },
  "eye-tracked-foveation": {
    s: "Moves the high-resolution region to wherever the user is looking, using eye tracking, which allows far lower resolution elsewhere without visible loss.",
    d: "Gaze direction from the eye tracker is turned into a shading rate map each frame, and the application renders with it. The latency between eye movement and map update must be short, because the eye moves very fast; during saccades vision is suppressed, which hides some error. Savings can be more than half the shading cost. The challenge is robustness: tracking errors, blinks and calibration drift put the sharp region in the wrong place, and gaze data must remain with the runtime and not reach the application.",
    k: ["Gaze-driven foveation vs fixed: much higher saving and sharper center, but requires a working eye tracker, calibration and low latency.", "Runtime applies the gaze map vs gives gaze to the application: gaze data stays private, but the application depends on runtime support."],
    p: ["High gaze latency shows the user a blurry area when they look somewhere new.", "A failing calibration silently places the sharp region off to the side without telling the user."],
    v: "Have participants make rapid gaze shifts across a text chart; confirm they cannot detect the lower-resolution region in at least 95 percent of trials, with the map update latency within the documented limit.",
    dep: ["eye-tracking-pipeline","fixed-foveation","gaze-calibration"]
  },
  "panel-color-correction": {
    s: "Applies per-unit corrections for panel brightness and color variation, and for the nonlinear response of pixels, so that white is white and gray ramps look smooth.",
    d: "Small displays differ in uniformity: brightness falls off at edges, color shifts between left and right, and low levels show banding or smearing. Factory measurement produces correction tables for gamma, white point and spatial uniformity, which the compositor or panel controller applies. Dithering helps hide banding. Local dimming, where present, adds its own artifacts. The hard part is matching both eyes, because a color difference between eyes is perceived as shimmer or rivalry, and doing it without costing precious compositor time or bandwidth.",
    k: ["Correction in the compositor vs in the panel controller: the compositor can do spatial maps flexibly, but costs GPU time; the controller is free but fixed.", "Per-unit measured tables vs panel-type defaults: left and right eyes match, but need factory time and storage."],
    p: ["Mismatched brightness between the eyes causes a visible binocular rivalry flicker.", "Correcting in an 8-bit pipeline creates new banding in dark gradients."],
    v: "Show uniform gray at five levels, measure each eye's panel at nine positions with a colorimeter, and confirm color difference between eyes is under the specified delta and uniformity across positions is within 10 percent.",
    dep: ["optical-calibration","display-driver"]
  },
});
