import fs from "node:fs/promises";
import { constants as fsConstants, watch as watchFs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CODEX_2007_ACCEPTANCE_PLAN } from "./codex-2007-acceptance-plan.mjs";
import { readImageMetadata } from "./image-metadata.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const here = path.dirname(scriptPath);
const root = path.resolve(here, "..");
const SKIN_VERSION = "1.7.3";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const CDP_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
const MAX_ART_BYTES = 16 * 1024 * 1024;
let staticPayloadAssets = null;

function parseArgs(argv) {
  const options = {
    port: 9341,
    mode: "watch",
    timeoutMs: 30000,
    screenshot: null,
    matrixDir: null,
    scenario: null,
    sanitized: false,
    lifecycleOutput: null,
    reload: false,
    themeDir: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--check-payload") options.mode = "check";
    else if (arg === "--matrix-dir") { options.mode = "matrix"; options.matrixDir = path.resolve(argv[++i]); }
    else if (arg === "--scenario") options.scenario = argv[++i];
    else if (arg === "--sanitized") options.sanitized = true;
    else if (arg === "--lifecycle-smoke") options.mode = "lifecycle";
    else if (arg === "--lifecycle-output") options.lifecycleOutput = path.resolve(argv[++i]);
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--theme-dir") options.themeDir = path.resolve(argv[++i]);
    else if (arg === "--reload") options.reload = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 250 || options.timeoutMs > 120000) {
    throw new Error(`Invalid timeout: ${options.timeoutMs}`);
  }
  if (options.mode === "matrix" && (!options.matrixDir || !options.sanitized ||
    !CODEX_2007_ACCEPTANCE_PLAN.requiredEvidence.includes(options.scenario))) {
    throw new Error("Matrix capture requires --matrix-dir, a planned --scenario, and --sanitized");
  }
  if (options.mode !== "matrix" && (options.matrixDir || options.scenario || options.sanitized)) {
    throw new Error("Matrix arguments require --matrix-dir");
  }
  if (options.lifecycleOutput && options.mode !== "lifecycle") {
    throw new Error("--lifecycle-output requires --lifecycle-smoke");
  }
  return options;
}

function validatedDebuggerUrl(target, port) {
  const url = new URL(target.webSocketDebuggerUrl);
  const pathIsValid = /^\/devtools\/page\/[A-Za-z0-9._-]{1,200}$/.test(url.pathname);
  if (
    url.protocol !== "ws:" || !LOOPBACK_HOSTS.has(url.hostname) || Number(url.port) !== port
    || url.username || url.password || url.search || url.hash || !pathIsValid
  ) {
    throw new Error("Rejected a CDP WebSocket URL outside the allowed loopback page endpoint shape");
  }
  return url.href;
}

function isValidCdpPageTarget(item, port) {
  if (
    item?.type !== "page" || !item.url?.startsWith("app://")
    || typeof item.id !== "string" || !CDP_ID_PATTERN.test(item.id)
    || !item.webSocketDebuggerUrl
  ) return false;
  try {
    const debuggerUrl = new URL(validatedDebuggerUrl(item, port));
    return debuggerUrl.pathname === `/devtools/page/${item.id}`;
  } catch {
    return false;
  }
}

