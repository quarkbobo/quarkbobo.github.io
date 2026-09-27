// After release: node docs/three-body/perf-live-verify.cjs <published-commit-sha>
// The canonical public origin is fixed; local preview configuration is never consulted.
// No cache-busting query, retries, favicon exemption, rebuild, commit, push or production mutation.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { launch } = require('../../tools/verify-planet-explorer.cjs')
const root = path.resolve(__dirname, '../..')
const base = 'https://quarkbobo.github.io/'
const out = path.join(__dirname, 'perf-live-evidence', new Date().toISOString().replace(/[:.]/g, '-'))
const report = { startedAt: new Date().toISOString(), base, requestedCommit: process.argv[2] ?? null, assets: [], pages: [], checks: [], consoleErrors: [], networkErrors: [], requests: [], screenshots: [] }
const sha = value => createHash('sha256').update(value).digest('hex')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const check = (condition, label) => { assert.ok(condition, label); report.checks.push(label) }
async function main () {
  fs.mkdirSync(out, { recursive: true })
  assert.match(report.requestedCommit || '', /^[0-9a-f]{7,40}$/i, 'Pass the actual published commit SHA explicitly')
  report.commit = execFileSync('git', ['rev-parse', '--verify', `${report.requestedCommit}^{commit}`], { cwd: root, encoding: 'utf8' }).trim()
  const assets = [
    { file: 'js/three-body-scene.mjs', mime: /^(?:text|application)\/javascript(?:;|$)/i },
    { file: 'css/three-body.css', mime: /^text\/css(?:;|$)/i },
    { file: 'images/three-body/favicon.svg', mime: /^image\/svg\+xml(?:;|$)/i }
  ]
  for (const { file, mime } of assets) {
    const source = execFileSync('git', ['show', `${report.commit}:themes/fluid-particle/source/${file}`], { cwd: root })
    const response = await fetch(new URL(file, base), { signal: AbortSignal.timeout(20000) })
    const bytes = Buffer.from(await response.arrayBuffer())
    const asset = { file, url: response.url, status: response.status, mime: response.headers.get('content-type'), expectedSha256: sha(source), actualSha256: sha(bytes), expectedBytes: source.length, actualBytes: bytes.length, equalBytes: source.equals(bytes), cache: { age: response.headers.get('age'), etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified'), cacheControl: response.headers.get('cache-control') } }
    report.assets.push(asset)
    assert.equal(response.status, 200, `${file}: canonical published URL returns 200`)
    assert.match(asset.mime || '', mime, `${file}: correct MIME type`)
    assert.ok(asset.equalBytes, `${file}: public bytes differ from published commit ${report.commit}; expected ${asset.expectedSha256}, received ${asset.actualSha256}. Stale CDN content is a verification failure, not a pass.`)
    report.checks.push(`${file}: HTTP 200, MIME and every byte match the published Git commit`)
  }
  let browser
  const requests = new Map()
  const onEvent = message => {
    const p = message.params
    if (message.method === 'Network.requestWillBeSent') requests.set(p.requestId, p.request.url)
    if (message.method === 'Network.responseReceived') {
      report.requests.push({ url: p.response.url, status: p.response.status, mime: p.response.mimeType })
      if (p.response.status >= 400) report.networkErrors.push(`${p.response.status} ${p.response.url}`)
    }
    if (message.method === 'Network.loadingFailed' && !p.canceled) report.networkErrors.push(`${p.errorText} ${requests.get(p.requestId) || p.requestId}`)
  }
  try {
    const NativeSocket = global.WebSocket
    global.WebSocket = class extends NativeSocket {
      constructor (...args) { super(...args); this.addEventListener('message', event => { const message = JSON.parse(String(event.data)); if (message.method) onEvent(message) }) }
    }
    try { browser = await launch({ width: 1440, height: 900 }, report) } finally { global.WebSocket = NativeSocket }
    const { send, evaluate, until } = browser
    const screenshot = async label => {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      const filename = `${label}-1440.png`
      fs.writeFileSync(path.join(out, filename), Buffer.from(shot.data, 'base64')); report.screenshots.push(filename)
    }
    const inspectPage = async name => {
      const page = await evaluate(`(()=>{const main=document.querySelector('main'),visible=e=>!!e&&e.checkVisibility({checkVisibilityCSS:true});return{url:location.href,theme:document.documentElement.dataset.theme,toggle:!!document.getElementById('three-body-toggle'),mainText:main?.textContent.trim().length,readable:visible(main),navLinks:[...document.querySelectorAll('.site-nav a[href]')].filter(visible).map(a=>({text:a.textContent.trim(),href:a.href})),favicon:document.querySelector('link[rel=icon]')?.href,willChange:document.getElementById('three-body-canvas')?getComputedStyle(document.getElementById('three-body-canvas')).willChange:null,labelWillChange:[...document.querySelectorAll('.tb-body-labels span')].map(e=>getComputedStyle(e).willChange),width:innerWidth,pageWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}})()`)
      report.pages.push({ name, ...page })
      assert.equal(new URL(page.url).origin, new URL(base).origin)
      assert.equal(page.theme, 'three-body'); assert.equal(page.toggle, false)
      check(page.readable && page.mainText > 20 && page.navLinks.length >= 2, `${name}: actual public page has readable content and navigation under the only theme`)
      assert.equal(page.favicon, new URL('images/three-body/favicon.svg', base).href)
      check(page.width === 1440 && page.pageWidth <= page.clientWidth, `${name}: public desktop layout has no horizontal overflow`)
      return page
    }
    const clickNavigation = async selector => {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})`)
      const link = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return{href:e.href,x,y,reachable:h===e||e.contains(h)}})()`)
      assert.equal(new URL(link.href).origin, new URL(base).origin, 'actual navigation stays on public site')
      assert.equal(link.reachable, true, `${selector}: visible native navigation target`)
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: link.x, y: link.y, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: link.x, y: link.y, button: 'left', clickCount: 1 })
      await wait(200)
      await until(`location.pathname===${JSON.stringify(new URL(link.href).pathname)} && document.readyState==="complete" && typeof window.threeBodySnapshot==="function"`, `real navigation reaches ${link.href}`, 20000)
      return link.href
    }
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true })
    await send('Page.navigate', { url: base })
    await until('document.readyState==="complete" && typeof window.threeBodySnapshot==="function" && window.threeBodySnapshot().renderer.available', 'canonical default homepage initializes real WebGL', 30000)
    const page = await inspectPage('home')
    assert.ok(page.willChange.split(',').map(value => value.trim()).includes('transform'), 'published canvas uses computed will-change: transform')
    check(page.labelWillChange.length >= 4 && page.labelWillChange.every(value => value.split(',').map(part => part.trim()).includes('transform')), 'Actual projected labels use computed will-change: transform')
    const before = await evaluate('window.threeBodySnapshot()')
    await until(`window.threeBodySnapshot().renderer.frames>${before.renderer.frames + 1} && window.threeBodySnapshot().simTime>${before.simTime + 0.1}`, 'published frames and solver both advance', 15000)
    const after = await evaluate('window.threeBodySnapshot()')
    assert.equal(after.active, true); assert.equal(after.paused, false); assert.equal(after.error, null)
    assert.equal(after.renderer.bodyCount, 4); assert.equal(after.renderer.textures, 1)
    check(after.bodies.length === 4 && after.bodies.every((body, i) => [...body.position, ...body.velocity].every(Number.isFinite) && body.position.some((value, axis) => value !== before.bodies[i].position[axis])), 'All four published bodies really move with finite physical state')
    report.motion = { before: { frames: before.renderer.frames, simTime: before.simTime, realTime: before.realTime }, after: { frames: after.renderer.frames, simTime: after.simTime, realTime: after.realTime, geometries: after.renderer.geometries, textures: after.renderer.textures, bodyCount: after.renderer.bodyCount } }
    await screenshot('home')
    await clickNavigation('.site-nav a[href="/archives/"]')
    await inspectPage('archive')
    check(await evaluate('document.querySelectorAll(".archive-list a[href]").length>0'), 'Published archive retains real article links')
    await screenshot('archive')
    const articleUrl = await clickNavigation('.archive-list a[href]')
    await inspectPage('article')
    assert.equal((await evaluate('window.threeBodySnapshot()')).renderer.available, false, 'article does not allocate the observation renderer')
    report.articleUrl = articleUrl
    await screenshot('article')
    await clickNavigation('.site-brand')
    await until('window.threeBodySnapshot().renderer.available && window.threeBodySnapshot().renderer.frames>0', 'home navigation restores the real scene', 30000)
    await inspectPage('returned-home')
    await wait(350)
    check(report.requests.some(request => request.url === new URL('images/three-body/favicon.svg', base).href && request.status === 200), 'Real published browser request retrieves the SVG favicon with 200')
    assert.deepEqual([...requests.values()].filter(url => new URL(url).origin === new URL(base).origin && new URL(url).pathname === '/favicon.ico'), [], 'No implicit favicon.ico request is hidden or exempted')
    assert.deepEqual(report.networkErrors, [], 'Every observed public browser resource succeeds, including favicon')
    assert.deepEqual(report.consoleErrors, [], 'Zero console/runtime errors across actual public home/archive/article navigation')
    report.passed = true
  } catch (error) {
    if (browser) {
      try {
        report.failurePage = await browser.evaluate('({url:location.href,theme:document.documentElement.dataset.theme,snapshot:typeof window.threeBodySnapshot==="function"?window.threeBodySnapshot():null})')
        const shot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        fs.writeFileSync(path.join(out, 'failure-1440.png'), Buffer.from(shot.data, 'base64')); report.screenshots.push('failure-1440.png')
      } catch (captureError) { report.captureError = captureError.message }
    }
    throw error
  } finally { if (browser) await browser.close() }
}
main().catch(error => { report.passed = false; report.error = error.stack }).finally(() => {
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ passed: report.passed, commit: report.commit, checks: report.checks.length, report: path.join(out, 'report.json'), error: report.error }, null, 2))
  if (!report.passed) process.exitCode = 1
})
