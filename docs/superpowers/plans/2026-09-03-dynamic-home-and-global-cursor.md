# Dynamic Home and Global Cursor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Bobo publishing resilient to arbitrary `_posts` folder changes, render author-marked first-paragraph summaries and three-day `NEW` ribbons on the home page, and provide the cursor trail across the complete theme.

**Architecture:** Keep folder discovery in the PowerShell publisher, expose Markdown lead extraction through a small Hexo helper backed by a pure CommonJS module, and isolate time-sensitive home-card behavior in a browser core/runtime pair. Move cursor visuals into a global stylesheet and make the existing runtime accept an optional home scene.

**Tech Stack:** Hexo 8, EJS, Node.js CommonJS and browser UMD modules, CSS, PowerShell 5.1, Node test runner, GitHub Actions Pages.

## Global Constraints

- `source/_posts/博客目录.md` remains the special root catalogue and never appears as an ordinary latest-post card.
- A lead exists only when the first nonblank source block begins with one Tab or at least four spaces, after ignoring BOM or zero-width characters.
- `NEW` applies when `0 <= now - publishedAt <= 72 hours`; future posts are not new.
- Main title is exactly `蓝色空间号`; subtitle is exactly `技术笔记、游戏合集、日常Vlog`.
- Header menu contains `首页`, `归档`, and `关于`; it contains no `分类` or `标签`.
- Footer copy is exactly `不要回答！不要回答！不要回答！`.
- Cursor trails remain disabled for coarse pointers, non-hover input, narrow screens, hidden pages, and reduced motion.
- Content additions, deletions, folder renames, and optional image-dimension cache entries must not break deployment tests.

---

### Task 1: Dynamic catalogue discovery

**Files:**
- Modify: `tools/bobo-update.ps1:42-145`
- Modify: `test/bobo-update-contract.test.cjs:38-132`

**Interfaces:**
- Consumes: repository root containing `source/_posts`.
- Produces: `Write-BlogCatalogue($RepoPath)` with groups derived from current first-level folders and a `未分类` root group.

- [ ] **Step 1: Write failing folder-change tests**

Add fixture cases that create `随笔/hello.md`, `实验/深层/demo.md`, and `root.md`, run the updater, then assert headings `### 随笔`, `### 实验`, and `### 未分类`. Rename `随笔` to `航行日志`, delete `实验`, rerun, and assert the old headings and links disappear.

```js
assert.match(catalogue, /### 航行日志[\s\S]*\[你好，Bobo\]/)
assert.doesNotMatch(catalogue, /### 随笔|### 实验/)
assert.match(catalogue, /### 未分类[\s\S]*\[根目录文章\]/)
```

- [ ] **Step 2: Verify the new tests fail**

Run: `node --test test/bobo-update-contract.test.cjs`

Expected: FAIL because `bobo-update.ps1` still uses four hardcoded folders.

- [ ] **Step 3: Replace hardcoded folder metadata with discovery**

Build folder records from the relative path of every supported file. Use the first relative path segment as the group, use `未分类` for root files, preserve nested route segments, and sort group names and article titles with stable ordinal-ignore-case ordering.

```powershell
$relative = [System.IO.Path]::GetRelativePath($postsPath, $file.FullName)
$segments = $relative -split '[\\/]'
$groupName = if ($segments.Count -gt 1) { $segments[0] } else { '未分类' }
```

- [ ] **Step 4: Run the updater contract suite**

Run: `node --test test/bobo-update-contract.test.cjs`

Expected: PASS, including add, delete, rename, nested file, root file, and push behavior.

- [ ] **Step 5: Commit dynamic discovery**

```bash
git add tools/bobo-update.ps1 test/bobo-update-contract.test.cjs
git commit -m "feat: discover blog folders dynamically"
```

### Task 2: Markdown lead extraction and responsive summaries

**Files:**
- Create: `themes/fluid-particle/scripts/post-lead-core.js`
- Create: `themes/fluid-particle/scripts/post-lead.js`
- Create: `test/post-lead-core.test.cjs`
- Modify: `themes/fluid-particle/layout/_partial/post-card.ejs:1-19`
- Modify: `themes/fluid-particle/source/css/main.css:317-399`
- Modify: `test/theme-template.test.cjs`

**Interfaces:**
- Produces: `extractPostLead(source: string): string` and Hexo helper `post_lead(source)`.
- Consumes: `post.raw || post._content || ''` from the card template.

- [ ] **Step 1: Write pure lead-extractor tests**

Cover Tab indentation, four-space indentation, BOM/zero-width prefix, multiline paragraphs, front matter, and rejection of unindented text, heading, quote, list, image, fenced code, and HTML first blocks.

