// Run after `npm run build`: node tools/verify-planet-transition.cjs
// Add --desktop --capture to save deterministic transition frames for review.
// Uses a fresh headless profile and real software WebGL, never a user browser.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { serve, launch } = require('./verify-planet-explorer.cjs')

const outputRoot = path.resolve(__dirname, '..', '.superpowers', 'planet-qa')
const captureRoot = path.resolve(outputRoot, '..', 'planet-transition-qa')
const report = { generatedAt: new Date().toISOString(), cases: [] }

// Hold the application's real RAF callbacks, then deliver frames at chosen
// times. A 140 ms gap models a slow GPU without slowing an independent CSS
// animation clock, exposing a mask that uncovers a late WebGL scene change.
const clockProbe = `(() => {
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const nativeNow = performance.now.bind(performance);
  let projection = null;
  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    const context = nativeGetContext.call(this, kind, ...args);
    if (context && /^webgl/.test(kind) && this.id === 'planet-webgl' && !context.__transitionProjection) {
      context.__transitionProjection = true;
      const names = new Map();
      const location = context.getUniformLocation.bind(context);
      const matrix = context.uniformMatrix4fv.bind(context);
      context.getUniformLocation = (program, name) => { const value=location(program,name); names.set(value,name); return value; };
      context.uniformMatrix4fv = (location, transpose, values, ...rest) => {
        if (names.get(location) === 'projectionMatrix') projection = [values[0], values[5]];
        return matrix(location, transpose, values, ...rest);
      };
    }
    return context;
  };
  let held = false, time = 0, next = 0;
  const waiting = new Map(), scheduled = new Map();
  window.requestAnimationFrame = callback => {
    const id = ++next;
    if (held) waiting.set(id, callback);
    else scheduled.set(id, nativeRAF(stamp => {
      scheduled.delete(id);
      if (held) waiting.set(id, callback);
      else callback(stamp);
    }));
    return id;
  };
  window.cancelAnimationFrame = id => {
    waiting.delete(id);
    if (scheduled.has(id)) nativeCancel(scheduled.get(id));
    scheduled.delete(id);
  };
  performance.now = () => held ? time : nativeNow();
  const bounds = element => {
    const rect = element.getBoundingClientRect();
    return { x:rect.x, y:rect.y, width:rect.width, height:rect.height,
      centerX:rect.x+rect.width/2, centerY:rect.y+rect.height/2 };
  };
  const state = () => {
    const dialog = document.querySelector('#planet-explorer');
    const canvas = document.querySelector('#planet-webgl');
    const style = getComputedStyle(dialog);
    const cloudStyle = getComputedStyle(dialog, '::after');
    const number = name => {
      const value = style.getPropertyValue(name).trim();
      return value === '' ? null : Number(value);
    };
    return { open:dialog.open, phase:dialog.dataset.phase,
      cloud:number('--planet-cloud'), veil:number('--planet-veil'), hud:number('--planet-hud'),
      cloudOpacity:Number(cloudStyle.opacity), cloudAnimation:cloudStyle.animationName,
      canvas:bounds(canvas), host:bounds(canvas.parentElement), parent:canvas.parentElement.id,
      home:bounds(document.querySelector('#planet-viewport')),
      projectedScale:projection && [bounds(canvas).width*projection[0], bounds(canvas).height*projection[1]],
      transform:getComputedStyle(canvas).transform, focus:document.activeElement?.id,
      paused:document.querySelector('#planet-pause').getAttribute('aria-pressed'),
      inert:!!document.querySelector('#planet-enter').closest('[inert]'),
      exploring:document.body.classList.contains('planet-is-exploring'), draws:window.__planetQA.draws };
  };
  window.__transitionQA = {
    state,
    hold:() => new Promise(resolve => nativeRAF(stamp => { held=true; time=Math.ceil(stamp); resolve(); })),
    step:delta => new Promise(resolve => nativeRAF(() => {
      time += delta;
      for (const [id, callback] of [...waiting]) {
        if (!waiting.has(id)) continue;
        waiting.delete(id);
        callback(time);
      }
      resolve(state());
    }))
  };
})();`

