# Codex 2007：原生结构稳定与 QQ2007 视觉深化

## Problem Statement

当前 Codex 2007 主题已经使用蓝白配色并加入部分 QQ2007 元素，但仍然更像在现代 Codex 页面上叠加装饰层，而不是一个稳定运行于 Windows XP 时代的桌面聊天客户端。现有实现还可能在路由切换和 DOM 更新时重复扫描或处理原生节点，导致左栏闪屏、分组顺序变化、账号区被遮挡、中央标题消失、输入区和原生操作按钮不可用等功能问题。

用户需要的是：在不破坏 Codex 原生功能、输出结构和可恢复性的前提下，先建立稳定的桌面客户端框架，再把窗口边界、控件密度、输入面板、好友栏、图标和材质逐步深化为 QQ2007 / Windows XP Luna / Office 2003 风格。最终只保留“深度仿制版”和“原版 Codex”两种可切换视图。

## Solution

以 Codex 原始 DOM 和交互行为为唯一功能基准，停止通过搬运、复制或替换原生关键节点来塑造布局。主题注入只对稳定的原生容器增加幂等标记、样式和必要的独立皮肤组件，并使用正常布局流组织窗口标题、工具栏、左侧项目栏、中央内容区、右侧好友栏和底部状态栏。

交付顺序分为七个切片：

1. **P0：注入生命周期与原生 DOM 保护**——消除重复全页扫描、节点搬运、闪屏和无法彻底恢复的问题。
2. **P0：稳定桌面框架**——建立不覆盖原生控件的纵向框架和稳定三栏布局。
3. **P0/P1：左侧项目栏**——保持原生顺序、滚动、置顶逻辑和账号区，完成 QQ2007 分组视觉。
4. **P0/P1：中央会话与输入区**——恢复原生标题和输出层级，完整展示输入工具、模型和发送按钮。
5. **P1：右侧好友栏**——作为可切换独立列展示宠物、QQ 秀、好友分组和搜索，不覆盖原生右面板。
6. **P1/P2：QQ2007 视觉系统与个性化**——补齐位图图标、立体边框、渐变、高光、密度和用户资料。
7. **P0/P1：真实会话验证、恢复与发布**——在实际 Codex 首页、项目、任务和审查场景验证，并确保禁用主题后恢复原始状态。

## User Stories

