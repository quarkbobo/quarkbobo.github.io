const test = require('node:test')
const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ejs = require('ejs')
const { chromeCandidatesFor, windowSizeFor } = require('./browser-launch-policy.cjs')
const { finePointerMatchMediaFixtureScript } = require('./browser-match-media-fixture.cjs')

const root = path.resolve(__dirname, '..')
const publicRoot = path.join(root, 'public')
const chromeCandidates = chromeCandidatesFor()
const chromePath = chromeCandidates.find(candidate => fs.existsSync(candidate))
const hexoToc = require(path.join(root, 'node_modules', 'hexo', 'dist', 'plugins', 'helper', 'toc.js'))
const postFullTemplate = fs.readFileSync(
  path.join(root, 'themes', 'fluid-particle', 'layout', '_partial', 'post-full.ejs'),
  'utf8'
)

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

function dumpWithChrome (fixturePath, { reducedMotion = false, viewport, virtualTimeBudget = 1000 } = {}) {
  assert.ok(chromePath, `Chrome or Edge is installed (${chromeCandidates.join(', ')})`)
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluid-theme-chrome-'))
  try {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--allow-file-access-from-files',
      `--user-data-dir=${userDataDir}`,
      `--virtual-time-budget=${virtualTimeBudget}`,
      '--dump-dom'
    ]
    if (reducedMotion) args.push('--force-prefers-reduced-motion=reduce')
    if (viewport) {
      // This Windows headless build makes the CSS viewport 22px narrower than
      // the requested outer desktop window. The probes below hard-fail unless
      // the measured CSS viewport exactly matches their requested desktop size.
      const [outerWidth, outerHeight] = windowSizeFor(viewport)
      args.push(`--window-size=${outerWidth},${outerHeight}`)
    }
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

const deviceMetricsProbeRunner = String.raw`
const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const [chromePath, userDataDir, fixtureUrl, widthValue, heightValue] = process.argv.slice(1)
const width = Number(widthValue)
const height = Number(heightValue)
const chrome = childProcess.spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-sandbox',
  '--allow-file-access-from-files',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=0',
  '--user-data-dir=' + userDataDir,
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })

let chromeError = ''
let socket
chrome.stderr.setEncoding('utf8')
chrome.stderr.on('data', function (chunk) { chromeError += chunk })

const wait = function (milliseconds) {
  return new Promise(function (resolve) { setTimeout(resolve, milliseconds) })
}

const main = async function () {
  const activePortPath = path.join(userDataDir, 'DevToolsActivePort')
  const activePortDeadline = Date.now() + 10000
  while (!fs.existsSync(activePortPath) && Date.now() < activePortDeadline) await wait(20)
  if (!fs.existsSync(activePortPath)) throw new Error('Chrome DevTools port unavailable: ' + chromeError)

  const port = fs.readFileSync(activePortPath, 'utf8').split(/\r?\n/)[0]
  const targets = await fetch('http://127.0.0.1:' + port + '/json/list').then(function (response) { return response.json() })
  const page = targets.find(function (target) { return target.type === 'page' })
  if (!page || !page.webSocketDebuggerUrl) throw new Error('Chrome page target unavailable')

  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise(function (resolve, reject) {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', function () { reject(new Error('Chrome DevTools socket failed')) }, { once: true })
  })

  let nextId = 1
  const pending = new Map()
  socket.addEventListener('message', function (event) {
    const message = JSON.parse(String(event.data))
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })
  const send = function (method, params) {
    return new Promise(function (resolve, reject) {
      const id = nextId++
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params: params || {} }))
    })
  }

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height
  })
  await send('Page.navigate', { url: fixtureUrl })

  const resultDeadline = Date.now() + 10000
  while (Date.now() < resultDeadline) {
    const evaluation = await send('Runtime.evaluate', {
      expression: "document.getElementById('probe-result')?.textContent || ''",
      returnByValue: true
    })
    const result = evaluation && evaluation.result && evaluation.result.value
    if (result) {
      process.stdout.write(result)
      return
    }
    await wait(20)
  }
  throw new Error('device-metrics probe timed out: ' + chromeError)
}

main().then(function () {
  if (socket) socket.close()
  chrome.kill()
}, function (error) {
  process.stderr.write((error && error.stack) || String(error))
  if (socket) socket.close()
  chrome.kill()
  process.exitCode = 1
})
`

function runChromeDeviceMetricsProbe (fixturePath, viewport) {
  assert.ok(chromePath, `Chrome or Edge is installed (${chromeCandidates.join(', ')})`)
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluid-theme-chrome-device-'))
  try {
    const fixtureUrl = new URL(`file:///${fixturePath.replace(/\\/g, '/')}`).href
    const result = childProcess.spawnSync(process.execPath, [
      '-e',
      deviceMetricsProbeRunner,
      chromePath,
      userDataDir,
      fixtureUrl,
      String(viewport.width),
      String(viewport.height)
    ], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
      windowsHide: true
    })
    assert.equal(result.status, 0, result.stderr || 'Chrome device-metrics probe failed')
    return JSON.parse(result.stdout)
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
}

function accessibilityMutationStyle (mode) {
  if (mode !== '1') return ''
  return `<style>
    h2 { scroll-margin-top: 0 !important; }
    .motion-toggle { min-height: 0 !important; touch-action: auto !important; }
    .post-card { transition: all 1s linear !important; }
    .post-card h3 a, .archive-list a { display: inline !important; min-block-size: 0 !important; }
    .post-card__categories a { display: flex !important; width: 100% !important; }
    .post-grid, .archive-list li { display: block !important; }
    .skip-link:focus { transform: translateY(0) !important; }
    #main-content:focus { outline: none !important; }
    @media (prefers-reduced-motion: reduce) {
      .motion-toggle { display: inline-flex !important; }
    }
  </style>`
}

function planetMutationStyle (mode) {
  const rules = {
    '1': `
      .saturn-ring { width: 80% !important; height: 12% !important; }
      #planet-surface { animation: forbidden-planet-pulse 0.2s linear infinite !important; }
      @keyframes forbidden-planet-pulse { from { opacity: 0.2; } to { opacity: 1; } }
      @media (max-width: 760px) { .saturn-system { --planet-layout-mode: desktop !important; } }
    `,
    'planet-animation': `
      #planet-surface { animation: forbidden-planet-pulse 0.2s linear infinite !important; }
      @keyframes forbidden-planet-pulse { from { opacity: 0.2; } to { opacity: 1; } }
    `,
    'planet-ring': '.saturn-ring { width: 80% !important; height: 12% !important; }',
    'planet-mobile': '@media (max-width: 760px) { .saturn-system { --planet-layout-mode: desktop !important; } }',
    'planet-transition-long': '#planet-surface { transition: opacity 30s linear !important; }',
    'planet-transition-invalid': '#planet-surface { transition: transform 0.2s ease-out !important; }',
    'planet-transition-delay': '#planet-surface { transition: opacity 0.2s ease-out 30s !important; }'
  }[mode]
  return rules ? `<style>${rules}</style>` : ''
}

function runChromeProbe ({ reducedMotion = false } = {}) {
  const generatedHome = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8')
  const themeColor = generatedHome.match(/<meta\b[^>]*name="theme-color"[^>]*content="([^"]+)"/i)?.[1]
  assert.ok(themeColor, 'generated home exposes a theme color')
  const cometMarkup = generatedHome.match(/<div id="cursor-comet"[\s\S]*?<\/div>/)?.[0]
  assert.ok(cometMarkup, 'generated home exposes the cursor comet overlay')

  const mutationMode = process.env.FLUID_STYLE_PROBE_MUTATION
  const mutation = accessibilityMutationStyle(mutationMode) + planetMutationStyle(mutationMode)
  const fixtureName = `.theme-browser-probe-${process.pid}-${reducedMotion ? 'reduce' : 'normal'}.html`
  const fixturePath = path.join(publicRoot, fixtureName)
  const fixedPhaseHelperName = `.theme-fixed-planet-phase-${process.pid}-${reducedMotion ? 'reduce' : 'normal'}.js`
  const fixedPhaseHelperPath = path.join(publicRoot, fixedPhaseHelperName)
  const fixture = `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <meta name="theme-color" content="${themeColor}">
        <link rel="stylesheet" href="css/main.css">
        <link rel="stylesheet" href="css/space-scene.css">
        <link rel="stylesheet" href="css/cursor-comet.css">
        ${mutation}
      </head>
      <body>
        ${cometMarkup}
        <a class="skip-link" href="#main-content">Skip to content</a>
        <header class="site-header"></header>
        <main id="main-content" tabindex="-1">
          <h2 id="probe-heading">Probe heading</h2>
          <section class="home-hero" id="probe-hero">
            <button class="motion-toggle" id="motion-toggle" type="button">Pause</button>
            <div id="space-scene" class="space-scene">
              <div class="saturn-system">
                <div class="saturn-halo"></div>
                <div class="saturn-ring saturn-ring--back"></div>
                <div class="saturn">
                  <div class="planet-static-surface"></div>
                  <canvas id="planet-surface" aria-hidden="true"></canvas>
                  <div class="saturn-light"></div>
                </div>
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
        <script>${finePointerMatchMediaFixtureScript()}</script>
        <script src="js/planet-core.js" defer></script>
        <script src="${fixedPhaseHelperName}" defer></script>
        <script src="js/planet-surface.js" defer></script>
        <script src="js/cursor-comet-core.js" defer></script>
        <script src="js/cursor-comet.js" defer></script>
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
            const comet = document.getElementById('cursor-comet')

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
            const surface = document.getElementById('planet-surface')
            const ring = document.querySelector('.saturn-ring')
            control.focus({ focusVisible: true })
            const controlComputedStyle = getComputedStyle(control)
            const controlStyle = {
              minHeight: controlComputedStyle.minHeight,
              height: controlComputedStyle.height,
              touchAction: controlComputedStyle.touchAction,
              tapHighlightColor: controlComputedStyle.webkitTapHighlightColor,
              outlineStyle: controlComputedStyle.outlineStyle,
              outlineWidth: controlComputedStyle.outlineWidth,
              outlineOffset: controlComputedStyle.outlineOffset,
              display: controlComputedStyle.display
            }
            const cardStyle = getComputedStyle(card)
            const cardTitleStyle = getComputedStyle(cardTitle)
            const categoryStyle = getComputedStyle(category)
            const archiveLinkStyle = getComputedStyle(archiveLink)
            const cardRect = card.getBoundingClientRect()
            const cardTitleRect = cardTitle.getBoundingClientRect()
            const categoryRect = category.getBoundingClientRect()
            const archiveLinkRect = archiveLink.getBoundingClientRect()
            const bodyStyle = getComputedStyle(document.body)
            const headerStyle = getComputedStyle(document.querySelector('.site-header'))
            const cssSceneAnimations = function () {
              return scene.getAnimations({ subtree: true })
                .filter(function (animation) { return animation.constructor.name === 'CSSAnimation' })
                .map(function (animation) {
                  return animation.animationName || animation.effect?.target?.className || 'anonymous'
                })
            }
            const writeProbeResult = function (motion) {
              const sceneAnimations = cssSceneAnimations()
              const surfaceStyle = getComputedStyle(surface)
              const liveCometSegments = Array.from(comet.querySelectorAll('.cursor-comet__segment'))
              document.getElementById('probe-result').textContent = JSON.stringify({
                colorScheme: getComputedStyle(document.documentElement).colorScheme,
                themeColor: document.querySelector('meta[name="theme-color"]').content,
                scrollMarginTop: getComputedStyle(heading).scrollMarginTop,
                skipFocus: { pointerLike: pointerLikeSkip, keyboardLike: keyboardLikeSkip },
                mainFocus,
                control: controlStyle,
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
                planetPresentation: {
                  sceneAnimations,
                  surfaceOpacity: surfaceStyle.opacity,
                  transition: {
                    property: surfaceStyle.transitionProperty,
                    duration: surfaceStyle.transitionDuration,
                    timingFunction: surfaceStyle.transitionTimingFunction,
                    delay: surfaceStyle.transitionDelay
                  },
                  equatorAngles: {
                    ring: getComputedStyle(ring).getPropertyValue('--saturn-equator-angle').trim(),
                    surface: getComputedStyle(surface).getPropertyValue('--planet-equator-angle').trim()
                  }
                },
                cometPresentation: {
                  segmentCount: liveCometSegments.length,
                  overlayPointerEvents: getComputedStyle(comet).pointerEvents,
                  segmentPointerEvents: liveCometSegments.map(function (segment) { return getComputedStyle(segment).pointerEvents })
                },
                scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
                safeAreaResolved: {
                  bodyLeft: bodyStyle.paddingLeft,
                  bodyRight: bodyStyle.paddingRight,
                  headerTop: headerStyle.paddingTop
                },
                ...motion
              })
            }
            const waitForPlanet = function (deadline, done) {
              const snapshot = window.__planetSurfaceMetrics?.snapshot()
              if (snapshot?.initialized || performance.now() >= deadline) return done(snapshot)
              setTimeout(function () { waitForPlanet(deadline, done) }, 25)
            }
            const settleSurfaceFade = function () {
              surface.getAnimations().forEach(function (animation) {
                if (animation.constructor.name === 'CSSTransition') animation.finish()
              })
            }
            const wait = function (milliseconds) {
              return new Promise(function (resolve) { setTimeout(resolve, milliseconds) })
            }
            const patchDifference = function (before, after) {
              let count = 0
              let sum = 0
              for (let index = 0; index < before.length; index += 4) {
                const delta = Math.abs(after[index] - before[index]) + Math.abs(after[index + 1] - before[index + 1]) + Math.abs(after[index + 2] - before[index + 2])
                if (delta) count++
                sum += delta
              }
              return { count, sum }
            }
            const capturePlanetFrame = function () {
              const context = surface.getContext('2d')
              return context.getImageData(0, 0, surface.width, surface.height).data
            }
            const dispatchPointer = function (type, x, y) {
              dispatchEvent(new PointerEvent(type, {
                bubbles: true,
                clientX: x,
                clientY: y,
                pointerType: 'mouse',
                isPrimary: true,
                button: type === 'pointerdown' ? 0 : -1,
                buttons: type === 'pointerdown' ? 1 : 0
              }))
            }
            waitForPlanet(performance.now() + 1500, function (initial) {
              setTimeout(async function () {
                settleSurfaceFade()
                if (${reducedMotion}) {
                  const reducedBounds = surface.getBoundingClientRect()
                  const reducedCenterX = reducedBounds.left + reducedBounds.width / 2
                  const reducedCenterY = reducedBounds.top + reducedBounds.height / 2
                  const reducedBaseline = capturePlanetFrame()
                  dispatchPointer('pointermove', reducedCenterX - 48, reducedCenterY)
                  dispatchPointer('pointermove', reducedCenterX + 48, reducedCenterY)
                  dispatchPointer('pointerdown', reducedCenterX, reducedCenterY)
                  await wait(100)
                  const reducedAfterInput = capturePlanetFrame()
                  const reducedLiveCometSegments = Array.from(comet.querySelectorAll('.cursor-comet__segment'))
                  writeProbeResult({
                    initial,
                    reducedPointerInteraction: {
                      planetDifference: patchDifference(reducedBaseline, reducedAfterInput),
                      cometSegmentCount: reducedLiveCometSegments.length,
                      cometActiveSegments: reducedLiveCometSegments.filter(function (segment) { return segment.dataset.active === 'true' }).length,
                      cometOverlayPointerEvents: getComputedStyle(comet).pointerEvents,
                      cometSegmentPointerEvents: reducedLiveCometSegments.map(function (segment) { return getComputedStyle(segment).pointerEvents })
                    },
                    sceneAnimations: cssSceneAnimations().length
                  })
                  return
                }

                const bounds = surface.getBoundingClientRect()
                const centerX = bounds.left + bounds.width / 2
                const centerY = bounds.top + bounds.height / 2
                const baseline = capturePlanetFrame()
                dispatchPointer('pointermove', centerX, centerY)
                await wait(100)
                const hover = capturePlanetFrame()

                dispatchPointer('pointermove', bounds.right + 32, centerY)
                await wait(50)
                const interactionCometSegments = Array.from(comet.querySelectorAll('.cursor-comet__segment'))
                const activeCometSegment = interactionCometSegments.find(function (segment) { return segment.dataset.active === 'true' })
                const cometInkStyle = activeCometSegment && getComputedStyle(activeCometSegment.querySelector('.cursor-comet__ink'))
                const cometSegmentStyle = activeCometSegment && getComputedStyle(activeCometSegment)
                const cometInteraction = {
                  active: activeCometSegment?.dataset.active || '',
                  phase: activeCometSegment?.dataset.phase || '',
                  animationName: cometInkStyle?.animationName || '',
                  x: cometSegmentStyle?.getPropertyValue('--comet-x').trim() || '',
                  y: cometSegmentStyle?.getPropertyValue('--comet-y').trim() || '',
                  length: cometSegmentStyle?.getPropertyValue('--comet-length').trim() || '',
                  angle: cometSegmentStyle?.getPropertyValue('--comet-angle').trim() || '',
                  width: cometSegmentStyle?.getPropertyValue('--comet-width').trim() || ''
                }
                await wait(290)
                const hoverDecay = capturePlanetFrame()

                dispatchPointer('pointerdown', centerX, centerY)
                await wait(50)
                const impact = capturePlanetFrame()
                const impactAt50 = {
                  calls: window.__planetImpactProbe.calls,
                  count: window.__planetImpactProbe.count,
                  sum: window.__planetImpactProbe.sum
                }
                await wait(720)
                const firstMarkAt770 = capturePlanetFrame()
                const impactCallsAt770 = window.__planetImpactProbe.calls
                await wait(2280)
                const naturalExpiry = capturePlanetFrame()
                const impactCallsAfter770 = window.__planetImpactProbe.calls

                dispatchPointer('pointerdown', centerX, centerY)
                await wait(770)
                const markBeforePause = capturePlanetFrame()
                scene.classList.add('motion-paused')
                await Promise.resolve()
                const markPaused = capturePlanetFrame()
                scene.classList.remove('motion-paused')
                await wait(50)

                dispatchPointer('pointerdown', bounds.left + 1, bounds.top + 1)
                await wait(100)
                const corner = capturePlanetFrame()

                scene.classList.add('motion-paused')
                await wait(50)
                const pausedBaseline = capturePlanetFrame()
                dispatchPointer('pointermove', centerX - 48, centerY)
                dispatchPointer('pointermove', centerX + 48, centerY)
                dispatchPointer('pointerdown', centerX, centerY)
                await wait(100)
                const pausedAfterInput = capturePlanetFrame()
                const pausedCometSegments = Array.from(comet.querySelectorAll('.cursor-comet__segment'))
                const pausedCometActiveSegments = pausedCometSegments.filter(function (segment) { return segment.dataset.active === 'true' }).length
                const pointerInteraction = {
                  pointerPolicy: {
                    mobile: matchMedia('(max-width: 760px)').matches,
                    coarse: matchMedia('(pointer: coarse)').matches,
                    fine: matchMedia('(pointer: fine)').matches,
                    hover: matchMedia('(hover: hover)').matches,
                    noHover: matchMedia('(hover: none)').matches
                  },
                  comet: cometInteraction,
                  hoverDifference: patchDifference(baseline, hover),
                  hoverDecayDifference: patchDifference(baseline, hoverDecay),
                  impactFrameDifference: patchDifference(baseline, impact),
                  impactDifference: { count: impactAt50.count, sum: impactAt50.sum },
                  impactCallsAt50: impactAt50.calls,
                  impactCallsAt770,
                  impactCallsAfter770,
                  firstMarkDifference: patchDifference(baseline, firstMarkAt770),
                  markBeforePauseDifference: patchDifference(baseline, markBeforePause),
                  markPauseDifference: patchDifference(baseline, markPaused),
                  naturalExpiryDifference: patchDifference(baseline, naturalExpiry),
                  cornerDifference: patchDifference(baseline, corner),
                  pausedPlanetDifference: patchDifference(pausedBaseline, pausedAfterInput),
                  pausedCometActiveSegments,
                  liveCometSegmentCount: interactionCometSegments.length,
                  liveCometOverlayPointerEvents: getComputedStyle(comet).pointerEvents,
                  liveCometSegmentPointerEvents: interactionCometSegments.map(function (segment) { return getComputedStyle(segment).pointerEvents })
                }

                setTimeout(function () {
                  const paused = window.__planetSurfaceMetrics.snapshot()
                  scene.classList.add('particle-fallback')
                  scene.classList.remove('motion-paused')
                  setTimeout(function () {
                    const particleFallback = window.__planetSurfaceMetrics.snapshot()
                    const particleFallbackControlDisplay = getComputedStyle(control).display
                    const particleFallbackOwnFallback = scene.classList.contains('planet-fallback')
                    scene.classList.remove('particle-fallback')
                    setTimeout(function () {
                      const resumed = window.__planetSurfaceMetrics.snapshot()
                      writeProbeResult({
                        initial,
                        paused,
                        particleFallback,
                        resumed,
                        particleFallbackOwnFallback,
                        ownFallback: scene.classList.contains('planet-fallback'),
                        particleFallbackControlDisplay,
                        pointerInteraction,
                        sceneAnimations: cssSceneAnimations().length
                      })
                    }, 250)
                  }, 50)
                }, 50)
              }, 250)
            })
          })
        </script>
      </body>
    </html>`

  try {
    fs.writeFileSync(fixedPhaseHelperPath, `window.requestAnimationFrame = function (callback) {
      return window.setTimeout(function () { callback(performance.now()) }, 16)
    }
    window.cancelAnimationFrame = function (identifier) { window.clearTimeout(identifier) }
    const realApplyLocalizedGasDisplacement = window.FluidPlanetCore.applyLocalizedGasDisplacement
    const impactProbe = { calls: 0, count: 0, sum: 0 }
    window.__planetImpactProbe = impactProbe
    window.FluidPlanetCore = Object.freeze({
      ...window.FluidPlanetCore,
      advanceBasePhase: function (phase) { return phase },
      applyLocalizedGasDisplacement: function () {
        const args = arguments
        const interaction = args[5]
        const output = args[6]
        if (!interaction || interaction.impactEnergy <= 0) return realApplyLocalizedGasDisplacement.apply(this, args)
        if (${JSON.stringify(process.env.FLUID_PLANET_INTERACTION_MUTATION === 'disable-impact')}) return output
        const before = output.slice()
        const result = realApplyLocalizedGasDisplacement.apply(this, args)
        let count = 0
        let sum = 0
        for (let index = 0; index < output.length; index += 4) {
          const delta = Math.abs(output[index] - before[index]) + Math.abs(output[index + 1] - before[index + 1]) + Math.abs(output[index + 2] - before[index + 2])
          if (delta) count++
          sum += delta
        }
        impactProbe.calls++
        impactProbe.count = count
        impactProbe.sum = sum
        return result
      }
    })`)
    fs.writeFileSync(fixturePath, fixture)
    return readProbeResult(dumpWithChrome(fixturePath, {
      reducedMotion,
      viewport: { width: 1024, height: 768 },
      virtualTimeBudget: reducedMotion ? 1000 : 6000
    }))
  } finally {
    fs.rmSync(fixturePath, { force: true })
    fs.rmSync(fixedPhaseHelperPath, { force: true })
  }
}