async function runCase (options, url) {
  const result = { name: options.name, consoleErrors: [], checks: [], samples: [] }
  report.cases.push(result)
  let browser
  const check = (value, description) => { assert.ok(value, description); result.checks.push(description) }
  try {
    browser = await launch(options, result)
    const { send, evaluate, until } = browser
    await send('Page.addScriptToEvaluateOnNewDocument', { source: clockProbe })
    await send('Page.navigate', { url })
    await until(`document.readyState === 'complete' && document.querySelector('.home-hero')?.classList.contains('planet-webgl-ready') && window.__planetQA.draws > 0`, 'real WebGL homepage is ready', 12000)
    await evaluate('window.__transitionQA.hold()')
    const state = () => evaluate('window.__transitionQA.state()')
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click(); window.__transitionQA.state()`)
    const capture = async label => {
      if (!options.capture) return
      fs.mkdirSync(captureRoot, { recursive: true })
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      const filename = path.join(captureRoot, `${options.name}-${label}.png`)
      fs.writeFileSync(filename, Buffer.from(screenshot.data, 'base64'))
      result.screenshots ??= []
      result.screenshots.push(filename)
    }
    const step = async (delta, label) => {
      const value = await evaluate(`window.__transitionQA.step(${delta})`)
      if (label) result.samples.push({ label, ...value })
      return value
    }
    const escape = async () => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await until(`!document.querySelector('#planet-explorer').open && document.querySelector('#planet-webgl').parentElement.id === 'planet-viewport'`, 'Escape fully restores homepage')
    }
    const restored = async description => {
      const value = await state()
      check(!value.open && value.parent === 'planet-viewport' && !value.inert && !value.exploring && value.focus === 'planet-enter', description)
      check(value.transform === 'none' || value.transform === 'matrix(1, 0, 0, 1, 0, 0)', 'restored homepage canvas has no leftover flight transform')
    }

    if (options.reducedMotion) {
      const entered = await click('#planet-enter')
      check(entered.open && entered.phase === 'interior', 'reduced motion enters the usable interior directly')
      check(entered.cloud === 0 && entered.hud === 1, 'reduced motion leaves no opaque cloud or hidden HUD')
      await click('#planet-close')
      await until(`!document.querySelector('#planet-explorer').open && document.querySelector('#planet-webgl').parentElement.id === 'planet-viewport'`, 'reduced motion return closes without flight frames')
      await restored('reduced motion return restores focus, canvas, and page interaction')
      await step(3000)
      await restored('reduced motion return stays closed after the former entry deadline')
    } else {
      const before = await state()
      await capture('home')
      const initial = await click('#planet-enter')
      result.samples.push({ label: 'initial', ...initial })
      check(initial.open && initial.phase === 'approach', 'entry starts its approach before any animation frame')
      const jump = Math.hypot(initial.canvas.centerX - before.canvas.centerX, initial.canvas.centerY - before.canvas.centerY)
      check(jump < 2, `entry preserves the homepage planet center (${jump.toFixed(3)} px jump)`)
      check(before.projectedScale && initial.projectedScale && initial.projectedScale.every((scale, axis) => Math.abs(scale / before.projectedScale[axis] - 1) < 0.002), 'entry preserves the actual shader projection scale on both axes')
      check(initial.cloud === 0 && initial.veil === 0 && initial.hud === 0, 'entry begins with a clear cloud and veil, and waits to reveal interior controls')
      check(initial.cloudAnimation === 'none', 'cloud opacity has no independent CSS animation clock')
      await capture('entry-0ms')
      await step(0)
      let previous = 0
      for (const time of [140, 320, 560, 1050, 1400, 1540, 1580, 1700, 1800, 2200, 2460, 2600, 2680]) {
        const sample = await step(time - previous, `entry-${time}ms`)
        previous = time
        if (time < 2600) check(sample.phase === 'approach', `${time} ms: approach phase remains active through arrival`)
        if (time >= 1540 && time <= 1800) {
          check(sample.cloud === 1 && sample.cloudOpacity === 1, `${time} ms: the scene seam stays completely cloud-covered even with sparse RAF delivery`)
          check(sample.hud === 0, `${time} ms: controls stay hidden during the scene seam`)
        }
        if (time >= 2600) check(sample.phase === 'interior' && sample.cloud === 0 && sample.veil === 1 && sample.hud === 1, `${time} ms: arrival finishes with a clear, usable interior`)
        if ([560, 1400, 1580, 2200, 2600].includes(time)) await capture(`entry-${time}ms`)
      }
      const departing = await click('#planet-close')
      check(departing.open && departing.phase === 'departing', 'return starts a visible departure before closing the modal')
      await step(0)
      previous = 0
      for (const time of [140, 220, 260, 300, 500, 720, 840]) {
        const sample = await step(time - previous, `return-${time}ms`)
        previous = time
        if (time === 260) check(sample.open && sample.cloud === 1 && sample.cloudOpacity === 1, 'return covers the switch back to the exterior scene')
        if (time < 720) check(sample.open && sample.phase === 'departing', `${time} ms: return holds the modal until the flight finishes`)
        if (time === 300 || time === 500) await capture(`return-${time}ms`)
      }
      await until(`!document.querySelector('#planet-explorer').open && document.querySelector('#planet-webgl').parentElement.id === 'planet-viewport'`, 'return finishes')
      await restored('return restores focus, canvas, and page interaction')

      await click('#planet-enter')
      await step(0)
      await step(320)
      const paused = await click('#planet-pause')
      check(paused.phase === 'interior' && paused.paused === 'true' && paused.cloud === 0 && paused.hud === 1, 'pause during approach snaps to a visible, paused interior')
      const settled = await step(140)
      const still = await step(500)
      check(still.draws === settled.draws && still.phase === 'interior' && still.cloud === 0, 'pause stops WebGL draws and leaves no moving transition mask')
      await click('#planet-pause')
      await escape()
      await restored('Escape from the interior restores the homepage')

      await click('#planet-enter')
      await step(0)
      await step(140)
      await escape()
      await restored('Escape during entry immediately restores the homepage')
      await step(3000)
      await restored('cancelled approach does not reopen or move its canvas after the old entry deadline')
      check(!(await state()).open, 'cancelled approach remains closed')

      if (options.width >= 768) {
        await click('#planet-enter')
        await step(0)
        await step(2700)
        await click('#planet-close')
        await step(100)
        await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 720, deviceScaleFactor: 1, mobile: false, screenWidth: 1000, screenHeight: 720 })
        await step(0)
        await until(`innerWidth === 1000 && document.querySelector('#planet-webgl').width === 1000 && document.querySelector('#planet-webgl').height === 720`, 'return observes the resized stage while its interior is still visible')
        const landing = await step(619, 'return-resized-719ms')
        check(landing.open && landing.phase === 'departing', 'resized return remains in flight immediately before its deadline')
        const landingOffset = Math.hypot(landing.canvas.centerX - landing.home.centerX, landing.canvas.centerY - landing.home.centerY)
        check(landingOffset < 1, `return targets the resized homepage planet center before closing (${landingOffset.toFixed(3)} px offset)`)
        // The renderer caps its cadence, so deliver the first eligible frame
        // after the 720 ms deadline rather than forcing a 1 ms render interval.
        await step(25)
        await until(`!document.querySelector('#planet-explorer').open && document.querySelector('#planet-webgl').parentElement.id === 'planet-viewport'`, 'resized return finishes on the next eligible frame')
        const landed = await state()
        const closingJump = Math.hypot(landed.canvas.centerX - landing.canvas.centerX, landed.canvas.centerY - landing.canvas.centerY)
        check(closingJump < 1, `resized return closes without a final position jump (${closingJump.toFixed(3)} px)`)
        check(landing.projectedScale && landed.projectedScale && landing.projectedScale.every((scale, axis) => Math.abs(scale / landed.projectedScale[axis] - 1) < 0.002), 'resized return preserves actual shader projection scale across the final canvas move')
        await restored('resized return restores focus, canvas, and page interaction')
      }
    }
    assert.deepEqual(result.consoleErrors, [], 'no browser console errors')
    result.passed = true
  } catch (error) {
    result.passed = false
    result.error = error.stack || String(error)
  } finally {
    if (browser) await browser.close()
  }
  process.stdout.write(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}: ${result.passed ? result.checks.length + ' checks' : result.error.split('\n')[0]}\n`)
}

async function main () {
  fs.mkdirSync(outputRoot, { recursive: true })
  const { server, url } = await serve()
  try {
    const cases = [
      { name: 'transition-desktop', width: 1440, height: 1000 },
      { name: 'transition-mobile', width: 390, height: 844 },
      { name: 'transition-reduced-motion', width: 1440, height: 1000, reducedMotion: true }
    ]
    for (const options of cases) {
      if (process.argv.includes('--desktop') && options.name !== 'transition-desktop') continue
      await runCase({ ...options, capture: process.argv.includes('--capture') }, url)
    }
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    fs.writeFileSync(path.join(outputRoot, 'transition-report.json'), JSON.stringify(report, null, 2) + '\n')
  }
  process.stdout.write(`Transition report: ${path.join(outputRoot, 'transition-report.json')}\n`)
  if (report.cases.some(result => !result.passed)) process.exitCode = 1
}

main().catch(error => { process.stderr.write((error.stack || String(error)) + '\n'); process.exitCode = 1 })