1. As a Codex Desktop user, I want project switching to preserve the existing sidebar DOM, so that the sidebar never flashes or jumps.
2. As a Codex Desktop user, I want the sidebar scroll position to survive route changes, so that I do not lose my place in a long project list.
3. As a Codex Desktop user, I want “Codex”, feature navigation, “置顶”, “项目” and account information to remain in their native semantic order, so that navigation stays predictable.
4. As a Codex Desktop user, I want each native node to be styled at most once, so that repeated DOM updates do not accumulate wrappers, markers or event handlers.
5. As a Codex Desktop user, I want newly added nodes to be handled incrementally, so that route changes do not trigger repeated full-page scans.
6. As a Codex Desktop user, I want all original project and task nodes to remain owned by Codex, so that native selection, menus and updates continue to work.
7. As a Codex Desktop user, I want disabling the theme to remove every theme marker and injected component, so that the official appearance can be restored completely.
8. As a macOS user, I want the red/yellow/green window controls and native header actions to remain visible and clickable, so that theming never blocks window management.
9. As a Codex Desktop user, I want the app frame to use normal document flow, so that toolbars, content, composer and status bar do not overlap.
10. As a Codex Desktop user, I want a stable left/center/right grid, so that resizing the window does not cause panels to cover one another.
11. As a Codex Desktop user, I want the title to read “Codex 2007 - 当前项目或任务” on one line, so that the window resembles a desktop client without exposing task body text.
12. As a Codex Desktop user, I want long titles to truncate with an ellipsis, so that title text never pushes native controls off screen.
13. As a Codex Desktop user, I want the top toolbar to show 新建任务、已安排、插件、站点、拉取请求 and 聊天 once, so that global actions are recognizable and not duplicated.
14. As a Codex Desktop user, I want secondary actions such as 查找、刷新、换肤、设置 and 帮助 to live in secondary menus or status areas, so that the primary toolbar matches the QQ2007 reference.
15. As a Codex Desktop user, I want the left sidebar to remain one complete panel, so that no meaningless narrow Codex strip appears beside it.
16. As a Codex Desktop user, I want 置顶、项目、展开显示 and 任务 to use one stable title bar each, so that repeated decorative lines do not look like rendering errors.
17. As a Codex Desktop user, I want pinned projects to remain in Codex's native pinned section, so that pin and unpin behavior survives restarts without visual node reordering.
18. As a Codex Desktop user, I want current projects to use an orange-yellow selected state, so that selection feels like an Office 2003 desktop control.
19. As a Codex Desktop user, I want project, conversation and task names to have distinct indentation levels, so that hierarchy is immediately readable.
20. As a Codex Desktop user, I want only the project list to scroll, so that the Codex title, feature navigation and Janice account footer remain fixed.
21. As a Codex Desktop user, I want the Janice avatar, name and help/settings control to remain fully visible, so that account access is never covered by the status bar.
22. As a Codex Desktop user, I want the native central context header to remain present on home, project, task and review routes, so that project context and native actions are not lost.
23. As a Codex Desktop user, I want the central context header to look like an in-panel QQ2007 conversation title bar, so that it is visually distinct from the global toolbar.
24. As a Codex Desktop user, I want ordinary Codex text, headings, lists, images, attachments, diffs, approvals and task states to keep their native structure, so that readability and functionality are preserved.
25. As a Codex Desktop user, I want only genuine code or command blocks to receive an inset blue-gray frame, so that code gains period-appropriate styling without turning full replies into chat bubbles.
26. As a Codex Desktop user, I want code language labels, copy buttons, syntax highlighting, content and line breaks to remain unchanged, so that code remains usable.
27. As a Codex Desktop user, I want the content column to use the available central width, so that code, diffs and images are not squeezed into a mobile-style message stream.
28. As a Codex Desktop user, I want the composer to be a complete three-part panel, so that the tools row, editor and action footer resemble a QQ2007 chat input.
29. As a Codex Desktop user, I want emoji, image, file, voice, permission, model and send controls to remain visible and clickable, so that visual changes do not remove Codex capabilities.
30. As a Codex Desktop user, I want the composer to align exactly with the central panel, so that it never floats over messages or extends into sidebars.
31. As a Codex Desktop user, I want the last message to scroll above the full composer height, so that content is never hidden beneath the input area.
32. As a Codex Desktop user, I want composer resizing to remain bounded by the central panel, so that a larger editor cannot break the window frame.
33. As a Codex Desktop user, I want the QQ friend panel to occupy a real layout column, so that it never covers the conversation or native right-side content.
34. As a Codex Desktop user, I want the QQ friend panel to collapse and expand independently, so that the central panel automatically uses the released width.
35. As a Codex Desktop user, I want the QQ friend panel to auto-hide or switch tabs when a native review, diff or file panel opens, so that two right panels never overlap.
36. As a Codex Desktop user, I want the friend panel to show the configured Codex pet or default to 小蓝助手, so that the companion reflects Codex settings when available.
37. As a Codex Desktop user, I want the default companion to use a low-resolution QQ秀-era illustration treatment, so that it does not look like a modern high-definition mascot.
38. As a Codex Desktop user, I want a replaceable QQ秀 card inside the friend panel, so that I can personalize the nostalgic profile artwork.
39. As a Codex Desktop user, I want the friend panel to include quick actions, friend groups, online status and a fixed search field, so that it reads as a real QQ contact panel rather than decoration.
40. As a Codex Desktop user, I want my profile to show 张奈斯, the signature “别迷恋姐，姐只是个传说。” and a compact level badge, so that the skin feels personal.
41. As a Codex Desktop user, I want the available presence values to be 在线、忙碌 and 离线, so that status choices stay simple and period-appropriate.
42. As a Codex Desktop user, I want the right companion card to show Codex小蓝, LV07 and the configured assistant signature, so that the reference layout is recognizable.
43. As a Codex Desktop user, I want 16×16 or 24×24 colorful bitmap-style toolbar icons, so that controls do not retain a modern linear-icon appearance.
44. As a Codex Desktop user, I want panels to use restrained square corners, double blue edges, top highlights, vertical gradients and subtle inset shadows, so that the UI has Windows XP depth.
45. As a Codex Desktop user, I want denser typography and spacing using Microsoft YaHei for Chinese and Tahoma for English, so that the window resembles a 2007 desktop client instead of a modern SaaS page.
46. As a Codex Desktop user, I want the blue bottom light band to remain low-opacity and confined to the lower area, so that it adds atmosphere without reducing text contrast.
47. As a Codex Desktop user, I want a compact XP-style status bar with online and security indicators but no clock, so that it follows my personalization choice.
48. As a Codex Desktop user, I want one button to switch between the deep QQ2007 replica and native Codex, so that I can return to the official appearance without reinstalling.
49. As a Codex Desktop user, I want both views to keep the same native nodes, functions and content semantics, so that switching views changes appearance rather than behavior.
50. As a Codex Desktop user, I want the UI to remain usable at 100%, 125% and 150% zoom, so that no panel, title or control is clipped at common scales.
51. As a Codex Desktop user, I want home, project, running task and review routes to retain a consistent frame, so that route changes do not recompose the application.
52. As a Codex Desktop user, I want menus, popovers and dialogs to render above the theme, so that theme layers never trap or obscure transient native UI.
53. As a maintainer, I want live verification to detect missing headers, hidden account controls, overlapping panels and incomplete composers, so that regressions fail before release.
54. As a maintainer, I want restore verification to detect leftover markers, classes, styles and listeners, so that “restore official appearance” remains a real guarantee.
55. As a maintainer, I want visual releases to include sanitized home and task screenshots, so that QQ2007 fidelity and layout stability can be reviewed without exposing private content.

