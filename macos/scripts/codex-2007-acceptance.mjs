#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { CODEX_2007_ACCEPTANCE_PLAN as PLAN } from "./codex-2007-acceptance-plan.mjs";

export { PLAN };

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--plan") return { mode: "plan" };
  const options = { mode: null, evidenceDir: null, lifecycle: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--finalize") options.mode = "finalize";
    else if (argument === "--evidence-dir" && argv[index + 1]) options.evidenceDir = path.resolve(argv[++index]);
    else if (argument === "--lifecycle" && argv[index + 1]) options.lifecycle = path.resolve(argv[++index]);
    else if (argument === "--output" && argv[index + 1]) options.output = path.resolve(argv[++index]);
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  if (options.mode !== "finalize" || !options.evidenceDir || !options.lifecycle || !options.output) {
    throw new Error("Usage: codex-2007-acceptance.mjs --plan | --finalize --evidence-dir DIR --lifecycle FILE --output FILE");
  }
  return options;
}

async function readJson(file, label) {
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`${label} is missing or invalid: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

async function finalize(options) {
  const cases = [];
  for (const scenario of PLAN.requiredEvidence) {
    const evidence = await readJson(path.join(options.evidenceDir, `${scenario}.json`), scenario);
    const expectedMode = scenario.startsWith("native-") ? "native" : "deep";
    const expectedRoute = scenario.slice(scenario.indexOf("-") + 1);
    if (evidence.schemaVersion !== PLAN.schemaVersion || evidence.scenario !== scenario ||
      evidence.mode !== expectedMode || evidence.route !== expectedRoute || evidence.sanitized !== true) {
      throw new Error(`${scenario} metadata does not match the required acceptance scenario`);
    }
    if (!Array.isArray(evidence.cases) ||
      JSON.stringify(evidence.cases.map((item) => item.id)) !== JSON.stringify(PLAN.viewports.map((item) => item.id))) {
      throw new Error(`${scenario} must contain the four responsive cases in plan order`);
    }
    for (const [index, item] of evidence.cases.entries()) {
      const expected = PLAN.viewports[index];
      const screenshot = path.join(options.evidenceDir, path.basename(String(item.screenshot || "")));
      const screenshotStat = await fs.stat(screenshot).catch(() => null);
      if (item.scalePercent !== expected.scalePercent || item.result?.pass !== true ||
        item.result?.documentOverflow?.x !== false || item.result?.documentOverflow?.y !== false ||
        !screenshotStat?.isFile() || screenshotStat.size < 1) {
        throw new Error(`${scenario}/${expected.id} did not pass or lacks a sanitized screenshot`);
      }
      cases.push({ scenario, ...item });
    }
  }
  const lifecycle = await readJson(options.lifecycle, "restore/reapply evidence");
  const expectedPhases = ["removed", "applied", "reapplied", "removed-again", "applied-final"];
  if (lifecycle.schemaVersion !== PLAN.schemaVersion || lifecycle.pass !== true ||
    lifecycle.nativeIdentityPass !== true || JSON.stringify(lifecycle.phases) !== JSON.stringify(expectedPhases)) {
    throw new Error("Restore/reapply evidence did not prove complete cleanup, identity preservation, and unique reapplication");
  }

  const report = [
    "# Codex 2007 acceptance matrix",
    "",
    "## Result",
    "",
    `- ${PLAN.requiredEvidence.length}/${PLAN.requiredEvidence.length} scenarios: PASS`,
    `- ${cases.length}/${cases.length} viewport cases: PASS`,
    "- restore/reapply: PASS",
    "- screenshots: sanitized local evidence",
    "",
    "## Scenarios",
    "",
    ...PLAN.requiredEvidence.map((scenario) => `- ${scenario}: 100%, 125%, 150%, compact-height`),
    "",
  ].join("\n");
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, report);
  return {
    pass: true,
    schemaVersion: PLAN.schemaVersion,
    scenarioCount: PLAN.requiredEvidence.length,
    viewportCaseCount: cases.length,
    lifecyclePass: true,
    report: options.output,
  };
}

const options = parseArgs(process.argv.slice(2));
if (options.mode === "plan") {
  process.stdout.write(`${JSON.stringify(PLAN, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(await finalize(options), null, 2)}\n`);
}
