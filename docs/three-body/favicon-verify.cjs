// node docs/three-body/favicon-verify.cjs          (source template + actual HTTP asset)
// node docs/three-body/favicon-verify.cjs --browser (built pages + real browser requests)
// Does not build or change public/. Missing /favicon.ico returns an ordinary 404, never a special 204.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { once } = require('node:events')
const ejs = require('ejs')
const { launch } = require('../../tools/verify-planet-explorer.cjs')
const root = path.resolve(__dirname, '../..')
const useBrowser = process.argv.includes('--browser')
const out = path.join(__dirname, 'favicon-evidence', new Date().toISOString().replace(/[:.]/g, '-'))
const report = { startedAt: new Date().toISOString(), mode: useBrowser ? 'built-browser' : 'source-http', checks: [], requests: [], consoleErrors: [] }
report.fixtureCorrections = [{ previousRun: '2026-09-27T03-45-44-939Z', correction: 'Move only the new favicon into themes/fluid-particle/source/images/three-body; source HTTP checks now serve that authorized theme source root. Browser URL and assertions remain unchanged.' }]
const iconPath = '/images/three-body/favicon.svg'
const check = (condition, label) => { assert.ok(condition, label); report.checks.push(label) }
function iconContract (html, label) {
  const icons = [...html.matchAll(/<link\b[^>]*\brel=["']icon["'][^>]*>/g)].map(match => match[0])
  assert.equal(icons.length, 1, `${label}: exactly one explicit favicon`)
  assert.match(icons[0], /type="image\/svg\+xml"/)
  assert.match(icons[0], /sizes="any"/)
  assert.match(icons[0], /href="\/images\/three-body\/favicon\.svg"/)
  report.checks.push(`${label}: explicit same-origin SVG favicon`)
}
async function main () {
  fs.mkdirSync(out, { recursive: true })
  const start = performance.now()
  const staticRoot = path.join(root, useBrowser ? 'public' : 'themes/fluid-particle/source')
  let browser
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    let filename = path.resolve(staticRoot, '.' + pathname)
    const record = { pathname, status: null }
    report.requests.push(record)
    if (filename !== staticRoot && !filename.startsWith(staticRoot + path.sep)) { record.status = 403; response.writeHead(403).end(); return }
    if (fs.existsSync(filename) && fs.statSync(filename).isDirectory()) filename = path.join(filename, 'index.html')
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) { record.status = 404; response.writeHead(404).end('Not found'); return }
    const mime = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' }
    record.status = 200
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    fs.createReadStream(filename).pipe(response)
  })
  try {
    if (useBrowser) {
      for (const route of ['index.html', 'archives/index.html', '关于我/zzyc_V4_for_U/index.html']) iconContract(fs.readFileSync(path.join(staticRoot, route), 'utf8'), route)
    } else {
      const template = fs.readFileSync(path.join(root, 'themes/fluid-particle/layout/_partial/head.ejs'), 'utf8')
      for (const pagePath of ['index.html', 'archives/index.html', '关于我/zzyc_V4_for_U/index.html']) {
        const html = ejs.render(template, { page: { path: pagePath, title: '' }, config: { title: '三体观测站', description: '' }, theme: { hero: { description: '观测与阅读' } }, url_for: value => value, css: value => `<link rel="stylesheet" href="/${value}">` })
        iconContract(html, pagePath)
      }
    }
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const url = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(url + iconPath), svg = await response.text()
    assert.equal(response.status, 200, 'explicit favicon URL returns HTTP 200')
    assert.match(response.headers.get('content-type'), /^image\/svg\+xml/)
    assert.match(svg, /<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    assert.match(svg, /viewBox="0 0 64 64"/)
    for (const color of ['#050914', '#ffb45b', '#80caff', '#ff694a']) assert.ok(svg.includes(color), `icon contains ${color}`)
    assert.doesNotMatch(svg, /<script|<foreignObject|(?:href|src)=["']https?:/i)
    check(Buffer.byteLength(svg) < 4096, 'Self-contained three-color SVG is under 4 KiB and served with the SVG MIME type')
    if (useBrowser) {
      const manualRequests = report.requests.length
      browser = await launch({ width: 1440, height: 900, reducedMotion: true }, report)
      const { send, evaluate, until } = browser
      await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true })
      for (const route of ['/', '/archives/', '/关于我/zzyc_V4_for_U/']) {
        await send('Page.navigate', { url: url + route })
        await until('document.readyState==="complete"', `built ${route} loaded`, 15000)
        assert.equal(await evaluate('new URL(document.querySelector("link[rel=icon]").href).pathname'), iconPath)
      }
      const deadline = Date.now() + 3000
      while (!report.requests.slice(manualRequests).some(request => request.pathname === iconPath) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
      await new Promise(resolve => setTimeout(resolve, 300))
      const requests = report.requests.slice(manualRequests)
      check(requests.some(request => request.pathname === iconPath && request.status === 200), 'Real browser requests the explicit SVG successfully')
      assert.deepEqual(requests.filter(request => request.pathname === '/favicon.ico'), [], 'browser never requests implicit /favicon.ico')
      assert.deepEqual(requests.filter(request => request.status >= 400), [], 'all actual same-origin browser requests succeed')
      assert.deepEqual(report.consoleErrors, [], 'browser console/runtime errors are zero')
      report.checks.push('Home, archive and article have no implicit favicon request, no local HTTP errors and no console errors')
      await send('Page.navigate', { url: url + iconPath })
      await until('document.readyState==="complete"', 'actual SVG document opens', 5000)
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      fs.writeFileSync(path.join(out, 'favicon-browser.png'), Buffer.from(shot.data, 'base64'))
    }
    report.passed = true
  } finally {
    if (browser) await browser.close()
    if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    report.elapsedMs = performance.now() - start
  }
}
main().catch(error => { report.passed = false; report.error = error.stack }).finally(() => {
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ passed: report.passed, mode: report.mode, checks: report.checks.length, elapsedMs: report.elapsedMs, report: path.join(out, 'report.json'), error: report.error }, null, 2))
  if (!report.passed) process.exitCode = 1
})
