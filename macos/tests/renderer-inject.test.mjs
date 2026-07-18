import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { readImageMetadata } from "../scripts/image-metadata.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const template = await fs.readFile(path.join(macosRoot, "assets", "renderer-inject.js"), "utf8");
const css = await fs.readFile(path.join(macosRoot, "assets", "dream-skin.css"), "utf8");
const iconSprite = await fs.readFile(path.join(macosRoot, "assets", "qq2007-icons.png"));

assert.deepEqual(readImageMetadata(iconSprite, ".png"), {
  width: 336,
  height: 24,
  ratio: 14,
  wide: true,
  aspect: "ultrawide",
  taskMode: "banner",
}, "The reproducible QQ2007 icon sprite must contain fourteen exact 24px bitmap cells.");

assert.match(template, /<b class="ds2007-window-title">Codex 2007<\/b>/,
  "The QQ2007 frame must use the final Codex 2007 title contract.");
const primaryToolbarLabels = ["新建任务", "已安排", "插件", "站点", "拉取请求", "聊天", "换肤"];
for (const label of primaryToolbarLabels) {
  assert.match(template, new RegExp(`data-nav="${label}"`), `The primary toolbar must expose ${label}.`);
}
const primaryToolbarMarkup = template.match(/<nav class="ds2007-toolbar"[\s\S]*?<\/nav>/)?.[0] || "";
assert.deepEqual([...primaryToolbarMarkup.matchAll(/data-nav="([^"]+)"/g)].map((match) => match[1]), primaryToolbarLabels,
  "The primary toolbar must expose the six reference entries followed by the skin toggle.");
assert.doesNotMatch(primaryToolbarMarkup, /data-action=|<details|更多|好友/,
  "Friend and secondary utility controls must not appear in the primary toolbar.");
const visualChromeMarkup = template.match(/<header class="ds2007-titlebar"[\s\S]*?<footer class="ds2007-statusbar"[\s\S]*?<\/footer>/)?.[0] || "";
const bitmapIconRoles = [
  "mascot", "new-task", "scheduled", "plugins", "sites", "pull-request", "chat", "skin",
  "mail", "star", "groups", "folder", "search", "online", "security",
];
assert.deepEqual(
  [...visualChromeMarkup.matchAll(/ds2007-icon--([a-z-]+)/g)].map((match) => match[1]),
  bitmapIconRoles,
  "Title, toolbar, quick actions, search, and status must use the complete bitmap icon set in stable order.",
);
assert.doesNotMatch(visualChromeMarkup, /\p{Extended_Pictographic}/u,
  "QQ2007 structural controls must not fall back to modern color emoji glyphs.");
assert.match(template, /class="ds2007-native-skin-toggle"[\s\S]{0,160}data-action="skin-restore"/,
  "Native Codex view must retain one explicit control that restores the deep skin.");
assert.match(template, /const setSkinView = \(view/,
  "The renderer must switch between deep and native views without loading a compatibility preset.");
assert.match(css, /data-ds2007-view="native"[\s\S]{0,180}\.ds2007-native-skin-toggle\s*\{[^}]*display:\s*inline-flex !important;/s,
  "Native Codex view must expose only the compact restore control from the custom chrome.");
assert.match(css, /--ds2007-icon-sprite:\s*url\("__DREAM_SKIN_ICON_SPRITE__"\)/,
  "The icon sprite must be embedded into injected CSS instead of relying on an app-relative URL.");
assert.match(css, /\.ds2007-icon\s*\{[^}]*background-image:\s*var\(--ds2007-icon-sprite\)[^}]*image-rendering:\s*pixelated/s,
  "Every structural icon must render from the bitmap sprite with pixel-preserving sampling.");
for (const token of [
  "panel-edge-dark", "panel-edge", "panel-depth", "title-material", "header-material",
  "selection-material", "bottom-glow",
]) {
  assert.match(css, new RegExp(`--ds2007-${token}:`), `The QQ2007 visual system must define ${token}.`);
}
assert.match(css, /data-dream-skin-mode="qq2007"\] body\s*\{[^}]*font-family:\s*Tahoma,\s*"Microsoft YaHei"/s,
  "QQ2007 chrome must prefer Tahoma for Latin and numbers while retaining Microsoft YaHei for Chinese.");
assert.match(css, /\.ds2007-titlebar\s*\{[^}]*background:\s*var\(--ds2007-title-material\)/s,
  "The title bar must consume the shared XP Luna title material.");
assert.match(css, /\.ds2007-toolbar\s*\{[^}]*background:\s*var\(--ds2007-header-material\)/s,
  "The main toolbar must consume the shared Office 2003 header material.");
for (const selector of ["aside.app-shell-left-panel", "main.main-surface", "\\.ds2007-friends", "\\.composer-surface-chrome"]) {
  assert.match(
    css,
    new RegExp(`${selector}\\s*\\{[^}]*border:\\s*1px solid var\\(--ds2007-panel-edge\\)[^}]*border-radius:\\s*[012]px[^}]*box-shadow:\\s*var\\(--ds2007-panel-depth\\)`, "s"),
    `${selector} must use one complete near-square QQ2007 panel boundary.`,
  );
}
assert.match(css, /\.ds2007-app-root\s*\{[^}]*background-image:\s*var\(--ds2007-bottom-glow\)[^}]*background-size:\s*100% 72px/s,
  "The blue glow must remain a low 72px band at the bottom of the workspace.");
assert.match(css, /QQ2007 visual material cascade guard[\s\S]*@layer theme[\s\S]{0,900}aside\.app-shell-left-panel,[\s\S]{0,160}main\.main-surface[\s\S]{0,320}background:\s*var\(--ds2007-panel-material\)[\s\S]{0,500}\.composer-surface-chrome[\s\S]{0,260}background:\s*var\(--ds2007-composer-material\)/,
  "QQ2007 materials must win the native theme layer without moving native nodes.");
assert.match(css, /data-app-action-sidebar-thread-active="true"\][^}]*background:\s*var\(--ds2007-selection-material\)/s,
  "Native active rows must consume the shared orange desktop selection material.");
const statusMarkup = visualChromeMarkup.match(/<footer class="ds2007-statusbar"[\s\S]*?<\/footer>/)?.[0] || "";
assert.match(statusMarkup, /ds2007-icon--online[\s\S]*ds2007-icon--security[\s\S]*安全/,
  "The status bar must retain bitmap online and security indicators.");
assert.doesNotMatch(statusMarkup, /(?:clock|time|时间|\d{1,2}:\d{2})/i,
  "The QQ2007 status bar must not add a clock.");
assert.doesNotMatch(template, /classList\.add\("ds1907-message"\)/,
  "The renderer must not wrap native Codex responses as QQ message bubbles.");
assert.doesNotMatch(template, /removeAttribute\?\.\("data-message-author-role"\)/,
  "The renderer must never remove native message authorship metadata.");
assert.doesNotMatch(template, /class="ds1907-home-chat"/,
  "The renderer must not replace the native home route with a fabricated chat transcript.");
assert.match(template, /data-action="friend-collapse"[\s\S]{0,120}data-action="friend-close"/,
  "The friend panel must expose separate collapse and close controls.");
assert.match(template, /class="ds2007-friends-tab"[\s\S]{0,160}data-action="friend-expand"/,
  "A collapsed friend column must retain an in-flow control that expands it again.");
assert.match(
  template,
  /class="ds2007-right-tabs"[\s\S]{0,180}data-action="native-panel"[\s\S]{0,180}data-action="friend-expand"/,
  "The expanded right dock must expose native-panel and Codex-friend tabs in one fixed header.",
);
assert.match(
  template,
  /class="ds2007-friends-tab"[\s\S]{0,180}data-action="native-panel"[\s\S]{0,180}data-action="friend-expand"/,
  "The compact right rail must always expose both native-panel and Codex-friend recovery actions.",
);
assert.match(template, /class="ds2007-qqshow-card"[\s\S]{0,220}class="ds2007-qqshow-media"/,
  "The friend panel must include a dedicated replaceable QQ show card.");
assert.match(template, /data-testid="codex-avatar"\]\[data-avatar-asset-ref/,
  "Pet discovery must use the stable Codex avatar contract when it exists.");
assert.match(template, /if \(codexPetSnapshot !== undefined\) return codexPetSnapshot;/,
  "Pet discovery must be cached instead of rescanning on every route update.");
