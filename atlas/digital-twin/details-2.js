// Details for the digital twin plate, part 2: anomaly detection and predictive maintenance.
ATLAS.details("digital-twin", {
  "operating-mode-detection": {
    s: "Classifies what the asset is doing, such as starting, running at load, idling or shutting down, so that later detectors compare like with like.",
    d: "Mode is inferred from a few key signals or from the control system's own state: speeds, flows, setpoints and discrete status. Rules, state machines or learned classifiers assign a mode with a start and end time, and the result is stored as an event series. Baselines, thresholds and health indicators are then computed per mode. The hard part is transitions and unlabeled modes: values during startup look abnormal against running values, and unusual real modes appear that nobody named.",
    k: ["Rules from control state vs learned clustering: rules are explainable and exact but miss unnamed modes; clustering finds them but produces clusters people must interpret.", "Hard mode boundaries vs soft membership: hard boundaries keep logic simple, but transitions flip-flop; soft membership is smoother and harder to explain."],
    p: ["A startup transient is judged against steady-state limits and triggers an alarm every morning.", "A new operating regime is never named, so its data pollutes another mode's baseline."],
    v: "Replay a day with known start, load change and stop times and confirm detected mode boundaries fall within a few seconds of the recorded events, and that a startup raises no anomaly.",
    dep: ["current-state-store", "time-series-store", "telemetry-schema"]
  },
  "baseline-modeling": {
    s: "Learns the normal range and relationships for each signal, per asset and per operating mode, and keeps them updated as the asset ages and seasons change.",
    d: "A baseline is a statistical description of normal: bands for a single signal, or expected values given other signals such as load and ambient temperature. It is trained on history filtered to good-quality data in the right mode, validated on held-out periods, and refreshed on a schedule. Baselines are stored with the data window and model version used. The difficulty is contamination and drift: training on data that already contains a fault teaches the model that the fault is normal, while ignoring slow change makes every alert fire.",
    k: ["Per-asset baselines vs per-type baselines: per-asset catches individual quirks but needs history and cold-starts slowly; per-type starts immediately but hides assets that differ.", "Frozen baseline vs adaptive baseline: frozen exposes slow degradation, adaptive avoids false alerts from seasons but can absorb the degradation as normal."],
    p: ["Training on a period that included an undetected fault builds the fault into normal.", "A baseline refreshed automatically after a repair keeps judging the repaired asset by its old worn behavior."],
    v: "Train on a clean year, inject a recorded fault dataset, and confirm the fault is flagged. Then train on a window containing the fault and confirm the platform warns about contamination from its quality or event labels.",
    dep: ["operating-mode-detection", "quality-flags", "time-series-store"]
  },
  "rule-and-threshold-alerts": {
    s: "Explicit conditions written by engineers, such as limits, rates of change and combinations, evaluated continuously and attached to the asset type or an individual asset.",
    d: "Rules reference model properties, not raw tags, so one rule applies to every asset of a type. They support hold times, hysteresis, deadbands, duration and combinations across several signals, and can be turned off while an asset is in maintenance. Evaluation runs in the stream engine. Rules are simple to explain and audit, which is why they remain the core of most deployments. The hard part is volume: thousands of hand-set limits go stale, conflict and generate noise.",
    k: ["Rules on types vs rules on instances: type rules scale and stay consistent, but cannot express one unit's special case without an override mechanism.", "Fixed limits vs limits tied to mode: fixed limits are easy to review; mode-aware limits catch more and need reliable mode detection."],
    p: ["A limit without hysteresis flaps around its threshold and floods the console.", "Rules keep firing on an asset that is deliberately offline for maintenance."],
    v: "Drive a test signal across a limit with noise, and confirm one alert is raised after the hold time, no repeats during chatter, and one return to normal with the correct duration.",
    dep: ["stream-processing-engine", "asset-type-library", "quality-flags"]
  },
  "statistical-detectors": {
    s: "Single-signal detectors that flag unusual values, shifts or trends using statistics such as control charts, change-point tests and seasonal decomposition.",
    d: "Each detector watches one series and compares it with an expected distribution after removing trend and seasonality. Control charts flag points outside bands, change-point tests flag a shift in mean or variance, and slope tests flag steady drift. They are cheap, run on the stream or in batch, and need little data. The difficulty is assumptions: real signals are autocorrelated, non-normal and multi-modal, so default tests give many false alarms or miss slow drifts.",
    k: ["Streaming detectors vs batch detectors: streaming gives low latency and small state but fewer tests; batch can use the full window, with delay.", "Sensitive vs conservative settings: sensitive catches early drift but multiplies alerts across thousands of signals; conservative keeps trust and finds problems later."],
    p: ["Assuming independent normal noise on a smooth signal produces constant false alarms.", "Seasonality is ignored, so every Monday morning looks anomalous."],
    v: "Run the detector on a recorded series with a known step change and a known slow drift and confirm the detection delay for each is within the documented figures, with the false alarm rate on clean data below target.",
    dep: ["baseline-modeling", "time-series-store", "stream-processing-engine"]
  },
  "multivariate-detectors": {
    s: "Learned models that watch many signals together and flag unusual combinations, catching faults that leave every single signal within its own limits.",
    d: "Techniques such as latent-space reconstruction, nearest-neighbor distance, isolation methods or sequence models learn the joint pattern of healthy operation per mode. A large reconstruction or distance error marks a departure, and contribution analysis points to the signals that changed most. Models are trained offline on clean history and deployed to score windows. The hard part is explanation and drift: a score alone does not tell an operator what is wrong, and the model's idea of normal ages with the asset.",
    k: ["Unsupervised on healthy data vs supervised on labeled faults: unsupervised needs no labels and finds novel faults; supervised names faults but only those it has seen.", "One model per asset vs one per type: per-asset is accurate and costly to maintain; per-type is cheap and averages away differences."],
    p: ["A high score arrives with no indication of which signals caused it, so nobody acts on it.", "Retraining after maintenance without a clean-data check teaches the model a degraded state."],
    v: "Replay history that contains a labeled fault whose signals stayed individually inside their limits and confirm the score crosses the alert level before the failure, with the right signals ranked first by contribution.",
    dep: ["baseline-modeling", "ml-training-pipeline", "operating-mode-detection", "quality-flags"]
  },
  "model-residual-detection": {
    s: "Compares what the simulation or reference model predicts with what sensors report and flags persistent differences, linking anomalies to physical meaning.",
    d: "The twin runs a physics or reduced-order model alongside the asset using the same inputs, computes residuals between predicted and measured outputs, and tests whether residuals are larger than the combined model and sensor uncertainty. The pattern of residuals across signals points to candidate causes, such as fouling or a stuck valve. It is the most physically explainable detector. The difficulty is separating a real fault from model error, because an uncalibrated model produces residuals everywhere.",
    k: ["Residual from a physics model vs from a learned model: physics residuals have causes attached but need an accurate model; learned residuals are easier to build and offer weaker explanations.", "Fixed residual thresholds vs uncertainty-scaled thresholds: scaling by uncertainty avoids false alarms where the model is weak but requires uncertainty estimates."],
    p: ["An uncalibrated model flags healthy assets as faulty from the first day.", "A sensor fault produces the same residual pattern as a process fault, and the wrong item is repaired."],
    v: "Inject a known fouling level into the simulation inputs of a test asset and confirm residuals appear in the predicted signals, then confirm a healthy asset after calibration shows residuals inside the stated band.",
    dep: ["physics-based-models", "model-calibration", "twin-divergence-detection", "uncertainty-quantification"]
  },
  "alert-correlation": {
    s: "Groups related alerts using the asset graph, timing and causality so one underlying problem becomes one incident with a probable first cause.",
    d: "Alerts are linked when they occur close in time on assets that are connected, such as upstream and downstream equipment or the same system, using the relationship graph and learned co-occurrence. The result is an incident with a ranked root candidate, the earliest and most upstream alert. Suppression rules hide expected consequences of a known state, such as a stopped pump. The hard part is being right about causality: grouping unrelated faults hides one, and missing a link floods operators.",
    k: ["Graph-based grouping vs statistical co-occurrence: graph-based is explainable but depends on a correct model; statistical needs no model and can group coincidences.", "Suppress downstream alerts vs show them collapsed: suppression is quiet and risks hiding an independent fault; collapsing keeps access at the cost of clutter."],
    p: ["Two unrelated faults in the same area are merged and one is never investigated.", "A missing relationship in the model means a cascade appears as unrelated alerts."],
    v: "Replay a recorded cascade and confirm it forms one incident naming the true initiating asset, then replay two independent faults a minute apart in one area and confirm they stay separate.",
    dep: ["relationship-graph", "event-and-alarm-log", "rule-and-threshold-alerts", "multivariate-detectors"]
  },
  "anomaly-feedback-loop": {
    s: "Captures what people decided about each alert, such as real fault, nuisance or expected, and uses it to tune detectors and measure their usefulness over time.",
    d: "Every alert can be dispositioned by an operator or technician, with a cause and a note, and work order outcomes add confirmed failures. These labels feed precision and recall tracking per detector, automatic threshold suggestions, suppression of repeat nuisance alerts and training sets for supervised models. The hard part is getting labels: people are busy, labels are inconsistent, and a detector tuned only on alerts that were reviewed never learns about faults it missed.",
    k: ["Mandatory disposition vs optional: mandatory yields data but encourages careless clicks; optional is quieter and biased toward the interesting cases.", "Automatic retuning vs proposed changes: automatic adapts quickly but can drift into silence; proposals keep an engineer in the loop and move slowly."],
    p: ["Detectors are tuned to suppress alerts nobody had time to review, hiding real faults.", "Labels are recorded against the wrong asset or time and poison later training."],
    v: "Disposition fifty alerts from a test period, confirm per-detector precision is computed from them, and confirm a proposed threshold change shows its expected effect on the labeled history before approval.",
    dep: ["work-order-integration", "event-and-alarm-log", "alert-correlation"]
  },
  "health-indicators": {
    s: "Features computed from raw signals that track an asset's condition, such as vibration level, efficiency, wear index or insulation resistance, trended over time.",
    d: "Indicators are engineered from signals and context: spectral bands from vibration, ratios of output to input, cycle counts, temperatures corrected for load. Each is computed per operating mode, smoothed, stored as its own series and compared with history and peers. Good ones move monotonically as damage grows. The difficulty is that most signals respond to operating conditions more than to health, so an indicator must be normalized, and a bad one adds noise that predictions then amplify.",
    k: ["Hand-crafted physical indicators vs learned features: physical indicators are explainable and need domain input; learned features can find subtler patterns and are harder to trust.", "Computed at the edge vs in the platform: edge computing saves bandwidth for high-rate signals but fixes the algorithm in the field."],
    p: ["An indicator that mostly tracks load looks like degradation each time production rises.", "Raw high-rate data is discarded at the edge before the indicator can be redefined."],
    v: "Plot an indicator across a run-to-failure dataset and confirm it trends monotonically toward failure after normalizing for load, with a documented correlation to the recorded wear measure.",
    dep: ["operating-mode-detection", "time-series-store", "quality-flags", "edge-gateway"]
  },
  "failure-mode-library": {
    s: "A catalog of how each asset type fails, with causes, observable symptoms, detection methods and recommended actions, used to explain alerts and plan maintenance.",
    d: "Entries follow failure modes and effects analysis: the mode, its mechanism, which signals or indicators reveal it, severity, likelihood and typical remedy. The library is linked to asset types, so a new pump inherits the pump failure modes. Detection results and predictions point to entries, and technician feedback refines them. The hard part is curation: knowledge starts in experts' heads and old reports, and an unmaintained library misleads confidently.",
    k: ["Expert-authored vs mined from work orders: expert entries are precise and slow to build; mining is broad but inherits poor free-text records.", "Per-type library vs per-asset overrides: per-type is consistent and scalable, while overrides capture unusual conditions at the cost of maintenance."],
    p: ["Entries never updated after a design change describe a failure the new part cannot have.", "Symptoms linked to the wrong signal name make guidance point the technician at the wrong sensor."],
    v: "Pick three recorded failures from work orders and confirm each maps to a library entry whose listed symptoms match what the history showed, and that unmapped failures create a review task.",
    dep: ["asset-type-library", "document-and-thread-links", "anomaly-feedback-loop"]
  },
  "degradation-models": {
    s: "Models that describe how an indicator worsens over time under given loads, from physical wear laws to statistical growth curves, used to project the future condition.",
    d: "A degradation model relates damage growth to usage and stress: cycles, temperature, load, contamination. Physics-based models use known wear or fatigue laws with fitted constants; statistical models fit growth curves or stochastic processes to indicator histories across a fleet. Parameters are estimated and updated with each new reading, with uncertainty. The hard part is data: few assets run to failure, since maintenance intervenes, so models learn mostly from censored histories.",
    k: ["Physics-informed models vs purely statistical models: physics-informed extrapolate sensibly and need material knowledge; statistical fit data well and extrapolate poorly beyond it.", "Per-asset updating vs fleet-level parameters: per-asset adapts to individual use but is noisy early; fleet-level is stable and misses outliers."],
    p: ["Treating maintained assets as survivors without accounting for the repair biases the model toward long life.", "Fitting to a short, noisy window gives wildly different projections each day."],
    v: "Fit the model to the first half of a run-to-failure record and confirm it predicts the second half's indicator values within the stated interval, and that the interval narrows as data accumulates.",
    dep: ["health-indicators", "failure-mode-library", "model-calibration"]
  },
  "remaining-useful-life": {
    s: "Estimates how long an asset can keep operating before it reaches a failure threshold, expressed as a distribution rather than a single date.",
    d: "Given the current indicator state and a degradation model, the estimator projects forward under expected usage to the threshold, producing a time with confidence bounds that narrow as failure approaches. Usage scenarios, such as heavier load, shift the estimate. Outputs feed scheduling and are stored with the model version and inputs. The hard part is calibration: an estimate that says 30 days must be right about as often as it claims, and false precision makes planners trust numbers the model cannot support.",
    k: ["Distribution output vs single number: a distribution supports risk-based planning but is harder to read; a single number is simple and hides how uncertain it is.", "Fixed failure threshold vs cost-based threshold: a fixed threshold is easy to explain; cost-based reflects consequences and depends on cost data."],
    p: ["Estimates that are consistently optimistic cause failures just before planned work.", "The estimate jumps after each noisy reading and planners stop reading it."],
    v: "Compare predicted and actual remaining life across historical failures at several lead times, and confirm that the stated 80 percent interval contains the true value in about 80 percent of cases.",
    dep: ["degradation-models", "health-indicators", "uncertainty-quantification"]
  },
  "maintenance-scheduling": {
    s: "Chooses when to service each asset from predicted condition, risk, spare parts, crews and production windows, trading cost of early action against cost of failure.",
    d: "The scheduler takes remaining-life distributions, consequence of failure, planned outage windows, labor and parts availability, and searches for a plan minimizing expected total cost under constraints. It groups jobs on the same equipment, and re-plans when predictions change. It hands approved tasks to the work order system. The hard part is combining uncertain predictions with real operational constraints, and explaining why a job moved so planners accept the plan.",
    k: ["Optimized global plan vs priority-ranked list: optimization saves cost across many assets but is opaque; a ranked list is transparent and leaves savings unrealized.", "Frequent re-planning vs frozen window: frequent re-planning follows new data; a frozen window gives crews stable schedules."],
    p: ["Plans change daily as predictions wobble, and crews stop trusting any schedule.", "Plans ignore spare parts lead times, so work is scheduled when nothing is available."],
    v: "Feed a scenario with two urgent and several routine jobs and confirm the plan respects crew and outage constraints, groups work by asset, and gives a stated reason for each placement.",
    dep: ["remaining-useful-life", "work-order-integration", "uncertainty-quantification"]
  },
  "ml-training-pipeline": {
    s: "Builds, validates and packages learned models from twin history: assembling datasets, splitting by time, training, evaluating and producing a versioned artifact.",
    d: "The pipeline selects assets and periods from history, filters by quality and mode, joins labels from work orders and dispositions, and builds feature sets reproducibly. Splits are by time and by asset to avoid leakage. Results are evaluated against baselines and stored with data version, code and metrics. Training runs on batch compute and publishes to a registry. The difficulty is leakage and labels: future information sneaks into features, and failures are rare.",
    k: ["Time-based splits vs random splits: time-based gives honest estimates of future performance with less training data; random splits flatter the model.", "Fleet-wide model vs asset-specific fine-tuning: fleet-wide gets more data per model; fine-tuning improves fit and multiplies the models to maintain."],
    p: ["A feature computed after the failure leaks the answer, and the model fails in production.", "Training sets drawn only from assets that failed overstate how likely failure is."],
    v: "Rebuild a published model from its recorded data version and code and confirm it reproduces the stored metrics, then evaluate on a later period never seen in training.",
    dep: ["historical-query-engine", "quality-flags", "anomaly-feedback-loop", "data-lineage-and-provenance"]
  },
  "model-drift-monitoring": {
    s: "Watches deployed analytics for loss of accuracy as inputs, assets or operating practice change, and triggers review or retraining before the models mislead.",
    d: "The monitor compares live input distributions with the training data, tracks prediction error where outcomes become known, and counts alerts per detector over time. Large shifts raise a drift alert linked to the model version and asset set. It also detects silent causes, such as a recalibrated sensor or a new operating mode. The hard part is that ground truth arrives late or never, so drift is mostly judged from inputs and indirect signals.",
    k: ["Input drift checks vs outcome accuracy checks: input checks work immediately but flag harmless changes; outcome checks are truthful and arrive months late.", "Automatic retraining vs human-approved: automatic keeps up with change but can learn a fault; approval is safer and slower."],
    p: ["A recalibrated sensor shifts every input and is mistaken for the asset degrading.", "Drift alerts go to a team that no longer owns the model."],
    v: "Shift one input by a known offset in a test feed and confirm a drift alert names that signal within the stated time, and that the affected model's version and owner are listed in the alert.",
    dep: ["ml-training-pipeline", "calibration-drift-tracking", "platform-observability"]
  },
});
