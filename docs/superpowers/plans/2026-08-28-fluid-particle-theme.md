# “流体粒子”Hexo Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back up the current Hexo site and replace NexT with the “流体粒子” theme, whose blue-violet Saturn and smooth multi-layer particle flow match the supplied video while preserving all existing content and routes.

**Architecture:** Keep Hexo 8.1.1 and EJS. Render semantic content server-side, draw only the particle field on one Canvas, and render Saturn and the static star field with CSS layers. Put deterministic particle math in a CommonJS/browser-compatible core so Node tests can verify direction, timing, fading, and adaptive quality independently of Canvas.

**Tech Stack:** Hexo 8.1.1, EJS, CSS, browser Canvas 2D, vanilla JavaScript, Node `node:test`, PowerShell/robocopy for the recovery copy.

## Global Constraints

- Theme display name is `流体粒子`; theme directory and Hexo config value are exactly `fluid-particle`.
- Preserve every existing file under `source/` and preserve the `/` permalink owned by `source/_posts/博客目录.md`.
- Do not add React, Next.js, a client framework, remote fonts, or new runtime npm dependencies.
- The supplied 1280×592, 30 FPS, 8.1-second video is the particle-motion reference.
- Particle flow is left-bottom to right-upper/Saturn, with 84% slow dust, 13% medium glints, and 3% rare energy streaks.
- Desktop pointer displacement is at most 8px and never reverses the flow; disable pointer displacement on mobile.
- Use delta-time animation, a single Canvas, prerendered sprites, capped DPR (1.5 desktop, 1.25 mobile), one listener per event type, passive non-cancelling input listeners, and page-visibility pause/resume.
- Target at least 55 FPS at 1920×1080 on the current laptop and at least 30 FPS on mobile; long frames over 24ms must remain below 2% during the measured foreground run.
- `prefers-reduced-motion: reduce` must prevent continuous Canvas animation.
- Do not stage, restore, or delete unrelated user changes, including the two currently deleted `source/files` items.

---

## File Structure

### Create

- `themes/fluid-particle/_config.yml` — theme name, hero copy, menus, experiment links, rendering options.
- `themes/fluid-particle/layout/layout.ejs` — semantic document shell and root-page dispatch.
- `themes/fluid-particle/layout/index.ejs` — generated index fallback.
- `themes/fluid-particle/layout/post.ejs` — root catalogue/home dispatch and normal post rendering.
- `themes/fluid-particle/layout/page.ejs` — ordinary Hexo page rendering.
- `themes/fluid-particle/layout/archive.ejs` — archives.
- `themes/fluid-particle/layout/category.ejs` — category list.
- `themes/fluid-particle/layout/tag.ejs` — tag list.
- `themes/fluid-particle/layout/_partial/head.ejs` — metadata and conditional CSS/JS.
- `themes/fluid-particle/layout/_partial/header.ejs` — site header and accessible navigation.
- `themes/fluid-particle/layout/_partial/footer.ejs` — footer.
- `themes/fluid-particle/layout/_partial/home.ejs` — hero, scene, post list, and preserved catalogue content.
- `themes/fluid-particle/layout/_partial/space-scene.ejs` — decorative Saturn and Canvas markup.
- `themes/fluid-particle/layout/_partial/post-card.ejs` — one post summary.
- `themes/fluid-particle/layout/_partial/post-full.ejs` — article/page body.
- `themes/fluid-particle/layout/_partial/archive-list.ejs` — archive/category/tag entries.
- `themes/fluid-particle/source/css/main.css` — tokens, reset, navigation, cards, archives, footer, and responsive base.
- `themes/fluid-particle/source/css/space-scene.css` — Saturn, rings, star field, Canvas stacking, and reduced-motion scene rules.
- `themes/fluid-particle/source/css/post.css` — typography, code, media, tables, quotes, and TOC.
- `themes/fluid-particle/source/js/site.js` — accessible menu only.
- `themes/fluid-particle/source/js/particle-core.js` — deterministic RNG, particle creation, Bézier position, fade, delta-time advance, quality controller.
- `themes/fluid-particle/source/js/particle-flow.js` — Canvas renderer, lifecycle, input, resize, visibility, metrics.
- `test/theme-contract.test.cjs` — source/config contract.
- `test/theme-build.test.cjs` — generated route/content assertions.
- `test/particle-core.test.cjs` — deterministic motion tests.
- `test/particle-renderer-contract.test.cjs` — renderer performance/accessibility contract.
- `test/theme-accessibility-contract.test.cjs` — semantic, focus, motion, and touch-target contract.
- `docs/recovery/2026-08-28-redesign-backup.md` — exact recovery point and verification counts.
- `source/categories/index.md` — explicit category index route.
- `source/tags/index.md` — explicit tag index route.

