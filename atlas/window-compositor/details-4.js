// Details for the window system & compositor plate, part 4: rendering, scaling, color and presentation.
ATLAS.details("window-compositor", {
  "render-backend": {
    s: "An abstraction over the ways of drawing the scene, GPU APIs and a CPU path, so the rest of the compositor describes what to draw without caring how.",
    d: "The compositor expresses a frame as textures, rectangles, transforms and opacity, and the backend turns it into commands for one specific drawing interface or into CPU operations. It owns the device handle, creates textures from imported buffers, manages render targets and reports capabilities such as supported formats. A second backend allows operation without a GPU, or on a different graphics API. It is hard to keep the abstraction thin enough not to hide the capabilities that matter, such as sync objects and buffer age, yet general enough to be swapped.",
    k: ["A narrow abstraction versus exposing the graphics API directly: narrow lets backends be swapped and tested, but hides features that only some backends offer.", "One backend with a software mode versus separate renderers: one backend shares logic, while a separate software path can avoid every GPU assumption."],
    p: ["A feature exists in one backend only, and behavior silently differs between machines.", "The backend leaks device handles on reset and cannot be recreated without restarting."],
    v: "Run the same scripted scene through each backend and compare the resulting frames pixel by pixel within a tolerance, and confirm every capability a backend does not support is reported rather than ignored.",
    dep: ["kernel-display-interface", "gpu-memory-allocator", "software-renderer"]
  },
  "gpu-compositing": {
    s: "The per-frame pass that draws every visible surface as a textured quad onto the output's target, in order, with blending, clipping and transforms.",
    d: "For each output the compositor walks the scene back to front, skipping surfaces hidden behind opaque ones, and draws each as a rectangle sampling its texture, with opacity, rounded corners or transforms applied in a shader. Opaque surfaces can be drawn without blending, front to back, to reduce overdraw. The result goes into the buffer that will be presented. Cost depends on pixel count times layers, so work is limited by damage and by planes. Hard parts are precision at fractional positions, which blurs if rounding is wrong, and synchronization with client writes.",
    k: ["Drawing back to front with blending versus front to back with early rejection: back to front is simple and handles transparency, front to back saves bandwidth for opaque windows but needs separate passes.", "Compositing every frame versus skipping unchanged outputs: skipping saves power, but needs correct damage and idle handling."],
    p: ["Fractional window positions are sampled with blur because the quad was not snapped to pixel boundaries.", "Overdraw from many stacked translucent layers makes the frame time exceed the refresh interval."],
    v: "Capture a frame with several overlapping translucent windows and compare against a reference composed on the CPU; confirm pixel agreement within tolerance and that GPU frame time stays below the refresh interval.",
    dep: ["render-backend", "texture-import-cache", "scene-graph", "render-damage-clipping"]
  },
  "texture-import-cache": {
    s: "Turning client buffers into GPU textures and keeping them for reuse, so unchanged or recycled buffers are not imported again every frame.",
    d: "On commit, the compositor imports a shared-memory buffer by uploading it, or imports a GPU buffer handle as a texture without copying. Because clients rotate a small set of buffers, imports are cached by buffer identity and reused when the same buffer returns. Cached textures are evicted when buffers are destroyed or memory is short. Import can fail for unsupported layouts, in which case a fallback copy is needed. It is hard because lifetime is shared between a client that may destroy the buffer at any moment and a GPU that may still be reading it.",
    k: ["Caching imports versus importing each commit: caching avoids repeated work for rotated buffers, but must track destruction precisely to avoid stale textures.", "Eager import on commit versus lazy import when drawn: eager reveals failures early, while lazy skips import for surfaces never drawn, such as hidden windows."],
    p: ["A destroyed buffer's texture is reused for a new buffer at the same address, showing the wrong window content.", "Hidden windows keep many large textures resident and exhaust video memory."],
    v: "Open and close hundreds of windows and confirm video memory returns to baseline. Confirm a client rotating three buffers produces only three imports and not one per frame.",
    dep: ["gpu-buffer-sharing", "shared-memory-buffers", "render-backend", "gpu-memory-allocator"]
  },
  "effects-pipeline": {
    s: "Optional visual processing applied during composition, such as blur behind translucent windows, shadows, rounded corners, color filters and transitions.",
    d: "Effects add passes: sampling the already drawn scene behind a window and blurring it, drawing shadow textures, or masking corners. They are expressed as shader programs combined with the compositing pass, often using intermediate render targets, which cost memory and bandwidth proportional to the affected area. Effects must respect damage, since blur reads pixels outside the damaged region and so enlarges the area that needs redraw. They are the first thing disabled on weak GPUs, and some prevent direct scanout.",
    k: ["Effects in the compositor versus left to clients: in the compositor they are uniform and can use the scene behind, while client effects cannot see what is under them.", "Quality blur with many passes versus a cheap approximation: quality looks better but multiplies cost per frame on large areas."],
    p: ["Blur reads outside the damaged region, so the edge of an update shows a visible seam.", "Enabling effects silently disables direct scanout and adds a frame of latency for full-screen applications."],
    v: "Update a small region under a blurred panel and confirm no seams at the update boundary. Enable effects with a full-screen game and confirm the compositor turns them off or reports the latency cost.",
    dep: ["gpu-compositing", "damage-tracking", "render-damage-clipping"]
  },
  "software-renderer": {
    s: "A CPU-only compositing path for machines without usable GPU acceleration, in virtual machines, and for recovery when the GPU stops responding.",
    d: "The renderer copies and blends pixel rectangles in memory with vectorized loops and writes into a plain buffer scanned out by the display. It handles damage carefully because CPU bandwidth is the limit, and it supports fewer effects. It reads shared memory buffers directly, but GPU buffers must be mapped and converted. It serves as a test reference for the GPU renderer and as the fallback after GPU reset. Hard parts are speed at high resolutions, and handling formats and transforms that the GPU path takes for granted.",
    k: ["A full software path versus no fallback: a fallback keeps the desktop usable on any machine and after GPU failure, but is a second renderer to maintain and test.", "Reduced features in software versus identical output: reduced features keep it fast, but users see different behavior depending on hardware."],
    p: ["The software path is rarely exercised, so it breaks without anyone noticing until it is needed.", "Imported GPU buffers are unreadable by the CPU and the fallback shows black windows."],
    v: "Force the software path on a high-resolution display and confirm all surfaces render correctly with scrolling holding a usable frame rate, and that the output matches the GPU renderer's reference frames.",
    dep: ["render-backend", "shared-memory-buffers", "damage-tracking"]
  },
  "render-damage-clipping": {
    s: "Restricting draw calls to the union of damaged rectangles for the frame, so a small change redraws a small area, with the previous frames' damage added when buffers are reused.",
    d: "The compositor converts accumulated damage into scissor rectangles or stencil regions, draws only surfaces intersecting them, and clips each draw to them. When rendering into an older buffer from the swap chain, the damage of the intervening frames must be redrawn too, using buffer age. Too many small rectangles can cost more than one larger one, so they are merged. It must also include areas changed by effects, cursor and overlays. The risk is that any mistake appears as persistent stale pixels.",
    k: ["Merging damage into few large rectangles versus keeping many exact ones: fewer rectangles keep draw count low, while exact rectangles minimize pixels drawn.", "Relying on buffer age versus redrawing the full buffer after swap: age saves large amounts of work, but drivers may report it incorrectly."],
    p: ["A driver reports buffer age incorrectly, causing stale rectangles to show on every other frame.", "Damage is clipped at an output boundary and a window crossing two monitors tears along the seam."],
    v: "Render a long scripted animation with clipping enabled and disabled, compare every output frame pixel for pixel, and confirm identical results with clipping reducing the number of shaded pixels.",
    dep: ["damage-tracking", "gpu-compositing", "render-backend"]
  },
  "fractional-scaling": {
    s: "Scale factors such as 1.25 or 1.5 for each output, with clients rendering at the exact scaled size so text stays sharp instead of being resized by the compositor.",
    d: "The compositor tells a client the preferred scale, in fractions of 120 or similar, for each surface based on the output it is on. The client renders a buffer at physical size, and uses a viewport to say it covers a logical size. The compositor then displays it one-to-one. Clients that do not understand fractions are given an integer scale and downsampled, which blurs. Logical coordinates become fractional, which affects sizes, positions and input. Hard parts are rounding to physical pixels so edges stay crisp and consistent across surfaces.",
    k: ["Client renders at fractional scale versus the compositor scales an integer buffer: client rendering is sharp and cheap to display, but requires every toolkit's cooperation.", "Rounding logical sizes to whole pixels versus keeping exact fractions: rounding avoids blurry edges, but accumulates error and makes sizes differ from the requested scale."],
    p: ["A surface at 1.5 scale has an odd logical width, producing a half-pixel seam between neighbors.", "A client ignores the preferred scale and is resampled twice, so its text looks soft."],
    v: "Display a pixel-grid test pattern from a fractional-aware client at 1.25 and 1.5 and inspect a screenshot at physical resolution; confirm a one-to-one pixel mapping with no resampling blur.",
    dep: ["viewporter", "output-scale-policy", "buffer-scale", "output-layout"]
  },
  "buffer-scale": {
    s: "The integer scale a client declares for its buffer, such as 2 for a buffer twice as large as the surface, which lets simple high-DPI clients render sharply.",
    d: "A client commits a buffer of 2000 by 1000 pixels with scale 2, which makes the surface 1000 by 500 logical units. The compositor shows it at physical size on a scale-2 output without resampling, and downsamples on a scale-1 one. Clients learn each output's integer scale and which outputs their surface touches, and pick the highest. It is the oldest high-DPI mechanism and works on every compositor, but it handles fractions only by resampling, and clients on mixed-density outputs must choose one scale for the whole surface.",
    k: ["Integer scale for compatibility versus fractional for exactness: integer is supported everywhere and never blurs on matching outputs, but cannot express fractional monitor settings.", "Using the highest scale among overlapped outputs versus the one with most area: highest keeps sharp everywhere but wastes work, and area-based is cheaper but blurry on the other."],
    p: ["A window spanning two monitors uses the lower scale and looks soft on the dense one.", "Scale arrives after the first commit, so the first frame is drawn at the wrong size and then redone."],
    v: "Move a window between a 1x and a 2x monitor and confirm it redraws at the new scale within a frame or two of crossing, and that the physical size of its content stays constant.",
    dep: ["output-scale-policy", "output-layout", "viewporter"]
  },
  "viewporter": {
    s: "A per-surface request to crop a source rectangle from the buffer and scale it to a given destination size, letting the compositor resample cheaply on the GPU.",
    d: "The client sets a source rectangle in buffer coordinates and a destination size in logical units. This enables fractional scale (the destination is logical, the buffer is physical), video that is shown at another size than decoded, and parallax scrolling. The compositor applies the transform during composition and may use a plane that scales. The difficulty is precision, since source rectangles are fractional, and the interplay with damage, input regions and rounding at fractional positions.",
    k: ["Resampling by the compositor versus the client rendering at the right size: compositor resampling serves video and legacy content cheaply, but costs quality compared with native rendering.", "Allowing fractional source coordinates versus integer: fractional is needed for smooth scrolling and exact scaling, but adds rounding rules everywhere."],
    p: ["A source rectangle that extends outside the buffer is not validated, and the compositor reads outside the texture.", "Rounding errors leave a one-pixel gap between a video and its border."],
    v: "Show a video cropped and scaled by the viewport, then a pixel pattern at exact size, and confirm edges align without gaps or bleeding, and that an out-of-range source rectangle is rejected with a protocol error.",
    dep: ["fractional-scaling", "gpu-compositing", "double-buffered-state"]
  },
  "scaled-cursors": {
    s: "Choosing and rendering a pointer image at the right size and sharpness for each output's scale, including images supplied at one size and used on several monitors.",
    d: "The pointer must be the same physical size on every monitor, so the cursor theme is rendered at a size multiplied by each output's scale. A hardware cursor plane takes one image at a time, per output, so the compositor keeps scaled versions, or draws it in software on outputs whose planes cannot do it. When the pointer straddles two outputs, each shows the portion on it. The challenge is clients that supply images at an unknown scale, and animated cursors that need frame timing.",
    k: ["Preparing a cursor image per scale versus scaling one image: per scale stays sharp, while scaling is simple but blurry at large factors.", "Hardware plane only versus software fallback: the plane has the lowest latency, but needs a fallback for outputs with limited planes."],
    p: ["The pointer is tiny on a dense monitor because the theme size ignored the scale.", "A cursor straddling two monitors shows only on one, vanishing for a moment at the boundary."],
    v: "Move the pointer across monitors at scales 1, 1.5 and 2 and confirm its apparent physical size, sharpness and hotspot are constant, including while straddling the boundary.",
    dep: ["cursor-surfaces", "output-scale-policy", "overlay-planes"]
  },
  "output-scale-policy": {
    s: "The rules for choosing each output's scale: defaults from physical size and resolution, user overrides, snapping to supported values, and per-window scale decisions on mixed setups.",
    d: "A first guess comes from the monitor's pixel density, reported through its identification data, mapped to a nearby comfortable factor. Users can override per monitor. The compositor then tells clients, each surface's preferred scale from the outputs it overlaps. Some designs allow only integer scales plus a downscale to a fractional target, others allow native fractions. The choice affects sharpness, performance and which clients look good, and it must be remembered per monitor so a setup is restored.",
    k: ["Native fractional scaling versus integer scale then downsampling: native is crisp and cheap on the GPU, while integer-then-downscale works for every client but costs GPU time and some sharpness.", "Automatic defaults versus always asking the user: defaults give a working desktop at first boot, though densities reported by the monitor can be wrong."],
    p: ["A television reports a wrong physical size, and the automatic scale makes everything huge.", "The chosen scale is not remembered and resets after every reboot or hotplug."],
    v: "Connect a high-density and a standard monitor, confirm sensible default scales, change one and reboot, and verify the override is restored and surfaces on each monitor are the same physical size.",
    dep: ["edid-parsing", "display-profile-persistence", "multi-monitor-config"]
  },
  "color-management": {
    s: "The system that tells the compositor each output's color characteristics and each surface's color space, so it can convert between them and show consistent colors.",
    d: "Clients tag a surface with a color space: primaries, transfer function and, for HDR, brightness metadata. The compositor knows each output's profile, from its identification data or a user-installed profile, and converts every surface to the output's space during composition, using a shader or lookup tables. Untagged content is assumed to be a default standard space. It also supplies the profile to clients that want to do their own conversion. It is hard because blending should happen in a linear space, with enough precision, and because direct scanout bypasses conversion.",
    k: ["Compositor-side conversion versus clients converting themselves: compositor conversion works for all content and mixes monitors correctly, while client conversion needs every application's effort.", "Blending in linear light versus in encoded values: linear is physically right but costs precision and bandwidth, encoded is cheap but darkens edges."],
    p: ["Untagged content is assumed to be the wrong space and appears oversaturated on wide-gamut monitors.", "Direct scanout bypasses color conversion, so a window changes color when it goes full-screen."],
    v: "Display a color chart tagged with a known space on two monitors with different profiles and measure with a colorimeter; confirm colors match within a small difference, and that full-screen does not shift them.",
    dep: ["icc-transforms", "gamma-lut-pipeline", "surface-roles", "hdr-tone-mapping"]
  },
  "icc-transforms": {
    s: "Applying the mathematical conversion from a source color space to an output's measured profile, using matrices, curves or three-dimensional lookup tables on the GPU.",
    d: "A profile describes how a device reproduces color, usually as primaries and tone curves, or as a larger table for complex displays. Conversion composes the source's decode curve, a matrix between primaries and the target's encode curve. The compositor precomputes these into a combined table sampled in the shader or loaded into the display's hardware. A rendering intent decides what happens to colors that the display cannot show. Precision and speed are hard together: banding appears in gradients if the table or intermediate format is too coarse.",
    k: ["Matrices and curves versus full lookup tables: matrices are exact and cheap for simple profiles, tables handle complex ones but cost memory and interpolation error.", "Perceptual versus relative colorimetric intent for out-of-gamut colors: perceptual keeps relationships between colors, while relative keeps in-gamut colors exact and clips the rest."],
    p: ["Gradients show visible banding because the intermediate texture format is only eight bits.", "A broken profile file is applied without validation and turns the screen a strange color."],
    v: "Display a smooth gray ramp through the full transform and confirm there is no visible banding; load an invalid profile and confirm the compositor rejects it and keeps the previous transform.",
    dep: ["color-management", "gpu-compositing", "gamma-lut-pipeline"]
  },
  "hdr-tone-mapping": {
    s: "Showing brightness ranges beyond standard displays, and compressing HDR content to what a given monitor can actually produce when the two do not match.",
    d: "HDR content describes luminance in absolute units with a transfer function such as a perceptual quantizer. The compositor must know the display's peak and black levels, send metadata to it, and blend standard content at a chosen reference white so it does not look dim next to HDR. When content exceeds the display's range, a tone-mapping curve compresses highlights. Mixed content is the hard case: a single HDR video inside a standard window, scaled and with an unmodified cursor. Display firmware has its own opinions and varies widely.",
    k: ["Compositor-managed tone mapping versus passing metadata to the display: compositor mapping is predictable across monitors, while display mapping uses its tuning but varies by model.", "Switching the output into HDR mode only when needed versus always on: on-demand saves power and keeps standard colors exact, but causes a mode change flicker."],
    p: ["Standard windows look washed out in HDR mode because reference white was set poorly.", "Switching output mode blanks the screen for a second whenever an HDR video starts."],
    v: "Play HDR video in a window on an HDR monitor with a standard window beside it; verify highlights reach the measured peak, standard white matches its non-HDR appearance, and mode changes happen without visible artifacts.",
    dep: ["color-management", "gamma-lut-pipeline", "atomic-commit", "edid-parsing"]
  },
  "gamma-lut-pipeline": {
    s: "The display's own color processing stages, matrices and per-channel lookup tables, set by the compositor for calibration, night shift and color filters at no GPU cost.",
    d: "Display controllers apply a degamma table, a color matrix and a gamma table after the planes are combined. The compositor loads these through the kernel interface as part of atomic commits, so calibration or a warm color tint applies to everything, including direct-scanout content, without extra drawing. Limits vary: table sizes differ, precision varies, and some hardware lacks stages. It is hard to make a feature consistent across hardware, and to combine several users of the tables, such as calibration, night mode and accessibility filters, without conflicts.",
    k: ["Using display hardware tables versus shader operations: hardware is free and applies to scanout content, but varies in capability; shaders work everywhere but cost GPU time and bypass scanout.", "Letting clients set gamma directly versus a compositor-owned policy: client control supports calibration tools, but two clients can fight over the tables."],
    p: ["A night-mode tool and a calibration tool both write the tables, and the last writer wins until the next change.", "Hardware tables with 256 entries cause banding in dark gradients."],
    v: "Enable a warm tint during direct-scanout full-screen video and confirm the tint applies with no extra GPU load. Run two table writers and confirm the compositor combines or arbitrates them deterministically.",
    dep: ["atomic-commit", "kernel-display-interface", "icc-transforms"]
  },
  "frame-scheduler": {
    s: "The logic that decides when to start composing the next frame for each output, trying to finish just before the display refreshes while using the newest client content.",
    d: "On each refresh the scheduler knows when the next scanout starts and estimates how long composition takes from recent history. It begins work as late as safely possible, so clients' newest buffers are included, but early enough to finish. It sends frame callbacks to clients at the right moments so they draw for the same deadline. If a frame is missed, it chooses between showing the old image for another refresh and delaying. Each output has its own clock, so several monitors run separate schedules. Hard parts are estimating composition cost and handling variable refresh.",
    k: ["Composing immediately after the previous flip versus delaying the start: immediate is simple and safe but uses older client content, delayed lowers latency but risks missing the deadline.", "One schedule per output versus a global one: per output suits different refresh rates, while global is simpler but forces every monitor to the slowest."],
    p: ["Composition cost spikes occasionally, and the delayed-start estimate causes repeated missed frames.", "Two monitors with different refresh rates are driven from one clock, and the faster stutters."],
    v: "Measure input-to-photon latency with a high-speed camera or photodiode while scheduling is tuned; confirm a reduction compared with immediate composition and zero missed frames in a ten-minute stress run.",
    dep: ["vsync-pageflip", "frame-callbacks", "presentation-feedback", "gpu-compositing"]
  },
  "vsync-pageflip": {
    s: "Synchronizing buffer changes to the display's refresh so a new image appears in one piece, using page flip requests that complete at the vertical blank.",
    d: "The compositor submits the next buffer, and the display controller switches to it at the next vertical blank, then signals completion with a timestamp. Until then, the previous buffer is still being read and must not be touched. Flips complete in order. Without synchronization, switching mid-scanout shows two images at once, called tearing. The timestamps from completion events drive scheduling and presentation feedback. Hard parts are drivers that report completion times inaccurately and recovering from a flip that never completes.",
    k: ["Flipping at vblank versus allowing tearing: vblank gives clean images but adds up to a frame of latency, tearing gives the lowest latency for games but visible artifacts.", "One pending flip at a time versus queuing several: one keeps latency low and logic simple, but cannot absorb a late frame."],
    p: ["A flip is submitted while the previous is pending and fails, so the frame is dropped silently.", "Completion timestamps jump backward after suspend, confusing the scheduler."],
    v: "Display a moving vertical bar and photograph it with a short exposure; confirm no tear lines in normal mode, and that the timestamps from flip events advance by exactly one refresh interval.",
    dep: ["atomic-commit", "kernel-display-interface", "sync-primitives"]
  },
  "variable-refresh": {
    s: "Letting the display refresh when a frame is ready, within the monitor's range, instead of at a fixed rate, which smooths animation and removes the choice between tearing and judder.",
    d: "The display advertises a minimum and maximum refresh rate. The compositor enables variable mode and, instead of flipping on a fixed cadence, flips when a new client frame is available, within limits. If frames come slower than the minimum, it repeats the last one. For a desktop, variable refresh is usually enabled only for full-screen applications that ask for it, since window contents change at uneven rates. It is hard because mode changes can flash, because brightness can flicker at changing rates, and because scheduling must now react to the client instead of a clock.",
    k: ["Variable refresh only for full-screen content versus always: only for full-screen avoids desktop flicker, while always on helps everything but exposes panel flicker at low rates.", "The compositor repeating frames below the minimum versus the display doing it: compositor control is predictable, while the display's own repeat saves work but varies."],
    p: ["The screen flickers when the content frame rate hovers near the display's lower limit.", "Enabling variable refresh requires a mode change that blanks the monitor for a moment."],
    v: "Run a game with unsteady frame times on a variable-refresh display, and confirm with the monitor's refresh counter that refresh follows frame production, with no tearing, and that the desktop returns to fixed rate afterward.",
    dep: ["frame-scheduler", "atomic-commit", "edid-parsing", "direct-scanout"]
  },
  "presentation-feedback": {
    s: "Telling a client exactly when its frame reached the display, and whether it was shown at the intended refresh, so animations and video can be timed to the screen.",
    d: "A client requests feedback for a commit. After the flip, the compositor reports the presentation time, the refresh interval, a sequence counter and flags such as whether the buffer was scanned out directly or flipped at vblank. Video players use it to synchronize audio and to detect dropped frames, and animations use the interval to predict the next frame. If the frame was replaced before it was shown, the client is told it was discarded. It is difficult to provide accurate timestamps from hardware that offers coarse or approximate ones.",
    k: ["Hardware timestamps versus compositor-estimated times: hardware times are accurate but not always available, estimates always exist but drift.", "Feedback per commit versus a periodic summary: per commit gives exact tracking, but adds an event per frame for each client."],
    p: ["Reported times include compositor delay rather than the true photon time, so audio drifts against video.", "A discarded frame is reported as presented, and the client believes it never skipped."],
    v: "Play a video with a flashing marker and an audio click and measure the offset with a camera and microphone; confirm the offset matches what the reported presentation times predict within a millisecond or two.",
    dep: ["vsync-pageflip", "frame-callbacks", "frame-scheduler"]
  },
  "frame-callbacks": {
    s: "A signal telling a client it is a good time to draw its next frame, sent only for visible surfaces and paced to the display, so hidden windows stay idle.",
    d: "A client requests a callback before committing. The compositor fires it when it has presented or will soon present that surface, so the client draws one frame, commits and requests another. Surfaces that are hidden, minimized or on another workspace receive no callbacks, which stops their animations and saves power. Throttling and timing are the compositor's way of keeping clients in step with the display. Hard parts are deciding the timing relative to the next flip and avoiding callbacks that arrive just too late to use.",
    k: ["Callback paced by the display versus clients using their own timers: pacing prevents wasted frames and lets the compositor save power, but clients must schedule by it.", "Firing callbacks at presentation versus at the start of composition: at presentation is simple, while earlier firing gives clients more time to produce the frame for the next flip."],
    p: ["A minimized window keeps getting callbacks and burns battery drawing frames nobody sees.", "A callback fires just after composition starts, so the client's frame misses the deadline by almost a full refresh."],
    v: "Minimize an animated window and confirm its client receives no callbacks and CPU use falls to idle. Restore it and confirm callbacks resume at the display rate.",
    dep: ["frame-scheduler", "workspaces-and-virtual-desktops", "double-buffered-state"]
  },
  "latency-control": {
    s: "Techniques that reduce the delay between input and the pixels it affects: late-start composition, input prediction, tearing flips for chosen windows and not buffering frames in queues.",
    d: "Latency accumulates in each stage: input processing, client drawing, waiting to be composed, composition, waiting for vblank and the panel's own response. The compositor can start composition late, sample input right before drawing, allow a client to present immediately, and skip queues. Each of these gives up smoothness or power. A cursor on a hardware plane bypasses most of the pipeline. The difficulty is that the budget is several stages long and no one stage owns it, so improvements need measurement end to end.",
    k: ["Low latency versus smoothness and power: late composition and tearing flips lower delay but raise the risk of missed frames and visible tearing.", "A per-application latency hint versus a global mode: hints give games low latency without affecting the desktop, while a global setting is simpler but costs power."],
    p: ["A queued extra frame in the client's swap chain adds a full frame of delay that the compositor cannot see.", "Aggressive late-start causes missed frames on a loaded system, trading steady delay for stutter."],
    v: "Measure end-to-end latency with a click-to-photon rig in default and low-latency modes over thousands of samples; confirm a lower median and report the missed-frame rate alongside it.",
    dep: ["frame-scheduler", "direct-scanout", "vsync-pageflip", "cursor-surfaces"]
  },
  "direct-scanout": {
    s: "Showing a client's buffer directly on the display, bypassing composition, when a full-screen window covers an output and its buffer has a format the display accepts.",
    d: "If one opaque surface covers the whole output at native resolution, with no effects or overlays above it, the compositor can submit the client's buffer directly to the primary plane instead of drawing a copy. This removes a GPU pass, saves power and latency, and makes variable refresh possible. The test is delegated to the kernel's test-only commit. When a notification or the cursor needs to appear, the compositor must return to composition without a visible hitch. Hard parts are format and modifier match, and detecting when scanout stops being valid.",
    k: ["Opportunistic scanout versus always composing: scanout is faster and cheaper, but adds a code path with failures that only appear in some conditions.", "Falling back immediately versus after a delay when something overlaps: immediate keeps correctness, while delay avoids flicker between modes for brief overlays."],
    p: ["A notification appears over a scanned-out game and the compositor stalls for a frame while switching modes.", "Direct scanout holds the client's buffer longer than expected and the client runs out of buffers."],
    v: "Run a full-screen client and confirm via compositor and kernel counters that the GPU composition pass is skipped. Show a notification and confirm the switch back is seamless and presentation continues without a missed frame.",
    dep: ["atomic-commit", "format-modifier-negotiation", "overlay-planes", "buffer-release"]
  },
  "overlay-planes": {
    s: "Assigning surfaces such as video, cursor or a full-screen window to the display controller's extra hardware layers, so the display combines them and the GPU does less.",
    d: "A display controller has a few planes with fixed capabilities: how many, which formats, whether they can scale, rotate or blend, and their stacking order. The compositor decides which surfaces to put on planes, trying configurations through test-only commits, because valid combinations depend on bandwidth and are not discoverable otherwise. A plane assignment changes frame by frame as windows move. It is hard because the search is combinatorial, results differ per hardware, and a configuration that tests as valid may still glitch under load.",
    k: ["Searching plane assignments each frame versus a fixed policy: searching exploits the hardware fully, but costs CPU time, a fixed policy is cheap but misses opportunities.", "Using planes for video and cursor only versus for any surface: restricted use is dependable on all hardware, broad use saves more but multiplies edge cases."],
    p: ["An assignment passes the test but flickers under memory bandwidth pressure on high-resolution outputs.", "A plane that cannot blend shows a black rectangle where the surface has transparency."],
    v: "Play video in a window over a desktop; confirm via kernel state that the video uses its own plane, the composition work drops, and the window looks identical to the same scene composed on the GPU.",
    dep: ["atomic-commit", "format-modifier-negotiation", "kernel-display-interface"]
  },
  "atomic-commit": {
    s: "Submitting every display change, planes, modes, colors and properties for all outputs, as a single request that either takes effect whole at the next refresh or fails with nothing changed.",
    d: "A commit is a list of property changes on connectors, controllers and planes. A test-only commit asks whether it would work without applying it, which is how the compositor probes plane assignments and modes safely. A real commit may be nonblocking, completing with an event at the next vblank. Because all changes land together, a mode change or plane reassignment never shows an intermediate state. Hard parts include failure after the test passed, ordering across multiple outputs, and fencing the commit on buffer readiness.",
    k: ["Atomic commits versus legacy per-property calls: atomic prevents glitched intermediate states and supports testing, but requires drivers to implement the full model.", "Blocking commit versus non-blocking with events: non-blocking keeps the loop responsive, but demands complete state tracking of what is pending."],
    p: ["A commit that tested valid fails at apply time on a rare condition, and the compositor has no fallback ready.", "A pending commit is not tracked, so a second commit is issued on top and is rejected."],
    v: "Issue a sequence of mode changes and plane reassignments while capturing at high speed; confirm no frame shows a mixture of old and new states, and that a deliberately invalid test commit leaves the display unchanged.",
    dep: ["kernel-display-interface", "sync-primitives"]
  },
});
