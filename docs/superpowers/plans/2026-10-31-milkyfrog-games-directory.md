# Milky Frog Games Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all 35 games currently listed on Milky Frog to the Quarkbobo game page, retain its four local games, and publish the change through GitHub Pages.

**Architecture:** Keep the directory as static links in the existing Hexo Markdown post. Use the existing game-card CSS and the existing Pages workflow; do not add runtime code, dependencies, embeds, or third-party game assets.

**Tech Stack:** Hexo 8.1.1, Markdown, existing Node.js test suite, GitHub Actions Pages workflow.

## Global Constraints

- Only publish directory text and links; do not download, copy, or rehost third-party game code, images, audio, or other assets.
- Preserve the four existing Quarkbobo game destinations.
- Use each of the 35 source-page titles, author labels when listed, and original URLs exactly as recorded in the approved spec.
- Open external games in a new tab with `rel="noopener noreferrer"`.
- Use the existing responsive game-card layout and add no runtime dependencies or iframe embeds.
- GitHub Pages continues to deploy from `master` using the existing workflow.

---

## File Map

- `source/_posts/游戏相关/game-concat.md` — static game cards rendered by Hexo.
- `test/archive-a.test.cjs` — existing contract for the game page and its four original links; extend it to cover the complete 39-link directory and safe external-link attributes.
- `.github/workflows/pages.yml` — existing build, test, and Pages deployment pipeline; no change expected.
- `docs/superpowers/specs/2026-10-31-milkyfrog-games-directory-design.md` — approved source of truth for the exact 35 external title, author, and URL records.

### Task 1: Add and publish the 35 source games

**Files:**
- Modify: `test/archive-a.test.cjs`
- Modify: `source/_posts/游戏相关/game-concat.md`

**Interfaces:**
- The page exposes one `.article-body` anchor per game. Its text is the game title, followed by ` · 作者：<name>` only when the approved spec lists an author.
- Every external anchor has `target="_blank"` and `rel="noopener noreferrer"`.
- The first four anchors remain the existing local games; the 35 new external anchors follow them in the same order as the approved spec.

- [ ] **Step 1: Extend the page contract to the approved 39-link directory**

In `test/archive-a.test.cjs`, replace the four-link assertion with an exact ordered comparison of all 39 `[visible text, href]` pairs: the four existing local pairs followed by the 35 rows in `2026-10-31-milkyfrog-games-directory-design.md`. Add assertions that all 35 external links use `target="_blank"` and include both `noopener` and `noreferrer` in `rel`.

The test should keep the existing `data-page-kind="games"` assertion and use these exact expected pairs:

