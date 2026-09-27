// Single-theme counterpart of tools/verify-three-body.cjs's original real 600-second soak.
// Run only after a completed build and an exclusive browser/GPU test slot:
//   node docs/three-body/perf-soak.cjs
// No duration override, fake clocks, core mutations, theme toggle, rebuild or favicon exemption.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { once } = require('node:events')
const { createHash } = require('node:crypto')
const { launch } = require('../../tools/verify-planet-explorer.cjs')
const publicRoot = path.resolve(__dirname, '../../public')
const out = path.join(__dirname, 'perf-soak-evidence', new Date().toISOString().replace(/[:.]/g, '-'))
const DURATION_MS = 600000, INTERVAL_MS = 30000
const MAX_GPU = { geometries: 16, textures: 3 }
const report = { startedAt: new Date().toISOString(), protocol: { durationMs: DURATION_MS, intervalMs: INTERVAL_MS, expectedSamples: 21, trailAgeMax: 8.05, trailCapacity: 512, beltCapacity: 256, gpu: { maximum: MAX_GPU, invariant: 'Every sample equals the first observed post-warmup geometry/texture counts.' }, launch: 'Existing verify-planet-explorer launch helper forces ANGLE SwiftShader; this is not a hardware-GPU FPS claim.' }, checks: [], samples: [], consoleErrors: [], networkErrors: [], requests: [], screenshots: [] }
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const check = (condition, label) => { assert.ok(condition, label); report.checks.push(label) }
const write = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
async function main () {
  fs.mkdirSync(out, { recursive: true })
  const began = performance.now()
  let browser, origin, soakStart
  const requestUrls = new Map()
  const onEvent = message => {
    const p = message.params
    if (message.method === 'Network.requestWillBeSent') requestUrls.set(p.requestId, p.request.url)
    if (message.method === 'Network.responseReceived' && p.response.url.startsWith(origin + '/') && p.response.status >= 400) report.networkErrors.push(`${p.response.status} ${p.response.url}`)
    if (message.method === 'Network.loadingFailed' && requestUrls.get(p.requestId)?.startsWith(origin + '/') && !p.canceled) report.networkErrors.push(`${p.errorText} ${requestUrls.get(p.requestId)}`)
  }
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' }
  const server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      const record = { pathname, status: null }; report.requests.push(record)
      let filename = path.resolve(publicRoot, '.' + pathname)
      if (filename !== publicRoot && !filename.startsWith(publicRoot + path.sep)) { record.status = 403; response.writeHead(403).end(); return }
      if (fs.existsSync(filename) && fs.statSync(filename).isDirectory()) filename = path.join(filename, 'index.html')
      if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) { record.status = 404; response.writeHead(404).end('Not found'); return }
      record.status = 200
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
      fs.createReadStream(filename).pipe(response)
    } catch (error) { response.writeHead(400).end(error.message) }
  })
  try {
    report.builtAssetHashes = Object.fromEntries(['js/three-body.mjs', 'js/three-body-scene.mjs', 'js/three-body-core.mjs', 'js/three-body-overlays.mjs', 'js/three-body-events.mjs', 'css/three-body.css', 'images/three-body/favicon.svg'].map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(publicRoot, file))).digest('hex')]))
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    origin = `http://127.0.0.1:${server.address().port}`
    // Observe the existing helper's real CDP socket without changing that helper.
    const NativeSocket = global.WebSocket
    global.WebSocket = class extends NativeSocket {
      constructor (...args) { super(...args); this.addEventListener('message', event => { const message = JSON.parse(String(event.data)); if (message.method) onEvent(message) }) }
    }
    try { browser = await launch({ width: 1440, height: 900 }, report) } finally { global.WebSocket = NativeSocket }
    const { send, evaluate, until } = browser
    const snap = () => evaluate('window.threeBodySnapshot()')
    const settle = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers })
    }
    const click = async selector => {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})`)
      await settle()
      const r = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return{x,y,reachable:h===e||e.contains(h),width:r.width,height:r.height}})()`)
      assert.ok(r.width > 0 && r.height > 0 && r.reachable, `${selector} is a real reachable input`)
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 })
      await settle()
    }
    const choose = async (selector, value) => {
      const index = await evaluate(`[...document.querySelector(${JSON.stringify(selector)}).options].findIndex(o=>o.value===${JSON.stringify(value)})`)
      assert.ok(index >= 0, `${selector} has option ${value}`)
      await click(selector); await key('Home', 'Home', 36)
      for (let n = 0; n < index; n++) await key('ArrowDown', 'ArrowDown', 40)
      await key('Enter', 'Enter', 13)
      await until(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(value)}`, `native select ${value}`)
    }
    const paused = async value => { if ((await snap()).paused !== value) await click('#tb-pause'); await until(`window.threeBodySnapshot().paused===${value}`, `paused=${value}`) }
    const screenshot = async label => {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      const filename = `soak-${label}.png`
      fs.writeFileSync(path.join(out, filename), Buffer.from(shot.data, 'base64')); report.screenshots.push(filename)
    }
    await send('Network.enable'); await send('Performance.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__perfSoak={draws:0,contexts:0};const native=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){const c=native.call(this,kind,...args);if(c&&/^webgl/.test(kind)&&this.id==='three-body-canvas'&&!c.__perfSoak){c.__perfSoak=true;window.__perfSoak.contexts++;for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){const original=c[name];if(original)c[name]=function(...values){window.__perfSoak.draws++;return original.apply(this,values)}}}return c}` })
    await send('Page.navigate', { url: origin + '/' })
    await until('typeof window.threeBodySnapshot==="function" && window.threeBodySnapshot().renderer.available && window.__perfSoak.draws>0', 'default single-theme scene draws', 20000)
    check(await evaluate('document.documentElement.dataset.theme==="three-body" && !document.getElementById("three-body-toggle")'), 'Default root is the single three-body theme')
    report.graphics = await evaluate(`(()=>{const gl=document.getElementById('three-body-canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{version:gl.getParameter(gl.VERSION),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null}})()`)
    await paused(true)
    for (const view of ['station', 'star-a', 'star-b', 'star-c', 'planet']) await choose('#tb-view', view)
    await choose('#tb-view', 'station'); await choose('#tb-mode', '2')
    for (const force of ['gravity', 'acceleration', 'radiation']) await click(`[data-force="${force}"]`)
    await choose('#tb-preset', 'chaotic'); await choose('#tb-preset', 'balanced')
    await click('#tb-parameters > summary')
    await click('#tb-speed'); await key('a', 'KeyA', 65, 2); await send('Input.insertText', { text: '10' })
    await click('#tb-apply'); await click('#tb-parameters > summary')
    await click('#three-body-canvas'); await key('Escape', 'Escape', 27)
    await evaluate('document.getElementById("three-body-canvas").scrollIntoView({block:"center",behavior:"instant"})')
    await paused(false); await wait(3000)
    const warmed = await snap()
    check(warmed.preset === 'balanced' && warmed.mode === 2 && warmed.speed === 10, 'Real controls configure balanced/free-space mode at 10x speed')
    check(warmed.renderer.geometries > 0 && warmed.renderer.geometries <= MAX_GPU.geometries && warmed.renderer.textures >= 0 && warmed.renderer.textures <= MAX_GPU.textures, 'Warmup fits within 16 geometries and 3 textures')
    report.warmedGpu = { geometries: warmed.renderer.geometries, textures: warmed.renderer.textures }
    await screenshot('initial')
    const validate = (state, sample, previous) => {
      check(state.active && state.visible && !state.paused && !sample.documentHidden && state.error === null, `sample ${sample.index}: foreground simulation runs without an error`)
      check(state.bodies.length === 4 && state.bodies.every(body => body.position.length === 3 && body.velocity.length === 3 && [...body.position, ...body.velocity, body.mass, body.luminosity].every(Number.isFinite)), `sample ${sample.index}: all four physical states remain finite`)
      check(state.bodies.every(body => Array.isArray(body.trail) && body.trail.length <= 512 && body.trail.every(point => Number.isFinite(point.time) && point.position.length === 3 && point.position.every(Number.isFinite) && state.realTime >= point.time && state.realTime - point.time <= 8.05)), `sample ${sample.index}: every trail point respects the 512 capacity and 8.05-second age bound`)
      const first = report.samples[0]
      check(state.renderer.geometries > 0 && state.renderer.geometries <= MAX_GPU.geometries && state.renderer.textures >= 0 && state.renderer.textures <= MAX_GPU.textures && state.renderer.geometries === first.geometries && state.renderer.textures === first.textures, `sample ${sample.index}: GPU allocations equal the first sample and stay within 16 geometries/3 textures`)
      check(state.belt && state.belt.error === null && state.belt.particles.length > 0 && state.belt.particles.length <= 256 && state.belt.particles.every(particle => particle.position.length === 3 && particle.velocity.length === 3 && [...particle.position, ...particle.velocity].every(Number.isFinite)) && state.renderer.beltCount <= 256, `sample ${sample.index}: actual belt stays finite, error-free and within 256 particles`)
      if (previous) check(sample.frames > previous.frames && sample.draws > previous.draws && sample.realTime > previous.realTime && sample.simTime > previous.simTime, `sample ${sample.index}: actual frames, native draws and both clocks advance`)
      assert.deepEqual(report.consoleErrors, [], 'No console/runtime errors')
      assert.deepEqual(report.networkErrors, [], 'No failed same-origin browser requests')
      assert.deepEqual(report.requests.filter(request => request.status >= 400), [], 'Strict static server has no HTTP errors, including favicon')
    }
    soakStart = performance.now()
    for (let n = 0; n <= DURATION_MS / INTERVAL_MS; n++) {
      if (n) await wait(Math.max(0, soakStart + n * INTERVAL_MS - performance.now()))
      const state = await snap(), metrics = await send('Performance.getMetrics')
      const observation = await evaluate('({draws:window.__perfSoak.draws,contexts:window.__perfSoak.contexts,documentHidden:document.hidden})')
      const sample = { index: n, elapsedMs: performance.now() - soakStart, frames: state.renderer.frames, geometries: state.renderer.geometries, textures: state.renderer.textures, heap: metrics.metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value ?? null, simTime: state.simTime, realTime: state.realTime, trailCounts: state.bodies.map(body => body.trail.length), trailMaxAges: state.bodies.map(body => body.trail.length ? Math.max(...body.trail.map(point => state.realTime - point.time)) : null), beltCount: state.belt?.particles.length ?? null, ...observation, snapshotFile: `sample-${String(n).padStart(2, '0')}.json` }
      // Save even a failing observation before assertion so the failure retains actual evidence.
      fs.writeFileSync(path.join(out, sample.snapshotFile), JSON.stringify(state, null, 2) + '\n')
      report.samples.push(sample)
      fs.writeFileSync(path.join(out, 'soak-samples.json'), JSON.stringify(report.samples, null, 2) + '\n')
      write(); validate(state, sample, report.samples[n - 1])
      console.log(`SOAK ${n}/20 elapsed=${sample.elapsedMs.toFixed(0)}ms frames=${sample.frames} GPU=${sample.geometries}/${sample.textures} heap=${sample.heap}`)
    }
    report.soakElapsedMs = performance.now() - soakStart
    check(report.soakElapsedMs >= DURATION_MS && report.samples.length === 21 && report.samples.at(-1).elapsedMs >= DURATION_MS, 'Completed a full 600 wall-clock seconds with all 21 observations')
    const first = report.samples[0], last = report.samples.at(-1), heaps = report.samples.map(sample => sample.heap).filter(Number.isFinite)
    report.summary = { elapsedMs: report.soakElapsedMs, frameDelta: last.frames - first.frames, averageFps: (last.frames - first.frames) * 1000 / (last.elapsedMs - first.elapsedMs), intervalFps: report.samples.slice(1).map((sample, index) => (sample.frames - report.samples[index].frames) * 1000 / (sample.elapsedMs - report.samples[index].elapsedMs)), heapFirst: first.heap, heapLast: last.heap, heapMin: heaps.length ? Math.min(...heaps) : null, heapMax: heaps.length ? Math.max(...heaps) : null }
    await screenshot('final'); await paused(true)
    report.passed = true
  } catch (error) {
    if (soakStart !== undefined) report.soakElapsedMs = performance.now() - soakStart
    if (browser) {
      try {
        report.lastSnapshot = await browser.evaluate('typeof window.threeBodySnapshot==="function"?window.threeBodySnapshot():null')
        const shot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        fs.writeFileSync(path.join(out, 'soak-failure.png'), Buffer.from(shot.data, 'base64')); report.screenshots.push('soak-failure.png')
      } catch (captureError) { report.captureError = captureError.message }
    }
    throw error
  } finally {
    if (browser) await browser.close()
    if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    report.elapsedMs = performance.now() - began
  }
}
main().catch(error => { report.passed = false; report.error = error.stack }).finally(() => {
  fs.mkdirSync(out, { recursive: true }); write()
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, samples: report.samples.length, soakElapsedMs: report.soakElapsedMs, report: path.join(out, 'report.json'), error: report.error }, null, 2))
  if (!report.passed) process.exitCode = 1
})