class CdpSession {
  constructor(target, port) {
    this.target = target;
    this.ws = new WebSocket(validatedDebuggerUrl(target, port));
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { this.ws.close(); } catch {}
        reject(new Error("CDP WebSocket open timed out"));
      }, 5000);
      this.ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP WebSocket open failed")); }, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("error", () => this.close());
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error("CDP socket closed"));
      }
      this.pending.clear();
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }

  onMessage(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      this.close();
      return;
    }
    if (!message || typeof message !== "object") {
      this.close();
      return;
    }
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timeout);
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) {
      try { listener(message.params ?? {}); } catch (error) {
        console.error(`[dream-skin] CDP listener failed: ${error.message}`);
      }
    }
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}, timeoutMs = 10000) {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Renderer evaluation failed: ${detail}`);
    }
    return result.result?.value;
  }

  close() {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("CDP session closed"));
    }
    this.pending.clear();
    if (!this.closed) {
      try { this.ws.close(); } catch {}
    }
    this.closed = true;
  }
}

async function listAppTargets(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const targets = await response.json();
    if (!Array.isArray(targets)) throw new Error("CDP target list was not an array");
    return targets.filter((item) => isValidCdpPageTarget(item, port));
  } finally {
    clearTimeout(timeout);
  }
}

async function probeSession(session) {
  return session.evaluate(`(() => {
    const markers = {
      shell: Boolean(document.querySelector('main.main-surface')),
      sidebar: Boolean(document.querySelector('aside.app-shell-left-panel')),
      composer: Boolean(document.querySelector('.composer-surface-chrome')),
      main: Boolean(document.querySelector('[role="main"]')),
    };
    return {
      title: document.title,
      href: location.href,
      markers,
      codex: markers.shell && markers.sidebar,
    };
  })()`);
}

async function waitForCodexProbe(session, timeoutMs = 1800) {
  const deadline = Date.now() + timeoutMs;
  let probe = null;
  while (Date.now() < deadline) {
    probe = await probeSession(session);
    if (probe?.codex) return probe;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return probe;
}

async function connectTarget(target, port) {
  return new CdpSession(target, port).open();
}

async function connectCodexTargets(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await listAppTargets(port);
      const connected = [];
      for (const target of targets) {
        let session;
        try {
          session = await connectTarget(target, port);
          const probe = await probeSession(session);
          if (probe?.codex) connected.push({ target, session, probe });
          else session.close();
        } catch (error) {
          session?.close();
          lastError = error;
        }
      }
      if (connected.length) return connected;
      lastError = new Error("No page matched the expected Codex shell markers");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`No verified Codex renderer on 127.0.0.1:${port}: ${lastError?.message ?? "timed out"}`);
}

function assertContainedPath(rootPath, candidatePath, label) {
  const relative = path.relative(rootPath, candidatePath);
  if (
    relative === ""
    || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  ) return;
  throw new Error(`${label} must stay inside its theme directory`);
}

async function loadTheme(themeDir) {
  const requestedRoot = themeDir ?? path.join(root, "assets");
  const configPath = path.join(requestedRoot, "theme.json");
  let assetsRoot;
  let canonicalConfigPath;
  try {
    [assetsRoot, canonicalConfigPath] = await Promise.all([
      fs.realpath(requestedRoot),
      fs.realpath(configPath),
    ]);
  } catch (error) {
    if (themeDir && error.code === "ENOENT") {
      throw new Error(`Explicit theme directory is missing theme.json: ${configPath}`);
    }
    throw error;
  }
  assertContainedPath(assetsRoot, canonicalConfigPath, "Theme config");
  let config;
  try {
    config = await fs.readFile(canonicalConfigPath, "utf8");
  } catch (error) {
    if (themeDir && error.code === "ENOENT") {
      throw new Error(`Explicit theme directory is missing theme.json: ${configPath}`);
    }
    throw error;
  }
  const raw = JSON.parse(config);
  if (raw.schemaVersion !== 1 || typeof raw.image !== "string" || !raw.image) {
    throw new Error(`${configPath} has an unsupported schema or image field`);
  }
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(raw.image)) {
    throw new Error(`${configPath} has an invalid image field`);
  }
  if (path.basename(raw.image) !== raw.image) throw new Error("Theme image must stay inside its theme directory");
  const text = (value, fallback, max, name) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) {
      throw new Error(`${configPath} has an invalid ${name} field`);
    }
    return value.trim() ? Array.from(value.trim()).slice(0, max).join("") : fallback;
  };
  const color = (value, fallback) => {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    return /^#[0-9a-f]{6}$/i.test(normalized) || /^rgba?\([0-9., %]+\)$/i.test(normalized)
      ? normalized
      : fallback;
  };
  const choice = (value, name, choices) => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !choices.includes(value)) {
      throw new Error(`${configPath} has an invalid ${name} field`);
    }
    return value;
  };
  const unit = (value, name) => {
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${configPath} has an invalid ${name} field`);
    }
    return value;
  };
  const rawColors = raw.colors && typeof raw.colors === "object" && !Array.isArray(raw.colors)
    ? raw.colors : null;
  const colorKeys = [
    "background", "panel", "panelAlt", "accent", "accentAlt", "secondary",
    "highlight", "text", "muted", "line",
  ];
  const appearance = choice(raw.appearance, "appearance", ["auto", "light", "dark"]);
  const mode = choice(raw.mode, "mode", ["classic", "deep"]);
  if (raw.art !== undefined && (!raw.art || typeof raw.art !== "object" || Array.isArray(raw.art))) {
    throw new Error(`${configPath} has an invalid art field`);
  }
  const rawArt = raw.art || {};
  const art = {
    focusX: unit(rawArt.focusX, "art.focusX"),
    focusY: unit(rawArt.focusY, "art.focusY"),
    safeArea: choice(rawArt.safeArea, "art.safeArea", ["auto", "left", "right", "center", "none"]),
    taskMode: choice(rawArt.taskMode, "art.taskMode", ["auto", "ambient", "banner", "off"]),
  };
  if (raw.profile !== undefined && (!raw.profile || typeof raw.profile !== "object" || Array.isArray(raw.profile))) {
    throw new Error(`${configPath} has an invalid profile field`);
  }
  const rawProfile = raw.profile || {};
  const status = choice(rawProfile.status, "profile.status", ["online", "busy", "offline"]);
  const profile = {
    nickname: text(rawProfile.nickname, "张奈斯", 40, "profile.nickname"),
    signature: text(rawProfile.signature, "别迷恋姐，姐只是个传说。", 120, "profile.signature"),
    level: text(rawProfile.level, "LV07", 16, "profile.level"),
    status: status || "online",
  };
  if (raw.decorations !== undefined && (!raw.decorations || typeof raw.decorations !== "object" || Array.isArray(raw.decorations))) {
    throw new Error(`${configPath} has an invalid decorations field`);
  }
  const decorations = {};
  for (const [key, value] of Object.entries(raw.decorations || {})) {
    if (!['qqShow', 'assistant'].includes(key)) continue;
    if (
      typeof value !== "string" || !value || path.basename(value) !== value
      || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)
    ) {
      throw new Error(`${configPath} has an invalid decorations.${key} field`);
    }
    decorations[key] = value;
  }
  const theme = {
    schemaVersion: 1,
    id: text(raw.id, "custom", 80, "id"),
    name: text(raw.name, "Codex Dream Skin", 80, "name"),
    brandSubtitle: text(raw.brandSubtitle, "CODEX DREAM SKIN", 80, "brandSubtitle"),
    tagline: text(raw.tagline, "Make something wonderful.", 160, "tagline"),
    projectPrefix: text(raw.projectPrefix, "选择项目 · ", 80, "projectPrefix"),
    projectLabel: text(raw.projectLabel, "◉  选择项目", 80, "projectLabel"),
    statusText: text(raw.statusText, "DREAM SKIN ONLINE", 80, "statusText"),
    quote: text(raw.quote, "MAKE SOMETHING WONDERFUL", 80, "quote"),
    image: raw.image,
    mode: mode || "classic",
    profile,
    decorations,
    colorMode: rawColors ? "explicit" : "auto",
    explicitColorKeys: rawColors ? colorKeys.filter((key) => Object.hasOwn(rawColors, key)) : [],
    colors: {
      background: color(rawColors?.background, "#071116"),
      panel: color(rawColors?.panel, "#0b1a20"),
      panelAlt: color(rawColors?.panelAlt, "#10272c"),
      accent: color(rawColors?.accent, "#7cff46"),
      accentAlt: color(rawColors?.accentAlt, "#b8ff3d"),
      secondary: color(rawColors?.secondary, "#36d7e8"),
      highlight: color(rawColors?.highlight, "#642a8c"),
      text: color(rawColors?.text, "#e9fff1"),
      muted: color(rawColors?.muted, "#9ebdb3"),
      line: color(rawColors?.line, "rgba(124, 255, 70, .28)"),
    },
  };
  if (appearance !== undefined) theme.appearance = appearance;
  if (Object.values(art).some((value) => value !== undefined)) {
    theme.art = Object.fromEntries(Object.entries(art).filter(([, value]) => value !== undefined));
  }
  const requestedImagePath = path.join(assetsRoot, theme.image);
  let imagePath;
  try {
    imagePath = await fs.realpath(requestedImagePath);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Theme image is missing: ${requestedImagePath}`);
    throw error;
  }
  assertContainedPath(assetsRoot, imagePath, "Theme image");
  const imageStat = await fs.stat(imagePath);
  const extension = path.extname(theme.image).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    throw new Error(`Unsupported theme image format: ${extension || "missing"}`);
  }
  let imageHandle;
  try {
    imageHandle = await fs.open(imagePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error.code === "ELOOP") throw new Error("Theme image changed into a symbolic link while loading");
    throw error;
  }
  try {
    const openedStat = await imageHandle.stat();
    if (
      !imageStat.isFile()
      || !openedStat.isFile()
      || imageStat.dev !== openedStat.dev
      || imageStat.ino !== openedStat.ino
      || openedStat.size < 1
      || openedStat.size > MAX_ART_BYTES
    ) {
      throw new Error(`Theme image must be a stable non-empty file no larger than ${MAX_ART_BYTES} bytes`);
    }
    const art = await imageHandle.readFile();
    if (art.length < 1 || art.length > MAX_ART_BYTES) {
      throw new Error(`Theme image must be a non-empty file no larger than ${MAX_ART_BYTES} bytes`);
    }
    const decorationAssets = {};
    for (const [key, fileName] of Object.entries(decorations)) {
      const requestedPath = path.join(assetsRoot, fileName);
      const assetPath = await fs.realpath(requestedPath).catch((error) => {
        if (error.code === "ENOENT") throw new Error(`Theme decoration is missing: ${requestedPath}`);
        throw error;
      });
      assertContainedPath(assetsRoot, assetPath, `Theme decoration ${key}`);
      const assetExtension = path.extname(fileName).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp"].includes(assetExtension)) {
        throw new Error(`Unsupported theme decoration format: ${assetExtension || "missing"}`);
      }
      const assetStat = await fs.stat(assetPath);
      const handle = await fs.open(assetPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
      try {
        const openedStat = await handle.stat();
        if (
          !assetStat.isFile() || !openedStat.isFile()
          || assetStat.dev !== openedStat.dev || assetStat.ino !== openedStat.ino
          || openedStat.size < 1 || openedStat.size > MAX_ART_BYTES
        ) throw new Error(`Theme decoration ${key} must be a stable non-empty file no larger than ${MAX_ART_BYTES} bytes`);
        const bytes = await handle.readFile();
        decorationAssets[key] = { bytes, extension: assetExtension };
      } finally {
        await handle.close();
      }
    }
    return { art, assetsRoot, extension, imagePath, theme, decorationAssets };
  } finally {
    await imageHandle.close();
  }
}

async function loadStaticPayloadAssets() {
  const cacheHit = Boolean(staticPayloadAssets);
  if (!staticPayloadAssets) {
    staticPayloadAssets = Promise.all([
      fs.readFile(path.join(root, "assets", "dream-skin.css"), "utf8"),
      fs.readFile(path.join(root, "assets", "renderer-inject.js"), "utf8"),
      fs.readFile(path.join(root, "assets", "qq2007-icons.png")),
      fs.readFile(path.join(root, "presets", "preset-codex-1907-deep", "assistant.png")),
      fs.readFile(path.join(root, "presets", "preset-codex-1907-deep", "qq-show.png")),
    ]).catch((error) => {
      staticPayloadAssets = null;
      throw error;
    });
  }
  const [cssTemplate, template, iconSprite, assistant, qqShow] = await staticPayloadAssets;
  const iconMetadata = readImageMetadata(iconSprite, ".png");
  if (iconMetadata?.width !== 336 || iconMetadata?.height !== 24) {
    throw new Error("QQ2007 icon sprite must contain fourteen 24px bitmap cells");
  }
  const css = cssTemplate.replaceAll(
    "__DREAM_SKIN_ICON_SPRITE__",
    `data:image/png;base64,${iconSprite.toString("base64")}`,
  );
  return {
    css,
    template,
    iconSpriteBytes: iconSprite.length,
    cacheHit,
    defaultDecorationAssets: {
      assistant: { bytes: assistant, extension: ".png" },
      qqShow: { bytes: qqShow, extension: ".png" },
    },
  };
}

function invalidateStaticPayloadAssets() {
  staticPayloadAssets = null;
}

async function loadPayload(themeDir) {
  const startedAt = performance.now();
  const [staticAssets, loaded] = await Promise.all([
    loadStaticPayloadAssets(),
    loadTheme(themeDir),
  ]);
  const { css, template } = staticAssets;
  const { art, extension, theme, decorationAssets: themeDecorationAssets } = loaded;
  const decorationAssets = theme.mode === "deep"
    ? { ...staticAssets.defaultDecorationAssets, ...themeDecorationAssets }
    : themeDecorationAssets;
  const styleRevision = createHash("sha256").update(css).digest("hex").slice(0, 20);
  const artMetadata = readImageMetadata(art, extension);
  if (!artMetadata) {
    throw new Error("Theme image metadata is invalid or exceeds the 16384px / 50MP safety limit");
  }
  const artKey = createHash("sha256").update(art).digest("hex").slice(0, 20);
  theme.artMetadata = artMetadata;
  theme.artKey = artKey;
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
    : extension === ".webp" ? "image/webp" : "image/png";
  const artDataUrl = `data:${mime};base64,${art.toString("base64")}`;
  const decorationMime = (assetExtension) => assetExtension === ".jpg" || assetExtension === ".jpeg"
    ? "image/jpeg" : assetExtension === ".webp" ? "image/webp" : "image/png";
  theme.decorationData = Object.fromEntries(Object.entries(decorationAssets).map(([key, asset]) => [
    key,
    `data:${decorationMime(asset.extension)};base64,${asset.bytes.toString("base64")}`,
  ]));
  for (const [key, asset] of Object.entries(decorationAssets)) {
    if (!readImageMetadata(asset.bytes, asset.extension)) {
      throw new Error(`Theme decoration ${key} metadata is invalid or exceeds the 16384px / 50MP safety limit`);
    }
  }
  const payload = template
    .replace("__DREAM_SKIN_CSS_JSON__", JSON.stringify(css))
    .replace("__DREAM_SKIN_ART_JSON__", JSON.stringify(artDataUrl))
    .replace("__DREAM_SKIN_THEME_JSON__", JSON.stringify(theme))
    .replace("__DREAM_SKIN_VERSION_JSON__", JSON.stringify(SKIN_VERSION))
    .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", JSON.stringify(styleRevision));
  const revision = createHash("sha256")
    .update(SKIN_VERSION)
    .update(css)
    .update(template)
    .update(JSON.stringify(theme))
    .digest("hex")
    .slice(0, 20);
  return {
    imageBytes: art.length,
    iconSpriteBytes: staticAssets.iconSpriteBytes,
    payload,
    revision,
    theme,
    timings: {
      buildMs: Number((performance.now() - startedAt).toFixed(3)),
      staticCacheHit: staticAssets.cacheHit,
    },
  };
}

async function applyToSession(session, payload) {
  return session.evaluate(payload);
}

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    if (state?.cleanup) return state.cleanup();
    const root = document.documentElement;
    root?.classList.remove('codex-dream-skin');
    for (const attribute of [...(root?.attributes || [])]) {
      if (/^data-(dream|ds1907|ds2007)(-|$)/.test(attribute.name)) root.removeAttribute(attribute.name);
    }
    for (const property of [...(root?.style || [])]) {
      if (/^--(dream|ds-|ds1907-)/.test(property)) root.style.removeProperty(property);
    }
    document.querySelectorAll('.dream-skin-home, .dream-skin-home-shell, .dream-skin-home-utility, .ds2007-app-root')
      .forEach((node) => node.classList.remove('dream-skin-home', 'dream-skin-home-shell', 'dream-skin-home-utility', 'ds2007-app-root'));
    document.querySelectorAll('.ds2007-conversation-label, .ds2007-pinned-panel, .ds2007-context-menu').forEach((node) => node.remove());
    document.querySelectorAll('.ds2007-toolbar-duplicate, .ds2007-project-entry, .ds2007-pinned-source, .ds2007-section-label, [data-qq2007-styled], [data-qq2007-section], [data-qq2007-toolbar-duplicate], [data-qq2007-composer-region], [data-qq2007-composer-control], [data-ds2007-context-bound], [data-ds2007-collapse-bound], [data-ds2007-project], [data-ds2007-group], [data-ds2007-section], [data-ds2007-global-nav-source]')
      .forEach((node) => {
        node.classList.remove('ds2007-toolbar-duplicate', 'ds2007-project-entry', 'ds2007-pinned-source', 'ds2007-section-label');
        for (const name of [...(node.attributes || [])].map((attribute) => attribute.name)) {
          if (/^data-(qq2007|ds2007)(-|$)/.test(name)) node.removeAttribute(name);
        }
      });
    document.getElementById('codex-dream-skin-style')?.remove();
    document.getElementById('codex-dream-skin-chrome')?.remove();
    delete window.__CODEX_DREAM_SKIN_STATE__;
    delete window.__CODEX_DREAM_SKIN_DISABLED__;
    delete window.__CODEX_DREAM_SKIN_ANALYSIS_CACHE__;
    return true;
  })()`);
}

