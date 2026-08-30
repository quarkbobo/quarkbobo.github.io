const test = require('node:test')
const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const publicRoot = path.join(root, 'public')
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean)
const chromePath = chromeCandidates.find(candidate => fs.existsSync(candidate))

function decodeHtml (value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function readProbeResult (html) {
  const encoded = html.match(/<pre id="probe-result">([\s\S]*?)<\/pre>/)?.[1]
  assert.ok(encoded, 'Chrome returned the computed-style probe')
  return JSON.parse(decodeHtml(encoded))
}

function dumpWithChrome (fixturePath, { reducedMotion = false, viewport } = {}) {
  assert.ok(chromePath, `Chrome or Edge is installed (${chromeCandidates.join(', ')})`)
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluid-theme-chrome-'))
  try {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--allow-file-access-from-files',
      `--user-data-dir=${userDataDir}`,
      '--virtual-time-budget=1000',
      '--dump-dom'
    ]
    if (reducedMotion) args.push('--force-prefers-reduced-motion=reduce')
    if (viewport) args.push(`--window-size=${viewport.width},${viewport.height}`)
    args.push(new URL(`file:///${fixturePath.replace(/\\/g, '/')}`).href)
    const result = childProcess.spawnSync(chromePath, args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
      windowsHide: true
    })
    assert.equal(result.status, 0, result.stderr || 'Chrome probe failed')
    return result.stdout
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
}