### Modify

- `_config.yml:98` — change `theme: next theme` to `theme: fluid-particle` only after the backup succeeds.
- `.gitignore` — add `.superpowers/` so visual-companion artifacts do not ship.

### Remove only after all tests pass

- `themes/next theme/` — remove the tracked legacy theme after validating the external full backup and the new theme.

---

### Task 1: Create and verify the immutable recovery copy

**Files:**
- Create externally: `C:/Users/Lenovo/Desktop/Quarkbobo-backups/Quarkbobo-before-redesign-yyyyMMdd-HHmmss/`
- Create: `docs/recovery/2026-08-28-redesign-backup.md`

**Interfaces:**
- Consumes: current workspace path `C:/Users/Lenovo/Desktop/Quarkbobo`.
- Produces: `$backupPath` containing a full copy, `desktop-shortcuts.json`, copied `.lnk` files, and a recovery note committed in the repository.

- [ ] **Step 1: Record the untouched baseline and resolve safe absolute paths**

Run:

```powershell
$projectPath = (Resolve-Path 'C:/Users/Lenovo/Desktop/Quarkbobo').Path
$backupParent = 'C:/Users/Lenovo/Desktop/Quarkbobo-backups'
New-Item -ItemType Directory -Force -Path $backupParent | Out-Null
$backupParentPath = (Resolve-Path $backupParent).Path
if ($backupParentPath -eq $projectPath -or $backupParentPath.StartsWith($projectPath + [IO.Path]::DirectorySeparatorChar)) { throw 'Backup target must be outside the project.' }
git status --short --branch
```

Expected: resolved source is `C:\Users\Lenovo\Desktop\Quarkbobo`; backup parent is its sibling, never a child; existing unrelated deletions remain visible and untouched.

- [ ] **Step 2: Make the complete copy without mirror/delete semantics**

Run:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $backupParentPath "Quarkbobo-before-redesign-$stamp"
robocopy $projectPath $backupPath /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XJ
$copyExit = $LASTEXITCODE
if ($copyExit -ge 8) { throw "Backup failed with robocopy exit code $copyExit" }
```

Expected: robocopy exit code 0–7 and a new, non-empty sibling backup. Do not use `/MIR`, `/PURGE`, `Remove-Item`, or an unresolved environment variable.

- [ ] **Step 3: Export and copy the two approved desktop shortcut baselines**

Run:

```powershell
$desktopPath = 'C:/Users/Lenovo/Desktop'
$shortcutNames = @('BoBo一键更新.lnk', 'Posts.lnk')
$shell = New-Object -ComObject WScript.Shell
$records = foreach ($name in $shortcutNames) {
  $path = Join-Path $desktopPath $name
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing shortcut: $path" }
  Copy-Item -LiteralPath $path -Destination (Join-Path $backupPath $name)
  $shortcut = $shell.CreateShortcut($path)
  [pscustomobject]@{ Name=$name; TargetPath=$shortcut.TargetPath; Arguments=$shortcut.Arguments; WorkingDirectory=$shortcut.WorkingDirectory; WindowStyle=$shortcut.WindowStyle }
}
$records | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 (Join-Path $backupPath 'desktop-shortcuts.json')
```

Expected: both `.lnk` files and JSON metadata exist in the backup.

- [ ] **Step 4: Verify file count, byte count, Git data, and key hashes**

Run:

```powershell
$sourceFiles = Get-ChildItem -LiteralPath $projectPath -Recurse -Force -File
$backupFiles = Get-ChildItem -LiteralPath $backupPath -Recurse -Force -File | Where-Object { $_.Name -notin @('BoBo一键更新.lnk','Posts.lnk','desktop-shortcuts.json') }
if ($sourceFiles.Count -ne $backupFiles.Count) { throw "File count mismatch: $($sourceFiles.Count) vs $($backupFiles.Count)" }
if (($sourceFiles | Measure-Object Length -Sum).Sum -ne ($backupFiles | Measure-Object Length -Sum).Sum) { throw 'Byte count mismatch.' }
foreach ($relative in @('_config.yml','package.json','.git/HEAD')) {
  $a = (Get-FileHash -Algorithm SHA256 (Join-Path $projectPath $relative)).Hash
  $b = (Get-FileHash -Algorithm SHA256 (Join-Path $backupPath $relative)).Hash
  if ($a -ne $b) { throw "Hash mismatch: $relative" }
}
```

Expected: equal file count and byte count; all three hashes match.

- [ ] **Step 5: Write and commit the exact recovery record**

Create `docs/recovery/2026-08-28-redesign-backup.md` with the resolved `$backupPath`, timestamp, file count, total bytes, shortcut names, hash results, and this recovery procedure:

```markdown
1. Stop Hexo and close terminals using the project.
2. Rename `C:/Users/Lenovo/Desktop/Quarkbobo` to `Quarkbobo-redesign-failed`.
3. Copy the recorded backup directory to `C:/Users/Lenovo/Desktop/Quarkbobo`.
4. Run `git status --short --branch` and `npm run build`.
```

Run:

```powershell
git add -- docs/recovery/2026-08-28-redesign-backup.md
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "docs: record redesign recovery point"
```

Expected: one documentation commit; no backup contents staged.

---

### Task 2: Establish the “流体粒子” theme contract and minimal build

**Files:**
- Create: `test/theme-contract.test.cjs`
- Create: `themes/fluid-particle/_config.yml`
- Create: `themes/fluid-particle/layout/layout.ejs`
- Create: `themes/fluid-particle/layout/index.ejs`
- Create: `themes/fluid-particle/layout/post.ejs`
- Create: `themes/fluid-particle/layout/page.ejs`
- Create: `themes/fluid-particle/layout/archive.ejs`
- Create: `themes/fluid-particle/layout/category.ejs`
- Create: `themes/fluid-particle/layout/tag.ejs`
- Create: `themes/fluid-particle/source/css/main.css`
- Modify: `_config.yml:98`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Hexo helpers `partial`, `url_for`, `is_post`, `is_page`, `is_archive`, and locals `page`, `site`, `config`, `theme`.
- Produces: a buildable EJS theme and the invariant `page.path === 'index.html'` for the preserved root catalogue/home dispatch.

- [ ] **Step 1: Write the failing theme contract test**

Create `test/theme-contract.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