## Implementation Decisions

### Slice 1 — P0: injection lifecycle and native DOM protection

- Native Codex project, task, message, header, account and action nodes remain in their original parent and order. The theme must not use `innerHTML`, `replaceChildren`, cloning, `prepend`, `appendChild` relocation or `insertBefore` reordering on these nodes.
- Theme initialization is idempotent. Every processed native node receives a stable theme marker, and the same theme revision never reprocesses it.
- The mutation observer handles only added subtrees and structural route roots. It must not rescan the whole document for every mutation and must not use a periodic full-page polling loop.
- Route synchronization updates only dynamic labels and visibility state; it does not reconstruct the sidebar or central content.
- Theme event handlers are registered through a tracked cleanup path. Restore removes listeners, injected nodes, style elements, root classes and data markers.
- Stable structural selectors and native accessibility/test attributes are preferred. Broad text matching across all `div`, `span` or `p` elements is prohibited for structural classification.
- No sidebar-wide entry, opacity, width or height animation is applied. Native selection changes may update color only.

### Slice 2 — P0: stable desktop frame

- The application frame uses a four-row layout: window title, primary toolbar, workspace and status bar. The workspace uses a three-column layout: fixed sidebar, flexible central panel and optional fixed friend panel.
- All primary areas participate in normal layout flow. `position: fixed` and `position: absolute` are limited to native-style menus, popovers and small non-layout ornaments.
- macOS native traffic-light controls and Codex header actions receive a protected no-overlay safety area. Decorative layers use `pointer-events: none`; interactive theme controls are explicitly non-draggable.
- The title is `Codex 2007 - <current project or task>`, constrained to one line with ellipsis. The theme never derives the title from task body text.
- The primary toolbar contains 新建任务、已安排、插件、站点、拉取请求 and 聊天. Existing native actions are reused when an equivalent exists; unsupported presentation-only entries must not impersonate working controls.
- Secondary utilities remain available through native locations, a secondary menu or a compact status area, without duplicating primary entries in multiple panels.
- Panel sizes use design tokens and `minmax(0, 1fr)` constraints so that content can shrink without overflow. At narrow but supported widths, the friend panel collapses before the central panel becomes unusable.

### Slice 3 — P0/P1: left project sidebar

