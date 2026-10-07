// Details for the physics engine plate, part 4: the constraint solver and joints.
ATLAS.details("physics-engine", {
  "contact-constraints": {
    s: "Turns each contact point into rows that limit relative velocity along the normal and two tangents, with bounds on the impulse each row may apply.",
    d: "For a contact point the engine precomputes the Jacobian terms (normal and the cross products with the offsets from each body's center), the effective mass of the row (the inverse of the sum of inverse masses and rotational terms), a bias velocity for correction or restitution, and impulse limits. The normal row has a lower bound of zero, since contacts only push; friction rows are bounded by the friction coefficient times the normal impulse. This setup runs once per step so that the iterations are only multiply-adds. The hard part is what to put in the bias: penetration recovery, restitution and speculative margin all land there.",
    k: ["Friction rows bounded by the normal impulse vs a coupled friction cone: bounded boxes are cheap and slightly anisotropic, a cone is isotropic and costs more.", "Precomputing effective mass per step vs recomputing in the iterations: precomputing is fast, recomputing follows rotation within the step and rarely matters."],
    p: ["Offsets are measured from the body origin instead of the center of mass, and every contact applies a spurious torque.", "A negative bias from a speculative contact is not clamped, and bodies are pulled together before touching."],
    v: "Apply a single contact between a box and a floor, solve, and confirm the normal impulse equals mass times approach speed, the relative normal velocity ends at zero and the impulse is never negative.",
    dep: ["contact-manifold","mass-properties","inertia-tensors","friction-model"]
  },
  "sequential-impulses": {
    s: "The standard real-time solver: apply each constraint's impulse in turn, accumulate and clamp it, and repeat for several iterations until velocities approximately satisfy all constraints.",
    d: "For each iteration, loop over constraints and compute the impulse change needed to bring the relative velocity along the row to its target. The change is added to the accumulated impulse, which is clamped to the row's bounds, and only the difference after clamping is applied to the bodies. Because each application disturbs the others, repeated sweeps converge toward a joint solution. Iteration counts of four to ten are typical. The method is cheap, robust and gives plausible stacking, but it converges slowly for heavy mass ratios and long chains, and result depends on constraint order.",
    k: ["Clamping the accumulated impulse vs clamping each increment: clamping the total allows a later iteration to reduce an earlier push, clamping increments can make contacts pull.", "Few iterations with warm starting vs many without: warm starting gives most of the benefit for far less cost, many iterations are slower and still less settled."],
    p: ["Constraint order is fixed, and the same row always solved last biases stacks to lean in one direction.", "Heavy bodies resting on light ones converge slowly, and the light body is crushed into the floor."],
    v: "Stack a box ten high and confirm that at ten iterations with warm starting it rests within a small penetration for a minute, and drops measurably if iterations are reduced to two.",
    dep: ["contact-constraints","warm-starting","joint-framework","projected-gauss-seidel"]
  },
  "projected-gauss-seidel": {
    s: "The mathematical form of the iterative solver: Gauss-Seidel sweeps over a linear complementarity problem with each unknown projected back into its allowed range after every update.",
    d: "Contacts pose a complementarity problem: the impulse is either zero with a separating velocity, or positive with zero relative velocity. Gauss-Seidel updates one unknown at a time using the latest values of the others, and projection clamps the unknown to its bounds, which handles the inequality. Solved by sequential impulses in practice; the formal view explains convergence, relaxation and ordering effects. Convergence is guaranteed for the symmetric positive-definite case and slow when the system is ill-conditioned, for example large mass ratios or redundant constraints.",
    k: ["Gauss-Seidel vs Jacobi iteration: Gauss-Seidel converges about twice as fast and is sequential, Jacobi is trivially parallel and needs more passes.", "Plain projection vs over-relaxation: relaxation speeds convergence for smooth systems and can oscillate when contacts are active and inactive in turn."],
    p: ["Redundant constraints (four contacts on a flat box, plus a joint) make the matrix singular, and impulses are distributed arbitrarily and fluctuate.", "Treating an iteration cap as convergence hides that a large island is nowhere near solved."],
    v: "Track the residual constraint error after each iteration on a stack and confirm it falls monotonically and stops when iterations end, with a final value consistent with the visible penetration.",
    dep: ["contact-constraints","sequential-impulses","inertia-tensors"]
  },
  "soft-step-solver": {
    s: "A solver structure that runs one velocity iteration per small substep, using soft constraints with tunable stiffness and damping instead of hard ones, for stable results at low cost.",
    d: "Each substep integrates velocities, warm starts, solves constraints once with softness, integrates positions, relaxes with a second velocity pass that ignores the bias, and repeats. Softness replaces hard correction with a spring-damper expressed by a frequency and damping ratio, whose parameters are turned into a mass scale and impulse scale. Contacts are re-evaluated against moved positions using the cached relative anchor, avoiding a full narrowphase. The approach keeps stacks and ragdolls stable with few iterations, and its quality is set by substep count.",
    k: ["Soft constraints vs hard constraints with Baumgarte: soft ones act as tuned springs and never inject energy, hard ones with Baumgarte are stiffer and can add bounce.", "Relax pass without bias vs none: the relax pass removes energy added by correction at the cost of one more solve."],
    p: ["Soft contact frequency set above half the substep rate makes the spring unstable, and bodies explode.", "Contact anchors are updated from stale transforms, and sliding contacts drift apart across substeps."],
    v: "Run a ten-high stack with four substeps and one iteration each, and confirm it stays within a small penetration and sleeps, while contact softness frequency above the stable limit visibly explodes it.",
    dep: ["substepping","sequential-impulses","position-correction","warm-starting"]
  },
  "block-solver": {
    s: "Solves the two to four rows of a contact manifold, or a joint's rows, together as a small matrix problem instead of one at a time, avoiding the coupling error of sequential updates.",
    d: "For two normal rows between the same bodies, the effective masses are coupled: pushing at one point changes the velocity at the other. A block solver builds the two-by-two matrix, finds the impulses that make both velocities zero while respecting non-negativity by checking the four possible active sets, and applies them. The same idea solves joint rows as a three-by-three. It is more accurate than iterating and costs matrix setup. It matters for boxes resting on faces, where one-at-a-time solving makes edges jitter.",
    k: ["Block solving of a manifold vs scalar row iteration: block gives faster convergence and less jitter on resting faces, scalar is simpler and handles any number of points.", "Solving friction as part of the block vs separately: coupled gives correct friction at the cost of a larger matrix, separate is cheap and slightly wrong."],
    p: ["The active set enumeration picks a wrong case for a near-singular matrix, and impulses go negative or huge.", "Block solving is applied to some contacts but not others, and behavior differs across box faces and corners."],
    v: "Rest a box on its face with four contacts and confirm that block solving at two iterations gives the same, nearly zero residual velocity as scalar solving at ten, with less tilt jitter.",
    dep: ["contact-constraints","projected-gauss-seidel","contact-manifold"]
  },
  "warm-starting": {
    s: "Applying last step's accumulated impulses at the start of this step, so the solver begins near the answer instead of from zero, which is the main reason few iterations suffice.",
    d: "A resting body needs nearly the same support impulse every step. Persistent contacts store their accumulated impulse; at the next step the engine matches each new contact to an old one and applies the old impulse, scaled by a factor, before iterating. Joints do the same. Without it stacks need dozens of iterations. Matching depends on contact persistence by feature ID or proximity, and a contact that changes identity loses its history. Scale below one reduces overshoot when the scene changes suddenly.",
    k: ["Full warm start vs a scaled factor: full gives fastest settling and amplifies error when contacts change, a factor of about 0.8 damps that and settles more slowly.", "Warm starting by feature ID vs by position match: IDs are exact when features are stable, position matching handles meshes and reduced manifolds."],
    p: ["Impulses from a previous contact applied to a new contact on a different normal kick the body sideways.", "A body that is teleported keeps warm-start impulses and launches on its first step."],
    v: "Solve a ten-box stack with warm starting on and off at four iterations and confirm that with it on the penetration is several times smaller after one second.",
    dep: ["contact-persistence","sequential-impulses","contact-constraints"]
  },
  "baumgarte-stabilization": {
    s: "Feeding a fraction of the position error into the velocity target, so constraints pull positions back together at a controlled rate as they are solved.",
    d: "Each constraint's bias is a factor (often 0.1 to 0.3) times the position error divided by the step, minus a small allowed slop, so the solved velocity both stops motion and corrects drift. It is simple and needs no second pass. The velocity added by correction is real energy, so heavy correction makes contacts bouncy and joints springy, and the correction rate interacts with the step size. It remains the default in many solvers because it is cheap, and is replaced by separate position solves or softness where energy gain is unacceptable.",
    k: ["Larger factor vs smaller factor: larger removes penetration quickly and injects bounce, smaller is quiet and lets objects sink visibly.", "Velocity-level correction vs a separate position pass: velocity-level is one pass and adds energy, a position pass is exact and adds work."],
    p: ["A factor tuned at sixty hertz is applied unchanged at thirty, and the correction speed doubles in effect.", "Correcting deep penetration at full factor ejects an object at high speed when it spawns overlapping a wall."],
    v: "Start a box with small penetration, run steps, and confirm penetration shrinks at the rate set by the factor with no rebound, then try a deep start and measure the ejection speed against a configured maximum.",
    dep: ["contact-constraints","position-correction","sequential-impulses"]
  },
  "position-correction": {
    s: "Fixing remaining penetration and joint drift by moving positions directly, without adding velocity, so error is removed without adding energy or bounce.",
    d: "After velocities are solved, a second pass (split impulse, pseudo-velocities or non-linear Gauss-Seidel) computes position changes that separate overlapping bodies or realign joints, applied to positions only. The velocity used for next-step motion is untouched, so correction does not launch anything. Corrections are limited per step to a maximum, and a small slop leaves tiny overlap so contacts do not flicker on and off. The pass costs another iteration over constraints and is the more physical alternative to Baumgarte.",
    k: ["Separate position pass vs velocity bias: a position pass is energy-neutral and costs another solve, velocity bias is cheap and bouncy.", "Linearized correction vs recomputing positions per iteration: linearized is cheap and slightly wrong for large rotations, recomputing is accurate and expensive."],
    p: ["Position correction on a body already moved by CCD pushes it back through the wall it was stopped at.", "The slop value is larger than a thin object's thickness, and thin objects visibly sink into the floor."],
    v: "Drop a box that starts penetrating the floor, and confirm it rises out in a few steps with velocity near zero throughout, compared to a bias method that gives it a visible upward velocity.",
    dep: ["contact-constraints","projected-gauss-seidel","baumgarte-stabilization"]
  },
  "friction-model": {
    s: "The rule limiting tangential force at a contact to a multiple of the normal force, with separate static and dynamic coefficients, solved as part of the contact constraint.",
    d: "Coulomb friction says tangential impulse cannot exceed the friction coefficient times the normal impulse. The solver creates one or two tangent rows per contact, clamped by that bound using the current normal impulse, so friction depends on how hard the contact is pressed. Static friction holds a body below the threshold; dynamic friction applies above it, and simple engines use one coefficient. Rolling and spinning friction rows resist rolling and twisting at the contact. Friction is solved after normals in each iteration so it uses the latest normal impulse.",
    k: ["Two tangent rows with a box bound vs a circular cone: a box is cheap and gives more friction diagonally, a cone is isotropic and needs a projection step.", "Friction anchor per manifold vs per contact point: one anchor at the manifold center is cheap and gives torque via twist friction, per-point resists rotation naturally and costs more rows."],
    p: ["Friction solved before normals uses last iteration's normal impulse, and boxes creep on slopes they should hold.", "Tangent directions are recomputed from velocity each step and flip when velocity is near zero, causing jitter at rest."],
    v: "Put a box on a ramp and tilt it: confirm sliding begins at the angle whose tangent equals the friction coefficient, within a degree.",
    dep: ["contact-constraints","physics-materials","material-combining"]
  },
  "restitution-model": {
    s: "The bounce rule: after a contact, the normal relative velocity is a fraction of the incoming speed, applied only above a minimum approach speed so resting contacts stay still.",
    d: "Restitution adds a bias to the normal row equal to minus the coefficient times the pre-solve approach speed, so the solved velocity separates instead of stopping. A threshold (about one meter per second) disables it for slow contacts, since otherwise a resting box would vibrate. It is applied only on the first step of contact, with the approach speed recorded before the solver changes velocity. Because the solver is approximate, the observed bounce differs from the coefficient, especially in stacks or with soft constraints.",
    k: ["A velocity threshold vs none: threshold stops resting jitter and removes small bounces that look right, none is exact for bouncy balls at low speeds and vibrates stacks.", "Restitution in the solver bias vs a post-solve velocity reflection: bias works with the iteration and is approximate, reflection is exact and ignores other constraints."],
    p: ["Approach speed is read after gravity is applied this step, so resting bodies see a small approach and bounce slightly forever.", "A ball bouncing in a corner gets restitution applied twice on one step and gains energy."],
    v: "Drop a ball from one meter with restitution 0.5 and confirm the first rebound reaches roughly a quarter of the height, and that a ball with restitution zero does not bounce.",
    dep: ["contact-constraints","material-combining","physics-materials"]
  },
  "material-combining": {
    s: "The rule that merges two shapes' material values at a contact into one friction and restitution, such as multiply, average, minimum or maximum.",
    d: "Friction and restitution belong to pairs, but authors set values on single surfaces, so the engine combines them. Common rules: friction by the geometric mean or the product, restitution by the maximum, and in some engines each material chooses its rule with a priority between them. Order and rule must be symmetric so the result does not depend on which shape is first. Special pair overrides handle cases such as ice against anything. The pitfall is that the rule changes how designers expect values to behave.",
    k: ["Geometric mean vs minimum for friction: the mean gives smooth behavior and surprises when one surface is slick, the minimum makes any slippery surface dominate.", "Maximum vs average for restitution: maximum makes any bouncy object bounce on anything, average gives intermediate results that need tuning."],
    p: ["A combine rule depends on pair order, so a body on a floor behaves differently from the floor under the body.", "A zero friction on one material combined by product zeroes all friction, and characters slide on every surface they touch."],
    v: "Place identical boxes on surfaces of friction 0.2, 0.8 and a pair with 0.8 and 0.2, and confirm the pair's effective friction equals the documented combine formula in both orders.",
    dep: ["physics-materials","friction-model","restitution-model"]
  },
  "joint-framework": {
    s: "The common structure for all joints: two bodies with local anchor frames, a set of constraint rows built from them each step, and the iteration hooks the solver calls.",
    d: "A joint stores the two bodies and its anchor and axis in each body's local space. Each step it transforms them to world space, computes the error and the Jacobian rows for the locked degrees of freedom, and adds those rows to the solver, along with limit and motor rows when active. Joints warm start and are solved with contacts, since both appear in islands. The framework handles enabling, breaking, collision between connected bodies and reaction force readback. The hard part is conditioning: joints between very different masses converge slowly.",
    k: ["Joints as constraint rows in the shared solver vs a separate joint solver: shared rows converge together with contacts, separate solvers are specialized and make interaction between them an approximation.", "Anchors in local space vs world space: local anchors follow the bodies and cost a transform, world anchors are cheaper and break when bodies move."],
    p: ["A joint's bodies are allowed to collide, and the shapes at the anchor push against the joint.", "A joint between a kinematic and a very light dynamic body converges poorly and stretches visibly."],
    v: "Connect two bodies with a joint, apply a large force to one, and confirm the anchors stay within a small tolerance of each other and the reported reaction force matches the applied force.",
    dep: ["constraint-graph","body-storage","sequential-impulses","inertia-tensors"]
  },
  "ball-joint": {
    s: "Keeps one point on each of two bodies together, leaving all three rotations free, like a shoulder or a chain link.",
    d: "The constraint removes three translational degrees of freedom: the world-space anchors on both bodies must coincide. It is solved as a three-row block or three scalar rows with the Jacobian built from the offsets. Rotation is free unless a cone limit, twist limit or motor is added. Chains of ball joints behave like ropes, and long chains with light links need many iterations or substeps to stay together. The error to correct is a vector, so the bias is applied along each axis.",
    k: ["Solving the three rows as a block vs separately: a block removes coupling error and costs a three-by-three solve, separate rows are cheaper and stretch under load.", "Limits as cone constraints on the axis vs as angle clamps per Euler angle: a cone is rotationally symmetric, Euler clamps are intuitive and have gimbal problems."],
    p: ["A chain of ball joints stretches under a heavy end weight because iterations cannot propagate the load.", "Swapping the order of bodies flips the sign of reaction forces that gameplay uses to break joints."],
    v: "Hang a chain of ten links from a fixed point and confirm the link anchors separate by less than a small fraction of link length, and the top reaction force equals the total weight.",
    dep: ["joint-framework","joint-limits"]
  },
  "hinge-joint": {
    s: "Allows rotation about a single shared axis and locks all other relative motion, as in a door or a wheel axle.",
    d: "It combines a point-to-point constraint at the pivot with two angular rows that keep the hinge axes of both bodies parallel, leaving one free rotation. Angle is measured about the axis using the bodies' relative orientation, so it can be limited, driven by a motor or sprung. The axes are stored in each body's frame. Five rows are solved per step. Errors show up as the hinge slowly twisting off axis under load, which is corrected by position or Baumgarte terms.",
    k: ["Five scalar rows vs a block solve: scalar rows are simple and drift apart under load, a block is stiffer and costs more.", "Angle from quaternions vs from accumulated deltas: quaternions are stateless and wrap at plus and minus pi, accumulated deltas handle multiple turns and can drift."],
    p: ["Angle limits are measured by a function that wraps at pi, and a limit at 170 degrees flips sides unexpectedly.", "The hinge axes are authored not exactly parallel, and the joint starts under permanent strain."],
    v: "Attach a door body to a frame, push it, and confirm it rotates only about the hinge axis, with off-axis rotation below a tiny angle and a limit stopping it at the configured angle.",
    dep: ["joint-framework","joint-limits","joint-motors"]
  },
  "slider-joint": {
    s: "Allows translation along one axis and locks rotation and sideways motion, as in a piston, drawer or elevator rail.",
    d: "Two rows keep the bodies from moving perpendicular to the axis, and three rows lock relative rotation, leaving a single free translation. The position along the axis is computed from the anchors, and limits, a motor or a spring can act on it. The axis is fixed in one body's frame. The constraint is tough on mass ratios, since a heavy slider on a light rail transmits large torques through the rotational rows. Friction along the axis is added as a motor with zero target speed and a force limit.",
    k: ["Locking rotation with three angular rows vs a combined quaternion constraint: angular rows are simple, a combined constraint is smaller and harder to limit.", "Friction as a limited zero-speed motor vs contact friction: the motor is controllable, contact friction needs real shapes touching."],
    p: ["A slider with limits and a motor fights itself at the limit and jitters because both rows apply at once.", "A slider authored with its axis off from the body frame binds under load."],
    v: "Load a slider with a horizontal force and confirm motion only along its axis with lateral drift below a tiny distance, stopping at the configured limit without bounce beyond the restitution setting.",
    dep: ["joint-framework","joint-limits","joint-motors"]
  },
  "fixed-joint": {
    s: "Locks two bodies together with no relative motion, with a defined offset and rotation, so the pair acts as one body that can still break apart.",
    d: "All six degrees of freedom are removed: three translational rows at the anchor and three angular rows holding the relative orientation. Compared with merging shapes into one body, a fixed joint stays breakable and keeps separate mass properties, but is softer, since solver error lets it flex under load. It is used for attached props, welded wreckage and breakable parts. Long chains of fixed joints bend like flexible rods, which is sometimes wanted and often not.",
    k: ["Fixed joint vs compound shape on one body: a joint can break and is a little soft, a compound shape is perfectly rigid and cannot separate.", "Rigid weld by many iterations vs softness: iterations give stiffness at CPU cost, softness is cheap and visibly flexible."],
    p: ["A tall structure of fixed-joint bodies sags under its own weight because iteration cannot carry load through many joints.", "Breaking threshold is set on force rather than impulse, and step-size changes alter when parts break."],
    v: "Weld a beam to a wall and hang a weight from the free end: confirm the end deflection is within a small tolerance of the configured stiffness and that the joint holds until its threshold is exceeded.",
    dep: ["joint-framework","breakable-joints","compound-shape"]
  },
  "joint-limits": {
    s: "Bounds on a joint's free coordinate, such as angle or distance, enforced by one-sided constraint rows that activate only at the boundary.",
    d: "A limit is a unilateral inequality: when the coordinate reaches the minimum or maximum, a row is added that applies impulse only in the direction that moves back inside, clamped to be non-negative like a contact. It can be hard or soft and can have restitution. Cone limits use a swing angle from an axis; twist limits use the angle about it. Limit rows are added and removed as the joint moves, so warm starting must cope with them appearing. Overlapping limit and motor rows both act at the boundary, which must be resolved by priority.",
    k: ["Hard limits vs soft spring limits: hard limits stop motion exactly and cause impacts that can excite the system, soft limits ease in and permit overshoot.", "Limit checked before the solve vs inside iterations: before is cheap and can miss the crossing, inside tracks the state through iterations at higher cost."],
    p: ["A limit triggered by an angle just inside the range chatters on and off each step, and the joint buzzes.", "Large angular velocities move the joint far beyond the limit in one step, and the correction ejects the bodies."],
    v: "Drive a hinge past its limit with a motor and confirm the angle stops at the limit within a tolerance, and the reported limit impulse equals the applied motor torque in steady state.",
    dep: ["joint-framework","projected-gauss-seidel"]
  },
  "joint-motors": {
    s: "A constraint row that drives a joint coordinate toward a target velocity or position with bounded force, used for wheels, actuators and posing ragdolls.",
    d: "A velocity motor adds a row with a bias equal to the target speed and a maximum impulse of the motor force times step. A position motor computes a speed from the error, proportional to a gain, so the joint seeks a target angle; combined with damping it is a spring. Because the motor is an ordinary row in the solver, it interacts with limits, contacts and other joints. Maximum force makes a motor weak enough to be stopped by an obstacle instead of snapping through it.",
    k: ["Velocity motors vs position motors: velocity motors are simple and drift in position, position motors hold a target and need gain tuning for stability.", "Force limits per motor vs unlimited: limits keep a stalled motor from crushing, unlimited is stiffer and breaks other constraints."],
    p: ["A position motor with high gain at a large step overshoots, oscillates and gains energy each step.", "A motor driving into a limit never stops asking, and the accumulated impulse wastes solver iterations."],
    v: "Drive a hinge at a target speed with a force limit and confirm it reaches the speed unloaded, slows under load by the torque limit, and a mass on its lever stalls it at the predicted torque.",
    dep: ["joint-framework","joint-limits","sequential-impulses"]
  },
  "joint-springs": {
    s: "A spring and damper on a joint coordinate, expressed through frequency and damping ratio, implemented as a soft constraint so it stays stable at any stiffness.",
    d: "Rather than an explicit force of stiffness times extension, the spring is turned into a soft constraint using the step size, frequency and damping ratio, giving an implicit result that cannot overshoot unstably. It acts on distance, angle or a full six degrees of freedom. Suspension, doors, tails and soft attachments use it. The user-facing parameters, frequency in hertz and damping ratio, are easier to tune than stiffness and damping coefficients because they do not depend on mass.",
    k: ["Implicit soft-constraint springs vs explicit force springs: implicit are stable at high stiffness and deliver less energy to the system, explicit are exact at small steps and explode when stiff.", "Frequency and damping ratio vs stiffness and damping: frequency scales with mass automatically, raw coefficients are more direct and need retuning when mass changes."],
    p: ["A spring frequency set near the step rate is aliased, and the spring acts like a constant force.", "Springs between bodies of very different mass visibly pull the light body while barely moving the heavy one, which authors read as a bug."],
    v: "Release a mass on a spring at frequency 2 Hz and damping ratio 0.1 and confirm the oscillation period is 0.5 seconds within a few percent, with amplitude decaying as predicted.",
    dep: ["joint-framework","soft-step-solver"]
  },
  "breakable-joints": {
    s: "Joints that disappear when the force or torque they carry exceeds a limit, used for destructible objects, doors and snap-away connections.",
    d: "After the solve the engine reads the accumulated joint impulse, divides by the step to get force and torque, and compares with the thresholds. If exceeded, the joint is removed at the end of the step and an event reports it, so game code can spawn debris. Because impulse depends on the solver's iteration state, it is a noisy measurement. Thresholds are applied to a smoothed value or to a sustained exceedance for reliability. Removing a joint also splits islands and wakes bodies.",
    k: ["Breaking on instantaneous impulse vs over a short window: instantaneous is simple and breaks on solver spikes, a window is stable and slightly delays breaking.", "Force thresholds vs impulse thresholds: force is step-size independent and noisy, impulse is simple and changes meaning when the step changes."],
    p: ["A solver spike from a teleport breaks every joint in an object for no visible reason.", "A joint breaks during the step but its removal is applied at once and the solver reads freed constraint data."],
    v: "Pull a fixed joint with a gradually increasing force and confirm it breaks at the configured threshold within a tolerance, once, with an event and no change in outcome when the step size doubles.",
    dep: ["joint-framework","contact-events","body-lifecycle"]
  }
});