test('fluid-particle is the selected complete Hexo theme', () => {
  assert.match(read('_config.yml'), /^theme:\s+fluid-particle$/m)
  assert.match(read('themes/fluid-particle/_config.yml'), /^name:\s*["']?流体粒子["']?$/m)
  for (const file of ['layout/layout.ejs','layout/index.ejs','layout/post.ejs','layout/page.ejs','layout/archive.ejs','layout/category.ejs','layout/tag.ejs','source/css/main.css']) {
    assert.ok(fs.existsSync(path.join(root, 'themes/fluid-particle', file)), file)
  }
})

test('the existing root catalogue route remains unchanged', () => {
  assert.match(read('source/_posts/博客目录.md'), /^permalink:\s*\/$/m)
})
```

- [ ] **Step 2: Run the contract test and verify the expected failure**

Run: `node --test test/theme-contract.test.cjs`

Expected: FAIL because `_config.yml` still selects `next theme` and `themes/fluid-particle` does not exist.

- [ ] **Step 3: Create the minimal theme and switch the config**

Create `themes/fluid-particle/_config.yml`:

```yaml
name: 流体粒子
hero:
  eyebrow: PERSONAL ARCHIVE · DEEP SPACE SIGNAL
  title: 在噪声里，保留信号。
  description: 技术笔记、游戏实验与日常观测。
menu:
  首页: /
  归档: /archives/
  分类: /categories/
  标签: /tags/
  关于: /About-me/
```

Create the minimal layout shell:

```ejs
<!doctype html>
<html lang="<%= config.language || 'zh-CN' %>">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title><%= page.title ? page.title + ' · ' + config.title : config.title %></title><%- css('css/main.css') %></head>
  <body><main id="main-content"><%- body %></main></body>
</html>
```

Set each page template to valid minimal output; `post.ejs` must already reserve the root dispatch:

```ejs
<% if (page.path === 'index.html') { %>
  <section data-fluid-home><h1><%= theme.hero.title %></h1><%- page.content %></section>
<% } else { %>
  <article><h1><%= page.title %></h1><%- page.content %></article>
<% } %>
```

Change `_config.yml:98` to `theme: fluid-particle`. Add `.superpowers/` to `.gitignore`.

- [ ] **Step 4: Run tests and the first clean build**

Run:

```powershell
node --test test/theme-contract.test.cjs
npm run clean
npm run build
```

Expected: contract tests PASS; Hexo generation exits 0.

- [ ] **Step 5: Commit the buildable theme skeleton**

Run:

```powershell
git add -- _config.yml .gitignore test/theme-contract.test.cjs themes/fluid-particle
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "feat: scaffold fluid particle theme"
```

---

### Task 3: Build semantic layouts and preserve the root catalogue homepage

**Files:**
- Create: `test/theme-build.test.cjs`
- Create: `themes/fluid-particle/layout/_partial/head.ejs`
- Create: `themes/fluid-particle/layout/_partial/header.ejs`
- Create: `themes/fluid-particle/layout/_partial/footer.ejs`
- Create: `themes/fluid-particle/layout/_partial/home.ejs`
- Create: `themes/fluid-particle/layout/_partial/post-card.ejs`
- Create: `themes/fluid-particle/layout/_partial/post-full.ejs`
- Create: `themes/fluid-particle/layout/_partial/archive-list.ejs`
- Create: `themes/fluid-particle/source/css/post.css`
- Create: `themes/fluid-particle/source/js/site.js`
- Create: `source/categories/index.md`
- Create: `source/tags/index.md`
- Modify: all `themes/fluid-particle/layout/*.ejs`
- Modify: `themes/fluid-particle/source/css/main.css`

**Interfaces:**
- Consumes: `site.posts.sort('-date')`, `page.posts`, `page.content`, `page.path`, `page.categories`, `page.tags`.
- Produces: `.site-nav`, `.post-card`, `.archive-list`, `.article-shell`, and `data-fluid-home` for later scene and contract tests.

- [ ] **Step 1: Write failing generated-route tests**

Create `test/theme-build.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..', 'public')
const html = relative => fs.readFileSync(path.join(root, relative), 'utf8')

test('root catalogue renders as the designed home without changing its URL', () => {
  const output = html('index.html')
  assert.match(output, /data-fluid-home/)
  assert.match(output, /在噪声里/)
  assert.match(output, /class="post-card"/)
  assert.match(output, /博客目录/)
})

test('normal posts and archive surfaces render semantic content', () => {
  assert.match(html('Hello-World/index.html'), /<article[^>]*class="article-shell"/)
  assert.match(html('Hello-World/index.html'), /class="article-toc"/)
  assert.match(html('archives/index.html'), /class="archive-list"/)
  assert.match(html('categories/index.html'), /class="taxonomy-index"/)
  assert.match(html('tags/index.html'), /class="taxonomy-index"/)
  assert.match(html('index.html'), /<nav[^>]*aria-label="主要导航"/)
})

test('existing games, tools, and downloads keep their generated routes', () => {
  for (const route of ['2048/index.html','snake/index.html','国际象棋/index.html','中国象棋/index.html','image_transformer/index.html']) {
    assert.ok(fs.existsSync(path.join(root, route)), route)
  }
})
```

- [ ] **Step 2: Run the build test and verify it fails**

Run: `npm run clean; npm run build; node --test test/theme-build.test.cjs`

Expected: FAIL because full partials/classes are not implemented.

- [ ] **Step 3: Implement the semantic document and accessible navigation**

`layout.ejs` must include a skip link, header, main, and footer:

```ejs
<!doctype html>
<html lang="<%= config.language || 'zh-CN' %>">
  <%- partial('_partial/head') %>
  <body class="<%= page.path === 'index.html' ? 'is-home' : 'is-inner' %>">
    <a class="skip-link" href="#main-content">跳到正文</a>
    <%- partial('_partial/header') %>
    <main id="main-content" tabindex="-1"><%- body %></main>
    <%- partial('_partial/footer') %>
  </body>
</html>
```

`header.ejs` must use a real button and links:

```ejs
<header class="site-header">
  <a class="site-brand" href="<%= url_for('/') %>">Q / LOG</a>
  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-menu">菜单</button>
  <nav id="site-menu" class="site-nav" aria-label="主要导航">
    <% Object.entries(theme.menu).forEach(([label, href]) => { %><a href="<%= url_for(href) %>"><%= label %></a><% }) %>
  </nav>
</header>
```

`site.js` adds an `.is-enhanced` class to the root, owns the only menu handler, and toggles `aria-expanded` plus `.is-open`; it must not create duplicate global listeners. Without JavaScript the CSS keeps navigation links visible, so disabling JavaScript never traps the menu.

- [ ] **Step 4: Implement the home, post-card, article, and archive partials**

`post.ejs` root dispatch:

```ejs
<% if (page.path === 'index.html') { %>
  <%- partial('_partial/home', { catalogue: page, posts: site.posts.sort('-date').filter(post => post.path !== 'index.html') }) %>
<% } else { %>
  <%- partial('_partial/post-full', { post: page }) %>
<% } %>
```

`home.ejs` renders hero first, the newest ten real posts as `post-card`, then the preserved `catalogue.content`. `index.ejs` uses the same `home.ejs` with `page.posts`. `archive.ejs`, `category.ejs`, and `tag.ejs` call `archive-list.ejs` with `page.posts`. Every list renders the exact empty message `档案中还没有记录` when its collection is empty.

`post-full.ejs` renders `post.content` and calls the Hexo `toc` helper with depth 2–3. When the returned outline is non-empty, render it in `<aside class="article-toc" aria-label="文章目录">`; omit the aside for heading-free content.

Create `source/categories/index.md` and `source/tags/index.md` with fixed permalinks and `type` values:

```markdown
---
title: 分类
type: categories
permalink: /categories/
---
```

```markdown
---
title: 标签
type: tags
permalink: /tags/
---
```

`page.ejs` detects `page.type === 'categories'` or `'tags'` and renders a `.taxonomy-index` list from `site.categories` or `site.tags`; otherwise it calls `post-full.ejs`.

- [ ] **Step 5: Implement global and article styles**

Define the six approved color custom properties, local font stacks, `.skip-link`, `:focus-visible`, a 44px navigation target, 55/45 hero content grid, `content-visibility: auto` on `.post-card`, 760px article measure, code overflow, responsive media/table handling, and readable heading/paragraph spacing. No remote `@font-face` or remote CSS import.

- [ ] **Step 6: Run generated-route tests and build**

Run:

```powershell
npm run clean
npm run build
node --test test/theme-contract.test.cjs test/theme-build.test.cjs
```

Expected: all tests PASS; root and normal post routes exist.

- [ ] **Step 7: Commit semantic content surfaces**

Run:

```powershell
git add -- themes/fluid-particle test/theme-build.test.cjs source/categories/index.md source/tags/index.md
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "feat: add fluid particle content layouts"
```

---

### Task 4: Implement deterministic particle motion with TDD

**Files:**
- Create: `test/particle-core.test.cjs`
- Create: `themes/fluid-particle/source/js/particle-core.js`

**Interfaces:**
- Produces browser global and CommonJS export `FluidParticleCore` with `createRng(seed)`, `createParticle(index, rng)`, `cubicBezier(a,b,c,d,t)`, `positionParticle(particle, progress, viewport, pointer)`, `advancePhase(phase, elapsedSeconds, lifetimeSeconds)`, `edgeFade(progress)`, and `nextQuality(state, averageFrameMs)`.
- Consumed by: `particle-flow.js` in Task 5 and Node tests.

- [ ] **Step 1: Write failing deterministic motion tests**

Create `test/particle-core.test.cjs` with these cases:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const Core = require('../themes/fluid-particle/source/js/particle-core.js')

test('seeded particle creation is deterministic and respects layer ratios', () => {
  const make = () => {
    const rng = Core.createRng(42)
    return Array.from({length: 1000}, (_, i) => Core.createParticle(i, rng))
  }
  const a = make()
  const b = make()
  assert.deepEqual(a, b)
  const counts = a.reduce((out, p) => (out[p.layer]++, out), {dust:0, glint:0, streak:0})
  assert.ok(counts.dust >= 820 && counts.dust <= 860)
  assert.ok(counts.glint >= 110 && counts.glint <= 150)
  assert.ok(counts.streak >= 20 && counts.streak <= 40)
})

test('delta-time phase advance is frame-rate independent', () => {
  const at60 = Array.from({length: 60}).reduce(p => Core.advancePhase(p, 1/60, 10), 0)
  const at30 = Array.from({length: 30}).reduce(p => Core.advancePhase(p, 1/30, 10), 0)
  assert.ok(Math.abs(at60 - at30) < 1e-12)
})

test('all orbit bands move from lower-left toward the Saturn region', () => {
  for (const band of [0,1,2]) {
    const p = {band, jitter:0, wave:0}
    const start = Core.positionParticle(p, 0.05, {width:1280,height:592}, {x:0,y:0})
    const end = Core.positionParticle(p, 0.95, {width:1280,height:592}, {x:0,y:0})
    assert.ok(end.x > start.x)
    assert.ok(end.y < start.y)
  }
})

test('pointer displacement is clamped to eight pixels', () => {
  const p = {band:1,jitter:0,wave:0}
  const base = Core.positionParticle(p, .5, {width:1280,height:592}, {x:0,y:0})
  const moved = Core.positionParticle(p, .5, {width:1280,height:592}, {x:99,y:99})
  assert.ok(Math.hypot(moved.x-base.x, moved.y-base.y) <= 8.01)
})

test('edge fade prevents respawn flashes', () => {
  assert.equal(Core.edgeFade(0), 0)
  assert.equal(Core.edgeFade(1), 0)
  assert.ok(Core.edgeFade(.5) > .99)
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/particle-core.test.cjs`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement the UMD-style pure core**

Wrap the API so Node receives `module.exports` and the browser receives `window.FluidParticleCore`. Use a fixed layer selector (`roll < .84`, `< .97`, else streak), three normalized cubic Bézier control-point sets, clamped pointer magnitude, smooth edge fade, and phase update `(phase + elapsed/lifetime) % 1`. `nextQuality` must lower count only after a 120-frame average above 18.2ms and restore only below 15.5ms, creating hysteresis.

- [ ] **Step 4: Run particle and existing tests**

Run:

```powershell
node --test test/particle-core.test.cjs test/theme-contract.test.cjs test/theme-build.test.cjs
```

Expected: all tests PASS.

- [ ] **Step 5: Commit particle physics**

Run:

```powershell
git add -- themes/fluid-particle/source/js/particle-core.js test/particle-core.test.cjs
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "feat: add deterministic particle flow physics"
```

---

### Task 5: Render the video-matched flow and blue-violet Saturn

**Files:**
- Create: `test/particle-renderer-contract.test.cjs`
- Create: `themes/fluid-particle/layout/_partial/space-scene.ejs`
- Create: `themes/fluid-particle/source/css/space-scene.css`
- Create: `themes/fluid-particle/source/js/particle-flow.js`
- Modify: `themes/fluid-particle/layout/_partial/home.ejs`
- Modify: `themes/fluid-particle/layout/_partial/head.ejs`

**Interfaces:**
- Consumes: `window.FluidParticleCore` from Task 4 and `<canvas id="particle-flow">` from `space-scene.ejs`.
- Produces: `window.FluidParticleRenderer.mount(canvas, options)` returning `{start(), stop(), destroy(), snapshot()}` and read-only `window.__fluidParticleMetrics` for foreground verification.

- [ ] **Step 1: Write the failing renderer contract test**

Create `test/particle-renderer-contract.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const renderer = () => fs.readFileSync('themes/fluid-particle/source/js/particle-flow.js', 'utf8')
const scene = () => fs.readFileSync('themes/fluid-particle/layout/_partial/space-scene.ejs', 'utf8')

test('renderer owns one canvas and pauses with page visibility', () => {
  assert.match(scene(), /<canvas[^>]+id="particle-flow"[^>]+aria-hidden="true"/)
  assert.match(renderer(), /requestAnimationFrame/)
  assert.match(renderer(), /visibilitychange/)
  assert.match(renderer(), /document\.hidden/)
})

test('renderer applies the performance contract', () => {
  const code = renderer()
  assert.match(code, /passive:\s*true/)
  assert.match(code, /requestIdleCallback|scheduleIdle/)
  assert.match(code, /Math\.min\([^\n]*devicePixelRatio[^\n]*1\.5/)
  assert.doesNotMatch(code.slice(code.indexOf('function renderFrame')), /shadowBlur\s*=/)
  assert.doesNotMatch(code.slice(code.indexOf('function renderFrame')), /Math\.random\(/)
})
```

- [ ] **Step 2: Run the renderer contract and verify it fails**

Run: `node --test test/particle-renderer-contract.test.cjs`

Expected: FAIL because scene and renderer files do not exist.

- [ ] **Step 3: Implement the decorative Saturn markup and stacking**

`space-scene.ejs`:

```ejs
<div class="space-scene" aria-hidden="true">
  <div class="saturn-system">
    <div class="saturn-halo"></div>
    <div class="saturn-ring saturn-ring--back"></div>
    <div class="saturn"><div class="saturn-bands"></div><div class="saturn-light"></div></div>
    <div class="saturn-ring saturn-ring--front"></div>
  </div>
  <canvas id="particle-flow"></canvas>
</div>
```

Use an oblate 43/38 planet ratio, horizontal gas bands, a terminator shadow, a back ring clipped to its far half, and a front ring clipped to its near half. The Canvas sits above the static star field but below readable hero content.

- [ ] **Step 4: Implement the renderer lifecycle and hot loop**

`particle-flow.js` must:

- prerender cyan/violet sprites once to 40×40 offscreen canvases;
- initialize deterministic particles during idle time;
- resize through one queued animation frame;
- calculate delta time with a 50ms clamp;
- group draw calls by layer/color and reuse cached dimensions/lengths;
- ease the single pointer target and pass it to `positionParticle`;
- fade particles at the route edges and draw long trails only for the 3% streak layer;
- pause on `document.hidden`, reset `lastTimestamp`, and restart without catch-up;
- stop entirely for `prefers-reduced-motion: reduce`;
- update `snapshot()` with FPS, average frame ms, long-frame percentage, particle count, DPR, and quality level.

If Canvas 2D, `FluidParticleCore`, or motion APIs are unavailable, `mount()` returns a no-op lifecycle object, adds `.particle-fallback` to the scene, and leaves all Saturn/background/text layers visible.

- [ ] **Step 5: Load the scene and scripts only on the preserved home route**

In `home.ejs`, place `<%- partial('_partial/space-scene') %>` inside the hero. In `head.ejs`, when `page.path === 'index.html'`, include `space-scene.css`, then `particle-core.js` and `particle-flow.js` with `defer`; inner pages load neither particle script.

- [ ] **Step 6: Run all automated tests and build**

Run:

```powershell
npm run clean
npm run build
node --test test/theme-contract.test.cjs test/theme-build.test.cjs test/particle-core.test.cjs test/particle-renderer-contract.test.cjs
```

Expected: all tests PASS; `public/index.html` includes the scene and defer scripts; normal post pages do not include `particle-flow.js`.

- [ ] **Step 7: Commit the signature scene**

Run:

```powershell
git add -- themes/fluid-particle test/particle-renderer-contract.test.cjs
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "feat: add video-matched fluid particle scene"
```

---

### Task 6: Enforce responsive, accessible, and measurable behavior

**Files:**
- Create: `test/theme-accessibility-contract.test.cjs`
- Modify: `themes/fluid-particle/source/css/main.css`
- Modify: `themes/fluid-particle/source/css/space-scene.css`
- Modify: `themes/fluid-particle/source/css/post.css`
- Modify: `themes/fluid-particle/source/js/site.js`
- Modify: `themes/fluid-particle/source/js/particle-flow.js`

**Interfaces:**
- Consumes: semantic classes from Task 3 and renderer metrics from Task 5.
- Produces: keyboard-safe navigation, 320px support, reduced-motion fallback, and measurable foreground performance.

- [ ] **Step 1: Write the failing accessibility contract**

Create `test/theme-accessibility-contract.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const read = file => fs.readFileSync(file, 'utf8')

test('theme contains keyboard and motion safeguards', () => {
  const layout = read('themes/fluid-particle/layout/layout.ejs')
  const header = read('themes/fluid-particle/layout/_partial/header.ejs')
  const css = [read('themes/fluid-particle/source/css/main.css'), read('themes/fluid-particle/source/css/space-scene.css')].join('\n')
  const js = read('themes/fluid-particle/source/js/particle-flow.js')
  assert.match(layout, /class="skip-link"/)
  assert.match(header, /aria-expanded="false"/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /min-(height|block-size):\s*44px/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
  assert.match(js, /prefers-reduced-motion:\s*reduce/)
})
```

- [ ] **Step 2: Run the test and verify any missing safeguards fail**

Run: `node --test test/theme-accessibility-contract.test.cjs`

Expected: FAIL until all exact safeguards exist.

- [ ] **Step 3: Complete responsive and reduced-motion behavior**

At ≤760px, stack the hero, push Saturn partially beyond the lower-right edge, cap DPR at 1.25, reduce base particles by at least 45%, disable pointer displacement, and keep text above the scene. At 320px there must be no horizontal scroll. Under reduced motion, hide Canvas, freeze Saturn bands, and retain the static star field/planet.

- [ ] **Step 4: Run automated tests and inspect four viewports**

Run the server: `npm run server -- --port 4000`.

Using the in-app browser, inspect and capture screenshots at 320×740, 768×900, 1440×900, and 1920×1080. At each width verify: no horizontal overflow; hero text readable; Saturn does not cover controls; menu button/links have visible focus; article code/tables scroll within their container.

- [ ] **Step 5: Compare the live flow with the supplied video and measure foreground frames**

Keep the reference contact sheet beside the live homepage. Observe at least 20 seconds and verify:

- persistent slow dust dominates;
- medium glints travel in small groups;
- rare streaks are separated by calm intervals;
- all bands curve in the same direction;
- pointer movement bends the field subtly without attraction/explosion;
- no edge respawn flashes.

Read `window.__fluidParticleMetrics.snapshot()` after 20 foreground seconds. Expected at 1920×1080: FPS ≥55 and long-frame percentage <2%. If below target, lower particle count/DPR through the existing quality controller; do not remove the three-layer behavior.

- [ ] **Step 6: Run all tests and commit the quality pass**

Run:

```powershell
npm run clean
npm run build
node --test test/*.test.cjs
git add -- themes/fluid-particle test/theme-accessibility-contract.test.cjs
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "fix: harden fluid particle accessibility and performance"
```

Expected: build and tests PASS; screenshots and metrics satisfy the stated checks.

---

### Task 7: Apply the three-skill review gates

**Files:**
- Review: `themes/fluid-particle/layout/**/*.ejs`
- Review: `themes/fluid-particle/source/css/*.css`
- Review: `themes/fluid-particle/source/js/*.js`
- Modify tests only when a discovered bug needs a regression assertion.

**Interfaces:**
- Consumes: completed theme and the latest Web Interface Guidelines from the skill source.
- Produces: zero unresolved high-priority UI guideline findings and a final frontend-design visual critique.

- [ ] **Step 1: Fetch the current Web Interface Guidelines**

Use the `web-design-guidelines` skill to fetch exactly:

`https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`

Apply every rule to the EJS, CSS, and JavaScript patterns above. Record findings in terse `file:line` format.

- [ ] **Step 2: Turn each valid finding into a failing regression check**

For source-checkable issues, add a precise assertion to the relevant `test/*.test.cjs` file before fixing. For visual-only issues, capture the before screenshot and record the viewport and visible failure.

- [ ] **Step 3: Fix all high-priority and directly applicable findings**

Do not add generic HUD decoration. Preserve the frontend-design rule that Saturn/particle flow is the single bold element. Ensure labels describe real navigation/content and all animations serve spatial atmosphere.

- [ ] **Step 4: Re-run Vercel-derived performance checks**

Verify: one listener per global event; passive non-cancelling input listener; no per-frame DOM queries, gradients, regular-expression creation, or random generation; static scripts use `defer`; off-screen post cards use `content-visibility`; non-critical work uses the idle scheduler.

- [ ] **Step 5: Run the full test/build/browser review and commit**

Run:

```powershell
npm run clean
npm run build
node --test test/*.test.cjs
git add -- themes/fluid-particle test
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "fix: satisfy fluid particle interface review"
```

Expected: all automated checks PASS; the guideline review has no unresolved high-priority items; final desktop/mobile screenshots retain a single visual focal point.

---

### Task 8: Retire NexT safely and perform final theme verification

**Files:**
- Remove: `themes/next theme/`
- Verify: external backup recorded in `docs/recovery/2026-08-28-redesign-backup.md`
- Verify: all new/modified theme, config, and test files.

**Interfaces:**
- Consumes: passing Tasks 1–7 and a verified external backup.
- Produces: a repository whose active and only custom blog theme is `fluid-particle`, without touching unrelated source-file deletions.

- [ ] **Step 1: Reconfirm backup, target, and Git scope before deletion**

Run:

```powershell
$workspace = (Resolve-Path 'C:/Users/Lenovo/Desktop/Quarkbobo').Path
$legacyTheme = (Resolve-Path 'C:/Users/Lenovo/Desktop/Quarkbobo/themes/next theme').Path
if (-not $legacyTheme.StartsWith($workspace + [IO.Path]::DirectorySeparatorChar)) { throw 'Legacy theme target escaped workspace.' }
Select-String -Path docs/recovery/2026-08-28-redesign-backup.md -Pattern 'Quarkbobo-before-redesign-'
npm run clean
npm run build
node --test test/*.test.cjs
```

Expected: exact legacy target is inside `themes`; backup record exists; build/tests PASS before deletion.

- [ ] **Step 2: Remove only the verified legacy theme directory**

Run:

```powershell
Remove-Item -LiteralPath $legacyTheme -Recurse
if (Test-Path -LiteralPath $legacyTheme) { throw 'Legacy theme still exists.' }
```

This deletion is authorized by the approved spec and recoverable from the full external backup.

- [ ] **Step 3: Re-run the complete verification after deletion**

Run:

```powershell
npm run clean
npm run build
node --test test/*.test.cjs
git status --short
```

Expected: build/tests PASS. `source/files` deletions remain unstaged and unchanged. No backup, `public/`, `node_modules/`, or `.superpowers/` content is staged.

- [ ] **Step 4: Commit only the NexT retirement**

Run:

```powershell
git add -- 'themes/next theme'
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "chore: retire backed-up next theme"
```

- [ ] **Step 5: Run the final evidence gate**

Use `verification-before-completion`. Freshly run the build, all Node tests, route checks, four viewport checks, reduced-motion check, 20-second foreground particle metrics, and `git status --short --branch`. Report actual measured FPS/long-frame values and any remaining unrelated user changes.