function runChromeProbe ({ reducedMotion = false } = {}) {
  const generatedHome = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8')
  const themeColor = generatedHome.match(/<meta\b[^>]*name="theme-color"[^>]*content="([^"]+)"/i)?.[1]
  assert.ok(themeColor, 'generated home exposes a theme color')

  const mutation = process.env.FLUID_STYLE_PROBE_MUTATION === '1'
    ? `<style>
        h2 { scroll-margin-top: 0 !important; }
        .motion-toggle { min-height: 0 !important; touch-action: auto !important; }
        .post-card { transition: all 1s linear !important; }
        .post-card h3 a, .archive-list a { display: inline !important; min-block-size: 0 !important; }
        .post-card__categories a { display: flex !important; width: 100% !important; }
        .post-grid, .archive-list li { display: block !important; }
        .skip-link:focus { transform: translateY(0) !important; }
        #main-content:focus { outline: none !important; }
        .motion-paused .saturn-bands::before, .motion-paused .saturn-bands::after, .motion-paused .saturn-flares, .motion-paused .saturn-prominence { animation-play-state: running !important; }
        @media (prefers-reduced-motion: reduce) {
          .motion-toggle { display: inline-flex !important; }
          .saturn-bands::before { animation: saturn-latitude-drift 22s infinite !important; }
        }
      </style>`
    : ''
  const fixtureName = `.theme-browser-probe-${process.pid}-${reducedMotion ? 'reduce' : 'normal'}.html`
  const fixturePath = path.join(publicRoot, fixtureName)
  const fixture = `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <meta name="theme-color" content="${themeColor}">
        <link rel="stylesheet" href="css/main.css">
        <link rel="stylesheet" href="css/space-scene.css">
        ${mutation}
      </head>
      <body>
        <a class="skip-link" href="#main-content">Skip to content</a>
        <header class="site-header"></header>
        <main id="main-content" tabindex="-1">
          <h2 id="probe-heading">Probe heading</h2>
          <section class="home-hero" id="probe-hero">
            <button class="motion-toggle" id="motion-toggle" type="button">Pause</button>
            <div id="space-scene" class="space-scene">
              <div class="saturn-system">
                <div class="saturn-ring saturn-ring--back"></div>
                <svg class="saturn-prominences" viewBox="0 0 100 100" aria-hidden="true">
                  <g class="saturn-prominence saturn-prominence--crown"><path d="M 40 20 L 50 10" /></g>
                  <g class="saturn-prominence saturn-prominence--east"><path d="M 70 40 L 90 45" /></g>
                </svg>
                <div class="saturn"><div class="saturn-bands"></div><div class="saturn-flares"></div></div>
                <div class="saturn-ring saturn-ring--front"></div>
              </div>
            </div>
          </section>
          <div class="post-grid" id="probe-grid">
            <article class="post-card" id="probe-card">
              <h3><a id="probe-card-title" href="#probe-heading">A</a></h3>
              <ul class="post-card__categories"><li><a id="probe-category" href="#probe-heading">分类</a></li></ul>
            </article>
            <article class="post-card"><h3><a href="#probe-heading">Second card</a></h3></article>
          </div>
          <ol class="archive-list"><li id="probe-archive-row"><time>2026</time><a id="probe-archive-link" href="#probe-heading">B</a></li></ol>
        </main>
        <pre id="probe-result"></pre>
        <script>
          addEventListener('load', function () {
            const heading = document.getElementById('probe-heading')
            const control = document.getElementById('motion-toggle')
            const card = document.querySelector('.post-card')
            const grid = document.getElementById('probe-grid')
            const cardTitle = document.getElementById('probe-card-title')
            const category = document.getElementById('probe-category')
            const archiveRow = document.getElementById('probe-archive-row')
            const archiveLink = document.getElementById('probe-archive-link')
            const main = document.getElementById('main-content')
            const scene = document.getElementById('space-scene')
            const skipLink = document.querySelector('.skip-link')
            const bands = document.querySelector('.saturn-bands')

            skipLink.focus({ focusVisible: false })
            const pointerLikeSkip = {
              focusVisible: skipLink.matches(':focus-visible'),
              top: skipLink.getBoundingClientRect().top
            }
            skipLink.blur()
            skipLink.focus({ focusVisible: true })
            const keyboardLikeSkip = {
              focusVisible: skipLink.matches(':focus-visible'),
              top: skipLink.getBoundingClientRect().top
            }
            main.focus({ focusVisible: true })
            const mainFocusStyle = getComputedStyle(main)
            const mainFocus = {
              focusVisible: main.matches(':focus-visible'),
              outlineStyle: mainFocusStyle.outlineStyle,
              outlineWidth: mainFocusStyle.outlineWidth,
              outlineOffset: mainFocusStyle.outlineOffset
            }
            const flares = document.querySelector('.saturn-flares')
            const prominences = Array.from(document.querySelectorAll('.saturn-prominence'))
            const ring = document.querySelector('.saturn-ring')
            const animatedStyles = [
              getComputedStyle(bands, '::before'),
              getComputedStyle(bands, '::after'),
              getComputedStyle(flares),
              ...prominences.map(node => getComputedStyle(node))
            ]
            const animationSnapshot = function () {
              return animatedStyles.map(function (style) {
                return { name: style.animationName, playState: style.animationPlayState }
              })
            }
            scene.classList.add('motion-paused')
            const pausedAnimations = animationSnapshot()
            scene.classList.remove('motion-paused')
            const runningAnimations = animationSnapshot()
            scene.classList.add('particle-fallback')
            const fallbackAnimations = animationSnapshot()
            const fallbackControlDisplay = getComputedStyle(control).display
            scene.classList.remove('particle-fallback')
            control.focus()
            const controlStyle = getComputedStyle(control)
            const cardStyle = getComputedStyle(card)
            const cardTitleStyle = getComputedStyle(cardTitle)
            const categoryStyle = getComputedStyle(category)
            const archiveLinkStyle = getComputedStyle(archiveLink)
            const cardRect = card.getBoundingClientRect()
            const cardTitleRect = cardTitle.getBoundingClientRect()
            const categoryRect = category.getBoundingClientRect()
            const archiveLinkRect = archiveLink.getBoundingClientRect()
            const bandsBefore = getComputedStyle(bands, '::before')
            const bodyStyle = getComputedStyle(document.body)
            const headerStyle = getComputedStyle(document.querySelector('.site-header'))
            const animationProperties = document.getAnimations()
              .filter(function (animation) { return animation.constructor.name === 'CSSAnimation' })
              .map(function (animation) {
                const metadata = new Set(['offset', 'computedOffset', 'easing', 'composite'])
                return Array.from(new Set(animation.effect.getKeyframes().flatMap(function (frame) {
                  return Object.keys(frame).filter(function (property) { return !metadata.has(property) })
                }))).sort()
              })
            document.getElementById('probe-result').textContent = JSON.stringify({
              colorScheme: getComputedStyle(document.documentElement).colorScheme,
              themeColor: document.querySelector('meta[name="theme-color"]').content,
              scrollMarginTop: getComputedStyle(heading).scrollMarginTop,
              skipFocus: { pointerLike: pointerLikeSkip, keyboardLike: keyboardLikeSkip },
              mainFocus,
              control: {
                minHeight: controlStyle.minHeight,
                height: controlStyle.height,
                touchAction: controlStyle.touchAction,
                tapHighlightColor: controlStyle.webkitTapHighlightColor,
                outlineStyle: controlStyle.outlineStyle,
                outlineWidth: controlStyle.outlineWidth,
                outlineOffset: controlStyle.outlineOffset,
                display: controlStyle.display
              },
              card: {
                contentVisibility: cardStyle.contentVisibility,
                transitionProperty: cardStyle.transitionProperty,
                transitionDuration: cardStyle.transitionDuration
              },
              entryTargets: {
                cardTitle: {
                  display: cardTitleStyle.display,
                  minBlockSize: cardTitleStyle.minBlockSize,
                  width: cardTitleRect.width,
                  height: cardTitleRect.height
                },
                archive: {
                  display: archiveLinkStyle.display,
                  minBlockSize: archiveLinkStyle.minBlockSize,
                  width: archiveLinkRect.width,
                  height: archiveLinkRect.height
                }
              },
              collectionLayout: {
                postGridDisplay: getComputedStyle(grid).display,
                archiveRowDisplay: getComputedStyle(archiveRow).display,
                cardWidth: cardRect.width,
                category: {
                  display: categoryStyle.display,
                  minBlockSize: categoryStyle.minBlockSize,
                  width: categoryRect.width,
                  height: categoryRect.height
                }
              },
              saturnAnimationName: bandsBefore.animationName,
              saturnMotion: { pausedAnimations, runningAnimations, fallbackAnimations },
              fallbackControlDisplay,
              equatorAngles: {
                ring: getComputedStyle(ring).getPropertyValue('--saturn-equator-angle').trim(),
                bands: getComputedStyle(bands).getPropertyValue('--saturn-equator-angle').trim()
              },
              prominenceTransformBoxes: prominences.map(node => getComputedStyle(node).transformBox),
              animationProperties,
              scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
              safeAreaResolved: {
                bodyLeft: bodyStyle.paddingLeft,
                bodyRight: bodyStyle.paddingRight,
                headerTop: headerStyle.paddingTop
              }
            })
          })
        </script>
      </body>
    </html>`

  fs.writeFileSync(fixturePath, fixture)
  try {
    return readProbeResult(dumpWithChrome(fixturePath, { reducedMotion }))
  } finally {
    fs.rmSync(fixturePath, { force: true })
  }
}

