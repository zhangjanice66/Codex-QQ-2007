import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { earlyPayloadFor, VERIFY_REMOVED_EXPRESSION } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const source = await fs.readFile(injectorPath, "utf8");
assert.match(source, /cssTemplate\.replaceAll\(\s*"__DREAM_SKIN_ICON_SPRITE__"/,
  "Every CSS sprite reference, including the native-view recovery button, must be embedded.");

function createFixture() {
  const observers = [];
  const timers = new Map();
  let nextTimer = 1;
  const markers = { shell: false, sidebar: false };
  const context = {
    window: { installs: [] },
    document: {
      documentElement: {},
      querySelector(selector) {
        if (selector === "main.main-surface") return markers.shell ? {} : null;
        if (selector === "aside.app-shell-left-panel") return markers.sidebar ? {} : null;
        return null;
      },
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.connected = true;
        observers.push(this);
      }
      observe() {}
      disconnect() { this.connected = false; }
    },
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  return { context, markers, observers };
}

const guarded = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("guarded")', "guarded"), guarded.context);
assert.deepEqual(guarded.context.window.installs, [], "Auxiliary app targets must remain untouched.");
guarded.markers.shell = true;
guarded.observers[0].callback([]);
assert.deepEqual(guarded.context.window.installs, [], "A main surface without the Codex sidebar is not sufficient.");

const generations = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("old")', "old"), generations.context);
vm.runInNewContext(earlyPayloadFor('window.installs.push("new")', "new"), generations.context);
generations.markers.shell = true;
generations.markers.sidebar = true;
for (const observer of generations.observers) observer.callback([]);
assert.deepEqual(
  generations.context.window.installs,
  ["new"],
  "A stale early script must yield to the newest watcher generation.",
);
assert.equal(generations.context.window.__CODEX_DREAM_SKIN_EARLY_APPLIED__, "new");

const discoveryStart = source.indexOf("record.earlyScriptId = await registerEarly");
const probeStart = source.indexOf("const probe = await waitForCodexProbe", discoveryStart);
assert.ok(discoveryStart >= 0 && probeStart > discoveryStart, "Early registration must happen before full shell probing.");
assert.match(
  source,
  /finally\s*\{[\s\S]*Promise\.all\(\[\.\.\.sessions\.values\(\)\][\s\S]*removeEarly\(record\)/,
  "Watcher shutdown must unregister persistent Page scripts before closing CDP sessions.",
);
assert.match(
  source,
  /const earlyApplied = await session\.evaluate\([\s\S]*if \(!earlyApplied\) \{[\s\S]*applyToSession/,
  "The watcher must not run the full payload twice after a successful early install.",
);
assert.match(source, /friendScroll:[\s\S]*overflowY:/,
  "Live verification must inspect the friend panel's independent scroll region.");
assert.match(source, /const bitmapIconCount = bitmapIconStyles\.length;/,
  "Live verification must count the complete QQ2007 bitmap sprite roles.");
assert.match(source, /expectedBitmapIconRoles[\s\S]{0,1500}backgroundPosition[\s\S]{0,900}cellSize/,
  "Live verification must check each bitmap role's sprite cell, dimensions, and scaled position.");
assert.match(source, /const visualMaterialPass = [\s\S]{0,900}panelMaterials\.every/,
  "Live verification must inspect the shared QQ2007 panel materials.");
assert.match(source, /result\.visualPass = bitmapIconPass && visualMaterialPass;/,
  "Bitmap and material checks must participate in the live pass result.");
assert.match(source, /conversationLegibilityPass[\s\S]{0,900}conversationPass/,
  "Live verification must reject unreadable reasoning, activity, tool-status, and timestamp text.");
assert.match(source, /sidebarResizeHandle:[\s\S]{0,240}pointerEvents:/,
  "Live verification must report whether the fixed QQ2007 sidebar handle can receive pointer input.");
assert.match(source, /const sidebarPass = [\s\S]{0,260}result\.sidebarResizeHandle\.pointerEvents === 'none'[\s\S]{0,1400}result\.sidebarPass = sidebarPass/,
  "Live verification must reject an interactive drag-to-collapse handle on the fixed QQ2007 sidebar.");
assert.match(source, /name === "dream-skin\.css" \|\| name === "renderer-inject\.js" \|\| name === "qq2007-icons\.png"/,
  "The live watcher must invalidate its static payload cache when the bitmap sprite changes.");
assert.match(source, /friendSearch:[\s\S]*friendPet:[\s\S]*friendQqShow:/,
  "Live verification must inspect the fixed search row and clipped media regions.");
assert.match(source, /result\.friendPass = friendPass;/,
  "Live verification must expose the Issue 6 friend-panel verdict.");
assert.match(source, /const friendPass = !qq2007Mode \|\| Boolean\(/,
  "Friend verification must return a boolean and remain neutral in classic mode.");
assert.match(source, /bodyGridColumns:\s*getComputedStyle\(document\.body\)\.gridTemplateColumns/,
  "Live verification must capture the computed workspace grid.");
assert.match(source, /rightColumnWidth[\s\S]{0,120}bodyGridColumns/,
  "Live verification must measure the persistent right recovery column.");
assert.match(source, /friendRail:[\s\S]{0,220}nativeTab:[\s\S]{0,220}friendTab:/,
  "Live verification must inspect the persistent right rail and both recovery actions.");
assert.match(source, /nativeRightGridPass[\s\S]{0,260}Math\.abs\([^\n]+- 28\) <= 1/,
  "Live verification must require the agreed 28px recovery rail while a native panel is active.");
assert.match(source, /nativeRightOpen[\s\S]{0,500}rightRailPass[\s\S]{0,500}friendPass/,
  "A native panel may replace the friend content only when the right recovery rail remains usable.");
assert.match(source, /preset-codex-1907-deep", "assistant\.png"[\s\S]*preset-codex-1907-deep", "qq-show\.png"/,
  "Deep themes without optional decorations must receive bundled assistant and QQ show defaults.");
assert.match(source, /const decorationAssets = theme\.mode === "deep"[\s\S]{0,120}\.{3}staticAssets\.defaultDecorationAssets, \.{3}themeDecorationAssets/,
  "Explicit deep-theme decorations must override bundled defaults.");

function createRestoreFixture({
  rootClass = false, attribute = null, variable = null, styleNode = false, marker = false,
  state = false, disabled = false, analysisCache = false,
} = {}) {
  const attributes = attribute ? [{ name: attribute }] : [];
  const style = variable ? [variable] : [];
  const window = {};
  if (state) window.__CODEX_DREAM_SKIN_STATE__ = {};
  if (disabled) window.__CODEX_DREAM_SKIN_DISABLED__ = false;
  if (analysisCache) window.__CODEX_DREAM_SKIN_ANALYSIS_CACHE__ = new Map();
  return {
    window,
    document: {
      documentElement: {
        attributes,
        style,
        classList: { contains(name) { return name === "codex-dream-skin" && rootClass; } },
      },
      getElementById(id) { return styleNode && id === "codex-dream-skin-style" ? {} : null; },
      querySelector() { return marker ? {} : null; },
    },
  };
}

assert.equal(vm.runInNewContext(VERIFY_REMOVED_EXPRESSION, createRestoreFixture()), true);
for (const residue of [
  { rootClass: true },
  { attribute: "data-dream-shell" },
  { attribute: "data-ds2007-section" },
  { variable: "--ds-bg" },
  { variable: "--dream-skin-art" },
  { styleNode: true },
  { marker: true },
  { state: true },
  { disabled: true },
  { analysisCache: true },
]) {
  assert.equal(vm.runInNewContext(VERIFY_REMOVED_EXPRESSION, createRestoreFixture(residue)), false,
    `Restore verification must reject residue: ${JSON.stringify(residue)}`);
}

console.log("PASS: early injection is shell-guarded, generation-safe, and strict restore verification rejects residue.");