export const VERIFY_REMOVED_EXPRESSION = `(() => {
  const root = document.documentElement;
  const rootAttributeResidue = [...(root?.attributes || [])]
    .some((attribute) => /^data-(dream|ds1907|ds2007)(-|$)/.test(attribute.name));
  const rootVariableResidue = [...(root?.style || [])]
    .some((property) => /^--(dream|ds-|ds1907-)/.test(property));
  const nodeResidue = document.querySelector([
    '.dream-skin-home', '.dream-skin-home-shell', '.dream-skin-home-utility',
    '.ds2007-app-root', '.ds2007-conversation-label', '.ds2007-pinned-panel',
    '.ds2007-context-menu', '.ds2007-pinned-source', '.ds2007-toolbar-duplicate',
    '.ds2007-project-entry', '.ds2007-section-label', '[data-qq2007-styled]',
    '[data-qq2007-section]', '[data-qq2007-toolbar-duplicate]',
    '[data-qq2007-composer-region]', '[data-qq2007-composer-control]',
    '[data-ds2007-context-bound]', '[data-ds2007-collapse-bound]',
    '[data-ds2007-project]', '[data-ds2007-group]', '[data-ds2007-section]',
    '[data-ds2007-global-nav-source]',
  ].join(', '));
  return !root?.classList.contains('codex-dream-skin') &&
    !rootAttributeResidue && !rootVariableResidue &&
    !document.getElementById('codex-dream-skin-style') &&
    !document.getElementById('codex-dream-skin-chrome') && !nodeResidue &&
    !Object.prototype.hasOwnProperty.call(window, '__CODEX_DREAM_SKIN_STATE__') &&
    !Object.prototype.hasOwnProperty.call(window, '__CODEX_DREAM_SKIN_DISABLED__') &&
    !Object.prototype.hasOwnProperty.call(window, '__CODEX_DREAM_SKIN_ANALYSIS_CACHE__');
})()`;

async function verifyRemovedSession(session) {
  return session.evaluate(VERIFY_REMOVED_EXPRESSION);
}