function runArticleNavigationProbe () {
  const articleDirectory = path.join(publicRoot, '技术教程', 'How-to-create-a-website')
  const article = fs.readFileSync(path.join(articleDirectory, 'index.html'), 'utf8')
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fluid-theme-toc-'))
  const fixturePath = path.join(fixtureDirectory, 'article.html')
  const probeScript = `<pre id="probe-result"></pre>
    <script>
      addEventListener('DOMContentLoaded', function () {
        const links = Array.from(document.querySelectorAll('.toc-link'))
        const link = links.find(function (candidate) {
          const id = decodeURIComponent(candidate.hash.slice(1))
          const target = document.getElementById(id)
          return target && target.querySelector('img')
        }) || links[0]
        const targetId = decodeURIComponent(link.hash.slice(1))
        link.click()
        setTimeout(function () {
          document.getElementById('probe-result').textContent = JSON.stringify({
            href: link.getAttribute('href'),
            hash: decodeURIComponent(location.hash.slice(1)),
            targetId,
            targetCount: document.querySelectorAll('[id="' + CSS.escape(targetId) + '"]').length,
            label: link.textContent.trim()
          })
        }, 0)
      })
    </script>`
  const offlineArticle = article.replace(/(<img\b[^>]*\bsrc=)"https?:\/\/[^" ]+"/gi, '$1""')
  fs.writeFileSync(fixturePath, offlineArticle.replace('</body>', `${probeScript}</body>`))
  try {
    return readProbeResult(dumpWithChrome(fixturePath))
  } finally {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true })
  }
}