```js
assert.equal(extractPostLead('---\ntitle: A\n---\n\n\t第一段文字\n\n第二段'), '第一段文字')
assert.equal(extractPostLead('    [入口](https://example.com) 和 **重点**'), '入口 和 重点')
assert.equal(extractPostLead('# 标题\n\n    后面的段落'), '')
```

- [ ] **Step 2: Verify extractor tests fail**

Run: `node --test test/post-lead-core.test.cjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure extractor and Hexo helper**

Strip front matter, inspect only the first nonblank block, remove one indentation marker per line, normalize inline Markdown to readable text, and return an empty string on rejected input. Register the helper without filesystem access during rendering.

```js
hexo.extend.helper.register('post_lead', source => extractPostLead(String(source || '')))
```

- [ ] **Step 4: Render only the helper result in cards**

Replace the 112-character `post.content` slice with `post_lead(post.raw || post._content || '')`. Add `display: -webkit-box`, responsive `-webkit-line-clamp`, hidden overflow, and text overflow styling to `.post-card__summary`.

- [ ] **Step 5: Run focused summary tests**

Run: `node --test test/post-lead-core.test.cjs test/theme-template.test.cjs`

Expected: PASS; a long lead remains complete in generated HTML while CSS owns the visible ellipsis.

- [ ] **Step 6: Commit summary extraction**

```bash
git add themes/fluid-particle/scripts themes/fluid-particle/layout/_partial/post-card.ejs themes/fluid-particle/source/css/main.css test/post-lead-core.test.cjs test/theme-template.test.cjs
git commit -m "feat: derive home summaries from marked paragraphs"
```

### Task 3: Home copy, dynamic article cards, and three-day ribbons

**Files:**
- Create: `themes/fluid-particle/source/js/home-latest-core.js`
- Create: `themes/fluid-particle/source/js/home-latest.js`
- Create: `test/home-latest-core.test.cjs`
- Modify: `themes/fluid-particle/_config.yml:1-11`
- Modify: `themes/fluid-particle/layout/_partial/head.ejs:7-18`
- Modify: `themes/fluid-particle/layout/_partial/home.ejs:1-34`
- Modify: `themes/fluid-particle/layout/_partial/post-card.ejs`
- Modify: `themes/fluid-particle/layout/_partial/footer.ejs:1-6`
- Modify: `themes/fluid-particle/source/css/main.css:205-399`
- Modify: `test/theme-template.test.cjs`

**Interfaces:**
- Produces: `publicationState(publishedAt: string|number|Date, nowMs: number): 'new'|'ordinary'|'future'|'invalid'`.
- Produces: cards with `data-published-at`, `data-latest-card`, and a hidden `.post-card__ribbon`.

- [ ] **Step 1: Write deterministic 72-hour boundary tests**

```js
assert.equal(publicationState(now - 72 * HOUR, now), 'new')
assert.equal(publicationState(now - 72 * HOUR - 1, now), 'ordinary')
assert.equal(publicationState(now + 1, now), 'future')
```

- [ ] **Step 2: Verify time-state tests fail**

Run: `node --test test/home-latest-core.test.cjs`

Expected: FAIL because the core module does not exist.

- [ ] **Step 3: Implement the core and home runtime**

At DOM ready, classify every latest card, add `is-new` only within the inclusive 72-hour window, then place new cards before ordinary/future cards while preserving date order inside each group.

- [ ] **Step 4: Update template copy and article filtering**

Set the approved hero and menu values, change the footer text, filter the catalogue source out of `homePosts`, include recursively discovered posts, and load home-latest scripts only on the home route.

- [ ] **Step 5: Style the single-line title and ribbon**

Use a one-line responsive title with `white-space: nowrap` and a viewport-safe clamp. Add an absolute top-right red gradient ribbon rotated 45 degrees, reserve card space, and reveal it only under `.post-card.is-new`.

- [ ] **Step 6: Run focused home tests**

Run: `node --test test/home-latest-core.test.cjs test/theme-template.test.cjs`

Expected: PASS for copy, menu, catalogue exclusion, timestamps, sorting state, and ribbon markup.

- [ ] **Step 7: Commit home behavior**

```bash
git add themes/fluid-particle/_config.yml themes/fluid-particle/layout themes/fluid-particle/source/css/main.css themes/fluid-particle/source/js/home-latest*.js test/home-latest-core.test.cjs test/theme-template.test.cjs
git commit -m "feat: highlight recent posts on the home page"
```

### Task 4: Global cursor trail

**Files:**
- Create: `themes/fluid-particle/source/css/cursor-comet.css`
- Modify: `themes/fluid-particle/source/css/space-scene.css:188-241`
- Modify: `themes/fluid-particle/layout/_partial/head.ejs`
- Modify: `themes/fluid-particle/layout/layout.ejs:1-12`
- Modify: `themes/fluid-particle/source/js/cursor-comet.js:10-180`
- Modify: `test/cursor-comet-contract.test.cjs`
- Modify: `test/particle-renderer-contract.test.cjs`
- Modify: `test/theme-browser-behavior.test.cjs`

**Interfaces:**
- `FluidCursorComet.mount(overlay, { scene?: Element|null })` accepts a missing scene.
- Scene pause/fallback classes affect cursor policy only when a scene exists.

- [ ] **Step 1: Add failing no-scene and generated-page tests**

Extend the cursor fixture so `scene` may be null, then assert eligible pointer motion still activates a segment. Assert generated home and article HTML each contain exactly one cursor overlay, stylesheet, core script, and runtime script.

- [ ] **Step 2: Verify cursor tests fail**

Run: `node --test test/cursor-comet-contract.test.cjs test/particle-renderer-contract.test.cjs`

Expected: FAIL because inner pages omit all cursor assets and runtime mounting requires a scene.

- [ ] **Step 3: Separate global cursor CSS**

Move `.cursor-comet` rules and keyframes from `space-scene.css` into `cursor-comet.css`. Load the new stylesheet and both cursor scripts outside the home-only branch.

- [ ] **Step 4: Mount globally with an optional scene**

Always render `_partial/cursor-comet` in `layout.ejs`. Guard class checks and `MutationObserver.observe()` behind `scene`, and auto-mount whenever the overlay and core exist.

- [ ] **Step 5: Run cursor behavior tests**

Run: `node --test test/cursor-comet-contract.test.cjs test/particle-renderer-contract.test.cjs test/theme-browser-behavior.test.cjs`

Expected: PASS for home pause integration, article no-scene behavior, accessibility, pool reuse, and reduced-motion policy.

- [ ] **Step 6: Commit global cursor support**

```bash
git add themes/fluid-particle/source/css/cursor-comet.css themes/fluid-particle/source/css/space-scene.css themes/fluid-particle/layout themes/fluid-particle/source/js/cursor-comet.js test/cursor-comet-contract.test.cjs test/particle-renderer-contract.test.cjs test/theme-browser-behavior.test.cjs
git commit -m "feat: show cursor trails across theme pages"
```

### Task 5: Content-independent deployment gates and release verification

**Files:**
- Modify: `test/theme-build.test.cjs`
- Modify: `test/theme-accessibility-contract.test.cjs`
- Modify: `test/theme-browser-behavior.test.cjs`
- Modify: `test/theme-contract.test.cjs`
- Modify: `themes/fluid-particle/_config.yml`
- Verify: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: arbitrary current article set and optional `theme.image_dimensions` records.
- Produces: CI tests that fail for theme/build defects but tolerate normal content additions, deletions, moves, and folder renames.

- [ ] **Step 1: Replace stale-content assertions**

Use stable test fixtures for heading/TOC behavior, remove assertions for deleted `/categories/` and `/tags/` pages, and validate only the three configured primary navigation destinations. Change image cache tests to require positive integer `width` and `height` for each configured entry without requiring historical URLs to remain authored.

- [ ] **Step 2: Run the complete suite and inspect every failure**

Run: `npm run test:fresh`

Expected: any remaining failures point to current implementation defects, not deleted historical content.

- [ ] **Step 3: Fix only concrete remaining contract mismatches**

Update generated-page assertions to reflect global cursor assets and the approved copy while preserving accessibility, intrinsic image dimensions when known, and valid internal navigation.

- [ ] **Step 4: Re-run complete verification**

Run: `npm run test:fresh`

Expected: PASS with zero failing tests and a generated `public/index.html` containing current articles, responsive lead summaries, and ribbon data.

- [ ] **Step 5: Inspect generated artifacts and Git diff**

Run: `git diff --check` and targeted `rg` checks against `public/index.html` and one generated article page.

Expected: no whitespace errors; exact new copy; no category/tag header links; one cursor overlay per page; `博客目录.md` absent from latest cards.

- [ ] **Step 6: Commit deployment resilience**

```bash
git add test themes/fluid-particle/_config.yml
git commit -m "test: keep publishing resilient to content changes"
```

- [ ] **Step 7: Merge to master, push, and verify Pages**

Run the branch integration workflow, push `master`, wait for the `Deploy Hexo site to Pages` run tied to the resulting SHA, and fetch `https://quarkbobo.github.io/` with a cache-busting query.

Expected: workflow conclusion `success`; live home contains `蓝色空间号`, `技术笔记、游戏合集、日常Vlog`, and the newest authored article.
