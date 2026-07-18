export const CODEX_2007_ACCEPTANCE_PLAN = Object.freeze({
  schemaVersion: 1,
  routes: ["home", "project", "task", "native-right"],
  modes: ["deep", "native"],
  viewports: [
    { id: "100", scalePercent: 100 },
    { id: "125", scalePercent: 125 },
    { id: "150", scalePercent: 150 },
    { id: "compact-height", scalePercent: 100, height: 520 },
  ],
  requiredEvidence: [
    "deep-home", "deep-project", "deep-task", "deep-native-right", "native-task",
  ],
  releaseGates: [
    "quick-regression", "full-tests", "doctor", "live-matrix", "restore-reapply", "release-archive",
  ],
});
