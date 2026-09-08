// Run after `npm run build`: node tools/verify-planet-explorer.cjs
// This deliberately stays outside npm test: real software WebGL is expensive.
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { once } = require('node:events')
const { chromeCandidatesFor } = require('../test/browser-launch-policy.cjs')

const root = path.resolve(__dirname, '..')
const publicRoot = path.join(root, 'public')
const outputRoot = path.join(root, '.superpowers', 'planet-qa')
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const report = { generatedAt: new Date().toISOString(), cases: [] }

async function serve () {
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' }
  const server = http.createServer((request, response) => {
    try {
      let filename = path.resolve(publicRoot, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname))
      if (filename !== publicRoot && !filename.startsWith(publicRoot + path.sep)) {
        response.writeHead(403).end()
        return
      }
      if (fs.existsSync(filename) && fs.statSync(filename).isDirectory()) filename = path.join(filename, 'index.html')
      if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
        // A browser's implicit favicon request is not a missing site asset.
        if (new URL(request.url, 'http://localhost').pathname === '/favicon.ico') {
          response.writeHead(204).end()
          return
        }
        response.writeHead(404).end('Not found')
        return
      }
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
      fs.createReadStream(filename).pipe(response)
    } catch (error) {
      response.writeHead(400).end(error.message)
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, url: `http://127.0.0.1:${server.address().port}/` }
}