function runArticleDisclosureProbe (viewport) {
  const fixtureName = `.theme-article-disclosure-${process.pid}-${viewport.width}.html`
  const fixturePath = path.join(publicRoot, fixtureName)
  const contentWidthConstraint = viewport.width < 500
    ? `<style>body { width: ${viewport.width}px; }</style>`
    : ''
  const fixture = `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="css/main.css">
        <link rel="stylesheet" href="css/post.css">
        ${contentWidthConstraint}
      </head>
      <body class="is-inner">
        <main id="main-content">
          <div class="article-layout content-shell">
            <details class="article-toc-disclosure" aria-label="文章目录">
              <summary>文章目录</summary>
              <ol class="toc"><li><a class="toc-link" href="#section">章节</a></li></ol>
            </details>
            <aside class="article-toc" aria-label="文章目录">
              <p>文章目录</p>
              <ol class="toc"><li><a class="toc-link" href="#section">章节</a></li></ol>
            </aside>
            <article class="article-shell">
              <header class="article-header"><h1>Fixture article</h1></header>
              <div class="article-body"><h2 id="section">章节</h2><p>正文</p></div>
            </article>
          </div>
        </main>
        <pre id="probe-result"></pre>
        <script>
          addEventListener('load', function () {
            const disclosure = document.querySelector('.article-toc-disclosure')
            const desktopToc = document.querySelector('.article-toc')
            const article = document.querySelector('.article-shell')
            const disclosureRect = disclosure.getBoundingClientRect()
            const desktopRect = desktopToc.getBoundingClientRect()
            const articleRect = article.getBoundingClientRect()
            const stars = getComputedStyle(document.body, '::before')
            const initiallyOpen = disclosure.open
            disclosure.open = true
            const disclosureLink = disclosure.querySelector('.toc-link')
            const disclosureLinkStyle = getComputedStyle(disclosureLink)
            const disclosureLinkTarget = {
              minBlockSize: disclosureLinkStyle.minBlockSize,
              height: disclosureLink.getBoundingClientRect().height
            }
            disclosure.open = initiallyOpen
            document.getElementById('probe-result').textContent = JSON.stringify({
              viewportWidth: document.documentElement.clientWidth,
              contentWidth: document.body.getBoundingClientRect().width,
              noHorizontalOverflow: document.body.scrollWidth <= ${viewport.width},
              disclosure: {
                display: getComputedStyle(disclosure).display,
                open: initiallyOpen,
                top: disclosureRect.top,
                linkTarget: disclosureLinkTarget
              },
              desktopToc: {
                display: getComputedStyle(desktopToc).display,
                position: getComputedStyle(desktopToc).position,
                left: desktopRect.left
              },
              article: {
                top: articleRect.top,
                left: articleRect.left
              },
              innerStars: {
                backgroundImage: stars.backgroundImage,
                animationName: stars.animationName
              }
            })
          })
        </script>
      </body>
    </html>`

  fs.writeFileSync(fixturePath, fixture)
  try {
    return readProbeResult(dumpWithChrome(fixturePath, { viewport }))
  } finally {
    fs.rmSync(fixturePath, { force: true })
  }
}

let cachedNormalProbe
const normalChromeProbe = () => cachedNormalProbe || (cachedNormalProbe = runChromeProbe())

