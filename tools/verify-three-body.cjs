// Independent acceptance gate. Build public/ first; no browser-test dependencies.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { execFileSync, spawnSync } = require('node:child_process')
const { serve, launch } = require('./verify-planet-explorer.cjs')

const root = path.resolve(__dirname, '..')
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const out = path.join(root, 'docs/three-body/verification', runId)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const report = { startedAt: new Date().toISOString(), command: process.argv, cases: [] }
const themeRoot = 'themes/fluid-particle/'
const mutable = new Set(['layout/layout.ejs', 'layout/_partial/head.ejs', 'layout/_partial/header.ejs', 'layout/_partial/home.ejs', 'source/js/planet-explorer.mjs'].map(file => themeRoot + file))

function scope () {
  const before = JSON.parse(fs.readFileSync(path.join(root, 'docs/three-body/baseline/files.json')))
  const changed = []
  for (const [file, digest] of Object.entries(before)) {
    if (mutable.has(file)) continue
    assert.ok(fs.existsSync(path.join(root, file)), `Read-only file removed: ${file}`)
    if (hash(fs.readFileSync(path.join(root, file))) !== digest) changed.push(file)
  }
  assert.deepEqual(changed, [], 'All frozen non-whitelisted files retain their SHA-256')
  const files = [...new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean))]
  const unexpected = files.filter(file => !(file in before) && !file.startsWith('docs/three-body/') && !file.startsWith('themes/fluid-particle/source/images/three-body/') && file !== 'tools/verify-three-body.cjs' && !/^(?:test|themes\/fluid-particle\/(?:layout\/_partial|source\/(?:js|css)))\/three-body[^/]*$/.test(file))
  assert.deepEqual(unexpected, [], 'Only the requested three-body additions exist')
  return { frozenFiles: Object.keys(before).length, changedReadOnlyFiles: changed, additions: files.filter(file => !(file in before)) }
}

async function stage (name, task) {
  const result = { name, checks: [], consoleErrors: [], screenshots: [] }
  report.cases.push(result)
  try { await task(result); result.passed = true } catch (error) { result.passed = false; result.error = error.stack || String(error) }
  process.stdout.write(`${result.passed ? 'PASS' : 'FAIL'} ${name}: ${result.passed ? result.checks.length + ' checks' : result.error.split('\n')[0]}\n`)
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
}

// The existing launch helper intentionally exports no event API. Attach an
// observer to its real socket for Network/Screencast, without changing it.
async function observedLaunch (options, result, onEvent) {
  const NativeSocket = global.WebSocket
  global.WebSocket = class extends NativeSocket {
    constructor (...args) {
      super(...args)
      this.addEventListener('message', event => {
        const message = JSON.parse(String(event.data))
        if (message.method) onEvent(message)
      })
    }
  }
  try { return await launch(options, result) } finally { global.WebSocket = NativeSocket }
}