assert.match(template, /codexPetSnapshot === null[\s\S]{0,260}codexPetSnapshot = undefined/,
  "A late stable Codex pet node must permit one controlled retry after an initial miss.");
assert.match(
  template,
  /data-slot="thread-summary-panel-section-actions"[\s\S]{0,220}关闭审阅标签页/,
  "Native-right detection must recognize stable summary and review panel signals.",
);
assert.match(template, /button\[aria-label="切换摘要"\]/,
  "Native summary popovers must trigger friend-panel arbitration.");
assert.match(template, /document\.querySelectorAll\?\.\(NATIVE_RIGHT_SIGNAL_SELECTOR\)/,
  "Native right-panel signals rendered in a portal must be detected outside the main shell.");
assert.match(template, /document\.querySelectorAll\?\.\(NATIVE_RIGHT_PANEL_SELECTOR\)/,
  "Portal, Diff, file, environment, and structural right panels must share document-level arbitration.");
assert.match(template, /attributeFilter:\s*\[[^\]]*"aria-pressed"/,
  "Native right-panel toggle state changes must refresh mutual exclusion.");
assert.doesNotMatch(template, /attributeFilter:\s*\[[^\]]*"style"/,
  "The global observer must not subscribe to every inline style animation.");
assert.match(template, /bindInteraction\(document, "transitionend"/,
  "Native right-panel transition completion must refresh mutual exclusion without polling the full tree.");
assert.match(template, /current\.src !== DECORATION_DATA\.qqShow[\s\S]{0,220}replaceChildren/,
  "A QQ show asset change must replace the image during a hot theme switch.");
assert.match(template, /candidate\.dataset\.qq2007Styled = "section"/,
  "Sidebar sections must receive an idempotent one-time styling marker.");
assert.match(template, /footer\.dataset\.qq2007ComposerRegion = "footer"/,
  "The native composer must receive stable semantic theme markers without moving its nodes.");
assert.match(template, /new MutationObserver\(\(records\)[\s\S]*record\.addedNodes[\s\S]*styleSidebarSubtree\(node\)/,
  "The mutation observer must style only newly added sidebar subtrees.");
assert.match(template, /new MutationObserver\(\(records\) => \{\s*if \(skinView === "native"\) return;/,
  "Native Codex view must not mark newly added native nodes through the skin observer.");
assert.match(template, /activeNativeRailLabel[\s\S]{0,320}setTextContent\(chromeParts\.nativeRailLabel, activeNativeRailLabel\)/,
  "The compact right rail must follow the active environment, review, or file panel label.");
assert.match(template, /node\.matches\?\.\(routeSelector\) \|\| node\.querySelector\?\.\(routeSelector\)/,
  "Route synchronization must only follow structural route changes.");
assert.match(template, /record\.removedNodes[\s\S]*node\.matches\?\.\(routeSelector\)/,
  "Removing a native right panel must refresh structural route state.");
assert.doesNotMatch(template, /setInterval\(\(\) => ensure\(\),\s*4000\)/,
  "The renderer must not poll and rescan the whole page while idle.");
assert.doesNotMatch(template, /PINNED_PROJECTS_KEY|COLLAPSED_GROUPS_KEY|host\.prepend|replaceChildren\(\.\.\.clones\)|addEventListener\?\.\("contextmenu"/,
  "The skin must not clone, move, hide, or reimplement native project pinning.");
assert.doesNotMatch(template, /document\.querySelectorAll\("button, a, input"\)/,
  "Secondary toolbar bridges must use stable native attributes instead of a full-page text scan.");
assert.match(template, /host\.dataset\.ds2007GlobalNavSource = label/,
  "Native global actions must remain in place as the functional source for toolbar forwarding.");
assert.match(css, /\[data-ds2007-global-nav-source\]\s*\{\s*display:\s*none !important;/,
  "Native global action rows must be visually de-duplicated in deep mode.");
assert.match(css, /data-dream-skin-mode="qq2007"[\s\S]{0,160}body\s*\{[\s\S]{0,300}display:\s*grid !important;/,
  "QQ2007 must be a real grid shell instead of absolutely positioned overlays.");
assert.match(css, /--ds2007-title-height:\s*46px/,
  "The custom title row must reserve the full native Codex header height.");
assert.match(css, /\.ds2007-titlebar\s*\{[\s\S]{0,700}-webkit-app-region:\s*drag/,
  "The empty title surface must remain a native window drag region.");
assert.match(css, /\.ds2007-window-title\s*\{[^}]*min-width:\s*0[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s,
  "Long dynamic titles must truncate on one line.");
assert.match(css, /\.ds2007-statusbar\s*\{[\s\S]{0,600}pointer-events:\s*none/,
  "The decorative status row must not intercept native interactions.");
assert.doesNotMatch(css, /@media \(max-width:\s*840px\)[\s\S]{0,500}\.ds2007-toolbar > button span\s*\{\s*display:\s*none/,
  "Responsive layouts must retain the six primary toolbar labels.");
assert.match(css, /aside\.app-shell-left-panel\s*\{[\s\S]{0,500}overflow:\s*hidden !important;/,
  "The sidebar shell must not scroll over the native fixed account footer.");
assert.match(
  css,
  /aside\.app-shell-left-panel > [^{]+:has\(> \.sidebar-resize-handle-line\)\s*\{[^}]*pointer-events:\s*none !important;[^}]*cursor:\s*default !important;/s,
  "The fixed QQ2007 sidebar must disable the native drag-to-collapse handle without replacing native show/hide controls.",
);
assert.match(css, /aside\.app-shell-left-panel \[class\*="group\/folder-row"\][\s\S]{0,180}animation:\s*none !important;[\s\S]{0,120}transition:\s*none !important;/,
  "Project rows must not run entry or size animations.");
assert.doesNotMatch(css, /aside\.app-shell-left-panel \*\s*\{[^}]*animation:\s*none !important;/,
  "The skin must not disable feedback animations for the entire native sidebar.");
assert.match(css, /aside\.app-shell-left-panel > div:first-child[\s\S]{0,380}width:\s*100% !important;[\s\S]{0,180}max-width:\s*none !important;/,
  "The native sidebar content must fill the whole QQ2007 panel without a blank rail.");
assert.match(css, /\[data-app-action-sidebar-scroll\][\s\S]{0,240}overflow-y:\s*auto !important;/,
  "Only the native sidebar list should own vertical scrolling.");
assert.match(css, /\[data-app-action-sidebar-section\] \[class\*="group\/nav-section-title"\][\s\S]{0,420}border-top:\s*1px solid[\s\S]{0,120}border-bottom:\s*1px solid[\s\S]{0,260}var\(--ds2007-header-material\)/,
  "Each native sidebar section must own one compact QQ2007 title bar.");
assert.match(css, /\[data-app-action-sidebar-project-list-id\] \[data-app-action-sidebar-thread-row\][\s\S]{0,160}padding-left:[^;]*\+ 18px\)/,
  "Native conversation rows must remain visibly nested under their project.");
assert.match(css, /\[data-app-action-sidebar-thread-active="true"\][\s\S]{0,180}var\(--ds2007-selection-material\)/,
  "The native active thread must use the orange QQ2007 selection state.");
assert.doesNotMatch(css, /data-dream-skin-mode="deep"/,
  "Unreachable legacy deep-mode overlay CSS must not remain in the structural implementation.");
assert.match(css, /\.ds2007-titlebar,[\s\S]{0,180}\.ds2007-native-skin-toggle\s*\{\s*display:\s*none;/,
  "Custom chrome must remain hidden until the deep view activates its structural regions.");
assert.match(
  css,
  /data-ds2007-friends="collapsed"\][^{]*body\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 28px;/,
  "Collapsing the friend panel must release its full column while retaining an in-flow expand tab.",
);
assert.match(
  css,
  /data-ds2007-friends="collapsed"\][^{]*\.ds2007-friends-tab\s*\{[^}]*display:\s*flex;/,
  "The collapsed friend column must expose its expand tab.",
);
assert.match(
  css,
  /data-ds2007-native-right="open"\][^{]*body\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 28px;/,
  "A native right panel must retain the compact right recovery rail.",
);
assert.ok(
  css.indexOf('data-ds2007-friends="collapsed"] body') <
    css.indexOf('data-ds2007-native-right="open"] body'),
  "Native-right grid rules must explicitly preserve the compact right rail.",
);
assert.match(css, /--ds2007-friend-width:\s*300px/,
  "The desktop native/friend right dock must use the agreed stable 300px width.");
assert.match(css, /@media \(max-width:\s*1279px\)[\s\S]{0,180}--ds2007-friend-width:\s*240px/,
  "The medium right dock must shrink to the agreed 240px width.");
assert.match(css, /@media \(max-width:\s*959px\)[\s\S]{0,220}grid-template-columns:\s*minmax\(0, 1fr\) 28px/,
  "Compact windows must keep only the 28px right recovery rail.");
assert.match(
  css,
  /data-ds2007-native-right-layout="floating"\][^{]*\.app-shell-main-content-frame\s*\{[^}]*box-sizing:\s*border-box !important;[^}]*padding-right:\s*calc\(var\(--ds2007-friend-width\) \+ 16px\) !important;/s,
  "A floating native summary must reserve its full dock width instead of covering the conversation.",
);
assert.match(
  css,
  /pointer-events-auto:has\(\[data-slot="thread-summary-panel-section-actions"\]\)\s*\{[^}]*width:\s*var\(--ds2007-friend-width\) !important;/s,
  "The native summary must share the same responsive width token as the friend dock.",
);
assert.doesNotMatch(css, /data-dream-skin-mode="qq2007"[^}]*\.composer-surface-chrome[^}]*position:\s*(?:fixed|absolute)/,
  "The QQ2007 composer must remain in native document flow.");
assert.match(
  css,
  /@layer theme\s*\{[\s\S]{0,180}data-dream-skin-mode="qq2007"[^,{]*\.composer-surface-chrome\s*\{[^}]*border:\s*1px solid var\(--ds2007-panel-edge\) !important;[^}]*border-width:\s*1px !important;/,
  "The native utilities layer must not override the bounded QQ2007 composer frame.",
);
assert.match(
  css,
  /data-dream-skin-mode="qq2007"[^,{]*max-w-\(--thread-content-max-width\)[^}]*padding-inline:\s*0 !important;/,
  "The composer wrapper must share the central panel's exact horizontal bounds.",
);
assert.match(
  css,
  /data-dream-skin-mode="qq2007"[^{]*\.composer-surface-chrome[\s\S]{0,100}\[data-qq2007-composer-region="footer"\]\s*\{[^}]*grid-template-rows:\s*30px minmax\(64px, 1fr\) 36px !important;/,
  "The native composer should render as a QQ2007 tool row, editor, and action footer.",
);
assert.doesNotMatch(
  css,
  /data-dream-skin-mode="qq2007"[^}]*\.composer-surface-chrome[^}]*\[class\*="_footer_"\]/,
  "QQ2007 composer styling should use semantic theme markers instead of hashed build classes.",
);
assert.match(css, /data-dream-skin-mode="qq2007"[^,{]*\.thread-scroll-container > :first-child\s*\{[^}]*transform:\s*none !important;/,
  "The native thread root must stay aligned to the central panel instead of shifting behind the sidebar.");
assert.match(
  css,
  /data-dream-skin-mode="qq2007"[^,{]*\.thread-scroll-container\s*\{[^}]*--color-token-conversation-body:\s*#173b61;[^}]*--color-token-text-tertiary:\s*#526f8a;[^}]*--color-token-input-placeholder-foreground:\s*#526f8a;[^}]*--shimmer-contrast:\s*#173b61;/s,
  "The white conversation surface must locally remap native reasoning, activity, tool-status, and time tokens to readable blue ink.",
);
assert.match(
  css,
  /thread-scroll-container \.loading-shimmer-pure-text\s*\{[^}]*--text-secondary:\s*#526f8a !important;[^}]*--shimmer-contrast:\s*#173b61 !important;/s,
  "Active reasoning must override the shimmer component's own dark-theme variables without relying on hashed classes.",
);
assert.match(
  css,
  /thread-scroll-container \[class\*="group\/activity-header"\][\s\S]{0,120}\[class\*="text-token-conversation-body"\]\s*\{[^}]*color:\s*#173b61 !important;[^}]*-webkit-text-fill-color:\s*#173b61 !important;/s,
  "Running agent and tool activity, including elapsed time, must remain readable while its native status is live.",
);
assert.doesNotMatch(css, /data-dream-skin-mode="qq2007"[^,{]*\.thread-scroll-container pre\s*[,\{]/,
  "QQ2007 must not restyle arbitrary preformatted native components as code blocks.");
assert.match(css, /data-dream-skin-mode="qq2007"[^,{]*\[data-markdown-copy="code-block"\][\s\S]{0,700}border:\s*1px solid #8ca6c2/,
  "Native semantic Markdown code blocks should receive the recessed QQ2007 frame.");
assert.match(css, /data-dream-skin-mode="qq2007"[^,{]*\[data-language\] pre[\s\S]{0,180}border:\s*1px solid #8ca6c2/,
  "Only language-marked code blocks should receive the recessed QQ2007 frame.");
assert.match(css, /data-dream-skin-mode="qq2007"[^,{]*\.dream-skin-home[^}]*>[^{]*div:first-child\s*\{\s*display:\s*none !important;/,
  "QQ2007 must remove the modern home hero rather than skinning it as a card.");

assert.doesNotMatch(
  css,
  /main\.main-surface\s*>\s*header\.app-header-tint\s*\{[^}]*\b(?:position|z-index)\s*:/,
  "The skin must preserve Codex's native fixed header so the side-panel toggle remains reachable.",
);
assert.doesNotMatch(
  css,
  /main\.main-surface:not\(\.dream-skin-home-shell\)\s*>\s*\*\s*\{[^}]*\bposition\s*:/,
  "Task-route child layering must not overwrite the native header position.",
);

assert.doesNotMatch(
  css,
  /background-image:\s*var\(--dream-skin-art\),\s*var\(--dream-skin-art\)/,
  "The home hero must not stack duplicate copies of the selected image.",
);
assert.match(
  css,
  /data-dream-art-safe="left"[\s\S]{0,140}--ds-art-position:\s*100% var\(--ds-focus-y\);/,
  "A left text-safe image must preserve its right-side subject on narrower windows.",
);
assert.doesNotMatch(
  css,
  /background-size:\s*auto 100% !important;/,
  "Wide home artwork must not leave an unpainted half-card by fitting only to height.",
);
assert.doesNotMatch(
  css,
  /background-size:\s*100% 100%,\s*100% 100%,\s*100% auto;/,
  "Wide task artwork must cover the full route instead of ending above the composer.",
);
assert.match(
  css,
  /data-dream-art-task-mode="ambient"[\s\S]{0,500}body\s*\{[\s\S]{0,500}background-image:\s*var\(--dream-skin-art\) !important;[\s\S]{0,200}background-size:\s*cover !important;/,
  "Wide ambient task artwork should cover the full application window.",
);
assert.match(
  css,
  /data-dream-task-mode="banner"[\s\S]{0,900}body\s*\{[\s\S]{0,500}background-image:\s*var\(--dream-skin-art\) !important;[\s\S]{0,200}background-size:\s*cover !important;/,
  "Wide banner task artwork should use the same full-window wallpaper contract as ambient routes.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]:has\(main\.main-surface\.dream-skin-home-shell\)[\s\S]{0,100}body\s*\{[\s\S]{0,300}background-image:\s*var\(--dream-skin-art\) !important;/,
  "Wide home artwork should use the same full-window image as utility routes.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]:has\(main\.main-surface\.dream-skin-home-shell\)[\s\S]{0,120}body\s*\{[\s\S]{0,260}background-position:\s*var\(--ds-art-position\) !important;/,
  "Wide home artwork must honor the configured focal point instead of forcing a centered crop.",
);
assert.match(
  css,
  /data-dream-art-task-mode="ambient"[\s\S]{0,260}data-dream-art-wide="true"\]:has\(main\.main-surface:not\(\.dream-skin-home-shell\)\)[\s\S]{0,120}body\s*\{[\s\S]{0,260}background-position:\s*var\(--ds-art-position\) !important;/,
  "Wide task artwork must retain the same focal point as the home route.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]\s+\.composer-surface-chrome\s*\{[\s\S]{0,500}backdrop-filter:\s*none !important;/,
  "Wide artwork should use one uniform composer surface without a split blur layer.",
);
assert.match(
  css,
  /--ds-immersive-composer-solid:\s*rgb\(var\(--ds-panel-rgb\) \/ \.74\);/,
  "The light composer should retain enough transparency to reveal the selected artwork.",
);
assert.match(
  css,
  /data-dream-shell="light"\]\[data-dream-art-wide="true"\][\s\S]{0,100}\.composer-surface-chrome\s*\{[\s\S]{0,400}backdrop-filter:\s*blur\(8px\) saturate\(102%\) !important;/,
  "The translucent light composer should softly separate text from detailed artwork.",
);
assert.match(
  template,
  /\[class\*="_homeUtilityBar_"\][\s\S]{0,500}dream-skin-home-utility/,
  "The renderer should give the current native home utility bar a stable theme class.",
);
assert.match(
  css,
  /\.dream-skin-home:has\(\.dream-skin-home-utility\)[\s\S]{0,120}\.composer-surface-chrome\s*\{[\s\S]{0,180}border-radius:\s*0 0 22px 22px !important;/,
  "The home utility bar and composer should render as one continuous control.",
);
assert.match(
  css,
  /\.composer-surface-chrome button:not\(\[class~="bg-token-foreground"\]\)[\s\S]{0,100}color:\s*var\(--ds-muted\) !important;/,
  "Composer controls must remain readable when Codex native tokens lag behind a forced dark appearance.",
);
assert.match(
  css,
  /\.composer-surface-chrome button:not\(\[class~="bg-token-foreground"\]\) \*\s*\{[\s\S]{0,80}color:\s*currentColor !important;/,
  "Nested labels inside composer controls must inherit the corrected theme color.",
);
assert.match(
  css,
  /\.composer-surface-chrome p\.placeholder::after\s*\{[\s\S]{0,120}color:\s*rgb\(var\(--ds-muted-rgb\) \/ \.82\) !important;[\s\S]{0,80}opacity:\s*1 !important;/,
  "Composer placeholder text must not inherit a stale native color with double opacity.",
);
assert.match(
  css,
  /header\.app-header-tint\s*\{[\s\S]{0,180}background:\s*transparent !important;/,
  "Wide artwork should not paint a separate opaque header band.",
);
assert.match(
  css,
  /\.thread-scroll-container \.bg-gradient-to-t\.from-token-main-surface-primary\s*\{[\s\S]{0,100}background:\s*transparent !important;/,
  "Wide artwork should remove the native opaque fade behind the sticky composer.",
);
assert.match(
  css,
  /div\.sticky:has\(input\[type="text"\]\)[\s\S]{0,100}background:\s*transparent !important;/,
  "Search routes should not retain the native opaque sticky band.",
);
assert.match(
  css,
  /\[class~="bg-token-main-surface-primary"\]\[class~="h-full"\]\[class~="w-full"\][\s\S]{0,100}background:\s*transparent !important;/,
  "Full-size utility route wrappers should not hide the selected artwork.",
);

function createStyleDeclaration() {
  const values = new Map();
  return {
    values,
    getPropertyValue(name) { return values.get(name) ?? ""; },
    setProperty(name, value) { values.set(name, value); },
    removeProperty(name) { values.delete(name); },
  };
}

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    values,
    add(...names) { for (const name of names) values.add(name); },
    remove(...names) { for (const name of names) values.delete(name); },
    contains(name) { return values.has(name); },
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
  };
}

function createFixture(theme, {
  nativeShell = "light",
  analysisFixture = null,
  analysisCache = null,
  projectName = "",
  taskName = "",
  nativeRightOpen = false,
  nativeSummaryOpen = false,
  nativeSummaryText = "环境信息",
  transientDialogOpen = false,
} = {}) {
  let fixtureShell = nativeShell;
  let summaryOpen = nativeSummaryOpen;
  const nodes = new Map();
  const attributes = new Map();
  const bodyAttributes = new Map();
  const observers = [];
  const resizeObservers = [];
  const timers = new Map();
  let nextTimer = 1;
  let nextBlob = 1;
  const rootStyle = createStyleDeclaration();
  const root = {
    className: nativeShell === "dark" ? "electron-dark" : "electron-light",
    classList: createClassList(),
    style: rootStyle,
    appendChild(node) {
      node.parentElement = root;
      if (node.id) nodes.set(node.id, node);
    },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
  };
  const body = {
    className: "",
    appendChild(node) {
      node.parentElement = body;
      if (node.id) nodes.set(node.id, node);
    },
    getAttribute(name) { return bodyAttributes.get(name) ?? null; },
    setAttribute(name, value) { bodyAttributes.set(name, String(value)); },
  };
  const shellBox = { left: 280, top: 36, width: 1000, height: 764 };
  const nativeProjectButton = {
    getAttribute(name) { return name === "aria-label" && projectName ? `项目：${projectName}` : null; },
    getBoundingClientRect() { return { left: 180, right: 208, top: 9, bottom: 37, width: 28, height: 28 }; },
  };
  const nativeTaskTitle = {
    textContent: taskName,
    getBoundingClientRect() { return { left: 216, right: 396, top: 12, bottom: 33, width: 180, height: 21 }; },
  };
  const nativeHeader = {
    getBoundingClientRect() { return { left: 0, right: 1280, top: 0, bottom: 46, width: 1280, height: 46 }; },
    querySelectorAll(selector) {
      if (selector.includes("span.min-w-0.truncate")) return taskName ? [nativeTaskTitle] : [];
      if (selector.includes("button, a")) return projectName ? [nativeProjectButton] : [];
      return [];
    },
  };
  const shellMain = {
    classList: createClassList(),
    getBoundingClientRect() {
      return { ...shellBox };
    },
    querySelector(selector) {
      return selector === ":scope > header.app-header-tint" ? nativeHeader : null;
    },
    querySelectorAll(selector) {
      return selector.includes("header.app-header-tint button[aria-label]") && projectName
        ? [nativeProjectButton] : [];
    },
  };
  const nativeRightPanel = {
    parentElement: null,
    matches(selector) { return selector.includes('[data-testid*="side-panel"]'); },
    closest() { return null; },
    textContent: "代码审查",
    getAttribute(name) { return name === "data-testid" ? "review-panel" : null; },
    getBoundingClientRect() {
      return { left: 1000, right: 1260, top: 60, bottom: 760, width: 260, height: 700 };
    },
  };
  const nativeSummaryOwner = {
    parentElement: null,
    textContent: nativeSummaryText,
    getBoundingClientRect() {
      return { left: 964, right: 1264, top: 120, bottom: 578, width: 300, height: 458 };
    },
  };
  const nativeSummarySignal = {
    parentElement: nativeSummaryOwner,
    matches(selector) { return selector.includes('[data-slot="thread-summary-panel-section-actions"]'); },
    closest(selector) { return selector.startsWith("#") ? null : nativeSummaryOwner; },
    getBoundingClientRect() {
      return { left: 1220, right: 1248, top: 130, bottom: 158, width: 28, height: 28 };
    },
  };
  const nativeSummaryToggle = {
    clickCount: 0,
    click() { this.clickCount += 1; summaryOpen = !summaryOpen; },
    getAttribute(name) {
      if (name === "aria-label") return "切换置顶摘要";
      if (name === "aria-pressed") return summaryOpen ? "true" : "false";
      return null;
    },
    getBoundingClientRect() {
      return { left: 1180, right: 1208, top: 9, bottom: 37, width: 28, height: 28 };
    },
  };
  const transientDialog = {
    parentElement: null,
    matches(selector) { return selector.includes('[role="dialog"]'); },
    closest() { return null; },
    getBoundingClientRect() {
      return { left: 680, right: 1040, top: 180, bottom: 580, width: 360, height: 400 };
    },
  };
  const sectionButtons = ["置顶", "项目", "任务"].map((label) => ({
    nodeType: 1,
    dataset: {},
    classList: createClassList(),
    textContent: label,
    children: [{ textContent: label }],
    removeAttribute(name) {
      if (name === "data-qq2007-styled") delete this.dataset.qq2007Styled;
      if (name === "data-qq2007-section") delete this.dataset.qq2007Section;
    },
  }));
  const newTaskHost = {
    dataset: {},
    contains(node) { return navActions.includes(node) && node.parentElement === newTaskHost; },
  };
  const navActions = ["新建任务", "已安排", "插件", "站点", "拉取请求"].map((label) => ({
    nodeType: 1,
    dataset: {},
    textContent: label,
    parentElement: label === "新建任务" ? newTaskHost : null,
    getAttribute() { return null; },
  }));
  const quickChat = {
    nodeType: 1,
    dataset: {},
    textContent: "",
    parentElement: newTaskHost,
    getAttribute(name) { return name === "aria-label" ? "Quick chat" : null; },
  };
  navActions.push(quickChat);
  const sidebar = {
    nodeType: 1,
    dataset: {},
    scrollTop: 0,
    matches(selector) { return selector === "aside.app-shell-left-panel"; },
    closest(selector) { return selector === "aside.app-shell-left-panel" ? sidebar : null; },
    querySelector(selector) {
      return selector.includes('aria-label="Quick chat"') ? quickChat : null;
    },
    querySelectorAll(selector) {
      if (selector.includes('group/section-toggle')) return sectionButtons;
      if (selector.includes('button, a')) return navActions;
      return [];
    },
    removeAttribute(name) {
      if (name === "data-qq2007-styled") delete sidebar.dataset.qq2007Styled;
      if (name === "data-ds2007-context-bound") delete sidebar.dataset.ds2007ContextBound;
    },
  };

  const createElement = (tagName) => {
    if (tagName === "canvas" && analysisFixture) {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {},
            getImageData() { return { data: analysisFixture.pixels }; },
          };
        },
      };
    }
    const childNodes = new Map();
    const actionTrigger = (action) => {
      const listeners = new Map();
      return {
        dataset: {},
        getAttribute(name) { return name === "data-action" ? action : null; },
        addEventListener(type, handler) {
          if (!listeners.has(type)) listeners.set(type, new Set());
          listeners.get(type).add(handler);
        },
        removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
        listenerCount(type) { return listeners.get(type)?.size ?? 0; },
        dispatch(type = "click") {
          for (const handler of listeners.get(type) || []) handler({ target: this });
        },
        closest(selector) { return selector.includes("[data-action]") ? this : null; },
      };
    };
    const actionTriggers = [
      actionTrigger("native-panel"),
      actionTrigger("friend-expand"),
      actionTrigger("friend-collapse"),
      actionTrigger("friend-close"),
    ];
    const element = {
      id: "",
      dataset: {},
      style: createStyleDeclaration(),
      classList: createClassList(),
      parentElement: null,
      textContent: "",
      innerHTML: "",
      setAttribute() {},
      querySelector(selector) {
        if (!childNodes.has(selector)) {
          const listeners = new Map();
          childNodes.set(selector, {
            dataset: {},
            textContent: "",
            addEventListener(type, handler) {
              if (!listeners.has(type)) listeners.set(type, new Set());
              listeners.get(type).add(handler);
            },
            removeEventListener(type, handler) {
              listeners.get(type)?.delete(handler);
            },
            listenerCount(type) { return listeners.get(type)?.size ?? 0; },
            dispatch(type = "click", event = {}) {
              for (const handler of listeners.get(type) || []) handler(event);
            },
          });
        }
        return childNodes.get(selector);
      },
      querySelectorAll(selector) {
        return selector.includes("[data-action]") ? actionTriggers : [];
      },
      remove() { if (element.id) nodes.delete(element.id); },
      friendTrigger: actionTriggers.find((trigger) => trigger.getAttribute("data-action") === "friend-collapse"),
      actionTrigger(action) {
        return actionTriggers.find((trigger) => trigger.getAttribute("data-action") === action);
      },
    };
    return element;
  };

  const document = {
    documentElement: root,
    head: root,
    body,
    createElement,
    getElementById(id) { return nodes.get(id) ?? null; },
    querySelector(selector) {
      if (selector === "main.main-surface" || selector === "main") return shellMain;
      if (selector === "aside.app-shell-left-panel") return sidebar;
      if (selector.includes('button[aria-label="切换置顶摘要"]')) return nativeSummaryToggle;
      return null;
    },
    querySelectorAll(selector) {
      if (nativeRightOpen && selector.includes('[data-testid*="side-panel"]')) return [nativeRightPanel];
      if (summaryOpen && selector.includes('[data-slot="thread-summary-panel-section-actions"]')) {
        return [nativeSummarySignal];
      }
      if (selector.includes('button[aria-label="切换置顶摘要"]')) return [nativeSummaryToggle];
      if (transientDialogOpen && selector.includes('[role="dialog"]')) return [transientDialog];
      return selector.includes("[data-qq2007-styled]") ? sectionButtons : [];
    },
  };
  const mediaListeners = new Map();
  const mediaQuery = {
    matches: false,
    addEventListener(type, handler) {
      if (!mediaListeners.has(type)) mediaListeners.set(type, new Set());
      mediaListeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { mediaListeners.get(type)?.delete(handler); },
    listenerCount(type) { return mediaListeners.get(type)?.size ?? 0; },
  };
  const revokedUrls = [];
  const localStorageValues = new Map();
  const windowListeners = new Map();
  const window = {
    localStorage: {
      getItem(key) { return localStorageValues.get(key) ?? null; },
      setItem(key, value) { localStorageValues.set(key, String(value)); },
      removeItem(key) { localStorageValues.delete(key); },
    },
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { windowListeners.get(type)?.delete(handler); },
    dispatch(type) { for (const handler of windowListeners.get(type) || []) handler(); },
    listenerCount(type) { return windowListeners.get(type)?.size ?? 0; },
    matchMedia() {
      mediaQuery.matches = fixtureShell === "dark";
      return mediaQuery;
    },
  };
  if (analysisCache) window.__CODEX_DREAM_SKIN_ANALYSIS_CACHE__ = analysisCache;
  if (analysisFixture) {
    window.Image = class {
      naturalWidth = analysisFixture.naturalWidth;
      naturalHeight = analysisFixture.naturalHeight;
      set src(_) { this.onload(); }
    };
  }
  const context = {
    window,
    document,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.target = null;
        resizeObservers.push(this);
      }
      observe(target) { this.target = target; }
      disconnect() { this.target = null; }
    },
    URL: {
      createObjectURL() { return `blob:fixture-${nextBlob++}`; },
      revokeObjectURL(value) { revokedUrls.push(value); },
    },
    Blob,
    Uint8Array,
    atob,
    getComputedStyle() {
      const skinShell = root.classList.contains("codex-dream-skin")
        ? (attributes.get("data-dream-shell") || "dark") : fixtureShell;
      return {
        colorScheme: skinShell,
        backgroundColor: fixtureShell === "dark" ? "rgb(24, 24, 27)" : "rgb(250, 250, 250)",
        display: "block",
        visibility: "visible",
        opacity: "1",
      };
    },
    innerWidth: 1280,
    innerHeight: 800,
    setInterval: () => 1,
    clearInterval() {},
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    cancelAnimationFrame() {},
  };
  const payloadFor = (nextTheme, cssText = ".fixture { color: blue; }") => template
    .replace("__DREAM_SKIN_CSS_JSON__", JSON.stringify(cssText))
    .replace("__DREAM_SKIN_ART_JSON__", JSON.stringify("data:image/png;base64,AA=="))
    .replace("__DREAM_SKIN_THEME_JSON__", JSON.stringify(nextTheme))
    .replace("__DREAM_SKIN_VERSION_JSON__", JSON.stringify("test"))
    .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", JSON.stringify(cssText));
  const flushTimers = (maximumDelay = Infinity) => {
    const pending = [...timers.entries()].filter(([, timer]) => timer.delay <= maximumDelay);
    for (const [id, timer] of pending) {
      timers.delete(id);
      timer.callback();
    }
  };

  return {
    attributes,
    body,
    bodyAttributes,
    context,
    flushTimers,
    nodes,
    observers,
    payload: payloadFor(theme),
    payloadFor,
    revokedUrls,
    resizeObservers,
    mediaQuery,
    navActions,
    newTaskHost,
    nativeProjectButton,
    nativeRightPanel,
    nativeSummaryOwner,
    nativeSummarySignal,
    nativeSummaryToggle,
    transientDialog,
    nativeTaskTitle,
    root,
    rootStyle,
    sectionButtons,
    shellBox,
    sidebar,
    timers,
    window,
    setNativeShell(value) { fixtureShell = value; },
  };
}

const defaults = createFixture({
  id: "default-contract",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
});
const defaultResult = vm.runInNewContext(defaults.payload, defaults.context);
assert.equal(defaultResult.installed, true);
assert.equal(defaults.attributes.get("data-dream-shell"), "light");
assert.equal(defaults.attributes.get("data-dream-art-safe-area"), "center");
assert.equal(defaults.attributes.get("data-dream-art-task-mode"), "ambient");
assert.equal(defaults.attributes.get("data-dream-art-ready"), "false");
assert.equal(defaults.attributes.get("data-dream-skin-mode"), "classic");
assert.match(css, /\.ds2007-titlebar,[\s\S]{0,120}display:\s*none/,
  "Classic fixtures rely on structural QQ2007 chrome being hidden by default.");
assert.equal(defaults.rootStyle.values.get("--dream-art-position"), "50.00% 50.00%");
const defaultMetrics = defaults.window.__CODEX_DREAM_SKIN_STATE__.metrics;
assert.equal(defaultMetrics.rootPasses, 1);
assert.equal(defaultMetrics.routePasses, 1);
assert.equal(defaultMetrics.layoutReads, 1);
assert.equal(defaults.window.listenerCount("resize"), 1);
defaults.window.dispatch("resize");
defaults.window.dispatch("resize");
assert.equal(defaults.timers.size, 1, "Resize bursts should coalesce into one frame-layout refresh.");
defaults.flushTimers(64);
assert.equal(defaultMetrics.layoutReads, 2);
assert.equal(defaultMetrics.routePasses, 1, "Window resize must not trigger a full route rescan.");
assert.deepEqual(defaults.sectionButtons.map((button) => button.dataset.qq2007Styled),
  ["section", "section", "section"],
  "Native section-toggle buttons must receive one-time styling even when their child owns the label text.");
const addedRouteNode = {
  nodeType: 1,
  id: "",
  closest() { return null; },
  matches(selector) { return selector.includes('[role="main"]'); },
  querySelector() { return null; },
};
const originalSidebar = defaults.sidebar;
const originalSectionOrder = [...defaults.sectionButtons];
defaults.sidebar.scrollTop = 37;
for (let index = 0; index < 50; index += 1) {
  defaults.observers[0].callback([{ addedNodes: [addedRouteNode] }]);
}
assert.equal(defaults.timers.size, 1, "Mutation bursts should coalesce into one scheduled ensure.");
defaults.flushTimers(64);
assert.equal(defaultMetrics.rootPasses, 1, "Subtree mutations must not recompute root theme tokens.");
assert.equal(defaultMetrics.routePasses, 2);
assert.equal(defaultMetrics.layoutReads, 2, "Subtree mutations must not force shell layout reads.");
assert.equal(defaults.resizeObservers.length, 0, "Route styling must not install a layout-wide ResizeObserver.");
assert.equal(defaults.sidebar, originalSidebar, "Route mutations must retain the native sidebar node.");
assert.equal(defaults.sidebar.scrollTop, 37, "Route mutations must preserve native sidebar scroll position.");
assert.deepEqual(defaults.sectionButtons, originalSectionOrder,
  "Route mutations must preserve native section order and identity.");
const addedPluginAction = {
  nodeType: 1,
  dataset: {},
  textContent: "插件",
  parentElement: defaults.sidebar,
  closest(selector) { return selector === "aside.app-shell-left-panel" ? defaults.sidebar : null; },
  matches(selector) { return selector.includes("button"); },
  querySelectorAll() { return []; },
};
defaults.observers[0].callback([{ type: "childList", addedNodes: [addedPluginAction], removedNodes: [] }]);
assert.equal(addedPluginAction.dataset.ds2007GlobalNavSource, "插件",
  "A native global action added later must be de-duplicated without rebuilding the sidebar.");
const removedNativePanel = {
  nodeType: 1,
  matches(selector) { return selector.includes('[data-testid*="side-panel"]'); },
  querySelector() { return null; },
};
defaults.observers[0].callback([{ type: "childList", addedNodes: [], removedNodes: [removedNativePanel] }]);
defaults.flushTimers(64);
assert.equal(defaultMetrics.routePasses, 3,
  "Removing a structural native panel must refresh right-panel avoidance state.");
const nativeHeaderButton = {
  closest(selector) { return selector.includes("header.app-header-tint") ? {} : null; },
};
defaults.observers[0].callback([{ type: "attributes", target: nativeHeaderButton, addedNodes: [], removedNodes: [] }]);
defaults.flushTimers(64);
assert.equal(defaultMetrics.routePasses, 4,
  "Updating native project context must refresh the dynamic window title.");
const defaultChrome = defaults.nodes.get("codex-dream-skin-chrome");
assert.equal(defaultChrome.style.values.has("left"), false, "The structural chrome must not use measured left offsets.");
assert.equal(defaultChrome.style.values.has("width"), false, "The structural chrome must not use measured overlay widths.");

const qq2007 = createFixture({
  id: "qq2007-contract",
  mode: "deep",
  appearance: "light",
  art: { safeArea: "left", taskMode: "ambient" },
}, { projectName: "dream-skin", taskName: "规划怀旧QQ风格换肤" });
vm.runInNewContext(qq2007.payload, qq2007.context);
assert.equal(qq2007.attributes.get("data-dream-skin-mode"), "qq2007");
assert.match(qq2007.nodes.get("codex-dream-skin-chrome").innerHTML, /Codex 2007/);
assert.doesNotMatch(qq2007.nodes.get("codex-dream-skin-chrome").innerHTML, /ds1907-home-chat/);
assert.equal(qq2007.nodes.get("codex-dream-skin-chrome").querySelector(".ds2007-window-title").textContent,
  "Codex 2007 - 规划怀旧QQ风格换肤", "The native task title must take precedence over the project name.");
assert.equal(qq2007.newTaskHost.dataset.ds2007GlobalNavSource, "聊天",
  "Fresh injection must de-duplicate the shared new-task and quick-chat host after legacy cleanup.");
assert.deepEqual(qq2007.navActions.slice(1, 5).map((node) => node.dataset.ds2007GlobalNavSource),
  ["已安排", "插件", "站点", "拉取请求"],
  "Fresh injection must retain de-duplication markers on every native global action.");

const qq2007Project = createFixture({
  id: "qq2007-project-contract",
  mode: "deep",
  appearance: "light",
  art: { safeArea: "left", taskMode: "ambient" },
}, { projectName: "dream-skin" });
vm.runInNewContext(qq2007Project.payload, qq2007Project.context);
assert.equal(qq2007Project.nodes.get("codex-dream-skin-chrome").querySelector(".ds2007-window-title").textContent,
  "Codex 2007 - dream-skin", "Project routes must use the native project name in the dynamic title.");

const transientNativeDialog = createFixture({
  id: "qq2007-transient-dialog",
  mode: "deep",
  appearance: "light",
  art: { safeArea: "left", taskMode: "ambient" },
}, { transientDialogOpen: true });
vm.runInNewContext(transientNativeDialog.payload, transientNativeDialog.context);
assert.equal(transientNativeDialog.attributes.get("data-ds2007-native-right"), "closed",
  "A temporary dialog must not replace the persistent QQ2007 right dock.");

const pinnedNativeSummary = createFixture({
  id: "qq2007-pinned-summary",
  mode: "deep",
  appearance: "light",
  art: { safeArea: "left", taskMode: "ambient" },
}, { nativeSummaryOpen: true, nativeSummaryText: "环境信息 来源 本地 文件" });
vm.runInNewContext(pinnedNativeSummary.payload, pinnedNativeSummary.context);
assert.equal(pinnedNativeSummary.attributes.get("data-ds2007-native-right"), "open",
  "A persistent pinned summary must take over the QQ2007 right dock.");
assert.equal(pinnedNativeSummary.attributes.get("data-ds2007-native-right-layout"), "floating",
  "Pinned summaries must reserve their width inside the central panel.");
assert.equal(pinnedNativeSummary.nodes.get("codex-dream-skin-chrome")
  .querySelector(".ds2007-native-tab-label").textContent, "环境信息",
"Environment summaries must not be mislabeled as file details when their body mentions files.");
const pinnedChrome = pinnedNativeSummary.nodes.get("codex-dream-skin-chrome");
pinnedChrome.actionTrigger("friend-expand").dispatch();
pinnedNativeSummary.flushTimers(96);
assert.equal(pinnedNativeSummary.nativeSummaryToggle.clickCount, 1,
  "Choosing the friend tab must invoke the native close/unpin control exactly once.");
assert.equal(pinnedNativeSummary.attributes.get("data-ds2007-native-right"), "closed");
assert.equal(pinnedNativeSummary.attributes.get("data-ds2007-friends"), "expanded");

const closedNativeSummary = createFixture({
  id: "qq2007-closed-summary",
  mode: "deep",
  appearance: "light",
  art: { safeArea: "left", taskMode: "ambient" },
});
vm.runInNewContext(closedNativeSummary.payload, closedNativeSummary.context);
closedNativeSummary.nodes.get("codex-dream-skin-chrome").actionTrigger("native-panel").dispatch();
closedNativeSummary.flushTimers(96);
assert.equal(closedNativeSummary.nativeSummaryToggle.clickCount, 1,
  "Choosing the native tab must invoke the original Codex summary control exactly once.");
assert.equal(closedNativeSummary.attributes.get("data-ds2007-native-right"), "open");

// Auto appearance must continue following the native shell after the skin is
// already installed. The fixture makes the injected root color-scheme win
// whenever our class remains on <html>, so a temporary native probe is needed
// for each light → dark → light transition.
const shellFollow = createFixture({
  id: "shell-follow",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
});
shellFollow.root.className = "";
vm.runInNewContext(shellFollow.payload, shellFollow.context);
assert.equal(shellFollow.attributes.get("data-dream-shell"), "light");
shellFollow.setNativeShell("dark");
shellFollow.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(shellFollow.attributes.get("data-dream-shell"), "dark");
shellFollow.setNativeShell("light");
shellFollow.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(shellFollow.attributes.get("data-dream-shell"), "light");

defaults.root.className = "";
defaults.body.setAttribute("data-theme", "dark");
const routePassesBeforeThemeChange = defaultMetrics.routePasses;
const rootPassesBeforeThemeChange = defaultMetrics.rootPasses;
defaults.observers[1].callback([{ type: "attributes", target: defaults.body }]);
defaults.flushTimers(64);
assert.equal(defaults.attributes.get("data-dream-shell"), "dark", "Body theme changes must apply without the fallback interval.");
assert.equal(defaultMetrics.rootPasses, rootPassesBeforeThemeChange + 1);
assert.equal(defaultMetrics.routePasses, routePassesBeforeThemeChange,
  "Root appearance changes must not rescan route structure.");

const synchronousWide = createFixture({
  id: "synchronous-wide",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
  artKey: "wide-art",
  artMetadata: {
    width: 2400,
    height: 1350,
    ratio: 2400 / 1350,
    wide: true,
    aspect: "wide",
    taskMode: "ambient",
  },
});
vm.runInNewContext(synchronousWide.payload, synchronousWide.context);
assert.equal(synchronousWide.attributes.get("data-dream-art-wide"), "true");
assert.equal(synchronousWide.attributes.get("data-dream-art-aspect"), "wide");
assert.equal(synchronousWide.attributes.get("data-dream-art-task-mode"), "ambient");
assert.equal(synchronousWide.attributes.get("data-dream-art-ready"), "false");

const cachedAnalysis = {
  width: 2400,
  height: 1350,
  ratio: 2400 / 1350,
  wide: true,
  aspect: "wide",
  taskMode: "ambient",
  safeArea: "left",
  focusX: 0.72,
  focusY: 0.48,
  accentRgb: { r: 180, g: 90, b: 110 },
};
const cached = createFixture({
  id: "cached-wide",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
  artKey: "cached-art",
  artMetadata: synchronousWide.window.__CODEX_DREAM_SKIN_STATE__.artMetadata,
}, { analysisCache: new Map([["cached-art", cachedAnalysis]]) });
vm.runInNewContext(cached.payload, cached.context);
assert.equal(cached.attributes.get("data-dream-art-ready"), "true");
assert.equal(cached.attributes.get("data-dream-art-safe-area"), "left");
assert.equal(cached.window.__CODEX_DREAM_SKIN_STATE__.metrics.analysisCacheHits, 1);
assert.equal(cached.window.__CODEX_DREAM_SKIN_STATE__.metrics.analysisRuns, 0);

const previousWideState = synchronousWide.window.__CODEX_DREAM_SKIN_STATE__;
const stableStyle = synchronousWide.nodes.get("codex-dream-skin-style");
vm.runInNewContext(synchronousWide.payloadFor({
  id: "switched-wide",
  appearance: "dark",
  art: { safeArea: "right", taskMode: "ambient" },
  artKey: "switched-art",
  artMetadata: {
    width: 2400,
    height: 1350,
    ratio: 2400 / 1350,
    wide: true,
    aspect: "wide",
    taskMode: "ambient",
  },
}, ".fixture { color: red; }"), synchronousWide.context);
assert.equal(synchronousWide.nodes.get("codex-dream-skin-style"), stableStyle);
assert.equal(stableStyle.textContent, ".fixture { color: red; }");
assert.equal(stableStyle.dataset.dreamSkinVersion, "test");
assert.equal(synchronousWide.rootStyle.values.get("--dream-skin-art"), 'url("blob:fixture-2")');
assert.deepEqual(synchronousWide.revokedUrls, ["blob:fixture-1"]);
assert.equal(previousWideState.cleanup(), false, "An old async cleanup must not remove the new theme.");

const interactionLifecycle = createFixture({
  id: "interaction-lifecycle",
  mode: "deep",
  appearance: "light",
  art: { safeArea: "left", taskMode: "ambient" },
  profile: {
    nickname: "张奈斯",
    signature: "别迷恋姐，姐只是个传说。",
    level: "LV09",
    status: "busy",
  },
}, { nativeRightOpen: true, projectName: "dream-skin", taskName: "规划怀旧QQ风格换肤" });
vm.runInNewContext(interactionLifecycle.payload, interactionLifecycle.context);
const interactionChrome = interactionLifecycle.nodes.get("codex-dream-skin-chrome");
const interactionToolbar = interactionChrome.querySelector(".ds2007-toolbar");
const interactionFriend = interactionChrome.friendTrigger;
const interactionSidebar = interactionLifecycle.sidebar;
const interactionSectionOrder = [...interactionLifecycle.sectionButtons];
interactionSidebar.scrollTop = 51;
const interactionProjectButton = interactionLifecycle.nativeProjectButton;
const interactionTaskTitle = interactionLifecycle.nativeTaskTitle;
assert.equal(interactionLifecycle.attributes.get("data-ds2007-native-right"), "open");
assert.equal(interactionLifecycle.attributes.get("data-ds2007-native-right-layout"), "structural",
  "A native structural right panel must not receive duplicate central padding.");
assert.equal(interactionChrome.querySelector(".ds2007-native-tab-label").textContent, "代码审查",
  "The native right-dock tab must describe the active persistent Codex panel.");
assert.equal(interactionChrome.querySelector(".ds2007-statusbar b").textContent, "张奈斯 LV09");
assert.equal(interactionChrome.querySelector(".ds2007-profile-signature").textContent,
  "别迷恋姐，姐只是个传说。");
assert.equal(interactionChrome.querySelector(".ds2007-status-current").textContent, "● 忙碌");
assert.equal(interactionToolbar.listenerCount("click"), 1);
assert.equal(interactionFriend.listenerCount("click"), 1);
assert.equal(interactionLifecycle.mediaQuery.listenerCount("change"), 1);
assert.equal(interactionLifecycle.window.listenerCount("resize"), 1);
const skinNavTarget = {
  closest(selector) { return selector === "button[data-nav]" ? this : null; },
  getAttribute(name) { return name === "data-nav" ? "换肤" : null; },
};
interactionToolbar.dispatch("click", { target: skinNavTarget });
assert.equal(interactionLifecycle.attributes.get("data-ds2007-view"), "native",
  "The toolbar skin button must enter native Codex view.");
assert.equal(interactionLifecycle.root.classList.contains("codex-dream-skin"), false,
  "Native Codex view must remove the skin root class instead of simulating a compatibility preset.");
const nativeSkinToggle = interactionChrome.querySelector(".ds2007-native-skin-toggle");
assert.equal(nativeSkinToggle.listenerCount("click"), 1,
  "Native Codex view must retain one bound recovery button.");
const nativeAddedPluginAction = {
  nodeType: 1,
  dataset: {},
  textContent: "插件",
  parentElement: interactionSidebar,
  closest(selector) { return selector === "aside.app-shell-left-panel" ? interactionSidebar : null; },
  matches(selector) { return selector.includes("button"); },
  querySelectorAll() { return []; },
};
interactionLifecycle.observers.at(-1).callback([
  { type: "childList", addedNodes: [nativeAddedPluginAction], removedNodes: [] },
]);
assert.equal(nativeAddedPluginAction.dataset.ds2007GlobalNavSource, undefined,
  "Native Codex view must leave newly added original nodes untouched.");
vm.runInNewContext(interactionLifecycle.payloadFor({
  id: "interaction-lifecycle-native-hot-reapply",
  mode: "deep",
  appearance: "light",
  art: { safeArea: "left", taskMode: "ambient" },
  profile: {
    nickname: "张奈斯",
    signature: "别迷恋姐，姐只是个传说。",
    level: "LV09",
    status: "busy",
  },
}), interactionLifecycle.context);
assert.equal(interactionLifecycle.attributes.get("data-ds2007-view"), "native",
  "Hot reapply must preserve the persisted native view.");
assert.equal(nativeSkinToggle.listenerCount("click"), 1,
  "Hot reapply in native view must rebind exactly one recovery listener.");
nativeSkinToggle.dispatch("click");
assert.equal(interactionLifecycle.attributes.get("data-ds2007-view"), "deep");
assert.equal(interactionLifecycle.root.classList.contains("codex-dream-skin"), true,
  "The native recovery button must restore the deep skin in place.");
vm.runInNewContext(interactionLifecycle.payloadFor({
  id: "interaction-lifecycle-compatible",
  mode: "classic",
  appearance: "light",
  art: { safeArea: "left", taskMode: "ambient" },
  profile: {
    nickname: "张奈斯",
    signature: "别迷恋姐，姐只是个传说。",
    level: "LV09",
    status: "busy",
  },
}), interactionLifecycle.context);
assert.equal(interactionLifecycle.attributes.get("data-dream-skin-mode"), "classic");
assert.equal(interactionLifecycle.attributes.get("data-ds2007-native-right"), "open");
assert.equal(interactionLifecycle.nodes.get("codex-dream-skin-chrome"), interactionChrome,
  "Compatible mode must reuse the existing structural chrome and hide optional regions with CSS.");
assert.equal(interactionSidebar, interactionLifecycle.sidebar);
assert.equal(interactionSidebar.scrollTop, 51);
assert.deepEqual(interactionLifecycle.sectionButtons, interactionSectionOrder,
  "Mode switching must retain native sidebar identity and ordering.");
assert.equal(interactionLifecycle.nativeProjectButton, interactionProjectButton);
assert.equal(interactionProjectButton.getAttribute("aria-label"), "项目：dream-skin");
assert.equal(interactionLifecycle.nativeTaskTitle, interactionTaskTitle);
assert.equal(interactionTaskTitle.textContent, "规划怀旧QQ风格换肤");
vm.runInNewContext(interactionLifecycle.payloadFor({
  id: "interaction-lifecycle-deep-again",
  mode: "deep",
  appearance: "light",
  art: { safeArea: "left", taskMode: "ambient" },
  profile: {
    nickname: "张奈斯",
    signature: "别迷恋姐，姐只是个传说。",
    level: "LV09",
    status: "busy",
  },
}), interactionLifecycle.context);
assert.equal(interactionLifecycle.attributes.get("data-dream-skin-mode"), "qq2007");
assert.equal(interactionLifecycle.attributes.get("data-ds2007-native-right"), "open");
assert.equal(interactionLifecycle.nodes.get("codex-dream-skin-chrome"), interactionChrome,
  "Compatible → deep switching should reuse the existing structural chrome.");
assert.equal(interactionLifecycle.nodes.size, 2,
  "Repeated mode switching must keep exactly one style node and one structural chrome node.");
assert.equal(interactionToolbar.listenerCount("click"), 1,
  "Mode switching must replace, not duplicate, the toolbar bridge listener.");
assert.equal(interactionFriend.listenerCount("click"), 1,
  "Hot reapply must replace, not duplicate, the friend-panel listener.");
assert.equal(interactionLifecycle.mediaQuery.listenerCount("change"), 1,
  "Hot reapply must replace, not duplicate, the native appearance listener.");
assert.equal(interactionLifecycle.window.listenerCount("resize"), 1,
  "Hot reapply must replace, not duplicate, the frame-layout listener.");
assert.equal(interactionLifecycle.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(interactionToolbar.listenerCount("click"), 0,
  "Restore must remove theme-owned interaction listeners from reused chrome.");
assert.equal(interactionFriend.listenerCount("click"), 0,
  "Restore must remove theme-owned friend-panel listeners.");
assert.equal(interactionLifecycle.mediaQuery.listenerCount("change"), 0,
  "Restore must remove the native appearance listener.");
assert.equal(interactionLifecycle.window.listenerCount("resize"), 0,
  "Restore must remove the frame-layout listener.");
assert.equal(Object.hasOwn(interactionLifecycle.window, "__CODEX_DREAM_SKIN_DISABLED__"), false,
  "Restore must remove the transient disabled flag.");
assert.equal(Object.hasOwn(interactionLifecycle.window, "__CODEX_DREAM_SKIN_ANALYSIS_CACHE__"), false,
  "Restore must remove the theme analysis cache.");

const brightPixels = new Uint8ClampedArray(96 * 32 * 4);
for (let offset = 0; offset < brightPixels.length; offset += 4) {
  brightPixels[offset] = 245;
  brightPixels[offset + 1] = 224;
  brightPixels[offset + 2] = 224;
  brightPixels[offset + 3] = 255;
}
const nativeDark = createFixture({
  id: "native-dark-contract",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
}, {
  nativeShell: "dark",
  analysisFixture: { naturalWidth: 2400, naturalHeight: 800, pixels: brightPixels },
});
vm.runInNewContext(nativeDark.payload, nativeDark.context);
await Promise.resolve();
await Promise.resolve();
nativeDark.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(nativeDark.window.__CODEX_DREAM_SKIN_STATE__.analysis.shell, "light");
assert.equal(nativeDark.attributes.get("data-dream-shell"), "dark");
assert.match(nativeDark.rootStyle.values.get("--ds-bg"), /^#[0-9a-f]{6}$/);
assert.ok(Number.parseInt(nativeDark.rootStyle.values.get("--ds-bg").slice(1), 16) < 0x303030);

const explicit = createFixture({
  id: "explicit-contract",
  appearance: "dark",
  art: { focusX: 0.15, focusY: 0.8, safeArea: "none", taskMode: "off" },
});
const explicitResult = vm.runInNewContext(explicit.payload, explicit.context);
assert.equal(explicitResult.shell, "dark");
assert.equal(explicit.attributes.get("data-dream-shell"), "dark");
assert.equal(explicit.attributes.get("data-dream-art-safe-area"), "none");
assert.equal(explicit.attributes.get("data-dream-art-safe"), "none");
assert.equal(explicit.attributes.get("data-dream-art-task-mode"), "off");
assert.equal(explicit.rootStyle.values.get("--dream-art-position"), "15.00% 80.00%");
assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__.analysis, null);

const banner = createFixture({
  id: "banner-contract",
  appearance: "auto",
  art: { safeArea: "left", taskMode: "banner" },
  artMetadata: {
    width: 2560,
    height: 1440,
    ratio: 2560 / 1440,
    wide: true,
    aspect: "ultrawide",
    taskMode: "banner",
    safeArea: "left",
    focusX: 0.72,
    focusY: 0.44,
  },
});
vm.runInNewContext(banner.payload, banner.context);
assert.equal(banner.attributes.get("data-dream-art-wide"), "true");
assert.equal(banner.attributes.get("data-dream-art-task-mode"), "banner");
assert.equal(banner.attributes.get("data-dream-task-mode"), "banner");

assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(explicit.root.classList.contains("codex-dream-skin"), false);
assert.equal(explicit.attributes.has("data-dream-shell"), false);
assert.equal(explicit.attributes.has("data-dream-art-safe-area"), false);
assert.equal(explicit.attributes.has("data-dream-art-task-mode"), false);
assert.equal(explicit.attributes.has("data-dream-skin-mode"), false);
assert.equal(explicit.rootStyle.values.has("--dream-art-position"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-style"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-chrome"), false);
assert.deepEqual(explicit.revokedUrls, ["blob:fixture-1"]);
await Promise.resolve();
await Promise.resolve();
assert.equal(explicit.root.classList.contains("codex-dream-skin"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-style"), false);
assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__, undefined);

console.log("PASS: renderer honors adaptive art metadata, fallback, and cleanup behavior.");