```js
const expectedPairs = [
  ['贪吃蛇CTF', 'https://quarkbobo.github.io/snake'],
  ['2048', 'https://quarkbobo.github.io/2048'],
  ['中国象棋', 'https://quarkbobo.github.io/中国象棋'],
  ['国际象棋', 'https://quarkbobo.github.io/国际象棋'],
  ['俄罗斯奶块 · 作者：EIAAN', 'https://milkcubebycyanchan1eiann.netlify.app/'],
  ['合成大奶蛙 · 作者：十二月的狼头', 'https://yhsome.github.io/BigNaiWa/v1/'],
  ['合成小奶蛙 · 作者：十二月的狼头', 'https://yhsome.github.io/SmallNaiWa/'],
  ['旅行奶蛙', 'https://www.bilibili.com/toy/TravelMilkyFrog/index.html'],
  ['奶国物语 · 作者：雀石不诗人', 'https://e.233ly.com/bn1yRe'],
  ['奶了个蛙', 'https://junjunya2020.github.io/nailegewa'],
  ['奶了个蛙2 · 作者：河南农大表白墙', 'https://nai-le-ge-wa-wemcta8qgu2.qoder.zone/'],
  ['奶蛙2048 · 作者：十二月的狼头', 'https://yhsome.github.io/Nai2048/'],
  ['奶蛙2048超级版', 'https://game.0z.hk/game/2048/'],
  ['奶蛙爱洗澡 · 作者：kingtrain', 'https://milkfrog-bath.pages.dev/'],
  ['奶蛙打砖块 · 作者：nnn', 'https://niuniu513-ask.github.io/milky-breakout/?v=1deb2eb'],
  ['奶蛙的奶块雨 · 作者：光影集', 'https://naiwa-milk-rain.pages.dev/'],
  ['奶蛙的小窝', 'https://naiwaxiaowu.pages.dev/'],
  ['奶蛙放屁 · 作者：二奶', 'https://naiwa-fart.pages.dev/'],
  ['奶蛙飞机大战 · 作者：丶基控Q', 'https://naiwafly.dpdns.org/'],
  ['奶蛙工厂', 'https://66970010-boop.github.io/frog-miner'],
  ['奶蛙街舞 · 作者：念因', 'https://nailong-dance.pages.dev'],
  ['奶蛙快跑', 'https://e.233ly.com/1ABrH3'],
  ['奶蛙雷霆小队 · 作者：雀石不诗人', 'https://e.233ly.com/v65Ihd'],
  ['奶蛙奶茶铺', 'https://naiwanaichadian.pages.dev/'],
  ['奶蛙挠痒 · 作者：Elio', 'https://naiwa.bocchi.website/'],
  ['奶蛙神跑', 'https://naiwa.me'],
  ['奶蛙贪吃蛙', 'https://milkyfrogs.toolsbox.vip/'],
  ['奶蛙踢馆 · 作者：胆子肥嘟嘟', 'https://night-market-rumble-54328.app.workbuddy.host/'],
  ['奶蛙跳一跳 · 作者：光影集', 'https://naiba-jump.pages.dev/'],
  ['奶蛙推奶块 · 作者：EIAAN', 'https://sparkly-macaron-5c86c7.netlify.app/'],
  ['奶蛙五子棋', 'https://wudibaolongzhanshi1234.github.io/1335689.giyhub.io/'],
  ['奶蛙消消乐', 'https://chenckx0614.github.io/naiwaxxl/'],
  ['奶蛙颜色大挑战', 'https://milkyfrog.toolsbox.vip/'],
  ['奶蛙一跳 · 作者：Sn', 'https://naiwa-jump.pages.dev/'],
  ['奶蛙羽毛球', 'https://www.bilibili.com/toy/naiwa-badminton/index.html'],
  ['奶蛙jump', 'https://naiwai-jump.github.io/'],
  ['勇者奶蛙传 · 作者：雀石不诗人', 'https://e.233ly.com/yDkGpm'],
  ['召唤神龙 · 作者：鱼戏荷', 'https://naiwa.games/'],
  ['抓奶蛙 · 作者：龙井茉莉', 'https://www.bilibili.com/toy/zhua-nai-wa/index.html']
];
const links = $('.article-body a').toArray();
assert.equal(links.length, 39);
assert.deepEqual(links.map(a => [$(a).text(), $(a).attr('href')]), expectedPairs);
for (const a of links.slice(4)) {
  assert.equal($(a).attr('target'), '_blank');
  assert.deepEqual(new Set($(a).attr('rel').split(/\s+/)), new Set(['noopener', 'noreferrer']));
}
```

- [ ] **Step 2: Build the current page and confirm the new contract fails**

Run:

```powershell
npm run build
node --test test/archive-a.test.cjs
```

Expected: the game-page assertion fails because the generated page still has only four links.

- [ ] **Step 3: Add the external cards to the Hexo post**

In `source/_posts/游戏相关/game-concat.md`, retain the front matter and four local anchors in their current order. Append all 35 approved records as anchors in the same paragraph so the current `body[data-page-kind="games"] .article-body > p` grid lays them out as cards. Use each exact title and URL from the spec; append ` · 作者：<name>` to visible text only when that row provides an author. Set `target="_blank"` and `rel="noopener noreferrer"` on every new anchor.

- [ ] **Step 4: Rebuild and verify the game-page contract**

Run:

```powershell
npm run build
node --test test/archive-a.test.cjs
```

Expected: the focused archive-A tests pass, including the exact 39-link list and external-link security attributes.

- [ ] **Step 5: Run the full project test suite**

Run:

```powershell
npm test
```

Expected: the clean Hexo build and all Node tests pass.

- [ ] **Step 6: Review the generated directory**

Inspect `public/游戏相关/game-concat/index.html`. Confirm there are 39 cards; the first four retain their original local URLs; each of the 35 external titles points to its matching URL from the spec; author labels appear only where provided; every external link opens in a new tab with both safe `rel` values.

- [ ] **Step 7: Commit and push the approved change**

Check `git diff --check`, confirm only the game post and its contract test changed beyond the already committed spec and plan, then commit the feature. Recheck the configured Git remote and current branch before pushing the commit to `master`; the existing `pages.yml` workflow will build, test, and deploy it.

- [ ] **Step 8: Confirm the Pages deployment**

Inspect the GitHub Actions run triggered by the push. Confirm the build/test job and deploy job both succeed, then request the live game page and verify it serves the 39-link directory with the expected external destinations.