function recordingPlayer (name, frames) {
  const safe = JSON.stringify(frames).replace(/</g, '\\u003c')
  fs.writeFileSync(path.join(out, `${name}-recording.html`), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>三体真实浏览器录屏</title><style>body{margin:1rem;background:#111;color:white;font:16px system-ui}img{display:block;max-width:100%;max-height:85vh}input{width:65%}</style><p>CDP Page.startScreencast 原始帧；时轴保留真实帧间隔。<button id="play">播放 / 暂停</button> <input id="seek" type="range" min="0" max="${Math.max(0, frames.length - 1)}" value="0"><output></output></p><img alt="浏览器录屏帧"><script>const frames=${safe};let playing=false,timer;const image=document.querySelector('img'),seek=document.querySelector('#seek'),label=document.querySelector('output');function show(){const f=frames[+seek.value];if(f){image.src=f.file;label.value=(f.time-frames[0].time).toFixed(2)+' s'}}function tick(){if(!playing)return;let i=+seek.value;if(i>=frames.length-1){playing=false;return}timer=setTimeout(()=>{seek.value=++i;show();tick()},Math.max(1,(frames[i+1].time-frames[i].time)*1000))}document.querySelector('#play').onclick=()=>{playing=!playing;clearTimeout(timer);if(playing){if(+seek.value>=frames.length-1)seek.value=0;show();tick()}};seek.oninput=()=>{clearTimeout(timer);show();tick()};show();</script></html>`)
}

async function browserCase (options, url, result) {
  const checks = (value, description) => { assert.ok(value, description); result.checks.push(description) }
  const requests = new Map(), networkErrors = [], frames = []
  let browser, recording = false
  const onEvent = message => {
    const p = message.params
    if (message.method === 'Network.requestWillBeSent') requests.set(p.requestId, p.request.url)
    if (message.method === 'Network.responseReceived' && p.response.url.startsWith(url) && p.response.status >= 400) networkErrors.push(`${p.response.status} ${p.response.url}`)
    if (message.method === 'Network.loadingFailed' && requests.get(p.requestId)?.startsWith(url) && !p.canceled) networkErrors.push(`${p.errorText} ${requests.get(p.requestId)}`)
    if (message.method === 'Page.screencastFrame') {
      if (recording) {
        const file = `${options.name}-frame-${String(frames.length).padStart(5, '0')}.jpg`
        fs.writeFileSync(path.join(out, file), Buffer.from(p.data, 'base64'))
        frames.push({ file, time: p.metadata.timestamp })
      }
      browser?.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {})
    }
  }
  try {
    browser = await observedLaunch(options, result, onEvent)
    const { send, evaluate, until } = browser
    const snap = () => evaluate('window.threeBodySnapshot()')
    const bounds = selector => evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing '+${JSON.stringify(selector)});const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`)
    const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers })
    }
    const click = async selector => {
      await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',behavior:'instant'})`)
      const b = await bounds(selector)
      checks(b.width > 0 && b.height > 0, `${selector}: visible input target`)
      const x = b.x + b.width / 2, y = b.y + b.height / 2
      if (options.width < 768) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      } else {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
      }
    }
    const choose = async (selector, value) => {
      const index = await evaluate(`[...document.querySelector(${JSON.stringify(selector)}).options].findIndex(o=>o.value===${JSON.stringify(String(value))})`)
      checks(index >= 0, `${selector}: option ${value} exists`)
      await click(selector)
      await key('Home', 'Home', 36)
      for (let n = 0; n < index; n++) await key('ArrowDown', 'ArrowDown', 40)
      await key('Enter', 'Enter', 13)
      await until(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(String(value))}`, `${selector} selects ${value}`)
    }
    const fill = async (selector, value) => {
      await click(selector)
      await key('a', 'KeyA', 65, 2)
      await send('Input.insertText', { text: String(value) })
      await key('Tab', 'Tab', 9)
    }
    const screenshot = async (label, canvas = false) => {
      const b = canvas ? await bounds('#three-body-canvas') : null
      const clip = b ? { x: b.x, y: b.y, width: b.width, height: b.height, scale: 1 } : null
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...(clip ? { clip } : {}) })
      const file = `${options.name}-${label}.png`, bytes = Buffer.from(shot.data, 'base64')
      fs.writeFileSync(path.join(out, file), bytes)
      result.screenshots.push(file)
      return hash(bytes)
    }
    const noOverflow = async label => {
      const size = await evaluate('({width:innerWidth,client:document.documentElement.clientWidth,page:document.documentElement.scrollWidth,body:document.body.scrollWidth})')
      checks(size.width === options.width && size.page <= size.client && size.body <= size.client, `${label}: ${options.width}px viewport has no horizontal overflow (${JSON.stringify(size)})`)
    }
    const paused = async value => {
      if ((await snap()).paused !== value) await click('#tb-pause')
      await until(`window.threeBodySnapshot().paused===${value}`, `paused=${value}`)
      await wait(100)
    }
    const valid = state => {
      checks(state.bodies.length === 4 && state.bodies.every(b => b.position.length === 3 && b.velocity.length === 3 && [...b.position, ...b.velocity, b.mass, b.luminosity].every(Number.isFinite)), 'four real bodies have finite three-dimensional state')
      checks(state.bodies.every(b => Array.isArray(b.trail) && b.trail.length <= 512 && b.trail.every(p => Number.isFinite(p.time) && p.position.every(Number.isFinite) && state.realTime - p.time <= 8.05 && state.realTime >= p.time)), 'all world-space trail samples are finite, at most 512, and expire after eight active seconds')
    }
    await send('Network.enable')
    await send('Performance.enable')
    // This counts real WebGL calls independently from the production diagnostics.
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__tbQA={draws:0,contexts:0};const native=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){const context=native.call(this,kind,...args);if(context&&/^webgl/.test(kind)&&this.id==='three-body-canvas'&&!context.__tbQA){context.__tbQA=true;window.__tbQA.contexts++;for(const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){const original=context[method];if(original)context[method]=function(...values){window.__tbQA.draws++;return original.apply(this,values)}}}return context}` })
    await send('Page.navigate', { url: options.legacyEntry ? url : `${url}?theme=three-body` })
    await until('document.readyState === "complete"', 'homepage complete', 15000)
    await until('!!document.querySelector("#three-body-toggle")', 'global theme toggle exists')
    if (options.legacyEntry) {
      checks(await evaluate('!!document.querySelector("#planet-enter") && (!document.querySelector("#three-body-observatory") || document.querySelector("#three-body-observatory").getBoundingClientRect().height===0)'), 'fresh default retains the legacy homepage')
      await screenshot('legacy-default')
      for (let n = 0; n < 35 && await evaluate('document.activeElement?.id') !== 'three-body-toggle'; n++) await key('Tab', 'Tab', 9)
      checks(await evaluate('document.activeElement?.id === "three-body-toggle"'), 'theme toggle is reachable using keyboard Tab')
      await key('Enter', 'Enter', 13)
    }
    await until('typeof window.threeBodySnapshot === "function" && window.threeBodySnapshot().active', 'theme activation creates a read-only real-state snapshot', 15000)
    await until('document.querySelector("#three-body-observatory").getBoundingClientRect().height>0', 'observatory is visible')
    checks(await evaluate('!document.querySelector("#tb-parameters").open'), 'parameters are initially collapsed')
    checks(await evaluate('!!document.querySelector("#latest-posts a[href]") && !!document.querySelector("a[href*=archives]")'), 'articles and archives remain available')
    await noOverflow('initial observatory')
    await screenshot('initial')
    const articleUrl = await evaluate('document.querySelector("#latest-posts .post-card h3 a")?.href')
    checks(Boolean(articleUrl), 'homepage retains a real article link')
    const links = await evaluate('[...document.querySelectorAll("#latest-posts a[href],a[href*=archives]")].map(a=>a.href)')
    for (const href of new Set(links)) checks((await fetch(href)).ok, `content link responds: ${new URL(href).pathname}`)
    if (options.noWebGL) {
      checks(!(await snap()).renderer.available && await evaluate('window.__tbQA.contexts===0'), 'disabled WebGL enters a real fallback without a context')
      checks(await evaluate('!!document.querySelector("#tb-message")?.textContent.trim()'), 'fallback explains the unavailable visualization')
      await screenshot('fallback')
    } else {
      await until('window.threeBodySnapshot().renderer.available && window.__tbQA.draws>0', 'actual WebGL draw', 15000)
      checks(await evaluate('window.__tbQA.contexts===1'), 'three-body scene owns exactly one real WebGL context')
      if (options.reducedMotion) checks((await snap()).paused, 'reduced motion starts the simulation paused')
      await paused(true)
      const frozen = await snap(), draws = await evaluate('window.__tbQA.draws')
      await wait(350)
      const still = await snap()
      checks(still.simTime === frozen.simTime && still.realTime === frozen.realTime && still.renderer.frames === frozen.renderer.frames && await evaluate('window.__tbQA.draws') === draws, 'pause freezes simulation, trail clock, and actual draw calls')
      await click('#tb-step')
      const stepped = await snap()
      checks(stepped.paused && Math.abs(stepped.simTime - frozen.simTime - 1 / 240) < 1e-8, 'single step advances exactly one physics step while paused')
      checks(JSON.stringify(stepped.bodies.map(b => b.position)) !== JSON.stringify(frozen.bodies.map(b => b.position)), 'single step genuinely changes body positions')
      valid(stepped)
      recording = !options.reducedMotion && !options.soak
      if (recording) await send('Page.startScreencast', { format: 'jpeg', quality: 65, maxWidth: 1440, maxHeight: 900, everyNthFrame: 4 })
      const cameras = new Set()
      for (const view of ['station', 'star-a', 'star-b', 'star-c', 'planet']) {
        await choose('#tb-view', view)
        await until(`window.threeBodySnapshot().view===${JSON.stringify(view)}`, `real camera ${view}`)
        await wait(100)
        cameras.add(JSON.stringify((await snap()).renderer.camera))
        await screenshot(`camera-${view}`)
      }
      checks(cameras.size === 5, 'all five viewpoints produce different actual camera transforms')
      await choose('#tb-view', 'station')
      const beforeDrag = JSON.stringify((await snap()).renderer.camera)
      await evaluate('document.querySelector("#three-body-canvas").scrollIntoView({block:"center",behavior:"instant"})')
      const b = await bounds('#three-body-canvas'), x = b.x + b.width / 2, y = b.y + b.height / 2
      if (options.width < 768) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
        for (let i = 1; i <= 5; i++) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 10, y: y + i * 3, id: 1 }] })
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      } else {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
        for (let i = 1; i <= 5; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + i * 10, y: y + i * 3, button: 'left', buttons: 1 })
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 50, y: y + 15, button: 'left', clickCount: 1 })
      }
      await wait(150)
      checks(JSON.stringify((await snap()).renderer.camera) !== beforeDrag, `${options.width < 768 ? 'touch' : 'mouse'} drag changes the actual camera while paused`)
      for (const mode of ['1', '2']) {
        await choose('#tb-mode', mode)
        checks(String((await snap()).mode) === mode, `mode ${mode} reaches actual solver state`)
      }
      for (const force of ['gravity', 'acceleration', 'radiation']) {
        await click(`[data-force="${force}"]`)
        checks((await snap()).forceMode === force, `${force} formula changes the actual overlay mode`)
        await screenshot(`force-${force}`)
      }
      await click('#tb-parameters summary')
      checks(await evaluate('document.querySelector("#tb-parameters").open'), 'parameter form opens through its native disclosure')
      await choose('#tb-body', 'star-a')
      for (const [id, value] of Object.entries({ mass: 1.7, luminosity: 1.3, x: -2.4, y: 0.8, z: 0.2, vx: 0.12, vy: -0.18, vz: 0.03, g: 1.2, speed: 1 })) await fill(`#tb-${id}`, value)
      await click('#tb-apply')
      const edited = await snap(), star = edited.bodies.find(b => b.id === 'star-a')
      checks(star.mass === 1.7 && star.luminosity === 1.3 && JSON.stringify(star.position) === JSON.stringify([-2.4, 0.8, 0.2]) && JSON.stringify(star.velocity) === JSON.stringify([0.12, -0.18, 0.03]) && edited.G === 1.2 && edited.speed === 1, 'mass, luminosity, XYZ, velocity XYZ, G and speed all reach the real solver')
      await fill('#tb-mass', -1)
      await click('#tb-apply')
      checks((await snap()).bodies.find(b => b.id === 'star-a').mass === 1.7, 'invalid mass cannot enter the solver')
      checks(await evaluate('!!document.querySelector("#tb-message")?.textContent.trim() || !document.querySelector("#tb-mass").validity.valid'), 'invalid input is explained or marked invalid by the native form')
      await fill('#tb-mass', 1.7)
      await click('#tb-apply')
      const preStep = (await snap()).bodies.map(b => b.position)
      await click('#tb-step')
      checks(JSON.stringify((await snap()).bodies.map(b => b.position)) !== JSON.stringify(preStep), 'edited positions and velocities evolve through the solver')
      await choose('#tb-preset', 'chaotic')
      await choose('#tb-preset', 'balanced')
      await paused(true)
      await fill('#tb-speed', 10)
      await click('#tb-apply')
      await click('#tb-parameters summary')
      if (!options.reducedMotion) {
        await paused(false)
        const begin = await snap()
        await wait(9300)
        const trails = await snap()
        valid(trails)
        checks(trails.realTime - begin.realTime >= 8 && trails.simTime - begin.simTime > 20, '10x simulation retains an independent real-time trail clock')
        checks(trails.bodies.every(body => body.trail.length > 10 && trails.realTime - body.trail[0].time >= 6.5), 'every body retains a substantial eight-second trail at 10x speed')
        await paused(true)
        const tailFreeze = JSON.stringify((await snap()).bodies.map(b => b.trail))
        await wait(400)
        checks(JSON.stringify((await snap()).bodies.map(b => b.trail)) === tailFreeze, 'pause preserves trail samples without aging or appending')
      }
      if (!options.reducedMotion && !options.soak) {
        await choose('#tb-preset', 'triple')
        await paused(false)
        await until('window.threeBodySnapshot().civilization.dead', 'triple-sun preset reaches civilization death', 15000)
        const death = (await snap()).civilization
        checks(death.events.filter(e => e.type === 'death' && e.number === death.number).length === 1, 'civilization death is recorded exactly once')
        await wait(800)
        const later = (await snap()).civilization
        checks(later.dead && later.events.filter(e => e.type === 'death' && e.number === death.number).length === 1, 'continued hazardous time never duplicates death')
        await paused(true)
        await click('#tb-reset')
        checks((await snap()).civilization.dead, 'reset cannot unlock civilization death')
        await click('#tb-new')
        const next = (await snap()).civilization
        checks(!next.dead && next.number === death.number + 1, 'only new civilization unlocks death and increments the civilization number')
      }
      if (options.soak) {
        await choose('#tb-preset', 'balanced')
        await paused(false)
        await wait(3000)
        const first = await snap(), start = Date.now(), samples = []
        for (let n = 0; n <= 20; n++) {
          if (n) await wait(Math.max(0, start + n * 30000 - Date.now()))
          const state = await snap(), metrics = await send('Performance.getMetrics')
          valid(state)
          samples.push({ elapsedMs: Date.now() - start, frames: state.renderer.frames, geometries: state.renderer.geometries, textures: state.renderer.textures, heap: metrics.metrics.find(m => m.name === 'JSHeapUsedSize')?.value, trailCounts: state.bodies.map(b => b.trail.length), simTime: state.simTime })
          fs.writeFileSync(path.join(out, 'soak-samples.json'), JSON.stringify(samples, null, 2))
          process.stdout.write(`SOAK ${n}/20 elapsed=${samples.at(-1).elapsedMs}ms frames=${state.renderer.frames}\n`)
        }
        const last = await snap()
        checks(Date.now() - start >= 600000, 'soak really ran for at least 600 wall-clock seconds')
        checks(last.renderer.geometries === first.renderer.geometries && last.renderer.textures === first.renderer.textures, 'GPU geometry and texture counts do not grow after warmup')
        checks(samples.every((sample, n) => !n || sample.frames > samples[n - 1].frames), 'actual WebGL rendering continues throughout the ten-minute soak')
        result.soak = samples
      }
      await paused(true)
      await screenshot('final-scene')
      if (recording) {
        await send('Page.stopScreencast')
        recording = false
        checks(frames.length > 1, 'recording contains real CDP screencast frames')
      }
      // Hide via the real theme control, rather than mutating production state.
      if (!options.reducedMotion) await paused(false)
      await click('#three-body-toggle')
      await until('!window.threeBodySnapshot().active', 'theme switches back')
      const beforeHide = await snap()
      await wait(350)
      const hidden = await snap()
      checks(hidden.simTime === beforeHide.simTime && hidden.realTime === beforeHide.realTime && hidden.renderer.frames === beforeHide.renderer.frames, 'hiding a running theme freezes simulation, trail clocks, and rendering')
      checks(await evaluate('document.querySelector("#planet-enter").getBoundingClientRect().height>0'), 'legacy homepage entry is restored')
      await click('#three-body-toggle')
      await until('window.threeBodySnapshot().active', 'theme can reactivate')
    }
    await evaluate('document.documentElement.style.fontSize="200%"')
    await noOverflow('200% font')
    await screenshot('font200')
    await evaluate('document.documentElement.style.fontSize=""')
    for (const target of [new URL('archives/', url).href, articleUrl]) {
      await send('Page.navigate', { url: target })
      await until('document.readyState === "complete" && !!document.querySelector("#three-body-toggle")', 'content page loads', 15000)
      checks(await evaluate('typeof window.threeBodySnapshot==="function" && window.threeBodySnapshot().active'), 'theme preference survives real navigation to content')
      checks(await evaluate('document.querySelector("main")?.textContent.trim().length>20'), 'content remains readable under the theme')
      await noOverflow(`content ${new URL(target).pathname}`)
      await screenshot(target.includes('/archives/') ? 'archives' : 'article')
    }
    checks(networkErrors.length === 0, `no failed same-origin browser requests: ${networkErrors.join('; ')}`)
    assert.deepEqual(result.consoleErrors, [], 'zero browser console errors, including disabled WebGL')
    result.networkErrors = networkErrors
  } catch (error) {
    if (browser) {
      try {
        const shot = await browser.send('Page.captureScreenshot', { format: 'png' })
        const file = `${options.name}-failure.png`
        fs.writeFileSync(path.join(out, file), Buffer.from(shot.data, 'base64'))
        result.screenshots.push(file)
        result.lastSnapshot = await browser.evaluate('typeof window.threeBodySnapshot==="function" ? window.threeBodySnapshot() : null')
      } catch {}
    }
    throw error
  } finally {
    if (frames.length) {
      fs.writeFileSync(path.join(out, `${options.name}-frames.json`), JSON.stringify(frames, null, 2))
      recordingPlayer(options.name, frames)
      result.recording = `${options.name}-recording.html`
    }
    if (browser) await browser.close()
  }
}

