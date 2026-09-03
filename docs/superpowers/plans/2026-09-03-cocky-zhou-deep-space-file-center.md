# COCKY ZHOU Deep-Space File Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the standalone COCKY ZHOU file center as a responsive “蓝色空间号” data bay with lightweight particles, while removing every in-page Markdown preview feature.

**Architecture:** Keep the page as one self-contained HTML document so Hexo continues to copy it byte-for-byte. Separate concerns inside that document through named CSS sections and small JavaScript functions: the existing GitHub file data flow remains intact, file rendering owns search/filter/open/download, and an independent Canvas controller owns ambient particles and pointer trails.

**Tech Stack:** Semantic HTML, CSS custom properties and media queries, browser Canvas 2D, vanilla JavaScript, GitHub Contents API, Node.js test runner, headless Chromium.

## Global Constraints

- Preserve the `COCKY ZHOU` identity and GitHub source `quarkbobo/quarkbobo.github.io`, branch `master`, directory `source/files`.
- Use exactly these core colors: `#02040B`, `#08162A`, `#38BDF8`, `#8B5CF6`, `#E8F2FF`, and `#91A8C4`.
- Keep search, type filtering, opening, and downloading files.
- Remove the lower Markdown preview card, preview buttons, Markdown tabs, `marked.js`, preview state, and Markdown rendering functions.
- Keep the page self-contained with no new runtime or build dependency.
- Respect `prefers-reduced-motion`; disable pointer trails for touch/coarse-pointer devices and stop Canvas animation while the page is hidden.
- Preserve readable keyboard focus, a main landmark, a skip link, escaped dynamic file names, and mobile controls with at least 44px targets.

---

### Task 1: Lock the file-center contract

**Files:**
- Create: `test/cocky-zhou-contract.test.cjs`
- Test: `source/COCKY ZHOU/index.html`

**Interfaces:**
- Consumes: the standalone HTML document as UTF-8 text.
- Produces: content-independent assertions for visual tokens, semantic controls, particle hooks, and removal of Markdown preview behavior.

- [ ] **Step 1: Write the failing static contract tests**

Create tests that assert the approved palette and required semantic hooks:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(
  path.join(__dirname, '..', 'source', 'COCKY ZHOU', 'index.html'),
  'utf8'
)

test('COCKY ZHOU declares the approved deep-space visual system', () => {
  for (const token of ['#02040B', '#08162A', '#38BDF8', '#8B5CF6', '#E8F2FF', '#91A8C4']) {
    assert.match(source, new RegExp(token, 'i'))
  }
  assert.match(source, /<canvas[^>]+id="starfield"[^>]+aria-hidden="true"/i)
  assert.match(source, /href="\/"[^>]*>[^<]*蓝色空间号/i)
  assert.match(source, /<main\b[^>]+id="file-center"/i)
  assert.match(source, /<input\b[^>]+type="search"[^>]+aria-label=/i)
})

test('COCKY ZHOU has no in-page Markdown preview surface or dependency', () => {
  for (const forbidden of [
    '推文预览', 'btn-preview', 'articleSection', 'articleBody',
    'mdTabs', 'loadArticle', 'simpleRender', 'marked@', 'marked.parse'
  ]) assert.doesNotMatch(source, new RegExp(forbidden, 'i'), forbidden)
})
```

Add assertions for `aria-pressed`, `:focus-visible`, `min-height: 44px`, `prefers-reduced-motion`, `visibilitychange`, and the fine-pointer media query.

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `node --test test/cocky-zhou-contract.test.cjs`

Expected: FAIL because the current red theme lacks the approved tokens and particle Canvas, while preview markup and `marked.js` remain.

- [ ] **Step 3: Commit the failing contract**

```powershell
git add -- test/cocky-zhou-contract.test.cjs
git commit -m "test: define deep-space file center contract"
```

---

### Task 2: Build the deep-space file center

**Files:**
- Modify: `source/COCKY ZHOU/index.html`
- Test: `test/cocky-zhou-contract.test.cjs`

**Interfaces:**
- Consumes: `loadFromGitHub(): Promise<Array<{name: string, size: number}>>`, existing `publicUrl(name)` and safe HTML escaping.
- Produces: `renderList(): void`, `setActiveFilter(button): void`, and `mountStarfield(canvas): { destroy(): void }` inside the standalone page.

- [ ] **Step 1: Replace the visual foundation**

Replace the existing light/dark red token sets with one deep-space system:

```css
:root {
  color-scheme: dark;
  --space: #02040B;
  --bay: #08162A;
  --signal: #38BDF8;
  --nebula: #8B5CF6;
  --ink: #E8F2FF;
  --mist: #91A8C4;
}

body {
  background:
    radial-gradient(circle at 78% 8%, rgba(139, 92, 246, .16), transparent 32rem),
    radial-gradient(circle at 16% 24%, rgba(56, 189, 248, .11), transparent 28rem),
    var(--space);
}
```

Use a restrained glass panel with blue edge light for the file area. Give the display title a narrow system font stack and use `ui-monospace` for file metadata, filters, and status labels.

- [ ] **Step 2: Rebuild semantic page structure**

Add the decorative Canvas before the page shell, a keyboard skip link, a home link, data-bay Hero copy, and the main landmark:

```html
<canvas id="starfield" aria-hidden="true"></canvas>
<a class="skip-link" href="#file-center">跳到文件列表</a>
<header class="hero">
  <a class="home-link" href="/">← 蓝色空间号</a>
  <p class="hero-kicker">COCKY ZHOU / DATA BAY</p>
  <h1>文件信号站</h1>
  <p>学院月测题库 · 学习资料共享 · 持续更新中</p>
