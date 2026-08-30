# Task 3 Report: Semantic layouts and static archive visual system

## Status

Complete. The root catalogue remains at `/`, normal articles keep their existing generated paths, archives and taxonomy surfaces render semantic collections, and the theme now provides the static “深空档案馆” shell required by later scene work.

## RED evidence

The test was written before implementation and reads only generated files under `public/`.

Commands:

```powershell
npm run clean
npm run build
node --test test/theme-build.test.cjs
```

Observed baseline result:

```text
tests 4
pass 1
fail 3
```

Expected failures were:

- root output lacked `data-fluid-home` and the designed catalogue homepage;
- `个人博客/Hello-World/index.html` lacked `.article-shell` and `.article-toc`;
- archive and taxonomy output lacked `.archive-list` / `.taxonomy-index` and the accessible main navigation.

The static game/tool route preservation test passed at RED, confirming the fixture itself could see the existing copied routes.

## GREEN evidence

Final fresh verification:

```powershell
npm run clean
npm run build
node --test test/theme-contract.test.cjs test/theme-build.test.cjs
git diff --check
node --check themes/fluid-particle/source/js/site.js
```

Observed result:

```text
Hexo: 75 files generated
tests 7
pass 7
fail 0
cancelled 0
skipped 0
todo 0
git diff --check: exit 0 (only core.autocrlf conversion notices)
node --check: exit 0
```

## Implementation

- Split the semantic document into head, header, footer, home, card, full-article, and archive-list partials.
- Kept the catalogue post at `/`; its real Hexo local path is `/`, so dispatch and exclusion logic accepts both `/` and the brief's `index.html` form.
- Rendered the newest ten non-catalogue posts before the preserved catalogue body.
- Added semantic archive/category/tag collection surfaces and the exact empty text `档案中还没有记录`.
- Added fixed `/categories/` and `/tags/` source pages without changing any existing post body.
- Added a real menu button with progressive enhancement. With JavaScript absent, links remain visible; with JavaScript present, one local click handler synchronizes `aria-expanded` and `.is-open`.
- Added the approved six-color tokens, local display/body/data font stacks, 55/45 desktop hero, 320px-safe responsive layout, 44px navigation targets, focus/skip-link treatment, restrained card hover, and article/media/code/table styles.
- Reserved an empty `data-fluid-scene` structure for later particle/Saturn work; no canvas, Saturn rendering, HUD, scanline, remote font, or remote CSS was added.

## Browser verification

- Desktop homepage: semantic hero, navigation, latest cards, and preserved catalogue visible.
- 320px viewport: menu button visible; navigation hidden before activation and visible after activation; `aria-expanded` changed from `false` to `true`.
- A one-off failing reproduction found `scrollWidth 320 > clientWidth 305`; root cause was `min-width: 320px` combined with the vertical scrollbar. Removing that forced minimum produced `scrollWidth === clientWidth === 305` without clipping.
- Desktop article: `.article-shell` measured 760px, `.article-toc` was present, and no console warnings/errors or horizontal overflow appeared.
- Heading-free About article: `.article-shell` present, `.article-toc` absent, and no horizontal overflow.

## Changed files

- `test/theme-build.test.cjs`
- `source/categories/index.md`
- `source/tags/index.md`
- `themes/fluid-particle/layout/layout.ejs`
- `themes/fluid-particle/layout/index.ejs`
- `themes/fluid-particle/layout/post.ejs`
- `themes/fluid-particle/layout/page.ejs`
- `themes/fluid-particle/layout/archive.ejs`
- `themes/fluid-particle/layout/category.ejs`
- `themes/fluid-particle/layout/tag.ejs`
- `themes/fluid-particle/layout/_partial/head.ejs`
- `themes/fluid-particle/layout/_partial/header.ejs`
- `themes/fluid-particle/layout/_partial/footer.ejs`
- `themes/fluid-particle/layout/_partial/home.ejs`
- `themes/fluid-particle/layout/_partial/post-card.ejs`
- `themes/fluid-particle/layout/_partial/post-full.ejs`
- `themes/fluid-particle/layout/_partial/archive-list.ejs`
- `themes/fluid-particle/source/css/main.css`
- `themes/fluid-particle/source/css/post.css`
- `themes/fluid-particle/source/js/site.js`

## Self-review

- Generated-output tests use the real `个人博客/Hello-World/index.html` route and do not grep EJS/CSS source.
- Root output contains seven post cards and does not repeat the catalogue post as a card.
- Normal posts retain their existing generated routes and content; static games, image transformer, and download assets remain untouched.
- Heading-derived TOC is constrained to depth 2–3 and omitted when empty.
- No unrelated source posts, static games, tools, downloads, root configuration, or theme menu configuration changed.

## Concerns

- The pre-existing theme menu contract maps “关于” to `/About-me/`, while the preserved generated article route is `/关于我/About-me/`. Task 3 intentionally consumed the locked menu contract instead of changing it; the parent task should decide whether a later contract update or redirect owns that mismatch.
- Git reports the repository's normal LF-to-CRLF conversion notices for tracked theme files; `git diff --check` still exits successfully with no whitespace errors.

## Fix round 1: primary navigation route repair

### Investigation and root cause

- Inspected the three uncommitted files before editing: the theme configuration, its structured contract expectation, and a build-output navigation-route test.
- A clean build with the candidate fix generated `public/关于我/About-me/index.html`; no `public/About-me/index.html` exists. The generated root navigation linked to `/%E5%85%B3%E4%BA%8E%E6%88%91/About-me/`, and every internal menu link (including `/`) mapped to an existing public output.
- The header renders its links from `theme.menu`, so the bad value originated in the theme menu configuration rather than in header rendering or URL encoding.

### RED evidence

Temporarily restored only the old menu value, `关于: /About-me/`, then ran:

```powershell
npm run clean
npm run build
node --test test/theme-build.test.cjs
```

Observed result: 5 tests total, 4 passed, 1 failed. The generated navigation contained `/About-me/`, and the focused output assertion failed as expected:

```text
AssertionError [ERR_ASSERTION]: /About-me/ -> About-me\index.html
```

`public/About-me/index.html` was absent while the real generated route remained `public/关于我/About-me/index.html`. This proves the test exercises build output rather than source text and catches the reported broken navigation behavior.

### GREEN evidence

Restored the minimal source fix and ran:

```powershell
npm run clean
npm run build
node --test test/theme-contract.test.cjs test/theme-build.test.cjs
git diff --check
```

Observed result: Hexo generated 75 files; the two suites reported 8 tests, 8 passed, 0 failed. `git diff --check` exited 0 (with only the repository's standard LF-to-CRLF notices).

Verified generated navigation mappings:

```text
/ => public\index.html => True
/archives/ => public\archives\index.html => True
/categories/ => public\categories\index.html => True
/tags/ => public\tags\index.html => True
/%E5%85%B3%E4%BA%8E%E6%88%91/About-me/ => public\关于我\About-me\index.html => True
```

### Changes and self-review

- Changed the `关于` menu item to `/关于我/About-me/`; no redirect was added.
- Kept the structured theme configuration contract aligned with that path.
- Added the generated-output regression test: it extracts internal primary-navigation `href` values from `public/index.html`, decodes each pathname, and requires the matching generated public artifact. It covers the root route as well as all other menu entries.
- Modified only the three requested implementation/test files plus this appended report; no header, routing, or unrelated site content changed.