- The native sidebar remains the single sidebar; no separate 50px Codex strip is created.
- The sidebar is organized visually as fixed Codex title, fixed feature navigation, independently scrollable pinned/project/task content and fixed account footer. This is achieved by styling existing stable containers, not moving their children.
- 置顶、项目、展开显示 and 任务 each receive one fixed-height blue gradient group header with at most one top and one bottom border. Extra parallel decorative rules are removed.
- The sidebar container owns one continuous right border from below the toolbar to above the status bar. Child borders do not simulate the main divider.
- Native pin/unpin commands and persistence remain authoritative. The theme styles the resulting native groups and never implements pinning by moving visual nodes.
- Project rows preserve native menus and selection behavior. Current selection uses an orange-yellow gradient; folder, project, conversation and task levels use explicit indentation and compact bitmap-style icons.
- The account footer stays outside the project scroller and above the global status bar. Background artwork cannot overlap it.

### Slice 4 — P0/P1: central context, content and composer

- The native central context/header area remains present and in flow on home, project, task and review routes. It receives a QQ2007 panel title treatment but keeps every native action.
- The central content scroller begins below the context header and ends above the composer. It uses the available panel width and preserves Codex's native content hierarchy.
- Ordinary replies are not wrapped in synthetic avatars, sender labels, timestamp rows, message bubbles or reply cards. Native author metadata remains intact.
- Only semantic code/command blocks receive the inset blue-gray treatment. Language label, copy action, syntax highlighting, contents and line breaks remain native.
- The composer remains the native functional composer and is visually divided into tool row, editor and action footer. Theme styling must not delete, clone or replace attachment, voice, permission, model or send controls.
- The composer and central title/content share identical horizontal bounds. Composer height participates in layout, and the message scroller retains enough bottom space to show the final item completely.
- Composer resize behavior is preserved when supported, with minimum and maximum sizes constrained by the central panel.
- The home route may keep its native welcome content in compatibility mode. Deep mode can reduce modern card emphasis through styling, but it must not replace the home DOM with a fake chat transcript.

### Slice 5 — P1: independent friend panel

- The friend panel is an injected theme-owned sibling column, never an overlay on the central panel. It owns its header, pet card, profile details, quick actions, friend groups, QQ秀 card, scroll area and fixed search field.
- Collapse/expand changes the workspace grid columns so the central panel expands or contracts naturally.
- A native Codex review, diff, file or environment panel has priority. When detected, deep mode hides the friend column or exposes it through a mutually exclusive tab; simultaneous overlay is prohibited.
- The pet card reads the configured Codex pet when a stable supported source exists; otherwise it renders 小蓝助手. Failure to read pet state must not trigger repeated scans.
- QQ秀 is replaceable theme content. It stays clipped inside its card and uses period-appropriate illustration scale and texture.
- Default profile content is Codex小蓝, LV07 and “代码有问题？找我！我是你的智能伙伴 Codex”. User profile content is 张奈斯 with “别迷恋姐，姐只是个传说。”. Presence values are 在线、忙碌 and 离线.

### Slice 6 — P1/P2: visual system, assets and modes

- Two switchable views are delivered from one deep preset:
  - **原版 Codex**: removes deep skin classes, variables and native-node markers while retaining one compact recovery button.
  - **深度仿制版**: enables the complete title/toolbar/workspace/friend/status composition while preserving all native DOM and behavior guarantees.
- Both modes share one blue-white token system based on primary `#3A8DD8`, background `#F5F8FC` and border `#7A96DF`, expanded into darker edge, mid-tone, highlight and selected-state tokens.
- First-level panels use small or near-square corners, one owned outer border, a light inner highlight and subtle inset shadow. Nested components do not duplicate the same border at the same seam.
- Toolbars, group headers and status areas use multi-stop vertical gradients with restrained gloss. Large modern white cards, oversized headings, pill badges and excessive whitespace are reduced.
- Main toolbar and compact actions use purpose-made or licensed 16×16/24×24 bitmap-style assets. Modern monochrome line icons are not merely recolored.
- Chinese text prefers Microsoft YaHei when available; English and numeric labels prefer Tahoma. Font sizes and spacing are tuned for desktop information density and avoid single-character wrapping.
- The bottom blue light band is confined to the lower region at reduced opacity. The status bar shows online/security indicators and omits the clock by user preference.
- Theme assets must avoid unauthorized redistribution of Tencent artwork. The penguin/QQ秀 elements should be user-supplied, generated, licensed or clearly documented as local personal-use assets.

### Slice 7 — P0/P1: verification, restore and release

