// Details for the physics engine plate, part 2: characters, vehicles, ragdolls, soft bodies and particles.
ATLAS.details("physics-engine", {
  "character-controller": {
    s: "Moves a player or NPC capsule through the world by sweeping and sliding, giving responsive movement that does not depend on solver forces.",
    d: "The controller is usually kinematic: game code supplies a desired displacement each step, and the controller sweeps its capsule, slides along hit surfaces by removing the normal component, retries a few times to handle corners, then moves the body. It reports ground contact, ceiling hits and side contacts, and can push dynamic bodies with a limited force. It avoids the solver because forces give floaty, lagging control. Hard cases are corners where two surfaces trap the capsule, moving geometry that shoves it, and tiny ledges that should be stepped over.",
    k: ["Kinematic sweep-and-slide vs a dynamic body driven by forces: kinematic is exact and predictable, while dynamic interacts naturally with pushes and slopes but feels sluggish and can tunnel.", "Capsule vs box vs cylinder shape: a capsule slides smoothly over edges and steps, a box fits doorways precisely but catches on corners."],
    p: ["Three or four slide iterations are not enough in a corner of acute geometry and the character vibrates or sinks into the wall.", "The controller uses the render frame time instead of the fixed step, so movement speed changes with frame rate."],
    v: "Walk the controller into a wall at an angle and confirm it slides along the wall at the tangential speed, then into a corner and confirm it stops without jitter across a hundred steps.",
    dep: ["shape-sweeps","capsule-shape","body-types","step-and-slope-handling"]
  },
  "step-and-slope-handling": {
    s: "Rules that let a character climb small steps, stay attached on slopes up to a limit, slide down steeper ones and not stick to walls.",
    d: "After a horizontal move is blocked, the controller tries again lifted by the step height, then sweeps down to find the new ground; if the new ground is flat enough and the step is below the limit, it keeps the result. Slope limits compare the ground normal with the up direction. On descent a snap-to-ground sweep keeps the character on the surface instead of flying off at the crest. The difficulty is that each rule fixes one case and breaks another: step-up can climb a thin fence, and snap-down can pull a character off a cliff edge.",
    k: ["Step by sweeping up, across and down vs by smoothing the capsule's bottom: sweeping is exact and testable, a rounded bottom is simpler but makes characters hover on stairs.", "Using the contact normal vs the triangle normal for slope tests: the contact normal is smooth over edges, the triangle normal is stable but flips on a mesh seam."],
    p: ["A slope limit tested on a vertex normal blends two steep faces into a walkable one and players climb walls.", "Snapping to ground when moving upward cancels jumps for one step and makes them fail intermittently."],
    v: "Walk onto a step lower than the limit and one higher, confirm the first is climbed with a smooth rise and the second blocks; then stand on a slope just under and just over the limit and confirm hold versus slide.",
    dep: ["shape-sweeps","character-controller","raycast-queries"]
  },
  "moving-platform-carry": {
    s: "Makes a character move with the surface it stands on, including rotating and fast platforms, by applying the platform's motion to the character before its own move.",
    d: "The controller records which body it stood on, reads that body's velocity at the standing point (linear plus angular velocity crossed with offset), and adds the displacement to the character's own movement. Some engines instead track the character's position in the platform's local space. When the platform moves before the character in the update order, the character sees the new position; if after, it lags one step and jitters. The work is in ordering and in leaving the platform: the carry velocity may or may not be kept when the character jumps.",
    k: ["Applying platform velocity vs tracking local-space position: velocity is simple but drifts on rotating platforms, local-space tracking is exact and needs the ground body's transform history.", "Keeping platform velocity on jump vs dropping it: keeping feels physical, dropping feels precise and makes jumps off fast platforms fall short."],
    p: ["Platform and character are updated in different orders on different frames, and the character shakes visibly against the platform.", "A platform that is destroyed or teleports while carrying leaves a stale ground reference and launches the character."],
    v: "Stand a character on a platform moving at constant velocity and one rotating about a vertical axis; confirm its position relative to the platform stays within a small tolerance for ten seconds.",
    dep: ["character-controller","body-types","step-pipeline","integrator"]
  },
  "vehicle-chassis": {
    s: "A rigid body with tuned mass, center of mass and inertia, plus the logic that gathers wheel forces and applies them, forming the base of every vehicle model.",
    d: "The chassis is one dynamic body whose center of mass is usually lowered and whose inertia is set by hand for good handling rather than computed from the visible hull. Each step, wheel components apply suspension and tire forces at their contact points, drive torque is turned into wheel force, and aerodynamic drag and downforce are added. Anti-roll bars couple left and right suspension. Because vehicles are tuned by feel, parameters interact heavily, and a model that is stable at one speed can flip or spin at another.",
    k: ["Hand-set inertia and center of mass vs values computed from shapes: hand values give predictable handling, computed values are accurate but turn easily and feel top-heavy.", "A single rigid chassis vs a multi-body vehicle with joints: a single body is cheap and stable, a jointed model supports articulated parts and costs solver time."],
    p: ["Applying wheel forces at the center of mass instead of the contact point removes body roll and pitch, and the car feels like a sliding box.", "Using a large time step makes stiff suspension oscillate, and the car shakes at rest."],
    v: "Drive off a ramp and land: confirm the chassis pitches in the air by the expected angular momentum, then settles in under a second on its suspension without bouncing.",
    dep: ["wheel-suspension","tire-model","mass-properties","inertia-tensors","integrator"]
  },
  "wheel-suspension": {
    s: "Models each wheel as a spring-damper along a cast ray or shape sweep, finding the ground and applying a force along the suspension axis.",
    d: "For each wheel a ray or small sweep is cast down from the suspension mount through the maximum travel. If it hits, compression is the distance short of full extension, spring force is stiffness times compression, and damper force follows the rate of change; both act on the chassis at the hit point. Hit data (surface material, normal, contact velocity) feeds the tire model. Raycasts are cheap but see the ground as a point, so curbs and ledges feel wrong, while sweeps handle those at higher cost.",
    k: ["Ray per wheel vs sphere or cylinder sweep: a ray is fast and stable but jumps at curbs, a sweep follows the wheel's real shape and costs more.", "Springs as forces vs as constraints in the solver: forces are simple but stiff ones need small steps, constraints stay stable at any stiffness and need solver integration."],
    p: ["The wheel ray hits the car's own body or a passenger, and the suspension compresses to a false stop.", "A damper too stiff for the step size injects energy and the car vibrates faster than the display can show."],
    v: "Park the vehicle on flat ground and confirm all four springs settle to the static compression where force equals weight share, then roll over a step and see the wheel travel stay inside its limits.",
    dep: ["raycast-queries","shape-sweeps","vehicle-chassis","tire-model"]
  },
  "tire-model": {
    s: "Computes the longitudinal and lateral force a tire produces from slip, load and surface, which defines how a vehicle accelerates, brakes and corners.",
    d: "Each wheel computes slip ratio (wheel speed against ground speed) and slip angle (wheel direction against velocity direction), then maps them to force with a curve that rises to a peak and drops. Simple models use friction circles and clamp; fuller ones use a fitted empirical formula that couples the two directions. Load from the suspension scales the peak, and surface material sets friction. Forces are applied at the contact patch. The difficulty is that slip is a ratio dividing by speed, so at standstill the model is singular and needs a separate low-speed treatment.",
    k: ["A simple friction-circle clamp vs an empirical slip curve: the clamp is predictable and cheap, while a slip curve gives proper drifting and understeer at the cost of parameters to tune.", "Applying tire force as an external force vs as a friction constraint: forces are simple but can reverse velocity at low speed, constraints stop cleanly at zero."],
    p: ["At near-zero speed slip ratio explodes and the car creeps or jitters when parked.", "Tire force is computed from the pre-solve velocity and applied after, so the car over-corrects and oscillates sideways."],
    v: "Brake hard from a known speed on dry ground and confirm the stopping distance matches the friction coefficient times gravity within a few percent, then hold the car on a slope at rest without creep.",
    dep: ["wheel-suspension","friction-model","physics-materials","vehicle-chassis"]
  },
  "ragdoll-rig": {
    s: "A set of rigid bodies for the limbs and torso, joined by limited joints that follow the skeleton, so a character can collapse under simulation.",
    d: "Each bone, or small chain of bones, gets a body with a capsule or box shape and mass proportional to its volume. Joints at the skeleton's joints use cone-twist or hinge types with limits that match human range. Neighbouring bodies are excluded from colliding with each other so the joints do not fight their own limbs. The rig is built from the animation skeleton, usually by tools, with hand tuning. Instability is the common failure: light limbs attached to heavy torsos, and many close-set joints, make a stiff system that needs more iterations or substeps.",
    k: ["Few large bodies vs one body per bone: fewer bodies are stable and cheap, more bodies give detailed motion but need more solver work and tuning.", "Limits from anatomy vs wide limits that avoid locking: anatomical limits look natural but can wedge the pose, wide limits are forgiving and let limbs bend impossible ways."],
    p: ["Mass ratios above about ten to one between a limb and its parent make the chain whip and explode.", "Self-collision is left on between adjacent bones, and the rig jitters because contact fights the joint."],
    v: "Drop a ragdoll from two meters onto flat ground and confirm it comes to rest and sleeps within a few seconds with no limb passing through another and no joint exceeding its limit visibly.",
    dep: ["joint-framework","joint-limits","capsule-shape","mass-properties","layers-and-masks"]
  },
  "ragdoll-animation-blend": {
    s: "Mixes animation and simulation, using motors to pull bodies toward animated poses or switching from animation to full physics on impact, then back.",
    d: "Active ragdolls drive each joint with a motor or spring toward the pose the animation system produces, with strength set per bone; strength zero is full ragdoll, strength high follows the animation. For a hit reaction the engine ramps strength down, lets the body react, then ramps back. Getting up requires matching the animation's start pose to the ragdoll's final pose. Applying simulated bone poses back to the animation rig, with blending, is a handshake between two systems with different update orders.",
    k: ["Pose-matching motors vs animation-driven kinematic bodies that switch to dynamic: motors give natural reactions but fight collisions, kinematic switching is stable and looks abrupt.", "Blending in joint space vs in world space: joint space preserves limits, world space preserves the visible silhouette and is harder to keep stable."],
    p: ["Motor strength switched instantly from high to zero pops the pose and flings limbs.", "Animation runs at a different tick than physics and the target pose is a step old, so the character lags its own motion."],
    v: "Play a walk animation with motors at full strength and confirm the simulated body tracks the pose within a few centimeters; then reduce strength to zero on a hit and confirm limbs fall smoothly with no pop.",
    dep: ["ragdoll-rig","joint-motors","joint-springs","body-types","step-pipeline"]
  },
  "pbd-solver": {
    s: "Moves particle positions directly to satisfy constraints, iterating over all constraints each step, giving unconditionally stable deformable simulation that is simple to extend.",
    d: "Each step predicts positions from velocities and forces, then loops several times over constraints (distance, bending, volume, collision), each computing a correction that moves its particles toward satisfaction, weighted by inverse mass. Velocities are then recomputed from the position change, which implicitly damps. Gauss-Seidel order matters, and stiffness depends on the iteration count and step size rather than a physical constant. It is easy to write and hard to make physically accurate, because the result changes whenever iterations or substeps change.",
    k: ["Position-level correction vs force-based springs: position-level is stable at any stiffness and cheap, force-based springs are physically meaningful but explode when stiff.", "More iterations vs more substeps: substeps converge faster per unit of cost for stiff systems, iterations are cheaper per pass and leave a visible softness."],
    p: ["Stiffness is tuned at one frame rate and the cloth turns rubbery or rigid when the step changes.", "Updating velocities from positions after collision removes bounce, and objects stick instead of rebounding."],
    v: "Hang a chain of particles by one end and confirm that with more iterations it stretches less, converging to a length within a few percent of rest length at the chosen setting.",
    dep: ["integrator","substepping","xpbd-compliance","step-memory-arenas"]
  },
  "xpbd-compliance": {
    s: "Extends position-based dynamics with a compliance parameter per constraint, making stiffness a real physical value that no longer depends on iteration count or step size.",
    d: "Each constraint carries a compliance, the inverse of stiffness, scaled by the square of the time step. The correction includes a term from the accumulated Lagrange multiplier so repeated iterations converge toward the same answer as an implicit spring. Zero compliance is a hard constraint. This lets designers set materials in physical units (soft rubber, stiff fabric) and have behavior stay the same when the step size changes. Constraint force can be recovered from the multiplier, which enables breaking and sensing. It still converges slowly for very stiff or heavy-mass-ratio systems.",
    k: ["Compliance in physical units vs a unitless stiffness fraction: units give consistent behavior across scenes and steps, a fraction is easier to tune and means different things at different steps.", "Hard constraints with zero compliance vs very stiff soft ones: zero is exact at convergence but can stall on conflicting constraints, stiff soft ones tolerate conflict."],
    p: ["Compliance is not scaled by the step squared, and doubling substeps makes the material twice as stiff.", "Multipliers are not reset each step, and old corrections accumulate into a growing drift."],
    v: "Simulate the same hanging weight at one, two and four substeps and confirm the stretch is the same within a few percent for a given compliance, matching the spring formula for static deflection.",
    dep: ["pbd-solver","substepping"]
  },
  "cloth-mesh": {
    s: "A triangle mesh whose vertices are particles, with stretch, shear and bend constraints along edges, pins and per-vertex mass, that behaves like fabric.",
    d: "Each mesh edge becomes a distance constraint for stretch; opposite vertices across neighbouring triangles get a bend constraint using distance or dihedral angle; shear comes from diagonal edges. Vertices can be pinned, attached to a moving body, or limited to a maximum distance from the animated pose so the cloth stays near the character. Mass comes from triangle area and a density. Mesh quality matters: long thin triangles make stiff, anisotropic behavior. Resolution costs: constraint count scales with vertices, and solver iterations multiply that.",
    k: ["Lower-resolution simulation mesh with skinning to the render mesh vs simulating the render mesh: low resolution is cheap and stable, while full resolution captures fine wrinkles at several times the cost.", "Distance-based bending vs dihedral-angle bending: distance is simple and cheap, dihedral angle resists folding more accurately and needs more computation."],
    p: ["Pinning only a few vertices of a heavy cloth overstretches the triangles near the pin, and visible tearing appears.", "A mesh with uneven triangle sizes behaves stiffer where triangles are small, and drapes with visible bias."],
    v: "Pin two corners of a square cloth and let it fall under gravity: confirm it hangs in a smooth catenary-like curve with no triangle exceeding a few percent stretch.",
    dep: ["pbd-solver","xpbd-compliance","cloth-collision","collision-asset-cooking"]
  },
  "cloth-collision": {
    s: "Keeps cloth particles out of other shapes, including the cloth itself, by moving particles to shape surfaces and adding friction.",
    d: "Particles are tested against capsules, spheres and boxes approximating the character and world, using a spatial hash for candidates; penetrating particles are projected to the surface along the normal. Self-collision uses a particle hash with a small radius so folds do not pass through each other. Continuous checks on the predicted path prevent a fast particle from tunneling through thin shapes. Collision against the full mesh is expensive, so characters use a simplified proxy. Friction slows sliding and lets cloth rest on the body instead of slipping off.",
    k: ["Collision against capsule proxies vs the true body mesh: proxies are cheap and good enough at a distance, the true mesh gives tight fit and costs far more.", "Particle-versus-surface vs edge and triangle collision: particles are simple and let thin cloth cut through sharp edges, triangle tests are accurate and slower."],
    p: ["Self-collision radius larger than the rest edge length makes neighbouring particles repel each other, and the cloth crinkles at rest.", "Projection order against several shapes pushes a particle into the next one, and cloth jitters between two close colliders."],
    v: "Drop cloth over a sphere and confirm no particle ends inside the sphere beyond a small tolerance and the cloth settles, then fold it onto itself and confirm layers do not interpenetrate.",
    dep: ["cloth-mesh","uniform-grid","sphere-shape","capsule-shape","pbd-solver"]
  },
  "soft-body-volume": {
    s: "Deformable solids built from particles with shape-matching or volume constraints, which dent on impact and recover, for jelly, flesh and inflatable objects.",
    d: "A tetrahedral or cluster-based particle set carries distance constraints along edges plus a volume constraint per tetrahedron that resists compression, or a shape-matching step that pulls particles toward a best-fit rigid transform of their rest layout. Pressure models fill a closed surface with an internal pressure for balloons. The soft body collides with rigid shapes through its particles, and can push dynamic bodies back. Real material behavior (plasticity, fracture) is far beyond the constraint model; what matters is that it looks soft without inverting.",
    k: ["Shape matching vs finite-element style volume constraints: shape matching is simple and unconditionally stable, volume constraints behave more like real material and cost more per step.", "Tetrahedral mesh vs particle clusters: tetrahedra give controlled volume, clusters are easier to author and less accurate."],
    p: ["Under heavy compression tetrahedra invert, and the body never recovers its shape.", "Two-way coupling with a rigid body is applied with different mass scales, and the soft body acts as if weightless."],
    v: "Drop a soft cube onto a floor, confirm it flattens, rebounds and returns to within a few percent of its rest volume and shape, and a heavy rigid box placed on top compresses it without inverting any tetrahedron.",
    dep: ["pbd-solver","xpbd-compliance","cloth-collision","physics-materials"]
  },
  "particle-system": {
    s: "Many small point or sphere bodies with simple collision against the world, used for debris, sparks and granular materials like sand.",
    d: "Particles integrate under gravity and drag, collide with static shapes by a signed distance test or by a few primitives, and optionally with each other through a spatial hash. Because they have no orientation, per-particle cost is a few dozen operations, so engines simulate hundreds of thousands, often on the GPU. Granular behavior (piles, angle of repose) comes from friction between particles, which needs enough solver iterations. Results rarely feed back to rigid bodies, and when they do, coupling is one-way to keep cost bounded.",
    k: ["Particles that collide with each other vs those that only hit the world: mutual collision gives piles and flow but costs a hash and a solve, world-only is nearly free and looks like effects.", "CPU vs GPU simulation: CPU gives easy gameplay interaction, GPU supports vastly more particles and makes reading results back expensive."],
    p: ["A fixed-size spatial hash cell smaller than the particle diameter misses neighbours and particles overlap.", "Reading GPU particle positions back to the CPU each frame stalls the pipeline for longer than the simulation."],
    v: "Pour ten thousand particles onto a plane and confirm they form a pile whose slope matches the friction angle within a few degrees and that none fall through the plane.",
    dep: ["uniform-grid","pbd-solver","friction-model","step-memory-arenas"]
  },
  "fluid-solver": {
    s: "Simulates liquid as particles with density or incompressibility constraints, such as smoothed particle hydrodynamics or position-based fluids, for splashes and flowing water.",
    d: "Each particle finds neighbours within a smoothing radius using a grid, computes density from them, and a pressure or position correction pushes particles apart where density exceeds the rest value. Viscosity and surface tension add terms. Position-based fluids reuse the constraint solver with a density constraint per particle. Rendering needs a surface built from the particles. Cost is neighbour search at tens of neighbours per particle. Stable results demand small steps and many iterations, and real-time fluids stay in the tens of thousands of particles.",
    k: ["Particle fluids vs grid-based fluids: particles handle free surfaces and splashes naturally, grids give smoother large volumes and poor splash detail.", "Pressure forces vs position-based density constraints: forces are physically direct and need tiny steps, constraints are stable at game steps and less accurate."],
    p: ["Too few neighbours near the free surface gives low density estimates, and the fluid clumps and sticks to the surface.", "Time step too large for the smoothing radius gives explosive pressure and particles shooting out."],
    v: "Release a block of fluid in a tank and confirm that it settles to a flat surface at the expected height with volume conserved within a few percent and no particles leaking through walls.",
    dep: ["particle-system","pbd-solver","uniform-grid","xpbd-compliance"]
  }
});
