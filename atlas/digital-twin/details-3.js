// Details for the digital twin plate, part 3: simulation and what-if.
ATLAS.details("digital-twin", {
  "physics-based-models": {
    s: "First-principles models of an asset built from conservation laws and component behavior, giving explainable predictions that hold even outside the range of recorded data.",
    d: "These models express mass, energy, momentum or electrical balances as equations over components, solved numerically in time or space. Parameters such as efficiency curves, friction and heat transfer coefficients are fitted to the specific asset. They can predict states that no sensor measures. They are expensive to build and run, require domain expertise, and their value depends on calibration. The hard part is knowing which effects can be left out without making the answer useless.",
    k: ["Detailed model vs simplified model: detail captures more phenomena but is slow and needs many parameters; simplification runs fast and fails outside its assumptions.", "Acausal component libraries vs hand-written equations: component libraries assemble quickly and reuse well; hand-written models give control and cost authoring time."],
    p: ["A model validated at rated load is trusted at part load where a neglected effect dominates.", "Solver settings that are too loose hide numerical error that looks like a physical result."],
    v: "Run the model with recorded inputs from a steady period and compare predicted outputs with measured ones, confirming errors stay within the documented tolerance at several loads, including one not used in calibration.",
    dep: ["model-calibration", "asset-type-library", "units-and-semantics"]
  },
  "reduced-order-models": {
    s: "Simplified versions of heavy models that keep their dominant behavior but run orders of magnitude faster, so they can follow the asset in real time or be run thousands of times.",
    d: "A reduced model is derived from a detailed one by projecting onto dominant modes, lumping components, or fitting a low-dimensional approximation to its outputs over the operating range. It is validated against the full model on held-out conditions, and its validity range is recorded. The twin uses it for continuous residuals and fast scenario sweeps. The hard part is the validity range: outside the conditions it was derived for, it can be confidently wrong.",
    k: ["Projection-based reduction vs lumped-parameter simplification: projection keeps accuracy in a known range but needs the full model; lumped models are easier to build and to explain.", "One global reduced model vs several local ones: global is simple and less accurate; local models are accurate and need switching logic."],
    p: ["A reduced model is used beyond its validity range and gives plausible, wrong answers.", "The full model is updated and the reduced model is not regenerated."],
    v: "Compare reduced and full model outputs across a grid of operating conditions, confirm error is within tolerance inside the declared range, and that the system refuses or flags requests outside it.",
    dep: ["physics-based-models", "model-calibration", "scenario-manager"]
  },
  "data-driven-surrogates": {
    s: "Learned approximations of a simulation or of the asset itself, trained on recorded or simulated data, giving fast predictions where no good physical model exists.",
    d: "A regression or sequence model learns the mapping from inputs and state to outputs, using plant history, simulation runs or both. Once trained it evaluates in milliseconds and can be updated as new data arrives. Surrogates of expensive simulations let a scenario sweep run interactively. The difficulty is extrapolation: a learned model knows nothing outside its training data, may violate physical constraints, and gives little sign when it is guessing.",
    k: ["Pure learned surrogate vs physics-constrained hybrid: pure learned is quick to build; hybrids obey conservation laws and extrapolate better at the cost of design effort.", "Train on plant data vs on simulation data: plant data is real but narrow and noisy; simulation data covers extremes but inherits the model's errors."],
    p: ["A surrogate trained only on normal operation predicts smooth, normal output during a fault.", "Predictions that break conservation laws pass unnoticed because nobody checks them."],
    v: "Test the surrogate on conditions outside its training range and confirm it either reports reduced confidence or refuses, and that on in-range cases it matches the reference simulation within tolerance.",
    dep: ["ml-training-pipeline", "physics-based-models", "time-series-store"]
  },
  "process-and-event-simulation": {
    s: "Models of flows, queues and discrete operations such as production lines, logistics and crews, simulated as events rather than continuous physics.",
    d: "Entities such as parts, vehicles or jobs move through resources with capacities, processing times and failure behavior. The engine advances time from event to event and records queues, utilization and throughput. The twin initializes it from live work-in-progress and resource states, then runs forward to predict bottlenecks and completion times. The hard part is stochastic behavior: one run is one sample, so decisions need many replications, and input distributions must come from real data.",
    k: ["Discrete-event vs agent-based: discrete-event is fast and statistically well understood; agent-based captures individual behavior and costs more to calibrate.", "Fitted distributions vs replayed history: fitted distributions allow what-if exploration; replay is faithful and cannot vary the unseen."],
    p: ["Single-run results are quoted as predictions without any spread.", "Breakdown and setup times taken from planning data are far better than reality."],
    v: "Initialize from a recorded snapshot of a line, run many replications, and confirm that predicted throughput over the following shift brackets the actual measured throughput.",
    dep: ["state-initialization", "scenario-manager", "uncertainty-quantification"]
  },
  "co-simulation-orchestrator": {
    s: "Runs several models from different tools and domains together, exchanging values at agreed time steps so a mechanical, thermal and control model behave as one system.",
    d: "Each model is wrapped behind a common interface exposing inputs, outputs, and step functions. The orchestrator builds the connection graph, chooses a master algorithm, advances models in order or iterates within a step to converge, and resolves differing time steps through interpolation. It records every exchanged value. The hard part is numerical: loops between models can become unstable, and exchange steps that are too large introduce errors no single model shows.",
    k: ["Fixed-step exchange vs adaptive exchange: fixed is predictable and simple; adaptive keeps accuracy during fast events and complicates scheduling.", "Standard model wrapper vs native integration: wrappers let models from different suppliers be combined, with some loss of speed and features."],
    p: ["Loosely coupled models oscillate or diverge at larger exchange steps, and the instability is blamed on a model.", "Models using different units or sign conventions exchange wrong values quietly."],
    v: "Couple two models with a known analytic solution for the combined system and confirm results match it within tolerance at the chosen step, and halving the step moves results by less than a stated amount.",
    dep: ["physics-based-models", "reduced-order-models", "units-and-semantics", "simulation-compute-scheduling"]
  },
  "state-initialization": {
    s: "Starts a simulation from the twin's current or historical state, filling in unmeasured quantities with estimates so the run begins where the real asset actually is.",
    d: "A simulation needs a complete state, while sensors cover only part of it. The initializer takes the estimated state, maps twin properties to model variables, fills the gaps by running the model to equilibrium or using the state estimator, and checks consistency such as mass balance. It can start from a snapshot at any past time. The difficulty is consistency: an inconsistent starting state creates a transient that looks like a real effect and corrupts the first minutes of results.",
    k: ["Start from the estimated state vs warm up from a steady guess: estimated state is faithful but needs good estimation; warm-up is simple and loses the actual condition.", "Freeze inputs vs replay inputs forward: freezing gives a clean what-if from now; replaying the recorded inputs reproduces what really happened."],
    p: ["An unmeasured variable is set to a default and the run starts with a spurious transient.", "State is taken from a time when quality flags showed a failed sensor."],
    v: "Initialize a model from a snapshot of a steady period and confirm that, with inputs held, it stays steady, then initialize from a past dynamic moment and confirm it reproduces what followed.",
    dep: ["state-estimation", "state-snapshots", "current-state-store", "quality-flags"]
  },
  "model-calibration": {
    s: "Fits model parameters to recorded behavior so a generic model of an asset type matches this specific asset, and repeats as the asset wears.",
    d: "Calibration chooses parameters, such as efficiencies, friction, volumes and time constants, to minimize the gap between simulated and measured outputs over selected periods. It uses optimization with bounds, sensitivity analysis to find which parameters matter, and a separate validation period. Results are versioned with the data used. The hard part is identifiability: many different parameter sets fit the data equally well, and a fit that works on one operating range can fail on another.",
    k: ["Offline periodic calibration vs online continuous estimation: offline is auditable and lags; online follows wear and can mistake a fault for a changed parameter.", "Fit many parameters vs few: many fits closely and wanders; few is stable and leaves unexplained error."],
    p: ["Calibrating on data that includes a fault bakes the fault into the model.", "Parameters drift to unphysical values that fit well and make the model meaningless."],
    v: "Calibrate on one period and score on a later period with different load, confirming error is within tolerance and parameters stay within physical bounds, with the sensitivity ranking recorded.",
    dep: ["time-series-store", "quality-flags", "physics-based-models", "operating-mode-detection"]
  },
  "scenario-manager": {
    s: "Defines, stores and runs named scenarios: a starting state, a set of changes and a horizon, with results kept so they can be reviewed, shared and compared.",
    d: "A scenario records the base state or time, the model versions, modified parameters, input profiles such as demand or weather, and the run settings. Users create variants by changing a few items. The manager queues runs, tracks status, stores results with full provenance and lets scenarios branch and be tagged. The hard part is reproducibility: results must be tied to exact model and data versions, otherwise a scenario cannot be rerun or trusted months later.",
    k: ["Scenarios as full copies vs as deltas on a base: copies are self-contained and consume storage; deltas are compact but break if the base changes.", "Live-linked scenarios vs frozen scenarios: live-linked stay current and change their own results; frozen are reproducible and age."],
    p: ["A scenario silently picks up a newer model version and its result changes without anyone noticing.", "Dozens of unnamed scenarios accumulate and nobody knows which one drove a decision."],
    v: "Run a scenario, change the model version, rerun the stored scenario by its recorded versions and confirm identical results, and confirm a branched variant lists exactly the parameters that differ.",
    dep: ["state-initialization", "state-snapshots", "schema-versioning", "simulation-compute-scheduling"]
  },
  "uncertainty-quantification": {
    s: "Estimates how uncertain simulation and prediction results are by propagating input, parameter and model uncertainty, so outputs come with ranges instead of single values.",
    d: "Uncertain inputs and parameters are described by distributions. Sampling methods, ensembles or analytic propagation run the model across them and produce output distributions and sensitivity measures. Sensor uncertainty from the data layer feeds in. Results are shown as bands, probabilities of exceeding limits and tornado charts. The hard part is cost, since many runs are needed, and honesty: distributions chosen carelessly give narrow, confident and wrong ranges.",
    k: ["Sampling ensembles vs analytic propagation: ensembles handle any model and cost many runs; analytic is cheap and limited to simple models.", "Parameter uncertainty only vs including model-structure error: parameter-only is tractable and understates risk; including structure error is realistic and hard to estimate."],
    p: ["Treating sensor errors as independent when they share a calibration makes ranges too narrow.", "Ranges are reported with no statement of what uncertainty sources were included."],
    v: "Run a case with a known analytic answer and confirm the propagated range matches the analytic one, then check that a coverage test across historical cases contains actual outcomes at the stated rate.",
    dep: ["physics-based-models", "reduced-order-models", "calibration-drift-tracking", "simulation-compute-scheduling"]
  },
  "what-if-comparison": {
    s: "Puts the results of a baseline and one or more changed scenarios side by side, showing differences in key measures, constraints violated and risk, with the cause of each difference traceable.",
    d: "The comparison aligns scenario runs on the same horizon, computes deltas of chosen KPIs and constraint margins, ranks alternatives against objectives, and links each difference back to the parameter change that caused it. It highlights where results differ by less than their uncertainty so noise is not read as improvement. The hard part is attribution and honesty: when several parameters change together, effects interact, and a small difference may sit inside the model's error.",
    k: ["Single-objective ranking vs showing the trade-off frontier: a single rank gives a clear answer but hides costs; the frontier is honest and puts the decision with the reader.", "Compare final values vs compare trajectories: final values are simple; trajectories reveal temporary violations."],
    p: ["A difference smaller than the model's uncertainty is presented as a clear winner.", "Alternatives are simulated with different input profiles, so the comparison measures the inputs."],
    v: "Compare a scenario against itself with different random seeds and confirm the differences are reported as within noise, then apply a known change and confirm its effect is attributed to the right parameter.",
    dep: ["scenario-manager", "uncertainty-quantification", "kpi-and-reporting"]
  },
  "simulation-compute-scheduling": {
    s: "Allocates compute to simulation jobs: queues, priorities, parallel sweeps and deadlines, so urgent what-if runs finish while long studies use spare capacity.",
    d: "Jobs declare resources, expected duration and priority. The scheduler packs them onto batch or elastic compute, parallelizes parameter sweeps, caches results keyed by model and inputs, and may preempt low-priority work. Real-time runs, which must keep pace with the asset, get dedicated capacity. Licenses for third-party solvers are a scarce resource it must also track. The hard part is mixed workloads: interactive users expect answers in seconds while some jobs run for days.",
    k: ["Elastic cloud capacity vs fixed on-site capacity: elastic absorbs sweeps cheaply but data may not be allowed to leave the site; on-site is controlled and limited.", "Result caching vs recompute: caching saves cost and needs exact keys for model and data; recompute is simple and expensive."],
    p: ["A parameter sweep fills the queue and delays the run an operator is waiting for.", "A cached result is served after the model changed because the key did not include its version."],
    v: "Submit a long sweep and an urgent interactive run together and confirm the interactive run starts within its target time, and that rerunning an identical job returns the cached result flagged as such.",
    dep: ["scenario-manager", "tenant-isolation", "platform-observability"]
  },
});