- The highest-value verification seam is a live Codex Desktop session reached through the existing loopback CDP injector. Verification covers home, project, normal task and native review/right-panel routes without inspecting private message contents.
- Static regression tests cover injection idempotence, incremental mutation handling, protected native attributes, no periodic full scan, no native node relocation, mode switching and complete cleanup.
- Live verification asserts visible/clickable native header controls, stable sidebar identity/order/scroll, visible account footer, non-overlapping panel rectangles, complete composer controls, friend/native-right mutual exclusion and zero legacy/duplicate theme artifacts.
- Visual checks run at 100%, 125% and 150% zoom and at reduced window heights. Required screenshots include sanitized deep home/task routes, the native-view toggle, and the native-right-panel conflict case.
- Restore/reapply smoke proves that restoring removes every theme class, data marker, style and injected component, then reapplying produces exactly one copy of each theme-owned region.
- The macOS full test suite, doctor, live verify and restore/reapply smoke are release gates. User-visible changes update the macOS changelog and version when release-worthy.
- The release package is rebuilt only after all gates pass, and its checksum is recorded from the final source state.

## Testing Decisions

- Tests assert externally visible behavior and invariants, not exact selector implementation, computed gradient values or the number of internal helper calls.
- The primary test seam is the real Codex renderer through the existing injector and verifier because it exercises native route changes, panel ownership, actual controls and restore behavior at the highest useful boundary.
- Portable renderer tests remain the fast regression seam for idempotence and cleanup. They use representative native fixtures but do not recreate the entire Codex application DOM.
- Existing injector payload checks, renderer tests, full macOS test command, doctor and live verification are extended rather than introducing a separate test framework.
- Sidebar tests verify stable node identity, semantic order, scroll preservation and account visibility across repeated project/task changes.
- Central tests verify that native author metadata and content structures survive, only code blocks receive special frames, the title/header remains visible, and the last content item is not hidden by the composer.
- Composer tests verify the visibility and hit area of attachment/voice/permission/model/send controls, alignment with the central panel and absence of status-bar overlap.
- Right-panel tests verify independent grid occupancy, collapse expansion, clipping, own scrolling/search behavior and mutual exclusion with native right panels.
- Responsive tests compare panel rectangles and overflow at 100%, 125% and 150% zoom instead of relying only on screenshots.
- Restore tests compare the post-restore renderer against the pre-injection structural state for markers, injected nodes and event behavior.
- Visual review uses the provided QQ2007 prototype as the reference for title bar, toolbars, panel density, composer hierarchy, friend panel, border depth and icon style. Pixel-perfect matching is not required where it conflicts with macOS native safety areas or Codex functionality.

## Out of Scope

- Modifying the official Codex `.app`, `app.asar`, code signature or any native binary.
- Reimplementing Codex navigation, project storage, task routing, pin persistence, composer behavior, model selection or message rendering.
- Turning ordinary Codex output into synthetic QQ message bubbles, adding fabricated sender names/timestamps, or changing code/diff/approval content.
- Guaranteeing stable access to undocumented Codex pet state when no stable renderer source exists; the default 小蓝助手 remains the fallback.
- Shipping Tencent-owned QQ penguin or QQ秀 assets without confirmed redistribution rights.
- Windows support in this delivery. The visual system may be portable later, but the current target is macOS 26.3, Apple M4 and Codex 26.715.21425.
- Exact pixel parity with Windows XP window controls where it would obscure or disable macOS native window controls.
- New global utilities unrelated to the QQ2007 theme, API relay configuration, model provider changes or account automation.
- A clock in the bottom status bar.

## Further Notes

- Final product principle: this work does not place a QQ2007 picture over Codex. It reconstructs the window frame, panel boundaries, colors and control appearance as a QQ2007 desktop client while preserving Codex's native functions and output structure.
- Priority is strict: P0 native behavior and layout stability must pass before P1 structural fidelity, and P1 must pass before P2 texture polishing.
- The reference prototype is the primary visual benchmark, especially for the complete composer panel, in-panel conversation header, dense left navigation, friend/QQ秀 column, colorful bitmap icons and layered blue material.
- The user-facing title standard is “Codex 2007”, superseding earlier “Codex 1907” wording.
- This specification is intentionally organized into implementation slices. A later ticketing pass can turn each slice into independently assignable tickets with explicit dependency edges without changing the product decisions above.