async function launch (options, result) {
  const chromePath = chromeCandidatesFor().find(candidate => fs.existsSync(candidate))
  assert.ok(chromePath, 'Chrome or Edge must be installed (or set CHROME_PATH)')
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'planet-explorer-qa-'))
  const child = spawn(chromePath, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    ...(options.noWebGL ? ['--disable-webgl', '--disable-webgl2', '--disable-gpu'] : []),
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
  let stderr = ''
  let socket
  let spawnError
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000) })
  child.on('error', error => { spawnError = error })
  const close = async () => {
    if (socket) socket.close()
    if (child.exitCode === null) {
      const exited = once(child, 'exit').catch(() => {})
      child.kill()
      await Promise.race([exited, wait(3000)])
    }
    // The only recursive removal is the isolated profile created above.
    const resolved = path.resolve(profile)
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()))
    assert.ok(path.basename(resolved).startsWith('planet-explorer-qa-'))
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }) } catch (error) { result.cleanupWarning = error.message }
  }
  try {
    const activePort = path.join(profile, 'DevToolsActivePort')
    const deadline = Date.now() + 12000
    while (!fs.existsSync(activePort) && Date.now() < deadline && !spawnError) await wait(40)
    assert.ok(fs.existsSync(activePort), `Headless browser did not start: ${spawnError || stderr}`)
    const port = fs.readFileSync(activePort, 'utf8').split(/\r?\n/)[0]
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())
    const target = targets.find(candidate => candidate.type === 'page')
    assert.ok(target?.webSocketDebuggerUrl, 'Headless browser has a page target')
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
    })
    let nextId = 1
    const pending = new Map()
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (message.method === 'Runtime.exceptionThrown') result.consoleErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') result.consoleErrors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '))
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') result.consoleErrors.push([message.params.entry.text, message.params.entry.url].filter(Boolean).join(' '))
      if (!pending.has(message.id)) return
      const request = pending.get(message.id)
      pending.delete(message.id)
      clearTimeout(request.timer)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
    })
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = nextId++
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)) }, 12000)
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
    const evaluate = async expression => {
      const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text)
      return value.result.value
    }
    const until = async (expression, description, timeout = 6000) => {
      const expires = Date.now() + timeout
      do {
        if (await evaluate(expression)) return
        await wait(50)
      } while (Date.now() < expires)
      throw new Error(`Timed out: ${description}`)
    }
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Log.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: options.width, height: options.height, deviceScaleFactor: 1, mobile: options.width < 768, screenWidth: options.width, screenHeight: options.height })
    if (options.width < 768) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: options.reducedMotion ? 'reduce' : 'no-preference' }] })
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__planetQA = { phases: [], webgl: 0, draws: 0 };
      new MutationObserver(records => {
        for (const record of records) if (record.target.id === 'planet-explorer') {
          window.__planetQA.phases.push(record.oldValue, record.target.dataset.phase);
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-phase'], attributeOldValue: true });
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        const context = originalGetContext.call(this, kind, ...args);
        if (context && /^webgl/.test(kind) && this.id === 'planet-webgl' && !context.__planetQA) {
          context.__planetQA = true;
          window.__planetQA.webgl++;
          for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
            const original = context[method];
            if (original) context[method] = function (...values) { window.__planetQA.draws++; return original.apply(this, values); };
          }
        }
        return context;
      };
    ` })
    return { send, evaluate, until, close }
  } catch (error) {
    await close()
    throw error
  }
}

async function runCase (options, url) {
  const result = { name: options.name, viewport: `${options.width}x${options.height}`, consoleErrors: [], checks: [], screenshots: [] }
  report.cases.push(result)
  let browser
  try {
    browser = await launch(options, result)
    const { send, evaluate, until } = browser
    const check = (value, description) => { assert.ok(value, description); result.checks.push(description) }
    const bounds = selector => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Missing ' + ${JSON.stringify(selector)}); const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()`)
    const click = async selector => {
      await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center', behavior:'instant'})`)
      const box = await bounds(selector)
      check(box.width > 0 && box.height > 0, `${selector} is visible`)
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      if (options.width < 768) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      } else {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
      }
    }
    const settleAnimations = () => until(`document.querySelector('#planet-explorer').getAnimations({subtree:true}).every(animation => animation.playState !== 'running' && !animation.pending)`, 'dialog CSS animations and transitions settle', 3000)
    const capture = async (label, sceneCrop = false) => {
      // The canvas fills the modal, so its whole bounding box also includes
      // HUD button hover/focus styles. Compare the visible scene above those
      // controls; retain uncropped screenshots separately for layout review.
      const box = sceneCrop ? await bounds('#planet-webgl') : undefined
      const clip = box ? { x: Math.round(box.x + box.width * 0.12), y: Math.round(box.y + box.height * 0.22), width: Math.round(box.width * 0.76), height: Math.round(box.height * 0.3), scale: 1 } : undefined
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...(clip ? { clip } : {}) })
      const name = `${options.name}-${label}.png`
      const bytes = Buffer.from(screenshot.data, 'base64')
      fs.writeFileSync(path.join(outputRoot, name), bytes)
      if (!result.screenshots.includes(name)) result.screenshots.push(name)
      return { hash: createHash('sha256').update(bytes).digest('hex'), data: screenshot.data }
    }
    const sameFrame = async (first, second) => {
      if (first.hash === second.hash) return true
      // Software WebGL/backdrop compositing can round colors by one or two
      // levels even without another WebGL draw. Decode pixels and bound both
      // the worst change and RMS (0.2% of the channel range); draw-count checks
      // independently prove that pause stops rendering.
      const difference = await evaluate(`(async () => {
        const frames = await Promise.all(${JSON.stringify([first.data, second.data])}.map(async data => {
          const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
          const canvas = new OffscreenCanvas(image.width, image.height); const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0); return { width:image.width, height:image.height, data:context.getImageData(0,0,image.width,image.height).data };
        }));
        if (frames[0].width !== frames[1].width || frames[0].height !== frames[1].height) return { same:false, reason:'different dimensions' };
        let changedPixels=0, maxDelta=0, squaredDelta=0;
        for (let i=0; i<frames[0].data.length; i+=4) {
          let delta=0; for (let channel=0; channel<4; channel++) { const difference=Math.abs(frames[0].data[i+channel]-frames[1].data[i+channel]); delta=Math.max(delta,difference); squaredDelta+=difference*difference; }
          if (delta) changedPixels++; maxDelta=Math.max(maxDelta,delta);
        }
        const pixels=frames[0].width*frames[0].height;
        const rms=Math.sqrt(squaredDelta/frames[0].data.length);
        return { same:maxDelta<=2 && rms<=0.5, changedPixels, maxDelta, rms, pixels };
      })()`)
      result.pixelComparisons ??= []
      result.pixelComparisons.push(difference)
      return difference.same
    }
    const noOverflow = async label => {
      const sizes = await evaluate(`({ inner: innerWidth, client: document.documentElement.clientWidth, body: document.body.scrollWidth, page: document.documentElement.scrollWidth, dialog: document.querySelector('#planet-explorer')?.getBoundingClientRect().width || 0 })`)
      check(sizes.inner === options.width, `${label}: exact ${options.width}px viewport`)
      check(sizes.body <= sizes.client && sizes.page <= sizes.client && sizes.dialog <= sizes.client, `${label}: no horizontal overflow (${JSON.stringify(sizes)})`)
    }
    const links = async () => {
      const nodes = await evaluate(`Array.from(document.querySelectorAll('#planet-explorer a[data-planet-node]'), a => ({ id:a.dataset.planetNode, href:a.href, text:a.textContent.trim() }))`)
      assert.deepEqual(nodes.map(node => node.id).sort(), ['archives', 'games', 'latest'])
      for (const node of nodes) {
        check(Boolean(node.text), `${node.id}: has accessible link text`)
        const target = new URL(node.href)
        check(target.origin === new URL(url).origin, `${node.id}: local destination`)
        const response = await fetch(target)
        check(response.ok, `${node.id}: destination responds ${response.status}`)
        if (target.hash) {
          const html = await response.text()
          check(await evaluate(`Boolean(new DOMParser().parseFromString(${JSON.stringify(html)}, 'text/html').getElementById(${JSON.stringify(decodeURIComponent(target.hash.slice(1)))}))`), `${node.id}: destination fragment exists`)
        }
      }
    }
    const enter = async () => {
      await click('#planet-enter')
      await until(`document.querySelector('#planet-explorer')?.open`, 'entry opens the dialog')
      await until(`document.querySelector('#planet-explorer')?.dataset.phase === ${JSON.stringify(options.noWebGL ? 'fallback' : 'interior')}`, 'entry completes the transition', options.reducedMotion ? 2000 : 6000)
    }
    const escape = async () => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await until(`!document.querySelector('#planet-explorer')?.open && !document.querySelector('#planet-enter')?.closest('[inert]')`, 'Escape closes the dialog and restores page interaction')
    }
    await send('Page.navigate', { url })
    await until(`document.readyState === 'complete'`, 'homepage loaded', 12000)
    check(await evaluate(`Boolean(document.querySelector('button#planet-enter'))`), 'homepage exposes the planet entry button')
    if (!options.noWebGL) {
      await until(`document.querySelector('.home-hero')?.classList.contains('planet-webgl-ready') && window.__planetQA.draws > 0`, 'first successful WebGL frame', 12000)
      check(await evaluate(`window.__planetQA.webgl === 1`), 'planet uses one real WebGL context')
    }
    await noOverflow('homepage')
    await capture('home')
    await enter()
    await noOverflow('explorer')
    await links()
    if (options.noWebGL) {
      check(await evaluate(`window.__planetQA.webgl === 0 && !document.querySelector('.home-hero').classList.contains('planet-webgl-ready')`), 'disabled WebGL preserves the homepage fallback')
      check(await evaluate(`(() => { const canvas=document.querySelector('#planet-webgl'); const box=canvas.getBoundingClientRect(); return canvas.hidden && getComputedStyle(canvas).display==='none' && box.width===0 && box.height===0; })()`), 'failed WebGL canvas is hidden and has no rendered box')
      check(await evaluate(`(() => { const el=document.querySelector('.saturn-system'); if (!el) return false; const style=getComputedStyle(el); const box=el.getBoundingClientRect(); return style.display!=='none' && style.visibility!=='hidden' && Number(style.opacity)>0 && box.width>0 && box.height>0; })()`), 'original planet fallback remains rendered')
      check(await evaluate(`(() => { const el=document.querySelector('#planet-status'); return Boolean(el?.textContent.trim()) && el.getBoundingClientRect().height > 0; })()`), 'fallback displays a visible status message')
      await capture('fallback')
    } else {
      check(await evaluate(`document.querySelector('#planet-webgl')?.parentElement?.id === 'planet-stage'`), 'dialog owns the live canvas')
      const box = await bounds('#planet-webgl')
      check(box.width > 100 && box.height > 100, 'interior canvas has usable dimensions')
      await settleAnimations()
      await capture('interior')
      check(await evaluate(`(() => {
        const labels = [...document.querySelectorAll('.planet-node-label')].filter(el => !el.hidden);
        return labels.length === 3 && labels.every(el => {
          const r = el.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
        });
      })()`), 'all three spatial content labels fit inside the initial viewport')
      if (options.reducedMotion) {
        check(await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches && !window.__planetQA.phases.includes('approach')`), 'reduced motion skips the approach phase')
        const first = await capture('reduced-frame', true)
        const reducedDraws = await evaluate('window.__planetQA.draws')
        await wait(350)
        check(reducedDraws === await evaluate('window.__planetQA.draws'), 'reduced motion stops continuous WebGL draw calls')
        check(await sameFrame(first, await capture('reduced-stable', true)), 'reduced motion keeps the rendered interior still')
      } else {
        await click('#planet-pause')
        await settleAnimations()
        const paused = await capture('paused', true)
        const pausedDraws = await evaluate('window.__planetQA.draws')
        await wait(250)
        check(pausedDraws === await evaluate('window.__planetQA.draws'), 'pause stops continuous WebGL draw calls')
        check(await sameFrame(paused, await capture('paused-stable', true)), 'pause freezes the rendered interior')
        const canvas = await bounds('#planet-webgl')
        const x = canvas.x + canvas.width * 0.5
        const y = canvas.y + canvas.height * 0.5
        if (options.width < 768) {
          await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
          for (let step = 1; step <= 6; step++) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + step * 12, y: y + step * 4, id: 1 }] })
          await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        } else {
          await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
          for (let step = 1; step <= 6; step++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + step * 12, y: y + step * 4, button: 'left', buttons: 1 })
          await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 72, y: y + 24, button: 'left', buttons: 0, clickCount: 1 })
        }
        await wait(150)
        const orbit = await capture('orbit', true)
        check(!await sameFrame(orbit, paused), `${options.width < 768 ? 'one-finger touch' : 'mouse'} drag changes the rendered camera view while paused`)
        await click('#planet-zoom-in')
        await wait(150)
        const zoomed = await capture('zoom-in', true)
        check(!await sameFrame(zoomed, orbit), 'zoom in changes the rendered camera view')
        await click('#planet-zoom-out')
        await wait(150)
        check(!await sameFrame(zoomed, await capture('zoom-out', true)), 'zoom out changes the rendered camera view')
        await click('#planet-reset')
        await wait(150)
        check(await sameFrame(paused, await capture('reset', true)), 'reset restores the default camera without resuming motion')
        if (options.width < 768) {
          const touchPair = distance => [{ x: x - distance, y, id: 1 }, { x: x + distance, y, id: 2 }]
          await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPair(30) })
          for (let step = 1; step <= 6; step++) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPair(30 + step * 5) })
          await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
          check(await evaluate(`document.querySelector('#planet-explorer')?.open`), 'pinch keeps the explorer open')
          await wait(150)
          check(!await sameFrame(paused, await capture('pinch', true)), 'two-finger pinch changes the rendered camera distance')
          await click('#planet-reset')
          await wait(150)
          check(await sameFrame(paused, await capture('pinch-reset', true)), 'reset restores the default view after a pinch')
        }
      }
    }
    // Verify focus restoration from the actual entry button, independently of
    // any focus moved later by explorer controls.
    await escape()
    await until(`document.activeElement?.id === 'planet-enter'`, 'Escape returns focus to the entry button')
    if (!options.noWebGL) check(await evaluate(`document.querySelector('#planet-webgl')?.parentElement?.id === 'planet-viewport'`), 'exit restores the canvas to the homepage')
    await enter()
    result.checks.push('entry works again after Escape')
    if (!options.noWebGL && !options.reducedMotion) await click('#planet-pause')
    await escape()
    if (!options.noWebGL && !options.reducedMotion) {
      await click('#planet-enter')
      await until(`document.querySelector('#planet-explorer')?.dataset.phase === 'approach'`, 'normal entry starts the approach')
      await click('#planet-pause')
      await until(`document.querySelector('#planet-explorer')?.dataset.phase === 'interior'`, 'pausing during approach skips to the interior', 1000)
      check(await evaluate(`document.querySelector('#planet-pause').getAttribute('aria-pressed') === 'true'`), 'pause during approach remains paused')
      await settleAnimations()
      const stopped = await capture('approach-paused', true)
      const approachDraws = await evaluate('window.__planetQA.draws')
      await wait(300)
      check(approachDraws === await evaluate('window.__planetQA.draws'), 'pause during approach stops continuous WebGL draw calls')
      check(await sameFrame(stopped, await capture('approach-paused-stable', true)), 'pause during approach stops subsequent scene motion')
      await escape()
    }
    if (!options.noWebGL && !options.reducedMotion && options.width >= 768) {
      await click('#planet-webgl')
      await until(`document.querySelector('#planet-explorer')?.open`, 'clicking the visible planet opens the explorer')
      await until(`document.querySelector('#planet-explorer')?.dataset.phase === 'interior'`, 'planet click reaches interior')
      result.checks.push('clicking the rendered planet opens the interior')
      await escape()
    }
    // THREE logs context creation failures in the deliberately disabled case.
    const unexpected = result.consoleErrors.filter(error => !(options.noWebGL && /(?:THREE\.WebGLRenderer|Error creating WebGL context|WebGL.*not supported)/i.test(error)))
    assert.deepEqual(unexpected, [], 'no unexpected browser console errors')
    result.passed = true
  } catch (error) {
    result.passed = false
    result.error = error.stack || String(error)
    if (browser) {
      try {
        const screenshot = await browser.send('Page.captureScreenshot', { format: 'png' })
        const name = `${options.name}-failure.png`
        fs.writeFileSync(path.join(outputRoot, name), Buffer.from(screenshot.data, 'base64'))
        result.screenshots.push(name)
      } catch {}
    }
  } finally {
    if (browser) await browser.close()
  }
  process.stdout.write(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}: ${result.passed ? result.checks.length + ' checks' : result.error.split('\n')[0]}\n`)
}

async function main () {
  assert.ok(fs.existsSync(path.join(publicRoot, 'index.html')), 'Build public/ first with npm run build')
  assert.equal(typeof WebSocket, 'function', 'Node 22+ with global WebSocket is required')
  fs.mkdirSync(outputRoot, { recursive: true })
  const { server, url } = await serve()
  try {
    for (const options of [
      { name: 'desktop', width: 1440, height: 1000 },
      { name: 'mobile', width: 390, height: 844 },
      { name: 'reduced-motion', width: 1440, height: 1000, reducedMotion: true },
      { name: 'webgl-disabled', width: 390, height: 844, noWebGL: true }
    ]) await runCase(options, url)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    fs.writeFileSync(path.join(outputRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  }
  process.stdout.write(`Screenshots and console errors: ${outputRoot}\n`)
  if (report.cases.some(result => !result.passed)) process.exitCode = 1
}

module.exports = { serve, launch }

if (require.main === module) main().catch(error => { process.stderr.write((error.stack || String(error)) + '\n'); process.exitCode = 1 })
