((cssText, artDataUrl, themeConfig) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const DISABLED_KEY = "__CODEX_DREAM_SKIN_DISABLED__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const SHELL_ATTR = "data-dream-shell";
  const ART_ATTRS = [
    "data-dream-art-wide", "data-dream-art-safe", "data-dream-task-mode",
    "data-dream-art-safe-area", "data-dream-art-task-mode", "data-dream-art-aspect",
    "data-dream-art-ready",
    "data-dream-skin-mode",
    "data-ds1907-status",
    "data-ds2007-friends",
    "data-ds2007-native-right",
    "data-ds2007-native-right-label",
    "data-ds2007-native-right-layout",
    "data-ds2007-view",
  ];
  const VERSION = __DREAM_SKIN_VERSION_JSON__;
  const STYLE_REVISION = __DREAM_SKIN_STYLE_REVISION_JSON__;
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  const ART = THEME.art && typeof THEME.art === "object" ? THEME.art : {};
  const PROFILE = THEME.profile && typeof THEME.profile === "object" ? THEME.profile : {};
  const DECORATION_DATA = THEME.decorationData && typeof THEME.decorationData === "object"
    ? THEME.decorationData : {};
  const ART_METADATA = THEME.artMetadata && typeof THEME.artMetadata === "object"
    ? THEME.artMetadata : null;
  const ANALYSIS_CACHE_KEY = "__CODEX_DREAM_SKIN_ANALYSIS_CACHE__";
  const THEME_VARIABLES = [
    "--ds-bg", "--ds-panel", "--ds-panel-2", "--ds-green", "--ds-lime",
    "--ds-cyan", "--ds-purple", "--ds-text", "--ds-muted", "--ds-line",
    "--ds-bg-rgb", "--ds-panel-rgb", "--ds-panel-2-rgb", "--ds-accent-rgb",
    "--ds-accent-alt-rgb", "--ds-secondary-rgb", "--ds-highlight-rgb",
    "--ds-text-rgb", "--ds-muted-rgb", "--ds-line-rgb",
    "--dream-art-focus-x", "--dream-art-focus-y", "--dream-art-position",
    "--dream-skin-focus-x", "--dream-skin-focus-y", "--dream-skin-art-position",
    "--dream-skin-name", "--dream-skin-tagline", "--dream-skin-project-prefix",
    "--dream-skin-project-label",
    "--ds1907-assistant-avatar",
    "--ds1907-sidebar-width",
  ];
  const installToken = {};
  const existingAnalysisCache = window[ANALYSIS_CACHE_KEY];
  const analysisCache = existingAnalysisCache && typeof existingAnalysisCache.get === "function" &&
    typeof existingAnalysisCache.set === "function" ? existingAnalysisCache : new Map();
  window[ANALYSIS_CACHE_KEY] = analysisCache;
  let artAnalysis = typeof THEME.artKey === "string" ? analysisCache.get(THEME.artKey) ?? null : null;
  let analysisTimer = null;
  let samplingNativeShell = false;
  let rootObserver = null;
  const now = () => typeof performance === "object" && typeof performance.now === "function"
    ? performance.now() : Date.now();
  const metrics = {
    ensureCalls: 0,
    rootPasses: 0,
    routePasses: 0,
    layoutReads: 0,
    attributeWrites: 0,
    styleWrites: 0,
    textWrites: 0,
    analysisRuns: 0,
    analysisCacheHits: artAnalysis ? 1 : 0,
    firstEnsureMs: null,
    analysisMs: null,
  };
  window[DISABLED_KEY] = false;

  const previous = window[STATE_KEY];
  const artUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  })();

  if (previous?.observer) previous.observer.disconnect();
  if (previous?.rootObserver) previous.rootObserver.disconnect();
  if (previous?.resizeObserver) previous.resizeObserver.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(previous.scheduler.frame);
  }
  if (previous?.analysisTimer) clearTimeout(previous.analysisTimer);
  if (previous?.resizeHandler) window.removeEventListener("resize", previous.resizeHandler);
  previous?.cancelFrameLayout?.();
  previous?.disposeInteractions?.();
  if (previous?.mediaHandler && previous?.mediaQuery) {
    try { previous.mediaQuery.removeEventListener("change", previous.mediaHandler); } catch {}
  }

  const cssString = (value) => JSON.stringify(String(value ?? ""));
  const setStyleProperty = (root, name, value) => {
    if (root.style.getPropertyValue(name) !== value) {
      root.style.setProperty(name, value);
      metrics.styleWrites += 1;
    }
  };

  const setAttribute = (root, name, value) => {
    const normalized = String(value);
    if (root.getAttribute(name) !== normalized) {
      root.setAttribute(name, normalized);
      metrics.attributeWrites += 1;
    }
  };

  const setTextContent = (node, value) => {
    if (node && node.textContent !== value) {
      node.textContent = value;
      metrics.textWrites += 1;
    }
  };

  const parseRgb = (value) => {
    if (!value || value === "transparent") return null;
    const hex = String(value).trim().match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const number = Number.parseInt(hex[1], 16);
      return { r: number >> 16, g: (number >> 8) & 255, b: number & 255 };
    }
    const m = String(value).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const rgbString = (value) => {
    const rgb = parseRgb(value);
    return rgb ? `${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)}` : null;
  };

  const rgbToHex = ({ r, g, b }) => `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;

  const rgbToHsl = ({ r, g, b }) => {
    const values = [r, g, b].map((value) => value / 255);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const lightness = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: lightness };
    const delta = max - min;
    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let hue;
    if (max === values[0]) hue = (values[1] - values[2]) / delta + (values[1] < values[2] ? 6 : 0);
    else if (max === values[1]) hue = (values[2] - values[0]) / delta + 2;
    else hue = (values[0] - values[1]) / delta + 4;
    return { h: hue * 60, s: saturation, l: lightness };
  };

  const hslToRgb = ({ h, s, l }) => {
    const hue = ((h % 360) + 360) % 360 / 360;
    if (s === 0) {
      const neutral = Math.round(l * 255);
      return { r: neutral, g: neutral, b: neutral };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (offset) => {
      let t = hue + offset;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: channel(1 / 3) * 255, g: channel(0) * 255, b: channel(-1 / 3) * 255 };
  };

  const luminance = ({ r, g, b }) => {
    const lin = [r, g, b].map((c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };

  /** Detect Codex app light/dark shell for CSS branching. */
  const detectShellMode = () => {
    const root = document.documentElement;
    const body = document.body;
    const cls = `${root.className || ""} ${body?.className || ""}`.toLowerCase();

    if (/\b(dark|theme-dark|appearance-dark)\b/.test(cls)) return "dark";
    if (/\b(light|theme-light|appearance-light)\b/.test(cls)) return "light";

    const dataTheme = (
      root.getAttribute("data-theme") ||
      root.getAttribute("data-appearance") ||
      root.getAttribute("data-color-mode") ||
      body?.getAttribute("data-theme") ||
      body?.getAttribute("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    // Radios in profile menu (if present in DOM)
    const checked = document.querySelector('input[name="appearance-theme"]:checked');
    if (checked) {
      const label = (checked.getAttribute("aria-label") || checked.value || "").toLowerCase();
      if (label.includes("暗") || label.includes("dark")) return "dark";
      if (label.includes("浅") || label.includes("light")) return "light";
      if (label.includes("系统") || label.includes("system")) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
    }

    // The skin itself declares color-scheme on :root.  Once installed,
    // reading getComputedStyle(root) directly would therefore keep `auto`
    // themes locked to the previous shell mode. Temporarily remove only our
    // own root class/attribute, sample the native computed scheme, then restore
    // synchronously. Mutation records created by this probe are drained below
    // so the root observer does not schedule a redundant ensure pass.
    try {
      const hadSkin = root.classList.contains("codex-dream-skin");
      const savedShell = root.getAttribute(SHELL_ATTR);
      samplingNativeShell = true;
      if (hadSkin) root.classList.remove("codex-dream-skin");
      if (savedShell !== null) root.removeAttribute(SHELL_ATTR);
      let colorScheme = "";
      try {
        colorScheme = getComputedStyle(root).colorScheme || "";
      } finally {
        if (hadSkin) root.classList.add("codex-dream-skin");
        if (savedShell !== null) root.setAttribute(SHELL_ATTR, savedShell);
        rootObserver?.takeRecords?.();
        samplingNativeShell = false;
      }
      if (colorScheme.includes("dark") && !colorScheme.includes("light")) return "dark";
      if (colorScheme.includes("light") && !colorScheme.includes("dark")) return "light";
    } catch {
      samplingNativeShell = false;
    }

    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {}

    // Only use surface luminance before the skin owns those surfaces. Sampling
    // our own translucent layers would create route-dependent light/dark flips.
    if (!root.classList.contains("codex-dream-skin")) {
      const samples = [
        body,
        document.querySelector("main.main-surface"),
        document.querySelector("aside.app-shell-left-panel"),
      ].filter(Boolean);
      let votesLight = 0;
      let votesDark = 0;
      for (const el of samples) {
        try {
          const rgb = parseRgb(getComputedStyle(el).backgroundColor);
          if (!rgb) continue;
          const L = luminance(rgb);
          if (L >= 0.55) votesLight += 1;
          else if (L <= 0.25) votesDark += 1;
        } catch {}
      }
      if (votesLight > votesDark) return "light";
      if (votesDark > votesLight) return "dark";
    }
    return "light";
  };

  const makeAdaptivePalette = (sample, shell) => {
    const source = sample || { r: 108, g: 126, b: 136 };
    const hsl = rgbToHsl(source);
    const hue = hsl.s < 0.12 ? 214 : hsl.h;
    const saturation = clamp(hsl.s, 0.38, 0.72);
    const accent = hslToRgb({ h: hue, s: saturation, l: shell === "light" ? 0.42 : 0.66 });
    const accentAlt = hslToRgb({ h: hue + 12, s: saturation * 0.82, l: shell === "light" ? 0.52 : 0.73 });
    const secondary = hslToRgb({ h: hue - 24, s: saturation * 0.64, l: shell === "light" ? 0.56 : 0.62 });
    const highlight = hslToRgb({ h: hue + 24, s: saturation * 0.76, l: shell === "light" ? 0.36 : 0.58 });
    const neutral = (lightness, chroma = 0.08) => rgbToHex(hslToRgb({ h: hue, s: chroma, l: lightness }));
    return shell === "light" ? {
      background: neutral(0.965, 0.07),
      panel: neutral(0.987, 0.035),
      panelAlt: neutral(0.945, 0.09),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.13, 0.10),
      muted: neutral(0.42, 0.08),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .24)`,
    } : {
      background: neutral(0.055, 0.045),
      panel: neutral(0.085, 0.04),
      panelAlt: neutral(0.125, 0.05),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.93, 0.025),
      muted: neutral(0.69, 0.03),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .28)`,
    };
  };

  const resolvedShell = () => {
    if (THEME.appearance === "light" || THEME.appearance === "dark") return THEME.appearance;
    // Image luminance may tune accents and scrims, but auto appearance follows
    // Codex/ChatGPT (or the OS fallback) so a bright wallpaper cannot flip a
    // native dark session back to a light shell after analysis.
    return detectShellMode();
  };

  const applyTheme = (root, shell) => {
    const colors = THEME.colors || {};
    const explicit = new Set(Array.isArray(THEME.explicitColorKeys) ? THEME.explicitColorKeys : []);
    const adaptive = makeAdaptivePalette(artAnalysis?.accentRgb, shell);
    const legacyLight = !THEME.appearance && shell === "light";
    const structural = new Set(["background", "panel", "panelAlt", "text", "muted"]);
    const pick = (name) => {
      const allowExplicit = explicit.has(name) && !(legacyLight && structural.has(name));
      return allowExplicit && typeof colors[name] === "string" ? colors[name] : adaptive[name];
    };
    const accent = pick("accent");
    const accentAlt = explicit.has("accentAlt") ? pick("accentAlt") : (explicit.has("accent") ? accent : adaptive.accentAlt);
    const variables = {
      "--ds-bg": pick("background"),
      "--ds-panel": pick("panel"),
      "--ds-panel-2": pick("panelAlt"),
      "--ds-green": accent,
      "--ds-lime": accentAlt,
      "--ds-cyan": pick("secondary"),
      "--ds-purple": pick("highlight"),
      "--ds-text": pick("text"),
      "--ds-muted": pick("muted"),
      "--ds-line": explicit.has("line") && typeof colors.line === "string" ? colors.line : adaptive.line,
    };

    for (const [name, value] of Object.entries(variables)) {
      if (typeof value === "string" && value) setStyleProperty(root, name, value);
    }
    const rgbVariables = {
      "--ds-bg-rgb": variables["--ds-bg"],
      "--ds-panel-rgb": variables["--ds-panel"],
      "--ds-panel-2-rgb": variables["--ds-panel-2"],
      "--ds-accent-rgb": variables["--ds-green"],
      "--ds-accent-alt-rgb": variables["--ds-lime"],
      "--ds-secondary-rgb": variables["--ds-cyan"],
      "--ds-highlight-rgb": variables["--ds-purple"],
      "--ds-text-rgb": variables["--ds-text"],
      "--ds-muted-rgb": variables["--ds-muted"],
      "--ds-line-rgb": variables["--ds-line"],
    };
    for (const [name, value] of Object.entries(rgbVariables)) {
      const rgb = rgbString(value);
      if (rgb) setStyleProperty(root, name, rgb);
    }
    setStyleProperty(root, "--dream-skin-name", cssString(THEME.name || "Codex Dream Skin"));
    setStyleProperty(root, "--dream-skin-tagline", cssString(THEME.tagline || "Make something wonderful."));
    setStyleProperty(root, "--dream-skin-project-prefix", cssString(THEME.projectPrefix || "选择项目 · "));
    setStyleProperty(root, "--dream-skin-project-label", cssString(THEME.projectLabel || "◉  选择项目"));
  };

  const applyArtMetadata = (root) => {
    const profile = artAnalysis || ART_METADATA;
    const inferredSafe = profile?.safeArea || "center";
    const safeArea = ART.safeArea && ART.safeArea !== "auto" ? ART.safeArea : inferredSafe;
    const canonicalSafe = ["left", "right", "center", "none"].includes(safeArea)
      ? safeArea : "center";
    const focusX = typeof ART.focusX === "number" ? ART.focusX
      : profile?.focusX ?? (safeArea === "left" ? 0.72 : safeArea === "right" ? 0.28 : 0.5);
    const focusY = typeof ART.focusY === "number" ? ART.focusY : profile?.focusY ?? 0.5;
    const taskMode = ART.taskMode && ART.taskMode !== "auto"
      ? ART.taskMode : profile?.taskMode || "ambient";
    const wide = profile?.wide || false;
    const aspect = profile?.aspect || "unknown";
    const focusXValue = `${(clamp(focusX, 0, 1) * 100).toFixed(2)}%`;
    const focusYValue = `${(clamp(focusY, 0, 1) * 100).toFixed(2)}%`;

    setAttribute(root, "data-dream-art-wide", wide ? "true" : "false");
    setAttribute(root, "data-dream-art-safe", canonicalSafe);
    setAttribute(root, "data-dream-task-mode", taskMode);
    setAttribute(root, "data-dream-art-safe-area", safeArea);
    setAttribute(root, "data-dream-art-task-mode", taskMode);
    setAttribute(root, "data-dream-art-aspect", aspect);
    setAttribute(root, "data-dream-art-ready", artAnalysis ? "true" : "false");
    setStyleProperty(root, "--dream-art-focus-x", focusXValue);
    setStyleProperty(root, "--dream-art-focus-y", focusYValue);
    setStyleProperty(root, "--dream-art-position", `${focusXValue} ${focusYValue}`);
    setStyleProperty(root, "--dream-skin-focus-x", focusXValue);
    setStyleProperty(root, "--dream-skin-focus-y", focusYValue);
    setStyleProperty(root, "--dream-skin-art-position", `${focusXValue} ${focusYValue}`);
  };

  const analyzeArt = () => new Promise((resolve) => {
    const startedAt = now();
    metrics.analysisRuns += 1;
    if (typeof window.Image !== "function" || !document?.createElement) {
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(null);
      return;
    }
    const image = new window.Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (analysisTimer) clearTimeout(analysisTimer);
      analysisTimer = null;
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(value);
    };
    analysisTimer = setTimeout(() => finish(null), 6000);
    image.onerror = () => finish(null);
    image.onload = () => {
      try {
        const ratio = image.naturalWidth / image.naturalHeight;
        if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("Invalid image dimensions");
        const maxDimension = 96;
        const width = Math.max(16, Math.round(ratio >= 1 ? maxDimension : maxDimension * ratio));
        const height = Math.max(16, Math.round(ratio >= 1 ? maxDimension / ratio : maxDimension));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        const samples = new Array(width * height);
        const bins = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
        let lightTotal = 0;
        let count = 0;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;
            if (data[offset + 3] < 32) continue;
            const rgb = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
            const light = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
            const hsl = rgbToHsl(rgb);
            samples[y * width + x] = { light, saturation: hsl.s };
            lightTotal += light;
            count += 1;
            if (hsl.s >= 0.16 && hsl.l >= 0.16 && hsl.l <= 0.86) {
              const bin = bins[Math.min(23, Math.floor(hsl.h / 15))];
              const weight = hsl.s * (1 - Math.abs(hsl.l - 0.52) * 0.85);
              bin.weight += weight;
              bin.r += rgb.r * weight;
              bin.g += rgb.g * weight;
              bin.b += rgb.b * weight;
            }
          }
        }
        if (!count) throw new Error("Image has no visible pixels");
        const brightness = lightTotal / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let pixels = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = samples[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              pixels += 1;
              const previous = x > start ? samples[y * width + x - 1] : null;
              const above = y > 0 ? samples[(y - 1) * width + x] : null;
              if (previous) { edges += Math.abs(sample.light - previous.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = pixels ? total / pixels : 0;
          const variance = pixels ? Math.max(0, totalSquared / pixels - mean * mean) : 1;
          return Math.sqrt(variance) * 0.58 + (edgeCount ? edges / edgeCount : 1) * 0.42;
        };
        const zoneWidth = Math.max(1, Math.floor(width * 0.38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * 0.86) safeArea = "left";
        else if (rightInformation < leftInformation * 0.86) safeArea = "right";

        let saliencyTotal = 0;
        let saliencyX = 0;
        let saliencyY = 0;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const sample = samples[y * width + x];
            if (!sample) continue;
            const previous = x > 0 ? samples[y * width + x - 1] : null;
            const above = y > 0 ? samples[(y - 1) * width + x] : null;
            const edge = (previous ? Math.abs(sample.light - previous.light) : 0) +
              (above ? Math.abs(sample.light - above.light) : 0);
            const weight = 0.01 + Math.abs(sample.light - brightness) * 0.48 +
              sample.saturation * 0.34 + edge * 0.28;
            saliencyTotal += weight;
            saliencyX += (x + 0.5) / width * weight;
            saliencyY += (y + 0.5) / height * weight;
          }
        }
        let focusX = saliencyTotal ? saliencyX / saliencyTotal : 0.5;
        let focusY = saliencyTotal ? saliencyY / saliencyTotal : 0.5;
        if (safeArea === "left") focusX = Math.max(0.64, focusX);
        if (safeArea === "right") focusX = Math.min(0.36, focusX);
        focusX = clamp(focusX, 0.12, 0.88);
        focusY = clamp(focusY, 0.18, 0.82);

        const accentBin = bins.reduce((best, candidate) => candidate.weight > best.weight ? candidate : best, bins[0]);
        const accentRgb = accentBin.weight > 0 ? {
          r: accentBin.r / accentBin.weight,
          g: accentBin.g / accentBin.weight,
          b: accentBin.b / accentBin.weight,
        } : null;
        const aspect = ratio >= 2.25 ? "ultrawide" : ratio >= 1.45 ? "wide"
          : ratio >= 1.08 ? "landscape" : ratio >= 0.9 ? "square" : "portrait";
        finish({
          width: image.naturalWidth,
          height: image.naturalHeight,
          ratio,
          wide: ratio >= 1.75,
          aspect,
          brightness,
          shell: brightness >= 0.58 ? "light" : "dark",
          safeArea,
          focusX,
          focusY,
          taskMode: ratio >= 2.25 ? "banner" : "ambient",
          accentRgb,
        });
      } catch {
        finish(null);
      }
    };
    image.src = artUrl;
  });

  let chromeParts = null;
  let codexPetSnapshot;
  const FRIENDS_KEY = "codex-dream-skin.qq2007.friends";
  const VIEW_KEY = "codex-dream-skin.qq2007.view";
  const CODEX_PET_SELECTOR = '[data-testid="codex-avatar"][data-avatar-asset-ref]';
  const NATIVE_RIGHT_PORTAL_SELECTOR = [
    '[data-slot="popover-content"]',
    '[data-slot="dialog-content"]',
    '[role="dialog"]',
  ].join(", ");
  const NATIVE_RIGHT_PANEL_SELECTOR = [
    "aside:not(.app-shell-left-panel):not(.ds2007-friends)",
    '[data-testid*="side-panel"]',
    '[data-testid*="review-panel"]',
  ].join(", ");
  const NATIVE_RIGHT_SIGNAL_SELECTOR = [
    '[data-slot="thread-summary-panel-section-actions"]',
    'button[aria-label="关闭审阅标签页"]',
    'button[aria-label="Close review tab"]',
  ].join(", ");
  const NATIVE_RIGHT_TOGGLE_SELECTOR = [
    'button[aria-label="显示/隐藏侧边栏"]',
    'button[aria-label="Show/hide sidebar"]',
    'button[aria-label="切换置顶摘要"]',
    'button[aria-label="Toggle pinned summary"]',
    'button[aria-label="切换摘要"]',
    'button[aria-label="Toggle summary"]',
  ].join(", ");
  const interactionBindings = [];
  const bindInteraction = (target, type, handler, marker) => {
    if (!target?.addEventListener || target.dataset?.[marker]) return;
    if (target.dataset) target.dataset[marker] = "true";
    target.addEventListener(type, handler);
    interactionBindings.push(() => {
      target.removeEventListener?.(type, handler);
      if (target.dataset) delete target.dataset[marker];
    });
  };
  const disposeInteractions = () => {
    while (interactionBindings.length) interactionBindings.pop()?.();
    document.querySelectorAll?.(".ds2007-context-menu")?.forEach?.((node) => node.remove?.());
  };

  const readStoredJson = (key, fallback) => {
    try {
      const value = window.localStorage?.getItem?.(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  };

  const writeStoredJson = (key, value) => {
    try { window.localStorage?.setItem?.(key, JSON.stringify(value)); } catch {}
  };
  let skinView = readStoredJson(VIEW_KEY, "deep") === "native" ? "native" : "deep";

  const normalizedLabel = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();
  const setNativeRightVisible = (visible) => {
    const desiredPressed = visible ? "false" : "true";
    const toggles = [...(document.querySelectorAll?.(NATIVE_RIGHT_TOGGLE_SELECTOR) || [])];
    const preferredLabels = visible
      ? ["切换置顶摘要", "Toggle pinned summary", "显示/隐藏侧边栏", "Show/hide sidebar", "切换摘要", "Toggle summary"]
      : ["切换置顶摘要", "Toggle pinned summary", "显示/隐藏侧边栏", "Show/hide sidebar", "切换摘要", "Toggle summary"];
    const toggle = preferredLabels
      .map((label) => toggles.find((candidate) =>
        candidate.getAttribute?.("aria-label") === label &&
        candidate.getAttribute?.("aria-pressed") === desiredPressed))
      .find(Boolean);
    const close = visible ? null : document.querySelector?.(
      'button[aria-label="关闭审阅标签页"], button[aria-label="Close review tab"]',
    );
    const control = toggle || close;
    if (!control) return false;
    control.click?.();
    scheduleEnsure({ route: true, layout: false });
    return true;
  };
  const readCodexPetSnapshot = () => {
    if (codexPetSnapshot !== undefined) return codexPetSnapshot;
    const source = document.querySelector?.(CODEX_PET_SELECTOR);
    const backgroundImage = source ? getComputedStyle(source).backgroundImage : "";
    codexPetSnapshot = source && backgroundImage && backgroundImage !== "none"
      ? { assetRef: source.getAttribute?.("data-avatar-asset-ref") || "codex", backgroundImage }
      : null;
    return codexPetSnapshot;
  };
  const isVisiblyOpen = (node, shellMain) => {
    const box = node?.getBoundingClientRect?.();
    const shellBox = shellMain?.getBoundingClientRect?.();
    if (!box || !shellBox || box.width <= 0 || box.height <= 0 ||
      box.right <= shellBox.left || box.left >= innerWidth ||
      box.bottom <= shellBox.top || box.top >= shellBox.bottom) return false;
    let current = node;
    while (current && current !== shellMain.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0.01) return false;
      if (current === shellMain) break;
      current = current.parentElement;
    }
    return true;
  };
  const persistentNativeRightOwner = (candidate, shellMain) => {
    if (candidate.matches?.(NATIVE_RIGHT_PANEL_SELECTOR)) return candidate;
    let current = candidate.parentElement;
    while (current && current !== shellMain) {
      const box = current.getBoundingClientRect?.();
      if (box?.width >= 220 && box?.height >= 240) return current;
      current = current.parentElement;
    }
    return null;
  };
  const nativeRightLabel = (owner) => {
    if (!owner) return "环境信息";
    const signature = [
      owner.getAttribute?.("data-testid") || "",
      owner.getAttribute?.("aria-label") || "",
      String(owner.className || ""),
      normalizedLabel(owner),
    ].join(" ");
    if (/(审查|review|diff|变更)/i.test(signature)) return "代码审查";
    if (/(环境|environment)/i.test(signature)) return "环境信息";
    if (/(文件|file)/i.test(signature)) return "文件详情";
    return "Codex 信息";
  };
  const SIDEBAR_SECTIONS = new Map([
    ["置顶", "pinned"],
    ["项目", "projects"],
    ["展开显示", "expanded"],
    ["任务", "tasks"],
  ]);

  const clearSidebarMarker = (node) => {
    node?.classList?.remove("ds2007-toolbar-duplicate", "ds2007-project-entry", "ds2007-pinned-source", "ds2007-section-label");
    node?.removeAttribute?.("data-ds2007-project");
    node?.removeAttribute?.("data-ds2007-group");
    node?.removeAttribute?.("data-ds2007-section");
    node?.removeAttribute?.("data-ds2007-global-nav-source");
    node?.removeAttribute?.("data-ds2007-collapse-bound");
    node?.removeAttribute?.("data-ds2007-context-bound");
    node?.removeAttribute?.("data-qq2007-styled");
    node?.removeAttribute?.("data-qq2007-section");
    node?.removeAttribute?.("data-qq2007-toolbar-duplicate");
  };

  const styleSidebarSubtree = (node) => {
    if (!node || node.nodeType !== 1) return;
    const sidebar = node.matches?.("aside.app-shell-left-panel")
      ? node
      : node.closest?.("aside.app-shell-left-panel");
    if (!sidebar) return;
    const candidates = [];
    if (node.matches?.('button[class*="group/section-toggle"]')) candidates.push(node);
    candidates.push(...(node.querySelectorAll?.('button[class*="group/section-toggle"]') || []));
    for (const candidate of candidates) {
      if (candidate.dataset?.qq2007Styled) continue;
      const label = normalizedLabel(candidate);
      const section = SIDEBAR_SECTIONS.get(label);
      if (!section) continue;
      candidate.dataset.qq2007Styled = "section";
      candidate.dataset.qq2007Section = section;
    }
    if (node === sidebar) sidebar.dataset.qq2007Styled = "sidebar";
  };

  const clearComposerMarker = (node) => {
    node?.removeAttribute?.("data-qq2007-styled");
    node?.removeAttribute?.("data-qq2007-composer-region");
    node?.removeAttribute?.("data-qq2007-composer-control");
  };
  const directComposerBranch = (container, node) => {
    let branch = node;
    while (branch?.parentElement && branch.parentElement !== container) branch = branch.parentElement;
    return branch?.parentElement === container ? branch : null;
  };
  const styleComposerSubtree = (node) => {
    if (!node || node.nodeType !== 1) return;
    const composers = new Set();
    const closest = node.matches?.(".composer-surface-chrome")
      ? node
      : node.closest?.(".composer-surface-chrome");
    if (closest) composers.add(closest);
    for (const composer of node.querySelectorAll?.(".composer-surface-chrome") || []) composers.add(composer);
    for (const composer of composers) {
      const editor = composer.querySelector?.('[contenteditable="true"]');
      const attachment = composer.querySelector?.(
        'button[aria-label="添加文件等内容"], button[aria-label="Add files and more"]',
      );
      const voice = composer.querySelector?.(
        'button[aria-label="听写"], button[aria-label="Dictate"], button[aria-label="语音"], button[aria-label="Voice"]',
      );
      const send = composer.querySelector?.('button[class~="bg-token-foreground"]');
      if (!editor || !attachment || !send) continue;
      let footer = editor.parentElement;
      while (footer && footer !== composer && !(footer.contains(attachment) && footer.contains(send))) {
        footer = footer.parentElement;
      }
      if (!footer || footer === composer) continue;
      const editorRegion = directComposerBranch(footer, editor);
      const toolActions = directComposerBranch(footer, attachment);
      const actionFooter = directComposerBranch(footer, send);
      const permission = [...(toolActions?.querySelectorAll?.("button") || [])]
        .find((candidate) => candidate !== attachment);
      const model = [...(actionFooter?.querySelectorAll?.("button") || [])]
        .find((candidate) => candidate !== voice && candidate !== send);
      composer.dataset.qq2007Styled = "composer";
      footer.dataset.qq2007Styled = "composer-footer";
      footer.dataset.qq2007ComposerRegion = "footer";
      const attachmentTray = footer.parentElement?.previousElementSibling?.firstElementChild;
      if (attachmentTray && !attachmentTray.contains(editor) && !attachmentTray.contains(attachment)) {
        attachmentTray.dataset.qq2007ComposerRegion = "attachments";
      }
      for (const [candidate, region] of [
        [editorRegion, "editor"], [toolActions, "tool-actions"], [actionFooter, "action-footer"],
      ]) {
        if (!candidate) continue;
        candidate.dataset.qq2007Styled = `composer-${region}`;
        candidate.dataset.qq2007ComposerRegion = region;
      }
      for (const [candidate, control] of [
        [attachment, "attachment"], [editor, "editor"], [permission, "permission"],
        [model, "model"], [voice, "voice"], [send, "send"],
      ]) {
        if (candidate) candidate.dataset.qq2007ComposerControl = control;
      }
    }
  };

  const findPrimaryNavDestination = (sidebar, label) => {
    if (!sidebar) return null;
    if (label === "聊天") {
      return sidebar.querySelector?.('button[aria-label="Quick chat"], button[aria-label="快速聊天"]') || null;
    }
    return [...(sidebar.querySelectorAll?.('button, a, [role="button"]') || [])]
      .find((candidate) => normalizedLabel(candidate) === label) || null;
  };
  const markPrimaryNavSources = (sidebar, subtree = sidebar) => {
    if (!sidebar || !subtree) return;
    const newTask = findPrimaryNavDestination(sidebar, "新建任务");
    const newTaskHost = newTask?.parentElement || newTask;
    const candidates = [];
    if (subtree.matches?.('button, a, [role="button"]')) candidates.push(subtree);
    candidates.push(...(subtree.querySelectorAll?.('button, a, [role="button"]') || []));
    for (const destination of candidates) {
      const quickChat = ["Quick chat", "快速聊天"].includes(destination.getAttribute?.("aria-label"));
      const label = quickChat ? "聊天" : normalizedLabel(destination);
      if (!["新建任务", "已安排", "插件", "站点", "拉取请求", "聊天"].includes(label)) continue;
      const host = label === "新建任务" || (label === "聊天" && newTaskHost?.contains?.(destination))
        ? newTaskHost : destination;
      if (host?.dataset) host.dataset.ds2007GlobalNavSource = label;
    }
  };

  const cleanupLegacySidebarArtifacts = (sidebar) => {
    document.querySelectorAll?.(".ds2007-pinned-panel, .ds2007-context-menu")
      ?.forEach?.((node) => node.remove?.());
    for (const node of sidebar?.querySelectorAll?.(
      ".ds2007-toolbar-duplicate, .ds2007-project-entry, .ds2007-pinned-source, .ds2007-section-label, [data-qq2007-styled], [data-qq2007-toolbar-duplicate], [data-ds2007-context-bound], [data-ds2007-collapse-bound], [data-ds2007-global-nav-source]",
    ) || []) {
      clearSidebarMarker(node);
    }
    clearSidebarMarker(sidebar);
    for (const group of SIDEBAR_SECTIONS.values()) {
      document.documentElement?.removeAttribute(`data-ds2007-collapse-${group}`);
    }
    try {
      window.localStorage?.removeItem?.("codex-dream-skin.qq2007.pinned-projects");
      window.localStorage?.removeItem?.("codex-dream-skin.qq2007.collapsed-groups");
    } catch {}
  };

  const ensureStyle = (root) => {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = cssText;
      style.dataset.dreamSkinVersion = VERSION;
      (document.head || root).appendChild(style);
    } else if (style.dataset.dreamSkinStyleRevision !== STYLE_REVISION) {
      style.textContent = cssText;
    }
    style.dataset.dreamSkinVersion = VERSION;
    style.dataset.dreamSkinStyleRevision = STYLE_REVISION;
    return style;
  };

  const applyRootState = (root) => {
    metrics.rootPasses += 1;
    ensureStyle(root);
    const shell = resolvedShell();
    setAttribute(root, SHELL_ATTR, shell);
    setStyleProperty(root, "--dream-skin-art", `url("${artUrl}")`);
    if (DECORATION_DATA.assistant) {
      setStyleProperty(root, "--ds1907-assistant-avatar", `url("${DECORATION_DATA.assistant}")`);
    }
    applyTheme(root, shell);
    applyArtMetadata(root);
    setAttribute(root, "data-dream-skin-mode", THEME.mode === "deep" ? "qq2007" : "classic");
    setAttribute(root, "data-ds1907-status", PROFILE.status || "online");
    root.classList.add("codex-dream-skin");
    const chrome = document.getElementById(CHROME_ID);
    if (chrome && chrome.dataset.dreamShell !== shell) {
      chrome.dataset.dreamShell = shell;
      metrics.attributeWrites += 1;
    }
    return shell;
  };

  let frameLayoutTimer = null;
  const cancelFrameLayout = () => {
    if (frameLayoutTimer !== null) clearTimeout(frameLayoutTimer);
    frameLayoutTimer = null;
  };
  const syncFrameLayout = (shellMain, chrome) => {
    metrics.layoutReads += 1;
    const nativeHeader = shellMain?.querySelector?.(":scope > header.app-header-tint");
    const viewportWidth = Number(window.innerWidth) || 1280;
    let safeLeft = 82;
    let safeRight = 12;
    const protectedNodes = nativeHeader?.querySelectorAll?.(
      'button, a, [role="button"], span.min-w-0.truncate',
    ) || [];
    for (const node of protectedNodes) {
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const midpoint = rect.left + rect.width / 2;
      if (midpoint < viewportWidth / 2) safeLeft = Math.max(safeLeft, Math.ceil(rect.right) + 8);
      else safeRight = Math.max(safeRight, Math.ceil(viewportWidth - rect.left) + 8);
    }
    setStyleProperty(chrome, "--ds2007-title-safe-left", `${safeLeft}px`);
    setStyleProperty(chrome, "--ds2007-title-safe-right", `${safeRight}px`);
  };
  const scheduleFrameLayout = () => {
    if (frameLayoutTimer !== null) return;
    frameLayoutTimer = setTimeout(() => {
      frameLayoutTimer = null;
      const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
      const chrome = document.getElementById(CHROME_ID);
      if (shellMain && chrome) syncFrameLayout(shellMain, chrome);
    }, 64);
  };

  const syncRouteState = (shell, { layout = false } = {}) => {
    metrics.routePasses += 1;
    const root = document.documentElement;
    if (!root) return;
    shell ||= root.getAttribute(SHELL_ATTR) || resolvedShell();
    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    const homeIndicator = document.querySelector('[data-testid="home-icon"]');
    const home = homeIndicator?.closest('[role="main"]') ||
      [...document.querySelectorAll('[role="main"]')].find((candidate) =>
        candidate.querySelector('[data-feature="game-source"]') &&
        candidate.querySelector('.group\\\\/home-suggestions')) || null;
    for (const candidate of document.querySelectorAll('[role="main"].dream-skin-home')) {
      if (candidate !== home) candidate.classList.remove("dream-skin-home");
    }
    if (home) home.classList.add("dream-skin-home");
    const homeUtilityBars = new Set(home
      ? home.querySelectorAll('[class*="_homeUtilityBar_"]')
      : []);
    for (const candidate of document.querySelectorAll(".dream-skin-home-utility")) {
      if (!homeUtilityBars.has(candidate)) candidate.classList.remove("dream-skin-home-utility");
    }
    for (const candidate of homeUtilityBars) candidate.classList.add("dream-skin-home-utility");

    if (!shellMain || !document.body) return;
    shellMain.classList.toggle("dream-skin-home-shell", Boolean(home));
    let chrome = document.getElementById(CHROME_ID);
    if (chrome && chrome.dataset.ds2007Revision !== "15") {
      chrome.remove();
      chrome = null;
      chromeParts = null;
    }
    let created = false;
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.innerHTML = `
        <header class="ds2007-titlebar"><span class="ds2007-icon ds2007-icon--mascot ds2007-title-icon" aria-hidden="true"></span><b class="ds2007-window-title">Codex 2007</b></header>
        <nav class="ds2007-toolbar" aria-label="Codex 2007 全局工具栏">
          <button data-nav="新建任务"><i class="ds2007-icon ds2007-icon--new-task" aria-hidden="true"></i><span>新建任务</span></button>
          <button data-nav="已安排"><i class="ds2007-icon ds2007-icon--scheduled" aria-hidden="true"></i><span>已安排</span></button>
          <button data-nav="插件"><i class="ds2007-icon ds2007-icon--plugins" aria-hidden="true"></i><span>插件</span></button>
          <button data-nav="站点"><i class="ds2007-icon ds2007-icon--sites" aria-hidden="true"></i><span>站点</span></button>
          <button data-nav="拉取请求"><i class="ds2007-icon ds2007-icon--pull-request" aria-hidden="true"></i><span>拉取请求</span></button>
          <button data-nav="聊天"><i class="ds2007-icon ds2007-icon--chat" aria-hidden="true"></i><span>聊天</span></button>
          <button data-nav="换肤"><i class="ds2007-icon ds2007-icon--skin" aria-hidden="true"></i><span>换肤</span></button>
        </nav>
        <aside class="ds2007-friends" aria-label="Codex 好友">
          <header class="ds2007-right-tabs" role="tablist" aria-label="右侧面板">
            <button class="ds2007-right-tab" data-action="native-panel" role="tab"><span class="ds2007-native-tab-label">环境信息</span></button>
            <button class="ds2007-right-tab is-active" data-action="friend-expand" role="tab" aria-selected="true">Codex 好友</button>
            <span class="ds2007-right-tabs-spacer"></span><button data-action="friend-collapse" aria-label="收起好友栏">—</button><button data-action="friend-close" aria-label="关闭好友栏">×</button>
          </header>
          <div class="ds2007-friends-scroll">
            <section class="ds2007-assistant-card"><div class="ds2007-pet-media"></div><div class="ds2007-friend-profile"><p><i></i><b>Codex小蓝</b><em>LV07</em></p><small>代码有问题？找我！<br>我是你的智能伙伴Codex</small></div></section>
            <nav class="ds2007-quick-actions"><span><i class="ds2007-icon ds2007-icon--mail" aria-hidden="true"></i><b>消息</b></span><span><i class="ds2007-icon ds2007-icon--star" aria-hidden="true"></i><b>收藏</b></span><span><i class="ds2007-icon ds2007-icon--groups" aria-hidden="true"></i><b>群组</b></span><span><i class="ds2007-icon ds2007-icon--folder" aria-hidden="true"></i><b>文件</b></span></nav>
            <section class="ds2007-friend-list"><header>▾ 我的好友 (1/1)</header><div><span class="ds2007-mini-avatar"></span><span><b>Codex小蓝</b><small>● 在线 · 随时为你服务</small></span></div><header>▸ 智能伙伴 (0/0)</header><header>▸ 离线好友 (0/0)</header></section>
            <section class="ds2007-qqshow-card"><header><b>QQ 秀</b><span>主题可替换</span></header><div class="ds2007-qqshow-media"></div></section>
          </div>
          <label class="ds2007-friend-search"><span class="ds2007-icon ds2007-icon--search" aria-hidden="true"></span><input placeholder="查找好友…" readonly></label>
        </aside>
        <nav class="ds2007-friends-tab" aria-label="右侧面板标签">
          <button data-action="native-panel" aria-label="打开环境信息"><b class="ds2007-native-rail-label">环境</b></button>
          <button data-action="friend-expand" aria-label="展开好友栏"><b>好友</b></button>
        </nav>
        <footer class="ds2007-statusbar"><span class="ds2007-icon ds2007-icon--online" aria-hidden="true"></span><b></b><span class="ds2007-status-current"></span><span class="ds2007-profile-signature"></span><span class="ds2007-security"><i class="ds2007-icon ds2007-icon--security" aria-hidden="true"></i>安全</span></footer>
        <button class="ds2007-native-skin-toggle" data-action="skin-restore" aria-label="切换至 Codex 2007 深度仿制版"><i class="ds2007-icon ds2007-icon--skin" aria-hidden="true"></i><span>换肤</span></button>
        <div class="dream-skin-brand"><span class="dream-skin-portal-mark">◉</span><span><b></b><small></small></span></div>
        <div class="dream-skin-status"><i></i><span></span></div><div class="dream-skin-quote"></div>
        <div class="dream-skin-particles"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="dream-skin-orbit"></div>`;
      document.body.appendChild(chrome);
      chrome.dataset.ds2007Revision = "15";
      created = true;
      chromeParts = null;
    }
    if (!chromeParts || chromeParts.chrome !== chrome) {
      chromeParts = {
        chrome,
        name: chrome.querySelector(".dream-skin-brand b"),
        subtitle: chrome.querySelector(".dream-skin-brand small"),
        status: chrome.querySelector(".dream-skin-status span"),
        quote: chrome.querySelector(".dream-skin-quote"),
        petMedia: chrome.querySelector(".ds2007-pet-media"),
        qqShowMedia: chrome.querySelector(".ds2007-qqshow-media"),
        windowTitle: chrome.querySelector(".ds2007-window-title"),
        statusCurrent: chrome.querySelector(".ds2007-status-current"),
        statusbarName: chrome.querySelector(".ds2007-statusbar b"),
        profileSignature: chrome.querySelector(".ds2007-profile-signature"),
        toolbar: chrome.querySelector(".ds2007-toolbar"),
        nativeTabLabel: chrome.querySelector(".ds2007-native-tab-label"),
        nativeRailLabel: chrome.querySelector(".ds2007-native-rail-label"),
        nativeSkinToggle: chrome.querySelector(".ds2007-native-skin-toggle"),
      };
    }
    setTextContent(chromeParts.name, THEME.name || "Codex Dream Skin");
    setTextContent(chromeParts.subtitle, THEME.brandSubtitle || "CODEX DREAM SKIN");
    setTextContent(chromeParts.status, THEME.statusText || "DREAM SKIN ONLINE");
    setTextContent(chromeParts.quote, THEME.quote || "MAKE SOMETHING WONDERFUL");
    setTextContent(chromeParts.statusbarName, `${PROFILE.nickname || "张奈斯"} ${PROFILE.level || "LV07"}`);
    setTextContent(chromeParts.profileSignature, PROFILE.signature || "别迷恋姐，姐只是个传说。");
    const statusLabel = PROFILE.status === "busy" ? "忙碌" : PROFILE.status === "offline" ? "离线" : "在线";
    setTextContent(chromeParts.statusCurrent, `● ${statusLabel}`);
    const petSnapshot = readCodexPetSnapshot();
    if (chromeParts.petMedia && petSnapshot) {
      if (chromeParts.petMedia.dataset.petSource !== "codex" ||
        chromeParts.petMedia.dataset.petAssetRef !== petSnapshot.assetRef) {
        chromeParts.petMedia.replaceChildren?.();
        chromeParts.petMedia.style.backgroundImage = petSnapshot.backgroundImage;
        chromeParts.petMedia.dataset.petSource = "codex";
        chromeParts.petMedia.dataset.petAssetRef = petSnapshot.assetRef;
      }
    } else if (chromeParts.petMedia?.appendChild && DECORATION_DATA.assistant) {
      const current = chromeParts.petMedia.querySelector?.(":scope > img");
      if (!current || current.src !== DECORATION_DATA.assistant) {
        const assistant = document.createElement("img");
        assistant.src = DECORATION_DATA.assistant;
        assistant.alt = "";
        chromeParts.petMedia.replaceChildren?.(assistant);
      }
      chromeParts.petMedia.style.backgroundImage = "";
      chromeParts.petMedia.dataset.petSource = "fallback";
      delete chromeParts.petMedia.dataset.petAssetRef;
    }
    if (chromeParts.qqShowMedia?.appendChild && DECORATION_DATA.qqShow) {
      const current = chromeParts.qqShowMedia.querySelector?.(":scope > img");
      if (!current || current.src !== DECORATION_DATA.qqShow) {
        const qqShow = document.createElement("img");
        qqShow.src = DECORATION_DATA.qqShow;
        qqShow.alt = "QQ 秀";
        chromeParts.qqShowMedia.replaceChildren?.(qqShow);
      }
      chromeParts.qqShowMedia.dataset.qqShowSource = "theme";
    }
    const sidebar = document.querySelector("aside.app-shell-left-panel");
    bindInteraction(chromeParts.toolbar, "click", (event) => {
      const trigger = event.target?.closest?.("button[data-nav]");
      if (!trigger) return;
      const nav = trigger.getAttribute("data-nav");
      if (nav === "换肤") {
        setSkinView("native");
        return;
      }
      const destination = findPrimaryNavDestination(
        document.querySelector("aside.app-shell-left-panel"),
        nav,
      );
      destination?.click?.();
    }, "bridgeBound");
    bindNativeSkinRestore(chromeParts.nativeSkinToggle);
    if (sidebar && (created || sidebar.dataset?.qq2007Styled !== "sidebar")) {
      if (created) cleanupLegacySidebarArtifacts(sidebar);
      styleSidebarSubtree(sidebar);
    }
    markPrimaryNavSources(sidebar);
    styleComposerSubtree(document.querySelector(".composer-surface-chrome"));
    if (created) {
      for (const message of document.querySelectorAll?.(".ds1907-message") || []) {
        message.classList.remove("ds1907-message");
        message.removeAttribute?.("data-ds1907-time");
      }
    }
    for (const trigger of chrome.querySelectorAll?.(
      '.ds2007-right-tabs [data-action], .ds2007-friends-tab [data-action]',
    ) || []) {
      bindInteraction(trigger, "click", () => {
        const action = trigger.getAttribute?.("data-action");
        if (action === "native-panel") {
          if (root.getAttribute("data-ds2007-native-right") !== "open") setNativeRightVisible(true);
          return;
        }
        if (action === "friend-expand" && root.getAttribute("data-ds2007-native-right") === "open") {
          setNativeRightVisible(false);
        }
        const next = action === "friend-expand" ? "expanded"
          : action === "friend-close" ? "closed" : "collapsed";
        setAttribute(root, "data-ds2007-friends", next);
        writeStoredJson(FRIENDS_KEY, next);
      }, "ds2007FriendBound");
    }
    const projectControl = home?.querySelector?.('.group\\/project-selector > button');
    const nativeHeaderNode = shellMain.querySelector?.(":scope > header.app-header-tint");
    const nativeTaskTitle = [...(nativeHeaderNode?.querySelectorAll?.("span.min-w-0.truncate") || [])]
      .find((candidate) => normalizedLabel(candidate));
    const taskName = normalizedLabel(nativeTaskTitle);
    const projectControlName = normalizedLabel(projectControl).replace(/^(选择项目|当前项目)[·：:\s]*/, "");
    const nativeProjectButton = [...(shellMain.querySelectorAll?.(":scope > header.app-header-tint button[aria-label]") || [])]
      .find((candidate) => /^(项目|Project)[：:]/i.test(candidate.getAttribute?.("aria-label") || ""));
    const nativeProjectName = (nativeProjectButton?.getAttribute?.("aria-label") || "")
      .replace(/^(项目|Project)[：:\s]*/i, "");
    const contextName = taskName
      || nativeProjectName
      || (projectControlName === "选择项目" ? "" : projectControlName)
      || "未选择项目";
    setTextContent(chromeParts.windowTitle, `Codex 2007 - ${contextName}`);
    shellMain.querySelector?.(":scope > header.app-header-tint .ds2007-conversation-label")?.remove?.();
    const nativeRightState = [
      ...(document.querySelectorAll?.(NATIVE_RIGHT_PANEL_SELECTOR) || []),
      ...(document.querySelectorAll?.(NATIVE_RIGHT_SIGNAL_SELECTOR) || []),
    ].map((candidate) => {
        if (candidate.closest?.(`#${CHROME_ID}`)) return false;
        const structural = candidate.matches?.(NATIVE_RIGHT_PANEL_SELECTOR);
        const owner = persistentNativeRightOwner(candidate, shellMain);
        const box = owner?.getBoundingClientRect?.();
        return owner && isVisiblyOpen(owner, shellMain) && box.width >= 220 && box.height >= 240
          ? { owner, layout: structural ? "structural" : "floating" } : null;
      }).find(Boolean) || null;
    const nativeRightOpen = Boolean(nativeRightState);
    setAttribute(root, "data-ds2007-native-right", nativeRightOpen ? "open" : "closed");
    setAttribute(root, "data-ds2007-native-right-layout", nativeRightState?.layout || "none");
    const activeNativeLabel = nativeRightLabel(nativeRightState?.owner);
    const activeNativeRailLabel = activeNativeLabel === "代码审查" ? "审查"
      : activeNativeLabel === "文件详情" ? "文件" : "环境";
    setAttribute(root, "data-ds2007-native-right-label", activeNativeLabel);
    setTextContent(chromeParts.nativeTabLabel, activeNativeLabel);
    setTextContent(chromeParts.nativeRailLabel, activeNativeRailLabel);
    const nativeRailButton = chromeParts.nativeRailLabel?.closest?.("button");
    if (nativeRailButton) setAttribute(nativeRailButton, "aria-label", `打开${activeNativeLabel}`);
    if (!root.getAttribute("data-ds2007-friends")) {
      const storedFriends = readStoredJson(FRIENDS_KEY, "expanded");
      setAttribute(root, "data-ds2007-friends", ["collapsed", "closed"].includes(storedFriends) ? storedFriends : "expanded");
    }
    const appRoot = shellMain.closest?.("body > *");
    appRoot?.classList?.add("ds2007-app-root");
    if (layout || created) syncFrameLayout(shellMain, chrome);
    chrome.classList.toggle("dream-skin-home-shell", Boolean(home));
    if (chrome.dataset.dreamShell !== shell) {
      chrome.dataset.dreamShell = shell;
      metrics.attributeWrites += 1;
    }
  };

  const clearSkinVisualState = () => {
    const root = document.documentElement;
    root?.classList.remove("codex-dream-skin");
    root?.removeAttribute(SHELL_ATTR);
    for (const name of ART_ATTRS) root?.removeAttribute(name);
    root?.style.removeProperty("--dream-skin-art");
    for (const name of THEME_VARIABLES) root?.style.removeProperty(name);
    document.querySelectorAll(".dream-skin-home").forEach((node) => node.classList.remove("dream-skin-home"));
    document.querySelectorAll(".dream-skin-home-shell").forEach((node) => node.classList.remove("dream-skin-home-shell"));
    document.querySelectorAll(".dream-skin-home-utility").forEach((node) => node.classList.remove("dream-skin-home-utility"));
    document.querySelectorAll(".ds2007-app-root").forEach((node) => node.classList.remove("ds2007-app-root"));
    document.querySelectorAll(".ds2007-conversation-label, .ds2007-pinned-panel, .ds2007-context-menu")
      .forEach((node) => node.remove());
    cancelFrameLayout();
    document.querySelectorAll(".ds2007-toolbar-duplicate, .ds2007-project-entry, .ds2007-pinned-source, .ds2007-section-label, [data-qq2007-styled], [data-qq2007-toolbar-duplicate], [data-ds2007-context-bound], [data-ds2007-collapse-bound], [data-ds2007-global-nav-source]")
      .forEach(clearSidebarMarker);
    document.querySelectorAll("[data-qq2007-composer-region], [data-qq2007-composer-control]")
      .forEach(clearComposerMarker);
    for (const group of SIDEBAR_SECTIONS.values()) root?.removeAttribute(`data-ds2007-collapse-${group}`);
  };

  const setSkinView = (view, { persist = true } = {}) => {
    skinView = view === "native" ? "native" : "deep";
    if (persist) writeStoredJson(VIEW_KEY, skinView);
    if (skinView === "native") {
      clearSkinVisualState();
      setAttribute(document.documentElement, "data-ds2007-view", "native");
      return;
    }
    ensure({ root: true, route: true, layout: true });
  };
  const bindNativeSkinRestore = (button = document.getElementById(CHROME_ID)
    ?.querySelector?.(".ds2007-native-skin-toggle")) => {
    bindInteraction(button, "click", () => setSkinView("deep"), "skinRestoreBound");
  };

  const ensure = ({ root: rootPass = true, route = true, layout = true } = {}) => {
    if (window[DISABLED_KEY]) return;
    const root = document.documentElement;
    if (!root) return;
    if (skinView === "native" && document.getElementById(CHROME_ID)) {
      bindNativeSkinRestore();
      setAttribute(root, "data-ds2007-view", "native");
      return;
    }
    metrics.ensureCalls += 1;
    const shell = rootPass ? applyRootState(root) : null;
    if (route) syncRouteState(shell, { layout });
    if (skinView === "native") setSkinView("native", { persist: false });
    else setAttribute(root, "data-ds2007-view", "deep");
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window[DISABLED_KEY] = true;
    clearSkinVisualState();
    disposeInteractions();
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    state?.observer?.disconnect();
    state?.rootObserver?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(state.scheduler.frame);
    }
    if (analysisTimer) clearTimeout(analysisTimer);
    if (state?.mediaHandler && state?.mediaQuery) {
      try { state.mediaQuery.removeEventListener("change", state.mediaHandler); } catch {}
    }
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    delete window[STATE_KEY];
    delete window[DISABLED_KEY];
    delete window[ANALYSIS_CACHE_KEY];
    return true;
  };

  const scheduler = { timeout: null, frame: null, root: false, route: false, layout: false };
  const flushScheduledEnsure = () => {
    if (scheduler.frame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(scheduler.frame);
    }
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.frame = null;
    scheduler.timeout = null;
    const pending = { root: scheduler.root, route: scheduler.route, layout: scheduler.layout };
    scheduler.root = false;
    scheduler.route = false;
    scheduler.layout = false;
    ensure(pending);
  };
  const scheduleEnsure = ({ root = false, route = true, layout = false } = {}) => {
    scheduler.root ||= root;
    scheduler.route ||= route;
    scheduler.layout ||= layout;
    if (scheduler.timeout || scheduler.frame !== null) return;
    if (typeof requestAnimationFrame === "function") {
      scheduler.frame = requestAnimationFrame(flushScheduledEnsure);
      scheduler.timeout = setTimeout(flushScheduledEnsure, 96);
    } else {
      scheduler.timeout = setTimeout(flushScheduledEnsure, 64);
    }
  };
  bindInteraction(document, "transitionend", (event) => {
    const target = event.target;
    if (target?.closest?.(`${NATIVE_RIGHT_PANEL_SELECTOR}, ${NATIVE_RIGHT_SIGNAL_SELECTOR}`) ||
      target?.querySelector?.(NATIVE_RIGHT_PORTAL_SELECTOR)) {
      scheduleEnsure({ route: true, layout: false });
    }
  }, "nativeRightTransitionBound");
  const observer = new MutationObserver((records) => {
    if (skinView === "native") return;
    let routeChanged = false;
    let frameChanged = false;
    const routeSelector = `main.main-surface, [role="main"], aside.app-shell-left-panel, header.app-header-tint, ${NATIVE_RIGHT_PANEL_SELECTOR}, ${NATIVE_RIGHT_SIGNAL_SELECTOR}`;
    const routeContextSelector = 'main.main-surface > header.app-header-tint, .group\\/project-selector';
    for (const record of records) {
      if (record.type === "attributes" && record.target?.closest?.(routeContextSelector)) {
        routeChanged = true;
        frameChanged = true;
      }
      if (record.type === "attributes" && (
        record.target?.matches?.(NATIVE_RIGHT_TOGGLE_SELECTOR) ||
        record.target?.closest?.(NATIVE_RIGHT_SIGNAL_SELECTOR) ||
        record.target?.closest?.(NATIVE_RIGHT_PANEL_SELECTOR)
      )) routeChanged = true;
      if (record.type === "characterData" && record.target?.parentElement?.closest?.(routeContextSelector)) {
        routeChanged = true;
        frameChanged = true;
      }
      for (const node of record.addedNodes || []) {
        if (node?.nodeType !== 1) {
          if (record.target?.closest?.(routeContextSelector)) routeChanged = true;
          continue;
        }
        if (node.id === CHROME_ID || node.id === STYLE_ID || node.closest?.(`#${CHROME_ID}`)) continue;
        if (codexPetSnapshot === null &&
          (node.matches?.(CODEX_PET_SELECTOR) || node.querySelector?.(CODEX_PET_SELECTOR))) {
          codexPetSnapshot = undefined;
          routeChanged = true;
        }
        styleSidebarSubtree(node);
        styleComposerSubtree(node);
        const sidebar = node.matches?.("aside.app-shell-left-panel")
          ? node
          : node.closest?.("aside.app-shell-left-panel") || node.querySelector?.("aside.app-shell-left-panel");
        if (sidebar) markPrimaryNavSources(sidebar, node.contains?.(sidebar) ? sidebar : node);
        if (node.matches?.(routeSelector) || node.querySelector?.(routeSelector)) routeChanged = true;
        if (node.matches?.("header.app-header-tint") || node.querySelector?.("header.app-header-tint")) frameChanged = true;
      }
      for (const node of record.removedNodes || []) {
        if (node?.nodeType === 1 && (node.matches?.(routeSelector) || node.querySelector?.(routeSelector))) {
          routeChanged = true;
          if (node.matches?.("header.app-header-tint") || node.querySelector?.("header.app-header-tint")) frameChanged = true;
        }
      }
    }
    if (routeChanged) scheduleEnsure({ route: true, layout: frameChanged });
  });
  rootObserver = new MutationObserver(() => {
    if (samplingNativeShell || skinView === "native") return;
    scheduleEnsure({ root: true, route: false });
  });

  let mediaQuery = null;
  let mediaHandler = null;
  try {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaHandler = () => scheduleEnsure({ root: true, route: false });
  } catch {}

  window[STATE_KEY] = {
    ensure,
    cleanup,
    observer,
    rootObserver,
    timer: null,
    scheduler,
    mediaQuery,
    mediaHandler,
    disposeInteractions,
    cancelFrameLayout,
    artUrl,
    installToken,
    analysis: artAnalysis,
    artMetadata: ART_METADATA,
    metrics,
    version: VERSION,
    themeId: THEME.id || "custom",
    detectShellMode,
  };
  const firstEnsureStartedAt = now();
  ensure({ layout: !previous || !document.getElementById(CHROME_ID) });
  metrics.firstEnsureMs = Number((now() - firstEnsureStartedAt).toFixed(3));
  bindInteraction(window, "resize", scheduleFrameLayout, "frameResizeBound");
  if (previous?.artUrl && previous.artUrl !== artUrl) URL.revokeObjectURL(previous.artUrl);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "aria-current", "aria-pressed", "data-state"],
    characterData: true,
  });
  rootObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-appearance", "data-color-mode"],
  });
  if (document.body) {
    rootObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-theme", "data-appearance", "data-color-mode"],
    });
  }
  if (mediaHandler && mediaQuery) {
    mediaQuery.addEventListener("change", mediaHandler);
  }
  const analysisPromise = artAnalysis ? Promise.resolve(null) : analyzeArt();
  window[STATE_KEY].analysisTimer = analysisTimer;
  analysisPromise.then((analysis) => {
    const state = window[STATE_KEY];
    if (!analysis || state?.installToken !== installToken || window[DISABLED_KEY]) return;
    artAnalysis = analysis;
    state.analysis = analysis;
    if (typeof THEME.artKey === "string") {
      analysisCache.set(THEME.artKey, analysis);
      while (analysisCache.size > 8) analysisCache.delete(analysisCache.keys().next().value);
    }
    ensure({ root: true, route: false, layout: false });
  }).catch(() => {});
  return {
    installed: true,
    version: VERSION,
    themeId: THEME.id || "custom",
    shell: resolvedShell(),
    analysis: artAnalysis,
  };
})(__DREAM_SKIN_CSS_JSON__, __DREAM_SKIN_ART_JSON__, __DREAM_SKIN_THEME_JSON__)