async function main () {
  fs.mkdirSync(out, { recursive: true })
  const args = new Set(process.argv.slice(2))
  await stage('frozen-scope', result => { result.scope = scope(); result.checks.push('SHA-256 and additions match the authorized scope') })
  if (!args.has('--browser') && !args.has('--soak')) await stage('physics', result => {
    const run = spawnSync(process.execPath, ['--test', 'test/three-body-core.test.cjs'], { cwd: root, encoding: 'utf8', timeout: 120000 })
    fs.writeFileSync(path.join(out, 'physics.log'), (run.stdout || '') + (run.stderr || ''))
    assert.equal(run.status, 0, `Physics tests failed (exit ${run.status}); see physics.log`)
    result.checks.push('frozen Node physics tests pass')
  })
  if (!args.has('--scope')) {
    const { server, url } = await serve()
    try {
      const cases = args.has('--soak') ? [{ name: 'soak', width: 1440, height: 900, soak: true }] : [
        { name: 'desktop', width: 1440, height: 900, legacyEntry: true },
        { name: 'mobile', width: 390, height: 844 },
        { name: 'reduced-motion', width: 1440, height: 900, reducedMotion: true },
        { name: 'no-webgl', width: 390, height: 844, noWebGL: true }
      ]
      for (const options of cases) await stage(options.name, result => browserCase(options, url, result))
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  }
  report.completedAt = new Date().toISOString()
  report.passed = report.cases.every(result => result.passed)
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(`Evidence: ${out}\n`)
  if (!report.passed) process.exitCode = 1
}

main().catch(error => { process.stderr.write((error.stack || String(error)) + '\n'); process.exitCode = 1 })
