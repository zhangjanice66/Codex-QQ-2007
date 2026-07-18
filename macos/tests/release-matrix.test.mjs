import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "codex-2007-acceptance.mjs");
const injectorSource = await fs.readFile(path.join(root, "scripts", "injector.mjs"), "utf8");
const verifySource = await fs.readFile(path.join(root, "scripts", "verify-dream-skin-macos.sh"), "utf8");
const planned = spawnSync(process.execPath, [script, "--plan"], { encoding: "utf8" });

assert.equal(planned.status, 0, planned.stderr || "Acceptance plan command must succeed.");
const plan = JSON.parse(planned.stdout);
assert.equal(plan.schemaVersion, 1);
assert.deepEqual(plan.routes, ["home", "project", "task", "native-right"]);
assert.deepEqual(plan.modes, ["deep", "native"]);
assert.deepEqual(plan.viewports.map((item) => item.id), ["100", "125", "150", "compact-height"]);
assert.deepEqual(plan.viewports.map((item) => item.scalePercent), [100, 125, 150, 100]);
assert.deepEqual(plan.requiredEvidence, [
  "deep-home", "deep-project", "deep-task", "deep-native-right", "native-task",
]);
assert.deepEqual(plan.releaseGates, [
  "quick-regression", "full-tests", "doctor", "live-matrix", "restore-reapply", "release-archive",
]);
assert.match(injectorSource, /--matrix-dir[\s\S]{0,500}--scenario[\s\S]{0,500}--sanitized/,
  "The live injector must expose responsive matrix capture through its public CLI.");
assert.match(injectorSource, /Emulation\.setDeviceMetricsOverride[\s\S]{0,1800}Emulation\.clearDeviceMetricsOverride/,
  "Responsive verification must restore CDP viewport emulation after every matrix run.");
assert.match(injectorSource, /codex-2007-acceptance-redaction[\s\S]{0,3000}Page\.captureScreenshot/,
  "Acceptance screenshots must apply and remove a dedicated private-content redaction layer.");
assert.match(injectorSource, /--lifecycle-smoke/,
  "The live injector must expose a restore/reapply lifecycle smoke through its public CLI.");
assert.match(injectorSource, /phases\.push\("removed-again"\)[\s\S]{0,1200}phases\.push\("applied-final"\)/,
  "The lifecycle smoke must prove a second cleanup and a final unique application.");
assert.match(verifySource, /--matrix-dir[\s\S]{0,700}--scenario[\s\S]{0,700}--lifecycle-smoke/,
  "The installed verify entrypoint must forward matrix and lifecycle acceptance modes.");

const evidenceDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-2007-matrix-test."));
const routeFor = (scenario) => scenario.slice(scenario.indexOf("-") + 1);
for (const scenario of plan.requiredEvidence) {
  for (const { id } of plan.viewports) {
    await fs.writeFile(path.join(evidenceDir, `${scenario}-${id}.png`), Buffer.from([137, 80, 78, 71]));
  }
  await fs.writeFile(path.join(evidenceDir, `${scenario}.json`), `${JSON.stringify({
    schemaVersion: 1,
    scenario,
    mode: scenario.startsWith("native-") ? "native" : "deep",
    route: routeFor(scenario),
    sanitized: true,
    cases: plan.viewports.map(({ id, scalePercent }) => ({
      id,
      scalePercent,
      screenshot: `${scenario}-${id}.png`,
      result: { pass: true, documentOverflow: { x: false, y: false } },
    })),
  }, null, 2)}\n`);
}
const lifecyclePath = path.join(evidenceDir, "restore-reapply.json");
await fs.writeFile(lifecyclePath, `${JSON.stringify({
  schemaVersion: 1,
  pass: true,
  nativeIdentityPass: true,
  phases: ["removed", "applied", "reapplied", "removed-again", "applied-final"],
})}\n`);
const reportPath = path.join(evidenceDir, "acceptance-report.md");
const finalized = spawnSync(process.execPath, [
  script, "--finalize", "--evidence-dir", evidenceDir,
  "--lifecycle", lifecyclePath, "--output", reportPath,
], { encoding: "utf8" });
assert.equal(finalized.status, 0, finalized.stderr || "Complete evidence must finalize.");
const finalResult = JSON.parse(finalized.stdout);
assert.equal(finalResult.pass, true);
assert.equal(finalResult.scenarioCount, 5);
assert.equal(finalResult.viewportCaseCount, 20);
assert.match(await fs.readFile(reportPath, "utf8"), /5\/5 scenarios[\s\S]*20\/20 viewport cases[\s\S]*restore\/reapply: PASS/);
await fs.rm(evidenceDir, { recursive: true, force: true });

console.log("PASS: Codex 2007 acceptance plan covers routes, modes, responsive viewports, and release gates.");