async function verifySession(session) {
  return session.evaluate(`(() => {
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        x: Math.round(r.x), y: Math.round(r.y),
        width: Math.round(r.width), height: Math.round(r.height),
        visible: r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
      };
    };
    const actionState = (node, closestSelector = null) => {
      const item = box(node);
      if (!item?.visible) return null;
      const hit = document.elementFromPoint(item.x + item.width / 2, item.y + item.height / 2);
      const clickable = closestSelector ? hit?.closest?.(closestSelector) === node : node.contains(hit);
      return { ...item, clickable };
    };
    const homeIndicator = document.querySelector('[data-testid="home-icon"]');
    const homeSignal = homeIndicator ?? document.querySelector('[data-feature="game-source"]') ??
      document.querySelector('.group\\\\/home-suggestions');
    const homeRoute = homeSignal?.closest('[role="main"]') ?? null;
    const home = document.querySelector('[role="main"].dream-skin-home');
    const suggestions = home?.querySelector('.group\\\\/home-suggestions') ?? null;
    const cardBoxes = suggestions ? [...suggestions.querySelectorAll('button')].map(box) : [];
    const visibleCards = cardBoxes.filter((item) => item?.visible);
    const hero = box(home?.firstElementChild?.firstElementChild?.firstElementChild);
    const projectButton = box(home?.querySelector('.group\\\\/project-selector > button'));
    const shellNode = document.querySelector('main.main-surface');
    const nativeHeaderNode = shellNode?.querySelector(':scope > header.app-header-tint') ?? null;
    const titlebarNode = document.querySelector('.ds2007-titlebar');
    const titleTextNode = document.querySelector('.ds2007-window-title');
    const toolbarNode = document.querySelector('.ds2007-toolbar');
    const appRootNode = document.querySelector('.ds2007-app-root');
    const toolbarLabels = [...(toolbarNode?.querySelectorAll(':scope > button[data-nav] span') ?? [])]
      .map((node) => (node.textContent || '').trim());
    const toolbarActions = [...(toolbarNode?.querySelectorAll(':scope > button[data-nav]') ?? [])]
      .map((node) => {
        const item = box(node);
        if (!item?.visible) return null;
        const hit = document.elementFromPoint(item.x + item.width / 2, item.y + item.height / 2)
          ?.closest?.('button[data-nav]');
        return { ...item, label: node.getAttribute('data-nav') || '', clickable: hit === node };
      }).filter(Boolean);
    const nativeHeaderActions = [...(nativeHeaderNode?.querySelectorAll('button, a, [role="button"]') ?? [])]
      .map((node) => {
        const item = box(node);
        if (!item?.visible) return null;
        const hit = document.elementFromPoint(item.x + item.width / 2, item.y + item.height / 2)
          ?.closest?.('button, a, [role="button"]');
        return { ...item, label: node.getAttribute?.('aria-label') || '', clickable: hit === node };
      }).filter(Boolean);
    const protectedHeaderBoxes = [
      ...nativeHeaderActions,
      ...[...(nativeHeaderNode?.querySelectorAll('span.min-w-0.truncate') ?? [])].map(box).filter((item) => item?.visible),
    ];
    const sidebarGlobalNavSources = [...document.querySelectorAll(
      'aside.app-shell-left-panel [data-ds2007-global-nav-source]',
    )].map(box);
    const sidebarNodes = [...document.querySelectorAll('aside.app-shell-left-panel')];
    const sidebarNode = sidebarNodes.find((node) => box(node)?.visible) ?? sidebarNodes[0] ?? null;
    const sidebarResizeHandleNode = sidebarNode?.querySelector(
      ':scope > [class*="cursor-col-resize"]:has(> .sidebar-resize-handle-line)',
    ) ?? null;
    const sidebarContentNode = sidebarNode?.firstElementChild ?? null;
    const sidebarScrollNode = sidebarNode?.querySelector('[data-app-action-sidebar-scroll]') ?? null;
    const sidebarSectionNodes = [...(sidebarNode?.querySelectorAll('[data-app-action-sidebar-section]') ?? [])];
    const sidebarProjectNodes = [...(sidebarNode?.querySelectorAll('[data-app-action-sidebar-project-row]') ?? [])];
    const sidebarThreadNodes = [...(sidebarNode?.querySelectorAll('[data-app-action-sidebar-thread-row]') ?? [])];
    const firstNestedThreadNode = sidebarNode?.querySelector(
      '[data-app-action-sidebar-project-list-id] [data-app-action-sidebar-thread-row]',
    ) ?? null;
    const firstProjectTitleNode = sidebarProjectNodes[0]?.querySelector('[class*="text-fade-truncate"]') ?? null;
    const firstThreadTitleNode = [...(firstNestedThreadNode?.querySelectorAll('span') ?? [])]
      .find((node) => {
        const item = box(node);
        return item?.visible && (node.textContent || '').trim();
      }) ?? null;
    const sidebarModeButton = sidebarNode?.querySelector(
      'button[aria-label^="切换模式"], button[aria-label^="Switch mode"]',
    ) ?? null;
    const sidebarProfileButton = sidebarNode?.querySelector(
      'button[aria-label="打开个人资料菜单"], button[aria-label="Open profile menu"]',
    ) ?? null;
    const sidebarHelpButton = sidebarNode?.querySelector(
      'button[aria-label="打开帮助菜单"], button[aria-label="Open help menu"]',
    ) ?? null;
    const sidebarNavNode = sidebarScrollNode?.closest('nav') ?? null;
    const sidebarAccountNode = [...(sidebarNavNode?.parentElement?.children ?? [])]
      .find((node) => node !== sidebarNavNode && node.contains?.(sidebarProfileButton)) ?? null;
    const sidebarScrollableNodes = [...(sidebarNode?.querySelectorAll('*') ?? [])]
      .filter((node) => {
        const style = getComputedStyle(node);
        return node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 8 &&
          (style.overflowY === 'auto' || style.overflowY === 'scroll');
      });
    const friendsNode = document.querySelector('.ds2007-friends');
    const friendRailNode = document.querySelector('.ds2007-friends-tab');
    const visibleActionNode = (nodes) => [...nodes].find((node) => box(node)?.visible) ?? [...nodes][0] ?? null;
    const nativeTabNode = visibleActionNode(document.querySelectorAll(
      '.ds2007-right-tabs [data-action="native-panel"], .ds2007-friends-tab [data-action="native-panel"]',
    ));
    const friendTabNode = visibleActionNode(document.querySelectorAll(
      '.ds2007-right-tabs [data-action="friend-expand"], .ds2007-friends-tab [data-action="friend-expand"]',
    ));
    const friendScrollNode = friendsNode?.querySelector('.ds2007-friends-scroll') ?? null;
    const friendSearchNode = friendsNode?.querySelector('.ds2007-friend-search') ?? null;
    const friendPetNode = friendsNode?.querySelector('.ds2007-pet-media') ?? null;
    const friendQqShowNode = friendsNode?.querySelector('.ds2007-qqshow-media') ?? null;
    const friendQqShowImageNode = friendQqShowNode?.querySelector('img') ?? null;
    const friendCollapseNode = friendsNode?.querySelector('button[data-action="friend-collapse"]') ?? null;
    const friendCloseNode = friendsNode?.querySelector('button[data-action="friend-close"]') ?? null;
    const threadScrollNode = shellNode?.querySelector('.thread-scroll-container') ?? null;
    const threadRootNode = threadScrollNode?.firstElementChild ?? null;
    const threadContentNodes = [...(threadScrollNode?.querySelectorAll(
      '[class*="max-w-(--thread-content-max-width)"]',
    ) ?? [])];
    const composerNode = document.querySelector('.composer-surface-chrome');
    const composerFooterNode = composerNode?.querySelector('[data-qq2007-composer-region="footer"]') ?? null;
    const composerEditorRegionNode = composerNode?.querySelector('[data-qq2007-composer-region="editor"]') ?? null;
    const composerEditorNode = composerNode?.querySelector('[data-qq2007-composer-control="editor"]') ?? null;
    const composerAttachmentNode = composerNode?.querySelector('[data-qq2007-composer-control="attachment"]') ?? null;
    const composerPermissionNode = composerNode?.querySelector('[data-qq2007-composer-control="permission"]') ?? null;
    const composerModelNode = composerNode?.querySelector('[data-qq2007-composer-control="model"]') ?? null;
    const composerVoiceNode = composerNode?.querySelector('[data-qq2007-composer-control="voice"]') ?? null;
    const composerSendNode = composerNode?.querySelector('[data-qq2007-composer-control="send"]') ?? null;
    const threadContentNode = threadContentNodes
      .filter((node) => !node.contains(composerNode))
      .sort((left, right) => right.getBoundingClientRect().height - left.getBoundingClientRect().height)[0] ?? null;
    const composerStickyNode = composerNode?.closest('.sticky') ?? null;
    const nativeTaskTitleNode = shellNode?.querySelector('.ds2007-conversation-label') ??
      [...(nativeHeaderNode?.querySelectorAll(
        '[data-thread-title="true"], span.min-w-0.truncate',
      ) ?? [])].find((node) => (node.textContent || '').trim()) ?? null;
    const allPreNodes = [...(threadScrollNode?.querySelectorAll('pre') ?? [])];
    const semanticCodeNodes = [...new Set([
      ...(threadScrollNode?.querySelectorAll('[data-markdown-copy="code-block"]') ?? []),
      ...(threadScrollNode?.querySelectorAll(
        'pre[data-language], [data-language] pre, [data-testid*="code-block"] pre',
      ) ?? []),
    ])];
    const semanticCodeContainer = (node) => node.matches('[data-markdown-copy="code-block"]')
      ? node
      : node.closest('[data-language], [data-testid*="code-block"]') ?? node.parentElement ?? node;
    const semanticCodeCopyButton = (node) => semanticCodeContainer(node)
      .querySelector?.('button[aria-label="复制"], button[aria-label="Copy"]') ?? null;
    const isQqCodeFrame = (node) => {
      const style = getComputedStyle(node);
      return style.borderTopWidth === '1px' && style.borderTopColor === 'rgb(140, 166, 194)' &&
        style.backgroundColor === 'rgb(240, 245, 249)';
    };
    const visibleContentAssets = [...(threadScrollNode?.querySelectorAll(
      'img, [data-testid*="diff"], [class*="diff"]',
    ) ?? [])]
      .map((node) => ({ ...box(node), kind: node.matches('img') ? 'image' : 'diff' }))
      .filter((item) => item?.visible && item.width >= 80 && item.height >= 24)
      .filter((item, index, items) => items.findIndex((candidate) =>
        candidate.kind === item.kind && candidate.x === item.x && candidate.width === item.width
      ) === index);
    const nativeTurnNodes = [...(threadScrollNode?.querySelectorAll('[data-turn-key]') ?? [])];
    const lastNativeTurnNode = [...nativeTurnNodes]
      .sort((left, right) => right.getBoundingClientRect().bottom - left.getBoundingClientRect().bottom)[0] ?? null;
    const visibleNativeTurnNodes = nativeTurnNodes.filter((node) => {
      const item = node.getBoundingClientRect();
      return item.width > 0 && item.height > 0 && item.bottom > 0 && item.top < innerHeight;
    });
    const parseLegibilityColor = (value) => {
      const rgb = value.match(/^rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)/i);
      if (rgb) return rgb.slice(1, 4).map((channel) => Number(channel) / 255);
      const srgb = value.match(/^color\\(srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)/i);
      if (srgb) return srgb.slice(1, 4).map(Number);
      return null;
    };
    const contrastOnWhite = (node) => {
      const color = getComputedStyle(node).color;
      const channels = parseLegibilityColor(color);
      if (!channels) return { color, contrast: 1 };
      const luminance = channels.map((channel) => channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4));
      const relative = luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722;
      return { color, contrast: Number((1.05 / (relative + 0.05)).toFixed(2)) };
    };
    const legibilityGroups = [
      ['reasoning', [...(threadScrollNode?.querySelectorAll(
        '.loading-shimmer-pure-text, .loading-shimmer-pure-text *',
      ) ?? [])]],
      ['activity', [...(threadScrollNode?.querySelectorAll(
        '[class*="group/activity-header"] [class*="text-token-conversation-body"]',
      ) ?? [])]],
      ['tool', [...(threadScrollNode?.querySelectorAll(
        '[data-testid="exec-shell-body"] .text-token-text-tertiary, ' +
        '[data-testid="exec-shell-body"] [class*="text-token-input-placeholder"]',
      ) ?? [])]],
      ['time', [...(threadScrollNode?.querySelectorAll('span.text-token-text-tertiary') ?? [])]
        .filter((node) => /^\\d{1,2}:\\d{2}$/.test((node.textContent || '').trim()))],
    ];
    const seenLegibilityNodes = new Set();
    const conversationLegibility = legibilityGroups.flatMap(([kind, nodes]) => nodes
      .filter((node) => {
        if (!(node.textContent || '').trim() || seenLegibilityNodes.has(node)) return false;
        seenLegibilityNodes.add(node);
        return true;
      })
      .map((node) => ({
        kind,
        text: (node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
        ...contrastOnWhite(node),
      })));
    const shell = box(shellNode);
    const composer = box(composerNode);
    const sidebar = box(document.querySelector('aside.app-shell-left-panel'));
    const friends = box(friendsNode);
    const statusbar = box(document.querySelector('.ds2007-statusbar'));
    const chrome = document.getElementById('codex-dream-skin-chrome');
    const themeMode = document.documentElement.getAttribute('data-dream-skin-mode') || '';
    const qq2007Mode = themeMode === 'qq2007';
    const themeRegionNodes = [...document.querySelectorAll(
      '.ds2007-titlebar, .ds2007-toolbar, .ds2007-friends, .ds2007-friends-tab, .ds2007-statusbar',
    )];
    const expectedBitmapIconRoles = [
      'mascot', 'new-task', 'scheduled', 'plugins', 'sites', 'pull-request', 'chat', 'skin',
      'mail', 'star', 'groups', 'folder', 'search', 'online', 'security',
    ];
    const toolbarBitmapIconRoles = new Set([
      'new-task', 'scheduled', 'plugins', 'sites', 'pull-request', 'chat', 'skin',
    ]);
    const bitmapCellIndex = new Map([
      ['mascot', 0], ['new-task', 1], ['scheduled', 2], ['plugins', 3], ['sites', 4],
      ['pull-request', 5], ['chat', 6], ['mail', 7], ['skin', 8], ['star', 8],
      ['groups', 9], ['folder', 10], ['search', 11], ['online', 12], ['security', 13],
    ]);
    const bitmapIconNodes = [...document.querySelectorAll('.ds2007-icon')]
      .filter((node) => !node.closest('.ds2007-native-skin-toggle'));
    const bitmapIconStyles = bitmapIconNodes.map((node) => {
      const style = getComputedStyle(node);
      const role = [...node.classList]
        .find((name) => name.startsWith('ds2007-icon--'))?.slice('ds2007-icon--'.length) || '';
      return {
        ...box(node),
        role,
        backgroundImage: style.backgroundImage,
        backgroundPosition: style.backgroundPosition,
        backgroundSize: style.backgroundSize,
        cellSize: Number.parseFloat(style.width) || 0,
        cellHeight: Number.parseFloat(style.height) || 0,
        imageRendering: style.imageRendering,
      };
    });
    const materialState = (node) => {
      if (!node || !box(node)?.visible) return null;
      const style = getComputedStyle(node);
      return {
        borderWidth: style.borderTopWidth,
        borderRadius: Number.parseFloat(style.borderTopLeftRadius) || 0,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
      };
    };
    const panelMaterials = [sidebarNode, shellNode, composerNode, friendsNode]
      .map(materialState).filter(Boolean);
    const appRootStyle = getComputedStyle(appRootNode || document.body);
    const bodyStyle = getComputedStyle(document.body);
    const titlebarStyle = getComputedStyle(titlebarNode || document.body);
    const toolbarStyle = getComputedStyle(toolbarNode || document.body);
    const bitmapIconCount = bitmapIconStyles.length;
    const bitmapIconPass = !qq2007Mode || (
      bitmapIconCount === expectedBitmapIconRoles.length && bitmapIconStyles.every((item, index) => {
        const role = expectedBitmapIconRoles[index];
        const cellSize = toolbarBitmapIconRoles.has(role) ? 24 : 16;
        const cellIndex = bitmapCellIndex.get(role);
        return item.role === role && item.cellSize === cellSize && item.cellHeight === cellSize &&
          item.backgroundImage.startsWith('url("data:image/png;base64,') &&
          item.backgroundSize === (cellSize * 14) + 'px ' + cellSize + 'px' &&
          item.backgroundPosition === (-(cellIndex * cellSize)) + 'px 0px' &&
          item.imageRendering === 'pixelated';
      })
    );
    const visualMaterialPass = !qq2007Mode || (
      bodyStyle.fontFamily.trim().startsWith('Tahoma') &&
      titlebarStyle.backgroundImage !== 'none' && toolbarStyle.backgroundImage !== 'none' &&
      appRootStyle.backgroundImage !== 'none' && appRootStyle.backgroundSize.includes('72px') &&
      panelMaterials.length >= 2 && panelMaterials.every((item) =>
        item.borderWidth === '1px' && item.borderRadius <= 2 &&
        item.backgroundImage !== 'none' && item.boxShadow !== 'none'
      )
    );
    const nativeProjectLabel = [...(nativeHeaderNode?.querySelectorAll('button[aria-label]') ?? [])]
      .map((node) => node.getAttribute('aria-label') || '')
      .find((label) => /^(项目|Project)[：:]/i.test(label)) || '';
    const nativeRightState = document.documentElement.getAttribute('data-ds2007-native-right') || '';
    const routeKind = nativeRightState === 'open' ? 'native-right'
      : homeRoute && nativeProjectLabel ? 'project'
      : homeRoute ? 'home'
      : threadScrollNode ? 'task'
      : 'project';
    const result = {
      installed: document.documentElement.classList.contains('codex-dream-skin'),
      version: window.__CODEX_DREAM_SKIN_STATE__?.version ?? null,
      stylePresent: Boolean(document.getElementById('codex-dream-skin-style')),
      chromePresent: Boolean(chrome),
      chromePointerEvents: getComputedStyle(chrome || document.body).pointerEvents,
      themeMode,
      styleCount: document.querySelectorAll('#codex-dream-skin-style').length,
      chromeCount: document.querySelectorAll('#codex-dream-skin-chrome').length,
      themeRegionCount: themeRegionNodes.length,
      visibleThemeRegionCount: themeRegionNodes.filter((node) => box(node)?.visible).length,
      bitmapIconCount,
      visibleBitmapIconCount: bitmapIconStyles.filter((item) => item.visible).length,
      bitmapIconPass,
      bitmapIconStyles,
      visualMaterialPass,
      visualMaterialState: {
        bodyFont: bodyStyle.fontFamily,
        titleBackground: titlebarStyle.backgroundImage,
        toolbarBackground: toolbarStyle.backgroundImage,
        appRootBackground: appRootStyle.backgroundImage,
        appRootBackgroundSize: appRootStyle.backgroundSize,
        panels: panelMaterials,
      },
      profileText: (document.querySelector('.ds2007-statusbar')?.textContent || '').replace(/\\s+/g, ' ').trim(),
      homeRoute: Boolean(homeRoute),
      homePresent: Boolean(home),
      hero,
      cards: cardBoxes,
      visibleCardCount: visibleCards.length,
      projectButton,
      titlebar: box(titlebarNode),
      titleText: (titleTextNode?.textContent || '').trim(),
      titleTextBox: box(titleTextNode),
      toolbar: box(toolbarNode),
      toolbarLabels,
      toolbarActions,
      sidebarGlobalNavSources,
      sidebarPanelCount: sidebarNodes.filter((node) => box(node)?.visible).length,
      sidebarResizeHandle: {
        ...box(sidebarResizeHandleNode),
        pointerEvents: getComputedStyle(sidebarResizeHandleNode || document.body).pointerEvents,
      },
      sidebarContent: box(sidebarContentNode),
      sidebarScroll: {
        ...box(sidebarScrollNode),
        overflowY: getComputedStyle(sidebarScrollNode || document.body).overflowY,
        scrollHeight: sidebarScrollNode?.scrollHeight ?? 0,
        clientHeight: sidebarScrollNode?.clientHeight ?? 0,
      },
      sidebarSections: sidebarSectionNodes.map((node) => ({
        ...box(node),
        heading: node.getAttribute('data-app-action-sidebar-section-heading') || '',
        collapsed: node.getAttribute('data-app-action-sidebar-section-collapsed') || '',
        header: (() => {
          const header = node.querySelector('[class*="group/nav-section-title"]');
          return {
            ...box(header),
            backgroundImage: getComputedStyle(header || document.body).backgroundImage,
          };
        })(),
      })),
      sidebarProjectCount: sidebarProjectNodes.length,
      sidebarThreadCount: sidebarThreadNodes.length,
      sidebarActiveThreadCount: sidebarThreadNodes.filter(
        (node) => node.getAttribute('data-app-action-sidebar-thread-active') === 'true',
      ).length,
      sidebarMode: actionState(sidebarModeButton, 'button, a, [role="button"]'),
      sidebarAccount: box(sidebarAccountNode),
      sidebarProfile: actionState(sidebarProfileButton, 'button, a, [role="button"]'),
      sidebarHelp: actionState(sidebarHelpButton, 'button, a, [role="button"]'),
      sidebarScrollableCount: sidebarScrollableNodes.length,
      sidebarProjectTitle: box(firstProjectTitleNode),
      sidebarThreadTitle: box(firstThreadTitleNode),
      nativeTaskTitle: box(nativeTaskTitleNode),
      nativeTaskTitleText: (nativeTaskTitleNode?.textContent || '').trim(),
      nativeProjectLabel,
      routeKind,
      threadScroll: {
        ...box(threadScrollNode),
        overflowY: getComputedStyle(threadScrollNode || document.body).overflowY,
        scrollTop: threadScrollNode?.scrollTop || 0,
        scrollHeight: threadScrollNode?.scrollHeight || 0,
        clientHeight: threadScrollNode?.clientHeight || 0,
      },
      threadRoot: {
        ...box(threadRootNode),
        transform: getComputedStyle(threadRootNode || document.body).transform,
      },
      threadContent: box(threadContentNode),
      threadComposerSticky: box(composerStickyNode),
      composerFooter: box(composerFooterNode),
      composerEditorRegion: box(composerEditorRegionNode),
      composerStyle: composerNode ? {
        borderWidth: getComputedStyle(composerNode).borderTopWidth,
        borderColor: getComputedStyle(composerNode).borderTopColor,
        overflow: getComputedStyle(composerNode).overflow,
        maxHeight: Number.parseFloat(getComputedStyle(composerNode).maxHeight) || null,
      } : null,
      composerControls: {
        attachment: actionState(composerAttachmentNode, 'button'),
        editor: actionState(composerEditorNode),
        permission: actionState(composerPermissionNode, 'button'),
        model: actionState(composerModelNode, 'button'),
        voice: actionState(composerVoiceNode, 'button'),
        send: actionState(composerSendNode, 'button'),
      },
      composerDraftText: (composerEditorNode?.innerText || composerEditorNode?.textContent || '').trim(),
      composerModelText: (composerModelNode?.innerText || composerModelNode?.textContent || '').replace(/\\s+/g, ' ').trim(),
      lastNativeTurn: box(lastNativeTurnNode),
      nativeTurnCount: nativeTurnNodes.length,
      nativeUserTurnCount: threadScrollNode?.querySelectorAll('[data-local-conversation-user-anchor]').length ?? 0,
      visibleNativeTurnCount: visibleNativeTurnNodes.length,
      conversationLegibility,
      decoratedNativeTurnCount: visibleNativeTurnNodes.filter((node) => {
        const style = getComputedStyle(node);
        return style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.borderTopWidth !== '0px' ||
          style.boxShadow !== 'none';
      }).length,
      syntheticMessageCount: threadScrollNode?.querySelectorAll('.ds1907-message').length ?? 0,
      syntheticTimeCount: threadScrollNode?.querySelectorAll('[data-ds1907-time]').length ?? 0,
      semanticCodeCount: semanticCodeNodes.length,
      framedSemanticCodeCount: semanticCodeNodes.filter(isQqCodeFrame).length,
      semanticCodeBoxes: semanticCodeNodes.map(box).filter((item) => item?.visible),
      semanticCodeLanguageCount: semanticCodeNodes.filter((node) => {
        const container = semanticCodeContainer(node);
        const language = node.getAttribute('data-language') || container.getAttribute?.('data-language') || '';
        const label = container.querySelector?.(
          ':scope > [data-markdown-copy="exclude"] > :first-child',
        )?.textContent || '';
        return language.trim().length > 0 || label.trim().length > 0;
      }).length,
      semanticCodeCopyCount: semanticCodeNodes.filter(semanticCodeCopyButton).length,
      visibleSemanticCodeCopyCount: semanticCodeNodes.filter((node) => {
        const button = semanticCodeCopyButton(node);
        const item = button?.getBoundingClientRect();
        const scrollItem = threadScrollNode?.getBoundingClientRect();
        const centerY = item ? item.y + item.height / 2 : -1;
        return item && scrollItem && item.width > 0 && item.height > 0 &&
          centerY > scrollItem.top && centerY < scrollItem.bottom;
      }).length,
      clickableVisibleSemanticCodeCopyCount: semanticCodeNodes.filter((node) => {
        const button = semanticCodeCopyButton(node);
        const item = button?.getBoundingClientRect();
        const scrollItem = threadScrollNode?.getBoundingClientRect();
        const centerY = item ? item.y + item.height / 2 : -1;
        if (!item || !scrollItem || item.width <= 0 || item.height <= 0 ||
          centerY <= scrollItem.top || centerY >= scrollItem.bottom) return false;
        const hit = document.elementFromPoint(item.x + item.width / 2, item.y + item.height / 2)
          ?.closest?.('button');
        return hit === button;
      }).length,
      semanticCodeWhitespaceCount: semanticCodeNodes.filter((node) => {
        const code = node.querySelector('code') ?? (node.matches('pre') ? node : null);
        return !code || getComputedStyle(code).whiteSpace.startsWith('pre');
      }).length,
      highlightedSemanticCodeCount: semanticCodeNodes.filter((node) =>
        node.querySelector('code [class*="hljs-"], code [class*="token"]')
      ).length,
      preservedSemanticHighlightCount: semanticCodeNodes.filter((node) => {
        const code = node.querySelector('code');
        const highlight = node.querySelector('code [class*="hljs-"], code [class*="token"]');
        return code && highlight && getComputedStyle(code).color !== getComputedStyle(highlight).color;
      }).length,
      framedNonSemanticCodeCount: allPreNodes.filter((node) =>
        !semanticCodeNodes.some((semanticNode) => semanticNode === node || semanticNode.contains(node)) &&
        isQqCodeFrame(node)
      ).length,
      visibleContentAssets,
      appRoot: box(appRootNode),
      nativeHeader: box(nativeHeaderNode),
      nativeHeaderActions,
      protectedHeaderBoxes,
      shell,
      composer,
      sidebar,
      friends,
      friendState: document.documentElement.getAttribute('data-ds2007-friends') || '',
      nativeRightState,
      friendRail: box(friendRailNode),
      nativeTab: actionState(nativeTabNode, 'button'),
      friendTab: actionState(friendTabNode, 'button'),
      friendScroll: {
        ...box(friendScrollNode),
        overflowY: getComputedStyle(friendScrollNode || document.body).overflowY,
        scrollHeight: friendScrollNode?.scrollHeight ?? 0,
        clientHeight: friendScrollNode?.clientHeight ?? 0,
      },
      friendSearch: box(friendSearchNode),
      friendPet: {
        ...box(friendPetNode),
        source: friendPetNode?.dataset.petSource || '',
        overflow: getComputedStyle(friendPetNode || document.body).overflow,
      },
      friendQqShow: {
        ...box(friendQqShowNode),
        source: friendQqShowNode?.dataset.qqShowSource || '',
        overflow: getComputedStyle(friendQqShowNode || document.body).overflow,
      },
      friendQqShowImage: box(friendQqShowImageNode),
      friendControls: {
        collapse: actionState(friendCollapseNode, 'button'),
        close: actionState(friendCloseNode, 'button'),
      },
      friendText: (friendsNode?.textContent || '').replace(/\\s+/g, ' ').trim(),
      bodyGridColumns: getComputedStyle(document.body).gridTemplateColumns,
      statusbar,
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: {
        x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      },
    };
    const basePass = result.installed && result.version === ${JSON.stringify(SKIN_VERSION)} &&
      result.stylePresent && result.chromePresent && result.chromePointerEvents === 'none' &&
      Boolean(result.shell?.visible) && Boolean(result.sidebar?.visible) && !result.documentOverflow.x;
    const modePass = result.styleCount === 1 && result.chromeCount === 1 && result.themeRegionCount === 5 &&
      (qq2007Mode
        ? Boolean(result.titlebar?.visible && result.toolbar?.visible && result.statusbar?.visible)
        : result.themeMode === 'classic' && result.visibleThemeRegionCount === 0);
    result.modePass = modePass;
    const composerControls = Object.values(result.composerControls);
    const composerRowsPass = !result.composer?.visible || (
      result.composerControls.attachment?.y < result.composerEditorRegion?.y &&
      result.composerEditorRegion.y + result.composerEditorRegion.height <=
        result.composerControls.permission?.y + 1 &&
      result.composerControls.permission.y === result.composerControls.model?.y &&
      result.composerControls.model.y === result.composerControls.voice?.y &&
      result.composerControls.voice.y === result.composerControls.send?.y
    );
    const composerColumn = result.threadScroll?.visible ? result.threadScroll : result.shell;
    const composerPass = !qq2007Mode || !result.composer?.visible || (
      Math.abs(result.composer.x - composerColumn.x) <= 1 &&
      Math.abs(result.composer.width - composerColumn.width) <= 1 &&
      result.composer.y >= result.shell.y &&
      result.composer.y + result.composer.height <= (result.statusbar?.y ?? result.viewport.height) + 1 &&
      result.composer.height <= result.shell.height * 0.75 &&
      result.composerStyle?.borderWidth === '1px' &&
      result.composerStyle.borderColor === 'rgb(109, 145, 184)' &&
      result.composerStyle.overflow === 'hidden' &&
      result.composerStyle.maxHeight <= result.shell.height &&
      result.composerFooter?.visible && composerRowsPass &&
      composerControls.length === 6 && composerControls.every((item) => item?.visible && item.clickable)
    );
    result.composerPass = composerPass;
    const friendStateHidden = result.friendState === 'closed' || result.viewport.width <= 959;
    const nativeRightOpen = result.nativeRightState === 'open';
    const rightColumnWidth = Number.parseFloat(result.bodyGridColumns.trim().split(/\\s+/).at(-1));
    const nativeRightGridPass = !nativeRightOpen || Math.abs(rightColumnWidth - 28) <= 1;
    const friendTextPass = ['Codex小蓝', 'LV07', '代码有问题？找我！', '我是你的智能伙伴Codex',
      '消息', '收藏', '群组', '文件', '我的好友', '智能伙伴', '离线好友', '在线']
      .every((text) => result.friendText.includes(text));
    const friendMediaPass = result.friendPet?.visible && result.friendQqShow?.visible &&
      result.friendQqShowImage?.visible && result.friendPet.overflow === 'hidden' &&
      result.friendQqShow.overflow === 'hidden' &&
      ['codex', 'fallback'].includes(result.friendPet.source) && result.friendQqShow.source === 'theme' &&
      result.friendPet.x >= result.friends.x &&
      result.friendPet.x + result.friendPet.width <= result.friends.x + result.friends.width + 1 &&
      result.friendQqShow.x >= result.friends.x &&
      result.friendQqShow.x + result.friendQqShow.width <= result.friends.x + result.friends.width + 1;
    const expandedFriendPass = result.friends?.visible && !result.friendRail?.visible &&
      result.friends.x >= result.shell.x + result.shell.width &&
      result.friends.x + result.friends.width <= result.viewport.width + 1 &&
      result.friendScroll?.visible && ['auto', 'scroll'].includes(result.friendScroll.overflowY) &&
      result.friendSearch?.visible &&
      result.friendScroll.y + result.friendScroll.height <= result.friendSearch.y + 1 &&
      result.friendSearch.y + result.friendSearch.height <= result.friends.y + result.friends.height + 1 &&
      result.nativeTab?.clickable && result.friendTab?.clickable &&
      result.friendControls.collapse?.clickable && result.friendControls.close?.clickable &&
      friendMediaPass && friendTextPass;
    const rightRailPass = !result.friends?.visible && result.friendRail?.visible &&
      result.nativeTab?.clickable && result.friendTab?.clickable &&
      result.friendRail.x >= result.shell.x + result.shell.width - 1 &&
      result.friendRail.x + result.friendRail.width <= result.viewport.width + 1;
    const friendPass = !qq2007Mode || Boolean((nativeRightOpen || friendStateHidden ||
      result.friendState === 'collapsed' ? rightRailPass : expandedFriendPass) && nativeRightGridPass);
    result.friendPass = friendPass;
    const overlaps = (a, b) => Boolean(a?.visible && b?.visible &&
      a.x < b.x + b.width && a.x + a.width > b.x &&
      a.y < b.y + b.height && a.y + a.height > b.y);
    const framePass = !qq2007Mode || (
      result.titleText.startsWith('Codex 2007 - ') && Boolean(result.titleTextBox?.visible) &&
      JSON.stringify(result.toolbarLabels) === JSON.stringify(['新建任务', '已安排', '插件', '站点', '拉取请求', '聊天', '换肤']) &&
      result.toolbarActions.length === 7 && result.toolbarActions.every((item) => item.clickable) &&
      result.sidebarGlobalNavSources.length >= 5 && result.sidebarGlobalNavSources.every((item) => !item.visible) &&
      Boolean(result.titlebar?.visible) && Boolean(result.toolbar?.visible) && Boolean(result.appRoot?.visible) &&
      result.titlebar.y + result.titlebar.height <= result.toolbar.y + 1 &&
      result.toolbar.y + result.toolbar.height <= result.appRoot.y + 1 &&
      result.appRoot.y + result.appRoot.height <= result.statusbar.y + 1 &&
      result.nativeHeaderActions.length > 0 && result.nativeHeaderActions.every((item) => item.clickable) &&
      result.protectedHeaderBoxes.every((item) => !overlaps(result.titleTextBox, item))
    );
    const sidebarHeadings = result.sidebarSections.map((item) => item.heading)
      .filter((heading) => ['Pinned', 'Projects', 'Tasks'].includes(heading));
    const sidebarHeadingOrder = sidebarHeadings.map((heading) => ['Pinned', 'Projects', 'Tasks'].indexOf(heading));
    const sidebarHeadingsPass = sidebarHeadings.includes('Projects') && sidebarHeadings.includes('Tasks') &&
      sidebarHeadingOrder.every((value, index) => index === 0 || value > sidebarHeadingOrder[index - 1]);
    const sidebarHierarchyPass = result.sidebarProjectCount === 0 || result.sidebarThreadCount === 0 || (
      result.sidebarProjectTitle?.visible && result.sidebarThreadTitle?.visible &&
      result.sidebarThreadTitle.x >= result.sidebarProjectTitle.x + 12
    );
    const sidebarPass = !qq2007Mode || (
      result.sidebarPanelCount === 1 && Boolean(result.sidebarContent?.visible) &&
      result.sidebarResizeHandle.pointerEvents === 'none' &&
      result.sidebarContent.width >= result.sidebar.width - 4 &&
      result.sidebarScroll?.visible && result.sidebarScroll.overflowY === 'auto' &&
      result.sidebarScrollableCount === (result.sidebarScroll.scrollHeight > result.sidebarScroll.clientHeight + 8 ? 1 : 0) &&
      sidebarHeadingsPass &&
      result.sidebarSections.every((item) => item.header?.visible && item.header.height >= 23 &&
        item.header.height <= 30 && item.header.backgroundImage !== 'none') &&
      result.sidebarActiveThreadCount <= 1 && sidebarHierarchyPass &&
      result.sidebarMode?.visible && result.sidebarMode.y < result.sidebarScroll.y &&
      result.sidebarAccount?.visible && result.sidebarProfile?.clickable && result.sidebarHelp?.clickable &&
      result.sidebarAccount.y + result.sidebarAccount.height <= result.sidebar.y + result.sidebar.height + 1
    );
    result.sidebarPass = sidebarPass;
    const threadBoundsPass = !result.threadScroll?.visible || (
      result.threadScroll.x >= result.shell.x - 1 &&
      result.threadScroll.x + result.threadScroll.width <= result.shell.x + result.shell.width + 1
    );
    const threadContentPass = !result.threadContent?.visible || (
      result.threadContent.x >= result.threadScroll.x - 1 &&
      result.threadContent.x + result.threadContent.width <= result.threadScroll.x + result.threadScroll.width + 1 &&
      result.threadContent.width >= Math.min(800, result.threadScroll.width * 0.75)
    );
    const contentAssetsPass = result.visibleContentAssets.every((item) =>
      item.x >= result.threadScroll.x - 1 &&
      item.x + item.width <= result.threadScroll.x + result.threadScroll.width + 1 &&
      (item.kind !== 'diff' || item.width >= Math.min(480, result.threadScroll.width * 0.7))
    );
    const semanticCodeWidthPass = result.semanticCodeBoxes.every((item) =>
      item.x >= result.threadScroll.x - 1 &&
      item.x + item.width <= result.threadScroll.x + result.threadScroll.width + 1 &&
      item.width >= Math.min(480, result.threadScroll.width * 0.7)
    );
    const lastContentBox = result.lastNativeTurn?.visible ? result.lastNativeTurn : result.threadContent;
    const threadAtBottom = result.threadScroll.scrollHeight - result.threadScroll.scrollTop -
      result.threadScroll.clientHeight <= 8;
    const contentComposerPass = !threadAtBottom || !lastContentBox?.visible || !result.threadComposerSticky?.visible ||
      lastContentBox.y + lastContentBox.height <= result.threadComposerSticky.y + 2;
    const nativeContextPass = result.nativeHeader?.visible && result.nativeHeaderActions.length > 0 &&
      result.nativeHeaderActions.every((item) => item.clickable) &&
      (!result.threadScroll?.visible || result.nativeTaskTitle?.visible);
    const threadRoutePass = !result.threadScroll?.visible || (
      result.threadScroll.overflowY === 'auto' && threadBoundsPass && result.threadRoot?.transform === 'none' &&
      threadContentPass && contentAssetsPass && semanticCodeWidthPass && contentComposerPass
    );
    const conversationLegibilityPass = !qq2007Mode ||
      result.conversationLegibility.every((item) => item.contrast >= 4.5);
    result.conversationLegibilityPass = conversationLegibilityPass;
    const conversationPass = !qq2007Mode || (
      nativeContextPass && threadRoutePass &&
      conversationLegibilityPass &&
      result.syntheticMessageCount === 0 && result.syntheticTimeCount === 0 && result.decoratedNativeTurnCount === 0 &&
      result.framedSemanticCodeCount === result.semanticCodeCount &&
      result.semanticCodeLanguageCount === result.semanticCodeCount &&
      result.semanticCodeCopyCount === result.semanticCodeCount &&
      result.clickableVisibleSemanticCodeCopyCount === result.visibleSemanticCodeCopyCount &&
      result.semanticCodeWhitespaceCount === result.semanticCodeCount &&
      result.preservedSemanticHighlightCount === result.highlightedSemanticCodeCount &&
      result.framedNonSemanticCodeCount === 0
    );
    result.conversationPass = conversationPass;
    result.visualPass = bitmapIconPass && visualMaterialPass;
    const panelPass = !qq2007Mode || (Boolean(result.statusbar?.visible) &&
      result.sidebar.x + result.sidebar.width <= result.shell.x && composerPass && friendPass && framePass &&
      sidebarPass && conversationPass && result.visualPass);
    // Project selector markup varies across Codex builds — soft requirement.
    const homePass = !result.homeRoute || (qq2007Mode
      ? result.homePresent && !result.hero?.visible
      : result.homePresent && result.hero?.visible && result.hero.width >= 280 && result.hero.height >= 120);
    result.pass = Boolean(basePass && modePass && homePass && panelPass);
    result.softNotes = {
      projectButtonOptional: !result.projectButton?.visible,
      composerOptionalOnNonTaskRoutes: !result.composer?.visible,
      suggestionCardsOptional: result.homeRoute && result.visibleCardCount === 0,
      sidebarRowsOptionalWhenCollapsed: result.sidebarProjectCount === 0 || result.sidebarThreadCount === 0,
    };
    return result;
  })()`);
}