test('built theme exposes accessible interaction and compositor-friendly rendering in Chrome', () => {
  // Removing the CSS behavior would shrink the target, erase focus, break anchor offsets, or animate layout/paint properties.
  const probe = normalChromeProbe()

  assert.equal(probe.colorScheme, 'dark')
  assert.equal(probe.themeColor, '#010208')
  assert.equal(probe.scrollMarginTop, '32px')
  assert.equal(probe.control.minHeight, '44px')
  assert.ok(Number.parseFloat(probe.control.height) >= 44, probe.control.height)
  assert.equal(probe.control.touchAction, 'manipulation')
  assert.notEqual(probe.control.tapHighlightColor, 'rgba(0, 0, 0, 0)')
  assert.equal(probe.control.outlineStyle, 'solid')
  assert.equal(probe.control.outlineWidth, '2px')
  assert.equal(probe.control.outlineOffset, '4px')
  assert.equal(probe.card.contentVisibility, 'auto')
  assert.deepEqual(probe.card.transitionProperty.split(',').map(value => value.trim()), ['transform'])
  assert.notEqual(probe.card.transitionProperty, 'all')
  assert.equal(probe.saturnAnimationName, 'saturn-gas-rotation')
  assert.ok(probe.animationProperties.length >= 4, 'Chrome exposes the Saturn CSS animations')
  for (const properties of probe.animationProperties) {
    assert.ok(properties.every(property => ['opacity', 'transform'].includes(property)), properties.join(', '))
  }
  assert.deepEqual(probe.safeAreaResolved, { bodyLeft: '0px', bodyRight: '0px', headerTop: '0px' })
})

test('article entry links meet touch target size without changing card, category, or archive layout', () => {
  // Inline title/archive anchors are too small, while a broad card selector would stretch category links.
  const probe = normalChromeProbe()

  for (const [name, target] of Object.entries(probe.entryTargets)) {
    assert.equal(target.display, 'flex', `${name} display`)
    assert.equal(target.minBlockSize, '44px', `${name} min-block-size`)
    assert.ok(target.width >= 44, `${name} width ${target.width}`)
    assert.ok(target.height >= 44, `${name} height ${target.height}`)
  }
  assert.equal(probe.collectionLayout.postGridDisplay, 'grid')
  assert.equal(probe.collectionLayout.archiveRowDisplay, 'grid')
  assert.equal(probe.collectionLayout.category.display, 'inline-flex')
  assert.equal(probe.collectionLayout.category.minBlockSize, '44px')
  assert.ok(probe.collectionLayout.category.height >= 44, probe.collectionLayout.category.height)
  assert.ok(
    probe.collectionLayout.category.width < probe.collectionLayout.cardWidth,
    `${probe.collectionLayout.category.width} !< ${probe.collectionLayout.cardWidth}`
  )
})

test('skip link stays hidden for pointer-like focus and reveals for keyboard-like focus in Chrome', () => {
  // Replacing :focus-visible with :focus would make a pointer-like focus jump the skip link into view.
  const probe = normalChromeProbe()

  assert.equal(probe.skipFocus.pointerLike.focusVisible, false)
  assert.ok(probe.skipFocus.pointerLike.top < 0, probe.skipFocus.pointerLike.top)
  assert.equal(probe.skipFocus.keyboardLike.focusVisible, true)
  assert.ok(probe.skipFocus.keyboardLike.top >= 0, probe.skipFocus.keyboardLike.top)
})

test('main landmark retains its visible keyboard focus replacement in Chrome', () => {
  // Restoring the old #main-content:focus outline suppression would erase the skip target focus indicator.
  const probe = normalChromeProbe()

  assert.equal(probe.mainFocus.focusVisible, true)
  assert.equal(probe.mainFocus.outlineStyle, 'solid')
  assert.equal(probe.mainFocus.outlineWidth, '2px')
  assert.equal(probe.mainFocus.outlineOffset, '4px')
})