function runArticleNavigationProbe () {
  const article = ejs.render(postFullTemplate, {
    config: { language: 'zh-CN', title: 'Fixture site', timezone: 'Asia/Shanghai' },
    theme: { image_dimensions: {} },
    post: {
      path: 'fixture/index.html',
      title: 'Fixture article',
      date: new Date('2026-09-03T00:00:00.000Z'),
      content: [
        '<h2>第一个章节<a class="header-anchor" href="#old-first">#</a></h2>',
        '<p>正文。</p>',
        '<h2><img src="fixture.png" alt="示意图"><a class="header-anchor" href="#old-image">#</a></h2>'
      ].join('\n')
    },
    strip_html: html => String(html).replace(/<[^>]+>/g, ''),
    toc: hexoToc,
    date_xml: value => value.toISOString()
  })
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
  fs.writeFileSync(fixturePath, `<!doctype html><html lang="zh-CN"><body>${offlineArticle}${probeScript}</body></html>`)
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
  const desktopViewportConstraint = viewport.width >= 768
    ? '<style>html { overflow-y: hidden; }</style>'
    : ''
  const fixture = `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="css/main.css">
        <link rel="stylesheet" href="css/post.css">
        ${contentWidthConstraint}
        ${desktopViewportConstraint}
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
              viewportWidths: { inner: innerWidth, client: document.documentElement.clientWidth },
              contentWidth: document.body.getBoundingClientRect().width,
              noHorizontalOverflow: document.body.scrollWidth <= ${viewport.width},
              mobilePolicy: matchMedia('(max-width: 760px)').matches,
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

function runPlanetCompositionProbe (viewport) {
  const generatedHome = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8')
  const fixtureName = `.theme-planet-composition-${process.pid}-${viewport.width}.html`
  const fixturePath = path.join(publicRoot, fixtureName)
  const acceptanceWidth = viewport.width
  const viewportHeight = viewport.height
  const contentWidthConstraint = viewport.width < 500 && viewport.width !== 390
    ? `<style>body { width: ${viewport.width}px; }</style>`
    : ''
  const desktopViewportConstraint = viewport.width >= 768
    ? '<style>html { overflow-y: hidden; }</style>'
    : ''
  const mutation = planetMutationStyle(process.env.FLUID_STYLE_PROBE_MUTATION)
  const probeScript = `<pre id="probe-result"></pre>
    <script>
      addEventListener('load', function () {
        const system = document.querySelector('.saturn-system')
        const scene = document.querySelector('.space-scene')
        const body = document.querySelector('.saturn')
        const rings = Array.from(document.querySelectorAll('.saturn-ring'))
        const ring = rings[0]
        const surface = document.getElementById('planet-surface')
        const systemStyle = getComputedStyle(system)
        const systemTransform = systemStyle.transform
        const systemTranslationX = systemTransform === 'none' ? 0 : new DOMMatrix(systemTransform).m41
        const copy = document.querySelector('.home-hero__copy')
        const brand = document.querySelector('.site-brand')
        const sceneRect = scene.getBoundingClientRect()
        const planetRect = body.getBoundingClientRect()
        const ringRect = ring.getBoundingClientRect()
        const brandRect = brand.getBoundingClientRect()
        const brandTextRange = document.createRange()
        brandTextRange.selectNodeContents(brand)
        const brandLineCount = Array.from(brandTextRange.getClientRects())
          .filter(function (rect) { return rect.width > 0 && rect.height > 0 }).length
        const innerStop = Number.parseFloat(getComputedStyle(ring).getPropertyValue('--ring-inner-stop')) / 100
        const ringWidthRatio = ring.offsetWidth / body.offsetWidth
        const ringHeightRatio = ring.offsetHeight / body.offsetWidth
        const beltThicknessRatio = ringWidthRatio * (1 - innerStop) / 2
        const copyContentRects = Array.from(copy.querySelectorAll('p, h1, a, button')).flatMap(function (child) {
          const style = getComputedStyle(child)
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return []

          const kind = child.matches('a, button') ? 'control' : 'text'
          const rects = kind === 'control'
            ? Array.from(child.getClientRects())
            : (function () {
                const range = document.createRange()
                range.selectNodeContents(child)
                return Array.from(range.getClientRects())
              })()

          return rects
            .filter(function (rect) { return rect.width > 0 && rect.height > 0 })
            .map(function (rect) {
              return { kind, tagName: child.tagName.toLowerCase(), left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
            })
        })
        const acceptanceViewport = { left: 0, top: 0, right: ${acceptanceWidth}, bottom: ${viewportHeight} }
        const rectanglesIntersect = function (first, second) {
          return first.left < second.right && first.right > second.left &&
            first.top < second.bottom && first.bottom > second.top
        }
        const intersectRectangles = function (first, second) {
          return {
            left: Math.max(first.left, second.left),
            top: Math.max(first.top, second.top),
            right: Math.min(first.right, second.right),
            bottom: Math.min(first.bottom, second.bottom)
          }
        }
        const visibleBounds = function (element) {
          let bounds = intersectRectangles(element.getBoundingClientRect(), acceptanceViewport)
          for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor)
            if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
              bounds = intersectRectangles(bounds, ancestor.getBoundingClientRect())
            }
          }
          return bounds
        }
        const hasVisibleBounds = function (element) {
          const bounds = visibleBounds(element)
          return bounds.right > bounds.left && bounds.bottom > bounds.top
        }
        const clippingAncestor = document.createElement('div')
        const clippedSyntheticGroup = document.createElement('div')
        clippingAncestor.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;'
        clippedSyntheticGroup.style.cssText = 'position:absolute;left:20px;top:20px;width:24px;height:24px;'
        clippingAncestor.append(clippedSyntheticGroup)
        document.body.append(clippingAncestor)
        const clippedSyntheticRect = clippedSyntheticGroup.getBoundingClientRect()
        const rawViewportVisible = clippedSyntheticRect.width > 0 && clippedSyntheticRect.height > 0 &&
          clippedSyntheticRect.right > 0 && clippedSyntheticRect.bottom > 0 &&
          clippedSyntheticRect.left < ${acceptanceWidth} && clippedSyntheticRect.top < ${viewportHeight}

        const waitForPlanet = function (deadline, done) {
          const snapshot = window.__planetSurfaceMetrics?.snapshot()
          if (snapshot?.initialized || performance.now() >= deadline) return done()
          setTimeout(function () { waitForPlanet(deadline, done) }, 25)
        }
        waitForPlanet(performance.now() + 1500, function () {
          const metrics = window.__planetSurfaceMetrics.snapshot()
          document.getElementById('probe-result').textContent = JSON.stringify({
            noHorizontalOverflow: document.body.scrollWidth <= ${acceptanceWidth},
            canvasIds: Array.from(document.querySelectorAll('#space-scene canvas')).map(function (canvas) { return canvas.id }).sort(),
            planetInitialized: metrics.initialized,
            planetFallback: metrics.fallback,
            planetCanvas: { width: metrics.canvasWidth, height: metrics.canvasHeight, effectiveDpr: metrics.effectiveDpr },
            copyIntersectsPlanetOrRing: copyContentRects.some(function (copyRect) {
              return rectanglesIntersect(copyRect, body.getBoundingClientRect()) ||
                rings.some(function (candidate) { return rectanglesIntersect(copyRect, visibleBounds(candidate)) })
            }),
            ringWidthRatio,
            ringHeightRatio,
            beltThicknessRatio,
            sceneRect: { left: sceneRect.left, top: sceneRect.top, right: sceneRect.right, bottom: sceneRect.bottom },
            planetRect: { left: planetRect.left, top: planetRect.top, right: planetRect.right, bottom: planetRect.bottom },
            ringRect: { left: ringRect.left, top: ringRect.top, right: ringRect.right, bottom: ringRect.bottom },
            ringRightClearance: sceneRect.right - ringRect.right,
            brandRect: { left: brandRect.left, top: brandRect.top, right: brandRect.right, bottom: brandRect.bottom },
            brandLineCount,
            brandNavigationCollision: Array.from(document.querySelectorAll('.nav-toggle, .site-nav')).some(function (element) {
              return hasVisibleBounds(element) && rectanglesIntersect(brandRect, visibleBounds(element))
            }),
            viewportWidth: ${acceptanceWidth},
            copyContentRects,
            syntheticClipping: {
              rawViewportVisible,
              clippingAwareVisible: hasVisibleBounds(clippedSyntheticGroup)
            },
            ringAngle: getComputedStyle(ring).getPropertyValue('--saturn-equator-angle').trim(),
            surfaceAngle: getComputedStyle(surface).getPropertyValue('--planet-equator-angle').trim(),
            mobilePolicy: matchMedia('(max-width: 760px)').matches,
            layoutMode: systemStyle.getPropertyValue('--planet-layout-mode').trim(),
            systemTransform,
            systemTranslationX,
            viewportWidths: { inner: innerWidth, client: document.documentElement.clientWidth },
            bodyWidth: document.body.getBoundingClientRect().width,
            surfaceReady: document.getElementById('space-scene').classList.contains('planet-ready')
          })
        })
      })
    </script>`

  const offlineHome = generatedHome.replace(/\b(href|src)="\//g, '$1="')
  fs.writeFileSync(fixturePath, offlineHome.replace('</head>', `${contentWidthConstraint}${desktopViewportConstraint}${mutation}</head>`).replace('</body>', `${probeScript}</body>`))
  try {
    if (viewport.width === 390) return runChromeDeviceMetricsProbe(fixturePath, viewport)
    return readProbeResult(dumpWithChrome(fixturePath, { viewport, virtualTimeBudget: 3000 }))
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
  assert.deepEqual(probe.planetPresentation.sceneAnimations, [])
  assert.equal(probe.planetPresentation.surfaceOpacity, '1')
  assert.equal(probe.planetPresentation.transition.property, 'opacity')
  assert.equal(probe.planetPresentation.transition.duration, '0.2s')
  assert.equal(probe.planetPresentation.transition.timingFunction, 'ease-out')
  assert.equal(probe.planetPresentation.transition.delay, '0s')
  assert.deepEqual(probe.planetPresentation.equatorAngles, { ring: '-10deg', surface: '-10deg' })
  assert.equal(probe.cometPresentation.segmentCount, 8)
  assert.equal(probe.cometPresentation.overlayPointerEvents, 'none')
  assert.deepEqual(probe.cometPresentation.segmentPointerEvents, Array(8).fill('none'))
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

test('planet Canvas initializes, obeys shared pause states, and resumes without owning particle fallback', () => {
  const probe = normalChromeProbe()

  assert.equal(probe.initial.initialized, true)
  assert.equal(probe.initial.running, true)
  assert.equal(probe.paused.running, false)
  assert.equal(probe.particleFallback.running, false)
  assert.equal(probe.resumed.running, true)
  assert.equal(probe.particleFallbackOwnFallback, false)
  assert.equal(probe.ownFallback, false)
  assert.equal(probe.particleFallbackControlDisplay, 'none')
  assert.equal(probe.sceneAnimations, 0)
})

test('fine-pointer comet and planet interactions render, decay, and stay blocked while paused', () => {
  // Dropping the real pointer listeners, ellipse guard, decay lifecycle, or pause blocker would change these browser-observed styles or pixels.
  const interaction = normalChromeProbe().pointerInteraction

  assert.equal(interaction.comet.active, 'true', JSON.stringify(interaction))
  assert.deepEqual(interaction.pointerPolicy, {
    mobile: false,
    coarse: false,
    fine: true,
    hover: true,
    noHover: false
  })
  assert.equal(interaction.comet.phase, '1')
  assert.equal(interaction.comet.animationName, 'comet-fade-b')
  for (const property of ['x', 'y', 'length', 'angle', 'width']) {
    assert.notEqual(interaction.comet[property], '', `comet ${property}`)
  }
  assert.ok(interaction.hoverDifference.count > 0, JSON.stringify(interaction.hoverDifference))
  assert.ok(interaction.hoverDifference.sum > 0, JSON.stringify(interaction.hoverDifference))
  assert.ok(interaction.impactFrameDifference.sum > interaction.hoverDifference.sum, JSON.stringify(interaction))
  assert.deepEqual(interaction.hoverDecayDifference, { count: 0, sum: 0 })
  assert.ok(interaction.impactCallsAt50 > 0, JSON.stringify(interaction))
  assert.equal(interaction.impactCallsAfter770, interaction.impactCallsAt770, JSON.stringify(interaction))
  assert.ok(interaction.impactDifference.sum > 0, JSON.stringify(interaction))
  assert.ok(interaction.impactFrameDifference.sum > interaction.firstMarkDifference.sum, JSON.stringify(interaction))
  assert.ok(interaction.firstMarkDifference.sum > 0, JSON.stringify(interaction))
  assert.ok(interaction.markBeforePauseDifference.sum > 0, JSON.stringify(interaction))
  assert.deepEqual(interaction.markPauseDifference, { count: 0, sum: 0 })
  assert.deepEqual(interaction.naturalExpiryDifference, { count: 0, sum: 0 })
  assert.deepEqual(interaction.cornerDifference, { count: 0, sum: 0 })
  assert.deepEqual(interaction.pausedPlanetDifference, { count: 0, sum: 0 })
  assert.equal(interaction.pausedCometActiveSegments, 0)
  assert.equal(interaction.liveCometSegmentCount, 8)
  assert.equal(interaction.liveCometOverlayPointerEvents, 'none')
  assert.deepEqual(interaction.liveCometSegmentPointerEvents, Array(8).fill('none'))
})

test('reduced-motion keeps one complete deterministic frame and no continuous scene motion', () => {
  // Animating this branch would turn the static reduced-motion frame into a hidden continuous effect.
  const probe = runChromeProbe({ reducedMotion: true })

  assert.equal(probe.initial.initialized, true)
  assert.equal(probe.initial.running, false)
  assert.ok(probe.initial.drawCount >= 1)
  assert.equal(probe.sceneAnimations, 0)
  assert.equal(probe.control.display, 'none')
  assert.equal(probe.scrollBehavior, 'auto')
  assert.deepEqual(probe.reducedPointerInteraction, {
    planetDifference: { count: 0, sum: 0 },
    cometSegmentCount: 8,
    cometActiveSegments: 0,
    cometOverlayPointerEvents: 'none',
    cometSegmentPointerEvents: Array(8).fill('none')
  })
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
  // Headless Chrome enforces a ~500 CSS-pixel minimum window even when --window-size requests 320.
  // Keep that deliberate workaround separate from desktop exact-size acceptance.
  assert.ok(mobile.viewportWidths.inner <= 760, `requested=320, measured inner=${mobile.viewportWidths.inner}, client=${mobile.viewportWidths.client}`)
  assert.ok(mobile.viewportWidths.client <= 760, `requested=320, measured inner=${mobile.viewportWidths.inner}, client=${mobile.viewportWidths.client}`)
  assert.equal(mobile.contentWidth, 320)
  assert.equal(mobile.mobilePolicy, true)
  assert.equal(mobile.noHorizontalOverflow, true)
  assert.notEqual(mobile.disclosure.display, 'none')
  assert.equal(mobile.disclosure.open, false)
  assert.ok(mobile.disclosure.top < mobile.article.top, `${mobile.disclosure.top} !< ${mobile.article.top}`)
  assert.equal(mobile.disclosure.linkTarget.minBlockSize, '44px')
  assert.ok(mobile.disclosure.linkTarget.height >= 44, mobile.disclosure.linkTarget.height)
  assert.equal(mobile.desktopToc.display, 'none')

  const desktop = runArticleDisclosureProbe({ width: 1200, height: 800 })
  assert.equal(desktop.viewportWidths.inner, 1200, `requested=1200, measured inner=${desktop.viewportWidths.inner}, client=${desktop.viewportWidths.client}`)
  assert.equal(desktop.viewportWidths.client, 1200, `requested=1200, measured inner=${desktop.viewportWidths.inner}, client=${desktop.viewportWidths.client}`)
  assert.equal(desktop.disclosure.display, 'none')
  assert.notEqual(desktop.desktopToc.display, 'none')
  assert.equal(desktop.desktopToc.position, 'sticky')
  assert.ok(desktop.article.left < desktop.desktopToc.left, `${desktop.article.left} !< ${desktop.desktopToc.left}`)
  assert.match(desktop.innerStars.backgroundImage, /radial-gradient/i)
  assert.equal(desktop.innerStars.animationName, 'none')
})

test('planet and dust ring keep approved geometry clear of copy at every acceptance viewport', () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 }
  ]) {
    const probe = runPlanetCompositionProbe(viewport)
    if (viewport.width >= 768 || viewport.width === 390) {
      assert.equal(probe.viewportWidths.inner, viewport.width, `requested=${viewport.width}, measured inner=${probe.viewportWidths.inner}, client=${probe.viewportWidths.client}`)
      assert.equal(probe.viewportWidths.client, viewport.width, `requested=${viewport.width}, measured inner=${probe.viewportWidths.inner}, client=${probe.viewportWidths.client}`)
    } else {
      assert.equal(probe.bodyWidth, viewport.width)
      assert.ok(probe.viewportWidths.inner <= 760, `requested=${viewport.width}, measured inner=${probe.viewportWidths.inner}, client=${probe.viewportWidths.client}`)
      assert.ok(probe.viewportWidths.client <= 760, `requested=${viewport.width}, measured inner=${probe.viewportWidths.inner}, client=${probe.viewportWidths.client}`)
    }
    if (viewport.width > 760) {
      assert.ok(probe.ringRect.left >= probe.sceneRect.left)
      assert.ok(probe.ringRightClearance >= 8, `${viewport.width}px ring clearance`)
      assert.ok(probe.systemTranslationX >= 3 && probe.systemTranslationX <= 12, `${viewport.width}px translation ${probe.systemTranslationX}`)
      assert.notEqual(probe.systemTransform, 'none')
      assert.equal(probe.noHorizontalOverflow, true)
      assert.equal(probe.copyIntersectsPlanetOrRing, false)
    }
    assert.equal(probe.brandLineCount, 1)
    assert.ok(probe.brandRect.right <= probe.viewportWidth)
    assert.equal(probe.brandNavigationCollision, false)
    assert.equal(probe.noHorizontalOverflow, true, `${viewport.width}px overflow`)
    assert.deepEqual(probe.canvasIds, ['particle-flow', 'planet-surface'])
    assert.equal(probe.planetInitialized, true)
    assert.equal(probe.planetFallback, false)
    assert.equal(probe.surfaceReady, true)
    assert.equal(probe.copyContentRects.filter(rect => rect.kind === 'text').length >= 4, true, `${viewport.width}px visible copy text`)
    assert.equal(probe.copyContentRects.filter(rect => rect.kind === 'control').length, 2, `${viewport.width}px visible copy controls`)
    assert.equal(probe.copyIntersectsPlanetOrRing, false, `${viewport.width}px copy collision`)
    assert.ok(probe.ringWidthRatio >= 1.88 && probe.ringWidthRatio <= 1.94, probe.ringWidthRatio)
    assert.ok(probe.ringHeightRatio >= 0.34 && probe.ringHeightRatio <= 0.38, probe.ringHeightRatio)
    assert.ok(probe.beltThicknessRatio >= 0.07 && probe.beltThicknessRatio <= 0.10, probe.beltThicknessRatio)
    assert.equal(probe.planetCanvas.width % 8, 0)
    assert.equal(probe.planetCanvas.height % 8, 0)
    assert.ok(probe.planetCanvas.width <= (viewport.width <= 760 ? 320 : 512))
    assert.ok(probe.planetCanvas.effectiveDpr <= (viewport.width <= 760 ? 1.25 : 1.5))
    assert.equal(probe.ringAngle, '-10deg')
    assert.equal(probe.surfaceAngle, '-10deg')
    assert.equal(probe.mobilePolicy, viewport.width <= 760)
    assert.equal(probe.layoutMode, viewport.width <= 760 ? 'mobile' : 'desktop')
    if (viewport.width === 390) {
      assert.equal(probe.mobilePolicy, true)
      assert.equal(probe.layoutMode, 'mobile')
      assert.ok(probe.ringRect.right > probe.sceneRect.right)
      assert.equal(probe.systemTransform, 'none')
      assert.equal(probe.systemTranslationX, 0)
    }
  }
})

test('planet geometry probe excludes an event fully clipped by an overflow ancestor', () => {
  // Replacing clipping-aware geometry with raw child rectangles would count this invisible synthetic event.
  const probe = runPlanetCompositionProbe({ width: 320, height: 740 })

  assert.equal(probe.syntheticClipping.rawViewportVisible, true)
  assert.equal(probe.syntheticClipping.clippingAwareVisible, false)
})

test('mobile planet composition keeps the approved mobile layout policy', () => {
  // Forcing desktop placement at this breakpoint would push the ring back into the desktop composition.
  const probe = runPlanetCompositionProbe({ width: 320, height: 740 })

  assert.equal(probe.mobilePolicy, true)
  assert.equal(probe.layoutMode, 'mobile')
})