</header>
<main class="main" id="file-center" tabindex="-1">…</main>
```

Give the search input an explicit `aria-label`. Give each filter button `aria-pressed="true|false"`, and update it whenever the active filter changes.

- [ ] **Step 3: Remove the complete preview feature**

Delete the article preview card and external `marked.js` script. Remove `activeMd`, `mdTabsEl`, `articleEl`, `renderMdTabs()`, `loadArticle()`, and `simpleRender()`.

Render only two actions for every file:

```js
div.innerHTML = `
  <div class="file-icon" aria-hidden="true">${emoji}</div>
  <div class="file-info">…</div>
  <div class="file-actions">
    <button class="btn btn-open" data-open="${safe(name)}">打开</button>
    <button class="btn" data-dl="${safe(name)}">下载</button>
  </div>`
```

In the document click handler, make every `data-open` action call `window.open(publicUrl(name), '_blank', 'noopener')`, including Markdown files.

- [ ] **Step 4: Add isolated Canvas particles and pointer trails**

Implement `mountStarfield(canvas)` with a small fixed pool. Resize the backing store with a device-pixel-ratio cap of 2; draw dim blue/purple particles and one slow signal line; coalesce pointer movement into animation frames and reuse a short trail array. Use these policy checks:

```js
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const finePointer = matchMedia('(hover: hover) and (pointer: fine)')
const canAnimate = () => !reducedMotion.matches && !document.hidden
```

When reduced motion is active, draw one complete static frame. Attach pointer movement only while `finePointer.matches`. On `visibilitychange`, cancel or resume animation without accumulating elapsed time. The returned `destroy()` removes media listeners, window listeners, and the active animation frame.

- [ ] **Step 5: Add explicit status and failure styles**

Replace inline error colors with `.status-message` and `.status-message--error`. On API failure, show the error plus a native retry button:

```html
<div class="status-message status-message--error">
  <strong>文件列表加载失败</strong>
  <span>${safe(error.message)}</span>
  <button class="btn" data-retry>重新读取</button>
</div>
```

Bind `data-retry` to the same initialization function, resetting the list to a loading message before the request.

- [ ] **Step 6: Run the focused contract test**

Run: `node --test test/cocky-zhou-contract.test.cjs`

Expected: PASS with all palette, accessibility, Canvas policy, and no-preview assertions satisfied.

- [ ] **Step 7: Commit the page implementation**

```powershell
git add -- 'source/COCKY ZHOU/index.html' test/cocky-zhou-contract.test.cjs
git commit -m "feat: restyle COCKY ZHOU as a deep-space file center"
```

---

### Task 3: Verify generated and browser behavior

**Files:**
- Modify: `test/cocky-zhou-contract.test.cjs`
- Verify: `public/COCKY ZHOU/index.html`
- Verify: `test/theme-build.test.cjs`

**Interfaces:**
- Consumes: the generated standalone page and the repository Chromium launch policy.
- Produces: a browser probe confirming the real CSS layout and Canvas policy without calling the live GitHub API.

- [ ] **Step 1: Add a focused browser probe**

Build the site, copy the generated COCKY ZHOU page to a temporary probe, and inject a final inline script before `</body>` that records computed styles without modifying product behavior:

```js
const result = {
  colorScheme: getComputedStyle(document.documentElement).colorScheme,
  canvasPointerEvents: getComputedStyle(document.getElementById('starfield')).pointerEvents,
  searchHeight: document.getElementById('q').getBoundingClientRect().height,
  buttonMinHeight: getComputedStyle(document.querySelector('.tab-btn')).minHeight,
  horizontalOverflow: document.body.scrollWidth > document.documentElement.clientWidth
}
document.getElementById('probe-result').textContent = JSON.stringify(result)
```

Launch Chromium with a temporary user-data directory and `--dump-dom`. Run once at 1280×900 and once at 390×844. Assert dark color scheme, `pointer-events: none` on Canvas, targets at least 44px, and no horizontal overflow.

- [ ] **Step 2: Verify reduced-motion fallback**

Launch the same probe with `--force-prefers-reduced-motion=reduce`. Expose a read-only particle-state snapshot from `mountStarfield` and assert that it reports a static frame with no active animation frame.

- [ ] **Step 3: Run generated-page and focused tests**

Run:

```powershell
npm run clean
npm run build
node --test test/cocky-zhou-contract.test.cjs test/theme-build.test.cjs
```

Expected: Hexo copies the standalone page byte-for-byte, every inline script compiles, and desktop/mobile/reduced-motion probes pass.

- [ ] **Step 4: Run the full release gate**

Run: `npm run test:fresh`

Expected: build exits 0 and all Node/browser tests pass with zero failures.

- [ ] **Step 5: Inspect the final page visually**

Open `public/COCKY ZHOU/index.html` in Chromium. Confirm that the Hero reads as one file signal station, the single glass file panel remains legible over particles, no preview panel appears below it, and the mobile layout keeps file names and both actions usable.

- [ ] **Step 6: Commit the verification coverage**

```powershell
git add -- test/cocky-zhou-contract.test.cjs
git commit -m "test: verify deep-space file center in Chromium"
```