async function waitForVerifiedSession(session, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  while (Date.now() < deadline) {
    lastResult = await verifySession(session);
    if (lastResult.pass) return lastResult;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return lastResult;
}

const ACCEPTANCE_REDACTION_ID = "codex-2007-acceptance-redaction";
const ACCEPTANCE_REDACTION_CSS = `
  [data-turn-key],
  [data-app-action-sidebar-project-row] [class*="text"],
  [data-app-action-sidebar-thread-row] [class*="text"],
  main.main-surface > header.app-header-tint span.min-w-0.truncate,
  .ds2007-conversation-label,
  .ds2007-window-title,
  aside.app-shell-left-panel button[aria-label="打开个人资料菜单"],
  aside.app-shell-left-panel button[aria-label="Open profile menu"] {
    filter: blur(6px) !important;
  }
`;

async function setAcceptanceRedaction(session, enabled) {
  await session.evaluate(`(() => {
    const id = ${JSON.stringify(ACCEPTANCE_REDACTION_ID)};
    document.getElementById(id)?.remove();
    if (!${JSON.stringify(enabled)}) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = ${JSON.stringify(ACCEPTANCE_REDACTION_CSS)};
    document.head.appendChild(style);
  })()`);
}

async function capture(session, outputPath, sanitized = false) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  if (sanitized) await setAcceptanceRedaction(session, true);
  try {
    const bestEffortInput = async (method, params) => {
      try {
        await session.send(method, params, 750);
      } catch {
        // Screenshot capture is still valid when a renderer omits the Input domain.
      }
    };
    await bestEffortInput("Input.dispatchKeyEvent", {
      type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
    });
    await bestEffortInput("Input.dispatchKeyEvent", {
      type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
    });
    const viewport = await session.evaluate("({ width: innerWidth, height: innerHeight })");
    await bestEffortInput("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: Math.round(viewport.width * 0.64),
      y: Math.round(viewport.height * 0.62),
      button: "none",
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const result = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
  } finally {
    if (sanitized) await setAcceptanceRedaction(session, false);
  }
}

async function writeJsonEvidence(outputPath, value) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    await fs.rename(temporaryPath, outputPath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function setNativeRightPanel(session, open) {
  return session.evaluate(`(() => {
    const root = document.documentElement;
    const isOpen = () => root.getAttribute('data-ds2007-native-right') === 'open';
    if (isOpen() === ${JSON.stringify(open)}) return true;
    const button = document.querySelector(
      'button[aria-label="切换摘要"], button[aria-label="Toggle summary"]',
    );
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function setAcceptanceSkinView(session, view) {
  return session.evaluate(`(() => {
    const root = document.documentElement;
    const current = root.getAttribute('data-ds2007-view') === 'native' ? 'native' : 'deep';
    if (current === ${JSON.stringify(view)}) return true;
    const button = current === 'native'
      ? document.querySelector('.ds2007-native-skin-toggle')
      : [...document.querySelectorAll('.ds2007-toolbar button[data-nav]')]
        .find((node) => node.getAttribute('data-nav') === '换肤');
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function verifyNativeSkinView(session) {
  return session.evaluate(`(() => {
    const root = document.documentElement;
    const shell = document.querySelector('main.main-surface');
    const sidebar = document.querySelector('aside.app-shell-left-panel');
    const composer = document.querySelector('.composer-surface-chrome');
    const recovery = document.querySelector('.ds2007-native-skin-toggle');
    const visible = (node) => {
      if (!node) return false;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const homeIndicator = document.querySelector('[data-testid="home-icon"]');
    const homeSignal = homeIndicator ?? document.querySelector('[data-feature="game-source"]') ??
      document.querySelector('.group\\\\/home-suggestions');
    const routeKind = homeSignal?.closest('[role="main"]')
      ? 'home' : shell?.querySelector('.thread-scroll-container') ? 'task' : 'project';
    const documentOverflow = {
      x: root.scrollWidth > root.clientWidth,
      y: root.scrollHeight > root.clientHeight,
    };
    const pass = root.getAttribute('data-ds2007-view') === 'native' &&
      !root.classList.contains('codex-dream-skin') && visible(shell) && visible(sidebar) &&
      visible(recovery) && Boolean(composer) && !documentOverflow.x && !documentOverflow.y;
    return { pass, routeKind, documentOverflow, shellVisible: visible(shell),
      sidebarVisible: visible(sidebar), composerPresent: Boolean(composer), recoveryVisible: visible(recovery) };
  })()`);
}

async function runAcceptanceMatrix(options) {
  const connected = await connectCodexTargets(options.port, options.timeoutMs);
  const [{ session }, ...unused] = connected;
  unused.forEach((item) => item.session.close());
  const loaded = await loadPayload(options.themeDir);
  const expectedMode = options.scenario.startsWith("native-") ? "native" : "deep";
  const expectedThemeMode = "deep";
  const expectedRoute = options.scenario.slice(options.scenario.indexOf("-") + 1);
  const cases = [];
  let route = null;
  let panelChanged = false;

  try {
    if (loaded.theme.mode !== expectedThemeMode) {
      throw new Error(`${options.scenario} requires a ${expectedThemeMode} theme`);
    }
    await applyToSession(session, loaded.payload);
    if (!await setAcceptanceSkinView(session, expectedMode)) {
      throw new Error(`Could not switch acceptance view to ${expectedMode}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (expectedRoute === "native-right") {
      const wasOpen = await session.evaluate(
        "document.documentElement.getAttribute('data-ds2007-native-right') === 'open'",
      );
      if (!wasOpen) {
        if (!await setNativeRightPanel(session, true)) {
          throw new Error("Native right-panel toggle is unavailable");
        }
        panelChanged = true;
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
    }
    const baseViewport = await session.evaluate("({ width: innerWidth, height: innerHeight })");
    for (const viewport of CODEX_2007_ACCEPTANCE_PLAN.viewports) {
      const scale = viewport.scalePercent / 100;
      const width = Math.max(640, Math.floor(baseViewport.width / scale));
      const height = viewport.height
        ? Math.min(viewport.height, baseViewport.height)
        : Math.max(420, Math.floor(baseViewport.height / scale));
      await session.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: scale,
        mobile: false,
        screenWidth: baseViewport.width,
        screenHeight: baseViewport.height,
      });
      await new Promise((resolve) => setTimeout(resolve, 350));
      const result = expectedMode === "native"
        ? await verifyNativeSkinView(session)
        : await waitForVerifiedSession(session, options.timeoutMs);
      route ??= result.routeKind;
      const screenshot = `${options.scenario}-${viewport.id}.png`;
      await capture(session, path.join(options.matrixDir, screenshot), true);
      cases.push({
        id: viewport.id,
        scalePercent: viewport.scalePercent,
        viewport: { width, height },
        screenshot,
        result,
      });
    }
  } finally {
    await session.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
    await setAcceptanceRedaction(session, false).catch(() => {});
    if (panelChanged) await setNativeRightPanel(session, false).catch(() => {});
    if (expectedMode === "native") await setAcceptanceSkinView(session, "deep").catch(() => {});
    session.close();
  }

  const evidence = {
    schemaVersion: CODEX_2007_ACCEPTANCE_PLAN.schemaVersion,
    scenario: options.scenario,
    mode: expectedMode,
    route,
    sanitized: true,
    cases,
  };
  const evidencePath = path.join(options.matrixDir, `${options.scenario}.json`);
  await writeJsonEvidence(evidencePath, evidence);
  const pass = route === expectedRoute && cases.length === CODEX_2007_ACCEPTANCE_PLAN.viewports.length &&
    cases.every((item) => item.result?.pass === true &&
      item.result?.documentOverflow?.x === false && item.result?.documentOverflow?.y === false);
  console.log(JSON.stringify({ pass, evidence: evidencePath, ...evidence }, null, 2));
  if (!pass) process.exitCode = 2;
}

async function runLifecycleSmoke(options) {
  const connected = await connectCodexTargets(options.port, options.timeoutMs);
  const [{ session }, ...unused] = connected;
  unused.forEach((item) => item.session.close());
  const loaded = await loadPayload(options.themeDir);
  const phases = [];
  const details = {};

  try {
    await session.evaluate(`(() => {
      const selectors = {
        sidebar: 'aside.app-shell-left-panel',
        shell: 'main.main-surface',
        composer: '.composer-surface-chrome',
        header: 'main.main-surface > header.app-header-tint',
      };
      window.__CODEX_2007_ACCEPTANCE_NATIVE__ = Object.fromEntries(
        Object.entries(selectors).map(([key, selector]) => {
          const node = document.querySelector(selector);
          return [key, { node, parent: node?.parentNode ?? null }];
        }),
      );
    })()`);

    await removeFromSession(session);
    details.removed = await verifyRemovedSession(session);
    if (details.removed) phases.push("removed");

    await applyToSession(session, loaded.payload);
    details.applied = await waitForVerifiedSession(session, options.timeoutMs);
    if (details.applied?.pass) phases.push("applied");

    await applyToSession(session, loaded.payload);
    details.reapplied = await waitForVerifiedSession(session, options.timeoutMs);
    if (details.reapplied?.pass && details.reapplied.styleCount === 1 &&
      details.reapplied.chromeCount === 1 && details.reapplied.themeRegionCount === 5) {
      phases.push("reapplied");
    }

    await removeFromSession(session);
    details.removedAgain = await verifyRemovedSession(session);
    if (details.removedAgain) phases.push("removed-again");

    await applyToSession(session, loaded.payload);
    details.appliedFinal = await waitForVerifiedSession(session, options.timeoutMs);
    if (details.appliedFinal?.pass && details.appliedFinal.styleCount === 1 &&
      details.appliedFinal.chromeCount === 1 && details.appliedFinal.themeRegionCount === 5) {
      phases.push("applied-final");
    }

    details.nativeIdentity = await session.evaluate(`(() => {
      const stored = window.__CODEX_2007_ACCEPTANCE_NATIVE__ || {};
      const values = Object.values(stored);
      const pass = values.every(({ node, parent }) => !node || (
        node.isConnected && node.parentNode === parent
      ));
      delete window.__CODEX_2007_ACCEPTANCE_NATIVE__;
      return { pass, checked: values.filter(({ node }) => Boolean(node)).length };
    })()`);
  } finally {
    await session.evaluate("delete window.__CODEX_2007_ACCEPTANCE_NATIVE__").catch(() => {});
    session.close();
  }

  const expectedPhases = ["removed", "applied", "reapplied", "removed-again", "applied-final"];
  const nativeIdentityPass = details.nativeIdentity?.pass === true && details.nativeIdentity.checked > 0;
  const pass = nativeIdentityPass && JSON.stringify(phases) === JSON.stringify(expectedPhases);
  const evidence = {
    schemaVersion: CODEX_2007_ACCEPTANCE_PLAN.schemaVersion,
    pass,
    nativeIdentityPass,
    phases,
    details,
  };
  if (options.lifecycleOutput) await writeJsonEvidence(options.lifecycleOutput, evidence);
  console.log(JSON.stringify(evidence, null, 2));
  if (!pass) process.exitCode = 2;
}

async function runOneShot(options) {
  const connected = await connectCodexTargets(options.port, options.timeoutMs);
  const loaded = (options.mode === "once" || options.reload) ? await loadPayload(options.themeDir) : null;
  const payload = loaded?.payload ?? null;
  const results = [];
  let screenshotCaptured = false;

  for (const { target, session, probe } of connected) {
    try {
      if (options.mode === "remove") await removeFromSession(session);
      else if (options.mode === "once") await applyToSession(session, payload);

      if (options.reload) {
        await session.send("Page.reload", { ignoreCache: true });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        if (options.mode !== "remove") await applyToSession(session, payload);
      }

      const result = options.mode === "remove"
        ? await verifyRemovedSession(session)
        : await waitForVerifiedSession(session, options.timeoutMs);
      results.push({ targetId: target.id, title: target.title, url: target.url, probe, result });

      if (options.screenshot && !screenshotCaptured) {
        await capture(session, options.screenshot);
        screenshotCaptured = true;
      }
    } finally {
      session.close();
    }
  }

  console.log(JSON.stringify({ mode: options.mode, version: SKIN_VERSION, port: options.port, targets: results }, null, 2));
  const failed = results.length === 0 || results.some((item) => options.mode === "remove" ? item.result !== true : !item.result?.pass);
  if (failed) process.exitCode = 2;
}

export function earlyPayloadFor(payload, revision) {
  return `(() => {
    const generationKey = "__CODEX_DREAM_SKIN_EARLY_GENERATION__";
    const appliedKey = "__CODEX_DREAM_SKIN_EARLY_APPLIED__";
    const generation = ${JSON.stringify(revision)};
    window[generationKey] = generation;
    let observer = null;
    let timeout = null;
    const stop = () => {
      observer?.disconnect();
      observer = null;
      if (timeout) clearTimeout(timeout);
      timeout = null;
    };
    const install = () => {
      if (window[generationKey] !== generation) { stop(); return true; }
      if (!document.documentElement) return false;
      const shell = document.querySelector('main.main-surface');
      const sidebar = document.querySelector('aside.app-shell-left-panel');
      if (!shell || !sidebar) return false;
      stop();
      ${payload};
      window[appliedKey] = generation;
      return true;
    };
    if (install()) return;
    if (typeof MutationObserver === "function" && document.documentElement) {
      observer = new MutationObserver(install);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    timeout = setTimeout(stop, 10000);
  })()`;
}

function watchPayloadSources(themeDir, onDirty) {
  const assetsRoot = path.join(root, "assets");
  const themeRoot = themeDir ?? assetsRoot;
  const watchers = [];
  const add = (directory, kind) => {
    let watcher;
    try {
      watcher = watchFs(directory, { persistent: false }, (_event, filename) => {
        const name = filename ? String(filename) : "";
        const staticChanged = directory === assetsRoot &&
          (!name || name === "dream-skin.css" || name === "renderer-inject.js" || name === "qq2007-icons.png");
        if (kind === "static" && !staticChanged) return;
        onDirty({ staticChanged });
      });
      watcher.on("error", (error) => {
        console.error(`[dream-skin] file watch unavailable for ${directory}: ${error.message}`);
      });
      watchers.push(watcher);
    } catch (error) {
      console.error(`[dream-skin] file watch unavailable for ${directory}: ${error.message}`);
    }
  };
  add(themeRoot, "theme");
  if (themeRoot !== assetsRoot) add(assetsRoot, "static");
  return () => watchers.forEach((watcher) => watcher.close());
}

async function runWatch(options) {
  let current = await loadPayload(options.themeDir);
  const sessions = new Map();
  const rejected = new Set();
  let stopping = false;
  let reloadTimer = null;
  let reloadChain = Promise.resolve();
  let discoveryDelayMs = 100;
  let lastListErrorAt = 0;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const registerEarly = async (session, payload, revision) => {
    const result = await session.send("Page.addScriptToEvaluateOnNewDocument", {
      source: earlyPayloadFor(payload, revision),
    });
    return result.identifier ?? null;
  };

  const removeEarly = async (record) => {
    if (!record.earlyScriptId || record.session.closed) return;
    const identifier = record.earlyScriptId;
    record.earlyScriptId = null;
    await record.session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => {});
  };

  const refreshPayload = async () => {
    const next = await loadPayload(options.themeDir);
    if (next.revision === current.revision) return;
    current = next;
    for (const record of sessions.values()) {
      const { session } = record;
      if (session.closed) continue;
      try {
        const nextIdentifier = await registerEarly(session, current.payload, current.revision);
        if (record.earlyScriptId) {
          await session.send("Page.removeScriptToEvaluateOnNewDocument", {
            identifier: record.earlyScriptId,
          }).catch(() => {});
        }
        record.earlyScriptId = nextIdentifier;
        record.needsLoadFallback = !nextIdentifier;
        await applyToSession(session, current.payload);
      } catch (error) {
        record.needsLoadFallback = true;
        console.error(`[dream-skin] theme refresh failed: ${error.message}`);
      }
    }
    console.log(`[dream-skin] refreshed theme ${current.theme.id} (${current.timings.buildMs}ms)`);
  };

  const queuePayloadRefresh = ({ staticChanged = false } = {}) => {
    if (staticChanged) invalidateStaticPayloadAssets();
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      reloadChain = reloadChain.then(refreshPayload).catch((error) => {
        console.error(`[dream-skin] theme reload failed: ${error.message}`);
      });
    }, 45);
  };
  const closePayloadWatchers = watchPayloadSources(options.themeDir, queuePayloadRefresh);

  try {
    while (!stopping) {
      let targets = [];
      try {
        targets = await listAppTargets(options.port);
        discoveryDelayMs = 100;
      } catch (error) {
        if (Date.now() - lastListErrorAt >= 2000) {
          console.error(`[dream-skin] ${new Date().toISOString()} ${error.message}`);
          lastListErrorAt = Date.now();
        }
        await new Promise((resolve) => setTimeout(resolve, discoveryDelayMs));
        discoveryDelayMs = Math.min(500, Math.round(discoveryDelayMs * 1.6));
        continue;
      }

      const activeIds = new Set(targets.map((target) => target.id));
      for (const [id, record] of sessions) {
        if (!activeIds.has(id) || record.session.closed) {
          record.session.close();
          sessions.delete(id);
        }
      }

      for (const target of targets) {
        if (sessions.has(target.id)) continue;
        let session;
        let record;
        try {
          session = await connectTarget(target, options.port);
          record = { session, earlyScriptId: null, needsLoadFallback: false };
          try {
            record.earlyScriptId = await registerEarly(session, current.payload, current.revision);
            await session.evaluate(earlyPayloadFor(current.payload, current.revision));
          } catch (error) {
            record.needsLoadFallback = true;
            console.error(`[dream-skin] early injection unavailable: ${error.message}`);
          }
          const probe = await waitForCodexProbe(session);
          if (!probe?.codex) {
            await removeEarly(record);
            session.close();
            if (!rejected.has(target.id)) {
              console.error(`[dream-skin] rejected non-Codex app target ${target.id}`);
              rejected.add(target.id);
            }
            continue;
          }
          rejected.delete(target.id);
          session.on("Page.loadEventFired", () => {
            if (!record.needsLoadFallback) return;
            setTimeout(() => applyToSession(session, current.payload).catch((error) => {
              console.error(`[dream-skin] fallback reinject failed: ${error.message}`);
            }), 0);
          });
          const earlyApplied = await session.evaluate(
            `window.__CODEX_DREAM_SKIN_EARLY_APPLIED__ === ${JSON.stringify(current.revision)}`,
          );
          if (!earlyApplied) {
            await session.evaluate(
              `window.__CODEX_DREAM_SKIN_EARLY_GENERATION__ = ${JSON.stringify(`fallback:${current.revision}`)}`,
            );
            await applyToSession(session, current.payload);
          }
          sessions.set(target.id, record);
          console.log(`[dream-skin] injected verified Codex target ${target.id} (${target.title || target.url})`);
        } catch (error) {
          if (record) await removeEarly(record);
          session?.close();
          console.error(`[dream-skin] inject failed for ${target.id}: ${error.message}`);
        }
      }
      const pollDelay = sessions.size ? 800 : (targets.length ? 250 : 100);
      await new Promise((resolve) => setTimeout(resolve, pollDelay));
    }
  } finally {
    if (reloadTimer) clearTimeout(reloadTimer);
    closePayloadWatchers();
    await reloadChain.catch(() => {});
    await Promise.all([...sessions.values()].map((record) => removeEarly(record)));
    for (const record of sessions.values()) record.session.close();
  }
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.mode === "check") {
      const loaded = await loadPayload(options.themeDir);
      console.log(JSON.stringify({
        pass: true,
        version: SKIN_VERSION,
        themeId: loaded.theme.id,
        themeName: loaded.theme.name,
        decorationKeys: Object.keys(loaded.theme.decorationData || {}).sort(),
        imageBytes: loaded.imageBytes,
        iconSpriteBytes: loaded.iconSpriteBytes,
        payloadBytes: Buffer.byteLength(loaded.payload),
        artMetadata: loaded.theme.artMetadata ?? null,
        timings: loaded.timings,
      }, null, 2));
    } else if (options.mode === "watch") await runWatch(options);
    else if (options.mode === "matrix") await runAcceptanceMatrix(options);
    else if (options.mode === "lifecycle") await runLifecycleSmoke(options);
    else await runOneShot(options);
  } catch (error) {
    console.error(`[dream-skin] ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}
