// Run only with exclusive GPU permission: node docs/three-body/perf-lifecycle.cjs
// Uses current built assets. Does not build, alter production, or change prior benchmarks.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { serve, launch } = require('../../tools/verify-planet-explorer.cjs')
const root = path.resolve(__dirname, '../..')
assert.equal(process.argv.length, 2, 'This verification takes no arguments')
const expectedTextures = 1
const out = path.join(__dirname, `perf-lifecycle-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const report = { startedAt:new Date().toISOString(), expectedTextures, maximumGeometries:16, checks:[], consoleErrors:[], cycles:[], method:'Three real createScene/render/dispose cycles on one WebGL2 canvas; unchanged four-year production physics fixture. Native texStorage handles are checked with gl.isTexture after disposal. Default renderer fallback texImage textures are outside that ledger. No render-performance claims.' }
const check = (value, message) => { assert.ok(value, message); report.checks.push(message) }
const save = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
;(async () => {
  fs.mkdirSync(out, { recursive:true })
  for (const name of ['three-body-scene.mjs', 'three-body-core.mjs', 'three-body-overlays.mjs']) {
    const source = hash(path.join(root, 'themes/fluid-particle/source/js', name)), built = hash(path.join(root, 'public/js', name))
    check(source === built, `${name}: built bytes match source`)
    ;(report.assets ||= []).push({ name, source, built })
  }
  report.fixtureHash = hash(path.join(__dirname, 'perf-lifecycle.html'))
  const { server, url } = await serve(), handler = server.listeners('request')[0]
  server.removeAllListeners('request')
  server.on('request', (request, response) => {
    if (new URL(request.url, url).pathname === '/perf-lifecycle.html') {
      response.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' })
      fs.createReadStream(path.join(__dirname, 'perf-lifecycle.html')).pipe(response)
    } else handler(request, response)
  })
  let browser, geometryCount
  try {
    browser = await launch({ width:1440, height:900 }, report)
    await browser.send('Page.navigate', { url:url + 'perf-lifecycle.html' })
    await browser.until('window.lifecycleReady === true', 'fixed-state lifecycle fixture ready', 30000)
    report.hardware = await browser.evaluate('window.lifecycle.hardware')
    for (let index = 1; index <= 3; index++) {
      const result = await browser.evaluate(`window.lifecycle.cycle(${index})`)
      const png = Buffer.from(result.png.split(',')[1], 'base64'); delete result.png
      result.screenshot = `cycle-${index}.png`; fs.writeFileSync(path.join(out, result.screenshot), png)
      report.cycles.push(result); save()
      geometryCount ??= result.warmed.geometries
      check(geometryCount > 0 && geometryCount <= report.maximumGeometries, `cycle ${index}: actual uploaded geometry count is between 1 and 16`)
      check(result.warmed.geometries === geometryCount && result.samples.every(s => s.geometries === geometryCount), `cycle ${index}: warmed geometry counts remain stable`)
      check(result.warmed.textures === expectedTextures && result.samples.every(s => s.textures === expectedTextures), `cycle ${index}: exactly ${expectedTextures} warmed textures remain stable`)
      check(result.samples.every((s, i) => s.frames > (i ? result.samples[i - 1].frames : result.warmed.frames)), `cycle ${index}: actual render frames advance`)
      check(result.storage.length === expectedTextures, `cycle ${index}: real texture storage allocations match expected count`)
      check(result.storage.every(s => !s.liveAfterDispose), `cycle ${index}: uploaded native textures were deleted`)
      check(result.disposed.textures === 0 && result.disposed.geometries === 0 && !result.disposed.available, `cycle ${index}: dispose releases all reported textures and geometry`)
      check(JSON.stringify(result.disposedAgain) === JSON.stringify(result.disposed), `cycle ${index}: repeated dispose is idempotent`)
      check(result.physicsUnchanged, `cycle ${index}: render and dispose leave physical bodies, belt and trails unchanged`)
      check(result.glError === 0, `cycle ${index}: WebGL error state is clear`)
      check(result.image.nonzero > 100 && result.image.distinctColors > 16 && result.image.maximum - result.image.minimum > 30 && png.length > 1000, `cycle ${index}: real GL pixels and PNG contain a nonuniform visible image`)
      check(report.consoleErrors.length === 0, `cycle ${index}: browser console has no errors`)
      console.log(`PASS cycle ${index}: geometry=${geometryCount}, textures=${expectedTextures}, disposed=0/0`)
    }
    report.observedWarmedGeometries = geometryCount
    report.passed = true
  } finally {
    if (browser) await browser.close()
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    report.completedAt = new Date().toISOString(); save()
    console.log(`Evidence: ${out}`)
  }
})().catch(error => { report.passed = false; report.error = error.stack; fs.mkdirSync(out, { recursive:true }); save(); console.error(error); process.exitCode = 1 })