test('motion controls pause every star animation and preserve shared geometry in Chrome', () => {
  // A renderer-only pause or local angle override would leave visual motion running or desynchronize the ring and surface.
  const probe = normalChromeProbe()

  assert.deepEqual(probe.saturnMotion.pausedAnimations.map(animation => animation.playState), ['paused', 'paused', 'paused', 'paused', 'paused'])
  assert.deepEqual(probe.saturnMotion.runningAnimations.map(animation => animation.playState), ['running', 'running', 'running', 'running', 'running'])
  assert.deepEqual(probe.saturnMotion.fallbackAnimations.map(animation => animation.playState), ['paused', 'paused', 'paused', 'paused', 'paused'])
  assert.deepEqual(probe.saturnMotion.runningAnimations.map(animation => animation.name), [
    'saturn-gas-rotation',
    'saturn-magnetic-rotation',
    'saturn-flare-transit',
    'saturn-prominence-breathe',
    'saturn-prominence-breathe'
  ])
  assert.equal(probe.fallbackControlDisplay, 'none')
  assert.deepEqual(probe.equatorAngles, { ring: '-10deg', bands: '-10deg' })
  assert.deepEqual(probe.prominenceTransformBoxes, ['fill-box', 'fill-box'])
})

test('built theme removes continuous motion in Chrome reduced-motion mode', () => {
  // Merely slowing the animation would still expose a redundant pause control and continuous Saturn movement.
  const probe = runChromeProbe({ reducedMotion: true })

  assert.equal(probe.control.display, 'none')
  assert.deepEqual(probe.saturnMotion.runningAnimations.map(animation => animation.name), ['none', 'none', 'none', 'none', 'none'])
  assert.equal(probe.animationProperties.length, 0)
  assert.equal(probe.scrollBehavior, 'auto')
})

test('generated TOC anchors navigate to their unique heading in Chrome', () => {
  // A syntactically present anchor without a usable fragment would not update browser location or find its heading.
  const probe = runArticleNavigationProbe()

  assert.match(probe.href, /^#.+/)
  assert.equal(probe.hash, probe.targetId)
  assert.equal(probe.targetCount, 1)
  assert.notEqual(probe.label, '')
  assert.notEqual(probe.label, '#')
})

test('article TOC is collapsed before the article at 320px and stays a visible sticky sidebar on desktop', () => {
  // CSS-only reordering or a non-native toggle would fail either the DOM-sized mobile result or the desktop sidebar result.
  const mobile = runArticleDisclosureProbe({ width: 320, height: 740 })
  // Headless Chrome enforces a ~500 CSS-pixel minimum window even when --window-size requests 320;
  // constrain the real layout containing block to 320px while requiring the narrow-screen media query.
  assert.ok(mobile.viewportWidth <= 900, mobile.viewportWidth)
  assert.equal(mobile.contentWidth, 320)
  assert.equal(mobile.noHorizontalOverflow, true)
  assert.notEqual(mobile.disclosure.display, 'none')
  assert.equal(mobile.disclosure.open, false)
  assert.ok(mobile.disclosure.top < mobile.article.top, `${mobile.disclosure.top} !< ${mobile.article.top}`)
  assert.equal(mobile.disclosure.linkTarget.minBlockSize, '44px')
  assert.ok(mobile.disclosure.linkTarget.height >= 44, mobile.disclosure.linkTarget.height)
  assert.equal(mobile.desktopToc.display, 'none')

  const desktop = runArticleDisclosureProbe({ width: 1200, height: 800 })
  assert.equal(desktop.disclosure.display, 'none')
  assert.notEqual(desktop.desktopToc.display, 'none')
  assert.equal(desktop.desktopToc.position, 'sticky')
  assert.ok(desktop.article.left < desktop.desktopToc.left, `${desktop.article.left} !< ${desktop.desktopToc.left}`)
  assert.match(desktop.innerStars.backgroundImage, /radial-gradient/i)
  assert.equal(desktop.innerStars.animationName, 'none')
})
